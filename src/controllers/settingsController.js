const Settings = require('../models/Settings');
const { testBrevoConnection } = require('../services/brevoService');

const getSettings = async (req, res, next) => {
  try {
    const settingsList = await Settings.find().lean();
    const settings = {};
    settingsList.forEach(s => { settings[s.key] = s.value; });

    // Add env-based settings (without sensitive values)
    settings.dailyEmailLimit = parseInt(process.env.DAILY_EMAIL_LIMIT) || 280;
    settings.maxBatchContacts = parseInt(process.env.MAX_BATCH_CONTACTS) || 280;
    settings.brevoSenderEmail = process.env.BREVO_SENDER_EMAIL || '';
    settings.brevoSenderName = process.env.BREVO_SENDER_NAME || '';
    settings.brevoConfigured = !!process.env.BREVO_API_KEY;

    res.json({ success: true, data: { settings } });
  } catch (error) {
    next(error);
  }
};

const updateSettings = async (req, res, next) => {
  try {
    const updates = req.body;
    const sensitiveKeys = ['brevoApiKey', 'jwtSecret', 'mongoUri'];
    
    for (const [key, value] of Object.entries(updates)) {
      if (sensitiveKeys.includes(key)) continue; // Don't store sensitive keys in DB
      await Settings.findOneAndUpdate({ key }, { key, value }, { upsert: true, returnDocument: 'after' });
    }

    res.json({ success: true, message: 'Settings updated' });
  } catch (error) {
    next(error);
  }
};

const testBrevo = async (req, res, next) => {
  try {
    const result = await testBrevoConnection();
    if (result.success) {
      res.json({
        success: true,
        message: 'Brevo connection successful',
        data: {
          plan: result.data?.plan?.name || 'Free',
          email: result.data?.email,
        },
      });
    } else {
      res.status(400).json({ success: false, message: result.message || 'Brevo connection failed' });
    }
  } catch (error) {
    next(error);
  }
};

module.exports = { getSettings, updateSettings, testBrevo };
