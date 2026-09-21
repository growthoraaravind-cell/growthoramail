const Batch = require('../models/Batch');
const Contact = require('../models/Contact');
const EmailJob = require('../models/EmailJob');
const SendingJob = require('../models/SendingJob');
const { parseExcelFile } = require('../services/excelParserService');
const fs = require('fs');

const getBatches = async (req, res, next) => {
  try {
    const { search, status, page = 1, limit = 20 } = req.query;
    const query = { createdBy: req.user._id };

    if (search) query.name = { $regex: search, $options: 'i' };
    if (status) query.status = status;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [batches, total] = await Promise.all([
      Batch.find(query).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)).lean(),
      Batch.countDocuments(query),
    ]);

    res.json({
      success: true,
      data: {
        batches,
        pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) },
      },
    });
  } catch (error) {
    next(error);
  }
};

const getBatch = async (req, res, next) => {
  try {
    const batch = await Batch.findOne({ _id: req.params.id, createdBy: req.user._id });
    if (!batch) return res.status(404).json({ success: false, message: 'Batch not found' });
    res.json({ success: true, data: { batch } });
  } catch (error) {
    next(error);
  }
};

const createBatch = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Excel file is required' });
    }

    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Batch name is required' });
    }

    // Parse Excel
    const parseResult = parseExcelFile(req.file.path);

    // Create batch
    const batch = await Batch.create({
      name: name.trim(),
      totalContacts: parseResult.importedCount + parseResult.invalidCount + parseResult.duplicateCount,
      validContacts: parseResult.importedCount,
      invalidContacts: parseResult.invalidCount,
      duplicateContacts: parseResult.duplicateCount,
      status: parseResult.importedCount > 0 ? 'ready' : 'draft',
      createdBy: req.user._id,
    });

    // Insert contacts
    if (parseResult.imported.length > 0) {
      const contactDocs = parseResult.imported.map(c => ({
        batchId: batch._id,
        name: c.name,
        email: c.email,
        normalizedEmail: c.normalizedEmail,
        status: 'valid',
      }));
      await Contact.insertMany(contactDocs);
    }

    // Clean up uploaded file
    try { fs.unlinkSync(req.file.path); } catch (e) {}

    res.status(201).json({
      success: true,
      message: parseResult.limitReached
        ? `Batch created. Only the first ${parseResult.maxContacts} valid contacts were imported.`
        : 'Batch created successfully',
      data: {
        batch,
        importSummary: {
          totalRows: parseResult.totalRows,
          imported: parseResult.importedCount,
          invalid: parseResult.invalidCount,
          duplicates: parseResult.duplicateCount,
          skipped: parseResult.skippedCount,
          limitReached: parseResult.limitReached,
          maxContacts: parseResult.maxContacts,
        },
      },
    });
  } catch (error) {
    if (req.file) try { fs.unlinkSync(req.file.path); } catch (e) {}
    next(error);
  }
};

const previewExcel = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Excel file is required' });
    }

    const parseResult = parseExcelFile(req.file.path);
    try { fs.unlinkSync(req.file.path); } catch (e) {}

    res.json({
      success: true,
      data: {
        preview: parseResult.imported.slice(0, 20),
        summary: {
          totalRows: parseResult.totalRows,
          validCount: parseResult.validCount,
          importedCount: parseResult.importedCount,
          invalidCount: parseResult.invalidCount,
          duplicateCount: parseResult.duplicateCount,
          skippedCount: parseResult.skippedCount,
          limitReached: parseResult.limitReached,
          maxContacts: parseResult.maxContacts,
        },
        invalidSample: parseResult.invalid.slice(0, 5),
      },
    });
  } catch (error) {
    if (req.file) try { fs.unlinkSync(req.file.path); } catch (e) {}
    next(error);
  }
};

