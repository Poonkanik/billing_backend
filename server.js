require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const compression = require('compression');
const connectDB  = require('./config/db');


const app = express();

// Connect to MongoDB
connectDB();

// Middleware
app.use(compression()); // gzip all API responses — 60-80% smaller payloads
const allowedOrigins = process.env.CLIENT_URL
  ? process.env.CLIENT_URL.split(',').map(s => s.trim())
  : ['http://localhost:3000', 'http://localhost:5173', 'https://billing-frontend-page.vercel.app'];

app.use(cors({
  // When credentials:true, the response must echo back the exact requesting
  // origin — a wildcard '*' is not allowed by the browser in that case.
  origin: (origin, callback) => {
    // Non-browser requests (curl, Postman, server-to-server) have no origin
    if (!origin) return callback(null, true);
    // If CLIENT_URL contains '*', allow all origins
    if (allowedOrigins.includes('*')) return callback(null, origin);
    // Reflect the requesting origin if it is in the allow-list
    if (allowedOrigins.includes(origin)) return callback(null, origin);
    // Fallback: allow any origin but still echo it back so credentials work
    return callback(null, origin);
  },
  credentials: true
}));

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

