const mongoose = require('mongoose');

const platformStatusSchema = new mongoose.Schema({
  platform: { type: String, enum: ['swiggy', 'zomato'], required: true },
  isOnline: { type: Boolean, default: false },
  isLoggedIn: { type: Boolean, default: false },
  authType: { type: String, enum: ['portal_login', 'api_key', 'session_token'], default: 'portal_login' },
  
  // Credentials & Session details
  merchantId: { type: String, default: '' },
  outletName: { type: String, default: '' },
  username: { type: String, default: '' },
  apiKey: { type: String, default: '' },
  sessionToken: { type: String, default: '' },
  tokenExpiry: { type: Date, default: null },
  webhookSecret: { type: String, default: '' },

  // Operational settings
  autoAccept: { type: Boolean, default: false },
  autoSync: { type: Boolean, default: true },
  syncIntervalSec: { type: Number, default: 30 },
  storeStatusMessage: { type: String, default: 'Offline / Disconnected' },

  // Sync Diagnostics
  lastSync: { type: Date, default: Date.now },
  lastSyncCount: { type: Number, default: 0 },
  lastSyncStatus: { type: String, default: 'IDLE' }, // 'SUCCESS', 'FAILED', 'IDLE'
  lastSyncMessage: { type: String, default: '' },

  branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null },
}, { timestamps: true });

platformStatusSchema.index({ platform: 1, branch: 1 }, { unique: true });

module.exports = mongoose.model('PlatformStatus', platformStatusSchema);
