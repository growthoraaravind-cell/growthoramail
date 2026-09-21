const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const { uploadAttachment } = require('../middleware/upload');
const { uploadAttachment: upload, getAttachments, deleteAttachment } = require('../controllers/attachmentController');

router.use(auth);
router.post('/upload', uploadAttachment, upload);
router.get('/', getAttachments);
router.delete('/:id', deleteAttachment);

module.exports = router;
