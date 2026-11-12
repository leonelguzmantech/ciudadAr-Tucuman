// Carga datos de prueba para demostrar el sistema ante el profesor.
//
// Uso (desde la carpeta backend/):
//   node scripts/seedPruebas.js           Crea los reportes y cuentas de prueba
//   node scripts/seedPruebas.js limpiar   Borra solo esos datos de prueba
require('dotenv').config();
const mongoose = require('mongoose');
const Marker = require('../models/marker');
const Usuario = require('../models/usuario');
const { findJurisdictionForPoint } = require('../utils/jurisdictions');

const MARCA = 'DATOS-PRUEBA';
const CORREOS_PRUEBA = [
  'vecino.prueba.1@example.com',
  'vecino.prueba.2@example.com',
  'vecino.prueba.3@example.com',
];

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

// Puntos reales aproximados en cada municipio, un poco separados entre sí.
const CASOS = [
  {
    lat: -26.8245,
    lng: -65.2227,
    category: 'reparaciones',
    status: 'pendiente',
    description: `${MARCA} Bache profundo en calle San Martín, frente a la plaza.`,
    createdBy: CORREOS_PRUEBA[0],
    confirmations: [
      { userId: CORREOS_PRUEBA[1], description: 'También lo vi hoy temprano.' },
      { userId: CORREOS_PRUEBA[2], description: 'Sigue abierto y es peligroso.' },
    ],
  },
  {
    lat: -26.8302,
    lng: -65.2048,
    category: 'reparaciones',
    status: 'en_proceso',
    description: `${MARCA} Semáforo apagado en esquina céntrica.`,
    createdBy: CORREOS_PRUEBA[1],
  },
  {
    lat: -26.8088,
    lng: -65.2176,
    category: 'reparaciones',
    status: 'pendiente_aprobacion',
    description: `${MARCA} Luminaria quemada en vereda de barrio.`,
    createdBy: CORREOS_PRUEBA[2],
  },
  {
    lat: -26.8120,
    lng: -65.2105,
    category: 'perros_gatos',
    animalTipo: 'abandonado',
    status: 'pendiente',
    description: `${MARCA} Perro abandonado sin collar cerca de la plaza.`,
    createdBy: CORREOS_PRUEBA[0],
  },
  {
    lat: -26.8195,
    lng: -65.2280,
    category: 'perros_gatos',
    animalTipo: 'perdido',
    status: 'pendiente',
    description: `${MARCA} Gato perdido, color atigrado, con collar rojo.`,
    createdBy: CORREOS_PRUEBA[1],
  },
  {
    lat: -26.8055,
    lng: -65.2255,
    category: 'perros_gatos',
    animalTipo: 'adopcion',
    status: 'pendiente',
    description: `${MARCA} Cachorro en adopción, vacunado y dócil.`,
    createdBy: CORREOS_PRUEBA[2],
  },
  {
    lat: -26.8168,
    lng: -65.2150,
    category: 'familias',
    familiasTipo: 'violencia',
    status: 'pendiente',
    visibility: 'private',
    description: `${MARCA} Situación de violencia escuchada por vecinos. Solo alerta.`,
    createdBy: CORREOS_PRUEBA[0],
  },
  {
    lat: -26.8210,
    lng: -65.2195,
    category: 'familias',
    familiasTipo: 'hijos',
    status: 'pendiente',
    visibility: 'private',
    description: `${MARCA} Posible situación de riesgo con menores. Solo alerta.`,
    createdBy: CORREOS_PRUEBA[1],
  },
  {
    lat: -26.8275,
    lng: -65.2130,
    category: 'familias',
    familiasTipo: 'calle',
    status: 'pendiente',
    visibility: 'private',
    description: `${MARCA} Persona en situación de calle en la vereda.`,
    createdBy: CORREOS_PRUEBA[2],
  },
  // Yerba Buena
  {
    lat: -26.8125,
    lng: -65.2950,
    category: 'reparaciones',
    status: 'pendiente',
    description: `${MARCA} Pozo en avenida principal de Yerba Buena.`,
    createdBy: CORREOS_PRUEBA[0],
    confirmations: [
      { userId: CORREOS_PRUEBA[1], description: 'Confirmado, hay que taparlo.' },
    ],
  },
  {
    lat: -26.8180,
    lng: -65.3025,
    category: 'perros_gatos',
    animalTipo: 'abandonado',
    status: 'pendiente_aprobacion',
    description: `${MARCA} Perro flaco abandonado cerca del parque.`,
    createdBy: CORREOS_PRUEBA[1],
  },
  {
    lat: -26.8090,
    lng: -65.2880,
    category: 'reparaciones',
    status: 'resuelto',
    resolvedAt: diasAtras(2),
    description: `${MARCA} Cordón roto ya reparado en Yerba Buena.`,
    createdBy: CORREOS_PRUEBA[2],
  },
  // Las Talitas
  {
    lat: -26.7840,
    lng: -65.2005,
    category: 'reparaciones',
    status: 'pendiente',
    description: `${MARCA} Calle inundada por tapa de alcantarilla faltante.`,
    createdBy: CORREOS_PRUEBA[0],
    confirmations: [
      { userId: CORREOS_PRUEBA[1], description: 'Pasé hoy y sigue igual.' },
      { userId: CORREOS_PRUEBA[2], description: 'Varios vecinos lo marcaron.' },
    ],
  },
  {
    lat: -26.7905,
    lng: -65.2055,
    category: 'perros_gatos',
    animalTipo: 'perdido',
    status: 'pendiente',
    description: `${MARCA} Perro perdido color negro, responde al nombre Toby.`,
    createdBy: CORREOS_PRUEBA[1],
  },
  {
    lat: -26.7785,
    lng: -65.1955,
    category: 'reparaciones',
    status: 'en_proceso',
    description: `${MARCA} Cartel de calle caído en Las Talitas.`,
    createdBy: CORREOS_PRUEBA[2],
  },
];

