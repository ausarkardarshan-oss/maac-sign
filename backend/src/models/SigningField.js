'use strict';
const mongoose = require('mongoose');
const { uid } = require('../utils/crypto');

/**
 * A signing field definition placed on a specific page of a document.
 * Positions are normalized [0..1] relative to page width/height so they
 * remain correct regardless of zoom level or screen size.
 */
const signingFieldSchema = new mongoose.Schema(
  {
    _id: { type: String, default: uid },
    request_id: { type: String, ref: 'Request', required: true, index: true },
    document_id: { type: String, ref: 'Document', required: true, index: true },
    recipient_id: { type: String, ref: 'Recipient', default: null, index: true },
    page: { type: Number, required: true, min: 1 },
    type: {
      type: String,
      enum: [
        'signature',
        'initials',
        'initial',
        'stamp',
        'image',
        'company',
        'name',
        'full_name',
        'email',
        'date_signed',
        'sign_date',
        'date',
        'text',
        'title',
        'job_title',
        'checkbox',
        'dropdown',
        'radio',
        'checkbox_group',
      ],
      required: true,
    },
    // Normalized coordinates [0..1] relative to page dimensions
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    width: { type: Number, required: true },
    height: { type: Number, required: true },
    required: { type: Boolean, default: true },
    label: { type: String, default: null },
    // Filled in by recipient
    value: { type: String, default: null },
    completed: { type: Boolean, default: false },
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

signingFieldSchema.virtual('id').get(function () {
  return this._id;
});

module.exports = mongoose.models.SigningField || mongoose.model('SigningField', signingFieldSchema);
