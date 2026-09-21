const EmailJob = require('../models/EmailJob');
const SendingJob = require('../models/SendingJob');
const DailyUsage = require('../models/DailyUsage');

const handleBrevoWebhook = async (req, res) => {
  try {
    const events = Array.isArray(req.body) ? req.body : [req.body];

    for (const event of events) {
      const { event: eventType, 'message-id': messageId, email, date } = event;

      if (!messageId) continue;

      const emailJob = await EmailJob.findOne({ brevoMessageId: messageId });
      if (!emailJob) {
        console.log(`[Webhook] No email job found for messageId: ${messageId}`);
        continue;
      }

      const eventDate = date ? new Date(date) : new Date();
      let update = {};

      switch (eventType) {
        case 'delivered':
          update = { status: 'delivered', deliveredAt: eventDate };
          // Update sending job delivered count
          await SendingJob.findByIdAndUpdate(emailJob.sendingJobId, { $inc: { delivered: 1 } });
          break;
        case 'opened':
          update = { status: 'opened', openedAt: eventDate };
          await SendingJob.findByIdAndUpdate(emailJob.sendingJobId, { $inc: { opened: 1 } });
          break;
        case 'click':
          update = { status: 'clicked', clickedAt: eventDate };
          await SendingJob.findByIdAndUpdate(emailJob.sendingJobId, { $inc: { clicked: 1 } });
          break;
        case 'soft_bounce':
        case 'hard_bounce':
          update = { status: 'bounced', failedAt: eventDate, error: `Bounce: ${eventType}` };
          break;
        case 'blocked':
          update = { status: 'blocked', failedAt: eventDate, error: 'Email blocked' };
          break;
        case 'invalid_email':
          update = { status: 'failed', failedAt: eventDate, error: 'Invalid email' };
          break;
        default:
          console.log(`[Webhook] Unhandled event type: ${eventType}`);
          continue;
      }

      await EmailJob.findByIdAndUpdate(emailJob._id, { $set: update });
      console.log(`[Webhook] Updated email job ${emailJob._id} status: ${update.status}`);
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('[Webhook] Error handling Brevo webhook:', error);
    res.status(200).json({ success: true }); // Always return 200 to Brevo
  }
};

module.exports = { handleBrevoWebhook };
