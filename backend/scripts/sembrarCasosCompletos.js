// Crea un set completo de casos de demo (todas las categorías, estados y flujos)
// con fotos embebidas. Ideal después de: node scripts/borrarCasos.js --si
//
// Uso (desde backend/):
//   node scripts/sembrarCasosCompletos.js
//   node scripts/sembrarCasosCompletos.js --agregar   (no exige base vacía)
require('dotenv').config();
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

// PNGs 1x1 válidos (alcanza para probar /image en el panel)
const PNG_B64 = {
  rojo: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  verde: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  azul: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPj/HwADBwIAMUb802QAAAABJRU5ErkJggg==',
  amarillo: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
  gris: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPj/HwADBwIAMUb802QAAAABJRU5ErkJggg==',
};

const foto = (tono = 'rojo') => ({
  data: Buffer.from(PNG_B64[tono] || PNG_B64.rojo, 'base64'),
  contentType: 'image/png',
});

const diasAtras = (dias) => {
  const fecha = new Date();
  fecha.setDate(fecha.getDate() - dias);
  return fecha;
};
const fechaTexto = (fecha) => fecha.toISOString().slice(0, 10);
const horaTexto = (fecha) => fecha.toTimeString().slice(0, 5);

const getNextCaseId = async () => {
  const last = await Marker.findOne().sort({ caseId: -1 }).select('caseId');
  return last && typeof last.caseId === 'number' ? last.caseId + 1 : 1;
};

// Puntos en municipios conocidos + uno fuera (sin jurisdicción local)
const P = {
  sm1: { lat: -26.8245, lng: -65.2227, direccion: 'San Martín 500, S.M. de Tucumán' },
  sm2: { lat: -26.8302, lng: -65.2048, direccion: 'Muñecas 200, S.M. de Tucumán' },
  sm3: { lat: -26.8088, lng: -65.2176, direccion: '24 de Septiembre 800, S.M. de Tucumán' },
  yb1: { lat: -26.8125, lng: -65.2950, direccion: 'Av. Aconquija 1200, Yerba Buena' },
  yb2: { lat: -26.8180, lng: -65.3025, direccion: 'Perú 450, Yerba Buena' },
  lt1: { lat: -26.7840, lng: -65.2005, direccion: 'Av. Perón, Las Talitas' },
  lt2: { lat: -26.7905, lng: -65.2055, direccion: 'Barrio Norte, Las Talitas' },
  // Fuera de Tucumán → suele quedar sin municipio local
  fuera: { lat: -27.4500, lng: -65.6000, direccion: 'Punto fuera de límites (demo)' },
};

const USUARIOS = [
  { email: VECINOS[0], telefono: '3815551001', proveedor: 'correo', nombre: 'Ana Demo' },
  { email: VECINOS[1], telefono: '3815551002', proveedor: 'correo', nombre: 'Bruno Demo' },
  { email: VECINOS[2], telefono: '3815551003', proveedor: 'google', nombre: 'Carla Demo' },
  { email: ADMIN_LOCAL, telefono: '3815551999', proveedor: 'correo', nombre: 'Admin Demo' },
];

