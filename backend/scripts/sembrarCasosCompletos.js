/**
 * Inyección completa de casos de prueba (todas las categorías / estados / colas)
 * con fotos PNG visibles embebidas.
 *
 * Uso (desde backend/):
 *   node scripts/borrarCasos.js --si          # opcional: limpia casos/chats/notifs
 *   node scripts/sembrarCasosCompletos.js     # exige base sin casos
 *   node scripts/sembrarCasosCompletos.js --agregar
 *   node scripts/sembrarCasosCompletos.js --agregar --solo-smt-talitas
 *     → solo San Miguel de Tucumán y Las Talitas (sin Yerba Buena ni fuera de límites)
 *
 * npm:
 *   npm run seed:completo
 *   npm run seed:completo -- --agregar
 *   npm run seed:completo:smt-talitas
 */
require('dotenv').config();
const zlib = require('zlib');
const mongoose = require('mongoose');
const Marker = require('../models/marker');
const Usuario = require('../models/usuario');
const ChatMensaje = require('../models/chatMensaje');
const { findJurisdictionForPoint } = require('../utils/jurisdictions');

const MARCA = 'SEED-COMPLETO';
const VECINOS = [
  'vecino.demo.1@ciudadar.test',
  'vecino.demo.2@ciudadar.test',
  'vecino.demo.3@ciudadar.test',
];
const ADMIN_LOCAL = 'admin.demo@ciudadar.test';
const OPERARIO = 'operario.demo@ciudadar.test';

const COLORES = {
  rojo: [220, 38, 38],
  verde: [22, 163, 74],
  azul: [37, 99, 235],
  amarillo: [202, 138, 4],
  gris: [100, 116, 139],
  naranja: [234, 88, 12],
  violeta: [124, 58, 237],
};

