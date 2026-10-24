'use strict';
const mongoose = require('mongoose');
const { uid, now } = require('../utils/crypto');

const auditSchema = new mongoose.Schema(
  {
    _id: { type: String, default: uid },
    document_id: { type: String, ref: 'Document', required: true, index: true },
    actor: { type: String, required: true },
    action: { type: String, required: true },
    details: { type: String, default: '{}' },
    at: { type: String, default: now },
    previous_hash: { type: String, default: '' },
    entry_hash: { type: String, required: true },
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

auditSchema.virtual('id').get(function () {
  return this._id;
});

module.exports = mongoose.models.Audit || mongoose.model('Audit', auditSchema);