/**
 * Cada ítem cubre un flujo distinto del producto.
 * Campos especiales se aplican después del create (imageUrl, chats, etc.).
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
    nuevoParaAdmin: false,
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

  // ——— Publicados / urgentes (con confirmaciones) ———
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
      { userId: VECINOS[2], description: 'Sigue fallando en hora pico.', tono: 'gris' },
    ],
  },
  {
    ...P.yb2,
    category: 'reparaciones',
    status: 'en_proceso',
    description: `${MARCA} Cordón roto — municipio en proceso.`,
    createdBy: VECINOS[1],
    aprobadoAt: diasAtras(5),
    atendidoPor: 'operario.demo@ciudadar.test',
    atendidoAt: diasAtras(2),
    tono: 'verde',
    dias: 5,
  },

  // ——— Pedir datos / respuesta vecino ———
  {
    ...P.sm3,
    category: 'reparaciones',
    status: 'pendiente',
    description: `${MARCA} Tapa de alcantarilla floja.`,
    createdBy: VECINOS[0],
    aprobadoAt: diasAtras(4),
    pideDatosMensaje: '¿Podés indicar entre qué calles exactas está?',
    pideDatosAt: diasAtras(2),
    respuestaDatosAt: diasAtras(1),
    ultimaRespuestaDatosAt: diasAtras(1),
    nuevoParaAdmin: true,
    tono: 'azul',
    dias: 4,
  },

  // ——— Resolución reportada por vecino (pendiente de cierre admin) ———
  {
    ...P.lt2,
    category: 'reparaciones',
    status: 'en_proceso',
    description: `${MARCA} Pozo ya tapado por cuadrilla — vecino pidió cierre.`,
    createdBy: VECINOS[2],
    aprobadoAt: diasAtras(10),
    resolvedBy: VECINOS[2],
    resolvedByReportedAt: diasAtras(1),
    resolutionDescription: 'La cuadrilla tapó el pozo ayer a la tarde.',
    tonoResolucion: 'verde',
    tono: 'gris',
    dias: 10,
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
  // Abandonado publicado (aún sin avisar oficina) → Reportes / mapa
  {
    ...P.sm2,
    lat: -26.8290,
    lng: -65.2080,
    category: 'perros_gatos',
    animalTipo: 'abandonado',
    status: 'pendiente',
    description: `${MARCA} Perro abandonado en vereda — sin avisar aún.`,
    createdBy: VECINOS[1],
    contacto: '3815551002',
    aprobadoAt: diasAtras(1),
    nuevoParaAdmin: true,
    tono: 'amarillo',
    dias: 1,
  },
  // Abandonado con oficina avisada → Derivados (badge + sombreado)
  {
    ...P.yb2,
    lat: -26.8175,
    lng: -65.3010,
    category: 'perros_gatos',
    animalTipo: 'abandonado',
    status: 'pendiente',
    description: `${MARCA} Gato abandonado — oficina avisada (Derivados nuevo).`,
    createdBy: VECINOS[2],
    contacto: '3815551003',
    aprobadoAt: diasAtras(3),
    avisadoAt: diasAtras(1),
    nuevoParaAdmin: false,
    nuevoDerivadoParaAdmin: true,
    tono: 'gris',
    dias: 3,
  },
  // Otro derivado ya “visto” (sin badge)
  {
    ...P.lt1,
    lat: -26.7855,
    lng: -65.1995,
    category: 'perros_gatos',
    animalTipo: 'abandonado',
    status: 'en_proceso',
    description: `${MARCA} Perro flaco — derivado ya visto por admin.`,
    createdBy: VECINOS[0],
    contacto: '3815551001',
    aprobadoAt: diasAtras(6),
    avisadoAt: diasAtras(4),
    nuevoParaAdmin: false,
    nuevoDerivadoParaAdmin: false,
    tono: 'amarillo',
    dias: 6,
  },

  // ——— Familias (privado) ———
  {
    ...P.sm2,
    lat: -26.8285,
    lng: -65.2100,
    category: 'familias',
    familiasTipo: 'violencia',
    status: 'pendiente',
    visibility: 'private',
    description: `${MARCA} Alerta confidencial — situación de violencia.`,
    createdBy: VECINOS[2],
    aprobadoAt: diasAtras(1),
    nuevoParaAdmin: true,
    tono: 'rojo',
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
  // Familia avisada → sale a Registro (no Derivados / no mapa)
  {
    ...P.yb1,
    lat: -26.8130,
    lng: -65.2935,
    category: 'familias',
    familiasTipo: 'hijos',
    status: 'pendiente',
    visibility: 'private',
    description: `${MARCA} Familia — oficina avisada (en Registro).`,
    createdBy: VECINOS[1],
    aprobadoAt: diasAtras(4),
    avisadoAt: diasAtras(2),
    eliminadoAt: diasAtras(2),
    eliminadoPor: ADMIN_LOCAL,
    motivoEliminacion: 'Oficina correspondiente avisada',
    nuevoParaAdmin: false,
    nuevoDerivadoParaAdmin: false,
    tono: 'azul',
    dias: 4,
  },

  // ——— Cuadrilla: pendiente de cierre ———
  {
    ...P.sm3,
    lat: -26.8095,
    lng: -65.2190,
    category: 'reparaciones',
    status: 'pendiente_cierre',
    description: `${MARCA} Vereda rota — cuadrilla propuso cierre.`,
    createdBy: VECINOS[0],
    aprobadoAt: diasAtras(8),
    atendidoPor: 'operario.demo@ciudadar.test',
    atendidoAt: diasAtras(3),
    cierrePropuestoPor: 'operario.demo@ciudadar.test',
    cierrePropuestoAt: diasAtras(1),
    resolutionDescription: 'Se rellenó y compactó el tramo.',
    tonoResolucion: 'verde',
    nuevoParaAdmin: true,
    tono: 'verde',
    dias: 8,
  },

  // ——— Cosas perdidas con chat / reclamo ———
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
    description: `${MARCA} Perdí DNI — ambas partes confirmaron recuperación.`,
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

  // ——— Registro: resuelto / anulado / vencido ———
  {
    ...P.sm1,
    lat: -26.8220,
    lng: -65.2250,
    category: 'reparaciones',
    status: 'resuelto',
    description: `${MARCA} Luminaria reparada — en registro.`,
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
    description: `${MARCA} Aviso vencido sin reclamo — registro.`,
    createdBy: VECINOS[2],
    aprobadoAt: diasAtras(40),
    eliminadoAt: diasAtras(1),
    eliminadoPor: 'sistema',
    motivoEliminacion: 'Baja por vencimiento automático',
    tono: 'gris',
    dias: 40,
  },

  // ——— Sin jurisdicción (punto fuera) ———
  {
    ...P.fuera,
    category: 'reparaciones',
    status: 'pendiente_aprobacion',
    description: `${MARCA} Reporte fuera de límites — cola Sin jurisdicción.`,
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
    respuestaDatosAt: def.respuestaDatosAt || null,
    ultimaRespuestaDatosAt: def.ultimaRespuestaDatosAt || null,
    nuevoParaAdmin: !!def.nuevoParaAdmin,
    nuevoDerivadoParaAdmin: !!def.nuevoDerivadoParaAdmin,
    atendidoPor: def.atendidoPor || null,
    atendidoAt: def.atendidoAt || null,
    cierrePropuestoPor: def.cierrePropuestoPor || null,
    cierrePropuestoAt: def.cierrePropuestoAt || null,
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
    const rImg = foto(def.tonoResolucion || 'verde');
    doc.resolutionImage = rImg;
  }

  const marker = await Marker.create(doc);
  marker.imageUrl = `/api/markers/${marker._id}/image`;
  if (marker.resolutionImage?.data) {
    marker.resolutionImageUrl = `/api/markers/${marker._id}/resolution-image`;
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
  console.log(`  #${caseId} ${def.category}/${def.status} — ${lugar}`);
  return marker;
}

async function run() {
  const agregar = process.argv.includes('--agregar');
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
    await mongoose.disconnect();
    process.exit(1);
  }

  await asegurarUsuarios();
  let caseId = await getNextCaseId();
  const defs = definirCasos();
  console.log(`Creando ${defs.length} casos de demo…`);
  for (const def of defs) {
    await crearCaso(def, caseId++);
  }

  console.log('');
  console.log('Listo. Cuentas vecino:');
  VECINOS.forEach((e) => console.log(`  ${e}`));
  console.log(`Admin demo (usuario, no asignado a municipio): ${ADMIN_LOCAL}`);
  console.log('Para borrar todo: node scripts/borrarCasos.js --si');

  await mongoose.disconnect();
}

run().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
