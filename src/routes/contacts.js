const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const Contact = require('../models/Contact');

router.use(auth);

router.get('/', async (req, res, next) => {
  try {
    const { batchId, search, status, page = 1, limit = 50 } = req.query;
    const query = {};
    if (batchId) query.batchId = batchId;
    if (search) query.$or = [{ name: { $regex: search, $options: 'i' } }, { normalizedEmail: { $regex: search.toLowerCase() } }];
    if (status) query.status = status;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [contacts, total] = await Promise.all([
      Contact.find(query).sort({ createdAt: 1 }).skip(skip).limit(parseInt(limit)).lean(),
      Contact.countDocuments(query),
    ]);
    res.json({ success: true, data: { contacts, pagination: { total, page: parseInt(page), limit: parseInt(limit) } } });
  } catch (error) { next(error); }
});

module.exports = router;
