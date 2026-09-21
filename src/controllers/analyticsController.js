const SendingJob = require('../models/SendingJob');
const EmailJob = require('../models/EmailJob');
const Batch = require('../models/Batch');
const Contact = require('../models/Contact');
const DailyUsage = require('../models/DailyUsage');

const getOverview = async (req, res, next) => {
  try {
    const { range = '7d' } = req.query;
    
    const now = new Date();
    let fromDate;
    switch(range) {
      case 'today': fromDate = new Date(now.setHours(0,0,0,0)); break;
      case '7d': fromDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); break;
      case '30d': fromDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); break;
      default: fromDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    }

    const [
      totalBatches,
      totalContacts,
      jobStats,
      emailStats,
      dailyUsages,
    ] = await Promise.all([
      Batch.countDocuments(),
      Contact.countDocuments({ status: 'valid' }),
      SendingJob.aggregate([
        { $match: { createdAt: { $gte: fromDate } } },
        { $group: {
          _id: null,
          totalSent: { $sum: '$sent' },
          totalDelivered: { $sum: '$delivered' },
          totalFailed: { $sum: '$failed' },
          totalOpened: { $sum: '$opened' },
          totalClicked: { $sum: '$clicked' },
          totalPending: { $sum: '$pending' },
        }}
      ]),
      EmailJob.aggregate([
        { $match: { createdAt: { $gte: fromDate } } },
        { $group: {
          _id: '$status',
          count: { $sum: 1 }
        }}
      ]),
      DailyUsage.find({ createdAt: { $gte: fromDate } }).sort({ date: 1 }).lean(),
    ]);

    const stats = jobStats[0] || { totalSent: 0, totalDelivered: 0, totalFailed: 0, totalOpened: 0, totalClicked: 0, totalPending: 0 };
    
    const deliveryRate = stats.totalSent > 0 ? ((stats.totalDelivered / stats.totalSent) * 100).toFixed(1) : 0;
    const openRate = stats.totalDelivered > 0 ? ((stats.totalOpened / stats.totalDelivered) * 100).toFixed(1) : 0;
    const clickRate = stats.totalOpened > 0 ? ((stats.totalClicked / stats.totalOpened) * 100).toFixed(1) : 0;

    // Today's stats
    const todayStr = new Date().toISOString().split('T')[0];
    const todayUsage = await DailyUsage.findOne({ date: todayStr });
    const dailyLimit = parseInt(process.env.DAILY_EMAIL_LIMIT) || 280;

    res.json({
      success: true,
      data: {
        overview: {
          totalBatches,
          totalContacts,
          totalSent: stats.totalSent,
          totalDelivered: stats.totalDelivered,
          totalFailed: stats.totalFailed,
          totalOpened: stats.totalOpened,
          totalClicked: stats.totalClicked,
          totalPending: stats.totalPending,
          deliveryRate: parseFloat(deliveryRate),
          openRate: parseFloat(openRate),
          clickRate: parseFloat(clickRate),
        },
        today: {
          sent: todayUsage?.sentCount || 0,
          remaining: Math.max(0, dailyLimit - (todayUsage?.sentCount || 0)),
          limit: dailyLimit,
        },
        dailyUsages,
        emailStatusBreakdown: emailStats,
      },
    });
  } catch (error) {
    next(error);
  }
};

const getBatchAnalytics = async (req, res, next) => {
  try {
    const batches = await SendingJob.aggregate([
      {
        $group: {
          _id: '$batchId',
          totalSent: { $sum: '$sent' },
          totalDelivered: { $sum: '$delivered' },
          totalFailed: { $sum: '$failed' },
          totalOpened: { $sum: '$opened' },
          lastSent: { $max: '$createdAt' },
        }
      },
      { $lookup: { from: 'batches', localField: '_id', foreignField: '_id', as: 'batch' } },
      { $unwind: { path: '$batch', preserveNullAndEmptyArrays: true } },
      { $sort: { lastSent: -1 } },
      { $limit: 10 },
    ]);

    res.json({ success: true, data: { batches } });
  } catch (error) {
    next(error);
  }
};

const getDashboardStats = async (req, res, next) => {
  try {
    const todayStr = new Date().toISOString().split('T')[0];
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);

    const [
      totalBatches,
      totalContacts,
      todayUsage,
      totalStats,
      recentJobs,
    ] = await Promise.all([
      Batch.countDocuments(),
      Contact.countDocuments({ status: 'valid' }),
      DailyUsage.findOne({ date: todayStr }),
      SendingJob.aggregate([{
        $group: {
          _id: null,
          totalSent: { $sum: '$sent' },
          totalDelivered: { $sum: '$delivered' },
          totalFailed: { $sum: '$failed' },
          totalPending: { $sum: '$pending' },
          totalOpened: { $sum: '$opened' },
          totalClicked: { $sum: '$clicked' },
        }
      }]),
      SendingJob.find()
        .populate('batchId', 'name')
        .sort({ createdAt: -1 })
        .limit(5)
        .lean(),
    ]);

    const dailyLimit = parseInt(process.env.DAILY_EMAIL_LIMIT) || 280;
    const sentToday = todayUsage?.sentCount || 0;
    const stats = totalStats[0] || {};

    res.json({
      success: true,
      data: {
        totalBatches,
        totalContacts,
        sentToday,
        remainingToday: Math.max(0, dailyLimit - sentToday),
        dailyLimit,
        totalSent: stats.totalSent || 0,
        totalDelivered: stats.totalDelivered || 0,
        totalFailed: stats.totalFailed || 0,
        totalPending: stats.totalPending || 0,
        totalOpened: stats.totalOpened || 0,
        totalClicked: stats.totalClicked || 0,
        recentJobs,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { getOverview, getBatchAnalytics, getDashboardStats };
