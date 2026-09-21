const mongoose = require('mongoose');

const emailJobSchema = new mongoose.Schema({
  sendingJobId: { type: mongoose.Schema.Types.ObjectId, ref: 'SendingJob' },
  batchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Batch', required: true },
  contactId: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact' },
  sender: {
    name: { type: String },
    email: { type: String }
  },
  replyTo: { type: String },
  recipientName: { type: String },
  recipientEmail: { type: String, required: true },
  subject: { type: String, required: true },
  htmlContent: { type: String },
  textContent: { type: String },
  attachments: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Attachment' }],
  status: {
    type: String,
    enum: ['pending', 'sending', 'sent', 'delivered', 'opened', 'clicked', 'failed', 'bounced', 'blocked', 'deferred'],
    default: 'pending'
  },
  brevoMessageId: { type: String, index: true },
  error: { type: String },
  attemptCount: { type: Number, default: 0 },
  sentAt: { type: Date },
  deliveredAt: { type: Date },
  openedAt: { type: Date },
  clickedAt: { type: Date },
  failedAt: { type: Date },
}, { timestamps: true });

emailJobSchema.index({ batchId: 1 });
emailJobSchema.index({ status: 1 });
emailJobSchema.index({ sendingJobId: 1 });
emailJobSchema.index({ createdAt: -1 });

module.exports = mongoose.model('EmailJob', emailJobSchema);
