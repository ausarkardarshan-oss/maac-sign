'use strict';
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const env = require('./config/env');
const { errorHandler } = require('./middleware/errorHandler');

// Route modules
const authRoutes = require('./routes/auth');
const documentRoutes = require('./routes/documents');
const signingRoutes = require('./routes/signing');
const templateRoutes = require('./routes/templates');
const notificationRoutes = require('./routes/notifications');

const app = express();

// ── Security headers ──────────────────────────────────────────────────────────
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: false, // React app sets its own CSP
  }),
);

// ── CORS ──────────────────────────────────────────────────────────────────────
app.use(
  cors({
    origin: env.FRONTEND_URL,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'PUT', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }),
);

// ── Body parsers ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' })); // 10 MB to accommodate base64 PDFs
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// ── API routes ────────────────────────────────────────────────────────────────
app.use('/api', authRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api', signingRoutes);
app.use('/api', templateRoutes);
app.use('/api/notifications', notificationRoutes);

// Reports endpoint
app.get('/api/reports', require('./middleware/auth').requireAuth, async (req, res, next) => {
  try {
    const { getDocumentStats } = require('./services/documentService');
    const stats = await getDocumentStats(req.user.id);
    res.json(stats);
  } catch (err) {
    next(err);
  }
});

// ── 404 handler ───────────────────────────────────────────────────────────────
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// ── Error handler ─────────────────────────────────────────────────────────────
app.use(errorHandler);

module.exports = app;
