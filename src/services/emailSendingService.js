const Batch = require('../models/Batch');
const Contact = require('../models/Contact');
const EmailJob = require('../models/EmailJob');
const SendingJob = require('../models/SendingJob');
const DailyUsage = require('../models/DailyUsage');
const Attachment = require('../models/Attachment');
const { sendWithRetry } = require('./brevoService');

/**
 * Get today's date string YYYY-MM-DD
 */
const getTodayString = () => new Date().toISOString().split('T')[0];

/**
 * Get today's daily usage
 */
const getDailyUsage = async () => {
  const today = getTodayString();
  let usage = await DailyUsage.findOne({ date: today });
  if (!usage) {
    usage = await DailyUsage.create({ date: today, sentCount: 0 });
  }
  return usage;
};

/**
 * Get remaining daily capacity
 */
const getDailyRemaining = async () => {
  const limit = parseInt(process.env.DAILY_EMAIL_LIMIT) || 280;
  const usage = await getDailyUsage();
  return Math.max(0, limit - usage.sentCount);
};

/**
 * Replace template variables in content
 */
const personalizeContent = (content, contact) => {
  if (!content) return content;
  const name = String(contact.name || '').trim() || 'Valued Customer';
  const email = String(contact.email || '').trim();
  return content
    .replace(/\{\{\s*name\s*\}\}/gi, name)
    .replace(/\{\{\s*email\s*\}\}/gi, email);
};

/**
 * Increment daily sent count
 */
const incrementDailyUsage = async (count = 1) => {
  const today = getTodayString();
  await DailyUsage.findOneAndUpdate(
    { date: today },
    { $inc: { sentCount: count } },
    { upsert: true, returnDocument: 'after' }
  );
};

/**
 * Main email sending function
 */
const processEmailSending = async (sendingJobId) => {
  const sendingJob = await SendingJob.findById(sendingJobId).populate('batchId');
  if (!sendingJob) throw new Error('Sending job not found');

  const { batchId: batch } = sendingJob;

  // Get pending email jobs for this sending job
  const pendingJobs = await EmailJob.find({
    sendingJobId,
    status: 'pending'
  }).populate('attachments');

  if (pendingJobs.length === 0) {
    await SendingJob.findByIdAndUpdate(sendingJobId, {
      status: 'completed',
      completedAt: new Date()
    });
    return;
  }

  // Update sending job status
  await SendingJob.findByIdAndUpdate(sendingJobId, {
    status: 'sending',
    startedAt: new Date()
  });

  let sentCount = 0;
  let failedCount = 0;

  for (const job of pendingJobs) {
    // Check daily limit before each email
    const remaining = await getDailyRemaining();
    if (remaining <= 0) {
      // Mark remaining as pending (daily limit reached)
      await EmailJob.updateMany(
        { sendingJobId, status: 'pending' },
        { status: 'pending' }
      );
      await SendingJob.findByIdAndUpdate(sendingJobId, {
        dailyLimitReached: true,
      });
      break;
    }

    // Mark as sending
    await EmailJob.findByIdAndUpdate(job._id, { status: 'sending', attemptCount: job.attemptCount + 1 });

    // Personalize content
    const personalizedSubject = personalizeContent(job.subject, {
      name: job.recipientName,
      email: job.recipientEmail,
    });
    const personalizedHtml = personalizeContent(job.htmlContent, {
      name: job.recipientName,
      email: job.recipientEmail,
    });
    const personalizedText = personalizeContent(job.textContent, {
      name: job.recipientName,
      email: job.recipientEmail,
    });

    // Build attachment list
    const attachments = (job.attachments || []).map(att => ({
      url: att.url,
      originalName: att.originalName,
      storedName: att.storedName,
    }));

    // Send via Brevo
    const result = await sendWithRetry({
      sender: job.sender,
      to: [{ email: job.recipientEmail, name: job.recipientName }],
      replyTo: job.replyTo,
      subject: personalizedSubject,
      htmlContent: personalizedHtml,
      textContent: personalizedText,
      attachments,
      tags: [`batch-${batch._id}`, `job-${sendingJobId}`],
    });

    if (result.success) {
      await EmailJob.findByIdAndUpdate(job._id, {
        status: 'sent',
        brevoMessageId: result.messageId,
        sentAt: new Date(),
      });

      // Update contact
      await Contact.findByIdAndUpdate(job.contactId, {
        sentAt: new Date(),
        emailJobId: job._id,
      });

      await incrementDailyUsage(1);
      sentCount++;

      // Update sending job progress
      await SendingJob.findByIdAndUpdate(sendingJobId, {
        $inc: { sent: 1, processed: 1 },
        $set: { pending: pendingJobs.length - sentCount - failedCount }
      });
    } else {
      await EmailJob.findByIdAndUpdate(job._id, {
        status: 'failed',
        error: result.message,
        failedAt: new Date(),
      });

      await Contact.findByIdAndUpdate(job.contactId, {
        failedAt: new Date(),
        errorMessage: result.message,
      });

      failedCount++;

      await SendingJob.findByIdAndUpdate(sendingJobId, {
        $inc: { failed: 1, processed: 1 },
      });
    }

    // Small delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 200));
  }

  // Finalize sending job
  const finalJob = await SendingJob.findById(sendingJobId);
  const pendingRemaining = await EmailJob.countDocuments({ sendingJobId, status: 'pending' });
  
  let finalStatus = 'completed';
  if (pendingRemaining > 0) finalStatus = 'partial';
  if (finalJob.failed > 0 && finalJob.sent === 0) finalStatus = 'failed';

  await SendingJob.findByIdAndUpdate(sendingJobId, {
    status: finalStatus,
    completedAt: new Date(),
    pending: pendingRemaining,
  });

  // Update batch status
  const batchStatus = finalStatus === 'completed' ? 'completed' : 
                       finalStatus === 'partial' ? 'partial' : 'failed';
  
  await Batch.findByIdAndUpdate(batch._id, {
    status: batchStatus,
    sentCount: (batch.sentCount || 0) + sentCount,
    failedCount: (batch.failedCount || 0) + failedCount,
    lastSentAt: new Date(),
  });

  return { sent: sentCount, failed: failedCount, pending: pendingRemaining };
};