const updateBatch = async (req, res, next) => {
  try {
    const { name } = req.body;
    const batch = await Batch.findOneAndUpdate(
      { _id: req.params.id, createdBy: req.user._id },
      { name: name.trim() },
      { returnDocument: 'after' }
    );
    if (!batch) return res.status(404).json({ success: false, message: 'Batch not found' });
    res.json({ success: true, message: 'Batch updated', data: { batch } });
  } catch (error) {
    next(error);
  }
};

const deleteBatch = async (req, res, next) => {
  try {
    const batch = await Batch.findOne({ _id: req.params.id, createdBy: req.user._id });
    if (!batch) return res.status(404).json({ success: false, message: 'Batch not found' });

    if (batch.status === 'sending') {
      return res.status(400).json({ success: false, message: 'Cannot delete a batch that is currently sending' });
    }

    await Promise.all([
      Contact.deleteMany({ batchId: batch._id }),
      EmailJob.deleteMany({ batchId: batch._id }),
      Batch.deleteOne({ _id: batch._id }),
    ]);

    res.json({ success: true, message: 'Batch deleted successfully' });
  } catch (error) {
    next(error);
  }
};

const getBatchContacts = async (req, res, next) => {
  try {
    const { search, status, page = 1, limit = 50 } = req.query;
    const batch = await Batch.findOne({ _id: req.params.id, createdBy: req.user._id });
    if (!batch) return res.status(404).json({ success: false, message: 'Batch not found' });

    const query = { batchId: batch._id };
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { normalizedEmail: { $regex: search.toLowerCase(), $options: 'i' } },
      ];
    }
    if (status) query.status = status;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [contacts, total] = await Promise.all([
      Contact.find(query).sort({ createdAt: 1 }).skip(skip).limit(parseInt(limit)).lean(),
      Contact.countDocuments(query),
    ]);

    res.json({
      success: true,
      data: {
        contacts,
        pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) },
      },
    });
  } catch (error) {
    next(error);
  }
};

const replaceBatchContacts = async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'Excel file is required' });

    const batch = await Batch.findOne({ _id: req.params.id, createdBy: req.user._id });
    if (!batch) return res.status(404).json({ success: false, message: 'Batch not found' });

    if (batch.status === 'sending') {
      return res.status(400).json({ success: false, message: 'Cannot replace contacts while sending' });
    }

    const parseResult = parseExcelFile(req.file.path);
    try { fs.unlinkSync(req.file.path); } catch (e) {}

    // Remove old contacts
    await Contact.deleteMany({ batchId: batch._id });

    // Insert new contacts
    if (parseResult.imported.length > 0) {
      const contactDocs = parseResult.imported.map(c => ({
        batchId: batch._id,
        name: c.name,
        email: c.email,
        normalizedEmail: c.normalizedEmail,
        status: 'valid',
      }));
      await Contact.insertMany(contactDocs);
    }

    await Batch.findByIdAndUpdate(batch._id, {
      totalContacts: parseResult.importedCount + parseResult.invalidCount + parseResult.duplicateCount,
      validContacts: parseResult.importedCount,
      invalidContacts: parseResult.invalidCount,
      duplicateContacts: parseResult.duplicateCount,
      sentCount: 0,
      deliveredCount: 0,
      failedCount: 0,
      pendingCount: 0,
      status: parseResult.importedCount > 0 ? 'ready' : 'draft',
    });

    res.json({
      success: true,
      message: 'Contacts replaced successfully',
      data: {
        importSummary: {
          imported: parseResult.importedCount,
          invalid: parseResult.invalidCount,
          duplicates: parseResult.duplicateCount,
          limitReached: parseResult.limitReached,
        },
      },
    });
  } catch (error) {
    if (req.file) try { fs.unlinkSync(req.file.path); } catch (e) {}
    next(error);
  }
};

module.exports = { getBatches, getBatch, createBatch, previewExcel, updateBatch, deleteBatch, getBatchContacts, replaceBatchContacts };
