const mongoose = require('mongoose');

const tenantSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    type: {
      type: String,
      enum: ['municipality', 'business', 'hybrid'],
      default: 'municipality',
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'pending'],
      default: 'active',
    },
    contactEmail: { type: String, trim: true },
    billingPlan: {
      type: String,
      enum: ['free', 'pro', 'enterprise'],
      default: 'free',
    },
    settings: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

tenantSchema.index({ slug: 1 }, { unique: true });

module.exports = mongoose.model('Tenant', tenantSchema);

