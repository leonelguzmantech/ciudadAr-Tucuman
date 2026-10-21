// Asigna o quita administradores de un municipio, comuna o provincia.
//
// Uso:
//   node scripts/manageAdmins.js list                       Lista las jurisdicciones con admins
//   node scripts/manageAdmins.js find <texto>               Busca jurisdicciones por nombre
//   node scripts/manageAdmins.js add <slug> <email>         Agrega un admin
//   node scripts/manageAdmins.js remove <slug> <email>      Quita un admin
require('dotenv').config();
const mongoose = require('mongoose');
const Tenant = require('../models/tenant');

const TYPE_LABELS = { province: 'Provincia', municipality: 'Municipio', commune: 'Comuna' };

const describe = (t) =>
  `${TYPE_LABELS[t.type] || t.type}: ${t.name}  [slug: ${t.slug}]` +
  (t.admins && t.admins.length ? `  admins: ${t.admins.join(', ')}` : '');

async function run() {
  const [command, arg1, arg2] = process.argv.slice(2);
  await mongoose.connect(process.env.MONGODB_URI);

  if (command === 'list') {
    const tenants = await Tenant.find({ 'admins.0': { $exists: true } }).sort({ type: 1, name: 1 });
    if (!tenants.length) console.log('Ninguna jurisdicción tiene administradores todavía.');
    tenants.forEach((t) => console.log(describe(t)));
  } else if (command === 'find' && arg1) {
    const escaped = arg1.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const tenants = await Tenant.find({ name: new RegExp(escaped, 'i') }).sort({ type: 1, name: 1 });
    if (!tenants.length) console.log(`No se encontró ninguna jurisdicción con "${arg1}".`);
    tenants.forEach((t) => console.log(describe(t)));
  } else if ((command === 'add' || command === 'remove') && arg1 && arg2) {
    const email = arg2.trim().toLowerCase();
    const update = command === 'add' ? { $addToSet: { admins: email } } : { $pull: { admins: email } };
    const tenant = await Tenant.findOneAndUpdate({ slug: arg1.toLowerCase() }, update, { new: true });
    if (!tenant) {
      console.log(`No existe la jurisdicción "${arg1}". Usá "find" para buscar el slug.`);
    } else {
      console.log(command === 'add' ? 'Admin agregado.' : 'Admin quitado.');
      console.log(describe(tenant));
    }
  } else {
    console.log('Uso: node scripts/manageAdmins.js list | find <texto> | add <slug> <email> | remove <slug> <email>');
  }

  await mongoose.disconnect();
}

run().catch((error) => {
  console.error('Error:', error.message);
  process.exit(1);
});
