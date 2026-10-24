'use strict';
const mongoose = require('mongoose');
const { uid, now } = require('../utils/crypto');

const userSchema = new mongoose.Schema(
  {
    _id: { type: String, default: uid },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    hash: { type: String, required: true },
    salt: { type: String, required: true },
    created: { type: String, default: now },
  },
  {
    versionKey: false,
    toJSON: {
      virtuals: true,
      transform: (doc, ret) => {
        ret.id = ret._id;
        delete ret.hash;
        delete ret.salt;
        return ret;
      },
    },
  }
);

userSchema.virtual('id').get(function () {
  return this._id;
});

module.exports = mongoose.models.User || mongoose.model('User', userSchema);
