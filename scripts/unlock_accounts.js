// Quick script to unlock ROOT and ADMIN accounts
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

async function unlockAccounts() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const result = await mongoose.connection.db.collection('users').updateMany(
      { name: { $in: ['ROOT', 'ROOT1', 'ROOT2', 'ADMIN'] } },
      {
        $set: {
          isLocked: false,
          failedLoginAttempts: 0,
          lockedAt: null,
          lockReason: null,
        },
      }
    );

    console.log(`Matched: ${result.matchedCount}, Modified: ${result.modifiedCount}`);
    console.log('ROOT, ROOT1, ROOT2, and ADMIN accounts have been unlocked!');

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

unlockAccounts();
