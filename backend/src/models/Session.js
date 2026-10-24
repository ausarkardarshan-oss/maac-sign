'use strict';
const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true }, // token_hash
    user_id: { type: String, ref: 'User', required: true, index: true },
    expires: { type: Date, required: true, index: { expires: 0 } }, // MongoDB TTL auto-expires
  },
  {
    versionKey: false,
  }
);

module.exports = mongoose.models.Session || mongoose.model('Session', sessionSchema);
