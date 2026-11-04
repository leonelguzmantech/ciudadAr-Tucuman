import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { GoogleMap, useJsApiLoader, OverlayView, Polyline } from '@react-google-maps/api';
import axios from 'axios';
import marcadorCiudad from '../assets/marcador-ciudadar.svg';
import marcadorCiudadLuz from '../assets/marcador-ciudadar-luz.svg';
import iconoPatita from '../assets/icono-patita-blanca.png';
import BuscadorDireccion from './BuscadorDireccion';
import ChatReclamo from './ChatReclamo';
import EditorImagen from './EditorImagen';
import CamaraEnVivo from './CamaraEnVivo';

const ANCHO_PIN = 30;
const ALTO_PIN = ANCHO_PIN * (88 / 64);
const PUNTA_PIN_Y = ALTO_PIN * (82.6 / 88);
const ANCHO_LUZ = ANCHO_PIN * (112 / 64);
const ALTO_LUZ = ANCHO_LUZ * (120 / 112);
const PUNTA_LUZ_X = ANCHO_LUZ * (56 / 112);
const PUNTA_LUZ_Y = ALTO_LUZ * (98.6 / 120);

/** Color del pin: misma silueta CiudadAr, distinto acento (sin íconos ruidosos) */
const COLOR_PIN_CATEGORIA = {
  reparaciones: '#2F6FDB',
  cosas_perdidas: '#EA580C',
  perros_gatos: '#059669',
  familias: '#DB2777',
};
const COLOR_PIN_DEFAULT = '#6AADFF';

const LEYENDA_PINES = [
  { key: 'reparaciones', label: 'Reparaciones', color: COLOR_PIN_CATEGORIA.reparaciones },
  { key: 'cosas_perdidas', label: 'Cosas perdidas', color: COLOR_PIN_CATEGORIA.cosas_perdidas },
  { key: 'perros_gatos', label: 'Animales', color: COLOR_PIN_CATEGORIA.perros_gatos },
  { key: 'familias', label: 'Familias', color: COLOR_PIN_CATEGORIA.familias },
];

/** Interior original del pin (rayos CiudadAr) */
const INTERIOR_PIN_ORIGINAL = [
  '<circle cx="32" cy="29" r="13.6" fill="none" stroke="#ffffff" stroke-width="2.6"/>',
  '<g fill="#ffffff">',
  '<path d="M 32.00 17.50 A 11.5 11.5 0 0 1 40.27 21.01 L 35.00 28.03 Z"/>',
  '<path d="M 41.96 23.25 A 11.5 11.5 0 0 1 43.05 32.17 L 34.34 31.11 Z"/>',
  '<path d="M 41.96 34.75 A 11.5 11.5 0 0 1 34.78 40.16 L 31.35 32.08 Z"/>',
  '<path d="M 32.00 40.50 A 11.5 11.5 0 0 1 23.73 36.99 L 29.00 29.97 Z"/>',
  '<path d="M 22.04 34.75 A 11.5 11.5 0 0 1 20.95 25.83 L 29.66 26.89 Z"/>',
  '<path d="M 22.04 23.25 A 11.5 11.5 0 0 1 29.22 17.84 L 32.65 25.92 Z"/>',
  '</g>',
].join('');

/** Cabeza del pin de animales: sin círculo; solo la huella PNG encima. */
const INTERIOR_PIN_ANIMALES = '';

const pinSvgUrlCache = new Map();

const normalizarCategoriaPin = (category) => {
  const c = String(category || '').trim().toLowerCase();
  if (COLOR_PIN_CATEGORIA[c]) return c;
  if (c.includes('animal') || c.includes('perro') || c.includes('gato')) return 'perros_gatos';
  if (c.includes('perd')) return 'cosas_perdidas';
  if (c.includes('repar')) return 'reparaciones';
  if (c.includes('famil') || c.includes('person')) return 'familias';
  return '';
};

/** SVG: silueta original + color; animales dejan el círculo libre para la PNG de patita */
const urlPinCategoria = (category) => {
  const cat = normalizarCategoriaPin(category);
  const cacheKey = cat === 'perros_gatos' ? 'perros_gatos-v7-sin-circulo' : (cat || 'default');
  if (pinSvgUrlCache.has(cacheKey)) return pinSvgUrlCache.get(cacheKey);
  const color = COLOR_PIN_CATEGORIA[cat] || COLOR_PIN_DEFAULT;
  const interior = cat === 'perros_gatos'
    ? INTERIOR_PIN_ANIMALES
    : `${INTERIOR_PIN_ORIGINAL}<circle cx="32" cy="29" r="3.05" fill="${color}"/>`;
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 88">',
    `<path fill="${color}" stroke="#f7fbff" stroke-width="2.6" stroke-linejoin="round" d="M32 5.2c-13.6 0-24.4 10.6-24.4 24.2C7.6 47.6 32 82.6 32 82.6s24.4-35 24.4-53.2C56.4 15.8 45.6 5.2 32 5.2z"/>`,
    interior,
    '</svg>',
  ].join('');
  const url = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  pinSvgUrlCache.set(cacheKey, url);
  return url;
};

// const libraries = ['marker']; // Eliminado
const mapLibraries = ['visualization', 'places'];
const RADIO_MISMO_CASO_METROS = 50;
const RADIO_LLEGO_DESTINO_METROS = 35;
const RADIO_PASO_GUIA_METROS = 28;
const RADIO_FUERA_RUTA_METROS = 55; // si te alejás más → recalcular (estilo Google)
const RECALC_RUTA_COOLDOWN_MS = 12000;

/** Distancia mínima del punto a la polilínea de la ruta (metros) */
const distanciaAlPathMetros = (punto, path) => {
  if (!punto || !path?.length) return Infinity;
  if (path.length === 1) {
    return distanciaMetros(punto.lat, punto.lng, path[0].lat, path[0].lng);
  }
  const toXY = (q) => {
    const cos = Math.cos((punto.lat * Math.PI) / 180);
    return {
      x: q.lng * cos * 111320,
      y: q.lat * 110540,
    };
  };
  let min = Infinity;
  const P = toXY(punto);
  for (let i = 0; i < path.length - 1; i += 1) {
    const a = path[i];
    const b = path[i + 1];
    const A = toXY(a);
    const B = toXY(b);
    const ABx = B.x - A.x;
    const ABy = B.y - A.y;
    const len2 = ABx * ABx + ABy * ABy;
    let metros;
    if (len2 < 1) {
      metros = distanciaMetros(punto.lat, punto.lng, a.lat, a.lng);
    } else {
      let t = ((P.x - A.x) * ABx + (P.y - A.y) * ABy) / len2;
      t = Math.max(0, Math.min(1, t));
      const projLat = a.lat + t * (b.lat - a.lat);
      const projLng = a.lng + t * (b.lng - a.lng);
      metros = distanciaMetros(punto.lat, punto.lng, projLat, projLng);
    }
    if (metros < min) min = metros;
  }
  return min;
};

const stripHtmlIndicacion = (html) => String(html || '')
  .replace(/<[^>]+>/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const mismosPinesVisibles = (a, b) => {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i];
    const y = b[i];
    if (
      String(x._id) !== String(y._id)
      || Number(x.lat) !== Number(y.lat)
      || Number(x.lng) !== Number(y.lng)
      || x.category !== y.category
      || x.createdBy !== y.createdBy
    ) {
      return false;
    }
  }
  return true;
};

/** Capa de pines aislada: no se re-monta si solo cambia la dirección del buscador / pin central */
const CapaPinesMapa = React.memo(function CapaPinesMapa({
  markers,
  mapaListoTick,
  userId,
  isAdmin,
  highlightedMarkerId,
  modoSoloCaso,
  focoCasoId,
  soloMisReportes,
  onMarkerClick,
}) {
  if (mapaListoTick <= 0) return null;
  // Norte abajo en el DOM → sur arriba: al amontonar con zoom, no “salta” la huella sobre otros
  const ordenados = markers
    .map((marker, index) => ({ marker, index }))
    .sort((a, b) => {
      const latA = Number(a.marker.lat);
      const latB = Number(b.marker.lat);
      if (Number.isFinite(latA) && Number.isFinite(latB) && latA !== latB) {
        return latB - latA;
      }
      return a.index - b.index;
    });
  return ordenados.map(({ marker, index }) => {
    const posicion = { lat: Number(marker.lat), lng: Number(marker.lng) };
    const clave = marker._id || `nuevo-${index}`;
    const esMio = !isAdmin && userId !== 'anonimo' && (marker.createdBy
      ? String(marker.createdBy).trim().toLowerCase()
      : 'anonimo') === userId;
    const destacar = (
      (highlightedMarkerId != null && String(highlightedMarkerId) === String(marker._id))
      || (modoSoloCaso && focoCasoId && String(focoCasoId) === String(marker._id))
      || (soloMisReportes && esMio)
    );
    const anclaX = ANCHO_PIN / 2;
    const anclaY = PUNTA_PIN_Y;
    const esAnimal = normalizarCategoriaPin(marker.category) === 'perros_gatos';
    // z-index geográfico: más al sur = más arriba (evita huella tapando pines vecinos)
    const zGeo = Number.isFinite(posicion.lat)
      ? Math.round((60 - posicion.lat) * 100)
      : index;
    return (
      <OverlayView
        key={clave}
        position={posicion}
        mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
        getPixelPositionOffset={() => ({ x: -anclaX, y: -anclaY })}
        zIndex={destacar ? 100000 + zGeo : zGeo}
      >
        <button
          type="button"
          className={`pin-elegido${esAnimal ? ' pin-animal' : ''}${esMio ? ' pin-mio' : ''}${destacar ? ' pin-elegido-brillo' : ''}${esMio && !destacar ? ' pin-mio-solo' : ''}`}
          style={{
            width: ANCHO_PIN,
            height: ALTO_PIN,
            zIndex: destacar ? 100000 + zGeo : zGeo,
          }}
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onMarkerClick(marker);
          }}
          aria-label={esMio ? 'Tu aviso' : 'Reporte'}
        >
          {destacar && (
            <img
              src={marcadorCiudadLuz}
              alt=""
              className="pin-elegido-luz"
              style={{
                width: ANCHO_LUZ,
                height: ALTO_LUZ,
                left: anclaX - PUNTA_LUZ_X,
                top: anclaY - PUNTA_LUZ_Y,
              }}
            />
          )}
          <img
            src={urlPinCategoria(marker.category)}
            alt=""
            className="pin-elegido-cuerpo"
            style={{
              width: ANCHO_PIN,
              height: ALTO_PIN,
              left: 0,
              top: 0,
            }}
          />
          {esAnimal && (
            <img
              src={iconoPatita}
              alt=""
              className="pin-elegido-patita"
              aria-hidden="true"
            />
          )}
          {esMio && <span className="pin-mio-punto" aria-hidden="true" />}
        </button>
      </OverlayView>
    );
  });
}, (prev, next) => (
  prev.mapaListoTick === next.mapaListoTick
  && prev.userId === next.userId
  && prev.isAdmin === next.isAdmin
  && prev.highlightedMarkerId === next.highlightedMarkerId
  && prev.modoSoloCaso === next.modoSoloCaso
  && String(prev.focoCasoId || '') === String(next.focoCasoId || '')
  && prev.soloMisReportes === next.soloMisReportes
  && prev.onMarkerClick === next.onMarkerClick
  && mismosPinesVisibles(prev.markers, next.markers)
));

/** Rumbo en grados (0 = norte) entre dos puntos */
const rumboEntre = (desde, hasta) => {
  if (!desde || !hasta) return null;
  const toRad = (d) => (d * Math.PI) / 180;
  const toDeg = (r) => (r * 180) / Math.PI;
  const lat1 = toRad(Number(desde.lat));
  const lat2 = toRad(Number(hasta.lat));
  const dLng = toRad(Number(hasta.lng) - Number(desde.lng));
  if (![lat1, lat2, dLng].every(Number.isFinite)) return null;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2)
    - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
};

const tipoManiobra = (texto) => {
  const t = String(texto || '').toLowerCase();
  if (/u-?turn|retorn|media vuelta|dar la vuelta/.test(t)) return 'uturn';
  if (/izquierda|left/.test(t)) return 'izquierda';
  if (/derecha|right/.test(t)) return 'derecha';
  if (/llegaste|destino|destination/.test(t)) return 'llegada';
  return 'recto';
};

const digitosContacto = (valor) => String(valor || '').replace(/\D/g, '');
const contactoValido = (valor) => {
  const d = digitosContacto(valor);
  return d.length >= 8 && d.length <= 15;
};
// wa.me espera país + número (AR móvil: 549 + área sin 0 + número)
const whatsappUrl = (contacto, texto = '') => {
  let d = digitosContacto(contacto);
  if (!d) return null;
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('0')) d = d.slice(1);
  if (!d.startsWith('54')) {
    d = d.startsWith('9') ? `54${d}` : `549${d}`;
  }
  const base = `https://wa.me/${d}`;
  return texto ? `${base}?text=${encodeURIComponent(texto)}` : base;
};

const componenteDireccion = (components, tipo) =>
  (components || []).find((item) => item.types?.includes(tipo))?.long_name || '';

const formatearDireccionCorta = (resultado, municipioForzado = '') => {
  if (!resultado) return '';
  const comps = resultado.address_components || [];
  const ruta = componenteDireccion(comps, 'route');
  const numero = componenteDireccion(comps, 'street_number');
  const ciudad =
    municipioForzado ||
    componenteDireccion(comps, 'locality') ||
    componenteDireccion(comps, 'administrative_area_level_2');
  if (ruta) {
    return armarDireccion({ ruta, numero, ciudad });
  }
  return resultado.formatted_address || '';
};

const alturaDesdeTexto = (texto = '') => {
  const m = String(texto).trim().match(/^(\d+[A-Za-z]?)\b/);
  return m ? m[1] : '';
};

const normalizarLugar = (texto = '') =>
  String(texto)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const MUNICIPIOS_GRAN_TUCUMAN = [
  'san miguel de tucuman',
  'las talitas',
  'tafi viejo',
  'yerba buena',
  'alderetes',
  'banda del rio sali',
  'lastenia',
  'el bracho',
  'cruz alta',
  'lules',
  'famailla',
].map(normalizarLugar);

const mismoMunicipio = (a = '', b = '') => {
  const na = normalizarLugar(a);
  const nb = normalizarLugar(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
};

const esNombreMunicipio = (texto = '') => {
  const n = normalizarLugar(texto);
  return MUNICIPIOS_GRAN_TUCUMAN.some((m) => n === m || n.includes(m) || m.includes(n));
};

const armarDireccion = ({ ruta = '', numero = '', ciudad = '' }) => {
  if (!ruta && !numero) return '';
  const calle = ruta ? (numero ? `${ruta} ${numero}` : ruta) : numero;
  return ciudad ? `${calle}, ${ciudad}` : calle;
};

const ciudadDesdeAddress = (a = {}) =>
  a.city || a.town || a.municipality || a.village || '';

const parseNominatim = (data, municipioForzado = '') => {
  if (!data) return null;
  const a = data.address || {};
  const ruta = a.road || a.pedestrian || a.path || a.residential || '';
  let numero = a.house_number || '';
  if (!numero) numero = alturaDesdeTexto(data.display_name || '');
  if (!numero && data.name && /^\d+[A-Za-z]?$/.test(String(data.name).trim())) {
    numero = String(data.name).trim();
  }
  let ciudad = municipioForzado || ciudadDesdeAddress(a);
  const posibleBarrio = a.suburb || a.neighbourhood || a.quarter || '';
  if (!municipioForzado && posibleBarrio && esNombreMunicipio(posibleBarrio) && !ciudad) {
    ciudad = posibleBarrio;
  }
  return {
    ruta,
    numero,
    ciudad,
    lat: data.lat != null ? Number(data.lat) : null,
    lng: data.lon != null ? Number(data.lon) : null,
    texto: armarDireccion({ ruta, numero, ciudad })
      || (data.display_name || '').split(',').slice(0, 2).join(',').trim(),
  };
};

const parsePhoton = (data, municipioForzado = '') => {
  const feature = data?.features?.[0];
  if (!feature) return null;
  const p = feature.properties || {};
  const coords = feature.geometry?.coordinates || [];
  const ruta = p.street || '';
  const numero = p.housenumber || '';
  let ciudad = municipioForzado || p.city || p.town || '';
  const localidad = p.locality || p.district || p.suburb || '';
  if (!municipioForzado && !ciudad && localidad && esNombreMunicipio(localidad)) {
    ciudad = localidad;
  }
  return {
    ruta: ruta || '',
    numero,
    ciudad: municipioForzado || ciudad,
    lat: coords[1] != null ? Number(coords[1]) : null,
    lng: coords[0] != null ? Number(coords[0]) : null,
    texto: armarDireccion({
      ruta: ruta || p.name || '',
      numero,
      ciudad: municipioForzado || ciudad,
    }),
  };
};

const distanciaMetros = (lat1, lng1, lat2, lng2) => {
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const obtenerMunicipioDelPin = async (lat, lng) => {
  try {
    const url =
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2` +
      `&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}` +
      `&addressdetails=1&zoom=14&accept-language=es`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return '';
    const data = await res.json();
    return ciudadDesdeAddress(data.address || '') || '';
  } catch (_) {
    return '';
  }
};

const buscarAlturaCercana = async (lat, lng, ruta, municipio = '') => {
  if (!ruta) return '';
  try {
    const delta = 0.0007;
    const viewbox = [
      lng - delta,
      lat + delta,
      lng + delta,
      lat - delta,
    ].join(',');
    const cityParam = municipio || 'San Miguel de Tucumán';
    const url =
      `https://nominatim.openstreetmap.org/search?format=jsonv2` +
      `&street=${encodeURIComponent(ruta)}` +
      `&city=${encodeURIComponent(cityParam)}` +
      `&state=${encodeURIComponent('Tucumán')}` +
      `&country=${encodeURIComponent('Argentina')}` +
      `&addressdetails=1&limit=10&countrycodes=ar` +
      `&viewbox=${viewbox}&bounded=1`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return '';
    const data = await res.json();
    const conAltura = (data || [])
      .map((item) => parseNominatim(item, municipio))
      .filter((item) => item?.numero && item.lat != null && item.lng != null)
      .filter((item) => !municipio || !item.ciudad || mismoMunicipio(item.ciudad, municipio))
      .map((item) => ({
        ...item,
        metros: distanciaMetros(lat, lng, item.lat, item.lng),
      }))
      .filter((item) => item.metros <= 90)
      .sort((a, b) => a.metros - b.metros);
    return conAltura[0]?.numero || '';
  } catch (_) {
    return '';
  }
};

const completarConAltura = async (lat, lng, parsed, municipio = '') => {
  if (!parsed) return '';
  const ciudad = municipio || parsed.ciudad || '';
  if (parsed.numero) {
    return armarDireccion({ ruta: parsed.ruta, numero: parsed.numero, ciudad });
  }
  const altura = await buscarAlturaCercana(Number(lat), Number(lng), parsed.ruta, ciudad);
  return armarDireccion({
    ruta: parsed.ruta,
    numero: altura || '',
    ciudad,
  });
};

const obtenerDireccionPhoton = async (lat, lng, municipio = '') => {
  try {
    const url =
      `https://photon.komoot.io/reverse?lat=${encodeURIComponent(lat)}` +
      `&lon=${encodeURIComponent(lng)}`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    const parsed = parsePhoton(await res.json(), municipio);
    if (parsed?.lat != null && parsed?.lng != null) {
      const metros = distanciaMetros(Number(lat), Number(lng), parsed.lat, parsed.lng);
      if (metros > 150) {
        return {
          ruta: '',
          numero: '',
          ciudad: municipio || parsed.ciudad,
          lat: Number(lat),
          lng: Number(lng),
          texto: '',
        };
      }
    }
    if (
      municipio &&
      parsed?.ciudad &&
      !mismoMunicipio(parsed.ciudad, municipio) &&
      !municipio
    ) {
      parsed.ciudad = municipio;
    }
    if (municipio) {
      parsed.ciudad = municipio;
      parsed.texto = armarDireccion({
        ruta: parsed.ruta,
        numero: parsed.numero,
        ciudad: municipio,
      });
    }
    return parsed;
  } catch (_) {
    return null;
  }
};

const obtenerDireccionNominatim = async (lat, lng, municipio = '') => {
  try {
    const url =
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2` +
      `&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}` +
      `&addressdetails=1&zoom=18&accept-language=es`;
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    return parseNominatim(await res.json(), municipio);
  } catch (_) {
    return null;
  }
};

const obtenerDireccionGoogle = (lat, lng) =>
  new Promise((resolve) => {
    if (!window.google?.maps?.Geocoder) {
      resolve('');
      return;
    }
    let listo = false;
    const terminar = (texto) => {
      if (listo) return;
      listo = true;
      resolve(texto || '');
    };
    const timer = setTimeout(() => terminar(''), 3500);
    try {
      const geocoder = new window.google.maps.Geocoder();
      geocoder.geocode(
        { location: { lat: Number(lat), lng: Number(lng) }, language: 'es' },
        (results, status) => {
          clearTimeout(timer);
          if (status !== 'OK' || !results?.length) {
            terminar('');
            return;
          }
          // Preferir resultado con altura (street_number)
          const conAltura = results.find((item) =>
            (item.address_components || []).some((c) => c.types?.includes('street_number'))
          );
          const preferido =
            conAltura ||
            results.find((item) => item.types?.includes('street_address')) ||
            results.find((item) => item.types?.includes('route')) ||
            results[0];
          terminar(formatearDireccionCorta(preferido));
        }
      );
    } catch (_) {
      clearTimeout(timer);
      terminar('');
    }
  });

const cacheDireccion = new Map();
const claveCacheDireccion = (lat, lng) =>
  `${Number(lat).toFixed(4)},${Number(lng).toFixed(4)}`;

const obtenerDireccionDesdeBackend = async (lat, lng) => {
  try {
    const res = await fetch(
      `http://localhost:5001/api/geocode/reverse?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`
    );
    if (!res.ok) return '';
    const data = await res.json();
    return String(data.direccion || '').trim();
  } catch (_) {
    return '';
  }
};

const obtenerDireccionDesdePunto = async (lat, lng) => {
  const clave = claveCacheDireccion(lat, lng);
  if (cacheDireccion.has(clave)) return cacheDireccion.get(clave);

  // 1) Google Geocoder en el cliente (rápido si el mapa ya cargó)
  let texto = await obtenerDireccionGoogle(lat, lng);

  // 2) Backend: Google Geocoding + fallback OSM
  if (!texto) {
    texto = await obtenerDireccionDesdeBackend(lat, lng);
  }

  if (!texto) {
    const photon = await obtenerDireccionPhoton(lat, lng, '');
    if (photon?.ruta || photon?.numero) {
      texto = armarDireccion({
        ruta: photon.ruta,
        numero: photon.numero,
        ciudad: photon.ciudad,
      });
    }
  }

  if (texto) cacheDireccion.set(clave, texto);
  return texto || '';
};

const OFICINAS_FAMILIAS = {
  violencia: {
    titulo: 'Oficina de Violencia Doméstica',
    llamar: { href: 'tel:+543813990988', texto: 'Llamar al 381 399-0988' },
    nota: 'Si está pasando ahora:',
    extras: [
      { href: 'tel:911', texto: '911' },
      { href: 'tel:144', texto: '144' },
    ],
  },
  hijos: {
    titulo: 'Línea 102',
    detalle: 'De 8 a 20.',
    llamar: { href: 'tel:102', texto: 'Llamar al 102' },
    extras: [
      { href: 'tel:+543814310980', texto: 'Niñez: 381 431-0980' },
    ],
  },
};

