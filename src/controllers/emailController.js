const { createSendingJob, processEmailSending, getDailyUsage, getDailyRemaining } = require('../services/emailSendingService');
const { sendTestEmail, createEmailCampaign } = require('../services/brevoService');
const SendingJob = require('../models/SendingJob');
const EmailJob = require('../models/EmailJob');
const DailyUsage = require('../models/DailyUsage');

const sendEmails = async (req, res, next) => {
  try {
    const {
      batchId, subject, htmlContent, textContent,
      sender, replyTo, attachmentIds, footer
    } = req.body;

    if (!batchId) return res.status(400).json({ success: false, message: 'Batch is required' });
    if (!subject) return res.status(400).json({ success: false, message: 'Subject is required' });
    if (!htmlContent) return res.status(400).json({ success: false, message: 'Email content is required' });
    if (!sender?.email) return res.status(400).json({ success: false, message: 'Sender email is required' });
    if (!process.env.BREVO_API_KEY) {
      return res.status(503).json({ success: false, message: 'Brevo email service is not configured' });
    }

    const jobInfo = await createSendingJob({
      batchId, subject, htmlContent, textContent,
      sender, replyTo, attachmentIds, footer,
      userId: req.user._id,
    });

    // Process in background (non-blocking response)
    processEmailSending(jobInfo.sendingJob._id).catch(err => {
      console.error(`[EmailSending] Error processing job ${jobInfo.sendingJob._id}:`, err);
    });

    res.status(201).json({
      success: true,
      message: jobInfo.pendingCount > 0
        ? `Sending ${jobInfo.canSend} emails. ${jobInfo.pendingCount} contacts will remain pending due to daily limit.`
        : `Sending ${jobInfo.canSend} emails`,
      data: {
        sendingJobId: jobInfo.sendingJob._id,
        totalContacts: jobInfo.totalContacts,
        canSend: jobInfo.canSend,
        pendingCount: jobInfo.pendingCount,
        dailyRemaining: jobInfo.dailyRemaining,
      },
    });
  } catch (error) {
    next(error);
  }
};

const getSendingJobStatus = async (req, res, next) => {
  try {
    const job = await SendingJob.findById(req.params.id).populate('batchId', 'name').lean();
    if (!job) return res.status(404).json({ success: false, message: 'Sending job not found' });
    res.json({ success: true, data: { job } });
  } catch (error) {
    next(error);
  }
};

const getSendingHistory = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, batchId, status } = req.query;
    const query = {};
    if (batchId) query.batchId = batchId;
    if (status) query.status = status;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [jobs, total] = await Promise.all([
      SendingJob.find(query)
        .populate('batchId', 'name')
        .populate('createdBy', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      SendingJob.countDocuments(query),
    ]);

    res.json({
      success: true,
      data: {
        jobs,
        pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) },
      },
    });
  } catch (error) {
    next(error);
  }
};

const getEmailJobsForSendingJob = async (req, res, next) => {
  try {
    const { page = 1, limit = 50, status } = req.query;
    const query = { sendingJobId: req.params.id };
    if (status) query.status = status;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [jobs, total] = await Promise.all([
      EmailJob.find(query).sort({ createdAt: 1 }).skip(skip).limit(parseInt(limit)).lean(),
      EmailJob.countDocuments(query),
    ]);

    res.json({
      success: true,
      data: {
        jobs,
        pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) },
      },
    });
  } catch (error) {
    next(error);
  }
};

const sendTest = async (req, res, next) => {
  try {
    const { to, subject, htmlContent, sender } = req.body;
    if (!to) return res.status(400).json({ success: false, message: 'Test recipient email required' });
    if (!subject) return res.status(400).json({ success: false, message: 'Subject required' });
    if (!htmlContent) return res.status(400).json({ success: false, message: 'Email content required' });

    const result = await sendTestEmail({
      to,
      subject,
      htmlContent,
      sender: sender || {
        name: process.env.BREVO_SENDER_NAME,
        email: process.env.BREVO_SENDER_EMAIL,
      },
    });

    if (!result.success) {
      return res.status(400).json({ success: false, message: result.message || 'Failed to send test email' });
    }

    res.json({ success: true, message: `Test email sent to ${to}`, data: { messageId: result.messageId } });
  } catch (error) {
    next(error);
  }
};

const createCampaign = async (req, res, next) => {
  try {
    const {
      name, subject, htmlContent, sender, listIds, scheduledAt, replyTo,
    } = req.body;

    if (!name) return res.status(400).json({ success: false, message: 'Campaign name is required' });
    if (!subject) return res.status(400).json({ success: false, message: 'Subject is required' });
    if (!htmlContent) return res.status(400).json({ success: false, message: 'Email content is required' });
    if (!sender?.email) return res.status(400).json({ success: false, message: 'Sender email is required' });
    if (!Array.isArray(listIds) || listIds.length === 0 || listIds.some(id => !Number.isInteger(id))) {
      return res.status(400).json({ success: false, message: 'At least one Brevo list ID is required' });
    }
    if (!process.env.BREVO_API_KEY) {
      return res.status(503).json({ success: false, message: 'Brevo email service is not configured' });
    }

    const result = await createEmailCampaign({
      name, subject, htmlContent, sender, listIds, scheduledAt, replyTo,
    });

    if (!result.success) {
      return res.status(result.status || 502).json({
        success: false,
        message: result.message || 'Failed to create campaign',
      });
    }

    res.status(201).json({
      success: true,
      message: scheduledAt ? 'Campaign scheduled successfully' : 'Campaign created successfully',
      data: result.data,
    });
  } catch (error) {
    next(error);
  }
};

const getDailyStats = async (req, res, next) => {
  try {
    const usage = await getDailyUsage();
    const remaining = await getDailyRemaining();
    const limit = parseInt(process.env.DAILY_EMAIL_LIMIT) || 280;

    res.json({
      success: true,
      data: {
        date: usage.date,
        sentToday: usage.sentCount,
        remaining,
        limit,
        percentUsed: Math.round((usage.sentCount / limit) * 100),
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { sendEmails, getSendingJobStatus, getSendingHistory, getEmailJobsForSendingJob, sendTest, createCampaign, getDailyStats };
