// Borra TODOS los casos (marcadores), chats y notificaciones.
// No toca jurisdicciones, admins ni usuarios.
//
// Uso (desde backend/):
//   node scripts/borrarCasos.js --si
require('dotenv').config();
const mongoose = require('mongoose');
const Marker = require('../models/marker');
const Notificacion = require('../models/notificacion');
const ChatMensaje = require('../models/chatMensaje');

async function run() {
  const confirmado = process.argv.includes('--si') || process.argv.includes('--yes');
  if (!confirmado) {
    console.log('Esto borra TODOS los casos, chats y notificaciones.');
    console.log('No borra municipios ni admins.');
    console.log('');
    console.log('Para confirmar:');
    console.log('  node scripts/borrarCasos.js --si');
    process.exit(1);
  }

  if (!process.env.MONGODB_URI) {
    console.error('Falta MONGODB_URI en .env');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);

  const antes = await Marker.countDocuments({});
  const [markers, chats, notifs] = await Promise.all([
    Marker.deleteMany({}),
    ChatMensaje.deleteMany({}),
    Notificacion.deleteMany({}),
  ]);

  console.log(`Casos borrados:         ${markers.deletedCount} (había ${antes})`);
  console.log(`Mensajes de chat:       ${chats.deletedCount}`);
  console.log(`Notificaciones:         ${notifs.deletedCount}`);
  console.log('Listo.');

  await mongoose.disconnect();
}

run().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
