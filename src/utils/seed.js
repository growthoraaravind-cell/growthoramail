const User = require('../models/User');

const seedAdmin = async () => {
  try {
    const adminEmail = process.env.ADMIN_EMAIL || 'growthora@gmail.com';
    const existing = await User.findOne({ email: adminEmail });
    if (existing) {
      console.log(`✅ Admin user already exists: ${adminEmail}`);
      return;
    }

    const passwordHash = await User.hashPassword(process.env.ADMIN_PASSWORD || '123456');
    await User.create({
      name: process.env.ADMIN_NAME || 'Growthora Admin',
      email: adminEmail,
      passwordHash,
      role: 'admin',
    });

    console.log(`✅ Admin user created: ${adminEmail}`);
  } catch (error) {
    console.error('Seed error:', error.message);
  }
};

module.exports = { seedAdmin };
