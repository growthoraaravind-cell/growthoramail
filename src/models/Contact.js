const mongoose = require('mongoose');

const contactSchema = new mongoose.Schema({
  batchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Batch', required: true },
  name: { type: String, trim: true, default: '' },
  email: { type: String, required: true, trim: true },
  normalizedEmail: { type: String, required: true, lowercase: true, trim: true },
  status: {
    type: String,
    enum: ['valid', 'invalid', 'duplicate', 'unsubscribed'],
    default: 'valid'
  },
  sentAt: { type: Date },
  deliveredAt: { type: Date },
  openedAt: { type: Date },
  clickedAt: { type: Date },
  failedAt: { type: Date },
  emailJobId: { type: mongoose.Schema.Types.ObjectId, ref: 'EmailJob' },
  errorMessage: { type: String },
}, { timestamps: true });

contactSchema.index({ batchId: 1 });
contactSchema.index({ normalizedEmail: 1 });
contactSchema.index({ batchId: 1, normalizedEmail: 1 });
contactSchema.index({ status: 1 });

module.exports = mongoose.model('Contact', contactSchema);