const USUARIOS = [
  {
    email: CORREOS_PRUEBA[0],
    telefono: '3815550101',
    dni: '30000001',
    proveedor: 'correo',
    nombre: 'Vecino Prueba 1',
    telefonoConfirmado: true,
    telefonoConfirmadoAt: new Date(),
  },
  {
    email: CORREOS_PRUEBA[1],
    telefono: '3815550102',
    dni: '30000002',
    proveedor: 'correo',
    nombre: 'Vecino Prueba 2',
    telefonoConfirmado: true,
    telefonoConfirmadoAt: new Date(),
  },
  {
    email: CORREOS_PRUEBA[2],
    telefono: '3815550103',
    dni: '30000003',
    proveedor: 'google',
    nombre: 'Vecino Prueba 3',
    telefonoConfirmado: true,
    telefonoConfirmadoAt: new Date(),
  },
];

const filtroPrueba = {
  $or: [
    { description: new RegExp(MARCA) },
    { createdBy: { $in: CORREOS_PRUEBA } },
  ],
};

async function limpiar() {
  const borradosMarcadores = await Marker.deleteMany(filtroPrueba);
  const borradosUsuarios = await Usuario.deleteMany({ email: { $in: CORREOS_PRUEBA } });
  console.log(`Marcadores de prueba borrados: ${borradosMarcadores.deletedCount}`);
  console.log(`Cuentas de prueba borradas: ${borradosUsuarios.deletedCount}`);
}

async function sembrar() {
  const existentes = await Marker.countDocuments(filtroPrueba);
  if (existentes > 0) {
    console.log(`Ya hay ${existentes} reportes de prueba. Corré primero:`);
    console.log('  node scripts/seedPruebas.js limpiar');
    return;
  }

  for (const usuario of USUARIOS) {
    await Usuario.findOneAndUpdate(
      { email: usuario.email },
      { $set: usuario },
      { upsert: true, new: true }
    );
  }
  console.log(`Cuentas de prueba: ${USUARIOS.length}`);

  let caseId = await getNextCaseId();
  let creados = 0;

  for (const caso of CASOS) {
    const jurisdiction = await findJurisdictionForPoint(caso.lat, caso.lng);
    const creado = diasAtras(creados % 8);
    const doc = {
      tenant: jurisdiction.tenant,
      province: jurisdiction.province,
      lat: caso.lat,
      lng: caso.lng,
      date: fechaTexto(creado),
      time: horaTexto(creado),
      description: caso.description,
      status: caso.status,
      category: caso.category,
      visibility: caso.visibility || 'public',
      createdBy: caso.createdBy,
      caseId: caseId++,
      familiasTipo: caso.familiasTipo || null,
      animalTipo: caso.animalTipo || null,
      resolvedAt: caso.resolvedAt || null,
      confirmations: (caso.confirmations || []).map((item) => ({
        ...item,
        createdAt: diasAtras(1),
      })),
      createdAt: creado,
      updatedAt: creado,
    };
    await Marker.create(doc);
    creados += 1;
    const lugar = jurisdiction.tenant ? 'con jurisdicción' : 'sin jurisdicción local';
    console.log(`  #${doc.caseId} ${caso.category} (${caso.status}) ${lugar}`);
  }

  console.log(`Reportes de prueba creados: ${creados}`);
  console.log('Para borrarlos después: node scripts/seedPruebas.js limpiar');
}

async function run() {
  const comando = (process.argv[2] || 'sembrar').toLowerCase();
  await mongoose.connect(process.env.MONGODB_URI);

  if (comando === 'limpiar') {
    await limpiar();
  } else if (comando === 'sembrar' || comando === 'seed') {
    await sembrar();
  } else {
    console.log('Uso:');
    console.log('  node scripts/seedPruebas.js');
    console.log('  node scripts/seedPruebas.js limpiar');
  }

  await mongoose.disconnect();
}

run().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
