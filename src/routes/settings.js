const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const { getSettings, updateSettings, testBrevo } = require('../controllers/settingsController');
router.use(auth);
router.get('/', getSettings);
router.put('/', updateSettings);
router.post('/brevo/test', testBrevo);
module.exports = router;
