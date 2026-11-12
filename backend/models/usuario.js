const mongoose = require('mongoose');

const usuarioSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },
  // Nombre y apellido (identidad básica ante spam / cuentas falsas)
  nombre: { type: String, default: '', trim: true },
  // DNI argentino (7–8 dígitos). Único para evitar varias cuentas con el mismo documento.
  dni: {
    type: String,
    default: '',
    trim: true,
    index: {
      unique: true,
      partialFilterExpression: { dni: { $type: 'string', $gt: '' } },
    },
  },
  telefono: { type: String, default: '', trim: true },
  // Confirmación del celular por código OTP
  telefonoConfirmado: { type: Boolean, default: false, index: true },
  telefonoConfirmadoAt: { type: Date, default: null },
  telefonoCodigoHash: { type: String, default: '' },
  telefonoCodigoExpira: { type: Date, default: null },
  telefonoCodigoEnviadoAt: { type: Date, default: null },
  // Fotos del DNI (frente y dorso) — evidencia para el admin municipal
  dniFotoFrente: {
    data: Buffer,
    contentType: String,
  },
  dniFotoDorso: {
    data: Buffer,
    contentType: String,
  },
  dniFotosAt: { type: Date, default: null },
  proveedor: {
    type: String,
    enum: ['correo', 'google'],
    default: 'correo',
  },
  // Municipio/comuna de residencia (elegido en el registro; rutea soporte)
  municipioTenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    default: null,
    index: true,
  },
  municipioNombre: { type: String, default: '', trim: true },
  // true = eligió “aún no está activo / no figura”; soporte va al super
  municipioPendiente: { type: Boolean, default: false, index: true },
  // Cuenta habilitada (desactivar desde panel Usuarios, sin entrar a Firebase)
  activo: { type: Boolean, default: true, index: true },
  desactivadoAt: { type: Date, default: null },
  desactivadoPor: { type: String, default: '', trim: true },
  desactivadoNota: { type: String, default: '', trim: true },
  // Pedido de soporte para corregir un dato de identidad
  soporteEstado: {
    type: String,
    enum: ['', 'pendiente', 'reseteado', 'rechazado'],
    default: '',
    index: true,
  },
  // Campo que el vecino quiere corregir: nombre | dni | fotos | municipio
  soporteCampo: {
    type: String,
    enum: ['', 'nombre', 'dni', 'fotos', 'municipio'],
    default: '',
    index: true,
  },
  soporteMensaje: { type: String, default: '', trim: true },
  // Municipio/comuna al que el vecino pide soporte (ruteo al admin correspondiente)
  soporteTenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    default: null,
    index: true,
  },
  soporteTenantName: { type: String, default: '', trim: true },
  soporteAt: { type: Date, default: null },
  soporteResueltoAt: { type: Date, default: null },
  soporteResueltoPor: { type: String, default: '', trim: true },
  soporteNotaAdmin: { type: String, default: '', trim: true },
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
