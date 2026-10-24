'use strict';
const mongoose = require('mongoose');
const { uid, now } = require('../utils/crypto');

const certificateSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => `CERT-${uid()}` },
    document_id: { type: String, ref: 'Document', required: true, index: true },
    request_id: { type: String, ref: 'Request', required: true, index: true },
    document_name: { type: String, required: true },
    original_sha256: { type: String, required: true },
    final_sha256: { type: String, required: true },
    filename: { type: String, required: true },
    sha256: { type: String, required: true },
    signers: [
      {
        recipient_id: String,
        name: String,
        email: String,
        signed_at: String,
        ip_address: String,
        user_agent: String,
        signature_type: String,
        consent_recorded: Boolean,
      },
    ],
    audit_events: { type: Array, default: [] },
    created_at: { type: String, default: now },
    digital_signature: {
      signed: { type: Boolean, default: false },
      signer: { type: String, default: null },
      algorithm: { type: String, default: null },
      timestamp: { type: String, default: null },
    },
  },
  {
    versionKey: false,
    toJSON: {
      virtuals: true,
      transform: (doc, ret) => {
        ret.id = ret._id;
        return ret;
      },
    },
  }
);

certificateSchema.virtual('id').get(function () {
  return this._id;
});

module.exports = mongoose.models.Certificate || mongoose.model('Certificate', certificateSchema);
