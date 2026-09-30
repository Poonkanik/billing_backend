const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const mongoURI = process.env.MONGODB_URI || process.env.MONGO_URL || process.env.MONGO_PRIVATE_URL;
    if (!mongoURI) {
      throw new Error('No MongoDB connection string found. Please set MONGODB_URI in your Render Environment variables.');
    }

    if (mongoURI.includes('<db_password>') || mongoURI.includes('<password>')) {
      throw new Error("MONGODB_URI contains the placeholder '<db_password>'! Please replace '<db_password>' with your real MongoDB user password in Render Dashboard -> Environment.");
    }

    const isCloudEnv = process.env.RENDER === 'true' || process.env.NODE_ENV === 'production';
    if (isCloudEnv && (mongoURI.includes('127.0.0.1') || mongoURI.includes('localhost'))) {
      throw new Error("MONGODB_URI is still set to localhost (127.0.0.1)! Go to Render Dashboard -> Environment tab and add MONGODB_URI with your MongoDB Atlas connection string.");
    }

    const maskedURI = mongoURI.replace(/:([^@]+)@/, ':****@');
    console.log(`📡 Connecting to MongoDB: ${maskedURI}`);
    const conn = await mongoose.connect(mongoURI);
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`❌ MongoDB Error: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;

