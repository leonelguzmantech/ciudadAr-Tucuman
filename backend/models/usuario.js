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
  // Última ubicación GPS del vecino (para avisos "cerca de mí")
  ultimaLat: { type: Number, default: null },
  ultimaLng: { type: Number, default: null },
  ubicacionAt: { type: Date, default: null },
  // Zona elegida en el mapa (si se perdió / busca en otra parte)
  zonaAlertaLat: { type: Number, default: null },
  zonaAlertaLng: { type: Number, default: null },
  zonaAlertaRadio: { type: Number, default: 2500 },
  zonaAlertaAt: { type: Date, default: null },
}, { timestamps: true });

module.exports = mongoose.model('Usuario', usuarioSchema);
