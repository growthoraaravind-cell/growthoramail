const mongoose = require('mongoose');

const templateSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  subject: { type: String, required: true },
  htmlContent: { type: String, required: true },
  textContent: { type: String },
  footer: {
    companyName: String,
    address: String,
    website: String,
    phone: String,
    footerText: String,
  },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

module.exports = mongoose.model('Template', templateSchema);
