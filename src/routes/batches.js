const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const { uploadExcel } = require('../middleware/upload');
const { getBatches, getBatch, createBatch, previewExcel, updateBatch, deleteBatch, getBatchContacts, replaceBatchContacts } = require('../controllers/batchController');

router.use(auth);
router.get('/', getBatches);
router.post('/', uploadExcel, createBatch);
router.post('/preview', uploadExcel, previewExcel);
router.get('/:id', getBatch);
router.put('/:id', updateBatch);
router.delete('/:id', deleteBatch);
router.get('/:id/contacts', getBatchContacts);
router.post('/:id/upload', uploadExcel, replaceBatchContacts);

module.exports = router;