/** CRC32 para chunks PNG */
const crcTabla = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) c = crcTabla[(c ^ buf[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const pngChunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type);
  const td = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};

/** PNG RGB sólido visible en tarjetas (~180×120) */
const pngSolido = (rgb, w = 180, h = 120) => {
  const [r, g, b] = rgb;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y += 1) {
    const row = y * (w * 3 + 1);
    raw[row] = 0;
    // Franja superior más clara (para que no parezca un pixel)
    const factor = y < 18 ? 1.25 : (y > h - 18 ? 0.75 : 1);
    const rr = Math.min(255, Math.round(r * factor));
    const gg = Math.min(255, Math.round(g * factor));
    const bb = Math.min(255, Math.round(b * factor));
    for (let x = 0; x < w; x += 1) {
      const i = row + 1 + x * 3;
      raw[i] = rr;
      raw[i + 1] = gg;
      raw[i + 2] = bb;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
};

const foto = (tono = 'rojo') => ({
  data: pngSolido(COLORES[tono] || COLORES.rojo),
  contentType: 'image/png',
});

const diasAtras = (dias, horas = 0) => {
  const fecha = new Date();
  fecha.setDate(fecha.getDate() - dias);
  if (horas) fecha.setHours(fecha.getHours() - horas);
  return fecha;
};
const fechaTexto = (fecha) => fecha.toISOString().slice(0, 10);
const horaTexto = (fecha) => fecha.toTimeString().slice(0, 5);

const getNextCaseId = async () => {
  const last = await Marker.findOne().sort({ caseId: -1 }).select('caseId');
  return last && typeof last.caseId === 'number' ? last.caseId + 1 : 1;
};

// Puntos en municipios conocidos + uno fuera
const P = {
  sm1: { lat: -26.8245, lng: -65.2227, direccion: 'San Martín 500, S.M. de Tucumán' },
  sm2: { lat: -26.8302, lng: -65.2048, direccion: 'Muñecas 200, S.M. de Tucumán' },
  sm3: { lat: -26.8088, lng: -65.2176, direccion: '24 de Septiembre 800, S.M. de Tucumán' },
  yb1: { lat: -26.8125, lng: -65.2950, direccion: 'Av. Aconquija 1200, Yerba Buena' },
  yb2: { lat: -26.8180, lng: -65.3025, direccion: 'Perú 450, Yerba Buena' },
  lt1: { lat: -26.7840, lng: -65.2005, direccion: 'Av. Perón, Las Talitas' },
  lt2: { lat: -26.7905, lng: -65.2055, direccion: 'Barrio Norte, Las Talitas' },
  fuera: { lat: -27.4500, lng: -65.6000, direccion: 'Punto fuera de límites (demo)' },
};

const USUARIOS = [
  {
    email: VECINOS[0],
    telefono: '3815551001',
    dni: '31000001',
    proveedor: 'correo',
    nombre: 'Ana Demo',
    telefonoConfirmado: true,
    telefonoConfirmadoAt: new Date(),
  },
  {
    email: VECINOS[1],
    telefono: '3815551002',
    dni: '31000002',
    proveedor: 'correo',
    nombre: 'Bruno Demo',
    telefonoConfirmado: true,
    telefonoConfirmadoAt: new Date(),
  },
  {
    email: VECINOS[2],
    telefono: '3815551003',
    dni: '31000003',
    proveedor: 'google',
    nombre: 'Carla Demo',
    telefonoConfirmado: true,
    telefonoConfirmadoAt: new Date(),
  },
  {
    email: ADMIN_LOCAL,
    telefono: '3815551999',
    dni: '31000099',
    proveedor: 'correo',
    nombre: 'Admin Demo',
    telefonoConfirmado: true,
    telefonoConfirmadoAt: new Date(),
  },
  {
    email: OPERARIO,
    telefono: '3815551888',
    dni: '31000088',
    proveedor: 'correo',
    nombre: 'Operario Demo',
    telefonoConfirmado: true,
    telefonoConfirmadoAt: new Date(),
  },
];

/**
 * Cada ítem cubre un flujo del producto actual.
 * tono → color de la foto principal.
 */
const definirCasos = () => [
  // ——— Por aprobar ———
  {
    ...P.sm1,
    category: 'reparaciones',
    status: 'pendiente_aprobacion',
    description: `${MARCA} Bache profundo — esperando aprobación.`,
    createdBy: VECINOS[0],
    tono: 'rojo',
    dias: 0,
  },
  {
    ...P.yb1,
    category: 'cosas_perdidas',
    perdidaTipo: 'perdi',
    objeto: 'Billetera negra',
    status: 'pendiente_aprobacion',
    description: `${MARCA} Perdí mi billetera cerca de la peatonal.`,
    createdBy: VECINOS[1],
    contacto: '3815551002',
    tono: 'azul',
    dias: 0,
  },
  {
    ...P.lt1,
    category: 'perros_gatos',
    animalTipo: 'abandonado',
    status: 'pendiente_aprobacion',
    description: `${MARCA} Perro abandonado flaco, sin collar.`,
    createdBy: VECINOS[2],
    contacto: '3815551003',
    tono: 'amarillo',
    dias: 1,
  },
  {
    ...P.lt1,
    lat: -26.7860,
    lng: -65.1980,
    category: 'familias',
    familiasTipo: 'calle',
    status: 'pendiente_aprobacion',
    visibility: 'private',
    description: `${MARCA} Persona en situación de calle — por aprobar.`,
    createdBy: VECINOS[0],
    tono: 'gris',
    dias: 0,
  },

  // ——— Reparaciones: Por atender / urgentes / proceso ———
  {
    ...P.sm2,
    category: 'reparaciones',
    status: 'pendiente',
    description: `${MARCA} Semáforo intermitente — varios vecinos confirmaron (urgente).`,
    createdBy: VECINOS[0],
    aprobadoAt: diasAtras(3),
    nuevoParaAdmin: true,
    tono: 'rojo',
    dias: 3,
    confirmations: [
      { userId: VECINOS[1], description: 'Lo vi hoy a la mañana.', tono: 'gris' },
      { userId: VECINOS[2], description: 'Sigue fallando en hora pico.', tono: 'naranja' },
    ],
  },
  {
    ...P.yb2,
    category: 'reparaciones',
    status: 'en_proceso',
    description: `${MARCA} Cordón roto — cuadrilla en proceso.`,
    createdBy: VECINOS[1],
    aprobadoAt: diasAtras(5),
    atendidoPor: OPERARIO,
    atendidoAt: diasAtras(2),
    tono: 'verde',
    dias: 5,
  },
  {
    ...P.sm3,
    category: 'reparaciones',
    status: 'pendiente',
    description: `${MARCA} Tapa de alcantarilla floja — respondió datos.`,
    createdBy: VECINOS[0],
    aprobadoAt: diasAtras(4),
    pideDatosMensaje: '¿Podés indicar entre qué calles exactas está?',
    pideDatosAt: diasAtras(2),
    respuestaDatosMensaje: 'Entre San Martín y Congreso, vereda impar.',
    respuestaDatosAt: diasAtras(1),
    ultimaRespuestaDatosAt: diasAtras(1),
    nuevoParaAdmin: true,
    tono: 'azul',
    tonoRespuesta: 'azul',
    dias: 4,
  },
  {
    ...P.lt2,
    category: 'reparaciones',
    status: 'en_proceso',
    description: `${MARCA} Pozo — vecino pidió cierre (resolución).`,
    createdBy: VECINOS[2],
    aprobadoAt: diasAtras(10),
    resolvedBy: VECINOS[2],
    resolvedByReportedAt: diasAtras(1),
    resolutionDescription: 'La cuadrilla tapó el pozo ayer a la tarde.',
    tonoResolucion: 'verde',
    tono: 'gris',
    dias: 10,
  },
  {
    ...P.sm3,
    lat: -26.8095,
    lng: -65.2190,
    category: 'reparaciones',
    status: 'pendiente_cierre',
    description: `${MARCA} Vereda rota — cuadrilla propuso cierre.`,
    createdBy: VECINOS[0],
    aprobadoAt: diasAtras(8),
    atendidoPor: OPERARIO,
    atendidoAt: diasAtras(3),
    cierrePropuestoPor: OPERARIO,
    cierrePropuestoAt: diasAtras(1),
    resolutionDescription: 'Se rellenó y compactó el tramo.',
    tonoResolucion: 'verde',
    nuevoParaAdmin: true,
    tono: 'verde',
    dias: 8,
  },
  // Aviso a cuadrilla (solo mensaje; sigue en Por atender)
  {
    ...P.sm1,
    lat: -26.8230,
    lng: -65.2200,
    category: 'reparaciones',
    status: 'pendiente',
    description: `${MARCA} Bache urgente — admin avisó a cuadrilla (sin sacar de cola).`,
    createdBy: VECINOS[1],
    aprobadoAt: diasAtras(2),
    notaCuadrilla: 'Priorizar este caso mañana temprano.',
    notaCuadrillaAt: diasAtras(0, 3),
    notaCuadrillaPor: ADMIN_LOCAL,
    nuevoParaAdmin: false,
    tono: 'naranja',
    dias: 2,
  },
  // Omitido → Reparaciones → Omitidos
  {
    ...P.yb1,
    lat: -26.8115,
    lng: -65.2920,
    category: 'reparaciones',
    status: 'pendiente',
    description: `${MARCA} Luminaria — omitido (Reparaciones → Omitidos).`,
    createdBy: VECINOS[2],
    aprobadoAt: diasAtras(6),
    colaAdminAt: diasAtras(1),
    motivoCola: 'omitido',
    nuevoParaAdmin: false,
    tono: 'violeta',
    dias: 6,
  },
  // Legacy diferido con motivo cuadrilla → hoy aparece en Omitidos
  {
    ...P.lt1,
    lat: -26.7830,
    lng: -65.2020,
    category: 'reparaciones',
    status: 'pendiente',
    description: `${MARCA} Cordón — diferido legacy (Omitidos).`,
    createdBy: VECINOS[0],
    aprobadoAt: diasAtras(7),
    colaAdminAt: diasAtras(2),
    motivoCola: 'cuadrilla',
    notaCuadrilla: 'Confirmen si ya fue reparado.',
    notaCuadrillaAt: diasAtras(2),
    notaCuadrillaPor: ADMIN_LOCAL,
    tono: 'amarillo',
    dias: 7,
  },

  // ——— Animales ———
  {
    ...P.sm1,
    lat: -26.8260,
    lng: -65.2180,
    category: 'perros_gatos',
    animalTipo: 'perdido',
    status: 'pendiente',
    description: `${MARCA} Gato atigrado perdido, collar rojo.`,
    createdBy: VECINOS[1],
    contacto: '3815551002',
    aprobadoAt: diasAtras(2),
    nuevoParaAdmin: true,
    tono: 'amarillo',
    dias: 2,
  },
  {
    ...P.yb1,
    lat: -26.8140,
    lng: -65.2910,
    category: 'perros_gatos',
    animalTipo: 'adopcion',
    status: 'pendiente',
    description: `${MARCA} Cachorro en adopción, dócil y vacunado.`,
    createdBy: VECINOS[0],
    contacto: '3815551001',
    aprobadoAt: diasAtras(1),
    tono: 'verde',
    dias: 1,
  },
  {
    ...P.sm2,
    lat: -26.8290,
    lng: -65.2080,
    category: 'perros_gatos',
    animalTipo: 'abandonado',
    status: 'pendiente',
    description: `${MARCA} Perro abandonado — sin avisar oficina (Reportes).`,
    createdBy: VECINOS[1],
    contacto: '3815551002',
    aprobadoAt: diasAtras(1),
    nuevoParaAdmin: true,
    tono: 'amarillo',
    dias: 1,
  },
  {
    ...P.yb2,
    lat: -26.8175,
    lng: -65.3010,
    category: 'perros_gatos',
    animalTipo: 'abandonado',
    status: 'pendiente',
    description: `${MARCA} Gato abandonado — oficina avisada (Animales nuevo).`,
    createdBy: VECINOS[2],
    contacto: '3815551003',
    aprobadoAt: diasAtras(3),
    avisadoAt: diasAtras(1),
    nuevoParaAdmin: false,
    nuevoDerivadoParaAdmin: true,
    tono: 'gris',
    dias: 3,
  },
  {
    ...P.lt1,
    lat: -26.7855,
    lng: -65.1995,
    category: 'perros_gatos',
    animalTipo: 'abandonado',
    status: 'en_proceso',
    description: `${MARCA} Perro flaco — Animales ya visto.`,
    createdBy: VECINOS[0],
    contacto: '3815551001',
    aprobadoAt: diasAtras(6),
    avisadoAt: diasAtras(4),
    nuevoParaAdmin: false,
    nuevoDerivadoParaAdmin: false,
    tono: 'naranja',
    dias: 6,
  },

  // ——— Reportes: familias ———
  {
    ...P.sm2,
    lat: -26.8285,
    lng: -65.2100,
    category: 'familias',
    familiasTipo: 'violencia',
    status: 'pendiente',
    visibility: 'private',
    description: `${MARCA} Alerta confidencial — Reportes Por atender.`,
    createdBy: VECINOS[2],
    aprobadoAt: diasAtras(1),
    nuevoParaAdmin: true,
    tono: 'rojo',
    dias: 1,
  },
  // Omitido → Reportes → Omitidos
  {
    ...P.sm3,
    lat: -26.8075,
    lng: -65.2160,
    category: 'familias',
    familiasTipo: 'hijos',
    status: 'pendiente',
    visibility: 'private',
    description: `${MARCA} Familia — omitido (Reportes → Omitidos).`,
    createdBy: VECINOS[1],
    aprobadoAt: diasAtras(4),
    colaAdminAt: diasAtras(1, 2),
    motivoCola: 'omitido',
    nuevoParaAdmin: false,
    tono: 'violeta',
    dias: 4,
  },
  {
    ...P.yb1,
    lat: -26.8130,
    lng: -65.2935,
    category: 'familias',
    familiasTipo: 'hijos',
    status: 'pendiente',
    visibility: 'private',
    description: `${MARCA} Familia — oficina avisada (Registro).`,
    createdBy: VECINOS[1],
    aprobadoAt: diasAtras(4),
    avisadoAt: diasAtras(2),
    eliminadoAt: diasAtras(2),
    eliminadoPor: ADMIN_LOCAL,
    motivoEliminacion: 'Oficina correspondiente avisada',
    tono: 'azul',
    dias: 4,
  },

  // ——— Cosas perdidas ———
  {
    ...P.sm3,
    lat: -26.8110,
    lng: -65.2140,
    category: 'cosas_perdidas',
    perdidaTipo: 'encontre',
    objeto: 'Llaves con llavero azul',
    status: 'pendiente',
    description: `${MARCA} Encontré llaves en la plaza — chat abierto.`,
    createdBy: VECINOS[0],
    contacto: '3815551001',
    aprobadoAt: diasAtras(3),
    nuevoParaAdmin: true,
    claims: [
      { userId: VECINOS[1], nombre: 'Bruno Demo', createdAt: diasAtras(2) },
    ],
    chatAbiertoPor: [VECINOS[0], VECINOS[1]],
    conChat: true,
    tono: 'azul',
    dias: 3,
  },
  {
    ...P.yb2,
    lat: -26.8165,
    lng: -65.2990,
    category: 'cosas_perdidas',
    perdidaTipo: 'perdi',
    objeto: 'Documento DNI',
    status: 'pendiente',
    description: `${MARCA} Perdí DNI — ambas partes confirmaron.`,
    createdBy: VECINOS[2],
    contacto: '3815551003',
    aprobadoAt: diasAtras(6),
    claims: [
      { userId: VECINOS[1], nombre: 'Bruno Demo', createdAt: diasAtras(5) },
    ],
    chatAbiertoPor: [VECINOS[2], VECINOS[1]],
    confirmacionesPerdida: [
      { userId: VECINOS[2], accion: 'recupere', createdAt: diasAtras(1) },
      { userId: VECINOS[1], accion: 'devolvi', createdAt: diasAtras(1) },
    ],
    tono: 'amarillo',
    dias: 6,
  },

  // ——— Registro ———
  {
    ...P.sm1,
    lat: -26.8220,
    lng: -65.2250,
    category: 'reparaciones',
    status: 'resuelto',
    description: `${MARCA} Luminaria reparada — Registro.`,
    createdBy: VECINOS[0],
    aprobadoAt: diasAtras(20),
    resolvedAt: diasAtras(2),
    eliminadoAt: diasAtras(2),
    eliminadoPor: ADMIN_LOCAL,
    motivoEliminacion: 'Cierre: resuelto por el municipio',
    tono: 'verde',
    tonoResolucion: 'verde',
    resolutionDescription: 'Se cambió la lámpara LED.',
    dias: 20,
  },
  {
    ...P.yb1,
    lat: -26.8100,
    lng: -65.2975,
    category: 'reparaciones',
    status: 'rechazado',
    description: `${MARCA} Reporte duplicado — anulado.`,
    createdBy: VECINOS[1],
    eliminadoAt: diasAtras(3),
    eliminadoPor: ADMIN_LOCAL,
    motivoEliminacion: 'Anulado: caso duplicado',
    tono: 'gris',
    dias: 5,
  },
  {
    ...P.lt2,
    lat: -26.7880,
    lng: -65.2030,
    category: 'cosas_perdidas',
    perdidaTipo: 'encontre',
    objeto: 'Paraguas',
    status: 'rechazado',
    description: `${MARCA} Aviso vencido — Registro.`,
    createdBy: VECINOS[2],
    aprobadoAt: diasAtras(40),
    eliminadoAt: diasAtras(1),
    eliminadoPor: 'sistema',
    motivoEliminacion: 'Baja por vencimiento automático',
    tono: 'gris',
    dias: 40,
  },

  // ——— Sin jurisdicción ———
  {
    ...P.fuera,
    category: 'reparaciones',
    status: 'pendiente_aprobacion',
    description: `${MARCA} Reporte fuera de límites — Sin jurisdicción.`,
    createdBy: VECINOS[0],
    forzarSinTenant: true,
    tono: 'rojo',
    dias: 0,
  },
];

async function asegurarUsuarios() {
  for (const usuario of USUARIOS) {
    await Usuario.findOneAndUpdate(
      { email: usuario.email },
      { $set: usuario },
      { upsert: true, new: true }
    );
  }
  console.log(`Usuarios demo: ${USUARIOS.length}`);
}

async function crearCaso(def, caseId) {
  const creado = diasAtras(def.dias || 0);
  let tenant = null;
  let province = null;
  if (!def.forzarSinTenant) {
    const j = await findJurisdictionForPoint(def.lat, def.lng);
    tenant = j.tenant;
    province = j.province;
  }

  const img = foto(def.tono || 'rojo');
  const doc = {
    tenant,
    province,
    lat: def.lat,
    lng: def.lng,
    direccion: def.direccion || '',
    date: fechaTexto(creado),
    time: horaTexto(creado),
    description: def.description,
    status: def.status,
    category: def.category,
    visibility: def.visibility || 'public',
    createdBy: def.createdBy,
    caseId,
    familiasTipo: def.familiasTipo || null,
    animalTipo: def.animalTipo || null,
    perdidaTipo: def.perdidaTipo || null,
    objeto: def.objeto || '',
    contacto: def.contacto || '',
    aprobadoAt: def.aprobadoAt || null,
    resolvedAt: def.resolvedAt || null,
    resolvedBy: def.resolvedBy || null,
    resolvedByReportedAt: def.resolvedByReportedAt || null,
    resolutionDescription: def.resolutionDescription || '',
    avisadoAt: def.avisadoAt || null,
    pideDatosMensaje: def.pideDatosMensaje || '',
    pideDatosAt: def.pideDatosAt || null,
    respuestaDatosMensaje: def.respuestaDatosMensaje || '',
    respuestaDatosAt: def.respuestaDatosAt || null,
    ultimaRespuestaDatosAt: def.ultimaRespuestaDatosAt || null,
    nuevoParaAdmin: !!def.nuevoParaAdmin,
    nuevoDerivadoParaAdmin: !!def.nuevoDerivadoParaAdmin,
    atendidoPor: def.atendidoPor || null,
    atendidoAt: def.atendidoAt || null,
    cierrePropuestoPor: def.cierrePropuestoPor || null,
    cierrePropuestoAt: def.cierrePropuestoAt || null,
    notaCuadrilla: def.notaCuadrilla || '',
    notaCuadrillaAt: def.notaCuadrillaAt || null,
    notaCuadrillaPor: def.notaCuadrillaPor || null,
    colaAdminAt: def.colaAdminAt || null,
    motivoCola: def.motivoCola || null,
    eliminadoAt: def.eliminadoAt || null,
    eliminadoPor: def.eliminadoPor || null,
    motivoEliminacion: def.motivoEliminacion || '',
    claims: def.claims || [],
    chatAbiertoPor: def.chatAbiertoPor || [],
    confirmacionesPerdida: def.confirmacionesPerdida || [],
    confirmations: (def.confirmations || []).map((c) => {
      const cImg = foto(c.tono || 'gris');
      return {
        userId: c.userId,
        description: c.description || '',
        createdAt: diasAtras(1),
        image: cImg,
        imageUrl: '',
      };
    }),
    image: img,
    imageUrl: '',
    createdAt: creado,
    updatedAt: creado,
  };

  if (def.tonoResolucion || def.resolutionDescription) {
    doc.resolutionImage = foto(def.tonoResolucion || 'verde');
  }
  if (def.respuestaDatosAt || def.respuestaDatosMensaje) {
    doc.respuestaDatosImage = foto(def.tonoRespuesta || def.tono || 'azul');
  }

  const marker = await Marker.create(doc);
  marker.imageUrl = `/api/markers/${marker._id}/image`;
  if (marker.resolutionImage?.data) {
    marker.resolutionImageUrl = `/api/markers/${marker._id}/resolution-image`;
  }
  if (marker.respuestaDatosImage?.data) {
    marker.respuestaDatosImageUrl = `/api/markers/${marker._id}/respuesta-datos-image`;
  }
  if (marker.confirmations?.length) {
    marker.confirmations = marker.confirmations.map((c, idx) => {
      const plain = c.toObject ? c.toObject() : c;
      return {
        ...plain,
        imageUrl: `/api/markers/${marker._id}/confirmations/${idx}/image`,
      };
    });
  }
  await marker.save();

  if (def.conChat) {
    await ChatMensaje.create([
      {
        markerId: marker._id,
        userId: VECINOS[0],
        nombre: 'Ana Demo',
        texto: 'Hola, encontré las llaves en un banco de la plaza.',
      },
      {
        markerId: marker._id,
        userId: VECINOS[1],
        nombre: 'Bruno Demo',
        texto: '¡Son mías! ¿Podemos coincidir esta tarde?',
      },
      {
        markerId: marker._id,
        userId: VECINOS[0],
        nombre: 'Ana Demo',
        texto: 'Dale, te espero a las 18 hs en la entrada.',
        image: foto('azul'),
        tieneImagen: true,
      },
    ]);
  }

  const lugar = tenant ? 'con municipio' : 'SIN jurisdicción';
  const cola = def.motivoCola ? ` · cola=${def.motivoCola}` : '';
  console.log(`  #${caseId} ${def.category}/${def.status}${cola} — ${lugar}`);
  return marker;
}

/** Remapea Yerba Buena → SM / Las Talitas y omite “fuera de límites”. */
const filtrarSoloSmtTalitas = (defs) => {
  // Puntos propios (no reutilizar coords de P.sm*/lt* para no apilar pines)
  const altSm = [
    { lat: -26.8218, lng: -65.2260, direccion: 'San Juan 400, S.M. de Tucumán' },
    { lat: -26.8275, lng: -65.2110, direccion: 'Laprida 350, S.M. de Tucumán' },
    { lat: -26.8142, lng: -65.2205, direccion: 'Córdoba 600, S.M. de Tucumán' },
    { lat: -26.8190, lng: -65.2080, direccion: 'Congreso 300, S.M. de Tucumán' },
    { lat: -26.8330, lng: -65.2165, direccion: 'Mate de Luna 1000, S.M. de Tucumán' },
  ];
  const altLt = [
    { lat: -26.7815, lng: -65.1970, direccion: 'Av. Perón 900, Las Talitas' },
    { lat: -26.7920, lng: -65.2080, direccion: 'Barrio Norte, Las Talitas' },
    { lat: -26.7875, lng: -65.2010, direccion: 'Centro, Las Talitas' },
    { lat: -26.7790, lng: -65.2040, direccion: 'Av. Mitre, Las Talitas' },
  ];
  let iSm = 0;
  let iLt = 0;
  let n = 0;
  return defs
    .filter((d) => !d.forzarSinTenant)
    .map((d) => {
      const enYb = String(d.direccion || '').includes('Yerba Buena')
        || (Number(d.lng) < -65.27 && Number(d.lat) > -26.835 && Number(d.lat) < -26.80);
      if (!enYb) return d;
      const usarLt = n % 2 === 1;
      n += 1;
      const punto = usarLt
        ? altLt[iLt++ % altLt.length]
        : altSm[iSm++ % altSm.length];
      return { ...d, ...punto };
    });
};

async function run() {
  const agregar = process.argv.includes('--agregar');
  const soloSmtTalitas = process.argv.includes('--solo-smt-talitas');
  if (!process.env.MONGODB_URI) {
    console.error('Falta MONGODB_URI en .env');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);

  const existentes = await Marker.countDocuments({});
  if (existentes > 0 && !agregar) {
    console.log(`Hay ${existentes} casos en la base.`);
    console.log('Borrá primero o usá --agregar:');
    console.log('  node scripts/borrarCasos.js --si');
    console.log('  node scripts/sembrarCasosCompletos.js');
    console.log('  node scripts/sembrarCasosCompletos.js --agregar');
    console.log('  node scripts/sembrarCasosCompletos.js --agregar --solo-smt-talitas');
    await mongoose.disconnect();
    process.exit(1);
  }

  await asegurarUsuarios();
  let caseId = await getNextCaseId();
  let defs = definirCasos();
  if (soloSmtTalitas) {
    defs = filtrarSoloSmtTalitas(defs);
    console.log('Filtro: solo San Miguel de Tucumán y Las Talitas (sin YB ni fuera de límites).');
  }
  console.log(`Creando ${defs.length} casos de demo con fotos…`);
  for (const def of defs) {
    await crearCaso(def, caseId);
    caseId += 1;
  }

  console.log('');
  console.log('Listo. Revisá en el admin:');
  console.log('  Por aprobar · Reparaciones (Por atender / Omitidos)');
  console.log('  Reportes (Por atender / Omitidos) · Cosas perdidas · Animales · Registro');
  console.log('');
  console.log('Cuentas vecino:');
  VECINOS.forEach((e) => console.log(`  ${e}`));
  console.log(`Admin demo: ${ADMIN_LOCAL}`);
  console.log(`Operario demo: ${OPERARIO}`);
  console.log('Para borrar todo: node scripts/borrarCasos.js --si');

  await mongoose.disconnect();
}

run().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
