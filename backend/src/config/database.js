'use strict';
const mongoose = require('mongoose');
const path = require('node:path');
const fs = require('node:fs');
const env = require('./env');

const STORAGE_DIR = path.join(__dirname, '../../storage/documents');
fs.mkdirSync(STORAGE_DIR, { recursive: true });
fs.mkdirSync(path.join(__dirname, '../../storage/temporary'), { recursive: true });

async function connectDB(uri = env.MONGODB_URI) {
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }
  try {
    await mongoose.connect(uri);
    console.log(`✦ MongoDB Connected: ${mongoose.connection.host}/${mongoose.connection.name}`);
    return mongoose.connection;
  } catch (err) {
    console.error('Failed to connect to MongoDB:', err.message);
    throw err;
  }
}

async function disconnectDB() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}

module.exports = { connectDB, disconnectDB, STORAGE_DIR, mongoose };
