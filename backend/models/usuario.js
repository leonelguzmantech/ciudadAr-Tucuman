const mongoose = require('mongoose');

const usuarioSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },
  nombre: { type: String, default: '', trim: true },
  telefono: { type: String, default: '', trim: true },
  proveedor: {
    type: String,
    enum: ['correo', 'google'],
    default: 'correo',
  },
}, { timestamps: true });

module.exports = mongoose.model('Usuario', usuarioSchema);
