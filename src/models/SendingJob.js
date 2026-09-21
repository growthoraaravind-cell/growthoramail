const mongoose = require('mongoose');

const sendingJobSchema = new mongoose.Schema({
  batchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Batch', required: true },
  subject: { type: String, required: true },
  sender: { name: String, email: String },
  total: { type: Number, default: 0 },
  queued: { type: Number, default: 0 },
  processed: { type: Number, default: 0 },
  sent: { type: Number, default: 0 },
  delivered: { type: Number, default: 0 },
  opened: { type: Number, default: 0 },
  clicked: { type: Number, default: 0 },
  failed: { type: Number, default: 0 },
  pending: { type: Number, default: 0 },
  status: {
    type: String,
    enum: ['queued', 'sending', 'completed', 'partial', 'failed', 'paused'],
    default: 'queued'
  },
  dailyLimitReached: { type: Boolean, default: false },
  startedAt: { type: Date },
  completedAt: { type: Date },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

sendingJobSchema.index({ batchId: 1 });
sendingJobSchema.index({ createdAt: -1 });

module.exports = mongoose.model('SendingJob', sendingJobSchema);
