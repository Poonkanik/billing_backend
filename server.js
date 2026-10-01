require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const compression = require('compression');
const connectDB  = require('./config/db');


const app = express();

// Connect to MongoDB
connectDB();

// ---------------------------------------------------------------------------
// CORS — must be registered BEFORE all other middleware so that preflight
// OPTIONS requests get an immediate 204 response with the correct headers.
// ---------------------------------------------------------------------------
const ALLOWED_ORIGINS = (process.env.CLIENT_URL || '')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

// Always allow localhost variants for local development
const LOCAL_PATTERN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (curl, Postman, server-to-server)
    if (!origin) return callback(null, true);
    if (LOCAL_PATTERN.test(origin)) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    callback(new Error(`CORS: origin '${origin}' not allowed`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

// Respond to all preflight OPTIONS requests immediately
app.options('*', cors(corsOptions));
app.use(cors(corsOptions));

// Middleware
app.use(compression()); // gzip all API responses — 60-80% smaller payloads

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: false, limit: '10mb' }));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/master', require('./routes/master'));
app.use('/api/bills', require('./routes/bills'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/inventory', require('./routes/inventory'));
app.use('/api/cash-register', require('./routes/cashRegister'));
app.use('/api/online-orders', require('./routes/onlineOrders'));

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'OK', time: new Date() }));

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Server Error', error: process.env.NODE_ENV === 'development' ? err.message : undefined });
});

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

