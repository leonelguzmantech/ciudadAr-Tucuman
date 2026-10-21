const mongoose = require('mongoose');

const tenantSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    // Código oficial INDEC/IGN (ej: '90' Tucumán, '900133' Yerba Buena)
    code: { type: String, trim: true, index: true },
    type: {
      type: String,
      enum: ['province', 'municipality', 'commune'],
      default: 'municipality',
    },
    parent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      default: null,
    },
    // Límite geográfico en formato GeoJSON (Polygon o MultiPolygon)
    boundary: {
      type: { type: String, enum: ['Polygon', 'MultiPolygon'] },
      coordinates: { type: Array },
    },
    // Emails de quienes administran los reportes de esta jurisdicción
    admins: [{ type: String, lowercase: true, trim: true }],
    status: {
      type: String,
      enum: ['active', 'inactive', 'pending'],
      default: 'active',
    },
    contactEmail: { type: String, trim: true },
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

tenantSchema.index({ boundary: '2dsphere' });

module.exports = mongoose.model('Tenant', tenantSchema);
