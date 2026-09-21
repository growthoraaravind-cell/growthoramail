const express = require('express');
const router = express.Router();
const { login, getMe, changePassword } = require('../controllers/authController');
const { auth } = require('../middleware/auth');

router.post('/login', login);
router.get('/me', auth, getMe);
router.put('/change-password', auth, changePassword);

module.exports = router;
