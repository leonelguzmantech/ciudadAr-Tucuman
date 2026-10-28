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
    enum: ['pendiente_aprobacion', 'pendiente', 'en_proceso', 'resuelto', 'rechazado'],
    default: 'pendiente_aprobacion',
  },
  category: {
    type: String,
    enum: ['familias', 'persona', 'perros_gatos', 'reparaciones', 'cosas_perdidas'],
    default: 'persona',
  },
  visibility: {
    type: String,
    enum: ['public', 'tenant_only', 'private'],
    default: 'public',
  },
  createdBy: { type: String, default: 'anonimo' },
  resolvedAt: { type: Date, default: null },
  // Cuándo el admin aprobó el aviso (arranca el contador de vencimiento)
  aprobadoAt: { type: Date, default: null, index: true },
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
  // Celular de contacto (obligatorio en perros_gatos) para WhatsApp entre vecinos
  contacto: { type: String, default: '' },
  perdidaTipo: {
    type: String,
    enum: ['perdi', 'encontre', null],
    default: null,
  },
  objeto: { type: String, default: '' },
  avisadoAt: { type: Date, default: null },
  // Pedido de más datos al vecino (no cambia el estado del caso)
  pideDatosMensaje: { type: String, default: '' },
  pideDatosAt: { type: Date, default: null },
  // El vecino respondió; el admin aún no abrió la ficha
  respuestaDatosAt: { type: Date, default: null, index: true },
  // Historial permanente: última vez que el vecino respondió un pedido de datos
  ultimaRespuestaDatosAt: { type: Date, default: null },
  // Tras aprobar / respuesta: el admin aún no lo vio en Reportes / Cosas perdidas
  nuevoParaAdmin: { type: Boolean, default: false, index: true },
  // Cosas perdidas: abrieron el chat (habilita botones de cierre)
  chatAbiertoPor: [{ type: String, lowercase: true, trim: true }],
  // Confirmaciones de las partes (hace falta dueño + reclamante)
  confirmacionesPerdida: [{
    userId: { type: String, required: true, lowercase: true, trim: true },
    accion: { type: String, enum: ['recupere', 'devolvi'], required: true },
    createdAt: { type: Date, default: Date.now },
  }],
  // Borrado lógico: el caso sale del mapa pero queda en el registro
  eliminadoAt: { type: Date, default: null, index: true },
  eliminadoPor: { type: String, default: null },
  motivoEliminacion: { type: String, default: '' },
  claims: [{
    userId: { type: String, required: true },
    nombre: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now },
  }],
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
