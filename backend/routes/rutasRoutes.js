const express = require('express');

const router = express.Router();

// Misma key que el frontend del mapa (proyecto Cloud de Maps, no Firebase)
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY
  || 'AIzaSyBKHbs5m_qsi4sd80epFp-mLP8KSFixk_4';

/** Decodifica polyline encoded de Google → [{ lat, lng }] */
const decodePolyline = (encoded) => {
  if (!encoded) return [];
  const points = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < encoded.length) {
    let b;
    let shift = 0;
    let result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = (result & 1) ? ~(result >> 1) : (result >> 1);
    lat += dlat;
    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = (result & 1) ? ~(result >> 1) : (result >> 1);
    lng += dlng;
    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return points;
};

const formatDistancia = (metros) => {
  const m = Number(metros);
  if (!Number.isFinite(m)) return '';
  if (m >= 1000) return `${(m / 1000).toFixed(m >= 10000 ? 0 : 1)} km`;
  return `${Math.round(m)} m`;
};

const formatDuracion = (duration) => {
  // Routes API: "123s" o { seconds: "123" }
  let secs = 0;
  if (typeof duration === 'string') {
    secs = parseInt(duration.replace(/s$/i, ''), 10);
  } else if (duration && duration.seconds != null) {
    secs = parseInt(duration.seconds, 10);
  }
  if (!Number.isFinite(secs) || secs < 0) return '';
  if (secs < 60) return `${secs} s`;
  const min = Math.round(secs / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
};

router.post('/guia', async (req, res) => {
  try {
    const oLat = Number(req.body?.origin?.lat);
    const oLng = Number(req.body?.origin?.lng);
    const dLat = Number(req.body?.destination?.lat);
    const dLng = Number(req.body?.destination?.lng);
    if (![oLat, oLng, dLat, dLng].every(Number.isFinite)) {
      return res.status(400).json({ message: 'Origen y destino inválidos' });
    }

    const fieldMask = [
      'routes.duration',
      'routes.distanceMeters',
      'routes.polyline.encodedPolyline',
      'routes.legs.steps.navigationInstruction',
      'routes.legs.steps.localizedValues',
      'routes.legs.steps.distanceMeters',
      'routes.legs.steps.endLocation',
    ].join(',');

    const respuesta = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY,
        'X-Goog-FieldMask': fieldMask,
      },
      body: JSON.stringify({
        origin: {
          location: { latLng: { latitude: oLat, longitude: oLng } },
        },
        destination: {
          location: { latLng: { latitude: dLat, longitude: dLng } },
        },
        travelMode: 'DRIVE',
        languageCode: 'es-AR',
        regionCode: 'AR',
        routingPreference: 'TRAFFIC_UNAWARE',
      }),
    });

    const data = await respuesta.json().catch(() => ({}));
    if (!respuesta.ok) {
      const msg = data?.error?.message || data?.message || `Routes API ${respuesta.status}`;
      console.error('Routes API error:', msg);
      return res.status(502).json({ message: msg });
    }

    const route = (data.routes || [])[0];
    if (!route) {
      return res.status(404).json({ message: 'No encontramos una ruta hasta ese punto' });
    }

    const path = decodePolyline(route.polyline?.encodedPolyline || '');
    const steps = [];
    (route.legs || []).forEach((leg) => {
      (leg.steps || []).forEach((step) => {
        const lat = Number(step.endLocation?.latLng?.latitude);
        const lng = Number(step.endLocation?.latLng?.longitude);
        steps.push({
          instruction: String(
            step.navigationInstruction?.instructions
            || step.localizedValues?.distance?.text
            || 'Seguí la ruta'
          ).trim(),
          distance: step.localizedValues?.distance?.text
            || formatDistancia(step.distanceMeters),
          end: Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null,
        });
      });
    });

    const distanceText = formatDistancia(route.distanceMeters);
    const durationText = formatDuracion(route.duration);

    res.json({
      path,
      steps: steps.filter((s) => s.end),
      distanceText,
      durationText,
      resumen: [distanceText, durationText].filter(Boolean).join(' · '),
    });
  } catch (error) {
    console.error('Error /api/rutas/guia:', error);
    res.status(500).json({ message: error.message || 'No se pudo calcular la ruta' });
  }
});

module.exports = router;
