const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const { sendEmails, getSendingJobStatus, getSendingHistory, getEmailJobsForSendingJob, sendTest, createCampaign, getDailyStats } = require('../controllers/emailController');

router.use(auth);
router.post('/send', sendEmails);
router.post('/test', sendTest);
router.post('/campaigns', createCampaign);
router.get('/daily-stats', getDailyStats);
router.get('/history', getSendingHistory);
router.get('/jobs/:id', getSendingJobStatus);
router.get('/jobs/:id/emails', getEmailJobsForSendingJob);

module.exports = router;