/**
 * Create a sending job and queue email jobs
 */
const createSendingJob = async ({
  batchId,
  subject,
  htmlContent,
  textContent,
  sender,
  replyTo,
  attachmentIds,
  footer,
  userId,
}) => {
  const batch = await Batch.findById(batchId);
  if (!batch) throw new Error('Batch not found');

  // Get valid contacts
  const contacts = await Contact.find({ batchId, status: 'valid' });
  if (contacts.length === 0) throw new Error('No valid contacts in batch');

  // Check daily limit
  const remaining = await getDailyRemaining();
  const limit = parseInt(process.env.DAILY_EMAIL_LIMIT) || 280;
  const canSend = Math.min(contacts.length, remaining);
  
  if (canSend === 0) {
    throw new Error(`Daily limit of ${limit} emails reached. No emails can be sent today.`);
  }

  const pendingContacts = contacts.slice(canSend); // Will remain pending
  const sendContacts = contacts.slice(0, canSend);

  // Get attachments
  const attachments = attachmentIds && attachmentIds.length > 0
    ? await Attachment.find({ _id: { $in: attachmentIds } })
    : [];

  // Build full HTML with optional footer
  let fullHtml = htmlContent;
  if (footer && (footer.companyName || footer.footerText)) {
    fullHtml += buildFooterHtml(footer);
  }

  // Create sending job
  const sendingJob = await SendingJob.create({
    batchId,
    subject,
    sender,
    total: contacts.length,
    queued: sendContacts.length,
    processed: 0,
    sent: 0,
    failed: 0,
    pending: pendingContacts.length,
    status: 'queued',
    createdBy: userId,
  });

  // Create email jobs
  const emailJobs = sendContacts.map(contact => ({
    sendingJobId: sendingJob._id,
    batchId,
    contactId: contact._id,
    sender,
    replyTo,
    recipientName: contact.name,
    recipientEmail: contact.normalizedEmail,
    subject,
    htmlContent: fullHtml,
    textContent,
    attachments: attachments.map(a => a._id),
    status: 'pending',
  }));

  await EmailJob.insertMany(emailJobs);

  // Update batch status
  await Batch.findByIdAndUpdate(batchId, { status: 'sending' });

  return {
    sendingJob,
    totalContacts: contacts.length,
    canSend: sendContacts.length,
    pendingCount: pendingContacts.length,
    dailyRemaining: remaining,
  };
};

const buildFooterHtml = (footer) => `
  <div style="margin-top:40px;padding-top:20px;border-top:1px solid #e5e7eb;color:#6b7280;font-size:12px;text-align:center;">
    ${footer.companyName ? `<p style="margin:0 0 4px;font-weight:600;">${footer.companyName}</p>` : ''}
    ${footer.address ? `<p style="margin:0 0 4px;">${footer.address}</p>` : ''}
    ${footer.website ? `<p style="margin:0 0 4px;"><a href="${footer.website}" style="color:#6b7280;">${footer.website}</a></p>` : ''}
    ${footer.phone ? `<p style="margin:0 0 4px;">${footer.phone}</p>` : ''}
    ${footer.footerText ? `<p style="margin:8px 0 0;">${footer.footerText}</p>` : ''}
  </div>
`;

module.exports = {
  createSendingJob,
  processEmailSending,
  getDailyUsage,
  getDailyRemaining,
  getTodayString,
};
