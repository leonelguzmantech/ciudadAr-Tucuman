// Importa provincias, municipios y comunas (con sus límites) desde un GeoJSON
// y reasigna cada reporte existente según su ubicación.
//
// Uso: node scripts/importJurisdictions.js [archivo.geojson]
// Por defecto usa data/tucuman.geojson (límites oficiales del IGN, nombres de Georef).
//
// Cada feature debe tener en properties: code, name, type
// ('province' | 'municipality' | 'commune') y parentCode (código de la provincia).
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const Tenant = require('../models/tenant');
const Marker = require('../models/marker');
const { findJurisdictionForPoint } = require('../utils/jurisdictions');

const file = process.argv[2] || path.join(__dirname, '..', 'data', 'tucuman.geojson');

const slugify = (text) =>
  String(text)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const buildSlug = async ({ code, name, type }) => {
  const base = type === 'commune' ? `comuna-${slugify(name)}` : slugify(name);
  const taken = await Tenant.findOne({ slug: base, code: { $ne: code } });
  return taken ? `${base}-${code}` : base;
};

const upsertJurisdiction = async (feature, parentId) => {
  const { code, name, type } = feature.properties;
  const existing = await Tenant.findOne({ code });
  const data = {
    name,
    code,
    type,
    parent: parentId || null,
    boundary: feature.geometry,
    status: 'active',
  };
  if (existing) {
    Object.assign(existing, data);
    return existing.save();
  }
  return Tenant.create({ ...data, slug: await buildSlug({ code, name, type }) });
};

async function run() {
  if (!process.env.MONGODB_URI) {
    console.error('Falta MONGODB_URI en el archivo .env');
    process.exit(1);
  }

  const { features } = JSON.parse(fs.readFileSync(file, 'utf-8'));
  await mongoose.connect(process.env.MONGODB_URI);
  await Tenant.syncIndexes();
  console.log(`Conectado a MongoDB. Importando ${features.length} jurisdicciones de ${path.basename(file)}...`);

  const provinces = {};
  for (const feature of features.filter((f) => f.properties.type === 'province')) {
    const province = await upsertJurisdiction(feature, null);
    provinces[feature.properties.code] = province._id;
    console.log(`  Provincia: ${province.name}`);
  }

  let imported = 0;
  const failed = [];
  for (const feature of features.filter((f) => f.properties.type !== 'province')) {
    try {
      await upsertJurisdiction(feature, provinces[feature.properties.parentCode]);
      imported += 1;
    } catch (error) {
      failed.push(`${feature.properties.name} (${feature.properties.code}): ${error.message}`);
    }
  }
  console.log(`  Municipios y comunas importados: ${imported}`);
  if (failed.length) {
    console.log(`  No se pudieron importar ${failed.length}:`);
    failed.forEach((line) => console.log(`    - ${line}`));
  }

  const markers = await Marker.find().select('lat lng');
  for (const marker of markers) {
    const jurisdiction = await findJurisdictionForPoint(marker.lat, marker.lng);
    await Marker.updateOne({ _id: marker._id }, jurisdiction);
  }
  console.log(`Reportes reasignados según su ubicación: ${markers.length}`);

  await mongoose.disconnect();
  process.exit(0);
}

run().catch((error) => {
  console.error('Error al importar jurisdicciones:', error.message);
  process.exit(1);
});
