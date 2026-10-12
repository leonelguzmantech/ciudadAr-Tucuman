// Crea (o actualiza) el tenant municipal por defecto para que la app funcione
// sin necesidad del panel de administración de tenants.
//
// Uso: node scripts/seedTenant.js
require('dotenv').config();
const mongoose = require('mongoose');
const Tenant = require('../models/tenant');

const slug = (process.env.DEFAULT_TENANT_SLUG || 'demo-municipio').trim().toLowerCase();
const name = process.env.DEFAULT_TENANT_NAME || 'Municipio Demo';
const contactEmail = (process.env.ADMIN_USERS || '').split(',')[0].trim() || undefined;

async function run() {
  if (!process.env.MONGODB_URI) {
    console.error('Falta MONGODB_URI en el archivo .env');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Conectado a MongoDB');

  const existing = await Tenant.findOne({ slug });

  if (existing) {
    console.log(`El municipio "${slug}" ya existe (id: ${existing._id}).`);
  } else {
    const tenant = await Tenant.create({
      name,
      slug,
      type: 'municipality',
      status: 'active',
      contactEmail,
    });
    console.log(`Municipio creado: "${tenant.name}" (slug: ${tenant.slug}).`);
  }

  await mongoose.disconnect();
  console.log('Listo. Ya podés usar la app.');
  process.exit(0);
}

run().catch((error) => {
  console.error('Error al crear el municipio:', error.message);
  process.exit(1);
});
