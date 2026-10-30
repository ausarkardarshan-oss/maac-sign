'use strict';
const mongoose = require('mongoose');
const { uid, now } = require('../utils/crypto');

const requestSchema = new mongoose.Schema(
  {
    _id: { type: String, default: uid },
    document_id: { type: String, ref: 'Document', required: true, index: true },
    owner_id: { type: String, ref: 'User', required: true, index: true },
    subject: { type: String, required: true },
    message: { type: String, default: '' },
    sequential_signing: { type: Boolean, default: false },
    status: {
      type: String,
      enum: ['draft', 'pending', 'completed', 'recalled'],
      default: 'draft',
      index: true,
    },
    created: { type: String, default: now },
    completed: { type: String, default: null },
    cancelled_at: { type: String, default: null },
    cancellation_reason: { type: String, default: null },
    completion_notified: { type: Boolean, default: false },
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

requestSchema.virtual('id').get(function () {
  return this._id;
});

module.exports = mongoose.models.Request || mongoose.model('Request', requestSchema);
