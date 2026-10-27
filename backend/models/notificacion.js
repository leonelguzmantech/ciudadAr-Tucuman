const mongoose = require('mongoose');

const notificacionSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    index: true,
  },
  markerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Marker',
    default: null,
  },
  caseId: { type: Number, default: null },
  tipo: {
    type: String,
    enum: ['aprobado', 'estado', 'avisado'],
    required: true,
  },
  mensaje: { type: String, required: true, trim: true },
  leida: { type: Boolean, default: false, index: true },
}, { timestamps: true });

module.exports = mongoose.model('Notificacion', notificacionSchema);
