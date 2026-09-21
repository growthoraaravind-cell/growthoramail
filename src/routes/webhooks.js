const express = require('express');
const router = express.Router();
const { handleBrevoWebhook } = require('../controllers/webhookController');
router.post('/brevo', handleBrevoWebhook);
module.exports = router;
