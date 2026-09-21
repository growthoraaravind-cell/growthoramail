const mongoose = require('mongoose');

const dailyUsageSchema = new mongoose.Schema({
  date: { type: String, required: true, unique: true }, // YYYY-MM-DD
  sentCount: { type: Number, default: 0 },
  deliveredCount: { type: Number, default: 0 },
  failedCount: { type: Number, default: 0 },
}, { timestamps: true });

dailyUsageSchema.index({ date: 1 });

module.exports = mongoose.model('DailyUsage', dailyUsageSchema);
