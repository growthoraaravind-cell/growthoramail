const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const { getOverview, getBatchAnalytics, getDashboardStats } = require('../controllers/analyticsController');

router.use(auth);
router.get('/overview', getOverview);
router.get('/batches', getBatchAnalytics);
router.get('/dashboard', getDashboardStats);

module.exports = router;
