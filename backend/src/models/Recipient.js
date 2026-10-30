'use strict';
const mongoose = require('mongoose');
const { uid } = require('../utils/crypto');

const recipientSchema = new mongoose.Schema(
  {
    _id: { type: String, default: uid },
    request_id: { type: String, ref: 'Request', required: true, index: true },
    email: { type: String, required: true },
    name: { type: String, required: true },
    role: { type: String, default: 'signer' }, // 'signer', 'viewer', 'approver'
    order: { type: Number, default: 1 },
    token_hash: { type: String, required: true, unique: true, index: true },
    status: {
      type: String,
      enum: ['pending', 'signed', 'declined'],
      default: 'pending',
      index: true,
    },
    expires_at: {
      type: Date,
      default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      index: true,
    },
    revoked: { type: Boolean, default: false },
    signed: { type: String, default: null },
    signature: { type: String, default: null },
    signature_type: { type: String, enum: ['type', 'draw', 'upload', 'none'], default: 'none' },
    ip_address: { type: String, default: null },
    user_agent: { type: String, default: null },
    consent_recorded: { type: Boolean, default: false },
    consent_at: { type: String, default: null },
    viewed_at: { type: String, default: null },
    last_reminder_sent: { type: Date, default: null },
    // Stores completed field values: { fieldId: value }
    field_values: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  {
    versionKey: false,
    toJSON: {
      virtuals: true,
      transform: (doc, ret) => {
        ret.id = ret._id;
        delete ret.token_hash; // Never expose token hash in API responses
        return ret;
      },
    },
  }
);

recipientSchema.virtual('id').get(function () {
  return this._id;
});

module.exports = mongoose.models.Recipient || mongoose.model('Recipient', recipientSchema);
