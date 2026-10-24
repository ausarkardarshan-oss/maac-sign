'use strict';
const mongoose = require('mongoose');
const { uid, now } = require('../utils/crypto');

const notificationSchema = new mongoose.Schema(
  {
    _id: { type: String, default: uid },
    user_id: { type: String, ref: 'User', required: true, index: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    type: {
      type: String,
      enum: ['document', 'signing', 'request', 'template', 'signform', 'system'],
      default: 'document',
    },
    link: { type: String, default: '/documents' },
    read: { type: Boolean, default: false },
    created: { type: String, default: now },
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

notificationSchema.virtual('id').get(function () {
  return this._id;
});

module.exports = mongoose.models.Notification || mongoose.model('Notification', notificationSchema);