const textoPlano = (valor) => String(valor || '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '');

const oficinaCalle = (jurisdiccion) => {
  const nombre = textoPlano(jurisdiccion);
  if (nombre.includes('san miguel')) {
    return {
      titulo: 'Programa Proteger',
      detalle: 'Dirección de Familia. Las 24 horas.',
      llamar: { href: 'tel:103', texto: 'Llamar al 103' },
      extras: [{ href: 'https://wa.me/543812232140', texto: 'WhatsApp 381 223-2140' }],
    };
  }
  return {
    titulo: 'Defensa Civil',
    detalle: 'Las 24 horas.',
    llamar: { href: 'tel:103', texto: 'Llamar al 103' },
    extras: [],
  };
};

const ANIMAL_TIPOS = {
  abandonado: 'Abandonado en la calle',
  perdido: 'Perdido',
  adopcion: 'En adopción',
};

const OFICINA_ANIMALES = {
  titulo: 'Área de animales',
  detalle: 'Número de prueba. El equipo todavía no existe.',
  llamar: { href: 'tel:+543810000000', texto: 'Llamar al 381 000-0000' },
  extras: [],
};

const oficinasDelCaso = (tipo, jurisdiccion) => {
  if (tipo === 'calle') return [oficinaCalle(jurisdiccion)];
  if (OFICINAS_FAMILIAS[tipo]) return [OFICINAS_FAMILIAS[tipo]];
  return [OFICINAS_FAMILIAS.violencia, OFICINAS_FAMILIAS.hijos];
};

const IconoUbicacion = () => (
  <svg className="icono-ubicacion" viewBox="0 0 24 24" aria-hidden="true">
    <path
      fill="currentColor"
      d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 14.5 9 2.5 2.5 0 0 1 12 11.5z"
    />
  </svg>
);

const textoMunicipio = (nombre) => nombre || 'Fuera de las jurisdicciones registradas';

/** Normaliza texto para buscar coincidencias en el Radar (sin acentos, minúsculas). */
const normalizarBusquedaRadar = (valor) => String(valor || '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/\s+/g, ' ')
  .trim();

const coincideBusquedaRadar = (marker, consulta) => {
  const q = normalizarBusquedaRadar(consulta);
  if (!q) return true;
  if (!marker) return false;
  const animalLabel = marker.animalTipo && ANIMAL_TIPOS[marker.animalTipo]
    ? ANIMAL_TIPOS[marker.animalTipo]
    : '';
  const haystack = normalizarBusquedaRadar([
    marker.objeto,
    marker.description,
    marker.direccion,
    marker.perdidaTipo,
    animalLabel,
    marker.animalTipo,
  ].filter(Boolean).join(' '));
  const palabras = q.split(' ').filter(Boolean);
  return palabras.every((p) => haystack.includes(p));
};

const esCasoFamilia = (category) => category === 'familias' || category === 'persona';

const tipoDeFamilia = (marker) => {
  if (!marker) return '';
  if (marker.category === 'persona') return 'calle';
  return marker.familiasTipo || '';
};

const buscarReparacionesCercanas = (lista, lat, lng) => lista
  .filter((marker) => {
    if (marker.category !== 'reparaciones') return false;
    if (marker.status !== 'pendiente' && marker.status !== 'en_proceso') return false;
    if (!Number.isFinite(Number(marker.lat)) || !Number.isFinite(Number(marker.lng))) return false;
    return distanciaMetros(lat, lng, Number(marker.lat), Number(marker.lng)) <= RADIO_MISMO_CASO_METROS;
  })
  .map((marker) => ({
    ...marker,
    metros: Math.round(distanciaMetros(lat, lng, Number(marker.lat), Number(marker.lng))),
  }))
  .sort((a, b) => a.metros - b.metros)
  .slice(0, 3);

const TIPOS_NOTIF_PANEL_ADMIN = new Set(['por_aprobar', 'nuevo_reporte', 'nueva_perdida']);
const RADAR_VISTA_KEY = 'ciudadar-radar-vista';
const MIS_REPORTES_VISTA_KEY = 'ciudadar-mis-reportes-vista';
const ANIMAL_FILTROS_RADAR = new Set(['todos', 'perdido', 'abandonado', 'adopcion']);
const leerRadarVistaGuardada = () => {
  try {
    const raw = sessionStorage.getItem(RADAR_VISTA_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return null;
    const radio = Number(data.cercaRadio);
    return {
      abierto: !!data.abierto,
      modo: data.modo === 'animales' ? 'animales' : 'cosas',
      seccion: data.seccion === 'activos' ? 'activos' : 'cerca',
      animalFiltro: ANIMAL_FILTROS_RADAR.has(data.animalFiltro) ? data.animalFiltro : 'todos',
      cercaOrigen: data.cercaOrigen === 'mapa' || data.cercaOrigen === 'vigilada'
        ? data.cercaOrigen
        : 'gps',
      cercaRadio: Number.isFinite(radio)
        ? Math.min(8000, Math.max(500, radio))
        : 2500,
      busqueda: typeof data.busqueda === 'string' ? data.busqueda.slice(0, 120) : '',
    };
  } catch {
    return null;
  }
};

/** Solo recuerda si estaba abierto y la pestaña; los filtros vuelven siempre a los defaults. */
const leerMisReportesVistaGuardada = () => {
  try {
    const raw = sessionStorage.getItem(MIS_REPORTES_VISTA_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return null;
    return {
      abierto: !!data.abierto,
      seccion: data.seccion === 'registro' ? 'registro' : 'activos',
    };
  } catch {
    return null;
  }
};

function MapComponent({
  googleMapsApiKey,
  currentUser,
  panelVecino = null,
  onPanelVecinoVisto,
  onNoLeidasChange,
  onPerdidasNoLeidasChange,
  onAbrirCasoAdmin = null,
  focoCasoMapa = null,
  onFocoCasoVisto,
  modoSoloCaso = false,
  onCerrarSoloCaso,
  habilitarGuiaGps = false,
  autoIniciarGuia = false,
  onGuiaIniciada = null,
}) {
  const userId = currentUser ? String(currentUser).trim().toLowerCase() : 'anonimo';
  const [markers, setMarkers] = useState([]);
  const [selectedImage, setSelectedImage] = useState(null);
  const [formData, setFormData] = useState({
    lat: 0,
    lng: 0,
    image: null,
    date: '',
    time: '',
    description: '',
    direccion: '',
    status: 'pendiente_aprobacion',
    category: 'reparaciones',
    familiasTipo: '',
    animalTipo: '',
    perdidaTipo: '',
    objeto: '',
    contacto: '',
    resolvedAt: null,
  });
  const [telefonoUsuario, setTelefonoUsuario] = useState('');
  const [mostrarChatReclamo, setMostrarChatReclamo] = useState(false);
  const [reclamando, setReclamando] = useState(false);
  const [showPopup, setShowPopup] = useState(false);
  const [editMode, setEditMode] = useState(null); // Estado para el modo de edición
  const [userLocation, setUserLocation] = useState(null); // Punto azul: dónde está la persona
  const [mapCenter, setMapCenter] = useState({ lat: -26.8084602, lng: -65.2175701 });
  const mapCenterRef = useRef(mapCenter);
  mapCenterRef.current = mapCenter;
  const [direccionPreview, setDireccionPreview] = useState('');
  // Clase "moviendo" del pin central: vía DOM (no setState) para no re-renderizar OverlayViews
  const pinCentralRefs = useRef([]);
  const highlightedMarkerIdRef = useRef(null);
  const ocultarPunteroMapaRef = useRef(false);
  const mapaOpciones = useMemo(() => ({
    mapTypeId: 'roadmap',
    streetViewControl: false,
    mapTypeControl: false,
    fullscreenControl: false,
    zoomControl: false,
    // Sin íconos de negocios/POI: no se confunden con los pines de CiudadAr
    styles: [
      { featureType: 'poi', stylers: [{ visibility: 'off' }] },
      { featureType: 'poi.business', stylers: [{ visibility: 'off' }] },
      { featureType: 'transit', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
    ],
  }), []);
  const mapaContainerStyle = useMemo(() => ({ width: '100%', height: '100%' }), []);
  const [guiaActiva, setGuiaActiva] = useState(false);
  const [guiaCargando, setGuiaCargando] = useState(false);
  const [guiaError, setGuiaError] = useState('');
  const [guiaPath, setGuiaPath] = useState([]);
  const [guiaPasos, setGuiaPasos] = useState([]);
  const [guiaPasoIdx, setGuiaPasoIdx] = useState(0);
  const [guiaResumen, setGuiaResumen] = useState('');
  const [guiaLlego, setGuiaLlego] = useState(false);
  const [guiaDestino, setGuiaDestino] = useState(null);
  const [userHeading, setUserHeading] = useState(null); // grados, 0 = norte
  const [guiaSimulando, setGuiaSimulando] = useState(false);
  const [guiaRecalculando, setGuiaRecalculando] = useState(false);
  const yaCentroUsuario = useRef(false);
  const guiaActivaRef = useRef(false);
  const destinoGuiaRef = useRef(null);
  const autoGuiaPedidaRef = useRef(false);
  const ultimaPosGuiaRef = useRef(null);
  const brujulaTsRef = useRef(0); // si hay brújula reciente, no pisa el rumbo el GPS
  const guiaSimulandoRef = useRef(false);
  const guiaSimTimerRef = useRef(null);
  const guiaPathRef = useRef([]);
  const guiaRecalcTsRef = useRef(0);
  const guiaRecalcEnCursoRef = useRef(false);
  const mapRef = useRef(null);
  const mapaLienzoRef = useRef(null);
  const puntoElegidoRef = useRef(null);
  const idleTimerRef = useRef(null);
  const omitirIdleRef = useRef(false);
  const bloquearAutoDireccionRef = useRef(false);
  const showPopupRef = useRef(false);
  const [geoError, setGeoError] = useState(null); // Estado para almacenar errores de geolocalización

  useEffect(() => {
    showPopupRef.current = showPopup;
  }, [showPopup]);
  const [categoryFilter, setCategoryFilter] = useState('todas'); // Filtro de categoría
  const [animalFilter, setAnimalFilter] = useState('todos');
  const [isImageZoomed, setIsImageZoomed] = useState(false); // Estado para zoom de la imagen
  const [canEdit, setCanEdit] = useState(true);
  const [showDeleteOnly, setShowDeleteOnly] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminRole, setAdminRole] = useState(null);
  const [adminJurisdictions, setAdminJurisdictions] = useState([]);
  const statusOptions = ['pendiente_aprobacion', 'pendiente', 'en_proceso', 'pendiente_cierre', 'resuelto', 'rechazado'];
  const categoryOptions = [
    { value: 'reparaciones', label: 'Reparaciones' },
    { value: 'familias', label: 'Familias' },
    { value: 'perros_gatos', label: 'Perros y gatos' },
    { value: 'cosas_perdidas', label: 'Cosas perdidas' },
  ];
  const [highlightedMarkerId, setHighlightedMarkerId] = useState(null);
  highlightedMarkerIdRef.current = highlightedMarkerId;
  // Tras elegir un aviso: ocultar el puntero celeste hasta que el usuario mueva el mapa
  const [ocultarPunteroMapa, setOcultarPunteroMapa] = useState(false);
  ocultarPunteroMapaRef.current = ocultarPunteroMapa;
  const omitirRestaurarPunteroRef = useRef(false); // pan/zoom programático no debe devolver el puntero
  const [deletedMarker, setDeletedMarker] = useState(null); // Caso eliminado temporalmente para poder deshacer
  const [deleteCountdown, setDeleteCountdown] = useState(10); // Contador de segundos para eliminar
  const [resolutionPhoto, setResolutionPhoto] = useState(null);
  const [resolutionPreview, setResolutionPreview] = useState(null);
  const [resolutionDescription, setResolutionDescription] = useState('');
  const [mostrarResolucion, setMostrarResolucion] = useState(false);
  const [editandoResolucion, setEditandoResolucion] = useState(false);
  const [verDetalleResolucion, setVerDetalleResolucion] = useState(false);
  const [confirmarRecupero, setConfirmarRecupero] = useState(false);
  const [confirmandoRecupero, setConfirmandoRecupero] = useState(false);
  const [respuestaDatos, setRespuestaDatos] = useState('');
  const [fotoRespuestaDatos, setFotoRespuestaDatos] = useState(null);
  const [previewRespuestaDatos, setPreviewRespuestaDatos] = useState(null);
  const [enviandoRespuestaDatos, setEnviandoRespuestaDatos] = useState(false);
  const [mostrarOpcionesFotoRespuesta, setMostrarOpcionesFotoRespuesta] = useState(false);
  const [busquedaAdmin, setBusquedaAdmin] = useState('');
  const [filtroCategoriaAdmin, setFiltroCategoriaAdmin] = useState('todas');
  const [filtroEstadoAdmin, setFiltroEstadoAdmin] = useState('todos');
  const [soloPorAprobar, setSoloPorAprobar] = useState(false);
  const [soloUrgentes, setSoloUrgentes] = useState(false);
  const [soloResueltosVecino, setSoloResueltosVecino] = useState(false);
  const [mostrarCercanos, setMostrarCercanos] = useState(false);
  const [casosCercanos, setCasosCercanos] = useState([]);
  const [sumandoCaso, setSumandoCaso] = useState(null);
  const [avisoVecino, setAvisoVecino] = useState('');
  const [avisoEsAlerta, setAvisoEsAlerta] = useState(false);
  const [recienPublicado, setRecienPublicado] = useState(false);
  const [editorImagenSrc, setEditorImagenSrc] = useState(null);
  const [editorDestino, setEditorDestino] = useState('aviso'); // aviso | resolucion | respuesta
  const [mostrarCamara, setMostrarCamara] = useState(false);
  const [mostrarOpcionesFoto, setMostrarOpcionesFoto] = useState(false);
  const inputGaleriaRef = useRef(null);
  const inputCamaraRef = useRef(null);
  const inputGaleriaResolucionRef = useRef(null);
  const inputCamaraResolucionRef = useRef(null);
  const inputGaleriaRespuestaRef = useRef(null);
  const inputCamaraRespuestaRef = useRef(null);
  const [soloMisReportes, setSoloMisReportes] = useState(false);
  const [soloMiJurisdiccion, setSoloMiJurisdiccion] = useState(false);
  const [misReportesVistaInicial] = useState(() => (modoSoloCaso ? null : leerMisReportesVistaGuardada()));
  const [radarVistaInicial] = useState(() => (modoSoloCaso ? null : leerRadarVistaGuardada()));
  const [mostrarMisReportes, setMostrarMisReportes] = useState(() => !!misReportesVistaInicial?.abierto);
  // Si Mis reportes estaba abierto al refrescar, no restaurar Radar encima
  const [mostrarCosasPerdidas, setMostrarCosasPerdidas] = useState(
    () => !!radarVistaInicial?.abierto && !misReportesVistaInicial?.abierto
  );
  const [misReportesSeccion, setMisReportesSeccion] = useState(
    () => misReportesVistaInicial?.seccion || 'activos'
  ); // activos | registro
  const [misReportesActivos, setMisReportesActivos] = useState([]);
  const [misReportesRegistro, setMisReportesRegistro] = useState([]);
  // Filtros: siempre defaults al montar (no se heredan de sesión anterior)
  const [misBusqueda, setMisBusqueda] = useState('');
  const [misBusquedaDebounced, setMisBusquedaDebounced] = useState('');
  const [misFiltroEstado, setMisFiltroEstado] = useState('');
  const [misFiltroCategoria, setMisFiltroCategoria] = useState('');
  const [misFiltroRegistroCategoria, setMisFiltroRegistroCategoria] = useState('reparaciones');
  const [misFiltroRegistroTipo, setMisFiltroRegistroTipo] = useState('');
  const [misFiltroRegistroPeriodo, setMisFiltroRegistroPeriodo] = useState('7');
  const [misFiltroRegistroDesde, setMisFiltroRegistroDesde] = useState('');
  const [misFiltroRegistroHasta, setMisFiltroRegistroHasta] = useState('');
  const [radarModo, setRadarModo] = useState(() => radarVistaInicial?.modo || 'cosas'); // cosas | animales
  const [perdidasSeccion, setPerdidasSeccion] = useState(() => radarVistaInicial?.seccion || 'cerca'); // cerca | activos
  const [animalFiltroRadar, setAnimalFiltroRadar] = useState(() => radarVistaInicial?.animalFiltro || 'todos');
  const [perdidasLista, setPerdidasLista] = useState([]);
  // Pines del mapa en Cerca: se acumulan al buscar (no parpadean al mover el radio)
  const [pinesCercaMapa, setPinesCercaMapa] = useState([]);
  const [radarBusqueda, setRadarBusqueda] = useState(() => radarVistaInicial?.busqueda || '');
  const [radarVistaAmpliada, setRadarVistaAmpliada] = useState(false);
  const [perdidasNoLeidasLocal, setPerdidasNoLeidasLocal] = useState(0);
  const [cercaOrigen, setCercaOrigen] = useState(() => radarVistaInicial?.cercaOrigen || 'gps'); // gps | mapa | vigilada
  const [cercaRadioMetros, setCercaRadioMetros] = useState(() => radarVistaInicial?.cercaRadio || 2500);
  const cercaRadioMetrosRef = useRef(cercaRadioMetros);
  const radarModoRef = useRef(radarModo);
  const animalFiltroRadarRef = useRef(animalFiltroRadar);
  const radarRestauradoRef = useRef(!!radarVistaInicial?.abierto && !misReportesVistaInicial?.abierto);
  const misReportesRestauradoRef = useRef(!!misReportesVistaInicial?.abierto);
  const [zonaAlerta, setZonaAlerta] = useState(null); // { lat, lng, radio }
  const [guardandoZonaAlerta, setGuardandoZonaAlerta] = useState(false);
  const perdidasCercaActivoRef = useRef(false);
  const cercaOrigenRef = useRef(cercaOrigen);
  const ignorarDragCercaRef = useRef(false);
  const cercaReloadTimerRef = useRef(null);
  const perdidasFetchSeqRef = useRef(0);
  const cercaGpsListoRef = useRef(false);
  const ultimoCercaGpsFetchRef = useRef(null); // { lat, lng } último punto con el que pedimos cerca
  const cercaGpsFetchTimerRef = useRef(null);
  const radioCercaCircleRef = useRef(null); // radio de búsqueda (azul / naranja)
  const radioVigiladaCircleRef = useRef(null); // radio verde persistente de zona vigilada
  const [mapaListoTick, setMapaListoTick] = useState(0);
  const [idRegistroDestacado, setIdRegistroDestacado] = useState(null);
  const [idPerdidaDestacada, setIdPerdidaDestacada] = useState(null);
  const ultimaUbicacionEnviadaRef = useRef({ at: 0, lat: null, lng: null });
  const [misPage, setMisPage] = useState(1);
  const [misMeta, setMisMeta] = useState({ total: 0, hasMore: false, limit: 8 });
  const [cargandoMisLista, setCargandoMisLista] = useState(false);
  const [renovandoId, setRenovandoId] = useState(null);
  const MIS_PAGE_SIZE = 8;
  const MIS_REPORTES_PAGE_SIZE = 20;
  const [mostrarFiltros, setMostrarFiltros] = useState(false);
  const [mostrarNotificaciones, setMostrarNotificaciones] = useState(false);
  const [notificaciones, setNotificaciones] = useState([]);
  const [noLeidasLocal, setNoLeidasLocal] = useState(0);

  const avisoTimerRef = useRef(null);
  const [avisoAccion, setAvisoAccion] = useState(null); // { label, onClick }
  const mostrarAviso = (texto, alerta = false, accion = null) => {
    if (avisoTimerRef.current) clearTimeout(avisoTimerRef.current);
    setAvisoEsAlerta(alerta);
    setAvisoVecino(texto);
    setAvisoAccion(accion);
    if (!alerta) {
      avisoTimerRef.current = setTimeout(() => {
        setAvisoVecino('');
        setAvisoEsAlerta(false);
        setAvisoAccion(null);
      }, 4500);
    }
  };
  const cerrarAvisoVecino = () => {
    if (avisoTimerRef.current) clearTimeout(avisoTimerRef.current);
    setAvisoVecino('');
    setAvisoEsAlerta(false);
    setAvisoAccion(null);
  };
  const notifApuntaAlRegistro = (aviso) => {
    const tipo = String(aviso?.tipo || '');
    const msg = String(aviso?.mensaje || '').toLowerCase();
    return tipo === 'rechazado'
      || msg.includes('registro')
      || msg.includes('resuelto')
      || msg.includes('anulado')
      || msg.includes('ya no aparece')
      || msg.includes('no está disponible');
  };
  const casoEstaCerrado = (m) => (
    Boolean(m?.eliminadoAt)
    || m?.status === 'resuelto'
    || m?.status === 'rechazado'
  );
  const [avisando, setAvisando] = useState(null);
  const ignorarCercanosRef = useRef(false);
  const [estadosPendientes, setEstadosPendientes] = useState({});
  const [guardandoEstado, setGuardandoEstado] = useState(null);
  const deleteTimeoutRef = useRef(null); // Referencia al timeout de eliminación
  const countdownIntervalRef = useRef(null); // Referencia al intervalo del contador
  const idsEnBorradoRef = useRef(new Set());
  // Casos traídos desde el dashboard admin que pueden no estar en el listado público
  const casosAdminForzadosRef = useRef(new Map());
  const statusLabels = {
    pendiente_aprobacion: 'En revisión',
    pendiente: 'Publicado / pendiente de atención',
    en_proceso: 'El municipio lo está atendiendo',
    pendiente_cierre: 'Cierre propuesto · esperando confirmación',
    resuelto: 'Resuelto',
    rechazado: 'Anulado',
  };

  /** Etiqueta de estado en el popup vecino (según categoría) */
  const etiquetaEstadoPopup = (status, datos = formData) => {
    if (datos.category === 'perros_gatos' && datos.animalTipo === 'abandonado' && datos.avisadoAt) {
      return 'Oficina avisada';
    }
    if (status === 'pendiente') {
      if (datos.category === 'perros_gatos') {
        // Solo abandonados esperan atención municipal; perdido/adopción son entre vecinos
        if (datos.animalTipo === 'abandonado' && !datos.avisadoAt) {
          return 'Publicado / pendiente de atención';
        }
        return 'Publicado';
      }
      if (datos.category === 'cosas_perdidas') return 'Publicado';
    }
    return statusLabels[status] || status;
  };
  const statusBadgeColors = {
    pendiente_aprobacion: { bg: '#fef3c7', color: '#92400e' },
    pendiente: { bg: '#dbeafe', color: '#1e40af' },
    en_proceso: { bg: '#bfdbfe', color: '#1e3a8a' },
    pendiente_cierre: { bg: '#fce7f3', color: '#9d174d' },
    resuelto: { bg: '#dcfce7', color: '#166534' },
    rechazado: { bg: '#fee2e2', color: '#991b1b' },
  };
  const categoryLabels = useMemo(
    () => ({
      familias: 'Familias',
      perros_gatos: 'Perros y gatos',
      reparaciones: 'Reparaciones',
      cosas_perdidas: 'Cosas perdidas',
    }),
    []
  );
  const perdidaLabels = {
    perdi: 'Perdí algo',
    encontre: 'Encontré algo',
  };
const TEN_DAYS_MS = 10 * 24 * 60 * 60 * 1000;
const FIFTEEN_DAYS_MS = 15 * 24 * 60 * 60 * 1000;

const getStatusBadgeStyle = (status) => {
  const paleta = statusBadgeColors[status] || { bg: '#e5e7eb', color: '#1f2937' };
  return {
    background: paleta.bg,
    color: paleta.color,
    padding: '3px 8px',
    borderRadius: '8px',
    fontSize: '11px',
    fontWeight: 700,
    display: 'inline-block',
    width: 'fit-content',
    lineHeight: 1.25,
    fontFamily: "'IBM Plex Sans', sans-serif",
  };
};

const getDaysUntil = (dateString, limitMs) => {
  if (!dateString) return null;
  const diff = limitMs - (Date.now() - new Date(dateString).getTime());
  if (diff <= 0) return 0;
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
};

const getDaysUntilRemoval = (dateString) => getDaysUntil(dateString, TEN_DAYS_MS);

const getDaysUntilAvisoExpiry = (dateString) => getDaysUntil(dateString, FIFTEEN_DAYS_MS);

const esPublicacionVencida = (marker) => (
  Boolean(marker?.eliminadoAt)
  && String(marker?.motivoEliminacion || '').toLowerCase().includes('vencimiento')
);
  const normalizeCategoryValue = useCallback(
    (value) => {
      if (!value) return 'reparaciones';
      const normalized = String(value).trim().toLowerCase();
      // legado: persona (= calle) → familias
      if (normalized === 'persona' || normalized.includes('persona')) return 'familias';
      if (categoryLabels[normalized]) return normalized;
      if (normalized.includes('familia')) return 'familias';
      if (normalized.includes('perro') || normalized.includes('gato')) return 'perros_gatos';
      if (normalized.includes('repar')) return 'reparaciones';
      if (normalized.includes('perdid') || normalized.includes('encontr')) return 'cosas_perdidas';
      return 'reparaciones';
    },
    [categoryLabels]
  );

const stopPropagation = (event) => {
  event.stopPropagation();
};

const stopTouchPropagation = (event) => {
  event.stopPropagation();
};

  const handleCategoryChange = (e) => {
    const category = normalizeCategoryValue(e.target.value);
    setFormData({
      ...formData,
      category,
      familiasTipo: category === 'familias' ? formData.familiasTipo : '',
      animalTipo: category === 'perros_gatos' ? formData.animalTipo : '',
      perdidaTipo: category === 'cosas_perdidas' ? formData.perdidaTipo : '',
      objeto: category === 'cosas_perdidas' ? formData.objeto : '',
      contacto: category === 'perros_gatos'
        ? (formData.contacto || telefonoUsuario || '')
        : '',
    });
  };

  const buildImageUrl = useCallback(
    (path) => {
      if (!path) return null;
      if (path.startsWith('data:')) return path;
      if (path.startsWith('http://') || path.startsWith('https://')) {
        return path;
      }
      return `http://localhost:5001${path}`;
    },
    []
  );

  const handleImageError = useCallback(() => {
    setSelectedImage(null);
  }, []);

  // Obtener y seguir la geolocalización del usuario (como un punto azul en tiempo "real")
  useEffect(() => {
    if (!navigator.geolocation) {
      setGeoError('Geolocalización no soportada por el navegador.');
      return;
    }
    // En "ver un solo caso" el centro lo marca el pin, no la ubicación del admin
    if (modoSoloCaso) {
      yaCentroUsuario.current = true;
    }

    const handleSuccess = (position) => {
      // Durante la simulación de prueba no pisamos la posición animada
      if (guiaSimulandoRef.current) return;
      const { latitude, longitude, heading, speed } = position.coords;
      const current = { lat: latitude, lng: longitude };
      // Misma referencia si casi no se movió → evita que el punto azul parpadee/desaparezca
      setUserLocation((prev) => {
        if (
          prev
          && distanciaMetros(prev.lat, prev.lng, current.lat, current.lng) < 4
        ) {
          return prev;
        }
        return current;
      });
      setGeoError(null);

      // Rumbo GPS solo si la brújula no está activa (últimos 1.5 s)
      const brujulaReciente = Date.now() - brujulaTsRef.current < 1500;
      if (!brujulaReciente) {
        let rumbo = (typeof heading === 'number' && !Number.isNaN(heading) && heading >= 0)
          ? heading
          : null;
        if (rumbo == null && ultimaPosGuiaRef.current) {
          const metros = distanciaMetros(
            ultimaPosGuiaRef.current.lat,
            ultimaPosGuiaRef.current.lng,
            current.lat,
            current.lng
          );
          if (metros > 4 || (typeof speed === 'number' && speed > 1)) {
            rumbo = rumboEntre(ultimaPosGuiaRef.current, current);
          }
        }
        if (rumbo != null) setUserHeading(rumbo);
      }
      ultimaPosGuiaRef.current = current;

      if (guiaActivaRef.current && mapRef.current) {
        mapRef.current.panTo(current);
      } else if (!modoSoloCaso && !yaCentroUsuario.current) {
        yaCentroUsuario.current = true;
        setMapCenter(current);
        if (mapRef.current) mapRef.current.panTo(current);
      }
    };

    const handleError = (error) => {
        // TIMEOUT intermitente del watch: no borrar el último punto ni spamear error
        if (error?.code === error.TIMEOUT) {
          console.warn('Geolocalización: timeout (se mantiene la última posición)');
          return;
        }
        let errorMessage = '';
        switch (error.code) {
          case error.PERMISSION_DENIED:
          errorMessage = 'Permiso de ubicación denegado. Por favor, habilítalo.';
            break;
          case error.POSITION_UNAVAILABLE:
          errorMessage = 'Ubicación no disponible. Intenta más tarde.';
            break;
          default:
          errorMessage = 'Error desconocido al obtener la ubicación.';
        }
        console.error('Error getting user location:', error);
        setGeoError(errorMessage);
    };

    const geoOpts = {
      enableHighAccuracy: true,
      maximumAge: 30000,
      timeout: 25000,
    };

    navigator.geolocation.getCurrentPosition(handleSuccess, handleError, geoOpts);

    const watchId = navigator.geolocation.watchPosition(handleSuccess, handleError, geoOpts);

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [modoSoloCaso]);

  const detenerSimulacionGuia = useCallback(() => {
    guiaSimulandoRef.current = false;
    setGuiaSimulando(false);
    if (guiaSimTimerRef.current) {
      window.clearInterval(guiaSimTimerRef.current);
      guiaSimTimerRef.current = null;
    }
  }, []);

  const detenerGuiaGps = useCallback(() => {
    detenerSimulacionGuia();
    guiaActivaRef.current = false;
    guiaRecalcEnCursoRef.current = false;
    setGuiaActiva(false);
    setGuiaCargando(false);
    setGuiaRecalculando(false);
    setGuiaError('');
    setGuiaPath([]);
    guiaPathRef.current = [];
    setGuiaPasos([]);
    setGuiaPasoIdx(0);
    setGuiaResumen('');
    setGuiaLlego(false);
    destinoGuiaRef.current = null;
    setGuiaDestino(null);
    setUserHeading(null);
    brujulaTsRef.current = 0;
  }, [detenerSimulacionGuia]);

  const aplicarRutaGuia = useCallback((data, origen, destino, { ajustarVista = false } = {}) => {
    const path = Array.isArray(data.path) ? data.path : [];
    const pasos = (Array.isArray(data.steps) ? data.steps : []).map((step) => ({
      instruction: stripHtmlIndicacion(step.instruction),
      distance: step.distance || '',
      end: step.end,
    })).filter((s) => s.end && Number.isFinite(s.end.lat) && Number.isFinite(s.end.lng));

    if (path.length < 2) throw new Error('Sin tramo');

    setGuiaPath(path);
    guiaPathRef.current = path;
    setGuiaPasos(pasos);
    setGuiaPasoIdx(0);
    setGuiaResumen(data.resumen || [data.distanceText, data.durationText].filter(Boolean).join(' · '));
    setGuiaLlego(false);
    setGuiaError('');
    const primerRumbo = pasos[0]?.end ? rumboEntre(origen, pasos[0].end) : rumboEntre(origen, destino);
    if (primerRumbo != null) setUserHeading(primerRumbo);

    if (ajustarVista && mapRef.current && path.length && window.google?.maps) {
      const bounds = new window.google.maps.LatLngBounds();
      path.forEach((p) => bounds.extend(p));
      bounds.extend(origen);
      bounds.extend(destino);
      mapRef.current.fitBounds(bounds, 48);
    }
  }, []);

  const recalcularRutaGuia = useCallback(async (origen) => {
    const destino = destinoGuiaRef.current;
    if (!destino || !origen || guiaRecalcEnCursoRef.current) return false;
    if (Date.now() - guiaRecalcTsRef.current < RECALC_RUTA_COOLDOWN_MS) return false;

    guiaRecalcEnCursoRef.current = true;
    guiaRecalcTsRef.current = Date.now();
    setGuiaRecalculando(true);
    try {
      const { data } = await axios.post('http://localhost:5001/api/rutas/guia', {
        origin: origen,
        destination: destino,
      });
      aplicarRutaGuia(data, origen, destino, { ajustarVista: false });
      if (mapRef.current) mapRef.current.panTo(origen);
      return true;
    } catch (err) {
      console.error('Recálculo de ruta:', err);
      return false;
    } finally {
      guiaRecalcEnCursoRef.current = false;
      setGuiaRecalculando(false);
    }
  }, [aplicarRutaGuia]);

  /** Prueba sin caminar: el triángulo avanza por la ruta hasta el destino */
  const simularRecorridoGuia = useCallback(() => {
    if (!guiaActiva || guiaPath.length < 2 || guiaSimulandoRef.current) return;
    detenerSimulacionGuia();
    guiaSimulandoRef.current = true;
    setGuiaSimulando(true);
    setGuiaLlego(false);
    let idx = 0;
    // Empezar cerca del origen de la ruta
    const primero = guiaPath[0];
    setUserLocation(primero);
    ultimaPosGuiaRef.current = primero;

    guiaSimTimerRef.current = window.setInterval(() => {
      idx += 1;
      if (idx >= guiaPath.length) {
        detenerSimulacionGuia();
        setGuiaLlego(true);
        return;
      }
      const punto = guiaPath[idx];
      const prev = guiaPath[idx - 1] || punto;
      const rumbo = rumboEntre(prev, punto);
      setUserLocation(punto);
      ultimaPosGuiaRef.current = punto;
      if (rumbo != null) {
        brujulaTsRef.current = Date.now();
        setUserHeading(rumbo);
      }
      if (mapRef.current) {
        mapRef.current.panTo(punto);
      }
      // Actualizar paso de indicación según cercanía
      setGuiaPasoIdx((pasoIdx) => {
        let next = pasoIdx;
        while (
          next < guiaPasos.length - 1
          && distanciaMetros(
            punto.lat,
            punto.lng,
            guiaPasos[next].end.lat,
            guiaPasos[next].end.lng
          ) <= RADIO_PASO_GUIA_METROS
        ) {
          next += 1;
        }
        return next;
      });
    }, 280);
  }, [guiaActiva, guiaPath, guiaPasos, detenerSimulacionGuia]);

  const pedirPermisoBrujula = useCallback(async () => {
    try {
      if (
        typeof DeviceOrientationEvent !== 'undefined'
        && typeof DeviceOrientationEvent.requestPermission === 'function'
      ) {
        const estado = await DeviceOrientationEvent.requestPermission();
        return estado === 'granted';
      }
      return true;
    } catch {
      return false;
    }
  }, []);

  const iniciarGuiaGps = useCallback(async () => {
    if (!habilitarGuiaGps || !modoSoloCaso) return;
    const destinoLat = Number(focoCasoMapa?.lat);
    const destinoLng = Number(focoCasoMapa?.lng);
    if (!Number.isFinite(destinoLat) || !Number.isFinite(destinoLng)) {
      setGuiaError('Este caso no tiene ubicación válida.');
      return;
    }

    // Pedir brújula en el mismo gesto del botón (requerido en iOS)
    await pedirPermisoBrujula();

    setGuiaCargando(true);
    setGuiaError('');
    setGuiaLlego(false);

    const pedirUbicacion = () => new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocalización no disponible'));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        (err) => reject(err),
        { enableHighAccuracy: true, timeout: 15000 }
      );
    });

    try {
      const origen = userLocation || await pedirUbicacion();
      setUserLocation(origen);
      const destino = { lat: destinoLat, lng: destinoLng };
      destinoGuiaRef.current = destino;
      setGuiaDestino(destino);

      // Routes API vía backend
      const { data } = await axios.post('http://localhost:5001/api/rutas/guia', {
        origin: origen,
        destination: destino,
      });

      aplicarRutaGuia(data, origen, destino, { ajustarVista: true });
      guiaRecalcTsRef.current = Date.now();
      guiaActivaRef.current = true;
      setGuiaActiva(true);
      setGuiaCargando(false);
      setShowPopup(false);
      if (onGuiaIniciada) onGuiaIniciada();
    } catch (err) {
      console.error('Guía GPS:', err);
      setGuiaCargando(false);
      guiaActivaRef.current = false;
      setGuiaActiva(false);
      const codigo = err?.code;
      const apiMsg = err?.response?.data?.message || '';
      if (codigo === 1) {
        setGuiaError('Necesitamos tu ubicación para guiarte. Activá el permiso e intentá de nuevo.');
      } else if (/ZERO_RESULTS|no encontramos una ruta/i.test(apiMsg)) {
        setGuiaError('No encontramos una ruta en auto hasta ese punto.');
      } else if (apiMsg) {
        setGuiaError(apiMsg);
      } else {
        setGuiaError('No se pudo calcular la ruta. Reiniciá el backend e intentá de nuevo.');
      }
    }
  }, [habilitarGuiaGps, modoSoloCaso, focoCasoMapa, userLocation, onGuiaIniciada, pedirPermisoBrujula, aplicarRutaGuia]);

  // Si el conductor se desvía, recalcular ruta (similar a Google Maps)
  useEffect(() => {
    if (!guiaActiva || !userLocation || guiaSimulando || guiaLlego) return;
    const path = guiaPathRef.current;
    if (!path.length) return;
    const fuera = distanciaAlPathMetros(userLocation, path);
    if (fuera <= RADIO_FUERA_RUTA_METROS) return;
    recalcularRutaGuia(userLocation);
  }, [guiaActiva, userLocation, guiaSimulando, guiaLlego, recalcularRutaGuia]);

  // Brújula del dispositivo: el triángulo rota al girar el celular
  useEffect(() => {
    if (!guiaActiva) return undefined;

    const rumboDesdeEvento = (event) => {
      if (typeof event.webkitCompassHeading === 'number' && !Number.isNaN(event.webkitCompassHeading)) {
        return event.webkitCompassHeading;
      }
      if (typeof event.alpha !== 'number' || Number.isNaN(event.alpha)) return null;
      // alpha: 0 cuando el tope del dispositivo apunta al norte (absolute) → rumbo = 360 - alpha
      return (360 - event.alpha + 360) % 360;
    };

    const onOrientacion = (event) => {
      const rumbo = rumboDesdeEvento(event);
      if (rumbo == null) return;
      brujulaTsRef.current = Date.now();
      setUserHeading(rumbo);
    };

    const absOk = 'ondeviceorientationabsolute' in window;
    if (absOk) {
      window.addEventListener('deviceorientationabsolute', onOrientacion, true);
    }
    window.addEventListener('deviceorientation', onOrientacion, true);

    return () => {
      if (absOk) {
        window.removeEventListener('deviceorientationabsolute', onOrientacion, true);
      }
      window.removeEventListener('deviceorientation', onOrientacion, true);
    };
  }, [guiaActiva]);

  // Avanzar indicación / llegada según posición
  useEffect(() => {
    if (!guiaActiva || !userLocation) return;
    const destino = destinoGuiaRef.current;
    if (
      destino
      && distanciaMetros(userLocation.lat, userLocation.lng, destino.lat, destino.lng)
        <= RADIO_LLEGO_DESTINO_METROS
    ) {
      setGuiaLlego(true);
      return;
    }
    if (!guiaPasos.length) return;
    setGuiaPasoIdx((idx) => {
      let next = idx;
      while (
        next < guiaPasos.length - 1
        && distanciaMetros(
          userLocation.lat,
          userLocation.lng,
          guiaPasos[next].end.lat,
          guiaPasos[next].end.lng
        ) <= RADIO_PASO_GUIA_METROS
      ) {
        next += 1;
      }
      return next;
    });
  }, [guiaActiva, userLocation, guiaPasos]);

  useEffect(() => {
    if (!modoSoloCaso) {
      detenerGuiaGps();
      autoGuiaPedidaRef.current = false;
    }
  }, [modoSoloCaso, detenerGuiaGps]);

  const cargarNotificaciones = useCallback(async () => {
    if (!userId || userId === 'anonimo') {
      setNotificaciones([]);
      setNoLeidasLocal(0);
      setPerdidasNoLeidasLocal(0);
      if (onNoLeidasChange) onNoLeidasChange(0);
      if (onPerdidasNoLeidasChange) onPerdidasNoLeidasChange(0);
      return;
    }
    try {
      const respuesta = await axios.get('http://localhost:5001/api/notificaciones', {
        headers: { 'x-user-id': userId },
      });
      setNotificaciones(respuesta.data.notificaciones || []);
      const cantidad = respuesta.data.noLeidas || 0;
      const perdidas = respuesta.data.perdidasNoLeidas || 0;
      setNoLeidasLocal(cantidad);
      setPerdidasNoLeidasLocal(perdidas);
      if (onNoLeidasChange) onNoLeidasChange(cantidad);
      if (onPerdidasNoLeidasChange) onPerdidasNoLeidasChange(perdidas);
    } catch (error) {
      console.error('Error cargando notificaciones:', error);
    }
  }, [userId, onNoLeidasChange, onPerdidasNoLeidasChange]);

  const normalizarMisItem = useCallback((marker) => ({
    ...marker,
    category: normalizeCategoryValue(marker.category),
    createdBy: marker.createdBy
      ? String(marker.createdBy).trim().toLowerCase()
      : 'anonimo',
  }), [normalizeCategoryValue]);

  const resetMisFiltros = useCallback(() => {
    setMisBusqueda('');
    setMisBusquedaDebounced('');
    setMisFiltroEstado('');
    setMisFiltroCategoria('');
    setMisFiltroRegistroCategoria('reparaciones');
    setMisFiltroRegistroTipo('');
    setMisFiltroRegistroPeriodo('7');
    setMisFiltroRegistroDesde('');
    setMisFiltroRegistroHasta('');
  }, []);

  const cargarMisLista = useCallback(async (seccion = misReportesSeccion, page = 1, overrides = null) => {
    if (!userId || userId === 'anonimo') {
      setMisReportesActivos([]);
      setMisReportesRegistro([]);
      setMisMeta({ total: 0, hasMore: false, limit: MIS_REPORTES_PAGE_SIZE });
      return;
    }
    const q = overrides && 'q' in overrides ? overrides.q : misBusquedaDebounced;
    const status = overrides && 'status' in overrides ? overrides.status : misFiltroEstado;
    const categoryActivos = overrides && 'category' in overrides ? overrides.category : misFiltroCategoria;
    const categoryRegistro = overrides && 'registroCategory' in overrides
      ? overrides.registroCategory
      : misFiltroRegistroCategoria;
    const category = seccion === 'registro' ? categoryRegistro : categoryActivos;
    const tipoCierre = overrides && 'tipoCierre' in overrides ? overrides.tipoCierre : misFiltroRegistroTipo;
    const periodo = overrides && 'periodo' in overrides ? overrides.periodo : misFiltroRegistroPeriodo;
    const desde = overrides && 'desde' in overrides ? overrides.desde : misFiltroRegistroDesde;
    const hasta = overrides && 'hasta' in overrides ? overrides.hasta : misFiltroRegistroHasta;

    setCargandoMisLista(true);
    try {
      // Todos los avisos propios (reparaciones, animales, familias, cosas perdidas)
      const params = {
        mine: '1',
        limit: MIS_REPORTES_PAGE_SIZE,
        page,
      };
      const qLimpio = String(q || '').trim().replace(/^#/, '');
      const esCaseId = /^\d+$/.test(qLimpio);
      if (qLimpio) params.q = qLimpio;

      // #caso exacto: no aplicar período / estado / categoría (igual que admin)
      if (esCaseId) {
        params.soloCaseId = 1;
        if (seccion === 'registro') params.eliminados = '1';
      } else {
        if (category) params.category = category;
        if (seccion === 'registro') {
          params.eliminados = '1';
          if (tipoCierre) params.tipoCierre = tipoCierre;
          if (periodo === 'personalizado') {
            if (desde) params.fechaDesde = desde;
            if (hasta) params.fechaHasta = hasta;
          } else if (periodo) {
            params.periodoDias = periodo;
          }
        } else if (status) {
          params.status = status;
        }
      }

      const { data } = await axios.get('http://localhost:5001/api/markers', {
        headers: { 'x-user-id': userId },
        params,
      });
      const lista = (Array.isArray(data) ? data : (data.items || [])).map(normalizarMisItem);
      const total = Array.isArray(data) ? lista.length : (data.total || lista.length);
      const limit = Array.isArray(data) ? MIS_REPORTES_PAGE_SIZE : (data.limit || MIS_REPORTES_PAGE_SIZE);
      const hasMore = Array.isArray(data)
        ? false
        : Boolean(data.hasMore ?? (page * limit < total));
      if (seccion === 'registro') {
        setMisReportesRegistro(lista);
      } else if (esCaseId) {
        // Búsqueda por #caso: mostrar el match aunque esté cerrado (soloCaseId ignora archivo)
        setMisReportesActivos(lista);
      } else {
        // Refuerzo: no mezclar bajas si el servidor devolvió alguna
        setMisReportesActivos(lista.filter((m) => (
          !m.eliminadoAt && m.status !== 'resuelto' && m.status !== 'rechazado'
        )));
      }
      setMisPage(page);
      setMisMeta({ total, hasMore, limit });
    } catch (error) {
      console.error('Error cargando mis reportes:', error);
      if (seccion === 'registro') setMisReportesRegistro([]);
      else setMisReportesActivos([]);
      setMisMeta({ total: 0, hasMore: false, limit: MIS_REPORTES_PAGE_SIZE });
    } finally {
      setCargandoMisLista(false);
    }
  }, [
    userId,
    misReportesSeccion,
    misBusquedaDebounced,
    misFiltroEstado,
    misFiltroCategoria,
    misFiltroRegistroCategoria,
    misFiltroRegistroTipo,
    misFiltroRegistroPeriodo,
    misFiltroRegistroDesde,
    misFiltroRegistroHasta,
    normalizarMisItem,
  ]);

  const puntoCercaActivo = useCallback((origen = cercaOrigen) => {
    if (origen === 'vigilada' && zonaAlerta
      && Number.isFinite(Number(zonaAlerta.lat))
      && Number.isFinite(Number(zonaAlerta.lng))) {
      return {
        lat: Number(zonaAlerta.lat),
        lng: Number(zonaAlerta.lng),
        origen: 'vigilada',
      };
    }
    if (origen === 'mapa') {
      // Centro vivo del mapa (evita closure viejo al panear en Radar)
      const vivo = mapRef.current?.getCenter?.();
      if (vivo) {
        return { lat: vivo.lat(), lng: vivo.lng(), origen: 'mapa' };
      }
      const guardado = mapCenterRef.current || mapCenter;
      if (guardado) {
        return { lat: Number(guardado.lat), lng: Number(guardado.lng), origen: 'mapa' };
      }
    }
    if (origen === 'gps' && userLocation) {
      return { lat: Number(userLocation.lat), lng: Number(userLocation.lng), origen: 'gps' };
    }
    if (userLocation) {
      return { lat: Number(userLocation.lat), lng: Number(userLocation.lng), origen: 'gps' };
    }
    const fallback = mapCenterRef.current || mapCenter;
    if (fallback) {
      return { lat: Number(fallback.lat), lng: Number(fallback.lng), origen: 'mapa' };
    }
    return null;
  }, [cercaOrigen, mapCenter, userLocation, zonaAlerta]);

  const cargarPerdidasLista = useCallback(async (
    seccion = perdidasSeccion,
    page = 1,
    origenOverride = null,
    modoOverride = null,
    animalOverride = null,
    limitOverride = null,
    puntoOverride = null,
  ) => {
    if (!userId || userId === 'anonimo') {
      setPerdidasLista([]);
      setPinesCercaMapa([]);
      return;
    }
    // Registro histórico vive en Mis reportes, no en el Radar
    const seccionRadar = seccion === 'registro' ? 'activos' : seccion;
    // Refs: evita closure viejo al mover el radio con filtro de animales activo
    const modo = modoOverride || radarModoRef.current || radarModo;
    const animalFiltro = animalOverride != null
      ? animalOverride
      : (animalFiltroRadarRef.current || animalFiltroRadar);
    const pageLimit = Math.min(
      100,
      Math.max(1, Number(limitOverride) || (radarVistaAmpliada ? 50 : MIS_PAGE_SIZE))
    );
    const seq = ++perdidasFetchSeqRef.current;
    // Solo limpiar al cambiar de pestaña (Míos ↔ Cerca), no en cada pan/reload del radio
    const cambioSeccion = seccionRadar !== perdidasSeccion;
    if (cambioSeccion) {
      setPerdidasLista([]);
      if (seccionRadar === 'cerca') setPinesCercaMapa([]);
    }
    setCargandoMisLista(true);
    try {
      if (seccionRadar === 'cerca') {
        const origen = origenOverride || cercaOrigenRef.current || cercaOrigen;
        const punto = puntoOverride || puntoCercaActivo(origen);
        if (!punto) {
          if (seq !== perdidasFetchSeqRef.current) return;
          setPerdidasLista([]);
          setPinesCercaMapa([]);
          setMisMeta({ total: 0, hasMore: false, limit: pageLimit });
          return;
        }
        const radio = Number(cercaRadioMetrosRef.current) || 2500;
        const params = {
          cerca: '1',
          lat: punto.lat,
          lng: punto.lng,
          radius: radio,
          limit: 100,
          page: 1,
          category: modo === 'animales' ? 'perros_gatos' : 'cosas_perdidas',
        };
        if (modo === 'animales' && animalFiltro && animalFiltro !== 'todos') {
          params.animalTipo = animalFiltro;
        }
        const { data } = await axios.get('http://localhost:5001/api/markers', {
          headers: { 'x-user-id': userId },
          params,
        });
        if (seq !== perdidasFetchSeqRef.current) return;
        const yo = String(userId || '').trim().toLowerCase();
        const catOk = modo === 'animales' ? 'perros_gatos' : 'cosas_perdidas';
        const lista = (data.items || [])
          .map((m) => ({
            ...normalizarMisItem(m),
            distanciaMetros: m.distanciaMetros,
          }))
          .filter((m) => {
            if (m.category !== catOk) return false;
            if (modo === 'animales' && animalFiltro && animalFiltro !== 'todos'
              && m.animalTipo !== animalFiltro) {
              return false;
            }
            if (yo && yo !== 'anonimo'
              && String(m.createdBy || '').trim().toLowerCase() === yo) {
              return false;
            }
            return true;
          });
        setPerdidasLista(lista);
        setPinesCercaMapa(lista);
        setMisPage(1);
        setMisMeta({
          total: data.total != null ? data.total : lista.length,
          hasMore: false,
          limit: pageLimit,
        });
        if (origen === 'gps') {
          ultimoCercaGpsFetchRef.current = { lat: Number(punto.lat), lng: Number(punto.lng) };
        }
        return;
      }

      // Míos (activos): perdidas / animales del vecino
      const params = {
        limit: pageLimit,
        page,
      };
      if (modo === 'animales') {
        params.mine = '1';
        params.category = 'perros_gatos';
        if (animalFiltro && animalFiltro !== 'todos') params.animalTipo = animalFiltro;
      } else {
        params.misPerdidas = '1';
      }
      const { data } = await axios.get('http://localhost:5001/api/markers', {
        headers: { 'x-user-id': userId },
        params,
      });
      if (seq !== perdidasFetchSeqRef.current) return;
      const lista = (Array.isArray(data) ? data : (data.items || [])).map(normalizarMisItem);
      setPerdidasLista(
        lista.filter((m) => !m.eliminadoAt && m.status !== 'resuelto' && m.status !== 'rechazado')
      );
      setMisPage(page);
      setMisMeta({
        total: Array.isArray(data) ? lista.length : (data.total || lista.length),
        hasMore: Array.isArray(data) ? false : !!data.hasMore,
        limit: Array.isArray(data) ? pageLimit : (data.limit || pageLimit),
      });
    } catch (error) {
      if (seq !== perdidasFetchSeqRef.current) return;
      console.error('Error cargando radar:', error);
      setPerdidasLista([]);
      setPinesCercaMapa([]);
    } finally {
      if (seq === perdidasFetchSeqRef.current) setCargandoMisLista(false);
    }
  }, [
    userId,
    perdidasSeccion,
    // modo / animal / origen / radio: refs (si van en deps, cada filtro/slider
    // recrea la fn y el effect de sección dispara un fetch extra)
    puntoCercaActivo,
    normalizarMisItem,
    radarVistaAmpliada,
  ]);

  const guardarZonaAlerta = useCallback(async (quitar = false, puntoForzado = null) => {
    if (!userId || userId === 'anonimo') return;
    setGuardandoZonaAlerta(true);
    try {
      if (quitar) {
        const { data } = await axios.patch(
          'http://localhost:5001/api/usuarios/me/zona-alerta',
          { quitar: true },
          { headers: { 'x-user-id': userId } }
        );
        setZonaAlerta(null);
        if (cercaOrigen === 'vigilada') {
          setCercaOrigen('mapa');
          cargarPerdidasLista('cerca', 1, 'mapa');
        }
        mostrarAviso('Ya no vas a recibir avisos de esa zona.');
        return data;
      }
      let punto = puntoForzado;
      if (!punto && mapRef.current?.getCenter) {
        const c = mapRef.current.getCenter();
        if (c) punto = { lat: c.lat(), lng: c.lng() };
      }
      punto = punto || puntoCercaActivo('mapa') || puntoCercaActivo('gps');
      if (!punto) {
        mostrarAviso('Mové el mapa a la zona o activá tu ubicación.', true);
        return null;
      }
      const { data } = await axios.patch(
        'http://localhost:5001/api/usuarios/me/zona-alerta',
        { lat: punto.lat, lng: punto.lng, radio: cercaRadioMetros },
        { headers: { 'x-user-id': userId } }
      );
      const zona = {
        lat: data.zonaAlertaLat,
        lng: data.zonaAlertaLng,
        radio: data.zonaAlertaRadio || cercaRadioMetros,
      };
      setZonaAlerta(zona);
      setCercaOrigen('vigilada');
      setMapCenter({ lat: Number(zona.lat), lng: Number(zona.lng) });
      if (mapRef.current) {
        mapRef.current.panTo({ lat: Number(zona.lat), lng: Number(zona.lng) });
      }
      // Punto explícito: no depender del setState de zonaAlerta (closure stale)
      cargarPerdidasLista(
        'cerca',
        1,
        'vigilada',
        null,
        null,
        null,
        { lat: Number(zona.lat), lng: Number(zona.lng) },
      );
      mostrarAviso('Vas a recibir avisos de esta zona del mapa (aunque no estés ahí).');
      return data;
    } catch (error) {
      mostrarAviso(error.response?.data?.message || 'No se pudo guardar la zona.', true);
      return null;
    } finally {
      setGuardandoZonaAlerta(false);
    }
  }, [userId, puntoCercaActivo, cercaRadioMetros, cercaOrigen, cargarPerdidasLista]);

  const programarReloadCercaDesdeMapa = useCallback(() => {
    if (!perdidasCercaActivoRef.current || !mapRef.current?.getCenter) return;
    // En vigilada el centro es la zona guardada: un pan no debe echarte a “otra zona”
    if (cercaOrigenRef.current === 'vigilada') return;
    const c = mapRef.current.getCenter();
    if (!c) return;
    const punto = { lat: c.lat(), lng: c.lng() };
    mapCenterRef.current = punto;
    setMapCenter(punto);
    setCercaOrigen('mapa');
    if (cercaReloadTimerRef.current) clearTimeout(cercaReloadTimerRef.current);
    cercaReloadTimerRef.current = setTimeout(() => {
      cargarPerdidasLista('cerca', 1, 'mapa');
    }, 400);
  }, [cargarPerdidasLista]);

  /** Marca leídos avisos del Radar. `tipos`: p.ej. ['cerca'] al abrir Cerca; chat/reclamo al tocar la tarjeta. */
  const marcarPerdidasLeidas = useCallback(async (markerId = null, tipos = null) => {
    if (!userId || userId === 'anonimo') return;
    const tiposOk = Array.isArray(tipos) && tipos.length
      ? tipos.filter((t) => t === 'reclamo' || t === 'chat' || t === 'cerca')
      : null;
    try {
      const body = {};
      if (markerId) body.markerId = markerId;
      if (tiposOk) body.tipos = tiposOk;
      const { data } = await axios.patch(
        'http://localhost:5001/api/notificaciones/perdidas/leer',
        body,
        { headers: { 'x-user-id': userId } }
      );
      const cantidad = data.perdidasNoLeidas || 0;
      setPerdidasNoLeidasLocal(cantidad);
      if (onPerdidasNoLeidasChange) onPerdidasNoLeidasChange(cantidad);
      setNotificaciones((prev) => prev.map((n) => {
        const esRadar = n.tipo === 'reclamo' || n.tipo === 'chat' || n.tipo === 'cerca';
        if (!esRadar || n.leida) return n;
        if (tiposOk && !tiposOk.includes(n.tipo)) return n;
        if (markerId && String(n.markerId) !== String(markerId)) return n;
        return { ...n, leida: true };
      }));
    } catch (error) {
      console.error('Error marcando avisos de perdidas:', error);
    }
  }, [userId, onPerdidasNoLeidasChange]);

  // Sincronizar GPS con el servidor (para avisos de cercanía)
  useEffect(() => {
    if (!userId || userId === 'anonimo' || !userLocation) return;
    const ahora = Date.now();
    const prev = ultimaUbicacionEnviadaRef.current;
    const movio = prev.lat == null
      || distanciaMetros(prev.lat, prev.lng, userLocation.lat, userLocation.lng) > 80;
    if (!movio && ahora - prev.at < 60000) return;
    ultimaUbicacionEnviadaRef.current = {
      at: ahora,
      lat: userLocation.lat,
      lng: userLocation.lng,
    };
    axios.patch(
      'http://localhost:5001/api/usuarios/me/ubicacion',
      { lat: userLocation.lat, lng: userLocation.lng },
      { headers: { 'x-user-id': userId } }
    ).catch(() => {});
  }, [userId, userLocation]);

  // Cargar zona de alerta guardada
  useEffect(() => {
    if (!userId || userId === 'anonimo') {
      setZonaAlerta(null);
      return;
    }
    axios.get('http://localhost:5001/api/usuarios/me', {
      headers: { 'x-user-id': userId },
    }).then(({ data }) => {
      if (data.zonaAlertaLat != null && data.zonaAlertaLng != null) {
        setZonaAlerta({
          lat: data.zonaAlertaLat,
          lng: data.zonaAlertaLng,
          radio: data.zonaAlertaRadio || 2500,
        });
        // No pisar el radio restaurado de sesión salvo que estemos en vigilada
        if (data.zonaAlertaRadio && cercaOrigenRef.current === 'vigilada') {
          setCercaRadioMetros(Number(data.zonaAlertaRadio) || 2500);
        }
      } else {
        setZonaAlerta(null);
      }
    }).catch(() => {});
  }, [userId]);

  useEffect(() => {
    perdidasCercaActivoRef.current = Boolean(mostrarCosasPerdidas && perdidasSeccion === 'cerca');
  }, [mostrarCosasPerdidas, perdidasSeccion]);

  useEffect(() => {
    if (!mostrarCosasPerdidas && radarVistaAmpliada) setRadarVistaAmpliada(false);
  }, [mostrarCosasPerdidas, radarVistaAmpliada]);

  // Al cerrar Radar o cambiar Cosas/Animales, resetear pines acumulados de Cerca
  useEffect(() => {
    if (!mostrarCosasPerdidas || perdidasSeccion !== 'cerca') {
      setPinesCercaMapa([]);
    }
  }, [mostrarCosasPerdidas, perdidasSeccion]);

  useEffect(() => {
    radarModoRef.current = radarModo;
    animalFiltroRadarRef.current = animalFiltroRadar;
    const cat = radarModo === 'animales' ? 'perros_gatos' : 'cosas_perdidas';
    const filtra = (m) => {
      if (m.category !== cat) return false;
      if (radarModo === 'animales' && animalFiltroRadar && animalFiltroRadar !== 'todos'
        && m.animalTipo !== animalFiltroRadar) {
        return false;
      }
      return true;
    };
    // Filtrar al toque (sin vaciar): si vaciábamos, al mover el radio un fetch viejo
    // podía ganar la carrera y dejar la lista definitivamente vacía
    setPerdidasLista((prev) => prev.filter(filtra));
    setPinesCercaMapa((prev) => prev.filter(filtra));
  }, [radarModo, animalFiltroRadar]);

  useEffect(() => {
    if (perdidasSeccion === 'registro') setPerdidasSeccion('activos');
  }, [perdidasSeccion]);

  useEffect(() => {
    cercaOrigenRef.current = cercaOrigen;
  }, [cercaOrigen]);

  // Refs siempre al día (aunque el debounce aún no corrió)
  radarModoRef.current = radarModo;
  animalFiltroRadarRef.current = animalFiltroRadar;
  cercaRadioMetrosRef.current = Number(cercaRadioMetros) || 2500;

  // Persistir Radar al refrescar (misma pestaña)
  useEffect(() => {
    if (modoSoloCaso) return;
    try {
      sessionStorage.setItem(RADAR_VISTA_KEY, JSON.stringify({
        abierto: mostrarCosasPerdidas,
        modo: radarModo,
        seccion: perdidasSeccion === 'activos' ? 'activos' : 'cerca',
        animalFiltro: animalFiltroRadar,
        cercaOrigen: cercaOrigen === 'mapa' || cercaOrigen === 'vigilada' ? cercaOrigen : 'gps',
        cercaRadio: cercaRadioMetros,
        busqueda: radarBusqueda,
      }));
    } catch {
      /* ignore quota / private mode */
    }
  }, [
    modoSoloCaso,
    mostrarCosasPerdidas,
    radarModo,
    perdidasSeccion,
    animalFiltroRadar,
    cercaOrigen,
    cercaRadioMetros,
    radarBusqueda,
  ]);

  // Persistir solo abierto/pestaña al refrescar; los filtros no se guardan
  useEffect(() => {
    if (modoSoloCaso) return;
    try {
      sessionStorage.setItem(MIS_REPORTES_VISTA_KEY, JSON.stringify({
        abierto: mostrarMisReportes,
        seccion: misReportesSeccion === 'registro' ? 'registro' : 'activos',
      }));
    } catch {
      /* ignore quota / private mode */
    }
  }, [modoSoloCaso, mostrarMisReportes, misReportesSeccion]);

  // Tras F5: si el Radar estaba abierto, recargar la lista
  useEffect(() => {
    if (!radarRestauradoRef.current) return;
    if (modoSoloCaso || !mostrarCosasPerdidas) {
      radarRestauradoRef.current = false;
      return;
    }
    if (!userId || userId === 'anonimo') return;
    radarRestauradoRef.current = false;
    cargarPerdidasLista(perdidasSeccion, 1);
  }, [userId, modoSoloCaso, mostrarCosasPerdidas, perdidasSeccion, cargarPerdidasLista]);

  // Tras F5: si Mis reportes estaba abierto, recargar la lista
  useEffect(() => {
    if (!misReportesRestauradoRef.current) return;
    if (modoSoloCaso || !mostrarMisReportes) {
      misReportesRestauradoRef.current = false;
      return;
    }
    if (!userId || userId === 'anonimo') return;
    misReportesRestauradoRef.current = false;
    cargarMisLista(misReportesSeccion, 1);
  }, [userId, modoSoloCaso, mostrarMisReportes, misReportesSeccion, cargarMisLista]);

  // Vista dividida: resize al entrar al Radar (no en cada tick del slider → distorsiona)
  useEffect(() => {
    if (!mostrarCosasPerdidas || !mapRef.current || !window.google?.maps?.event) return;
    // Un poco más alejados para ver el radio completo con el puntero
    const zoomRadar = cercaRadioMetros >= 4000 ? 11 : (cercaRadioMetros >= 2000 ? 12 : 13);
    const t = window.setTimeout(() => {
      if (!mapRef.current) return;
      window.google.maps.event.trigger(mapRef.current, 'resize');
      const c = mapRef.current.getCenter?.();
      if (c) mapRef.current.setCenter(c);
      if (perdidasSeccion === 'cerca') {
        ignorarZoomProgramaticoRef.current = true;
        mapRef.current.setZoom(zoomRadar);
        window.setTimeout(() => { ignorarZoomProgramaticoRef.current = false; }, 300);
      }
    }, 80);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al cambiar de sección, no al mover el radio
  }, [mostrarCosasPerdidas, perdidasSeccion]);

  // Radios nativos: búsqueda (azul/naranja) + zona vigilada (verde, se mantiene)
  useEffect(() => {
    const map = mapRef.current;
    const gmaps = window.google?.maps;
    if (!map || !gmaps) return undefined;

    const activo = Boolean(mostrarCosasPerdidas && perdidasSeccion === 'cerca');
    const limpiar = (ref) => {
      if (ref.current) {
        ref.current.setMap(null);
        ref.current = null;
      }
    };
    const aplicarCirculo = (ref, opts) => {
      if (!ref.current) {
        ref.current = new gmaps.Circle(opts);
      } else {
        ref.current.setOptions(opts);
      }
    };

    // Radio verde persistente de la zona vigilada (siempre que exista)
    const vLat = Number(zonaAlerta?.lat);
    const vLng = Number(zonaAlerta?.lng);
    // En "Ver vigilada" el slider mueve el radio verde; si buscás en otra zona, se ve el radio guardado
    const radioVigilada = cercaOrigen === 'vigilada'
      ? (Number(cercaRadioMetros) || Number(zonaAlerta?.radio) || 2500)
      : (Number(zonaAlerta?.radio) || Number(cercaRadioMetros) || 2500);
    if (activo && zonaAlerta && Number.isFinite(vLat) && Number.isFinite(vLng)) {
      aplicarCirculo(radioVigiladaCircleRef, {
        center: { lat: vLat, lng: vLng },
        radius: radioVigilada,
        strokeColor: '#059669',
        strokeOpacity: cercaOrigen === 'vigilada' ? 0.95 : 0.75,
        strokeWeight: cercaOrigen === 'vigilada' ? 2.5 : 2,
        fillColor: '#10b981',
        fillOpacity: cercaOrigen === 'vigilada' ? 0.18 : 0.1,
        clickable: false,
        zIndex: cercaOrigen === 'vigilada' ? 3 : 1,
        map,
      });
    } else {
      limpiar(radioVigiladaCircleRef);
    }

    // Radio de búsqueda azul / naranja (si estás en vigilada, el verde ya cubre la búsqueda)
    if (!activo || cercaOrigen === 'vigilada') {
      limpiar(radioCercaCircleRef);
      return undefined;
    }

    let centro;
    if (cercaOrigen === 'gps' && userLocation) {
      centro = userLocation;
    } else {
      // Centro vivo del mapa; en “otra zona” el follow lo hace center_changed (más fluido)
      const vivo = map.getCenter?.();
      const guardado = mapCenterRef.current || mapCenter;
      centro = vivo
        ? { lat: vivo.lat(), lng: vivo.lng() }
        : guardado;
    }
    const lat = Number(centro?.lat);
    const lng = Number(centro?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      limpiar(radioCercaCircleRef);
      return undefined;
    }

    const colorStroke = cercaOrigen === 'gps' ? '#2563eb' : '#ea580c';
    const colorFill = cercaOrigen === 'gps' ? '#3b82f6' : '#f97316';
    const radio = Number(cercaRadioMetros) || 2500;
    // En modo mapa: no pisar el center en cada setState (provoca tirones al arrastrar)
    if (cercaOrigen === 'mapa' && radioCercaCircleRef.current) {
      radioCercaCircleRef.current.setRadius(radio);
      radioCercaCircleRef.current.setOptions({
        strokeColor: colorStroke,
        strokeOpacity: 0.9,
        strokeWeight: 2,
        fillColor: colorFill,
        fillOpacity: 0.14,
        clickable: false,
        zIndex: 2,
      });
      return undefined;
    }
    aplicarCirculo(radioCercaCircleRef, {
      center: { lat, lng },
      radius: radio,
      strokeColor: colorStroke,
      strokeOpacity: 0.9,
      strokeWeight: 2,
      fillColor: colorFill,
      fillOpacity: 0.14,
      clickable: false,
      zIndex: 2,
      map,
    });
    return undefined;
  }, [
    mostrarCosasPerdidas,
    perdidasSeccion,
    cercaOrigen,
    cercaRadioMetros,
    userLocation,
    mapCenter,
    zonaAlerta,
    mapaListoTick,
  ]);

  useEffect(() => () => {
    if (radioCercaCircleRef.current) {
      radioCercaCircleRef.current.setMap(null);
      radioCercaCircleRef.current = null;
    }
    if (radioVigiladaCircleRef.current) {
      radioVigiladaCircleRef.current.setMap(null);
      radioVigiladaCircleRef.current = null;
    }
  }, []);

  // En Radar "Cerca de mí": follow + refetch al caminar (aunque el zoom haya pausado el pan)
  useEffect(() => {
    if (!mostrarCosasPerdidas || perdidasSeccion !== 'cerca' || cercaOrigen !== 'gps') {
      if (cercaOrigen !== 'gps') {
        cercaGpsListoRef.current = false;
        gpsFollowPausadoRef.current = false;
        ultimoCercaGpsFetchRef.current = null;
        if (cercaGpsFetchTimerRef.current) {
          clearTimeout(cercaGpsFetchTimerRef.current);
          cercaGpsFetchTimerRef.current = null;
        }
      }
      return undefined;
    }
    if (!userLocation || !mapRef.current) return undefined;
    if (ignorarDragCercaRef.current) return undefined;

    const c = mapRef.current.getCenter?.();
    const lejosDelCentro = c
      ? distanciaMetros(c.lat(), c.lng(), userLocation.lat, userLocation.lng) >= 35
      : true;

    if (!cercaGpsListoRef.current) {
      cercaGpsListoRef.current = true;
      gpsFollowPausadoRef.current = false;
      mapRef.current.panTo(userLocation);
      setMapCenter(userLocation);
      ultimoCercaGpsFetchRef.current = { lat: userLocation.lat, lng: userLocation.lng };
      cargarPerdidasLista('cerca', 1, 'gps');
      return undefined;
    }

    // Pan solo si el follow no está pausado por zoom manual
    if (!gpsFollowPausadoRef.current && lejosDelCentro) {
      mapRef.current.panTo(userLocation);
      setMapCenter(userLocation);
    }

    // Refetch si el GPS se movió >= 80 m desde el último pedido (aunque el pan esté pausado)
    const ultimo = ultimoCercaGpsFetchRef.current;
    const movio = !ultimo || !Number.isFinite(ultimo.lat)
      || distanciaMetros(ultimo.lat, ultimo.lng, userLocation.lat, userLocation.lng) >= 80;
    if (movio) {
      if (cercaGpsFetchTimerRef.current) clearTimeout(cercaGpsFetchTimerRef.current);
      cercaGpsFetchTimerRef.current = setTimeout(() => {
        ultimoCercaGpsFetchRef.current = { lat: userLocation.lat, lng: userLocation.lng };
        cargarPerdidasLista('cerca', 1, 'gps');
      }, 600);
    }
    return () => {
      if (cercaGpsFetchTimerRef.current) {
        clearTimeout(cercaGpsFetchTimerRef.current);
        cercaGpsFetchTimerRef.current = null;
      }
    };
  }, [userLocation, cercaOrigen, mostrarCosasPerdidas, perdidasSeccion, cargarPerdidasLista]);

  // Mantener radio/origen vivos en ref (fetch usa esto sin recrear cargarPerdidasLista)
  useEffect(() => {
    cercaRadioMetrosRef.current = Number(cercaRadioMetros) || 2500;
  }, [cercaRadioMetros]);

  // Debounce radio/modo/filtro animal. Los botones solo hacen setState (evita doble fetch).
  useEffect(() => {
    if (!mostrarCosasPerdidas) return undefined;
    cercaRadioMetrosRef.current = Number(cercaRadioMetros) || 2500;
    radarModoRef.current = radarModo;
    animalFiltroRadarRef.current = animalFiltroRadar;
    const t = window.setTimeout(() => {
      cargarPerdidasLista(perdidasSeccion === 'activos' ? 'activos' : 'cerca', 1);
    }, 400);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- no al panear ni al cambiar de pestaña
  }, [cercaRadioMetros, radarModo, animalFiltroRadar]);

  // Zoom del círculo: únicamente cuando el usuario mueve el slider (no al arrastrar el mapa)
  const radioZoomListoRef = useRef(false);
  useEffect(() => {
    if (!mostrarCosasPerdidas || perdidasSeccion !== 'cerca') {
      radioZoomListoRef.current = false;
      return undefined;
    }
    // La 1ª vez al abrir Cerca ya hace zoom el effect de resize/sección
    if (!radioZoomListoRef.current) {
      radioZoomListoRef.current = true;
      return undefined;
    }
    const t = window.setTimeout(() => {
      if (!mapRef.current) return;
      const r = Number(cercaRadioMetros) || 2500;
      const zoomRadar = r >= 4000 ? 11 : (r >= 2000 ? 12 : 13);
      const c = mapRef.current.getCenter?.();
      ignorarZoomProgramaticoRef.current = true;
      mapRef.current.setZoom(zoomRadar);
      // Reafirmar el centro vivo: setZoom solo no debe desplazar el pin
      if (c) mapRef.current.setCenter(c);
      window.setTimeout(() => { ignorarZoomProgramaticoRef.current = false; }, 300);
    }, 400);
    return () => window.clearTimeout(t);
  }, [cercaRadioMetros, mostrarCosasPerdidas, perdidasSeccion]);

  // Al abrir Radar en Cerca: bajar badge de avisos nuevos cerca (no mezcla con chat de Míos)
  useEffect(() => {
    if (!mostrarCosasPerdidas || perdidasSeccion !== 'cerca') return;
    marcarPerdidasLeidas(null, ['cerca']);
  }, [mostrarCosasPerdidas, perdidasSeccion, marcarPerdidasLeidas]);

  useEffect(() => {
    if (!panelVecino) return;
    if (panelVecino === 'reportar') {
      setMostrarNotificaciones(false);
      setMostrarFiltros(false);
      setMostrarCosasPerdidas(false);
      setMostrarMisReportes(false);
      setMostrarCercanos(false);
      setShowPopup(false);
      setEditMode(null);
      setIdRegistroDestacado(null);
    }
    if (panelVecino === 'mis-reportes') {
      setMostrarNotificaciones(false);
      setMostrarFiltros(false);
      setMostrarCosasPerdidas(false);
      setShowPopup(false);
      setMostrarMisReportes(true);
      setMisReportesSeccion('activos');
      setMisPage(1);
      resetMisFiltros();
      cargarMisLista('activos', 1, {
        q: '',
        status: '',
        category: '',
        registroCategory: 'reparaciones',
        tipoCierre: '',
        periodo: '7',
        desde: '',
        hasta: '',
      });
    }
    if (panelVecino === 'cosas-perdidas') {
      setMostrarNotificaciones(false);
      setMostrarFiltros(false);
      setMostrarMisReportes(false);
      setMostrarCosasPerdidas(true);
      setPerdidasSeccion('cerca');
      setMisPage(1);
      cargarPerdidasLista('cerca', 1);
      // El badge de "Nuevo"/cerca se limpia al mostrar Cerca (efecto abajo)
    }
    if (panelVecino === 'filtros') {
      setMostrarNotificaciones(false);
      setMostrarMisReportes(false);
      setMostrarCosasPerdidas(false);
      setMostrarFiltros(true);
    }
    if (panelVecino === 'notificaciones') {
      setMostrarMisReportes(false);
      setMostrarCosasPerdidas(false);
      setMostrarFiltros(false);
      setMostrarNotificaciones(true);
      cargarNotificaciones();
    }
    if (onPanelVecinoVisto) onPanelVecinoVisto();
  }, [panelVecino, onPanelVecinoVisto, cargarNotificaciones, cargarMisLista, cargarPerdidasLista, resetMisFiltros]);

  useEffect(() => {
    const t = setTimeout(() => setMisBusquedaDebounced(misBusqueda.trim()), 350);
    return () => clearTimeout(t);
  }, [misBusqueda]);

  // Recargar Mis reportes al cambiar filtros (no al abrir: eso lo hace panelVecino)
  const misFiltrosListosRef = useRef(false);
  useEffect(() => {
    if (!mostrarMisReportes) {
      misFiltrosListosRef.current = false;
      return undefined;
    }
    if (!misFiltrosListosRef.current) {
      misFiltrosListosRef.current = true;
      return undefined;
    }
    setMisPage(1);
    cargarMisLista(misReportesSeccion, 1);
    return undefined;
  }, [
    mostrarMisReportes,
    misReportesSeccion,
    misBusquedaDebounced,
    misFiltroEstado,
    misFiltroCategoria,
    misFiltroRegistroCategoria,
    misFiltroRegistroTipo,
    misFiltroRegistroPeriodo,
    misFiltroRegistroDesde,
    misFiltroRegistroHasta,
    cargarMisLista,
  ]);

  useEffect(() => {
    cargarNotificaciones();
    if (!userId || userId === 'anonimo') return undefined;
    const timer = setInterval(cargarNotificaciones, 15000);
    return () => clearInterval(timer);
  }, [cargarNotificaciones, userId]);

  useEffect(() => {
    if (!userId || userId === 'anonimo') {
      setTelefonoUsuario('');
      return undefined;
    }
    let cancelado = false;
    axios.get('http://localhost:5001/api/usuarios/me', {
      headers: { 'x-user-id': userId },
    }).then((res) => {
      if (cancelado) return;
      setTelefonoUsuario(String(res.data?.telefono || '').trim());
    }).catch(() => {
      if (!cancelado) setTelefonoUsuario('');
    });
    return () => { cancelado = true; };
  }, [userId]);

  useEffect(() => {
    const fetchRole = async () => {
      if (!userId || userId === 'anonimo') {
        setIsAdmin(false);
        return;
      }
      try {
        const response = await axios.get('http://localhost:5001/api/auth/me', {
          headers: {
            'x-user-id': userId,
          },
        });
        setIsAdmin(response.data.isAdmin);
        setAdminRole(response.data.role);
        setAdminJurisdictions(response.data.jurisdictions || []);
      } catch (error) {
        setIsAdmin(false);
        console.error('Error verificando rol de administrador:', error);
      }
    };

    fetchRole();
  }, [userId]);

  const [markersMeta, setMarkersMeta] = useState({ total: 0, hasMore: false, limit: 60 });

  // Carga filtrada + paginada en el servidor (no trae todo el dataset)
  useEffect(() => {
    if (modoSoloCaso) return undefined;
    let cancelado = false;
    const fetchMarkers = async () => {
      try {
        const params = {
          limit: 60,
          page: 1,
        };
        if (categoryFilter && categoryFilter !== 'todas') {
          params.category = categoryFilter;
        }
        if (categoryFilter === 'perros_gatos' && animalFilter && animalFilter !== 'todos') {
          params.animalTipo = animalFilter;
        }
        if (soloMisReportes) {
          params.mine = '1';
        }
        if (soloMiJurisdiccion) {
          params.myJurisdiction = '1';
        }
        const response = await axios.get('http://localhost:5001/api/markers', {
          headers: { 'x-user-id': userId },
          params,
        });
        if (cancelado) return;
        const payload = response.data;
        const lista = Array.isArray(payload) ? payload : (payload.items || []);
        const ocultos = idsEnBorradoRef.current;
        const savedMarkers = lista
          .filter((marker) => !ocultos.has(String(marker._id)))
          .map((marker) => ({
            ...marker,
            isSaved: true,
            category: normalizeCategoryValue(marker.category),
            status: marker.status || 'pendiente',
            resolvedAt: marker.resolvedAt || null,
            caseId: marker.caseId || null,
            resolvedBy: marker.resolvedBy || null,
            resolvedByReportedAt: marker.resolvedByReportedAt || null,
            perdidaTipo: marker.perdidaTipo || '',
            objeto: marker.objeto || '',
            contacto: marker.contacto || '',
            claimedByMe: !!marker.claimedByMe,
            canChat: !!marker.canChat,
            claimCount: marker.claimCount || 0,
            chatAbiertoPorMi: !!marker.chatAbiertoPorMi,
            confirmacionPerdidaMia: marker.confirmacionPerdidaMia || null,
            perdidaEsperaOtraParte: !!marker.perdidaEsperaOtraParte,
            canManage: !!marker.canManage,
            pideDatosAt: marker.pideDatosAt || null,
            pideDatosMensaje: marker.pideDatosMensaje || '',
            respuestaDatosAt: marker.respuestaDatosAt || null,
            ultimaRespuestaDatosAt: marker.ultimaRespuestaDatosAt || null,
            eliminadoAt: marker.eliminadoAt || null,
            motivoEliminacion: marker.motivoEliminacion || '',
            aprobadoAt: marker.aprobadoAt || null,
            createdBy: marker.createdBy
              ? String(marker.createdBy).trim().toLowerCase()
              : 'anonimo',
          }));
        const idsVisibles = new Set(savedMarkers.map((m) => String(m._id)));
        const extrasAdmin = [...casosAdminForzadosRef.current.values()]
          .filter((m) => !idsVisibles.has(String(m._id)) && !ocultos.has(String(m._id)));
        setMarkers([...savedMarkers, ...extrasAdmin]);
        if (!Array.isArray(payload)) {
          setMarkersMeta({
            total: payload.total || savedMarkers.length,
            hasMore: !!payload.hasMore,
            limit: payload.limit || 60,
          });
        } else {
          setMarkersMeta({ total: savedMarkers.length, hasMore: false, limit: 60 });
        }
      } catch (error) {
        console.error('Error fetching markers:', error);
      }
    };

    fetchMarkers();
    const timer = setInterval(fetchMarkers, 12000);
    return () => {
      cancelado = true;
      clearInterval(timer);
    };
  }, [normalizeCategoryValue, userId, categoryFilter, animalFilter, soloMisReportes, soloMiJurisdiccion, modoSoloCaso]);

  useEffect(() => {
    if (!showPopup || !editMode) return;
    const marker = markers.find((item) => item._id === editMode);
    if (!marker || !marker.avisadoAt) return;
    setFormData((prev) => (
      prev.avisadoAt === marker.avisadoAt ? prev : { ...prev, avisadoAt: marker.avisadoAt }
    ));
  }, [markers, showPopup, editMode]);

  // Verificar si el usuario tiene marcadores de "familias" y ajustar el filtro si es necesario
  useEffect(() => {
    if (!isAdmin && categoryFilter === 'familias') {
      const hasFamiliesMarkers = markers.some(marker => {
        if (esCasoFamilia(marker.category)) {
          const markerOwner = marker.createdBy
            ? String(marker.createdBy).trim().toLowerCase()
            : 'anonimo';
          return markerOwner === userId;
        }
        return false;
      });
      if (!hasFamiliesMarkers) {
        setCategoryFilter('todas');
      }
    }
  }, [markers, categoryFilter, isAdmin, userId]);

  const abrirEditorConSrc = useCallback((src, destino = 'aviso') => {
    if (!src) return;
    setEditorDestino(destino);
    setEditorImagenSrc(src);
    setMostrarCamara(false);
  }, []);

  const abrirEditorDesdeArchivo = useCallback((file, destino = 'aviso') => {
    if (!file || !file.type?.startsWith('image/')) {
      mostrarAviso('La foto tiene que ser una imagen.', true);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => abrirEditorConSrc(reader.result, destino);
    reader.readAsDataURL(file);
  }, [abrirEditorConSrc]);

  const onElegirArchivoAviso = (event) => {
    const file = event.target.files && event.target.files[0];
    event.target.value = '';
    if (file) abrirEditorDesdeArchivo(file, 'aviso');
  };

  const onElegirArchivoResolucion = (event) => {
    const file = event.target.files && event.target.files[0];
    event.target.value = '';
    if (file) abrirEditorDesdeArchivo(file, 'resolucion');
  };

  const abrirCamaraAviso = () => {
    setEditorDestino('aviso');
    // En móviles el input capture abre la cámara nativa; en desktop usamos getUserMedia
    const esMovil = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
    if (esMovil && inputCamaraRef.current) {
      inputCamaraRef.current.click();
      return;
    }
    setMostrarCamara(true);
  };

  const abrirCamaraResolucion = () => {
    setEditorDestino('resolucion');
    const esMovil = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
    if (esMovil && inputCamaraResolucionRef.current) {
      inputCamaraResolucionRef.current.click();
      return;
    }
    setMostrarCamara(true);
  };

  const confirmarFotoEditada = ({ dataUrl, file }) => {
    if (editorDestino === 'resolucion') {
      setResolutionPhoto(file);
      setResolutionPreview(dataUrl);
    } else if (editorDestino === 'respuesta') {
      setFotoRespuestaDatos(file);
      setPreviewRespuestaDatos(dataUrl);
      setMostrarOpcionesFotoRespuesta(false);
    } else {
      setSelectedImage(dataUrl);
      setFormData((prev) => ({ ...prev, image: file }));
      setIsImageZoomed(false);
      setMostrarOpcionesFoto(false);
    }
    setEditorImagenSrc(null);
  };

  const onElegirArchivoRespuesta = (event) => {
    const file = event.target.files && event.target.files[0];
    event.target.value = '';
    if (file) abrirEditorDesdeArchivo(file, 'respuesta');
  };

  const abrirCamaraRespuesta = () => {
    setEditorDestino('respuesta');
    const esMovil = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
    if (esMovil && inputCamaraRespuestaRef.current) {
      inputCamaraRespuestaRef.current.click();
      return;
    }
    setMostrarCamara(true);
  };

  const quitarFotoRespuesta = () => {
    setFotoRespuestaDatos(null);
    setPreviewRespuestaDatos(null);
    setMostrarOpcionesFotoRespuesta(false);
  };

  const quitarImagen = () => {
    setSelectedImage(null);
    setIsImageZoomed(false);
    setMostrarOpcionesFoto(false);
    setFormData((prev) => ({ ...prev, image: null }));
  };

  // Restablecer el zoom cuando cambia la imagen seleccionada o se limpia
  useEffect(() => {
    setIsImageZoomed(false);
  }, [selectedImage]);

  // Funciones para manejar cambios en los campos de texto
  const handleDateChange = (e) => {
    setFormData({
      ...formData,
      date: e.target.value,
    });
  };

  const handleTimeChange = (e) => {
    setFormData({
      ...formData,
      time: e.target.value,
    });
  };

  const handleDireccionChange = (e) => {
    setFormData((prev) => ({ ...prev, direccion: e.target.value }));
  };

  const handleDescriptionChange = (e) => {
    setFormData({
      ...formData,
      description: e.target.value,
    });
  };

  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey,
    language: 'es',
    region: 'AR',
    libraries: mapLibraries,
    // mapIds: ['7f9f71bb3b378371fcb70fd1'], // ID de mapa eliminado
  });

  // Si el lienzo cambia de tamaño (barra, panel, mobile), recalcular proyección de OverlayView
  useEffect(() => {
    if (!isLoaded || !mapaLienzoRef.current) return undefined;
    const el = mapaLienzoRef.current;
    let t = null;
    const ro = new ResizeObserver(() => {
      if (t) window.clearTimeout(t);
      t = window.setTimeout(() => {
        const map = mapRef.current;
        if (!map || !window.google?.maps?.event) return;
        window.google.maps.event.trigger(map, 'resize');
        const c = map.getCenter?.();
        if (c) map.setCenter(c);
      }, 60);
    });
    ro.observe(el);
    return () => {
      if (t) window.clearTimeout(t);
      ro.disconnect();
    };
  }, [isLoaded]);

  // Auto-iniciar guía GPS (Cómo llegar / tras tomar caso)
  useEffect(() => {
    if (!habilitarGuiaGps || !modoSoloCaso || !autoIniciarGuia || !isLoaded) return;
    if (autoGuiaPedidaRef.current || guiaActivaRef.current) return;
    autoGuiaPedidaRef.current = true;
    iniciarGuiaGps();
  }, [habilitarGuiaGps, modoSoloCaso, autoIniciarGuia, isLoaded, iniciarGuiaGps]);

  const idleListenerRef = useRef(null);
  const dragStartListenerRef = useRef(null);
  const dragListenerRef = useRef(null);
  const centerChangedListenerRef = useRef(null);
  const dragEndListenerRef = useRef(null);
  const zoomChangedListenerRef = useRef(null);
  const ignorarZoomProgramaticoRef = useRef(false);
  // Zoom con rueda no debe soltar GPS ni poner el pin naranja al centro (el puntero “salta”)
  const gpsFollowPausadoRef = useRef(false);
  const geocodeSeqRef = useRef(0);
  const pendingCercaOrigenMapaRef = useRef(false);
  const pendingLimpiarPunteroRef = useRef(false);

  const actualizarDireccionDelPin = useCallback((forzar = false) => {
    if (!forzar && (showPopupRef.current || omitirIdleRef.current)) return;
    if (!forzar && bloquearAutoDireccionRef.current) return;
    if (!mapRef.current) return;
    const centro = mapRef.current.getCenter();
    if (!centro) return;
    const lat = centro.lat();
    const lng = centro.lng();
    const seq = ++geocodeSeqRef.current;
    setDireccionPreview((prev) => (prev ? prev : 'Buscando dirección...'));
    obtenerDireccionDesdePunto(lat, lng).then((texto) => {
      if (seq !== geocodeSeqRef.current || showPopupRef.current) return;
      if (!forzar && bloquearAutoDireccionRef.current) return;
      if (texto) {
        setDireccionPreview((prev) => (prev === texto ? prev : texto));
        return;
      }
      setDireccionPreview((prev) => (
        prev === 'Buscando dirección...' ? '' : prev
      ));
    });
  }, []);

  const onMapLoad = useCallback((map) => {
    mapRef.current = map;
    setMapaListoTick(0);
    // Centro/zoom solo acá o con panTo/setZoom: NO props controlados (evitan saltos al click)
    const centroInicial = mapCenterRef.current;
    const zoomInicial = modoSoloCaso ? 18 : 14;
    if (centroInicial?.lat != null) map.setCenter(centroInicial);
    map.setZoom(zoomInicial);
    // OverlayView usa mal la proyección si el lienzo aún no tiene tamaño final:
    // resize + montar pines recién en el primer idle (proyección estable).
    const corregirProyeccion = () => {
      if (!mapRef.current || !window.google?.maps?.event) return;
      window.google.maps.event.trigger(map, 'resize');
      if (modoSoloCaso) {
        const lat = Number(focoCasoMapa?.lat);
        const lng = Number(focoCasoMapa?.lng);
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          const centro = { lat, lng };
          map.setCenter(centro);
          map.setZoom(18);
          setMapCenter(centro);
        } else {
          const c = map.getCenter?.();
          if (c) map.setCenter(c);
        }
      } else {
        const c = map.getCenter?.();
        if (c) map.setCenter(c);
      }
    };
    let pinesMontados = false;
    const montarPines = () => {
      if (pinesMontados) return;
      pinesMontados = true;
      corregirProyeccion();
      setMapaListoTick(1);
      // Remount breve: OverlayView a veces queda con left/top del primer draw a medias
      window.setTimeout(() => {
        corregirProyeccion();
        setMapaListoTick(2);
      }, 80);
    };
    window.setTimeout(() => corregirProyeccion(), 0);
    window.setTimeout(() => corregirProyeccion(), 100);
    const onceIdle = map.addListener('idle', () => {
      window.google.maps.event.removeListener(onceIdle);
      montarPines();
    });
    window.setTimeout(montarPines, 900);
    if (idleListenerRef.current) {
      window.google.maps.event.removeListener(idleListenerRef.current);
    }
    if (dragStartListenerRef.current) {
      window.google.maps.event.removeListener(dragStartListenerRef.current);
    }
    if (dragListenerRef.current) {
      window.google.maps.event.removeListener(dragListenerRef.current);
    }
    if (centerChangedListenerRef.current) {
      window.google.maps.event.removeListener(centerChangedListenerRef.current);
    }
    if (dragEndListenerRef.current) {
      window.google.maps.event.removeListener(dragEndListenerRef.current);
    }
    if (zoomChangedListenerRef.current) {
      window.google.maps.event.removeListener(zoomChangedListenerRef.current);
    }
    const setPinCentralMoviendo = (moviendo) => {
      (pinCentralRefs.current || []).forEach((el) => {
        if (!el) return;
        el.classList.toggle('moviendo', moviendo);
      });
      // Clase en el lienzo: apaga transitions de pines OverlayView durante el pan (evita fantasma)
      mapaLienzoRef.current?.classList.toggle('mapa-arrastrando', moviendo);
    };
    // center_changed sigue el pan con inercia (más fluido que solo “drag”)
    const sincronizarRadioConPuntero = () => {
      if (!perdidasCercaActivoRef.current || ignorarDragCercaRef.current) return;
      if (cercaOrigenRef.current !== 'mapa') return;
      const c = map.getCenter?.();
      if (!c) return;
      mapCenterRef.current = { lat: c.lat(), lng: c.lng() };
      const circulo = radioCercaCircleRef.current;
      if (circulo) circulo.setCenter(c);
    };
    // GPS → otra zona (mismo criterio que al arrastrar)
    const soltarSeguimientoGps = () => {
      if (
        !perdidasCercaActivoRef.current
        || ignorarDragCercaRef.current
        || cercaOrigenRef.current !== 'gps'
      ) return;
      const c = map.getCenter?.();
      if (c) {
        mapCenterRef.current = { lat: c.lat(), lng: c.lng() };
        if (radioCercaCircleRef.current) {
          radioCercaCircleRef.current.setCenter(c);
          radioCercaCircleRef.current.setOptions({
            strokeColor: '#ea580c',
            fillColor: '#f97316',
          });
        }
      }
      cercaOrigenRef.current = 'mapa';
      pendingCercaOrigenMapaRef.current = true;
    };
    dragStartListenerRef.current = map.addListener('dragstart', () => {
      bloquearAutoDireccionRef.current = false;
      if (!showPopupRef.current) setPinCentralMoviendo(true);
      // Solo DOM/refs acá: un setState a mitad del drag re-pinta OverlayViews y genera flash
      if (!omitirRestaurarPunteroRef.current && !showPopupRef.current) {
        if (ocultarPunteroMapaRef.current || highlightedMarkerIdRef.current != null) {
          pendingLimpiarPunteroRef.current = true;
        }
      }
      soltarSeguimientoGps();
    });
    // Solo pausar el follow al zoom manual: NO pasar a “otra zona” (eso pone el pin
    // naranja en el centro y parece que el puntero se corrió).
    zoomChangedListenerRef.current = map.addListener('zoom_changed', () => {
      if (ignorarZoomProgramaticoRef.current) return;
      if (
        perdidasCercaActivoRef.current
        && !ignorarDragCercaRef.current
        && cercaOrigenRef.current === 'gps'
      ) {
        gpsFollowPausadoRef.current = true;
      }
    });
    centerChangedListenerRef.current = map.addListener('center_changed', sincronizarRadioConPuntero);
    dragEndListenerRef.current = map.addListener('dragend', () => {
      setPinCentralMoviendo(false);
      sincronizarRadioConPuntero();
      if (pendingCercaOrigenMapaRef.current) {
        pendingCercaOrigenMapaRef.current = false;
        setCercaOrigen('mapa');
      }
      if (pendingLimpiarPunteroRef.current) {
        pendingLimpiarPunteroRef.current = false;
        setOcultarPunteroMapa(false);
        setHighlightedMarkerId(null);
      }
      if (perdidasCercaActivoRef.current && !ignorarDragCercaRef.current) {
        programarReloadCercaDesdeMapa();
      }
    });
    idleListenerRef.current = map.addListener('idle', () => {
      if (showPopupRef.current || omitirIdleRef.current || bloquearAutoDireccionRef.current || !mapRef.current) return;
      // En Radar Cerca no geocodificar el pin de “publicar”
      if (perdidasCercaActivoRef.current) return;
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(() => {
        actualizarDireccionDelPin(true);
      }, 500);
    });
    if (!modoSoloCaso) {
      setTimeout(() => actualizarDireccionDelPin(true), 600);
    }
  }, [actualizarDireccionDelPin, modoSoloCaso, focoCasoMapa, programarReloadCercaDesdeMapa]);

  useEffect(() => {
    return () => {
      if (idleListenerRef.current) {
        window.google.maps.event.removeListener(idleListenerRef.current);
      }
      if (dragStartListenerRef.current) {
        window.google.maps.event.removeListener(dragStartListenerRef.current);
      }
      if (dragListenerRef.current) {
        window.google.maps.event.removeListener(dragListenerRef.current);
      }
      if (centerChangedListenerRef.current) {
        window.google.maps.event.removeListener(centerChangedListenerRef.current);
      }
      if (dragEndListenerRef.current) {
        window.google.maps.event.removeListener(dragEndListenerRef.current);
      }
      if (zoomChangedListenerRef.current) {
        window.google.maps.event.removeListener(zoomChangedListenerRef.current);
      }
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, []);

  const abrirNuevoReporteEn = useCallback((lat, lng, direccion = '') => {
    puntoElegidoRef.current = { lat, lng };
    const direccionInicial = String(direccion || '').trim();
    setFormData({
      lat,
      lng,
      image: null,
      date: '',
      time: '',
      description: '',
      direccion: direccionInicial,
      status: 'pendiente_aprobacion',
      category: 'reparaciones',
      familiasTipo: '',
      animalTipo: '',
      perdidaTipo: '',
      objeto: '',
      contacto: '',
      resolvedAt: null,
      claimedByMe: false,
      canChat: false,
      claimCount: 0,
      chatAbiertoPorMi: false,
      confirmacionPerdidaMia: null,
      perdidaEsperaOtraParte: false,
    });
    setSelectedImage(null);
    setIsImageZoomed(false);
    setShowPopup(true);
    setEditMode(null);
    setCanEdit(true);
    setRecienPublicado(false);
    setMostrarOpcionesFoto(false);
    setMostrarChatReclamo(false);
    setMostrarCercanos(false);
    setCasosCercanos([]);
    // Completar / refrescar dirección del pin si falta
    if (!direccionInicial) {
      obtenerDireccionDesdePunto(lat, lng).then((texto) => {
        if (!texto) return;
        setDireccionPreview(texto);
        setFormData((prev) => {
          if (prev.lat !== lat || prev.lng !== lng) return prev;
          if (String(prev.direccion || '').trim()) return prev;
          return { ...prev, direccion: texto };
        });
      });
    }
  }, []);

  const confirmarPuntoMapa = useCallback(async () => {
    if (!mapRef.current) return;
    const centro = mapRef.current.getCenter();
    if (!centro) return;
    const lat = centro.lat();
    const lng = centro.lng();
    let direccion = String(direccionPreview || '').trim();
    if (!direccion) {
      direccion = await obtenerDireccionDesdePunto(lat, lng);
    }
    if (direccion) setDireccionPreview(direccion);
    abrirNuevoReporteEn(lat, lng, direccion || '');
  }, [abrirNuevoReporteEn, direccionPreview]);

  const irAMiUbicacion = useCallback(() => {
    if (!mapRef.current || !userLocation) return;
    omitirIdleRef.current = true;
    mapRef.current.panTo(userLocation);
    mapRef.current.setZoom(18);
    setMapCenter(userLocation);
    if (modoSoloCaso) {
      window.setTimeout(() => { omitirIdleRef.current = false; }, 400);
      return;
    }
    obtenerDireccionDesdePunto(userLocation.lat, userLocation.lng).then((texto) => {
      setDireccionPreview(texto);
      omitirIdleRef.current = false;
    });
  }, [userLocation, modoSoloCaso]);

  const elegirDireccionBuscada = useCallback(({ direccion, lat, lng }) => {
    if (!mapRef.current) return;
    bloquearAutoDireccionRef.current = false;
    omitirIdleRef.current = true;
    setDireccionPreview(direccion);
    setMapCenter({ lat, lng });
    mapRef.current.panTo({ lat, lng });
    mapRef.current.setZoom(18);
    setTimeout(() => {
      omitirIdleRef.current = false;
    }, 500);
  }, []);

  const limpiarDireccionBuscador = useCallback(() => {
    bloquearAutoDireccionRef.current = true;
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    geocodeSeqRef.current += 1;
    setDireccionPreview('');
  }, []);

  const handleMarkerClick = useCallback((marker, forceAdmin = false) => {
    setEditMode(marker._id); // Activar el modo de edición para el marcador seleccionado
    setFormData({
      lat: marker.lat,
      lng: marker.lng,
      date: marker.date,
      time: marker.time,
      description: marker.description,
      direccion: marker.direccion || '',
      image: null, // No cargamos una nueva imagen por defecto en la edición
      category: marker.category === 'persona' ? 'familias' : normalizeCategoryValue(marker.category),
      familiasTipo: marker.category === 'persona' ? 'calle' : (marker.familiasTipo || ''),
      animalTipo: marker.animalTipo || '',
      perdidaTipo: marker.perdidaTipo || '',
      objeto: marker.objeto || '',
      contacto: marker.contacto || '',
      status: marker.status || 'pendiente',
      resolvedAt: marker.resolvedAt || null,
      caseId: marker.caseId || null,
      resolvedBy: marker.resolvedBy || null,
      resolvedByReportedAt: marker.resolvedByReportedAt || null,
      jurisdictionName: marker.jurisdictionName || null,
      resolutionDescription: marker.resolutionDescription || '',
      resolutionImageUrl: marker.resolutionImageUrl || null,
      createdAt: marker.createdAt || null,
      aprobadoAt: marker.aprobadoAt || null,
      neighborCount: marker.neighborCount || 1,
      avisadoAt: marker.avisadoAt || null,
      createdBy: marker.createdBy || '',
      claimedByMe: !!marker.claimedByMe,
      canChat: !!marker.canChat,
      claimCount: marker.claimCount || 0,
      chatAbiertoPorMi: !!marker.chatAbiertoPorMi,
      confirmacionPerdidaMia: marker.confirmacionPerdidaMia || null,
      perdidaEsperaOtraParte: !!marker.perdidaEsperaOtraParte,
      canManage: !!marker.canManage,
      pideDatosAt: marker.pideDatosAt || null,
      pideDatosMensaje: marker.pideDatosMensaje || '',
      respuestaDatosAt: marker.respuestaDatosAt || null,
      ultimaRespuestaDatosAt: marker.ultimaRespuestaDatosAt || null,
      eliminadoAt: marker.eliminadoAt || null,
      motivoEliminacion: marker.motivoEliminacion || '',
    });
    setMostrarChatReclamo(false);
    setResolutionPhoto(null);
    setResolutionPreview(null);
    setResolutionDescription('');
    setEditandoResolucion(false);
    setMostrarResolucion(false);
    // Respuesta vacía: no precargar la descripción (evita el campo “sobrecargado”)
    setRespuestaDatos('');
    setFotoRespuestaDatos(null);
    setPreviewRespuestaDatos(null);
    setMostrarOpcionesFotoRespuesta(false);
    setVerDetalleResolucion(false);
    setSelectedImage(marker.imageUrl ? buildImageUrl(marker.imageUrl) : null); // Mostrar imagen existente
    setIsImageZoomed(false);
    setShowPopup(true);
    setRecienPublicado(false);
    const markerOwner = marker.createdBy
      ? String(marker.createdBy).trim().toLowerCase()
      : 'anonimo';
    const esDueno = markerOwner === userId;
    // Si el admin ya actuó (aprobó, cambió estado o avisó), el vecino solo puede ver
    const adminTomoAccion =
      Boolean(marker.avisadoAt)
      || (marker.status && marker.status !== 'pendiente_aprobacion');
    if (forceAdmin) {
      setCanEdit(false);
      setShowDeleteOnly(true);
    } else if (esDueno && !adminTomoAccion) {
      setCanEdit(true);
      setShowDeleteOnly(false);
    } else {
      // Lectura: dueño con caso ya gestionado, u otro vecino
      setCanEdit(false);
      setShowDeleteOnly(esDueno || Boolean(marker.caseId));
    }
    // Brillante + ocultar puntero; congelar vista (el re-render no debe mover el mapa)
    const centroAntes = mapRef.current?.getCenter?.();
    const zoomAntes = mapRef.current?.getZoom?.();
    const vistaCongelada = centroAntes
      ? { lat: centroAntes.lat(), lng: centroAntes.lng(), zoom: zoomAntes }
      : null;
    setHighlightedMarkerId(marker._id);
    setOcultarPunteroMapa(true);
    if (vistaCongelada) {
      omitirRestaurarPunteroRef.current = true;
      omitirIdleRef.current = true;
      window.requestAnimationFrame(() => {
        if (mapRef.current) {
          mapRef.current.setCenter({ lat: vistaCongelada.lat, lng: vistaCongelada.lng });
          if (Number.isFinite(vistaCongelada.zoom)) mapRef.current.setZoom(vistaCongelada.zoom);
        }
        window.setTimeout(() => {
          omitirRestaurarPunteroRef.current = false;
          omitirIdleRef.current = false;
        }, 120);
      });
    }
  }, [userId, normalizeCategoryValue, buildImageUrl]);

  // Admin / foco: abrir el mismo popup del proyecto en un caso concreto
  useEffect(() => {
    if (!focoCasoMapa || !focoCasoMapa._id) return undefined;
    if (!isLoaded) return undefined;

    const markerNormalizado = {
      ...focoCasoMapa,
      isSaved: true,
      category: normalizeCategoryValue(focoCasoMapa.category),
      status: focoCasoMapa.status || 'pendiente',
      contacto: focoCasoMapa.contacto || '',
      createdBy: focoCasoMapa.createdBy
        ? String(focoCasoMapa.createdBy).trim().toLowerCase()
        : 'anonimo',
      claimedByMe: !!focoCasoMapa.claimedByMe,
      canChat: !!focoCasoMapa.canChat,
      claimCount: focoCasoMapa.claimCount || 0,
      chatAbiertoPorMi: !!focoCasoMapa.chatAbiertoPorMi,
      confirmacionPerdidaMia: focoCasoMapa.confirmacionPerdidaMia || null,
      perdidaEsperaOtraParte: !!focoCasoMapa.perdidaEsperaOtraParte,
      canManage: true,
    };

    casosAdminForzadosRef.current.set(String(markerNormalizado._id), markerNormalizado);
    if (modoSoloCaso) {
      setMarkers([markerNormalizado]);
      setMarkersMeta({ total: 1, hasMore: false, limit: 1 });
      setMapCenter({
        lat: Number(markerNormalizado.lat) || -26.8084602,
        lng: Number(markerNormalizado.lng) || -65.2175701,
      });
    } else {
      setMarkers((prev) => (
        prev.some((m) => String(m._id) === String(markerNormalizado._id))
          ? prev.map((m) => (
            String(m._id) === String(markerNormalizado._id) ? { ...m, ...markerNormalizado } : m
          ))
          : [...prev, markerNormalizado]
      ));
    }

    let cancelado = false;
    const enfocar = () => {
      if (cancelado) return;
      const lat = Number(markerNormalizado.lat);
      const lng = Number(markerNormalizado.lng);
      const centro = { lat, lng };
      if (mapRef.current && Number.isFinite(lat) && Number.isFinite(lng)) {
        if (window.google?.maps?.event) {
          window.google.maps.event.trigger(mapRef.current, 'resize');
        }
        mapRef.current.setCenter(centro);
        mapRef.current.setZoom(18);
        mapRef.current.panTo(centro);
        setMapCenter(centro);
      }
      if (modoSoloCaso) {
        // Solo centrar con el pin brillando; el popup se abre al tocar el marcador
        yaCentroUsuario.current = true;
        setHighlightedMarkerId(markerNormalizado._id);
        setShowPopup(false);
        setEditMode(markerNormalizado._id);
      } else {
        handleMarkerClick(markerNormalizado, true);
      }
      if (onFocoCasoVisto) onFocoCasoVisto();
    };

    const t = window.setTimeout(enfocar, 120);
    const t2 = window.setTimeout(enfocar, 350);
    const t3 = window.setTimeout(enfocar, 700);
    return () => {
      cancelado = true;
      window.clearTimeout(t);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
    };
  }, [focoCasoMapa, isLoaded, normalizeCategoryValue, handleMarkerClick, onFocoCasoVisto, modoSoloCaso]);

  // Función para enviar los datos del formulario al servidor
  const handleSubmit = async (e) => {
    e.preventDefault();

    const {
      image, date, time, description, category, status, familiasTipo, animalTipo, perdidaTipo, objeto, contacto,
    } = formData;
    if (!image) {
      mostrarAviso('Para subir el reporte tenés que agregar una foto.', true);
      return;
    }
    if (category === 'cosas_perdidas' && !perdidaTipo) {
      mostrarAviso('Elegí si perdiste o encontraste algo.', true);
      return;
    }
    if (category === 'perros_gatos' && !animalTipo) {
      mostrarAviso('Elegí de qué se trata el aviso de animales.', true);
      return;
    }
    if (category === 'perros_gatos' && !contactoValido(contacto)) {
      mostrarAviso('En avisos de animales el celular de contacto es obligatorio.', true);
      return;
    }
    const ahora = new Date();
    const dateFinal = date || ahora.toISOString().slice(0, 10);
    const timeFinal = time || ahora.toTimeString().slice(0, 5);
    const objetoFinal = category === 'cosas_perdidas'
      ? String(objeto || description || '').trim().slice(0, 120)
      : '';
    const lat = puntoElegidoRef.current ? puntoElegidoRef.current.lat : formData.lat;
    const lng = puntoElegidoRef.current ? puntoElegidoRef.current.lng : formData.lng;
    let direccion = String(formData.direccion || direccionPreview || '').trim();
    if (!direccion && lat != null && lng != null) {
      direccion = await obtenerDireccionDesdePunto(Number(lat), Number(lng));
      if (direccion) {
        setFormData((prev) => ({ ...prev, direccion }));
      }
    }
    if (category === 'reparaciones' && !ignorarCercanosRef.current) {
      const cercanos = buscarReparacionesCercanas(markers, Number(lat), Number(lng))
        .filter((marker) => {
          if (marker.confirmedByMe) return false;
          const dueno = marker.createdBy ? String(marker.createdBy).trim().toLowerCase() : '';
          return dueno !== userId;
        });
      if (cercanos.length) {
        setCasosCercanos(cercanos);
        setMostrarCercanos(true);
        return;
      }
    }
    ignorarCercanosRef.current = false;
    const formDataToSend = new FormData();
    formDataToSend.append('lat', lat);
    formDataToSend.append('lng', lng);
    formDataToSend.append('image', image);
    formDataToSend.append('date', dateFinal);
    formDataToSend.append('time', timeFinal);
    formDataToSend.append('description', description);
    formDataToSend.append('direccion', String(direccion || '').trim());
    formDataToSend.append('category', category);
    formDataToSend.append('familiasTipo', category === 'familias' ? familiasTipo : '');
    formDataToSend.append('animalTipo', category === 'perros_gatos' ? animalTipo : '');
    formDataToSend.append('perdidaTipo', category === 'cosas_perdidas' ? perdidaTipo : '');
    formDataToSend.append('objeto', objetoFinal);
    formDataToSend.append(
      'contacto',
      category === 'perros_gatos' ? digitosContacto(contacto) : ''
    );
    formDataToSend.append('status', status || 'pendiente');

    try {
      const response = await axios.post('http://localhost:5001/api/markers', formDataToSend, {
        headers: {
          'Content-Type': 'multipart/form-data',
          'x-user-id': userId,
        },
      });
      const newMarker = {
        ...response.data,
        isSaved: true,
        createdBy: userId,
        category: normalizeCategoryValue(response.data.category),
        resolvedAt: response.data.resolvedAt || null,
        caseId: response.data.caseId || null,
        resolvedBy: response.data.resolvedBy || null,
        resolvedByReportedAt: response.data.resolvedByReportedAt || null,
      };
      // Agregamos el nuevo marcador guardado a la lista
      setMarkers((prevMarkers) => [...prevMarkers, newMarker]);
      
      // Mantener el popup abierto mostrando el marcador recién creado con estado "pendiente_aprobacion"
      setEditMode(newMarker._id);
      setFormData({
        lat: newMarker.lat,
        lng: newMarker.lng,
        image: null,
        date: newMarker.date || '',
        time: newMarker.time || '',
        description: newMarker.description || '',
        direccion: newMarker.direccion || '',
        category: normalizeCategoryValue(newMarker.category),
        familiasTipo: newMarker.familiasTipo || '',
        animalTipo: newMarker.animalTipo || '',
        perdidaTipo: newMarker.perdidaTipo || '',
        objeto: newMarker.objeto || '',
        contacto: newMarker.contacto || '',
        status: newMarker.status || 'pendiente_aprobacion',
        resolvedAt: newMarker.resolvedAt || null,
        caseId: newMarker.caseId || null,
        resolvedBy: newMarker.resolvedBy || null,
        resolvedByReportedAt: newMarker.resolvedByReportedAt || null,
        jurisdictionName: newMarker.jurisdictionName || null,
        createdAt: newMarker.createdAt || null,
        claimedByMe: false,
        canChat: true,
        claimCount: 0,
        chatAbiertoPorMi: false,
        confirmacionPerdidaMia: null,
        perdidaEsperaOtraParte: false,
        createdBy: userId,
      });
      setSelectedImage(newMarker.imageUrl ? buildImageUrl(newMarker.imageUrl) : null);
      setIsImageZoomed(false);
      setCanEdit(false);
      setShowDeleteOnly(true);
      setRecienPublicado(true);
      // El popup permanece abierto con el mismo estilo de publicar
    } catch (error) {
      console.error('Error uploading marker:', error);
      if (error.response?.status === 429) {
        setShowPopup(false);
      }
      mostrarAviso(
        error.response?.data?.message || 'No se pudo publicar la denuncia. Intentá de nuevo.',
        true
      );
    }
  };

  const confirmarMismoCaso = async (marker) => {
    const dueno = marker.createdBy ? String(marker.createdBy).trim().toLowerCase() : '';
    if (dueno === userId) {
      setMostrarCercanos(false);
      setCasosCercanos([]);
      setShowPopup(false);
      mostrarAviso(`Ese problema ya es el caso #${marker.caseId}. No se creó otro.`);
      return;
    }
    setSumandoCaso(marker._id);
    const datos = new FormData();
    datos.append('lat', formData.lat);
    datos.append('lng', formData.lng);
    datos.append('description', formData.description || '');
    if (formData.image) datos.append('image', formData.image);
    try {
      const response = await axios.post(`http://localhost:5001/api/markers/${marker._id}/confirm`, datos, {
        headers: {
          'Content-Type': 'multipart/form-data',
          'x-user-id': userId,
        },
      });
      const actualizado = {
        ...response.data,
        category: normalizeCategoryValue(response.data.category),
      };
      setMarkers((prev) => prev.map((item) => (item._id === marker._id ? actualizado : item)));
      setMostrarCercanos(false);
      setCasosCercanos([]);
      setShowPopup(false);
      mostrarAviso(
        `Tu denuncia se sumó al caso #${actualizado.caseId}. Lo reportaron ${actualizado.neighborCount} vecinos.`
      );
    } catch (error) {
      const mensaje = error.response && error.response.data && error.response.data.message
        ? error.response.data.message
        : 'No se pudo sumar la denuncia a ese caso.';
      mostrarAviso(mensaje, true);
    } finally {
      setSumandoCaso(null);
    }
  };

  const publicarComoCasoNuevo = () => {
    ignorarCercanosRef.current = true;
    setMostrarCercanos(false);
    handleSubmit({ preventDefault() {} });
  };

  // Función para manejar la actualización del marcador
  // const handleUpdateMarker = (marker) => {
  //   setEditMode(marker._id); // Activar el modo de edición para el marcador seleccionado
  //   setFormData({
  //     lat: marker.lat,
  //     lng: marker.lng,
  //     date: marker.date,
  //     time: marker.time,
  //     description: marker.description,
  //     image: null, // No cargamos una nueva imagen por defecto
  //   });
  //   setPopupPosition({ lat: marker.lat, lng: marker.lng });
  //   setShowPopup(true);
  // };

  const handleSaveUpdate = async (e, markerId) => {
    e.preventDefault();
    if (!canEdit) {
      return;
    }

    const {
      lat, lng, image, date, time, description, direccion, category, status,
      familiasTipo, animalTipo, perdidaTipo, objeto, contacto,
    } = formData;
    if (category === 'cosas_perdidas' && !perdidaTipo) {
      mostrarAviso('Elegí si perdiste o encontraste algo.', true);
      return;
    }
    if (category === 'perros_gatos' && !animalTipo) {
      mostrarAviso('Elegí de qué se trata el aviso de animales.', true);
      return;
    }
    if (category === 'perros_gatos' && !contactoValido(contacto)) {
      mostrarAviso('En avisos de animales el celular de contacto es obligatorio.', true);
      return;
    }
    const formDataToUpdate = new FormData();
    formDataToUpdate.append('lat', lat);
    formDataToUpdate.append('lng', lng);
    formDataToUpdate.append('image', image);
    formDataToUpdate.append('date', date);
    formDataToUpdate.append('time', time);
    formDataToUpdate.append('description', description);
    formDataToUpdate.append('direccion', String(direccion || '').trim());
    formDataToUpdate.append('category', category);
    formDataToUpdate.append('familiasTipo', category === 'familias' ? familiasTipo : '');
    formDataToUpdate.append('animalTipo', category === 'perros_gatos' ? animalTipo : '');
    formDataToUpdate.append('perdidaTipo', category === 'cosas_perdidas' ? perdidaTipo : '');
    formDataToUpdate.append('objeto', category === 'cosas_perdidas' ? String(objeto || '').trim() : '');
    formDataToUpdate.append(
      'contacto',
      category === 'perros_gatos' ? digitosContacto(contacto) : ''
    );
    formDataToUpdate.append('status', status || 'pendiente');

    try {
      const response = await axios.put(`http://localhost:5001/api/markers/${markerId}`, formDataToUpdate, {
        headers: {
          'Content-Type': 'multipart/form-data',
          'x-user-id': userId,
        },
      });
      // Actualizar los marcadores en el estado local
      const updatedMarkers = markers.map(marker =>
        marker._id === markerId
          ? {
              ...response.data,
              isSaved: true,
              category: normalizeCategoryValue(response.data.category),
            }
          : marker
      );
      setMarkers(updatedMarkers);
      setEditMode(null); // Salir del modo de edición
      setShowPopup(false);
      setIsImageZoomed(false);
      setSelectedImage(null);
    } catch (error) {
      console.error('Error updating marker:', error);
    }
  };

  // Función para eliminar desde el panel de administración (con opción de deshacer)
  const handleAdminDeleteMarker = (marker) => {
    // Cancelar timeout e intervalo anteriores si existen
    if (deleteTimeoutRef.current) {
      clearTimeout(deleteTimeoutRef.current);
      deleteTimeoutRef.current = null;
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    
    // Guardar el marcador para poder deshacer
    idsEnBorradoRef.current.add(String(marker._id));
    setDeletedMarker(marker);
    setDeleteCountdown(10);
    // Eliminar del estado local
    setMarkers((prevMarkers) =>
      prevMarkers.filter((m) => m._id !== marker._id)
    );
    
    // Contador visual
    countdownIntervalRef.current = setInterval(() => {
      setDeleteCountdown((prev) => {
        if (prev <= 1) {
          if (countdownIntervalRef.current) {
            clearInterval(countdownIntervalRef.current);
            countdownIntervalRef.current = null;
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    
    // A los 10 segundos se cierra el aviso al instante y el borrado sigue en segundo plano
    deleteTimeoutRef.current = setTimeout(async () => {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
      deleteTimeoutRef.current = null;
      setDeletedMarker(null);
      setDeleteCountdown(10);
      setMarkers((prevMarkers) => prevMarkers.filter((m) => m._id !== marker._id));
      try {
        await axios.delete(`http://localhost:5001/api/markers/${marker._id}`, {
          headers: {
            'x-user-id': userId,
          },
        });
      } catch (error) {
        idsEnBorradoRef.current.delete(String(marker._id));
        setMarkers((prevMarkers) => (
          prevMarkers.some((item) => item._id === marker._id) ? prevMarkers : [...prevMarkers, marker]
        ));
        console.error('Error deleting marker:', error);
      }
    }, 10000); // 10 segundos para deshacer
  };

  // Función para deshacer la eliminación
  const handleUndoDelete = () => {
    if (deletedMarker) {
      // Cancelar el timeout de eliminación
      if (deleteTimeoutRef.current) {
        clearTimeout(deleteTimeoutRef.current);
        deleteTimeoutRef.current = null;
      }
      // Cancelar el contador
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
      // Restaurar el marcador en el estado
      idsEnBorradoRef.current.delete(String(deletedMarker._id));
      setMarkers((prevMarkers) => [...prevMarkers, deletedMarker]);
      setDeletedMarker(null);
      setDeleteCountdown(10);
    }
  };

  // Limpiar timeouts al desmontar
  useEffect(() => {
    return () => {
      if (deleteTimeoutRef.current) {
        clearTimeout(deleteTimeoutRef.current);
      }
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
    };
  }, []);

  // Función para manejar la eliminación del marcador (desde el popup)
  const handleDeleteMarker = async (markerId) => {
    console.log('Attempting to delete marker with ID:', markerId); // Añadido para depuración
    // Quitamos el marcador del estado aunque el backend responda 404 (ya no exista)
    setMarkers((prevMarkers) =>
      prevMarkers.filter((marker) => marker._id !== markerId)
    );
    // Cerramos el popup y salimos de modo edición
    setShowPopup(false);
    setEditMode(null);
    setHighlightedMarkerId((prev) => (prev === markerId ? null : prev));
    setShowDeleteOnly(false);
    try {
      await axios.delete(`http://localhost:5001/api/markers/${markerId}`, {
        headers: {
          'x-user-id': userId,
        },
      });
    } catch (error) {
      if (error.response && error.response.status === 404) {
        console.warn('Marker not found in backend, removed locally:', markerId);
      } else {
      console.error('Error deleting marker:', error);
      }
    }
  };

  const irAMiReporte = useCallback((marker) => {
    if (!marker) return;
    setMostrarMisReportes(false);
    setMostrarCosasPerdidas(false);
    setMostrarNotificaciones(false);
    setIdPerdidaDestacada(null);
    setMapCenter({ lat: Number(marker.lat), lng: Number(marker.lng) });
    if (mapRef.current) {
      mapRef.current.panTo({ lat: Number(marker.lat), lng: Number(marker.lng) });
      mapRef.current.setZoom(18);
    }
    handleMarkerClick(marker);
  }, [handleMarkerClick]);

  const irAPerdida = useCallback(async (marker, { abrirChat = false } = {}) => {
    if (!marker) return;
    await marcarPerdidasLeidas(
      marker._id,
      abrirChat ? ['chat', 'reclamo'] : ['cerca']
    );
    irAMiReporte(marker);
    if (abrirChat) {
      window.setTimeout(() => setMostrarChatReclamo(true), 60);
    }
  }, [marcarPerdidasLeidas, irAMiReporte]);

  /** Actividad del aviso (chat/reclamo) vs aviso de cercanía: no se mezclan en el badge. */
  const resumenAvisosPerdida = useCallback((markerId) => {
    if (!markerId) return { chat: 0, cerca: 0 };
    let chat = 0;
    let cerca = 0;
    notificaciones.forEach((n) => {
      if (n.leida || String(n.markerId) !== String(markerId)) return;
      if (n.tipo === 'chat' || n.tipo === 'reclamo') chat += 1;
      else if (n.tipo === 'cerca') cerca += 1;
    });
    return { chat, cerca };
  }, [notificaciones]);

  const radarBadgeCerca = useMemo(() => (
    notificaciones.reduce((acc, n) => (
      (!n.leida && n.tipo === 'cerca') ? acc + 1 : acc
    ), 0)
  ), [notificaciones]);

  const radarBadgeMios = useMemo(() => (
    notificaciones.reduce((acc, n) => (
      (!n.leida && (n.tipo === 'chat' || n.tipo === 'reclamo')) ? acc + 1 : acc
    ), 0)
  ), [notificaciones]);

  const verMisCasosEnElMapa = () => {
    setMostrarMisReportes(false);
    setSoloMisReportes(true);
  };

  const renovarPublicacion = useCallback(async (marker) => {
    if (!marker?._id || renovandoId) return;
    setRenovandoId(marker._id);
    try {
      const { data } = await axios.patch(
        `http://localhost:5001/api/markers/${marker._id}/renovar`,
        {},
        { headers: { 'x-user-id': userId } }
      );
      const renovado = {
        ...data,
        isSaved: true,
        category: normalizeCategoryValue(data.category),
        createdBy: data.createdBy
          ? String(data.createdBy).trim().toLowerCase()
          : 'anonimo',
        eliminadoAt: null,
        motivoEliminacion: '',
        aprobadoAt: data.aprobadoAt || new Date().toISOString(),
      };
      setMisReportesRegistro((prev) => prev.filter((m) => m._id !== marker._id));
      setMisReportesActivos((prev) => [renovado, ...prev.filter((m) => m._id !== marker._id)]);
      setMarkers((prev) => {
        const sin = prev.filter((m) => m._id !== marker._id);
        return [...sin, renovado];
      });
      if (editMode === marker._id) {
        setFormData((prev) => ({
          ...prev,
          status: renovado.status,
          eliminadoAt: null,
          motivoEliminacion: '',
          aprobadoAt: renovado.aprobadoAt,
        }));
      }
      setMostrarMisReportes(false);
      mostrarAviso('Publicación renovada. Vuelve a estar visible 15 días más.');
      irAMiReporte(renovado);
    } catch (error) {
      mostrarAviso(
        error.response?.data?.message || 'No se pudo renovar la publicación.',
        true
      );
    } finally {
      setRenovandoId(null);
    }
  }, [renovandoId, userId, normalizeCategoryValue, editMode, irAMiReporte]);

  const coincideAvisoCaso = useCallback((aviso, item) => {
    if (!item) return false;
    const mid = aviso?.markerId;
    const midStr = mid && typeof mid === 'object'
      ? String(mid._id || mid)
      : (mid ? String(mid) : '');
    if (midStr && String(item._id) === midStr) return true;
    if (aviso?.caseId != null && Number(item.caseId) === Number(aviso.caseId)) return true;
    return false;
  }, []);

  const abrirCasoDesdeRegistro = useCallback(async (aviso) => {
    if (!aviso?.markerId && !aviso?.caseId) return null;
    const guardarYDevolver = (found) => {
      if (!found) return null;
      setMisReportesRegistro((prev) => {
        if (prev.some((m) => m._id === found._id)) return prev;
        return [found, ...prev];
      });
      setMisReportesSeccion('registro');
      return found;
    };
    try {
      // 1) Buscar por número de caso si viene
      if (aviso.caseId) {
        const { data } = await axios.get('http://localhost:5001/api/markers', {
          headers: { 'x-user-id': userId },
          params: { mine: '1', eliminados: '1', limit: 20, page: 1, q: String(aviso.caseId) },
        });
        const found = (data.items || []).map(normalizarMisItem).find((item) => coincideAvisoCaso(aviso, item));
        if (found) return guardarYDevolver(found);
      }
      // 2) Últimos del registro propio (por id de marcador)
      const { data } = await axios.get('http://localhost:5001/api/markers', {
        headers: { 'x-user-id': userId },
        params: { mine: '1', eliminados: '1', limit: 50, page: 1 },
      });
      const found = (data.items || []).map(normalizarMisItem).find((item) => coincideAvisoCaso(aviso, item));
      return guardarYDevolver(found || null);
    } catch (error) {
      console.error('Error buscando caso en registro:', error);
    }
    return null;
  }, [userId, normalizarMisItem, coincideAvisoCaso]);

  /** Busca el caso del aviso en mapa / Mis reportes / API (activos y registro). */
  const obtenerCasoDesdeAvisoVecino = useCallback(async (aviso, markerLocal = null) => {
    if (!aviso?.markerId && !aviso?.caseId) return null;
    if (markerLocal) return markerLocal;
    const enMemoria = [
      ...markers,
      ...misReportesActivos,
      ...misReportesRegistro,
    ].find((item) => coincideAvisoCaso(aviso, item));
    if (enMemoria) return normalizarMisItem(enMemoria);

    const headers = { 'x-user-id': userId };
    const buscar = async (extra = {}) => {
      const params = { mine: '1', limit: 20, page: 1, ...extra };
      if (aviso.caseId) params.q = String(aviso.caseId);
      const { data } = await axios.get('http://localhost:5001/api/markers', { headers, params });
      return (data.items || []).map(normalizarMisItem).find((item) => coincideAvisoCaso(aviso, item)) || null;
    };
    try {
      const activo = await buscar();
      if (activo) return activo;
      return await buscar({ eliminados: '1' });
    } catch (error) {
      console.error('Error buscando caso del aviso:', error);
      return null;
    }
  }, [
    markers,
    misReportesActivos,
    misReportesRegistro,
    userId,
    normalizarMisItem,
    coincideAvisoCaso,
  ]);

  const asegurarCasoEnMapa = useCallback((caso) => {
    if (!caso?._id) return;
    setMarkers((prev) => {
      const id = String(caso._id);
      if (prev.some((m) => String(m._id) === id)) {
        return prev.map((m) => (String(m._id) === id ? { ...m, ...caso, isSaved: true } : m));
      }
      return [...prev, { ...caso, isSaved: true }];
    });
  }, []);

  const abrirDesdeNotificacion = useCallback(async (aviso) => {
    try {
      if (aviso && !aviso.leida && aviso._id) {
        await axios.patch(
          `http://localhost:5001/api/notificaciones/${aviso._id}/leer`,
          {},
          { headers: { 'x-user-id': userId } }
        );
        setNotificaciones((prev) =>
          prev.map((item) => (item._id === aviso._id ? { ...item, leida: true } : item))
        );
        const esPerdida = aviso.tipo === 'reclamo' || aviso.tipo === 'chat' || aviso.tipo === 'cerca';
        if (esPerdida) {
          setPerdidasNoLeidasLocal((prev) => {
            const siguiente = Math.max(0, prev - 1);
            if (onPerdidasNoLeidasChange) onPerdidasNoLeidasChange(siguiente);
            return siguiente;
          });
        } else {
          setNoLeidasLocal((prev) => {
            const siguiente = Math.max(0, prev - 1);
            if (onNoLeidasChange) onNoLeidasChange(siguiente);
            return siguiente;
          });
        }
      }
    } catch (error) {
      console.error('Error marcando aviso como leído:', error);
    }

    // Admin en modo vecino → panel admin (excepto avisos propios de vecino: aprobado, etc.)
    if (typeof onAbrirCasoAdmin === 'function' && aviso && (aviso.markerId || aviso.caseId)) {
      const esAvisoVecinoPropio = aviso.tipo === 'aprobado'
        || aviso.tipo === 'avisado'
        || aviso.tipo === 'estado'
        || aviso.tipo === 'pedir_datos';
      if (!esAvisoVecinoPropio) {
        if (TIPOS_NOTIF_PANEL_ADMIN.has(aviso.tipo)
          || notifApuntaAlRegistro(aviso)
          || aviso.tipo === 'resuelto'
          || aviso.tipo === 'rechazado'
          || aviso.tipo === 'respuesta_datos') {
          setMostrarNotificaciones(false);
          let casoAdmin = null;
          try {
            const headers = { 'x-user-id': userId };
            const q = aviso.caseId != null
              ? String(aviso.caseId)
              : String(aviso.markerId?._id || aviso.markerId || '');
            const pick = (items) => (items || []).find((item) => coincideAvisoCaso(aviso, item)) || null;
            const esNro = /^\d+$/.test(q);
            const baseParams = esNro
              ? { q, soloCaseId: 1, limit: 5, page: 1 }
              : { q, limit: 10, page: 1 };
            const intentos = [
              baseParams,
              { ...baseParams, eliminados: 1 },
              { ...baseParams, sinTenant: 1 },
              { ...baseParams, eliminados: 1, sinTenant: 1 },
            ];
            for (const params of intentos) {
              // eslint-disable-next-line no-await-in-loop
              const { data } = await axios.get('http://localhost:5001/api/markers/admin', {
                headers,
                params,
              });
              casoAdmin = pick(data.items);
              if (casoAdmin) break;
            }
          } catch (error) {
            console.error('Error buscando caso admin del aviso:', error);
          }

          const cerrado = casoAdmin ? casoEstaCerrado(casoAdmin) : (
            notifApuntaAlRegistro(aviso) || aviso.tipo === 'resuelto' || aviso.tipo === 'rechazado'
          );
          const sinJurisdiccion = casoAdmin
            ? !casoAdmin.tenant && !casoAdmin.jurisdictionName
            : false;
          const baseFoco = {
            casoId: (casoAdmin?._id || aviso.markerId)
              ? String(casoAdmin?._id || aviso.markerId?._id || aviso.markerId)
              : null,
            caseNumber: (casoAdmin?.caseId ?? aviso.caseId) != null
              ? Number(casoAdmin?.caseId ?? aviso.caseId)
              : null,
            tenantId: '',
            sinTenant: sinJurisdiccion,
          };

          if (cerrado) {
            onAbrirCasoAdmin({
              ...baseFoco,
              seccion: 'registro',
              registroTipo: '',
              registroCategoria: '',
              registroPeriodo: '',
            });
            return;
          }

          if (aviso.tipo === 'respuesta_datos') {
            const seccion = String(aviso.mensaje || '').toLowerCase().includes('perdid')
              || casoAdmin?.category === 'cosas_perdidas'
              ? 'cosas_perdidas'
              : 'reportes';
            onAbrirCasoAdmin({
              ...baseFoco,
              seccion,
              atencion: 'respuestas',
            });
            return;
          }

          if (TIPOS_NOTIF_PANEL_ADMIN.has(aviso.tipo)) {
            let seccion = aviso.tipo === 'por_aprobar'
              ? 'por_aprobar'
              : (aviso.tipo === 'nueva_perdida' || casoAdmin?.category === 'cosas_perdidas'
                ? 'cosas_perdidas'
                : 'reportes');
            if (casoAdmin?.status === 'pendiente_aprobacion') seccion = 'por_aprobar';
            if (sinJurisdiccion) seccion = 'reportes';
            if (casoAdmin?.status === 'pendiente_cierre') {
              onAbrirCasoAdmin({
                ...baseFoco,
                seccion: 'reportes',
                atencion: 'cierres',
              });
              return;
            }
            const estado = casoAdmin?.status === 'en_proceso' ? 'en_proceso' : 'pendiente';
            onAbrirCasoAdmin({
              ...baseFoco,
              seccion,
              ...(seccion === 'por_aprobar' ? {} : { estado }),
            });
            return;
          }

          onAbrirCasoAdmin({
            ...baseFoco,
            seccion: 'registro',
            registroTipo: '',
            registroCategoria: '',
            registroPeriodo: '',
          });
          return;
        }
      }
    }

    const marker = markers.find((item) => coincideAvisoCaso(aviso, item));

    // Aprobado / cambio de estado / oficina avisada → ficha en mapa o Registro si ya cerró
    if (
      aviso?.tipo === 'aprobado'
      || aviso?.tipo === 'avisado'
      || aviso?.tipo === 'estado'
    ) {
      setMostrarNotificaciones(false);
      const caso = await obtenerCasoDesdeAvisoVecino(aviso, marker);
      if (!caso) {
        mostrarAviso('No se pudo abrir ese caso. Puede que ya no esté disponible.', true);
        return;
      }
      asegurarCasoEnMapa(caso);
      if (casoEstaCerrado(caso)) {
        setMisReportesSeccion('registro');
        setMostrarMisReportes(true);
        await cargarMisLista('registro', 1);
        setMisReportesRegistro((prev) => (
          prev.some((m) => String(m._id) === String(caso._id))
            ? prev
            : [caso, ...prev]
        ));
        setIdRegistroDestacado(String(caso._id));
        irAMiReporte(caso);
        window.setTimeout(() => {
          const nodo = document.querySelector(`[data-registro-id="${String(caso._id)}"]`);
          if (nodo) nodo.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 180);
        window.setTimeout(() => setIdRegistroDestacado(null), 8000);
        return;
      }
      setMostrarMisReportes(false);
      irAMiReporte(caso);
      return;
    }

    // Reclamo / chat → Míos + abrir ficha/chat. Cerca → mapa en el pin.
    if (aviso?.tipo === 'reclamo' || aviso?.tipo === 'chat' || aviso?.tipo === 'cerca') {
      setMostrarNotificaciones(false);
      setMostrarMisReportes(false);
      setMostrarFiltros(false);
      if (aviso.tipo === 'cerca') {
        setMostrarCosasPerdidas(true);
        setPerdidasSeccion('cerca');
        await cargarPerdidasLista('cerca', 1);
        if (aviso.markerId) await marcarPerdidasLeidas(aviso.markerId);
        if (marker) {
          irAMiReporte(marker);
          return;
        }
        const idDestacado = aviso.markerId ? String(aviso.markerId) : null;
        setIdPerdidaDestacada(idDestacado);
        if (idDestacado) {
          window.setTimeout(() => {
            const nodo = document.querySelector(`[data-perdida-id="${idDestacado}"]`);
            if (nodo) nodo.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }, 180);
          window.setTimeout(() => setIdPerdidaDestacada(null), 8000);
        }
        return;
      }
      setMostrarCosasPerdidas(true);
      setPerdidasSeccion('activos');
      await cargarPerdidasLista('activos', 1);
      if (marker) {
        await irAPerdida(marker, { abrirChat: true });
        return;
      }
      if (aviso.markerId) await marcarPerdidasLeidas(aviso.markerId);
      const idDestacado = aviso.markerId ? String(aviso.markerId) : null;
      setIdPerdidaDestacada(idDestacado);
      if (idDestacado) {
        window.setTimeout(() => {
          const nodo = document.querySelector(`[data-perdida-id="${idDestacado}"]`);
          if (nodo) nodo.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 180);
        window.setTimeout(() => setIdPerdidaDestacada(null), 8000);
      }
      return;
    }

    // Pedido de datos: abrir la ficha con el pedido fresco (aunque no esté en el mapa cargado)
    if (aviso?.tipo === 'pedir_datos' && (aviso.markerId || aviso.caseId)) {
      setMostrarNotificaciones(false);
      let caso = marker;
      if (!caso?.pideDatosMensaje) {
        try {
          const params = { mine: '1', limit: 50, page: 1 };
          if (aviso.caseId) params.q = String(aviso.caseId);
          const { data } = await axios.get('http://localhost:5001/api/markers', {
            headers: { 'x-user-id': userId },
            params,
          });
          const lista = (data.items || data || []).map((item) => ({
            ...item,
            isSaved: true,
            category: normalizeCategoryValue(item.category),
            createdBy: item.createdBy
              ? String(item.createdBy).trim().toLowerCase()
              : 'anonimo',
            pideDatosAt: item.pideDatosAt || null,
            pideDatosMensaje: item.pideDatosMensaje || '',
          }));
          const coincide = (item) => (
            (aviso.markerId && String(item._id) === String(aviso.markerId))
            || (aviso.caseId && Number(item.caseId) === Number(aviso.caseId))
          );
          caso = lista.find(coincide) || caso;
          if (caso) {
            setMarkers((prev) => (
              prev.some((m) => String(m._id) === String(caso._id))
                ? prev.map((m) => (String(m._id) === String(caso._id) ? { ...m, ...caso } : m))
                : [...prev, caso]
            ));
          }
        } catch (error) {
          console.error('Error cargando caso del pedido de datos:', error);
        }
      }
      if (caso) {
        irAMiReporte(caso);
        return;
      }
    }

    // Casos resueltos / anulados: ir al Registro y sombrear el caso (sin abrir ficha)
    if (notifApuntaAlRegistro(aviso) || !marker) {
      setMostrarNotificaciones(false);
      setMisReportesSeccion('registro');
      setMostrarMisReportes(true);
      await cargarMisLista('registro', 1);
      const delRegistro = await abrirCasoDesdeRegistro(aviso);
      const idDestacado = delRegistro?._id || aviso.markerId || null;
      setIdRegistroDestacado(idDestacado ? String(idDestacado) : null);
      if (idDestacado) {
        window.setTimeout(() => {
          const nodo = document.querySelector(`[data-registro-id="${String(idDestacado)}"]`);
          if (nodo) nodo.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 180);
        window.setTimeout(() => setIdRegistroDestacado(null), 8000);
      }
      return;
    }

    irAMiReporte(marker);
  }, [
    userId,
    markers,
    irAMiReporte,
    irAPerdida,
    onNoLeidasChange,
    onPerdidasNoLeidasChange,
    onAbrirCasoAdmin,
    abrirCasoDesdeRegistro,
    cargarMisLista,
    cargarPerdidasLista,
    marcarPerdidasLeidas,
    normalizeCategoryValue,
    coincideAvisoCaso,
    obtenerCasoDesdeAvisoVecino,
    asegurarCasoEnMapa,
  ]);

  const marcarTodasLeidas = async () => {
    try {
      await axios.patch(
        'http://localhost:5001/api/notificaciones/leer-todas',
        {},
        { headers: { 'x-user-id': userId } }
      );
      setNotificaciones((prev) => prev.map((item) => ({ ...item, leida: true })));
      setNoLeidasLocal(0);
      setPerdidasNoLeidasLocal(0);
      if (onNoLeidasChange) onNoLeidasChange(0);
      if (onPerdidasNoLeidasChange) onPerdidasNoLeidasChange(0);
    } catch (error) {
      console.error('Error marcando avisos:', error);
    }
  };

  const handleApproveMarker = async (markerId) => {
    try {
      const response = await axios.patch(
        `http://localhost:5001/api/markers/admin/${markerId}/approve`,
        {},
        {
          headers: {
            'Content-Type': 'application/json',
            'x-user-id': userId,
          },
        }
      );
      setMarkers((prevMarkers) =>
        prevMarkers.map((marker) =>
          marker._id === markerId
            ? {
                ...marker,
                status: response.data.status,
                resolvedAt: response.data.resolvedAt || null,
              }
            : marker
        )
      );
      if (editMode === markerId) {
        setFormData((prev) => ({
          ...prev,
          status: response.data.status,
          resolvedAt: response.data.resolvedAt || null,
        }));
      }
    } catch (error) {
      console.error('Error approving marker:', error);
    }
  };

  const handleAdminStatusChange = async (markerId, newStatus) => {
    try {
      const response = await axios.patch(
        `http://localhost:5001/api/markers/admin/${markerId}/status`,
        { status: newStatus },
        {
          headers: {
            'Content-Type': 'application/json',
            'x-user-id': userId,
          },
        }
      );
      setMarkers((prevMarkers) =>
        prevMarkers.map((marker) =>
          marker._id === markerId
            ? {
                ...marker,
                status: response.data.status,
                resolvedAt: response.data.resolvedAt || null,
              }
            : marker
        )
      );
      if (editMode === markerId) {
        setFormData((prev) => ({
          ...prev,
          status: response.data.status,
          resolvedAt: response.data.resolvedAt || null,
        }));
      }
      return true;
    } catch (error) {
      console.error('Error actualizando estado del marcador:', error);
      return false;
    }
  };

  const elegirEstado = (markerId, estadoActual, nuevoEstado) => {
    setEstadosPendientes((prev) => {
      const next = { ...prev };
      if (nuevoEstado === estadoActual) {
        delete next[markerId];
      } else {
        next[markerId] = nuevoEstado;
      }
      return next;
    });
  };

  const guardarEstado = async (markerId) => {
    const nuevoEstado = estadosPendientes[markerId];
    if (!nuevoEstado || guardandoEstado) return;
    setGuardandoEstado(markerId);
    const guardado = await handleAdminStatusChange(markerId, nuevoEstado);
    if (guardado) {
      setEstadosPendientes((prev) => {
        const next = { ...prev };
        delete next[markerId];
        return next;
      });
      const etiqueta = statusLabels[nuevoEstado] || nuevoEstado;
      const caso = markers.find((item) => item._id === markerId);
      const nro = caso?.caseId ? `#${caso.caseId}` : '';
      mostrarAviso(
        nro
          ? `Estado del caso ${nro} guardado: ${etiqueta}.`
          : `Estado guardado: ${etiqueta}.`
      );
    } else {
      mostrarAviso('No se pudo guardar el estado. Intentá de nuevo.', true);
    }
    setGuardandoEstado(null);
  };

  const marcarAvisado = async (markerId) => {
    if (avisando) return;
    setAvisando(markerId);
    try {
      const response = await axios.patch(
        `http://localhost:5001/api/markers/admin/${markerId}/avisar`,
        {},
        { headers: { 'Content-Type': 'application/json', 'x-user-id': userId } }
      );
      setMarkers((prev) => prev.map((marker) => (
        marker._id === markerId ? { ...marker, avisadoAt: response.data.avisadoAt } : marker
      )));
    } catch (error) {
      mostrarAviso('No se pudo marcar que ya avisaste. Intentá de nuevo.', true);
    } finally {
      setAvisando(null);
    }
  };

const renderOficinas = (tipo, jurisdiccion) => {
  const oficinas = tipo === 'abandonado' ? [OFICINA_ANIMALES] : oficinasDelCaso(tipo, jurisdiccion);
  return oficinas.map((oficina) => (
    <div className="caso-admin-oficina" key={oficina.titulo}>
      <strong>{oficina.titulo}</strong>
      {oficina.detalle && <span>{oficina.detalle}</span>}
      <a className="caso-admin-llamar" href={oficina.llamar.href}>{oficina.llamar.texto}</a>
      {oficina.nota && <span>{oficina.nota}</span>}
      {oficina.extras.length > 0 && (
        <div className="caso-admin-extras">
          {oficina.extras.map((extra) => (
            <a key={extra.href} href={extra.href}>{extra.texto}</a>
          ))}
        </div>
      )}
    </div>
  ));
};

  const renderFamiliasTipo = () => {
    if (formData.category !== 'familias') return null;
    return (
      <>
        <label>De qué se trata</label>
        <select
          value={formData.familiasTipo || ''}
          onChange={(event) => setFormData((prev) => ({ ...prev, familiasTipo: event.target.value }))}
          required
        >
          <option value="">Elegí una opción</option>
          <option value="violencia">Violencia en la casa</option>
          <option value="hijos">Hijos descuidados o lastimados</option>
          <option value="calle">Persona en situación de calle</option>
        </select>
        {!formData.avisadoAt && (
          <small className="familias-nota">
            Este aviso es anónimo: tu nombre no se muestra en el mapa. El administrador contacta a la oficina que corresponda, sin publicar tus datos.
          </small>
        )}
      </>
    );
  };

  const renderAnimalTipo = () => {
    if (formData.category !== 'perros_gatos') return null;
    return (
      <>
        <div className="popup-campo">
          <label>De qué se trata</label>
          <select
            value={formData.animalTipo || ''}
            onChange={(event) => setFormData((prev) => ({ ...prev, animalTipo: event.target.value }))}
            required
          >
            <option value="">Elegí una opción</option>
            <option value="abandonado">Abandonado en la calle</option>
            <option value="perdido">Perdido</option>
            <option value="adopcion">En adopción</option>
          </select>
          {formData.animalTipo === 'abandonado' && !formData.avisadoAt && (
            <small className="familias-nota">
              Si corresponde, el administrador puede avisar al área de animales.
            </small>
          )}
        </div>
        <div className="popup-campo">
          <label>Celular de contacto (WhatsApp)</label>
          <input
            type="tel"
            inputMode="numeric"
            value={formData.contacto || ''}
            onChange={(event) => setFormData((prev) => ({ ...prev, contacto: event.target.value }))}
            placeholder="Ej.: 3815551234"
            required
          />
          <small className="popup-nota popup-nota-suave">
            Obligatorio. Otros vecinos van a poder escribirte por WhatsApp.
          </small>
        </div>
      </>
    );
  };

  const renderBotonWhatsApp = () => {
    if (formData.category !== 'perros_gatos' || !contactoValido(formData.contacto)) return null;
    const dueno = formData.createdBy ? String(formData.createdBy).trim().toLowerCase() : '';
    // El dueño no se contacta a sí mismo; solo otros vecinos (o admin en el mapa)
    if (!dueno || dueno === userId) return null;
    const tipo = ANIMAL_TIPOS[formData.animalTipo] || 'animal';
    const caso = formData.caseId ? ` #${formData.caseId}` : '';
    const url = whatsappUrl(
      formData.contacto,
      `Hola, vi tu aviso de ${tipo}${caso} en CiudadAr y quiero ayudarte.`
    );
    if (!url) return null;
    const digitos = digitosContacto(formData.contacto);
    const telefonoVisible = digitos.length >= 4
      ? `···${digitos.slice(-4)}`
      : '';
    return (
      <div className="btn-whatsapp-wrap">
        <a
          className="btn-whatsapp"
          href={url}
          target="_blank"
          rel="noopener noreferrer"
        >
          WhatsApp a quien publicó el aviso
        </a>
        <small className="btn-whatsapp-nota">
          Escribís al vecino que cargó este aviso
          {telefonoVisible ? ` (${telefonoVisible})` : ''}
          {caso ? ` · caso${caso}` : ''}.
        </small>
      </div>
    );
  };

  const renderPerdidaTipo = () => {
    if (formData.category !== 'cosas_perdidas') return null;
    return (
      <div className="popup-campo">
        <label>Tipo de aviso</label>
        <div className="perdida-tipo-opciones">
          <button
            type="button"
            className={`perdida-tipo-btn perdi${formData.perdidaTipo === 'perdi' ? ' activo' : ''}`}
            onClick={() => setFormData((prev) => ({ ...prev, perdidaTipo: 'perdi' }))}
          >
            <span className="perdida-tipo-icono" aria-hidden="true">
              <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.8"/><circle cx="9" cy="10" r="1.1" fill="currentColor"/><circle cx="15" cy="10" r="1.1" fill="currentColor"/><path d="M8.5 15.5c1.2-1.4 5.8-1.4 7 0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
            </span>
            <span>Perdí algo</span>
            <span className="perdida-tipo-check" aria-hidden="true">✓</span>
          </button>
          <button
            type="button"
            className={`perdida-tipo-btn encontre${formData.perdidaTipo === 'encontre' ? ' activo' : ''}`}
            onClick={() => setFormData((prev) => ({ ...prev, perdidaTipo: 'encontre' }))}
          >
            <span className="perdida-tipo-icono" aria-hidden="true">
              <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.8"/><circle cx="9" cy="10" r="1.1" fill="currentColor"/><circle cx="15" cy="10" r="1.1" fill="currentColor"/><path d="M8.5 14.5c1.2 1.5 5.8 1.5 7 0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
            </span>
            <span>Encontré algo</span>
            <span className="perdida-tipo-check" aria-hidden="true">✓</span>
          </button>
        </div>
      </div>
    );
  };

  const handleReclamar = async () => {
    if (!editMode || reclamando) return;
    setReclamando(true);
    try {
      const { data } = await axios.post(
        `http://localhost:5001/api/markers/${editMode}/reclamar`,
        {},
        { headers: { 'x-user-id': userId } }
      );
      setMarkers((prev) => prev.map((m) => (m._id === editMode ? { ...m, ...data } : m)));
      setFormData((prev) => ({
        ...prev,
        claimedByMe: true,
        canChat: true,
        claimCount: data.claimCount || prev.claimCount,
      }));
      setMostrarChatReclamo(true);
      mostrarAviso('Ya podés chatear con quien publicó el aviso.');
    } catch (error) {
      mostrarAviso(error.response?.data?.message || 'No se pudo iniciar el reclamo.', true);
    } finally {
      setReclamando(false);
    }
  };

  const soyQuienPerdioObjeto = () => {
    const esDueno = formData.createdBy && String(formData.createdBy).toLowerCase() === userId;
    // "Perdí" → dueño del aviso; "Encontré" → quien reclamó (dueño del objeto)
    return formData.perdidaTipo === 'perdi' ? esDueno : !!formData.claimedByMe;
  };

  const pedirConfirmarRecupero = () => {
    if (!editMode || formData.category !== 'cosas_perdidas') return;
    if (!soyQuienPerdioObjeto() || confirmandoRecupero) return;
    setConfirmarRecupero(true);
  };

  const handleResolverPerdida = async () => {
    if (!editMode || formData.category !== 'cosas_perdidas') return;
    if (!soyQuienPerdioObjeto() || confirmandoRecupero) return;
    setConfirmandoRecupero(true);
    try {
      const { data } = await axios.patch(
        `http://localhost:5001/api/markers/${editMode}/resolver-perdida`,
        { accion: 'recupere' },
        { headers: { 'x-user-id': userId } }
      );
      setMarkers((prev) => prev.map((m) => (m._id === editMode ? { ...m, ...data } : m)));
      setFormData((prev) => ({
        ...prev,
        status: data.status || prev.status,
        resolvedAt: data.resolvedAt || prev.resolvedAt,
        resolvedBy: data.resolvedBy || prev.resolvedBy,
        resolvedByReportedAt: data.resolvedByReportedAt || prev.resolvedByReportedAt,
        eliminadoAt: data.eliminadoAt || prev.eliminadoAt,
        chatAbiertoPorMi: !!data.chatAbiertoPorMi || prev.chatAbiertoPorMi,
        confirmacionPerdidaMia: data.confirmacionPerdidaMia || { accion: 'recupere' },
        perdidaEsperaOtraParte: false,
      }));
      setConfirmarRecupero(false);
      mostrarAviso('Caso cerrado: confirmaste que recuperaste el objeto. Pasó al registro.');
    } catch (error) {
      mostrarAviso(error.response?.data?.message || 'No se pudo confirmar.', true);
    } finally {
      setConfirmandoRecupero(false);
    }
  };

  const renderAccionesCosasPerdidas = () => {
    if (formData.category !== 'cosas_perdidas' || !editMode) return null;
    const esDueno = Boolean(
      userId
      && userId !== 'anonimo'
      && formData.createdBy
      && String(formData.createdBy).trim().toLowerCase() === String(userId).trim().toLowerCase()
    );
    const publicado = formData.status === 'pendiente' || formData.status === 'en_proceso';
    if (!publicado && formData.status !== 'resuelto') return null;
    // Chat solo si hay reclamo real (o sos quien reclamó). Admin no abre chat “de vecino” acá.
    const puedeAbrirChat = formData.claimedByMe
      || (esDueno && formData.claimCount > 0);
    const soyParte = esDueno || formData.claimedByMe;
    const abrioChat = !!formData.chatAbiertoPorMi;
    const quienPerdio = soyQuienPerdioObjeto();
    const puedeResolver = publicado && quienPerdio && abrioChat
      && formData.status !== 'resuelto'
      && !formData.eliminadoAt;

    // Si el aviso es "Perdí", el otro vecino encontró; si es "Encontré", el otro cree que es suyo
    const textoReclamar = formData.perdidaTipo === 'perdi'
      ? 'Creo que lo encontré'
      : 'Creo que es mío';
    const textoEsperaDueno = formData.perdidaTipo === 'perdi'
      ? 'Cuando alguien diga que lo encontró, van a poder chatear. Si nadie responde, el aviso vence a los 15 días desde la aprobación.'
      : 'Cuando el dueño diga “Creo que es mío”, van a poder chatear. Si nadie reclama, el aviso vence a los 15 días desde la aprobación.';

    return (
      <div className="perdida-acciones">
        {!esDueno && !formData.claimedByMe && publicado && (
          <button
            type="button"
            className="perdida-btn-reclamar"
            onClick={handleReclamar}
            disabled={reclamando}
          >
            {textoReclamar}
          </button>
        )}
        {esDueno && !formData.claimCount && (
          <p className="perdida-espera">
            {textoEsperaDueno}
          </p>
        )}
        {puedeAbrirChat && (
          <button
            type="button"
            className="perdida-btn-chat"
            onClick={() => setMostrarChatReclamo(true)}
          >
            {formData.status === 'resuelto' ? 'Ver historial del chat' : 'Abrir chat del reclamo'}
          </button>
        )}
        {publicado && soyParte && !abrioChat && (
          <p className="perdida-espera">
            Primero abrí el chat para coordinar.
            {quienPerdio
              ? ' Cuando recuperes el objeto, marcá “Ya lo recuperé”.'
              : ' Cuando quien lo había perdido confirme que lo recuperó, el caso se cierra.'}
          </p>
        )}
        {puedeResolver && (
          <div className="perdida-cierre">
            <p className="perdida-cierre-titulo">¿Ya lo recuperaste?</p>
            <p className="perdida-espera">
              Si el objeto ya volvió con vos, confirmá acá y el caso se cierra.
            </p>
            <button
              type="button"
              className="perdida-btn-resolver"
              onClick={pedirConfirmarRecupero}
            >
              Ya lo recuperé
            </button>
          </div>
        )}
        {publicado && soyParte && !quienPerdio && abrioChat && formData.status !== 'resuelto' && (
          <p className="perdida-espera">
            Cuando quien había perdido el objeto marque “Ya lo recuperé”, el caso se cierra.
          </p>
        )}
        {(formData.status === 'resuelto' || formData.eliminadoAt) && (
          <p className="perdida-espera">
            Caso cerrado. Ya no está en el mapa.
          </p>
        )}
      </div>
    );
  };

  // Función para manejar la cancelación del formulario
  const handleCancel = () => {
    // Si había un aviso abierto: al cerrar sigue brillante y sin puntero hasta mover el mapa
    const idBrillo = (modoSoloCaso && focoCasoMapa?._id)
      ? focoCasoMapa._id
      : (editMode || highlightedMarkerId);
    setFormData({
      lat: 0,
      lng: 0,
      image: null,
      date: '',
      time: '',
      description: '',
      direccion: '',
      status: 'pendiente_aprobacion',
      category: 'reparaciones',
      familiasTipo: '',
      animalTipo: '',
      perdidaTipo: '',
      objeto: '',
      contacto: '',
      resolvedAt: null,
    });
    setSelectedImage(null);
    setResolutionPhoto(null);
    setResolutionPreview(null);
    setMostrarResolucion(false);
    setMostrarChatReclamo(false);
    setMostrarCercanos(false);
    setCasosCercanos([]);
    setIsImageZoomed(false);
    setShowPopup(false);
    setShowDeleteOnly(false);
    setRecienPublicado(false);
    setMostrarOpcionesFoto(false);
    if (idBrillo) {
      setHighlightedMarkerId(idBrillo);
      setOcultarPunteroMapa(true);
      setEditMode(modoSoloCaso ? idBrillo : null);
    } else {
      setEditMode(null);
    }
  };

  const handleImageClick = () => {
    // Alternar entre tamaño normal y ampliado al hacer clic en la imagen
    setIsImageZoomed((prev) => !prev);
  };

  const handleViewOnMap = () => {
    const lat = Number(formData.lat);
    const lng = Number(formData.lng);
    if (!mapRef.current || !Number.isFinite(lat) || !Number.isFinite(lng)) return;
    const target = { lat, lng };
    if (editMode) {
      setHighlightedMarkerId(editMode);
      setOcultarPunteroMapa(true);
    }
    omitirRestaurarPunteroRef.current = true;
    omitirIdleRef.current = true;
    mapRef.current.panTo(target);
    mapRef.current.setZoom(18);
    window.setTimeout(() => {
      omitirRestaurarPunteroRef.current = false;
      omitirIdleRef.current = false;
    }, 700);
    setIsImageZoomed(false);
    setShowPopup(false);
    setMostrarMisReportes(false);
    setMostrarCosasPerdidas(false);
    setMostrarNotificaciones(false);
    setMostrarFiltros(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Deshabilitar gestos del mapa cuando la imagen está en zoom para evitar que el mapa se agrande
  useEffect(() => {
    if (!mapRef.current) return;

    if (showPopup) {
      mapRef.current.setOptions({
        gestureHandling: 'none',
        zoomControl: false,
      });
    } else {
      mapRef.current.setOptions({
        gestureHandling: 'greedy',
        zoomControl: false,
      });
    }
  }, [showPopup]);

  const renderMap = () => {
    
    // Verificar si el usuario tiene marcadores de "familias"
    const hasFamiliesMarkers = markers.some(marker => {
      if (esCasoFamilia(marker.category)) {
        const markerOwner = marker.createdBy
          ? String(marker.createdBy).trim().toLowerCase()
          : 'anonimo';
        return markerOwner === userId;
      }
      return false;
    });
    
    // Filtrar opciones de categoría: "familias" solo si el usuario tiene marcadores de esa categoría o es admin
    const availableCategoryOptions = categoryOptions.filter(option => {
      if (option.value === 'familias') {
        return isAdmin || hasFamiliesMarkers;
      }
      return true;
    });
    
    // Los filtros ya se aplican en el servidor; acá solo se muestran los ítems recibidos
    // Refuerzo: "Mi jurisdicción" = solo casos que este admin puede gestionar
    const visibleMarkersBase = modoSoloCaso && focoCasoMapa?._id
      ? markers.filter((m) => String(m._id) === String(focoCasoMapa._id))
      : (soloMiJurisdiccion
        ? markers.filter((m) => m.canManage)
        : markers);
    // Radar: Míos = tu lista. Cerca = pines del mapa general + búsqueda (si no, solo aparecen al “barrer” con el radio)
    const visibleMarkers = (() => {
      if (!mostrarCosasPerdidas || modoSoloCaso) return visibleMarkersBase;
      const catRadar = radarModo === 'animales' ? 'perros_gatos' : 'cosas_perdidas';
      const yo = String(userId || '').trim().toLowerCase();
      const sirve = (m) => {
        if (m.category !== catRadar) return false;
        if (!Number.isFinite(Number(m.lat)) || !Number.isFinite(Number(m.lng))) return false;
        if (radarModo === 'animales' && animalFiltroRadar && animalFiltroRadar !== 'todos'
          && m.animalTipo !== animalFiltroRadar) {
          return false;
        }
        if (perdidasSeccion === 'cerca' && yo && yo !== 'anonimo') {
          const dueno = String(m.createdBy || '').trim().toLowerCase();
          if (dueno === yo) return false;
        }
        return true;
      };
      if (perdidasSeccion === 'activos') {
        return perdidasLista.filter(sirve);
      }
      // Cerca: no reemplazar el mapa por la búsqueda; unir mapa cargado + resultados del radio
      // (si solo usamos el radio, los pines fuera del círculo desaparecen hasta “barrer”)
      const punto = puntoCercaActivo(cercaOrigen);
      const radio = Number(cercaRadioMetros) || 2500;
      const dentroDelCirculo = (m) => {
        if (!punto || !Number.isFinite(punto.lat) || !Number.isFinite(punto.lng)) return true;
        return distanciaMetros(punto.lat, punto.lng, Number(m.lat), Number(m.lng)) <= radio;
      };
      const byId = new Map();
      visibleMarkersBase.filter(sirve).forEach((m) => byId.set(String(m._id), m));
      // Resultados del radio: solo los que siguen dentro (al achicar no quedan pegados afuera)
      pinesCercaMapa.filter((m) => sirve(m) && dentroDelCirculo(m)).forEach((m) => {
        byId.set(String(m._id), m);
      });
      perdidasLista.filter((m) => sirve(m) && dentroDelCirculo(m)).forEach((m) => {
        byId.set(String(m._id), m);
      });
      return Array.from(byId.values());
    })();
    const misReportes = misReportesSeccion === 'registro'
      ? misReportesRegistro
      : misReportesActivos;
    const misTotalPaginas = Math.max(1, Math.ceil((misMeta.total || 0) / (misMeta.limit || MIS_PAGE_SIZE)));
    const textoBusqueda = busquedaAdmin.trim().toLowerCase().replace(/^#/, '');
    const casosPorAprobar = markers.filter(
      (marker) => marker.canManage
        && !esCasoFamilia(marker.category)
        && marker.status === 'pendiente_aprobacion'
    ).length;
    const casoEsUrgente = (marker) => (
      marker.canManage
      && marker.category === 'reparaciones'
      && (marker.status === 'pendiente' || marker.status === 'en_proceso')
      && (marker.neighborCount || 1) >= 2
    );
    const casosUrgentes = markers.filter(casoEsUrgente).length;
    const casoResueltoPorVecino = (marker) => (
      marker.canManage
      && !!marker.resolvedBy
      && marker.status !== 'resuelto'
    );
    const casosResueltosVecino = markers.filter(casoResueltoPorVecino).length;
    const casosAdmin = markers.filter((marker) => {
      if (!marker.canManage) return false;
      if (soloPorAprobar && (esCasoFamilia(marker.category) || marker.status !== 'pendiente_aprobacion')) return false;
      if (soloUrgentes && !casoEsUrgente(marker)) return false;
      if (soloResueltosVecino && !casoResueltoPorVecino(marker)) return false;
      if (filtroCategoriaAdmin !== 'todas') {
        const categoria = esCasoFamilia(marker.category) ? 'familias' : marker.category;
        if (categoria !== filtroCategoriaAdmin) return false;
      }
      if (filtroEstadoAdmin !== 'todos' && (marker.status || 'pendiente') !== filtroEstadoAdmin) return false;
      if (!textoBusqueda) return true;
      return String(marker.caseId || '').toLowerCase().includes(textoBusqueda);
    }).sort((a, b) => Number(casoEsUrgente(b)) - Number(casoEsUrgente(a)));
    const currentStatus = formData.status || 'pendiente';
    const statusBadgeStyle = getStatusBadgeStyle(currentStatus);
    const statusLabel = etiquetaEstadoPopup(currentStatus, formData);
    const renderStatusInfo = (withLabel = true) => {
      if (esCasoFamilia(formData.category) && !isAdmin) {
        if (!editMode) return null;
        const avisado = formData.avisadoAt
          ? new Date(formData.avisadoAt).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })
          : null;
        const enRevision = currentStatus === 'pendiente_aprobacion';
        let textoFamilia = 'Tu aviso fue aceptado. No se publica para otros vecinos: el administrador lo gestiona con la oficina. Cuando avise, vas a ver la confirmación acá.';
        if (avisado) {
          textoFamilia = 'El administrador ya contactó a la oficina correspondiente. Este aviso quedó registrado y es anónimo: tu nombre no se muestra en el mapa.';
        } else if (enRevision) {
          textoFamilia = 'Tu aviso está en revisión. No se publica en el mapa de vecinos; solo lo ve el administrador.';
        }
        return (
          <div className={`familias-aviso-vecino${avisado ? ' listo' : ''}`}>
            <p>{textoFamilia}</p>
            {avisado && <small>{avisado}</small>}
          </div>
        );
      }
      // Vencimiento: solo tras aprobación (pendiente / en proceso), 15 días desde aprobadoAt
      const casoPublicadoAbierto = !formData.eliminadoAt
        && (currentStatus === 'pendiente' || currentStatus === 'en_proceso');
      const avisoConVencimiento = (
        formData.category === 'perros_gatos' || formData.category === 'cosas_perdidas'
      ) && casoPublicadoAbierto;
      const fechaVencimiento = formData.aprobadoAt || formData.createdAt;
      const daysLeft = avisoConVencimiento
        ? getDaysUntilAvisoExpiry(fechaVencimiento)
        : null;
      // Solo después de subir: en el formulario nuevo todavía no hay reporte.
      if (!editMode) return null;
      const isPendingApproval = currentStatus === 'pendiente_aprobacion';
      return (
        <div className="popup-estado-bloque">
          {withLabel && <label>Estado</label>}
          <div className="popup-estado-contenido">
            <div className="popup-estado-fila">
              <span style={statusBadgeStyle}>{statusLabel}</span>
              {daysLeft !== null && (
                <small className="popup-estado-extra">
                  {`Si sigue abierto, se elimina en ${daysLeft} ${daysLeft === 1 ? 'día' : 'días'} (desde la aprobación).`}
                </small>
              )}
            </div>
            {isPendingApproval && !esCasoFamilia(formData.category) && (
              <div className="popup-aviso-pendiente">
                Tu aviso está por aprobar. Un administrador lo va a revisar y, cuando lo apruebe, va a aparecer en el mapa.
              </div>
            )}
            {currentStatus === 'pendiente_cierre' && editMode && (
              <div className="popup-aviso-pendiente">
                La cuadrilla marcó el trabajo como hecho. El municipio está confirmando para cerrar el caso.
              </div>
            )}
            {(currentStatus === 'rechazado' || (formData.eliminadoAt && String(formData.motivoEliminacion || '').toLowerCase().includes('anulado')))
              && !isAdmin && editMode && (
              <div className="popup-aviso-pendiente popup-aviso-anulado">
                {(() => {
                  const motivo = String(formData.motivoEliminacion || '')
                    .replace(/^Anulado:\s*/i, '')
                    .trim();
                  return motivo
                    ? `Este caso fue anulado. Motivo: ${motivo}`
                    : 'Este caso fue anulado por el administrador.';
                })()}
              </div>
            )}
            {formData.category === 'perros_gatos' && formData.animalTipo === 'abandonado' && !isAdmin && editMode && (
              <small className={formData.avisadoAt ? 'familias-aviso-vecino listo' : 'familias-nota'}>
                {formData.avisadoAt
                  ? `El municipio ya avisó al área de animales. El aviso sigue visible en el mapa. ${new Date(formData.avisadoAt).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}`
                  : 'Cuando el administrador avise al área de animales, lo vas a ver acá.'}
              </small>
            )}
            {formData.category === 'reparaciones' && formData.neighborCount > 1 && (
              <small className="aviso-vecinos-caso">
                Lo reportaron {formData.neighborCount} vecinos
              </small>
            )}
          </div>
        </div>
      );
    };
    const handleResolutionPhoto = (event) => {
      const file = event.target.files && event.target.files[0];
      event.target.value = '';
      if (!file) return;
      abrirEditorDesdeArchivo(file, 'resolucion');
    };
    const cerrarVentanaResolucion = () => {
      setMostrarResolucion(false);
      setEditandoResolucion(false);
      setResolutionPhoto(null);
      setResolutionPreview(null);
      setResolutionDescription('');
    };
    const abrirNuevaResolucion = () => {
      setEditandoResolucion(false);
      setResolutionPhoto(null);
      setResolutionPreview(null);
      setResolutionDescription('');
      setMostrarResolucion(true);
    };
    const abrirEditarResolucion = () => {
      setEditandoResolucion(true);
      setResolutionPhoto(null);
      setResolutionPreview(formData.resolutionImageUrl ? buildImageUrl(formData.resolutionImageUrl) : null);
      setResolutionDescription(formData.resolutionDescription || '');
      setMostrarResolucion(true);
    };
    const handleReportResolved = async (markerId) => {
      const descripcion = resolutionDescription.trim();
      if (!descripcion) {
        mostrarAviso('Contá qué hiciste para resolver el caso.', true);
        return;
      }
      if (!editandoResolucion && !resolutionPhoto) {
        mostrarAviso('Tenés que adjuntar una foto de cómo quedó.', true);
        return;
      }
      const body = new FormData();
      body.append('description', descripcion);
      if (resolutionPhoto) body.append('image', resolutionPhoto);
      try {
        const response = await axios.post(
          `http://localhost:5001/api/markers/${markerId}/report-resolved`,
          body,
          {
            headers: {
              'x-user-id': userId,
            },
          }
        );
        const imagenResolucion = response.data.resolutionImageUrl
          ? `${response.data.resolutionImageUrl}${response.data.resolutionImageUrl.includes('?') ? '&' : '?'}t=${Date.now()}`
          : response.data.resolutionImageUrl;
        const datosResolucion = {
          resolvedBy: response.data.resolvedBy,
          resolvedByReportedAt: response.data.resolvedByReportedAt,
          resolutionDescription: response.data.resolutionDescription,
          resolutionImageUrl: imagenResolucion,
        };
        setMarkers((prevMarkers) =>
          prevMarkers.map((marker) =>
            marker._id === markerId ? { ...marker, ...datosResolucion } : marker
          )
        );
        if (editMode === markerId) {
          setFormData((prev) => ({ ...prev, ...datosResolucion }));
        }
        cerrarVentanaResolucion();
        setShowPopup(false);
        mostrarAviso(
          editandoResolucion
            ? 'Actualizaste tu aviso de resolución. El administrador va a revisarlo.'
            : 'Reportaste que resolviste este caso. El administrador va a revisar la descripción y la foto.'
        );
      } catch (error) {
        console.error('Error reporting resolved:', error);
        const serverMessage = error.response && error.response.data && error.response.data.message;
        mostrarAviso(
          serverMessage || 'No se pudo reportar la resolución. Intentá de nuevo.',
          true
        );
      }
    };
    const enviarRespuestaDatos = async () => {
      if (!editMode || enviandoRespuestaDatos) return;
      const texto = String(respuestaDatos || '').trim();
      if (texto.length < 5 && !fotoRespuestaDatos) {
        mostrarAviso('Escribí una descripción o agregá una foto.', true);
        return;
      }
      setEnviandoRespuestaDatos(true);
      try {
        const body = new FormData();
        if (texto) body.append('description', texto);
        if (fotoRespuestaDatos) body.append('image', fotoRespuestaDatos);
        const { data } = await axios.patch(
          `http://localhost:5001/api/markers/${editMode}/responder-datos`,
          body,
          { headers: { 'x-user-id': userId } }
        );
        const imagen = data.imageUrl
          ? `${data.imageUrl}${data.imageUrl.includes('?') ? '&' : '?'}t=${Date.now()}`
          : data.imageUrl;
        const actualizado = {
          description: data.description,
          imageUrl: imagen || data.imageUrl,
          pideDatosAt: null,
          pideDatosMensaje: '',
          pideDatosPor: null,
          ultimoPedidoDatosMensaje: data.ultimoPedidoDatosMensaje || '',
          ultimoPedidoDatosAt: data.ultimoPedidoDatosAt || null,
          ultimoPedidoDatosPor: data.ultimoPedidoDatosPor || null,
          respuestaDatosMensaje: data.respuestaDatosMensaje || '',
          respuestaDatosImageUrl: data.respuestaDatosImageUrl || '',
          respuestaDatosAt: data.respuestaDatosAt || new Date().toISOString(),
          ultimaRespuestaDatosAt: data.ultimaRespuestaDatosAt || new Date().toISOString(),
        };
        setMarkers((prev) =>
          prev.map((m) => (m._id === editMode ? { ...m, ...actualizado } : m))
        );
        setFormData((prev) => ({ ...prev, ...actualizado }));
        if (imagen) setSelectedImage(buildImageUrl(imagen));
        setFotoRespuestaDatos(null);
        setPreviewRespuestaDatos(null);
        setMostrarOpcionesFotoRespuesta(false);
        mostrarAviso('Respuesta enviada. El administrador va a revisarla.');
      } catch (error) {
        mostrarAviso(
          error.response?.data?.message || 'No se pudo enviar la respuesta.',
          true
        );
      } finally {
        setEnviandoRespuestaDatos(false);
      }
    };

    const renderPedidoDatosVecino = () => {
      const esDueno = formData.createdBy && String(formData.createdBy).toLowerCase() === userId;
      if (!esDueno || !formData.pideDatosAt || isAdmin) return null;
      return (
        <div className="popup-pedido-datos popup-pedido-datos-foco">
          <p className="popup-pedido-datos-titulo">Te piden más datos</p>
          <p className="popup-pedido-datos-etiqueta">Pedido del municipio</p>
          <p className="popup-pedido-datos-msg">
            {formData.pideDatosMensaje || 'Actualizá la descripción o la foto del caso.'}
          </p>
          <label className="popup-campo">
            <span>Tu respuesta</span>
            <textarea
              value={respuestaDatos}
              onChange={(e) => setRespuestaDatos(e.target.value)}
              rows={4}
              placeholder="Respondé a lo que te pidieron…"
              autoFocus
            />
          </label>
          <div className="popup-pedido-datos-foto">
            <input
              ref={inputGaleriaRespuestaRef}
              type="file"
              accept="image/*"
              className="sr-only-file"
              onChange={onElegirArchivoRespuesta}
            />
            <input
              ref={inputCamaraRespuestaRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only-file"
              onChange={onElegirArchivoRespuesta}
            />
            {previewRespuestaDatos ? (
              <div className="popup-pedido-datos-preview">
                <img src={previewRespuestaDatos} alt="Vista previa de la respuesta" />
                <div className="popup-pedido-datos-preview-acciones">
                  <button
                    type="button"
                    className="popup-foto-opcion"
                    onClick={() => abrirEditorConSrc(previewRespuestaDatos, 'respuesta')}
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    className="popup-foto-opcion"
                    onClick={quitarFotoRespuesta}
                  >
                    Quitar
                  </button>
                </div>
              </div>
            ) : !mostrarOpcionesFotoRespuesta ? (
              <button
                type="button"
                className="popup-pedido-datos-agregar-foto"
                onClick={() => setMostrarOpcionesFotoRespuesta(true)}
              >
                + Foto opcional
              </button>
            ) : (
              <div className="popup-pedido-datos-opciones">
                <div className="popup-foto-botones">
                  <button
                    type="button"
                    className="popup-foto-opcion"
                    onClick={() => inputGaleriaRespuestaRef.current?.click()}
                  >
                    Galería
                  </button>
                  <button
                    type="button"
                    className="popup-foto-opcion"
                    onClick={abrirCamaraRespuesta}
                  >
                    Cámara
                  </button>
                  <button
                    type="button"
                    className="popup-foto-opcion"
                    onClick={() => setMostrarOpcionesFotoRespuesta(false)}
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>
          <div className="popup-pedido-datos-acciones">
            <button
              type="button"
              className="popup-btn-publicar"
              onClick={enviarRespuestaDatos}
              disabled={enviandoRespuestaDatos}
            >
              {enviandoRespuestaDatos ? 'Enviando…' : 'Enviar respuesta'}
            </button>
            {!modoSoloCaso && Number.isFinite(Number(formData.lat)) && Number.isFinite(Number(formData.lng)) && (
              <button
                type="button"
                className="popup-btn-secundario"
                onClick={handleViewOnMap}
                disabled={enviandoRespuestaDatos}
              >
                Ver en el mapa
              </button>
            )}
          </div>
        </div>
      );
    };

    const renderResolucionVecino = () => {
      if (isAdmin) return null;
      // Cosas perdidas se cierra entre las partes con "Ya se resolvió"
      if (formData.category === 'cosas_perdidas') return null;
      const soyQuienResolvio = () => {
        const dueno = formData.resolvedBy ? String(formData.resolvedBy).trim().toLowerCase() : '';
        return dueno === userId;
      };
      const casoAbierto = formData.status === 'pendiente' || formData.status === 'en_proceso';
      const resolucionLista = !!resolutionDescription.trim()
        && (editandoResolucion || !!resolutionPhoto);

      const ventanaResolucion = mostrarResolucion ? (
        <div
          className="resolucion-fondo"
          onMouseDown={(event) => {
            event.stopPropagation();
            cerrarVentanaResolucion();
          }}
        >
          <div
            className="resolucion-ventana"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <h3 className="resolucion-titulo">
              {editandoResolucion ? 'Editar mi aviso de resolución' : 'Reportar que resolví este caso'}
            </h3>
            <label className="resolucion-descripcion">
              Qué hiciste (obligatorio)
              <textarea
                className="resolucion-texto"
                placeholder="Ej: Tapé el bache con material y dejé la calle limpia."
                value={resolutionDescription}
                onChange={(event) => setResolutionDescription(event.target.value)}
                rows={3}
                required
              />
            </label>
            <div className="resolucion-foto">
              <span>
                {editandoResolucion ? 'Foto de cómo quedó (opcional si ya hay una)' : 'Foto de cómo quedó (obligatoria)'}
              </span>
              <input
                ref={inputGaleriaResolucionRef}
                type="file"
                accept="image/*"
                className="sr-only-file"
                onChange={handleResolutionPhoto}
              />
              <input
                ref={inputCamaraResolucionRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only-file"
                onChange={handleResolutionPhoto}
              />
              <div className="popup-foto-botones">
                <button
                  type="button"
                  className="popup-btn-secundario"
                  onClick={() => inputGaleriaResolucionRef.current?.click()}
                >
                  Galería
                </button>
                <button
                  type="button"
                  className="popup-btn-secundario"
                  onClick={abrirCamaraResolucion}
                >
                  Cámara
                </button>
                {resolutionPreview && (
                  <button
                    type="button"
                    className="popup-btn-secundario"
                    onClick={() => abrirEditorConSrc(resolutionPreview, 'resolucion')}
                  >
                    Editar
                  </button>
                )}
              </div>
            </div>
            {resolutionPreview && (
              <img
                src={resolutionPreview}
                alt="Vista previa de la resolución"
                className="resolucion-vista"
              />
            )}
            <button
              type="button"
              className={`btn-resolucion-enviar${resolucionLista ? ' listo' : ''}`}
              onClick={() => handleReportResolved(editMode)}
              disabled={!resolucionLista}
            >
              {editandoResolucion ? 'Guardar cambios' : 'Enviar'}
            </button>
            <p className="resolucion-nota">
              El caso sigue abierto hasta que el administrador revise la descripción, la foto y lo marque como resuelto.
            </p>
            <button
              type="button"
              className="resolucion-cerrar"
              onClick={cerrarVentanaResolucion}
            >
              Cerrar
            </button>
          </div>
        </div>
      ) : null;

      if (formData.resolvedBy) {
        const puedoEditar = soyQuienResolvio() && casoAbierto;
        return (
          <>
            <div className="popup-resolucion-resumen">
              <small>
                ✅ Resuelto por {formData.resolvedBy}
                {formData.resolvedByReportedAt && (
                  <span> el {new Date(formData.resolvedByReportedAt).toLocaleDateString()}</span>
                )}
              </small>
              <button
                type="button"
                className="popup-resolucion-ver"
                onClick={() => setVerDetalleResolucion(true)}
              >
                Ver
              </button>
              {puedoEditar && (
                <button
                  type="button"
                  className="btn-editar-resolucion"
                  onClick={abrirEditarResolucion}
                >
                  Editar mi aviso
                </button>
              )}
            </div>
            {verDetalleResolucion && (
              <div
                className="popup-resolucion-modal-fondo"
                role="dialog"
                aria-modal="true"
                aria-label="Resolución del vecino"
                onClick={() => setVerDetalleResolucion(false)}
              >
                <div
                  className="popup-resolucion-modal"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="popup-resolucion-modal-cabecera">
                    <strong>Resolución del vecino</strong>
                    <button
                      type="button"
                      className="popup-btn-secundario"
                      onClick={() => setVerDetalleResolucion(false)}
                    >
                      Cerrar
                    </button>
                  </div>
                  <p className="popup-resolucion-modal-meta">
                    {formData.resolvedBy}
                    {formData.resolvedByReportedAt
                      ? ` · ${new Date(formData.resolvedByReportedAt).toLocaleDateString()}`
                      : ''}
                  </p>
                  <p className="popup-resolucion-modal-desc">
                    {formData.resolutionDescription || 'Sin descripción.'}
                  </p>
                  {formData.resolutionImageUrl && (
                    <img
                      src={buildImageUrl(formData.resolutionImageUrl)}
                      alt="Foto enviada por el vecino"
                      className="popup-resolucion-modal-foto"
                    />
                  )}
                </div>
              </div>
            )}
            {ventanaResolucion}
          </>
        );
      }
      if (!casoAbierto || esCasoFamilia(formData.category)) return null;
      return (
        <>
          <button
            type="button"
            className="btn-reportar-resuelto"
            onClick={abrirNuevaResolucion}
          >
            Reportar que resolví este caso
          </button>
          {ventanaResolucion}
        </>
      );
    };

    // Puntero de “confirmar lugar”: oculto con popup, paneles, o mientras un marcador brilla
    const mostrarSelectorPunto = !modoSoloCaso && !showPopup && !mostrarCercanos && !mostrarMisReportes
      && !mostrarCosasPerdidas && !mostrarFiltros && !mostrarNotificaciones
      && !ocultarPunteroMapa
      && !highlightedMarkerId;
    const mostrarMapaCerca = mostrarCosasPerdidas && perdidasSeccion === 'cerca';
    const radarBusquedaActiva = Boolean(normalizarBusquedaRadar(radarBusqueda));
    const yoRadar = String(userId || '').trim().toLowerCase();
    const catRadarLista = radarModo === 'animales' ? 'perros_gatos' : 'cosas_perdidas';
    const puntoLista = perdidasSeccion === 'cerca' ? puntoCercaActivo(cercaOrigen) : null;
    const radioLista = Number(cercaRadioMetros) || 2500;
    const perdidasListaBase = perdidasLista.filter((m) => {
      if (m.category !== catRadarLista) return false;
      if (radarModo === 'animales' && animalFiltroRadar && animalFiltroRadar !== 'todos'
        && m.animalTipo !== animalFiltroRadar) {
        return false;
      }
      if (perdidasSeccion === 'cerca' && yoRadar && yoRadar !== 'anonimo'
        && String(m.createdBy || '').trim().toLowerCase() === yoRadar) {
        return false;
      }
      // Misma regla que el círculo del mapa (al achicar el slider no mentir “en el radio”)
      if (
        perdidasSeccion === 'cerca'
        && puntoLista
        && Number.isFinite(puntoLista.lat)
        && Number.isFinite(puntoLista.lng)
      ) {
        return distanciaMetros(
          puntoLista.lat,
          puntoLista.lng,
          Number(m.lat),
          Number(m.lng),
        ) <= radioLista;
      }
      return true;
    });
    const perdidasListaFiltradaFull = radarBusquedaActiva
      ? perdidasListaBase.filter((m) => coincideBusquedaRadar(m, radarBusqueda))
      : perdidasListaBase;
    // Cerca: paginación en cliente (ya trajimos el círculo completo)
    const perdidasPageSize = radarVistaAmpliada ? 50 : (misMeta.limit || MIS_PAGE_SIZE);
    const perdidasTotalPaginas = Math.max(
      1,
      Math.ceil(
        (perdidasSeccion === 'cerca'
          ? perdidasListaFiltradaFull.length
          : (misMeta.total || 0)) / perdidasPageSize
      )
    );
    const perdidasListaFiltrada = perdidasSeccion === 'cerca'
      ? perdidasListaFiltradaFull.slice(
        (Math.max(1, misPage) - 1) * perdidasPageSize,
        Math.max(1, misPage) * perdidasPageSize
      )
      : perdidasListaFiltradaFull;
    const tituloPopup = !editMode
      ? 'Publicar aviso'
      : (recienPublicado ? 'Aviso enviado' : 'Aviso');
    const esMiAvisoPopup = Boolean(
      editMode
      && !isAdmin
      && userId
      && userId !== 'anonimo'
      && formData.createdBy
      && String(formData.createdBy).trim().toLowerCase() === userId
    );
    const textoCategoriaPublicada = formData.category === 'cosas_perdidas'
      ? `${categoryLabels.cosas_perdidas}${formData.perdidaTipo ? ` · ${perdidaLabels[formData.perdidaTipo]}` : ''}`
      : (categoryLabels[formData.category] || formData.category || '—');
    const puedeEditarAviso = Boolean(editMode && canEdit && !showDeleteOnly);

    return (
      <div className={`mapa-envoltorio${modoSoloCaso ? ' mapa-envoltorio-embebido' : ''}${guiaActiva ? ' mapa-con-guia' : ''}${(mostrarCosasPerdidas || mostrarMisReportes) ? ' mapa-con-perdidas' : ''}${(mostrarMisReportes || (mostrarCosasPerdidas && radarVistaAmpliada)) ? ' mapa-radar-ampliado' : ''}`}>
        {modoSoloCaso && habilitarGuiaGps && (() => {
          const paso = guiaActiva ? guiaPasos[guiaPasoIdx] : null;
          const maniobra = guiaLlego ? 'llegada' : tipoManiobra(paso?.instruction);
          const rumboAlPaso = (userLocation && paso?.end)
            ? rumboEntre(userLocation, paso.end)
            : null;
          const flechaRelativa = (rumboAlPaso != null && userHeading != null)
            ? ((rumboAlPaso - userHeading + 540) % 360) - 180
            : 0;
          return (
          <div className="mapa-guia-barra">
            <div className={`mapa-guia-maniobra mapa-guia-maniobra-${maniobra}`} aria-hidden="true">
              {maniobra === 'izquierda' && (
                <svg viewBox="0 0 24 24"><path fill="currentColor" d="M14 6v4h5v8h-2v-6h-5v4l-6-5 6-5z" /></svg>
              )}
              {maniobra === 'derecha' && (
                <svg viewBox="0 0 24 24"><path fill="currentColor" d="M10 6v4H5v8h2v-6h5v4l6-5-6-5z" /></svg>
              )}
              {maniobra === 'uturn' && (
                <svg viewBox="0 0 24 24"><path fill="currentColor" d="M7 7v3l-4-4 4-4v3c4.4 0 8 3.6 8 8v7h-2v-7c0-3.3-2.7-6-6-6z" /></svg>
              )}
              {(maniobra === 'recto' || maniobra === 'llegada') && (
                <svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 2 6 10h4v10h4V10h4L12 2z" /></svg>
              )}
            </div>
            {guiaLlego ? (
              <div className="mapa-guia-indicacion mapa-guia-llego">
                <strong>Llegaste al lugar</strong>
                <span>Ya podés atender el caso</span>
              </div>
            ) : guiaRecalculando ? (
              <div className="mapa-guia-indicacion">
                <strong>Recalculando ruta…</strong>
                <span>Te desviaste · buscando calles nuevas</span>
              </div>
            ) : guiaActiva && paso ? (
              <div className="mapa-guia-indicacion">
                <strong>{paso.instruction || 'Seguí la ruta'}</strong>
                <span>
                  {[paso.distance, guiaResumen].filter(Boolean).join(' · ')}
                </span>
              </div>
            ) : (
              <div className="mapa-guia-indicacion">
                <strong>{guiaCargando ? 'Calculando ruta…' : 'Guía al caso'}</strong>
                <span>
                  {guiaError
                    || (guiaResumen || 'Ruta en el mapa de CiudadAr, sin salir de la app')}
                </span>
              </div>
            )}
            {guiaActiva && !guiaLlego && (
              <div
                className="mapa-guia-brujula"
                title="Dirección hacia el próximo punto"
                style={{ transform: `rotate(${flechaRelativa}deg)` }}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path fill="currentColor" d="M12 2 4 20 12 16 20 20 12 2z" />
                </svg>
              </div>
            )}
            <div className="mapa-guia-acciones">
              {!guiaActiva ? (
                <button
                  type="button"
                  className="admin-dash-btn primario"
                  disabled={guiaCargando}
                  onClick={iniciarGuiaGps}
                >
                  {guiaCargando ? 'Calculando…' : 'Iniciar guía'}
                </button>
              ) : (
                <>
                  {!guiaLlego && (
                    <button
                      type="button"
                      className="admin-dash-btn primario"
                      onClick={guiaSimulando ? detenerSimulacionGuia : simularRecorridoGuia}
                    >
                      {guiaSimulando ? 'Pausar prueba' : 'Simular recorrido'}
                    </button>
                  )}
                  <button
                    type="button"
                    className="admin-dash-btn"
                    onClick={detenerGuiaGps}
                  >
                    Detener guía
                  </button>
                </>
              )}
            </div>
          </div>
          );
        })()}
        {!modoSoloCaso && !mostrarCosasPerdidas && (soloMisReportes || soloMiJurisdiccion || categoryFilter !== 'todas' || markersMeta.hasMore || markersMeta.total > 0) && (
          <div className="mapa-acciones">
            <div className="chip-filtros-activos">
              {soloMisReportes && <span>Solo mis reportes</span>}
              {soloMiJurisdiccion && <span>Mi jurisdicción</span>}
              {categoryFilter !== 'todas' && (
                <span>
                  {categoryLabels[categoryFilter] || categoryFilter}
                  {categoryFilter === 'perros_gatos' && animalFilter !== 'todos'
                    ? ` · ${ANIMAL_TIPOS[animalFilter] || animalFilter}`
                    : ''}
                </span>
              )}
              <span>
                {markers.length}
                {markersMeta.total > markers.length ? ` de ${markersMeta.total}` : ''} en el mapa
              </span>
              {markersMeta.hasMore && (
                <span className="chip-filtros-aviso">Usá filtros para acotar</span>
              )}
              {(soloMisReportes || soloMiJurisdiccion || categoryFilter !== 'todas') && (
                <button
                  type="button"
                  onClick={() => {
                    setSoloMisReportes(false);
                    setSoloMiJurisdiccion(false);
                    setCategoryFilter('todas');
                    setAnimalFilter('todos');
                  }}
                >
                  Limpiar
                </button>
              )}
            </div>
          </div>
        )}
        <div className="mapa-lienzo" ref={mapaLienzoRef}>
          <GoogleMap
            mapContainerClassName="mapa-ciudad"
            mapContainerStyle={mapaContainerStyle}
            onLoad={onMapLoad}
            options={mapaOpciones}
          >
          {mapaListoTick > 0 && userLocation && (
            <OverlayView
              position={userLocation}
              mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
            >
              <div className={`ubicacion-actual${guiaActiva ? ' ubicacion-actual-guia' : ''}`}>
                <span className="ubicacion-halo" />
                {guiaActiva ? (
                  <span
                    className="ubicacion-flecha"
                    style={{
                      transform: `translate(-50%, -50%) rotate(${userHeading != null ? userHeading : 0}deg)`,
                    }}
                    aria-label="Tu dirección"
                  >
                    <svg viewBox="0 0 48 48" aria-hidden="true">
                      <path
                        d="M24 4 L40 42 L24 34 L8 42 Z"
                        fill="#2F6FDB"
                        stroke="#fff"
                        strokeWidth="3"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                ) : (
                  <span className="ubicacion-punto" />
                )}
              </div>
            </OverlayView>
          )}
          {guiaActiva && guiaPath.length > 1 && (
            <>
              <Polyline
                path={guiaPath}
                options={{
                  strokeColor: '#ffffff',
                  strokeOpacity: 0.95,
                  strokeWeight: 10,
                  geodesic: true,
                  zIndex: 1,
                }}
              />
              <Polyline
                path={guiaPath}
                options={{
                  strokeColor: '#2F6FDB',
                  strokeOpacity: 1,
                  strokeWeight: 6,
                  geodesic: true,
                  zIndex: 2,
                }}
              />
            </>
          )}
          {guiaActiva && guiaDestino && (
            <OverlayView
              position={guiaDestino}
              mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
            >
              <div
                className="mapa-guia-destino"
                style={{ transform: 'translate(-18px, -36px)' }}
                aria-label="Destino del caso"
              >
                <svg viewBox="0 0 36 36" aria-hidden="true">
                  <path
                    fill="#e11d48"
                    stroke="#fff"
                    strokeWidth="2"
                    d="M18 2c-6 0-11 5-11 11 0 8.5 11 21 11 21s11-12.5 11-21c0-6-5-11-11-11zm0 15a4 4 0 1 1 0-8 4 4 0 0 1 0 8z"
                  />
                </svg>
              </div>
            </OverlayView>
          )}
          <CapaPinesMapa
            key={`pines-${mostrarCosasPerdidas ? `radar-${radarModo}-${animalFiltroRadar}` : 'mapa'}`}
            markers={visibleMarkers}
            mapaListoTick={mapaListoTick}
            userId={userId}
            isAdmin={isAdmin}
            highlightedMarkerId={highlightedMarkerId}
            modoSoloCaso={modoSoloCaso}
            focoCasoId={focoCasoMapa?._id || null}
            soloMisReportes={soloMisReportes}
            onMarkerClick={handleMarkerClick}
          />
          {/* Radio Radar: un solo google.maps.Circle vía radioCercaCircleRef (no <Circle/> React) */}
          {/* Punto verde de zona vigilada (mismo estilo que el azul GPS) */}
          {mapaListoTick > 0 && mostrarMapaCerca && zonaAlerta
            && Number.isFinite(Number(zonaAlerta.lat))
            && Number.isFinite(Number(zonaAlerta.lng)) && (
            <OverlayView
              position={{ lat: Number(zonaAlerta.lat), lng: Number(zonaAlerta.lng) }}
              mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
            >
              <div
                className={`ubicacion-actual ubicacion-vigilada${cercaOrigen === 'vigilada' ? ' activa' : ''}`}
                title="Zona vigilada"
                aria-hidden="true"
              >
                <span className="ubicacion-halo" />
                <span className="ubicacion-punto" />
              </div>
            </OverlayView>
          )}
          </GoogleMap>

          {!isImageZoomed && (
            <div className={`mapa-zoom-controles${mostrarMapaCerca ? ' con-radar' : ''}`} role="group" aria-label="Zoom del mapa">
              <button
                type="button"
                className="mapa-btn-zoom"
                onClick={() => {
                  const map = mapRef.current;
                  if (!map?.getZoom) return;
                  const z = map.getZoom();
                  if (!Number.isFinite(z)) return;
                  map.setZoom(Math.min(21, z + 1));
                }}
                aria-label="Acercar mapa"
                title="Acercar"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path fill="currentColor" d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
                </svg>
              </button>
              <button
                type="button"
                className="mapa-btn-zoom"
                onClick={() => {
                  const map = mapRef.current;
                  if (!map?.getZoom) return;
                  const z = map.getZoom();
                  if (!Number.isFinite(z)) return;
                  map.setZoom(Math.max(3, z - 1));
                }}
                aria-label="Alejar mapa"
                title="Alejar"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path fill="currentColor" d="M19 13H5v-2h14v2z" />
                </svg>
              </button>
            </div>
          )}

          {!modoSoloCaso && !isImageZoomed && !radarVistaAmpliada && (
            <div
              className={`mapa-leyenda-pines${mostrarSelectorPunto ? ' con-barra' : ''}`}
              role="region"
              aria-label="Leyenda de pines"
            >
              <ul className="panel-pin-leyenda">
                {LEYENDA_PINES.map((item) => (
                  <li key={item.key}>
                    <span className="leyenda-punto" style={{ background: item.color }} />
                    {item.label}
                  </li>
                ))}
                <li>
                  <span className="leyenda-punto leyenda-punto-mio" aria-hidden="true" />
                  Publicado por vos
                </li>
              </ul>
            </div>
          )}

          {modoSoloCaso && habilitarGuiaGps && (
            <button
              type="button"
              className={`mapa-btn-ubicacion mapa-btn-ubicacion-flotante${userLocation ? '' : ' desactivado'}`}
              onClick={irAMiUbicacion}
              disabled={!userLocation}
              aria-label="Volver a mi ubicación"
              title="Mi ubicación"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M12 8a4 4 0 1 0 4 4 4 4 0 0 0-4-4zm8.94 3A8.99 8.99 0 0 0 13 3.06V1h-2v2.06A8.99 8.99 0 0 0 3.06 11H1v2h2.06A8.99 8.99 0 0 0 11 20.94V23h2v-2.06A8.99 8.99 0 0 0 20.94 13H23v-2zM12 19a7 7 0 1 1 7-7 7 7 0 0 1-7 7z"
                />
              </svg>
            </button>
          )}

          {mostrarSelectorPunto && (
            <>
              <div
                ref={(el) => { pinCentralRefs.current[0] = el; }}
                className="pin-central"
                aria-hidden="true"
              >
                <img src={marcadorCiudad} alt="" />
              </div>
              <div className="mapa-barra-inferior">
                <div className="mapa-barra-fila">
                  <BuscadorDireccion
                    valor={direccionPreview}
                    onChange={setDireccionPreview}
                    onElegirLugar={elegirDireccionBuscada}
                    onLimpiar={limpiarDireccionBuscador}
                    placeholder="Buscá una calle o lugar"
                    conLupa
                  />
                  <button
                    type="button"
                    className={`mapa-btn-ubicacion${userLocation ? '' : ' desactivado'}`}
                    onClick={irAMiUbicacion}
                    disabled={!userLocation}
                    aria-label="Volver a mi ubicación"
                    title="Mi ubicación"
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path
                        fill="currentColor"
                        d="M12 8a4 4 0 1 0 4 4 4 4 0 0 0-4-4zm8.94 3A8.99 8.99 0 0 0 13 3.06V1h-2v2.06A8.99 8.99 0 0 0 3.06 11H1v2h2.06A8.99 8.99 0 0 0 11 20.94V23h2v-2.06A8.99 8.99 0 0 0 20.94 13H23v-2zM12 19a7 7 0 1 1 7-7 7 7 0 0 1-7 7z"
                      />
                    </svg>
                  </button>
                </div>
                <button
                  type="button"
                  className="mapa-btn-confirmar"
                  onClick={confirmarPuntoMapa}
                >
                  Confirmar punto
                </button>
              </div>
            </>
          )}

          {mostrarMapaCerca && cercaOrigen === 'mapa' && (
            <div
              ref={(el) => { pinCentralRefs.current[1] = el; }}
              className="pin-central pin-central-cerca pin-cerca-mapa"
              aria-hidden="true"
            >
              <span className="pin-cerca-radar" />
              <img src={marcadorCiudad} alt="" />
            </div>
          )}

          {mostrarMapaCerca && (
            <div className={`mapa-radar-controles${cercaOrigen === 'mapa' ? ' modo-mapa' : (cercaOrigen === 'vigilada' ? ' modo-vigilada' : ' modo-gps')}${zonaAlerta ? ' con-vigilancia' : ''}`}>
              <div className="mapa-radar-origen" role="group" aria-label="Origen del radio">
                <button
                  type="button"
                  className={cercaOrigen === 'gps' ? 'activo activo-gps' : ''}
                  disabled={!userLocation}
                  onClick={() => {
                    ignorarDragCercaRef.current = true;
                    gpsFollowPausadoRef.current = false;
                    ultimoCercaGpsFetchRef.current = userLocation
                      ? { lat: userLocation.lat, lng: userLocation.lng }
                      : null;
                    if (userLocation) {
                      setMapCenter(userLocation);
                      if (mapRef.current) mapRef.current.panTo(userLocation);
                    }
                    setCercaOrigen('gps');
                    cargarPerdidasLista('cerca', 1, 'gps');
                    window.setTimeout(() => { ignorarDragCercaRef.current = false; }, 600);
                  }}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      fill="currentColor"
                      d="M12 8a4 4 0 1 0 4 4 4 4 0 0 0-4-4zm8.94 3A8.99 8.99 0 0 0 13 3.06V1h-2v2.06A8.99 8.99 0 0 0 3.06 11H1v2h2.06A8.99 8.99 0 0 0 11 20.94V23h2v-2.06A8.99 8.99 0 0 0 20.94 13H23v-2zM12 19a7 7 0 1 1 7-7 7 7 0 0 1-7 7z"
                    />
                  </svg>
                  Cerca de mí
                </button>
                <button
                  type="button"
                  className={cercaOrigen === 'mapa' ? 'activo activo-mapa' : ''}
                  onClick={() => {
                    setCercaOrigen('mapa');
                    programarReloadCercaDesdeMapa();
                  }}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      fill="currentColor"
                      d="M12 2C8.1 2 5 5.1 5 9c0 5.2 7 13 7 13s7-7.8 7-13c0-3.9-3.1-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5z"
                    />
                  </svg>
                  Otra zona
                </button>
              </div>
              <label className="mapa-radar-radio">
                <span>
                  Radio
                  {' '}
                  <strong>
                    {cercaRadioMetros < 1000
                      ? `${cercaRadioMetros} m`
                      : `${(cercaRadioMetros / 1000).toFixed(1)} km`}
                  </strong>
                </span>
                <input
                  type="range"
                  min={500}
                  max={8000}
                  step={100}
                  value={cercaRadioMetros}
                  onChange={(e) => setCercaRadioMetros(Number(e.target.value))}
                  aria-label="Radio de búsqueda"
                />
              </label>
              <div className="mapa-radar-vigilancia" role="group" aria-label="Zona vigilada">
                <button
                  type="button"
                  className="mapa-radar-vigilancia-btn primario"
                  disabled={guardandoZonaAlerta}
                  onClick={() => {
                    guardarZonaAlerta(false);
                  }}
                >
                  {guardandoZonaAlerta ? 'Guardando…' : (zonaAlerta ? 'Actualizar zona vigilada' : 'Vigilar esta zona')}
                </button>
                {zonaAlerta && (
                  <>
                    <button
                      type="button"
                      className={`mapa-radar-vigilancia-btn${cercaOrigen === 'vigilada' ? ' activo' : ''}`}
                      onClick={() => {
                        const punto = {
                          lat: Number(zonaAlerta.lat),
                          lng: Number(zonaAlerta.lng),
                        };
                        ignorarDragCercaRef.current = true;
                        setMapCenter(punto);
                        setCercaOrigen('vigilada');
                        if (zonaAlerta.radio) setCercaRadioMetros(Number(zonaAlerta.radio));
                        if (mapRef.current) mapRef.current.panTo(punto);
                        cargarPerdidasLista('cerca', 1, 'vigilada');
                        window.setTimeout(() => { ignorarDragCercaRef.current = false; }, 600);
                      }}
                    >
                      Ver vigilada
                    </button>
                    <button
                      type="button"
                      className="mapa-radar-vigilancia-btn"
                      disabled={guardandoZonaAlerta}
                      onClick={() => guardarZonaAlerta(true)}
                    >
                      Dejar de vigilar
                    </button>
                  </>
                )}
              </div>
              <p className="mapa-radar-ayuda">
                {geoError
                  ? geoError
                  : (cercaOrigen === 'vigilada'
                    ? 'Verde: zona vigilada. Te avisamos si publican ahí.'
                    : (cercaOrigen === 'gps'
                      ? (userLocation
                        ? 'Azul: cerca de vos. Al mover el mapa pasa a naranja.'
                        : 'Buscando tu ubicación…')
                      : 'Naranja: otra zona. Mové el mapa para elegir el centro.'))}
              </p>
            </div>
          )}
        </div>

        {showPopup && (
          <div
            className={`popup-fondo${isImageZoomed ? ' con-zoom' : ''}${modoSoloCaso ? ' popup-fondo-embebido' : ''}`}
            onMouseDown={handleCancel}
          >
            <div
              className={`popup-ciudadar${isImageZoomed ? ' ampliado' : ''} popup-publicar`}
              onMouseDown={stopPropagation}
              onClick={stopPropagation}
            >
              <div className="popup-cabecera popup-cabecera-publicar">
                <button
                  type="button"
                  className="popup-nav-btn"
                  onClick={handleCancel}
                  aria-label="Volver"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path fill="currentColor" d="M15.4 7.4 14 6l-6 6 6 6 1.4-1.4L10.8 12z" />
                  </svg>
                </button>
                <strong className={esMiAvisoPopup ? 'popup-titulo-con-etiqueta' : undefined}>
                  {tituloPopup}
                  {esMiAvisoPopup && <em className="popup-etiqueta-mio">Tu aviso</em>}
                </strong>
                <button
                  type="button"
                  className="popup-nav-btn"
                  onClick={handleCancel}
                  aria-label="Cerrar"
                  title="Cerrar"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      fill="currentColor"
                      d="M18.3 5.7 12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7 2.9 18.3 9.2 12 2.9 5.7 4.3 4.3l6.3 6.3 6.3-6.3z"
                    />
                  </svg>
                </button>
              </div>
              {isImageZoomed ? (
                selectedImage && (
                  <div
                    className="popup-media"
                    style={{ touchAction: 'pinch-zoom' }}
                    onTouchStart={stopTouchPropagation}
                    onTouchMove={stopTouchPropagation}
                    onTouchEnd={stopTouchPropagation}
                  >
                    <img
                      src={selectedImage}
                      alt="Seleccionada"
                      className="popup-foto-zoom"
                      onClick={handleImageClick}
                      onError={handleImageError}
                    />
                  </div>
                )
              ) : editMode ? (
                <div className="popup-cuerpo popup-cuerpo-publicar">
                  {puedeEditarAviso ? (
                    <form
                      className="popup-formulario popup-form-publicar"
                      onSubmit={(e) => handleSaveUpdate(e, editMode)}
                    >
                      <h3 className="popup-pregunta">Editar aviso</h3>
                      {formData.caseId && (
                        <div className="popup-caso-id">
                          <p>ID del caso</p>
                          <p className="popup-caso-numero">#{formData.caseId}</p>
                          <p className="popup-caso-lugar">
                            <IconoUbicacion />
                            <span>{textoMunicipio(formData.jurisdictionName)}</span>
                          </p>
                        </div>
                      )}
                      <div className="popup-campo">
                        <label>Categoría</label>
                        <div className="popup-select-wrap">
                          <select value={formData.category} onChange={handleCategoryChange} required>
                            {categoryOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                          <span className="popup-select-icono" aria-hidden="true">
                            <svg viewBox="0 0 24 24">
                              <path fill="currentColor" d="M7 10l5 5 5-5z" />
                            </svg>
                          </span>
                        </div>
                      </div>
                      {renderFamiliasTipo()}
                      {renderAnimalTipo()}
                      {renderPerdidaTipo()}
                      <div className="popup-campo">
                        <label>Descripción</label>
                        <textarea
                          value={formData.description}
                          onChange={handleDescriptionChange}
                          required
                        />
                      </div>
                      <div className="popup-campo">
                        <label>Zona</label>
                        <div className="popup-input-icono">
                          <input
                            type="text"
                            value={formData.direccion || ''}
                            onChange={handleDireccionChange}
                            placeholder="Dirección del punto"
                          />
                          <span className="popup-input-pin" aria-hidden="true">
                            <IconoUbicacion />
                          </span>
                        </div>
                      </div>
                      <div className="popup-campo">
                        <label>Fecha</label>
                        <input type="date" value={formData.date} onChange={handleDateChange} required />
                      </div>
                      <div className="popup-campo">
                        <label>Hora</label>
                        <input type="time" value={formData.time} onChange={handleTimeChange} required />
                      </div>
                      {selectedImage && (
                        <div className="popup-campo">
                          <div className="popup-media">
                            <div className="popup-foto-caja">
                              <img
                                src={selectedImage}
                                alt="Foto del reporte"
                                className="popup-foto"
                                onClick={handleImageClick}
                                onError={handleImageError}
                              />
                            </div>
                          </div>
                        </div>
                      )}
                      <div className="popup-ficha-estado popup-estado-publicar">
                        {renderStatusInfo(true)}
                      </div>
                      {renderResolucionVecino()}
                      {renderAccionesCosasPerdidas()}
                      <button type="submit" className="popup-btn-publicar">
                        Guardar cambios
                      </button>
                      <button
                        type="button"
                        className="popup-btn-secundario"
                        onClick={() => handleDeleteMarker(editMode)}
                      >
                        Borrar aviso
                      </button>
                    </form>
                  ) : (
                    <div className="popup-formulario popup-form-publicar">
                      {(() => {
                        const esDuenoPedido = formData.createdBy
                          && String(formData.createdBy).toLowerCase() === userId
                          && formData.pideDatosAt
                          && !isAdmin;
                        if (esDuenoPedido) {
                          const detalleTipo = formData.category === 'perros_gatos' && formData.animalTipo
                            ? (ANIMAL_TIPOS[formData.animalTipo] || formData.animalTipo)
                            : (formData.category === 'cosas_perdidas' && formData.objeto
                              ? formData.objeto
                              : '');
                          return (
                            <>
                              <div className="popup-pedido-resumen">
                                <p className="popup-pedido-resumen-caso">
                                  {formData.caseId ? `Caso #${formData.caseId}` : 'Tu aviso'}
                                  {' · '}
                                  {textoCategoriaPublicada}
                                  {detalleTipo ? ` · ${detalleTipo}` : ''}
                                </p>
                                {selectedImage && (
                                  <img
                                    className="popup-pedido-resumen-foto"
                                    src={selectedImage}
                                    alt="Foto de tu aviso"
                                    onError={handleImageError}
                                  />
                                )}
                                {formData.description && (
                                  <p className="popup-pedido-resumen-texto">
                                    <span className="popup-pedido-resumen-label">Tu publicación</span>
                                    {formData.description}
                                  </p>
                                )}
                                {formData.direccion && (
                                  <p className="popup-pedido-resumen-zona">
                                    <IconoUbicacion />
                                    <span>{formData.direccion}</span>
                                  </p>
                                )}
                              </div>
                              {renderPedidoDatosVecino()}
                            </>
                          );
                        }
                        return (
                          <>
                      {recienPublicado && (
                        <h3 className="popup-pregunta">Tu aviso quedó registrado</h3>
                      )}
                      {!showDeleteOnly && !recienPublicado && (
                        <p className="popup-nota popup-nota-suave">
                          Esta publicación anónima solo puede ser editada por su creador.
                        </p>
                      )}
                      {formData.caseId && (
                        <div className="popup-caso-id">
                          <p>ID del caso</p>
                          <p className="popup-caso-numero">#{formData.caseId}</p>
                          <p className="popup-caso-lugar">
                            <IconoUbicacion />
                            <span>{textoMunicipio(formData.jurisdictionName)}</span>
                          </p>
                        </div>
                      )}
                      <div className="popup-campo">
                        <label>Categoría</label>
                        <div className="popup-dato-publicar">{textoCategoriaPublicada}</div>
                      </div>
                      {formData.category === 'perros_gatos' && formData.animalTipo && (
                        <div className="popup-campo">
                          <label>Tipo</label>
                          <div className="popup-dato-publicar">
                            {ANIMAL_TIPOS[formData.animalTipo] || formData.animalTipo}
                          </div>
                        </div>
                      )}
                      {formData.category === 'cosas_perdidas' && formData.objeto && (
                        <div className="popup-campo">
                          <label>Objeto</label>
                          <div className="popup-dato-publicar">{formData.objeto}</div>
                        </div>
                      )}
                      <div className="popup-campo">
                        <label>Descripción</label>
                        <div className="popup-dato-publicar">{formData.description || '—'}</div>
                      </div>
                      <div className="popup-campo">
                        <label>Zona</label>
                        <div className="popup-dato-publicar popup-dato-con-pin">
                          <span>{formData.direccion || '—'}</span>
                          <span className="popup-input-pin" aria-hidden="true">
                            <IconoUbicacion />
                          </span>
                        </div>
                      </div>
                      {(formData.date || formData.time) && (
                        <div className="popup-campo">
                          <label>Fecha y hora</label>
                          <div className="popup-dato-publicar">
                            {[formData.date, formData.time].filter(Boolean).join(' · ') || '—'}
                          </div>
                        </div>
                      )}
                      {selectedImage && (
                        <div className="popup-campo">
                          <div className="popup-media">
                            <div className="popup-foto-caja">
                              <img
                                src={selectedImage}
                                alt="Foto del reporte"
                                className="popup-foto"
                                onClick={handleImageClick}
                                onError={handleImageError}
                              />
                            </div>
                          </div>
                        </div>
                      )}
                      <div className="popup-ficha-estado popup-estado-publicar">
                        {renderStatusInfo(true)}
                      </div>
                      {renderPedidoDatosVecino()}
                      {renderResolucionVecino()}
                      {renderBotonWhatsApp()}
                      {renderAccionesCosasPerdidas()}
                      {!formData.pideDatosAt
                        && !modoSoloCaso
                        && formData.status !== 'resuelto'
                        && formData.status !== 'rechazado'
                        && !formData.eliminadoAt && (
                        <button
                          type="button"
                          className="popup-btn-secundario"
                          onClick={handleViewOnMap}
                        >
                          Ver en el mapa
                        </button>
                      )}
                      {esPublicacionVencida(formData) && (
                        <button
                          type="button"
                          className="popup-btn-publicar"
                          disabled={renovandoId === editMode}
                          onClick={() => renovarPublicacion({ ...formData, _id: editMode })}
                        >
                          {renovandoId === editMode ? 'Renovando…' : 'Renovar publicación'}
                        </button>
                      )}
                      {!formData.pideDatosAt && !esPublicacionVencida(formData) && (
                        <button
                          type="button"
                          className="popup-btn-publicar"
                          onClick={handleCancel}
                        >
                          Listo
                        </button>
                      )}
                          </>
                        );
                      })()}
                    </div>
                  )}
                </div>
              ) : (
                <div className="popup-cuerpo popup-cuerpo-publicar">
                  <form className="popup-formulario popup-form-publicar" onSubmit={handleSubmit}>
                    <h3 className="popup-pregunta">¿Qué vas a publicar?</h3>

                    <div className="popup-campo">
                      <label>Categoría</label>
                      <div className="popup-select-wrap">
                        <select value={formData.category} onChange={handleCategoryChange} required>
                          {categoryOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                        <span className="popup-select-icono" aria-hidden="true">
                          <svg viewBox="0 0 24 24">
                            <path fill="currentColor" d="M7 10l5 5 5-5z" />
                          </svg>
                        </span>
                      </div>
                    </div>

                    {renderFamiliasTipo()}
                    {renderAnimalTipo()}
                    {renderPerdidaTipo()}

                    <div className="popup-campo">
                      <label>Descripción</label>
                      <input
                        type="text"
                        value={formData.description}
                        onChange={handleDescriptionChange}
                        placeholder={
                          formData.category === 'cosas_perdidas'
                            ? 'Ej.: Mochila negra, billetera, llaves...'
                            : 'Contá qué pasó...'
                        }
                        required
                      />
                    </div>

                    <div className="popup-campo">
                      <label>Zona</label>
                      <div className="popup-input-icono">
                        <input
                          type="text"
                          value={formData.direccion || ''}
                          onChange={handleDireccionChange}
                          placeholder="Ej.: Plaza San Martín, barrio Centro"
                        />
                        <span className="popup-input-pin" aria-hidden="true">
                          <IconoUbicacion />
                        </span>
                      </div>
                    </div>

                    <div className="popup-campo">
                      <label>Foto</label>
                      <div className="popup-media">
                        <input
                          ref={inputGaleriaRef}
                          type="file"
                          accept="image/*"
                          className="sr-only-file"
                          onChange={onElegirArchivoAviso}
                        />
                        <input
                          ref={inputCamaraRef}
                          type="file"
                          accept="image/*"
                          capture="environment"
                          className="sr-only-file"
                          onChange={onElegirArchivoAviso}
                        />
                        {!selectedImage ? (
                          <div className="popup-dropzone popup-dropzone-publicar popup-foto-acciones">
                            {!mostrarOpcionesFoto ? (
                              <button
                                type="button"
                                className="popup-foto-abrir"
                                onClick={() => setMostrarOpcionesFoto(true)}
                              >
                                <span className="popup-dropzone-camara" aria-hidden="true">
                                  <svg viewBox="0 0 24 24">
                                    <path fill="currentColor" d="M9 3 7.2 5H4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3.2L15 3H9zm3 15a5 5 0 1 1 5-5 5 5 0 0 1-5 5zm0-2.2A2.8 2.8 0 1 0 9.2 13 2.8 2.8 0 0 0 12 15.8z" />
                                  </svg>
                                </span>
                                <p>Agregá una foto</p>
                                <span className="popup-nota">Tocá para elegir galería o cámara</span>
                              </button>
                            ) : (
                              <>
                                <p>¿Cómo querés cargar la foto?</p>
                                <div className="popup-foto-botones">
                                  <button
                                    type="button"
                                    className="popup-foto-opcion"
                                    onClick={() => inputGaleriaRef.current?.click()}
                                  >
                                    Galería
                                  </button>
                                  <button
                                    type="button"
                                    className="popup-foto-opcion"
                                    onClick={abrirCamaraAviso}
                                  >
                                    Cámara
                                  </button>
                                </div>
                                <button
                                  type="button"
                                  className="popup-foto-volver-opciones"
                                  onClick={() => setMostrarOpcionesFoto(false)}
                                >
                                  Volver
                                </button>
                              </>
                            )}
                          </div>
                        ) : (
                          <div className="popup-foto-caja">
                            <img
                              src={selectedImage}
                              alt="Foto del reporte"
                              className="popup-foto"
                              onClick={handleImageClick}
                              onError={handleImageError}
                            />
                            <div className="popup-foto-toolbar">
                              <button
                                type="button"
                                className="popup-foto-editar"
                                onClick={() => abrirEditorConSrc(selectedImage, 'aviso')}
                              >
                                Editar
                              </button>
                              <button
                                type="button"
                                className="popup-foto-quitar"
                                onClick={quitarImagen}
                                aria-label="Quitar foto"
                                title="Quitar foto"
                              >
                                <svg viewBox="0 0 24 24" aria-hidden="true">
                                  <path
                                    fill="currentColor"
                                    d="M9 3h6l1 2h4v2H4V5h4l1-2zm1 6h2v9h-2V9zm4 0h2v9h-2V9zM7 9h2v9H7V9zm-1 12h12a1 1 0 0 0 1-1V7H5v13a1 1 0 0 0 1 1z"
                                  />
                                </svg>
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {!esCasoFamilia(formData.category) && (
                      <small className="popup-nota popup-nota-suave">
                        Un administrador va a revisar tu aviso antes de publicarlo.
                      </small>
                    )}

                    <button type="submit" className="popup-btn-publicar">
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path fill="currentColor" d="M3.4 20.6 21 12 3.4 3.4 3 10l11 2L3 14z" />
                      </svg>
                      Publicar aviso
                    </button>
                  </form>
                </div>
              )}
            </div>
          </div>
        )}

        {mostrarCercanos && (
          <div className="cercanos-fondo">
            <div className="cercanos-ventana" onClick={stopPropagation} onTouchStart={stopTouchPropagation}>
              <h3>¿Es alguno de estos?</h3>
              <p>Hay reparaciones ya publicadas de otro vecino, a menos de 50 metros. Si es la misma, tu denuncia se suma. Si no, se crea un caso nuevo.</p>
              {casosCercanos.map((caso) => (
                <article className="cercanos-caso" key={caso._id}>
                  <div>
                    <strong>Caso #{caso.caseId || 'sin número'}</strong>
                    <span>A {caso.metros} metros</span>
                    <p>{caso.description || 'Sin descripción'}</p>
                  </div>
                  {caso.imageUrl && (
                    <img src={buildImageUrl(caso.imageUrl)} alt="Foto del caso cercano" />
                  )}
                  <button
                    type="button"
                    onClick={() => confirmarMismoCaso(caso)}
                    disabled={sumandoCaso === caso._id}
                  >
                    {sumandoCaso === caso._id ? 'Sumando...' : 'Es este'}
                  </button>
                </article>
              ))}
              <div className="cercanos-acciones">
                <button type="button" className="cercanos-otro" onClick={publicarComoCasoNuevo} disabled={!!sumandoCaso}>
                  Ninguno, es otro problema
                </button>
                <button type="button" className="cercanos-volver" onClick={() => setMostrarCercanos(false)}>
                  Volver
                </button>
              </div>
            </div>
          </div>
        )}

        {geoError && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              background: 'red',
              color: 'white',
              padding: '10px',
              zIndex: 1001,
            }}
          >
            Error getting location: {geoError}
          </div>
        )}
        {mostrarFiltros && (
          <div className="panel-vecino-fondo" onClick={() => setMostrarFiltros(false)}>
            <div className="panel-vecino" onClick={(event) => event.stopPropagation()}>
              <div className="panel-vecino-cabecera">
                <h3>Filtros del mapa</h3>
                <button type="button" onClick={() => setMostrarFiltros(false)}>Cerrar</button>
              </div>
              <div className="panel-filtros">
                <label>
                  Categoría
                  <select
                    value={categoryFilter === 'todas' ? '' : categoryFilter}
                    onChange={(e) => {
                      const valor = e.target.value || 'todas';
                      setCategoryFilter(valor);
                      if (valor !== 'perros_gatos') setAnimalFilter('todos');
                    }}
                  >
                    <option value="" disabled hidden>
                      Elegí una categoría
                    </option>
                    {availableCategoryOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <ul className="panel-pin-leyenda" aria-label="Colores de los pines">
                  {LEYENDA_PINES.map((item) => (
                    <li key={item.key}>
                      <span className="leyenda-punto" style={{ background: item.color }} />
                      {item.label}
                    </li>
                  ))}
                </ul>
                {categoryFilter === 'perros_gatos' && (
                  <label>
                    De qué se trata
                    <select
                      value={animalFilter}
                      onChange={(e) => setAnimalFilter(e.target.value)}
                    >
                      {Object.entries(ANIMAL_TIPOS).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                      <option value="todos">Todos</option>
                    </select>
                  </label>
                )}
                <label className="filtro-mis-reportes">
                  <input
                    type="checkbox"
                    checked={soloMisReportes}
                    onChange={(e) => setSoloMisReportes(e.target.checked)}
                  />
                  Solo mis reportes
                </label>
                {isAdmin && adminRole !== 'SUPER_ADMIN' && (adminJurisdictions || []).length > 0 && (
                  <label className="filtro-mis-reportes">
                    <input
                      type="checkbox"
                      checked={soloMiJurisdiccion}
                      onChange={(e) => setSoloMiJurisdiccion(e.target.checked)}
                    />
                    Mi jurisdicción
                    {(adminJurisdictions || []).length === 1
                      ? ` (${adminJurisdictions[0].name})`
                      : ''}
                  </label>
                )}
                <button
                  type="button"
                  className="btn-aplicar-filtros"
                  onClick={() => setMostrarFiltros(false)}
                >
                  Ver en el mapa
                </button>
              </div>
            </div>
          </div>
        )}

        {mostrarMisReportes && (
          <aside className="perdidas-panel-lateral ampliado mis-reportes-panel" aria-label="Mis reportes">
            <div className="panel-vecino-cabecera panel-radar-cabecera-ampliada">
              <button
                type="button"
                className="panel-radar-volver"
                onClick={() => {
                  setMostrarMisReportes(false);
                  setIdRegistroDestacado(null);
                  resetMisFiltros();
                }}
              >
                ← Volver al mapa
              </button>
              <h3>Mis reportes</h3>
              <span aria-hidden="true" />
            </div>

            <div className="panel-mis-tabs mis-reportes-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={misReportesSeccion === 'activos'}
                className={misReportesSeccion === 'activos' ? 'activo' : ''}
                onClick={() => {
                  setMisReportesSeccion('activos');
                  setMisPage(1);
                }}
              >
                Activos
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={misReportesSeccion === 'registro'}
                className={misReportesSeccion === 'registro' ? 'activo' : ''}
                onClick={() => {
                  setMisReportesSeccion('registro');
                  setMisPage(1);
                }}
              >
                Registro
              </button>
            </div>

            <div className="admin-dash-lista-wrap mis-reportes-lista-wrap">
              <header className="admin-dash-lista-cabecera">
                <div>
                  <h1>{misReportesSeccion === 'registro' ? 'Registro' : 'Activos'}</h1>
                  <p className="admin-dash-sub">
                    {cargandoMisLista
                      ? 'Cargando…'
                      : (misReportesSeccion === 'registro'
                        ? (misMeta.total
                          ? `${misMeta.total} caso${misMeta.total === 1 ? '' : 's'} cerrados, anulados o vencidos`
                          : 'Todavía no tenés casos en el registro')
                        : (misMeta.total
                          ? `${misMeta.total} caso${misMeta.total === 1 ? '' : 's'} activos`
                          : 'No tenés reportes activos con esta cuenta'))}
                  </p>
                </div>
                <div className="admin-dash-filtros">
                  <input
                    type="search"
                    placeholder={
                      misReportesSeccion === 'registro'
                        ? 'Buscar #caso, zona, objeto, motivo…'
                        : 'Buscar #caso…'
                    }
                    value={misBusqueda}
                    onChange={(e) => setMisBusqueda(e.target.value)}
                    aria-label="Buscar en mis reportes"
                  />
                  <select
                    value={
                      misReportesSeccion === 'registro'
                        ? misFiltroRegistroCategoria
                        : misFiltroCategoria
                    }
                    onChange={(e) => {
                      if (misReportesSeccion === 'registro') {
                        setMisFiltroRegistroCategoria(e.target.value);
                      } else {
                        setMisFiltroCategoria(e.target.value);
                      }
                    }}
                    aria-label="Categoría"
                  >
                    <option value="">
                      {misReportesSeccion === 'activos' ? 'Todos' : 'Todas las categorías'}
                    </option>
                    <option value="reparaciones">Reparaciones</option>
                    <option value="perros_gatos">Perros y gatos</option>
                    <option value="familias">Familias</option>
                    <option value="cosas_perdidas">Cosas perdidas</option>
                  </select>
                  {misReportesSeccion === 'activos' ? (
                    <select
                      value={misFiltroEstado}
                      onChange={(e) => setMisFiltroEstado(e.target.value)}
                      aria-label="Estado"
                    >
                      <option value="">Todos</option>
                      <option value="pendiente_aprobacion">En revisión</option>
                      <option value="pendiente">Publicado</option>
                      <option value="en_proceso">En atención</option>
                      <option value="pendiente_cierre">Cierre propuesto</option>
                    </select>
                  ) : (
                    <>
                      <select
                        value={misFiltroRegistroTipo}
                        onChange={(e) => setMisFiltroRegistroTipo(e.target.value)}
                        aria-label="Tipo de cierre"
                      >
                        <option value="">Todo tipo de cierre</option>
                        <option value="resuelto">Resuelto</option>
                        <option value="anulado">Anulado</option>
                        <option value="vencido">Vencido</option>
                        <option value="oficina">Oficina avisada</option>
                      </select>
                      <select
                        value={misFiltroRegistroPeriodo}
                        onChange={(e) => {
                          setMisFiltroRegistroPeriodo(e.target.value);
                          if (e.target.value !== 'personalizado') {
                            setMisFiltroRegistroDesde('');
                            setMisFiltroRegistroHasta('');
                          }
                        }}
                        aria-label="Período"
                      >
                        <option value="">Cualquier fecha</option>
                        <option value="7">Últimos 7 días</option>
                        <option value="30">Últimos 30 días</option>
                        <option value="90">Últimos 90 días</option>
                        <option value="personalizado">Personalizado</option>
                      </select>
                      {misFiltroRegistroPeriodo === 'personalizado' && (
                        <div className="admin-dash-fechas-rango" role="group" aria-label="Rango de fechas">
                          <label className="admin-dash-fecha">
                            <span>Desde</span>
                            <input
                              type="date"
                              value={misFiltroRegistroDesde}
                              max={misFiltroRegistroHasta || undefined}
                              onChange={(e) => setMisFiltroRegistroDesde(e.target.value)}
                              aria-label="Fecha desde"
                            />
                          </label>
                          <label className="admin-dash-fecha">
                            <span>Hasta</span>
                            <input
                              type="date"
                              value={misFiltroRegistroHasta}
                              min={misFiltroRegistroDesde || undefined}
                              onChange={(e) => setMisFiltroRegistroHasta(e.target.value)}
                              aria-label="Fecha hasta"
                            />
                          </label>
                        </div>
                      )}
                    </>
                  )}
                  {misReportesSeccion === 'activos' && (
                    <button
                      type="button"
                      className="admin-dash-btn"
                      onClick={verMisCasosEnElMapa}
                    >
                      Ver en el mapa
                    </button>
                  )}
                </div>
              </header>

              {cargandoMisLista ? (
                <p className="admin-dash-vacio">Cargando casos…</p>
              ) : misReportes.length === 0 ? (
                <p className="admin-dash-vacio">
                  {misReportesSeccion === 'registro'
                    ? 'No hay casos en el registro con esos filtros.'
                    : 'No hay casos activos con esos filtros.'}
                </p>
              ) : (
                <>
                  <ul className="admin-dash-lista admin-dash-tarjetas">
                    {misReportes.map((marker) => {
                      const categoria = esCasoFamilia(marker.category)
                        ? 'familias'
                        : (marker.category || 'reparaciones');
                      const labelsFamilias = {
                        violencia: 'Violencia en la casa',
                        hijos: 'Niños o adolescentes',
                        calle: 'Persona en situación de calle',
                      };
                      const subtipo = categoria === 'cosas_perdidas' && marker.perdidaTipo
                        ? (perdidaLabels[marker.perdidaTipo] || marker.perdidaTipo)
                        : categoria === 'perros_gatos' && ANIMAL_TIPOS[marker.animalTipo]
                          ? ANIMAL_TIPOS[marker.animalTipo]
                          : categoria === 'familias' && marker.familiasTipo
                            ? (labelsFamilias[marker.familiasTipo] || marker.familiasTipo)
                            : null;
                      const creado = marker.createdAt
                        ? new Date(marker.createdAt).toLocaleString('es-AR', {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        })
                        : (marker.date
                          ? `${marker.date}${marker.time ? ` · ${marker.time}` : ''}`
                          : null);
                      const foto = marker.imageUrl ? buildImageUrl(marker.imageUrl) : null;
                      const descripcion = (marker.description || '').trim();
                      const direccion = (marker.direccion || '').trim();
                      const enRegistro = Boolean(marker.eliminadoAt)
                        || marker.status === 'resuelto'
                        || marker.status === 'rechazado';
                      const vencida = esPublicacionVencida(marker);
                      const motivoBaja = String(marker.motivoEliminacion || '').toLowerCase();
                      const estadoTexto = enRegistro
                        ? (motivoBaja.includes('vencimiento') || vencida
                          ? 'Vencido'
                          : (marker.status === 'resuelto'
                            || motivoBaja.includes('resuelto')
                            || motivoBaja.includes('recuper')
                            || motivoBaja.includes('cierre del administrador')
                            ? 'Resuelto'
                            : 'Anulado'))
                        : etiquetaEstadoPopup(marker.status || 'pendiente', marker);
                      const claseEstado = enRegistro
                        ? (estadoTexto === 'Resuelto'
                          ? 'admin-dash-estado-resuelto'
                          : (estadoTexto === 'Vencido'
                            ? 'admin-dash-estado-vencido'
                            : 'admin-dash-estado-rechazado'))
                        : (marker.avisadoAt
                          ? 'admin-dash-estado-oficina_avisada'
                          : `admin-dash-estado-${marker.status || 'pendiente'}`);
                      const destacado = idRegistroDestacado
                        && String(marker._id) === String(idRegistroDestacado);
                      return (
                        <li key={marker._id} data-registro-id={marker._id}>
                          <div className={`tarjeta-mi-reporte-wrap${destacado ? ' tarjeta-mi-reporte-destacada' : ''}`}>
                            <button
                              type="button"
                              className={`tarjeta-mi-reporte admin-dash-tarjeta${destacado ? ' tarjeta-mi-reporte-sombra' : ''}`}
                              onClick={() => {
                                setIdRegistroDestacado(null);
                                irAMiReporte(marker);
                              }}
                            >
                              {foto ? (
                                <img
                                  src={foto}
                                  alt=""
                                  className="tarjeta-mi-reporte-foto"
                                />
                              ) : (
                                <span className="tarjeta-mi-reporte-sin-foto" aria-hidden="true">
                                  Sin foto
                                </span>
                              )}
                              <span className="tarjeta-mi-reporte-info">
                                <strong>Caso #{marker.caseId || '—'}</strong>
                                <span className="tarjeta-mi-reporte-meta">
                                  {`Categoría: ${categoryLabels[categoria] || categoria}${subtipo ? ` / ${subtipo}` : ''}`}
                                </span>
                                <span className={`admin-dash-estado ${claseEstado}`}>
                                  {estadoTexto}
                                </span>
                                {direccion && (
                                  <span className="tarjeta-mi-reporte-direccion">{direccion}</span>
                                )}
                                {descripcion && (
                                  <span className="tarjeta-mi-reporte-desc">{descripcion}</span>
                                )}
                                <small>
                                  {marker.jurisdictionName || 'Sin municipio'}
                                  {creado ? ` · ${creado}` : ''}
                                  {marker.eliminadoAt
                                    ? ` · Baja: ${new Date(marker.eliminadoAt).toLocaleDateString('es-AR')}`
                                    : ''}
                                </small>
                              </span>
                            </button>
                            {vencida && (
                              <button
                                type="button"
                                className="btn-renovar-publicacion"
                                disabled={renovandoId === marker._id}
                                onClick={() => renovarPublicacion(marker)}
                              >
                                {renovandoId === marker._id ? 'Renovando…' : 'Renovar 15 días'}
                              </button>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                  <div className="admin-dash-paginacion">
                    <button
                      type="button"
                      className="admin-dash-btn"
                      disabled={misPage <= 1 || cargandoMisLista}
                      onClick={() => cargarMisLista(misReportesSeccion, misPage - 1)}
                    >
                      Anterior
                    </button>
                    <span>Página {misPage} de {misTotalPaginas}</span>
                    <button
                      type="button"
                      className="admin-dash-btn"
                      disabled={!misMeta.hasMore || cargandoMisLista}
                      onClick={() => cargarMisLista(misReportesSeccion, misPage + 1)}
                    >
                      Siguiente
                    </button>
                  </div>
                </>
              )}
            </div>
          </aside>
        )}

        {mostrarCosasPerdidas && (
          <aside className={`perdidas-panel-lateral${radarVistaAmpliada ? ' ampliado' : ''}`} aria-label="Radar">
              {radarVistaAmpliada ? (
                <div className="panel-vecino-cabecera panel-radar-cabecera-ampliada">
                  <button
                    type="button"
                    className="panel-radar-volver"
                    onClick={() => {
                      setRadarVistaAmpliada(false);
                      setMisPage(1);
                      cargarPerdidasLista(
                        perdidasSeccion,
                        1,
                        perdidasSeccion === 'cerca' ? cercaOrigen : null,
                        radarModo,
                        animalFiltroRadar,
                        MIS_PAGE_SIZE
                      );
                    }}
                  >
                    ← Volver
                  </button>
                  <h3>
                    {perdidasSeccion === 'cerca'
                      ? (cercaOrigen === 'gps'
                        ? 'Cerca de mí'
                        : (cercaOrigen === 'vigilada'
                          ? 'Zona vigilada'
                          : 'Esta zona'))
                      : (radarModo === 'animales' ? 'Mis animales' : 'Mis cosas')}
                  </h3>
                  <button
                    type="button"
                    onClick={() => {
                      setRadarVistaAmpliada(false);
                      setMostrarCosasPerdidas(false);
                      setIdPerdidaDestacada(null);
                    }}
                  >
                    Cerrar
                  </button>
                </div>
              ) : (
                <div className="panel-vecino-cabecera">
                  <h3>
                    Radar
                    {perdidasNoLeidasLocal > 0 ? ` (${perdidasNoLeidasLocal})` : ''}
                  </h3>
                  <button
                    type="button"
                    onClick={() => {
                      setMostrarCosasPerdidas(false);
                      setIdPerdidaDestacada(null);
                    }}
                  >
                    Cerrar
                  </button>
                </div>
              )}
              {radarVistaAmpliada && perdidasSeccion === 'cerca' && (
                <p className="panel-radar-zona-meta">
                  {cercaOrigen === 'gps'
                    ? 'Avisos del radio azul (cerca de vos).'
                    : (cercaOrigen === 'vigilada'
                      ? 'Avisos del radio verde vigilado.'
                      : 'Avisos del radio naranja de esta zona.')}
                  {' '}
                  <strong>
                    {cercaRadioMetros < 1000
                      ? `${cercaRadioMetros} m`
                      : `${(cercaRadioMetros / 1000).toFixed(1)} km`}
                  </strong>
                  {radarModo === 'animales' ? ' · Animales' : ' · Cosas'}
                </p>
              )}
              {!radarVistaAmpliada && (
                <>
              {/* Radar = Cosas + Animales (reparaciones quedan en el mapa / Mis reportes) */}
              <div className="panel-mis-tabs panel-radar-modos" role="tablist" aria-label="Tipo de radar">
                <button
                  type="button"
                  role="tab"
                  aria-selected={radarModo === 'cosas'}
                  className={radarModo === 'cosas' ? 'activo' : ''}
                  onClick={() => {
                    setRadarModo('cosas');
                    setMisPage(1);
                  }}
                >
                  <span
                    className="leyenda-punto"
                    style={{ background: COLOR_PIN_CATEGORIA.cosas_perdidas }}
                    aria-hidden="true"
                  />
                  Cosas
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={radarModo === 'animales'}
                  className={radarModo === 'animales' ? 'activo' : ''}
                  onClick={() => {
                    setRadarModo('animales');
                    setMisPage(1);
                  }}
                >
                  <span
                    className="leyenda-punto"
                    style={{ background: COLOR_PIN_CATEGORIA.perros_gatos }}
                    aria-hidden="true"
                  />
                  Animales
                </button>
              </div>
              <div className="panel-mis-tabs" role="tablist" aria-label="Sección">
                <button
                  type="button"
                  role="tab"
                  aria-selected={perdidasSeccion === 'cerca'}
                  className={perdidasSeccion === 'cerca' ? 'activo' : ''}
                  onClick={() => {
                    setPerdidasSeccion('cerca');
                    setMisPage(1);
                    cargarPerdidasLista('cerca', 1);
                  }}
                >
                  Cerca
                  {radarBadgeCerca > 0 && perdidasSeccion !== 'cerca' && (
                    <em className="panel-tab-badge">{radarBadgeCerca > 9 ? '9+' : radarBadgeCerca}</em>
                  )}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={perdidasSeccion === 'activos'}
                  className={perdidasSeccion === 'activos' ? 'activo' : ''}
                  onClick={() => {
                    setPerdidasSeccion('activos');
                    setMisPage(1);
                    cargarPerdidasLista('activos', 1);
                  }}
                >
                  Míos
                  {radarBadgeMios > 0 && (
                    <em className="panel-tab-badge">{radarBadgeMios > 9 ? '9+' : radarBadgeMios}</em>
                  )}
                </button>
              </div>
              {radarModo === 'animales' && (
                <div className="panel-cerca-origen panel-radar-animal-filtros" role="group" aria-label="Tipo de animal">
                  {[
                    { value: 'todos', label: 'Todos' },
                    { value: 'perdido', label: 'Perdidos' },
                    { value: 'abandonado', label: 'Abandonados' },
                    { value: 'adopcion', label: 'Adopción' },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      className={animalFiltroRadar === opt.value ? 'activo' : ''}
                      onClick={() => {
                        setAnimalFiltroRadar(opt.value);
                        setMisPage(1);
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
              <label className="panel-radar-busqueda">
                <span className="sr-only">Buscar en avisos</span>
                <input
                  type="search"
                  value={radarBusqueda}
                  onChange={(e) => setRadarBusqueda(e.target.value)}
                  placeholder={radarModo === 'animales'
                    ? 'Buscar: perdido, calle, color…'
                    : 'Buscar: llaves, DNI, mochila…'}
                  aria-label="Buscar coincidencias en los avisos del Radar"
                  autoComplete="off"
                />
                {radarBusquedaActiva && (
                  <button
                    type="button"
                    className="panel-radar-busqueda-limpiar"
                    onClick={() => setRadarBusqueda('')}
                    aria-label="Limpiar búsqueda"
                  >
                    ×
                  </button>
                )}
              </label>
                </>
              )}
              {cargandoMisLista ? (
                <p className="panel-vecino-vacio">Cargando…</p>
              ) : perdidasLista.length === 0 ? (
                <p className="panel-vecino-vacio">
                  {perdidasSeccion === 'cerca'
                    ? (userLocation || mapCenter
                      ? (radarModo === 'animales'
                        ? 'No hay avisos de animales cerca de este punto.'
                        : 'No hay avisos de cosas perdidas cerca de este punto.')
                      : 'Activá la ubicación o mové el mapa para buscar.')
                    : (radarModo === 'animales'
                      ? 'No tenés avisos activos de animales.'
                      : 'No tenés avisos activos de cosas perdidas.')}
                </p>
              ) : perdidasListaFiltrada.length === 0 ? (
                <p className="panel-vecino-vacio">
                  Ningún aviso coincide con “{radarBusqueda.trim()}”. Probá otras palabras.
                </p>
              ) : (
                <>
                <p className="panel-mis-meta">
                  {radarBusquedaActiva
                    ? `${perdidasListaFiltradaFull.length} coincidencia${perdidasListaFiltradaFull.length === 1 ? '' : 's'} · página ${misPage} de ${perdidasTotalPaginas}`
                    : (perdidasSeccion === 'cerca'
                      ? `Mostrando ${perdidasListaFiltrada.length} de ${perdidasListaFiltradaFull.length} en el radio · página ${misPage} de ${perdidasTotalPaginas}`
                      : `Mostrando ${perdidasLista.length} de ${misMeta.total} · página ${misPage} de ${perdidasTotalPaginas}`)}
                </p>
                <ul className={`panel-vecino-lista panel-mis-reportes${radarVistaAmpliada ? ' panel-radar-lista-ampliada' : ''}`}>
                  {perdidasListaFiltrada.map((marker) => {
                    const esAnimal = marker.category === 'perros_gatos';
                    const tituloObjeto = (marker.objeto || '').trim()
                      || (esAnimal ? (ANIMAL_TIPOS[marker.animalTipo] || 'Animal') : '');
                    const subtipo = marker.perdidaTipo
                      ? (perdidaLabels[marker.perdidaTipo] || marker.perdidaTipo)
                      : (esAnimal && ANIMAL_TIPOS[marker.animalTipo]
                        ? ANIMAL_TIPOS[marker.animalTipo]
                        : null);
                    const creado = marker.createdAt
                      ? new Date(marker.createdAt).toLocaleString('es-AR', {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })
                      : (marker.date
                        ? `${marker.date}${marker.time ? ` · ${marker.time}` : ''}`
                        : null);
                    const foto = marker.imageUrl ? buildImageUrl(marker.imageUrl) : null;
                    const descripcion = (marker.description || '').trim();
                    const direccion = (marker.direccion || '').trim();
                    const enRegistro = Boolean(marker.eliminadoAt)
                      || marker.status === 'resuelto'
                      || marker.status === 'rechazado';
                    const vencida = esPublicacionVencida(marker);
                    const motivoBaja = String(marker.motivoEliminacion || '').toLowerCase();
                    const estadoTexto = enRegistro
                      ? (motivoBaja.includes('vencimiento') || vencida
                        ? 'Vencido'
                        : (marker.status === 'resuelto'
                          || motivoBaja.includes('resuelto')
                          || motivoBaja.includes('recuper')
                          ? 'Resuelto'
                          : 'Anulado'))
                      : etiquetaEstadoPopup(marker.status || 'pendiente', marker);
                    const soyDuenio = String(marker.createdBy || '').toLowerCase() === userId;
                    const { chat: chatSinLeer, cerca: cercaSinLeer } = resumenAvisosPerdida(marker._id);
                    const enCerca = perdidasSeccion === 'cerca';
                    const badgeChat = !enCerca && chatSinLeer > 0;
                    const badgeCercaNuevo = enCerca && cercaSinLeer > 0;
                    const tarjetaNueva = badgeChat || badgeCercaNuevo;
                    const destacado = idPerdidaDestacada
                      && String(marker._id) === String(idPerdidaDestacada);
                    const metros = Number(marker.distanciaMetros);
                    const esTuAviso = soyDuenio || (!enCerca && radarModo === 'animales');
                    const esTuReclamo = !soyDuenio && !enCerca && radarModo !== 'animales';
                    const etiquetaRol = soyDuenio
                      ? 'Tu aviso'
                      : (enCerca
                        ? (radarModo === 'animales'
                          ? (ANIMAL_TIPOS[marker.animalTipo] || 'Animales')
                          : 'Cosas perdidas')
                        : (radarModo === 'animales' ? 'Tu aviso' : 'Tu reclamo'));
                    const textoDistancia = Number.isFinite(metros)
                      ? (metros < 1000 ? `${Math.round(metros)} m` : `${(metros / 1000).toFixed(1)} km`)
                      : null;
                    const claseDistancia = !Number.isFinite(metros)
                      ? ''
                      : (metros <= 300
                        ? 'dist-muy-cerca'
                        : (metros <= 1000
                          ? 'dist-cerca'
                          : (metros <= 2500 ? 'dist-media' : 'dist-lejos')));
                    const claseRolTarjeta = esTuAviso
                      ? ' tarjeta-mi-reporte-propia'
                      : (esTuReclamo ? ' tarjeta-mi-reporte-reclamo' : '');
                    const claseTipoPerdida = enCerca && marker.perdidaTipo === 'perdi'
                      ? ' tarjeta-cerca-perdi'
                      : (enCerca && marker.perdidaTipo === 'encontre' ? ' tarjeta-cerca-encontre' : '');
                    const metaResto = [
                      (!enCerca || !marker.perdidaTipo) ? subtipo : null,
                      marker.caseId ? `#${marker.caseId}` : null,
                    ].filter(Boolean).join(' · ');
                    return (
                      <li key={marker._id} data-perdida-id={marker._id}>
                        <div className={`tarjeta-mi-reporte-wrap${destacado ? ' tarjeta-mi-reporte-destacada' : ''}`}>
                          <button
                            type="button"
                            className={`tarjeta-mi-reporte${claseRolTarjeta}${claseTipoPerdida}${destacado ? ' tarjeta-mi-reporte-sombra' : ''}${tarjetaNueva ? ' tarjeta-mi-reporte-nueva' : ''}${badgeCercaNuevo ? ' tarjeta-mi-reporte-cerca-nueva' : ''}`}
                            onClick={() => {
                              setIdPerdidaDestacada(null);
                              if (radarVistaAmpliada) {
                                setRadarVistaAmpliada(false);
                                cargarPerdidasLista(perdidasSeccion, 1, null, null, null, MIS_PAGE_SIZE);
                              }
                              // En Cerca solo chat si no es tuyo; los tuyos se ven en Míos
                              if (soyDuenio) {
                                irAMiReporte(marker);
                                return;
                              }
                              irAPerdida(marker, { abrirChat: badgeChat });
                            }}
                          >
                            {badgeChat && (
                              <span
                                className="tarjeta-mi-reporte-badge"
                                title={`${chatSinLeer} mensaje${chatSinLeer === 1 ? '' : 's'} o reclamo${chatSinLeer === 1 ? '' : 's'} sin leer`}
                              >
                                {chatSinLeer > 9 ? '9+' : chatSinLeer}
                                <em>chat</em>
                              </span>
                            )}
                            <span className="tarjeta-mi-reporte-media">
                              {badgeCercaNuevo && (
                                <span className="tarjeta-mi-reporte-badge-nuevo" title="Aviso nuevo cerca de vos">
                                  Nuevo
                                </span>
                              )}
                              {foto ? (
                                <img
                                  src={foto}
                                  alt=""
                                  className="tarjeta-mi-reporte-foto"
                                />
                              ) : (
                                <span className="tarjeta-mi-reporte-sin-foto" aria-hidden="true">
                                  Sin foto
                                </span>
                              )}
                            </span>
                            <span className="tarjeta-mi-reporte-info">
                              <strong className="tarjeta-mi-reporte-titulo-fila">
                                <span>
                                  {tituloObjeto || `Caso #${marker.caseId || '-'}`}
                                </span>
                                {textoDistancia && (
                                  <span className={`badge-distancia ${claseDistancia}`}>
                                    {textoDistancia}
                                  </span>
                                )}
                              </strong>
                              <span className="tarjeta-mi-reporte-meta">
                                {enCerca && marker.perdidaTipo ? (
                                  <>
                                    <em className={`etiqueta-perdida-tipo tipo-${marker.perdidaTipo}`}>
                                      {perdidaLabels[marker.perdidaTipo] || marker.perdidaTipo}
                                    </em>
                                    {marker.caseId ? (
                                      <span className="tarjeta-mi-reporte-meta-caso">#{marker.caseId}</span>
                                    ) : null}
                                  </>
                                ) : (esTuAviso || esTuReclamo) ? (
                                  <>
                                    <em className={`etiqueta-rol-radar${esTuAviso ? ' rol-aviso' : ' rol-reclamo'}`}>
                                      {etiquetaRol}
                                    </em>
                                    {metaResto ? ` · ${metaResto}` : ''}
                                  </>
                                ) : (
                                  tituloObjeto
                                    ? `${etiquetaRol}${subtipo ? ` · ${subtipo}` : ''} · #${marker.caseId || '-'}`
                                    : `${etiquetaRol}${subtipo ? ` · ${subtipo}` : ''}`
                                )}
                              </span>
                              {badgeChat && (
                                <span className="tarjeta-mi-reporte-actividad">
                                  {chatSinLeer === 1
                                    ? '1 mensaje o reclamo sin leer'
                                    : `${chatSinLeer} mensajes/reclamos sin leer`}
                                </span>
                              )}
                              <span
                                className="panel-vecino-estado"
                                style={getStatusBadgeStyle(
                                  vencida
                                    ? 'rechazado'
                                    : (enRegistro && marker.status !== 'rechazado' && marker.status !== 'resuelto'
                                      ? 'resuelto'
                                      : (marker.status || 'pendiente'))
                                )}
                              >
                                {vencida ? 'Vencido' : estadoTexto}
                              </span>
                              {direccion && (
                                <span className="tarjeta-mi-reporte-direccion">{direccion}</span>
                              )}
                              {descripcion && (
                                <span className="tarjeta-mi-reporte-desc">{descripcion}</span>
                              )}
                              <small>
                                {marker.jurisdictionName || 'Sin municipio'}
                                {creado ? ` · ${creado}` : ''}
                              </small>
                            </span>
                          </button>
                          {vencida && soyDuenio && (
                            <button
                              type="button"
                              className="btn-renovar-publicacion"
                              disabled={renovandoId === marker._id}
                              onClick={() => renovarPublicacion(marker)}
                            >
                              {renovandoId === marker._id ? 'Renovando…' : 'Renovar 15 días'}
                            </button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
                {!radarVistaAmpliada && (
                  <button
                    type="button"
                    className="panel-radar-ver-mas panel-radar-ver-mas-abajo"
                    onClick={() => {
                      // Amplía solo las publicaciones de la zona/sección activa (mismo radio y origen)
                      setRadarVistaAmpliada(true);
                      setMisPage(1);
                      const origen = perdidasSeccion === 'cerca' ? cercaOrigen : null;
                      cargarPerdidasLista(perdidasSeccion, 1, origen, radarModo, animalFiltroRadar, 50);
                    }}
                  >
                    {perdidasSeccion === 'cerca'
                      ? (cercaOrigen === 'gps'
                        ? 'Ver más cerca de mí'
                        : (cercaOrigen === 'vigilada'
                          ? 'Ver más de la zona vigilada'
                          : 'Ver más de esta zona'))
                      : 'Ver más'}
                  </button>
                )}
                {perdidasTotalPaginas > 1 && (
                  <div className="panel-mis-paginacion">
                    <button
                      type="button"
                      className="popup-btn-secundario"
                      disabled={misPage <= 1 || cargandoMisLista}
                      onClick={() => {
                        if (perdidasSeccion === 'cerca') {
                          setMisPage((p) => Math.max(1, p - 1));
                          return;
                        }
                        cargarPerdidasLista(
                          perdidasSeccion,
                          misPage - 1,
                          null,
                          radarModo,
                          animalFiltroRadar,
                          radarVistaAmpliada ? 50 : MIS_PAGE_SIZE
                        );
                      }}
                    >
                      Anterior
                    </button>
                    <span>{misPage} / {perdidasTotalPaginas}</span>
                    <button
                      type="button"
                      className="popup-btn-secundario"
                      disabled={
                        cargandoMisLista
                        || (perdidasSeccion === 'cerca'
                          ? misPage >= perdidasTotalPaginas
                          : !misMeta.hasMore)
                      }
                      onClick={() => {
                        if (perdidasSeccion === 'cerca') {
                          setMisPage((p) => Math.min(perdidasTotalPaginas, p + 1));
                          return;
                        }
                        cargarPerdidasLista(
                          perdidasSeccion,
                          misPage + 1,
                          null,
                          radarModo,
                          animalFiltroRadar,
                          radarVistaAmpliada ? 50 : MIS_PAGE_SIZE
                        );
                      }}
                    >
                      Siguiente
                    </button>
                  </div>
                )}
                </>
              )}
          </aside>
        )}

        {mostrarNotificaciones && (
          <div className="panel-vecino-fondo" onClick={() => setMostrarNotificaciones(false)}>
            <div className="panel-vecino" onClick={(event) => event.stopPropagation()}>
              <div className="panel-vecino-cabecera">
                <h3>Notificaciones {noLeidasLocal > 0 ? `(${noLeidasLocal})` : ''}</h3>
                <button type="button" onClick={() => setMostrarNotificaciones(false)}>Cerrar</button>
              </div>
              {noLeidasLocal > 0 && (
                <button type="button" className="panel-vecino-leer-todas" onClick={marcarTodasLeidas}>
                  Marcar todas como leídas
                </button>
              )}
              {notificaciones.length === 0 ? (
                <p className="panel-vecino-vacio">No tenés avisos todavía.</p>
              ) : (
                <ul className="panel-vecino-lista">
                  {notificaciones.map((aviso) => (
                    <li key={aviso._id}>
                      <button
                        type="button"
                        className={aviso.leida ? '' : 'aviso-nuevo'}
                        onClick={() => abrirDesdeNotificacion(aviso)}
                      >
                        <strong>{aviso.mensaje}</strong>
                        {notifApuntaAlRegistro(aviso) && (
                          <em className="aviso-ir-registro">
                            {typeof onAbrirCasoAdmin === 'function'
                              ? 'Ver en el registro del municipio'
                              : 'Ver en el registro'}
                          </em>
                        )}
                        <small>
                          {aviso.createdAt
                            ? new Date(aviso.createdAt).toLocaleString('es-AR', {
                              dateStyle: 'short',
                              timeStyle: 'short',
                            })
                            : ''}
                        </small>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {avisoVecino && (
          <div
            className={`aviso-vecino${avisoEsAlerta ? ' aviso-vecino-alerta' : ''}`}
            role="status"
          >
            <span>{avisoVecino}</span>
            <div className="aviso-vecino-acciones">
              {avisoAccion?.label && (
                <button
                  type="button"
                  className="aviso-vecino-accion"
                  onClick={() => {
                    const fn = avisoAccion.onClick;
                    if (typeof fn === 'function') fn();
                  }}
                >
                  {avisoAccion.label}
                </button>
              )}
              <button type="button" onClick={cerrarAvisoVecino}>
                Cerrar
              </button>
            </div>
          </div>
        )}

        {confirmarRecupero && (
          <div
            className="popup-resolucion-modal-fondo"
            role="dialog"
            aria-modal="true"
            aria-label="Confirmar recuperación"
            onClick={() => {
              if (!confirmandoRecupero) setConfirmarRecupero(false);
            }}
          >
            <div
              className="popup-resolucion-modal"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="popup-resolucion-modal-cabecera">
                <strong>¿Ya lo recuperaste?</strong>
              </div>
              <p className="popup-resolucion-modal-desc">
                Si confirmás, el caso se cierra, sale del mapa y pasa al registro.
              </p>
              <div className="popup-confirm-acciones">
                <button
                  type="button"
                  className="popup-btn-secundario"
                  disabled={confirmandoRecupero}
                  onClick={() => setConfirmarRecupero(false)}
                >
                  Volver
                </button>
                <button
                  type="button"
                  className="popup-btn-exito"
                  disabled={confirmandoRecupero}
                  onClick={handleResolverPerdida}
                >
                  {confirmandoRecupero ? 'Cerrando…' : 'Sí, ya lo recuperé'}
                </button>
              </div>
            </div>
          </div>
        )}

        {mostrarChatReclamo && editMode && (
          <div className="chat-reclamo-fondo" onClick={() => setMostrarChatReclamo(false)}>
            <div className="chat-reclamo-modal" onClick={(event) => event.stopPropagation()}>
              <ChatReclamo
                markerId={editMode}
                caseId={formData.caseId}
                userId={userId}
                soloLectura={
                  formData.status === 'resuelto'
                  || formData.status === 'rechazado'
                  || !!formData.eliminadoAt
                }
                onCerrar={() => setMostrarChatReclamo(false)}
                onChatAbierto={() => {
                  setFormData((prev) => (
                    prev.chatAbiertoPorMi ? prev : { ...prev, chatAbiertoPorMi: true }
                  ));
                  setMarkers((prev) => prev.map((m) => (
                    String(m._id) === String(editMode)
                      ? { ...m, chatAbiertoPorMi: true }
                      : m
                  )));
                }}
              />
            </div>
          </div>
        )}

        {mostrarCamara && (
          <CamaraEnVivo
            onCancelar={() => setMostrarCamara(false)}
            onCapturar={(dataUrl) => {
              setMostrarCamara(false);
              abrirEditorConSrc(dataUrl, editorDestino);
            }}
          />
        )}

        {editorImagenSrc && (
          <EditorImagen
            imagenSrc={editorImagenSrc}
            onCancelar={() => setEditorImagenSrc(null)}
            onConfirmar={confirmarFotoEditada}
          />
        )}
      </div>
    );
  };

  if (loadError) {
    return <div>Error al cargar Google Maps</div>;
  }

  return isLoaded ? renderMap() : <div>Cargando Mapa...</div>;
};

// const AdvancedMarker = (props) => { // Componente AdvancedMarker eliminado
//   const { map, position, onClick } = props;

//   useEffect(() => {
//     if (map && window.google.maps.marker) {
//       const newMarker = new window.google.maps.marker.AdvancedMarkerElement({
//         map,
//         position: position,
//       });

//       newMarker.addListener('click', onClick);
//       return () => {
//         newMarker.setMap(null);
//       };
//     }
//   }, [map, position, onClick]);

//   return null;
// };

export default MapComponent;
