const path = require('path');
const dotenv = require('dotenv');

// Load the workspace environment consistently whether the server starts from the root or backend directory.
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });
const app = require('./app');
const connectDB = require('./config/db');
const { seedAdmin } = require('./utils/seed');

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    await connectDB();
    await seedAdmin();
    
    app.listen(PORT, () => {
      console.log(`\n🚀 Growthora Mail Rocket Backend running on port ${PORT}`);
      console.log(`📦 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🌐 Frontend URL: ${process.env.FRONTEND_URL}`);
      console.log(`📁 Uploads: ${process.env.BACKEND_URL}/uploads\n`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
