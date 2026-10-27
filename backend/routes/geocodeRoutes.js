const express = require('express');

const router = express.Router();

const cache = new Map();
const CACHE_MS = 10 * 60 * 1000;

const clave = (lat, lng) => `${Number(lat).toFixed(4)},${Number(lng).toFixed(4)}`;

const armar = ({ ruta = '', numero = '', ciudad = '' }) => {
  if (!ruta && !numero) return '';
  const calle = ruta ? (numero ? `${ruta} ${numero}` : ruta) : numero;
  return ciudad ? `${calle}, ${ciudad}` : calle;
};

const desdePhoton = async (lat, lng) => {
  const url =
    `https://photon.komoot.io/reverse?lat=${encodeURIComponent(lat)}` +
    `&lon=${encodeURIComponent(lng)}`;
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) return '';
  const data = await res.json();
  const feature = data?.features?.[0];
  if (!feature) return '';
  const p = feature.properties || {};
  return armar({
    ruta: p.street || p.name || '',
    numero: p.housenumber || '',
    ciudad: p.city || p.town || p.state || '',
  });
};

const desdeNominatim = async (lat, lng) => {
  const url =
    `https://nominatim.openstreetmap.org/reverse?format=jsonv2` +
    `&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}` +
    `&addressdetails=1&zoom=18&accept-language=es`;
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'CiudadAr/1.0 (mapa-tucuman; contacto local)',
    },
  });
  if (!res.ok) return '';
  const data = await res.json();
  const a = data.address || {};
  const ruta = a.road || a.pedestrian || a.path || a.residential || '';
  const numero = a.house_number || '';
  const ciudad = a.city || a.town || a.municipality || a.village || '';
  return armar({ ruta, numero, ciudad })
    || (data.display_name || '').split(',').slice(0, 2).join(',').trim();
};

router.get('/reverse', async (req, res) => {
  try {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ message: 'lat y lng son obligatorios' });
    }

    const key = clave(lat, lng);
    const cached = cache.get(key);
    if (cached && Date.now() - cached.at < CACHE_MS) {
      return res.json({ direccion: cached.direccion });
    }

    let direccion = '';
    try {
      direccion = await desdePhoton(lat, lng);
    } catch (_) {
      direccion = '';
    }
    if (!direccion) {
      try {
        direccion = await desdeNominatim(lat, lng);
      } catch (_) {
        direccion = '';
      }
    }

    if (direccion) {
      cache.set(key, { direccion, at: Date.now() });
    }
    res.json({ direccion: direccion || '' });
  } catch (error) {
    res.status(500).json({ message: error.message, direccion: '' });
  }
});

module.exports = router;
