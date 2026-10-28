const mongoose = require('mongoose');

const chatMensajeSchema = new mongoose.Schema({
  markerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Marker',
    required: true,
    index: true,
  },
  userId: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
  },
  nombre: { type: String, default: '' },
  texto: { type: String, default: '', trim: true, maxlength: 1000 },
  image: {
    data: Buffer,
    contentType: String,
  },
  tieneImagen: { type: Boolean, default: false },
}, { timestamps: true });

chatMensajeSchema.index({ markerId: 1, createdAt: 1 });

module.exports = mongoose.model('ChatMensaje', chatMensajeSchema);
