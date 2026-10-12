const mongoose = require('mongoose');

const contactSchema = new mongoose.Schema(
  {
    phone: String,
    whatsapp: String,
    email: String,
    website: String,
  },
  { _id: false }
);

const businessSchema = new mongoose.Schema(
  {
    tenant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    category: {
      type: String,
      enum: ['pharmacy', 'drugstore', 'store24', 'health', 'other'],
      default: 'other',
    },
    status: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active',
    },
    contact: { type: contactSchema, default: () => ({}) },
    settings: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    createdBy: { type: String, default: 'system' },
  },
  { timestamps: true }
);

businessSchema.index({ tenant: 1, category: 1 });

module.exports = mongoose.model('Business', businessSchema);

