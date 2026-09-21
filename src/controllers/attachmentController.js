const Attachment = require('../models/Attachment');
const path = require('path');
const fs = require('fs');

const uploadAttachment = async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file provided' });

    const backendUrl = process.env.BACKEND_URL || '';
    const fileUrl = `${backendUrl}/uploads/attachments/${req.file.filename}`;

    const attachment = await Attachment.create({
      originalName: req.file.originalname,
      storedName: req.file.filename,
      url: fileUrl,
      mimeType: req.file.mimetype,
      size: req.file.size,
      uploadedBy: req.user._id,
    });

    res.status(201).json({
      success: true,
      message: 'File uploaded successfully',
      data: { attachment },
    });
  } catch (error) {
    next(error);
  }
};

const getAttachments = async (req, res, next) => {
  try {
    const attachments = await Attachment.find({ uploadedBy: req.user._id })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    res.json({ success: true, data: { attachments } });
  } catch (error) {
    next(error);
  }
};

const deleteAttachment = async (req, res, next) => {
  try {
    const attachment = await Attachment.findOne({ _id: req.params.id, uploadedBy: req.user._id });
    if (!attachment) return res.status(404).json({ success: false, message: 'Attachment not found' });

    const filePath = path.join(__dirname, '../../uploads/attachments', attachment.storedName);
    try { fs.unlinkSync(filePath); } catch (e) {}

    await Attachment.deleteOne({ _id: attachment._id });
    res.json({ success: true, message: 'Attachment deleted' });
  } catch (error) {
    next(error);
  }
};

module.exports = { uploadAttachment, getAttachments, deleteAttachment };
