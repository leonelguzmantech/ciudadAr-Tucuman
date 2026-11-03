const express = require('express');

const router = express.Router();

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY
  || 'AIzaSyBKHbs5m_qsi4sd80epFp-mLP8KSFixk_4';

const cache = new Map();
const CACHE_MS = 10 * 60 * 1000;

const clave = (lat, lng) => `${Number(lat).toFixed(4)},${Number(lng).toFixed(4)}`;

const armar = ({ ruta = '', numero = '', ciudad = '' }) => {
  if (!ruta && !numero) return '';
  const calle = ruta ? (numero ? `${ruta} ${numero}` : ruta) : numero;
  return ciudad ? `${calle}, ${ciudad}` : calle;
};

const componente = (components, tipo) =>
  (components || []).find((c) => (c.types || []).includes(tipo))?.long_name || '';

const formatearGoogle = (result) => {
  if (!result) return '';
  const comps = result.address_components || [];
  const ruta = componente(comps, 'route');
  const numero = componente(comps, 'street_number');
  const ciudad = componente(comps, 'locality')
    || componente(comps, 'administrative_area_level_2')
    || componente(comps, 'administrative_area_level_1');
  const corto = armar({ ruta, numero, ciudad });
  if (corto) return corto;
  // Fallback: primeras partes del formatted_address
  return String(result.formatted_address || '')
    .split(',')
    .slice(0, 2)
    .join(',')
    .trim();
};

const desdeGoogle = async (lat, lng) => {
  const url =
    `https://maps.googleapis.com/maps/api/geocode/json` +
    `?latlng=${encodeURIComponent(lat)},${encodeURIComponent(lng)}` +
    `&language=es&region=ar&key=${encodeURIComponent(GOOGLE_MAPS_API_KEY)}`;
  const res = await fetch(url);
  if (!res.ok) return '';
  const data = await res.json();
  if (data.status !== 'OK' || !Array.isArray(data.results) || !data.results.length) {
    return '';
  }
  const results = data.results;
  const conAltura = results.find((item) =>
    (item.address_components || []).some((c) => (c.types || []).includes('street_number'))
  );
  const preferido =
    conAltura
    || results.find((item) => (item.types || []).includes('street_address'))
    || results.find((item) => (item.types || []).includes('route'))
    || results[0];
  return formatearGoogle(preferido);
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
      return res.json({ direccion: cached.direccion, fuente: cached.fuente || '' });
    }

    let direccion = '';
    let fuente = '';
    try {
      direccion = await desdeGoogle(lat, lng);
      if (direccion) fuente = 'google';
    } catch (err) {
      console.error('Geocode Google:', err.message);
    }
    if (!direccion) {
      try {
        direccion = await desdePhoton(lat, lng);
        if (direccion) fuente = 'photon';
      } catch (_) {
        direccion = '';
      }
    }
    if (!direccion) {
      try {
        direccion = await desdeNominatim(lat, lng);
        if (direccion) fuente = 'nominatim';
      } catch (_) {
        direccion = '';
      }
    }

    if (direccion) {
      cache.set(key, { direccion, fuente, at: Date.now() });
    }
    res.json({ direccion: direccion || '', fuente });
  } catch (error) {
    res.status(500).json({ message: error.message, direccion: '' });
  }
});

// Places API (New) · autocompletado
router.get('/search', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length < 3) {
      return res.json({ items: [] });
    }
    const input = /tucum[aá]n/i.test(q) ? q : `${q}, Tucumán`;
    const respuesta = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY,
      },
      body: JSON.stringify({
        input,
        includedRegionCodes: ['ar'],
        languageCode: 'es',
        locationBias: {
          circle: {
            center: { latitude: -26.8084602, longitude: -65.2175701 },
            radius: 40000.0,
          },
        },
      }),
    });
    const data = await respuesta.json().catch(() => ({}));
    if (!respuesta.ok) {
      return res.status(502).json({
        message: data?.error?.message || 'Places autocomplete falló',
        items: [],
      });
    }
    const items = (data.suggestions || [])
      .map((s) => s.placePrediction)
      .filter(Boolean)
      .map((p) => {
        const titulo = p.structuredFormat?.mainText?.text
          || String(p.text?.text || '').split(',')[0]
          || 'Lugar';
        const detalle = p.structuredFormat?.secondaryText?.text
          || String(p.text?.text || '').split(',').slice(1).join(',').trim();
        return {
          placeId: p.placeId,
          titulo,
          detalle,
          direccion: p.text?.text || (detalle ? `${titulo}, ${detalle}` : titulo),
        };
      });
    res.json({ items });
  } catch (error) {
    res.status(500).json({ message: error.message, items: [] });
  }
});

// Places API (New) · detalle (lat/lng)
router.get('/place', async (req, res) => {
  try {
    const placeId = String(req.query.placeId || '').trim();
    if (!placeId) {
      return res.status(400).json({ message: 'placeId requerido' });
    }
    const id = placeId.startsWith('places/') ? placeId.slice('places/'.length) : placeId;
    const respuesta = await fetch(
      `https://places.googleapis.com/v1/places/${encodeURIComponent(id)}?languageCode=es`,
      {
        headers: {
          'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY,
          'X-Goog-FieldMask': 'id,formattedAddress,location,displayName',
        },
      }
    );
    const data = await respuesta.json().catch(() => ({}));
    if (!respuesta.ok) {
      return res.status(502).json({
        message: data?.error?.message || 'No se pudo obtener el lugar',
      });
    }
    const lat = Number(data.location?.latitude);
    const lng = Number(data.location?.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(404).json({ message: 'El lugar no tiene coordenadas' });
    }
    res.json({
      placeId: data.id || id,
      lat,
      lng,
      direccion: data.formattedAddress
        || data.displayName?.text
        || '',
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
