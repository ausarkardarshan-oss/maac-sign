'use strict';
const mongoose = require('mongoose');
const { uid, now } = require('../utils/crypto');

const documentSchema = new mongoose.Schema(
  {
    _id: { type: String, default: uid },
    owner_id: { type: String, ref: 'User', required: true, index: true },
    name: { type: String, required: true },
    filename: { type: String, required: true },
    mime: { type: String, default: 'application/pdf' },
    sha256: { type: String, required: true },
    status: {
      type: String,
      enum: ['draft', 'in_progress', 'completed', 'recalled', 'declined'],
      default: 'draft',
      index: true,
    },
    signed_filename: { type: String, default: null },
    final_sha256: { type: String, default: null },
    certificate_id: { type: String, ref: 'Certificate', default: null },
    completed_at: { type: String, default: null },
    created: { type: String, default: now },
    updated: { type: String, default: now },
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

documentSchema.virtual('id').get(function () {
  return this._id;
});

module.exports = mongoose.models.Document || mongoose.model('Document', documentSchema);
