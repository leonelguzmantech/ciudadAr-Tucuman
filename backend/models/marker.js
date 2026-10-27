// backend/models/Marker.js
const mongoose = require('mongoose');

const markerSchema = new mongoose.Schema({
  // Municipio o comuna donde cae el reporte (o la provincia si no cae en ninguno)
  tenant: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    index: true,
    default: null,
  },
  province: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    index: true,
    default: null,
  },
  lat: { type: Number, required: true },
  lng: { type: Number, required: true },
  image: {
    data: Buffer,
    contentType: String,
  },
  imageUrl: { type: String, default: '' },
  date: { type: String },        // Fecha del marcador
  time: { type: String },        // Hora del marcador
  description: { type: String }, // Descripción del marcador
  direccion: { type: String, default: '' }, // Dirección del punto (auto o manual)
  status: {
    type: String,
    enum: ['pendiente_aprobacion', 'pendiente', 'en_proceso', 'resuelto'],
    default: 'pendiente_aprobacion',
  },
  category: {
    type: String,
    enum: ['familias', 'persona', 'perros_gatos', 'reparaciones'],
    default: 'persona',
  },
  visibility: {
    type: String,
    enum: ['public', 'tenant_only', 'private'],
    default: 'public',
  },
  createdBy: { type: String, default: 'anonimo' },
  resolvedAt: { type: Date, default: null },
  caseId: { type: Number, unique: true }, // ID único del caso
  resolvedBy: { type: String, default: null }, // Usuario que reportó la resolución
  resolvedByReportedAt: { type: Date, default: null }, // Fecha del reporte de resolución
  resolutionDescription: { type: String, default: '' }, // Qué hizo el vecino para resolverlo
  resolutionImage: {
    data: Buffer,
    contentType: String,
  },
  resolutionImageUrl: { type: String, default: '' },
  sensed: { type: Boolean, default: false },
  familiasTipo: {
    type: String,
    enum: ['violencia', 'hijos', 'calle', null],
    default: null,
  },
  animalTipo: {
    type: String,
    enum: ['abandonado', 'perdido', 'adopcion', null],
    default: null,
  },
  avisadoAt: { type: Date, default: null },
  confirmations: [{
    userId: { type: String, required: true },
    description: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now },
    image: {
      data: Buffer,
      contentType: String,
    },
    imageUrl: { type: String, default: '' },
  }],
}, { timestamps: true });

module.exports = mongoose.model('Marker', markerSchema);
