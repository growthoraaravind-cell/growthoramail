const mongoose = require('mongoose');

const batchSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  totalContacts: { type: Number, default: 0 },
  validContacts: { type: Number, default: 0 },
  invalidContacts: { type: Number, default: 0 },
  duplicateContacts: { type: Number, default: 0 },
  sentCount: { type: Number, default: 0 },
  deliveredCount: { type: Number, default: 0 },
  failedCount: { type: Number, default: 0 },
  pendingCount: { type: Number, default: 0 },
  openedCount: { type: Number, default: 0 },
  clickedCount: { type: Number, default: 0 },
  status: {
    type: String,
    enum: ['draft', 'ready', 'sending', 'completed', 'partial', 'failed'],
    default: 'draft'
  },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  lastSentAt: { type: Date },
}, { timestamps: true });

batchSchema.index({ createdBy: 1, createdAt: -1 });
batchSchema.index({ status: 1 });

module.exports = mongoose.model('Batch', batchSchema);
