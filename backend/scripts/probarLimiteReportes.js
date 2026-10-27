// Prueba el tope de reportes por cuenta (5 cada 24 horas).
//
// Uso (desde backend/, con la API corriendo en el puerto 5001):
//   node scripts/probarLimiteReportes.js           Corre la prueba
//   node scripts/probarLimiteReportes.js limpiar   Borra los reportes de esta prueba
require('dotenv').config();
const axios = require('axios');
const mongoose = require('mongoose');
const Marker = require('../models/marker');

const API = process.env.API_URL || 'http://localhost:5001';
const CORREO = 'limite.prueba.sistema@example.com';
const MARCA = 'LIMITE-PRUEBA';
const INTENTOS = 6; // el 6º debería fallar si el tope es 5

const filtroPrueba = {
  $or: [
    { description: new RegExp(MARCA) },
    { createdBy: CORREO },
  ],
};

async function limpiar() {
  await mongoose.connect(process.env.MONGODB_URI);
  const resultado = await Marker.deleteMany(filtroPrueba);
  console.log(`Reportes de la prueba borrados: ${resultado.deletedCount}`);
  await mongoose.disconnect();
}

// PNG 1x1 mínimo para cumplir con la foto obligatoria
const FOTO_PRUEBA = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

async function crearReporte(numero) {
  const form = new FormData();
  form.append('lat', String(-26.8245 - numero * 0.0003));
  form.append('lng', String(-65.2227));
  form.append('date', new Date().toISOString().slice(0, 10));
  form.append('time', new Date().toTimeString().slice(0, 5));
  form.append('description', `${MARCA} intento ${numero} del límite diario`);
  form.append('category', 'reparaciones');
  form.append('status', 'pendiente_aprobacion');
  form.append('image', new File([FOTO_PRUEBA], 'prueba.png', { type: 'image/png' }));

  return axios.post(`${API}/api/markers`, form, {
    headers: { 'x-user-id': CORREO },
    validateStatus: () => true,
  });
}

async function probar() {
  try {
    await axios.get(`${API}/api/auth/me`, { headers: { 'x-user-id': CORREO }, timeout: 3000 });
  } catch (error) {
    console.error('La API no responde en', API);
    console.error('Arrancala primero: cd backend && node server.js');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  const borrados = await Marker.deleteMany(filtroPrueba);
  if (borrados.deletedCount) {
    console.log(`Se limpiaron ${borrados.deletedCount} reportes viejos de esta prueba.`);
  }
  await mongoose.disconnect();

  console.log(`Cuenta de prueba: ${CORREO}`);
  console.log(`Se van a intentar ${INTENTOS} reportes seguidos.\n`);

  let ok = 0;
  let bloqueados = 0;

  for (let i = 1; i <= INTENTOS; i += 1) {
    const respuesta = await crearReporte(i);
    if (respuesta.status === 201) {
      ok += 1;
      console.log(`  ${i}. OK (${respuesta.status}) caso #${respuesta.data.caseId}`);
    } else if (respuesta.status === 429) {
      bloqueados += 1;
      console.log(`  ${i}. BLOQUEADO (${respuesta.status}) ${respuesta.data.message}`);
    } else {
      console.log(`  ${i}. ERROR (${respuesta.status}) ${respuesta.data?.message || ''}`);
    }
  }

  console.log('');
  if (ok === 5 && bloqueados >= 1) {
    console.log('Prueba OK: se crearon 5 y el siguiente quedó bloqueado.');
  } else {
    console.log(`Resultado inesperado: ok=${ok}, bloqueados=${bloqueados}`);
  }
  console.log('Para borrar estos reportes: node scripts/probarLimiteReportes.js limpiar');
}

async function run() {
  const comando = (process.argv[2] || 'probar').toLowerCase();
  if (comando === 'limpiar') {
    await limpiar();
  } else {
    await probar();
  }
}

run().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
