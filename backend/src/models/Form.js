'use strict';
const mongoose = require('mongoose');
const { uid, now } = require('../utils/crypto');

const formSchema = new mongoose.Schema(
  {
    _id: { type: String, default: uid },
    owner_id: { type: String, ref: 'User', required: true, index: true },
    name: { type: String, required: true },
    document_id: { type: String, ref: 'Document', required: true },
    enabled: { type: Number, default: 1 },
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

formSchema.virtual('id').get(function () {
  return this._id;
});

module.exports = mongoose.models.Form || mongoose.model('Form', formSchema);
