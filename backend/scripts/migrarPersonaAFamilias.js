// Migra category "persona" (legado) → "familias" + familiasTipo "calle".
//
// Uso (desde backend/):
//   node scripts/migrarPersonaAFamilias.js          # dry-run
//   node scripts/migrarPersonaAFamilias.js --si     # aplica
require('dotenv').config();
const mongoose = require('mongoose');
const Marker = require('../models/marker');

async function run() {
  const aplicar = process.argv.includes('--si') || process.argv.includes('--yes');

  if (!process.env.MONGODB_URI) {
    console.error('Falta MONGODB_URI en .env');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);

  const filtro = { category: 'persona' };
  const total = await Marker.countDocuments(filtro);
  console.log(`Casos con category "persona": ${total}`);

  if (!total) {
    console.log('Nada que migrar.');
    await mongoose.disconnect();
    return;
  }

  if (!aplicar) {
    console.log('Dry-run. Para aplicar:');
    console.log('  node scripts/migrarPersonaAFamilias.js --si');
    await mongoose.disconnect();
    return;
  }

  const resultado = await Marker.updateMany(filtro, {
    $set: {
      category: 'familias',
      familiasTipo: 'calle',
    },
  });

  console.log(`Actualizados: ${resultado.modifiedCount}`);
  console.log('Listo. category "persona" → familias (calle).');
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
