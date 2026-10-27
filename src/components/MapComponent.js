import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { GoogleMap, useJsApiLoader, Marker, OverlayView } from '@react-google-maps/api';
import { useDropzone } from 'react-dropzone';
import axios from 'axios';
import marcadorCiudad from '../assets/marcador-ciudadar.svg';
import marcadorCiudadLuz from '../assets/marcador-ciudadar-luz.svg';
import BuscadorDireccion from './BuscadorDireccion';

const ANCHO_PIN = 30;
const ALTO_PIN = ANCHO_PIN * (88 / 64);
const PUNTA_PIN_Y = ALTO_PIN * (82.6 / 88);
const ANCHO_LUZ = ANCHO_PIN * (112 / 64);
const ALTO_LUZ = ANCHO_LUZ * (120 / 112);
const PUNTA_LUZ_X = ANCHO_LUZ * (56 / 112);
const PUNTA_LUZ_Y = ALTO_LUZ * (98.6 / 120);

const iconoReporte = () => ({
  url: marcadorCiudad,
  scaledSize: new window.google.maps.Size(ANCHO_PIN, ALTO_PIN),
  anchor: new window.google.maps.Point(ANCHO_PIN / 2, PUNTA_PIN_Y),
});

// const libraries = ['marker']; // Eliminado
const mapLibraries = ['visualization', 'places'];
const RADIO_MISMO_CASO_METROS = 50;

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
    const timer = setTimeout(() => terminar(''), 1200);
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

  // Backend proxy (Photon/Nominatim): evita CORS y rate-limit del navegador
  let texto = await obtenerDireccionDesdeBackend(lat, lng);

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

  if (!texto) {
    texto = await obtenerDireccionGoogle(lat, lng);
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

function MapComponent({
  googleMapsApiKey,
  currentUser,
  panelVecino = null,
  onPanelVecinoVisto,
  onNoLeidasChange,
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
    resolvedAt: null,
  });
  const [showPopup, setShowPopup] = useState(false);
  const [editMode, setEditMode] = useState(null); // Estado para el modo de edición
  const [userLocation, setUserLocation] = useState(null); // Punto azul: dónde está la persona
  const [mapCenter, setMapCenter] = useState({ lat: -26.8084602, lng: -65.2175701 });
  const [direccionPreview, setDireccionPreview] = useState('');
  const [pinMoviendo, setPinMoviendo] = useState(false);
  const yaCentroUsuario = useRef(false);
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
  const statusOptions = ['pendiente_aprobacion', 'pendiente', 'en_proceso', 'resuelto'];
  const categoryOptions = [
    { value: 'familias', label: 'Familias' },
    { value: 'perros_gatos', label: 'Perros y gatos' },
    { value: 'reparaciones', label: 'Reparaciones' },
  ];
  const [highlightedMarkerId, setHighlightedMarkerId] = useState(null);
  const [deletedMarker, setDeletedMarker] = useState(null); // Caso eliminado temporalmente para poder deshacer
  const [deleteCountdown, setDeleteCountdown] = useState(10); // Contador de segundos para eliminar
  const [resolutionPhoto, setResolutionPhoto] = useState(null);
  const [resolutionPreview, setResolutionPreview] = useState(null);
  const [resolutionDescription, setResolutionDescription] = useState('');
  const [mostrarResolucion, setMostrarResolucion] = useState(false);
  const [editandoResolucion, setEditandoResolucion] = useState(false);
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
  const [soloMisReportes, setSoloMisReportes] = useState(false);
  const [mostrarMisReportes, setMostrarMisReportes] = useState(false);
  const [mostrarFiltros, setMostrarFiltros] = useState(false);
  const [mostrarNotificaciones, setMostrarNotificaciones] = useState(false);
  const [notificaciones, setNotificaciones] = useState([]);
  const [noLeidasLocal, setNoLeidasLocal] = useState(0);

  const avisoTimerRef = useRef(null);
  const mostrarAviso = (texto, alerta = false) => {
    if (avisoTimerRef.current) clearTimeout(avisoTimerRef.current);
    setAvisoEsAlerta(alerta);
    setAvisoVecino(texto);
    if (!alerta) {
      avisoTimerRef.current = setTimeout(() => {
        setAvisoVecino('');
        setAvisoEsAlerta(false);
      }, 3500);
    }
  };
  const [avisando, setAvisando] = useState(null);
  const ignorarCercanosRef = useRef(false);
  const [estadosPendientes, setEstadosPendientes] = useState({});
  const [guardandoEstado, setGuardandoEstado] = useState(null);
  const deleteTimeoutRef = useRef(null); // Referencia al timeout de eliminación
  const countdownIntervalRef = useRef(null); // Referencia al intervalo del contador
  const idsEnBorradoRef = useRef(new Set());
  const statusLabels = {
    pendiente_aprobacion: 'Por aprobar',
    pendiente: 'Publicado',
    en_proceso: 'En proceso',
    resuelto: 'Resuelto',
  };
  const statusBadgeColors = {
    pendiente_aprobacion: { bg: '#fef3c7', color: '#92400e' },
    pendiente: { bg: '#dbeafe', color: '#1e40af' },
    en_proceso: { bg: '#bfdbfe', color: '#1e3a8a' },
    resuelto: { bg: '#dcfce7', color: '#166534' },
  };
  const categoryLabels = useMemo(
    () => ({
      familias: 'Familias',
      persona: 'Persona en situación de calle',
      perros_gatos: 'Perros y gatos',
      reparaciones: 'Reparaciones',
    }),
    []
  );
const TEN_DAYS_MS = 10 * 24 * 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

const getStatusBadgeStyle = (status) => {
  const paleta = statusBadgeColors[status] || { bg: '#e5e7eb', color: '#1f2937' };
  return {
    background: paleta.bg,
    color: paleta.color,
    padding: '4px 10px',
    borderRadius: '999px',
    fontSize: '12px',
    fontWeight: 700,
    display: 'inline-block',
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

const getDaysUntilPetExpiry = (dateString) => getDaysUntil(dateString, THIRTY_DAYS_MS);
  const normalizeCategoryValue = useCallback(
    (value) => {
      if (!value) return 'persona';
      const normalized = String(value).trim().toLowerCase();
      if (categoryLabels[normalized]) return normalized;
      if (normalized.includes('familia')) return 'familias';
      if (normalized.includes('perro') || normalized.includes('gato')) return 'perros_gatos';
      if (normalized.includes('repar')) return 'reparaciones';
      if (normalized.includes('persona')) return 'persona';
      return 'persona';
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
        setFormData({
          ...formData,
      category: normalizeCategoryValue(e.target.value),
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

    const handleSuccess = (position) => {
      const { latitude, longitude } = position.coords;
      const current = { lat: latitude, lng: longitude };
      setUserLocation(current);
      if (!yaCentroUsuario.current) {
        yaCentroUsuario.current = true;
        setMapCenter(current);
      }
    };

    const handleError = (error) => {
        let errorMessage = '';
        switch (error.code) {
          case error.PERMISSION_DENIED:
          errorMessage = 'Permiso de ubicación denegado. Por favor, habilítalo.';
            break;
          case error.POSITION_UNAVAILABLE:
          errorMessage = 'Ubicación no disponible. Intenta más tarde.';
            break;
          case error.TIMEOUT:
          errorMessage = 'La solicitud de ubicación expiró. Intenta de nuevo.';
            break;
          default:
          errorMessage = 'Error desconocido al obtener la ubicación.';
        }
        console.error('Error getting user location:', error);
        setGeoError(errorMessage);
    };

    navigator.geolocation.getCurrentPosition(handleSuccess, handleError, {
      enableHighAccuracy: true,
    });

    const watchId = navigator.geolocation.watchPosition(handleSuccess, handleError, {
      enableHighAccuracy: true,
    });

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, []);

  const cargarNotificaciones = useCallback(async () => {
    if (!userId || userId === 'anonimo') {
      setNotificaciones([]);
      setNoLeidasLocal(0);
      if (onNoLeidasChange) onNoLeidasChange(0);
      return;
    }
    try {
      const respuesta = await axios.get('http://localhost:5001/api/notificaciones', {
        headers: { 'x-user-id': userId },
      });
      setNotificaciones(respuesta.data.notificaciones || []);
      const cantidad = respuesta.data.noLeidas || 0;
      setNoLeidasLocal(cantidad);
      if (onNoLeidasChange) onNoLeidasChange(cantidad);
    } catch (error) {
      console.error('Error cargando notificaciones:', error);
    }
  }, [userId, onNoLeidasChange]);

  useEffect(() => {
    if (!panelVecino) return;
    if (panelVecino === 'mis-reportes') {
      setMostrarNotificaciones(false);
      setMostrarFiltros(false);
      setMostrarMisReportes(true);
    }
    if (panelVecino === 'filtros') {
      setMostrarNotificaciones(false);
      setMostrarMisReportes(false);
      setMostrarFiltros(true);
    }
    if (panelVecino === 'notificaciones') {
      setMostrarMisReportes(false);
      setMostrarFiltros(false);
      setMostrarNotificaciones(true);
      cargarNotificaciones();
    }
    if (onPanelVecinoVisto) onPanelVecinoVisto();
  }, [panelVecino, onPanelVecinoVisto, cargarNotificaciones]);

  useEffect(() => {
    cargarNotificaciones();
    if (!userId || userId === 'anonimo') return undefined;
    const timer = setInterval(cargarNotificaciones, 15000);
    return () => clearInterval(timer);
  }, [cargarNotificaciones, userId]);

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

  // Cargar marcadores al inicio y refrescar para que el vecino vea cuando ya avisaron
  useEffect(() => {
    let cancelado = false;
    const fetchMarkers = async () => {
      try {
        const response = await axios.get('http://localhost:5001/api/markers', {
          headers: {
            'x-user-id': userId,
          },
        });
        if (cancelado) return;
        const ocultos = idsEnBorradoRef.current;
        const savedMarkers = response.data
        .filter((marker) => !ocultos.has(String(marker._id)))
        .map(marker => ({
          ...marker,
          isSaved: true,
          category: normalizeCategoryValue(marker.category),
          status: marker.status || 'pendiente',
          resolvedAt: marker.resolvedAt || null,
          caseId: marker.caseId || null,
          resolvedBy: marker.resolvedBy || null,
          resolvedByReportedAt: marker.resolvedByReportedAt || null,
          createdBy: marker.createdBy
            ? String(marker.createdBy).trim().toLowerCase()
            : 'anonimo',
        }));
        setMarkers(savedMarkers);
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
  }, [normalizeCategoryValue, userId]);

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

  // Función para manejar la carga de imágenes y datos adicionales
  const onDrop = async (acceptedFiles) => {
    const file = acceptedFiles[0];
    const reader = new FileReader();

    reader.onload = function () {
      setSelectedImage(reader.result);
    };

    reader.readAsDataURL(file);

    setFormData({
      ...formData,
      image: file,
    });
    setIsImageZoomed(false);
  };

  const quitarImagen = () => {
    setSelectedImage(null);
    setIsImageZoomed(false);
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

  // Configuración del Dropzone
  const { getRootProps, getInputProps, open } = useDropzone({
    onDrop,
    noClick: true,
    noKeyboard: true,
  });

  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey,
    language: 'es',
    region: 'AR',
    libraries: mapLibraries,
    // mapIds: ['7f9f71bb3b378371fcb70fd1'], // ID de mapa eliminado
  });

  const mapRef = useRef(null);
  const idleListenerRef = useRef(null);
  const dragStartListenerRef = useRef(null);
  const dragEndListenerRef = useRef(null);
  const geocodeSeqRef = useRef(0);

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
        setDireccionPreview(texto);
        return;
      }
      setDireccionPreview((prev) => (
        prev === 'Buscando dirección...' ? '' : prev
      ));
    });
  }, []);

  const onMapLoad = useCallback((map) => {
    mapRef.current = map;
    if (idleListenerRef.current) {
      window.google.maps.event.removeListener(idleListenerRef.current);
    }
    if (dragStartListenerRef.current) {
      window.google.maps.event.removeListener(dragStartListenerRef.current);
    }
    if (dragEndListenerRef.current) {
      window.google.maps.event.removeListener(dragEndListenerRef.current);
    }
    dragStartListenerRef.current = map.addListener('dragstart', () => {
      bloquearAutoDireccionRef.current = false;
      if (!showPopupRef.current) setPinMoviendo(true);
    });
    dragEndListenerRef.current = map.addListener('dragend', () => {
      setPinMoviendo(false);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(() => actualizarDireccionDelPin(true), 450);
    });
    idleListenerRef.current = map.addListener('idle', () => {
      setPinMoviendo(false);
      if (showPopupRef.current || omitirIdleRef.current || bloquearAutoDireccionRef.current || !mapRef.current) return;
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(() => {
        actualizarDireccionDelPin(true);
      }, 500);
    });
    setTimeout(() => actualizarDireccionDelPin(true), 600);
  }, [actualizarDireccionDelPin]);

  useEffect(() => {
    return () => {
      if (idleListenerRef.current) {
        window.google.maps.event.removeListener(idleListenerRef.current);
      }
      if (dragStartListenerRef.current) {
        window.google.maps.event.removeListener(dragStartListenerRef.current);
      }
      if (dragEndListenerRef.current) {
        window.google.maps.event.removeListener(dragEndListenerRef.current);
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
      resolvedAt: null,
    });
    setSelectedImage(null);
    setIsImageZoomed(false);
    setShowPopup(true);
    setEditMode(null);
    setCanEdit(true);
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
    obtenerDireccionDesdePunto(userLocation.lat, userLocation.lng).then((texto) => {
      setDireccionPreview(texto);
      omitirIdleRef.current = false;
    });
  }, [userLocation]);

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
      status: marker.status || 'pendiente',
      resolvedAt: marker.resolvedAt || null,
      caseId: marker.caseId || null,
      resolvedBy: marker.resolvedBy || null,
      resolvedByReportedAt: marker.resolvedByReportedAt || null,
      jurisdictionName: marker.jurisdictionName || null,
      resolutionDescription: marker.resolutionDescription || '',
      resolutionImageUrl: marker.resolutionImageUrl || null,
      createdAt: marker.createdAt || null,
      neighborCount: marker.neighborCount || 1,
      avisadoAt: marker.avisadoAt || null,
    });
    setResolutionPhoto(null);
    setResolutionPreview(null);
    setResolutionDescription('');
    setEditandoResolucion(false);
    setMostrarResolucion(false);
    setSelectedImage(marker.imageUrl ? buildImageUrl(marker.imageUrl) : null); // Mostrar imagen existente
    setIsImageZoomed(false);
    setShowPopup(true);
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
    if (mapRef.current) {
      mapRef.current.panTo({ lat: marker.lat, lng: marker.lng });
      mapRef.current.setZoom(18);
    }
    setHighlightedMarkerId(marker._id);
  }, [userId, normalizeCategoryValue, buildImageUrl]);

  // Función para enviar los datos del formulario al servidor
  const handleSubmit = async (e) => {
    e.preventDefault();

    const { image, date, time, description, category, status, familiasTipo, animalTipo } = formData;
    if (!image) {
      mostrarAviso('Para subir el reporte tenés que agregar una foto.', true);
      return;
    }
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
    formDataToSend.append('date', date);
    formDataToSend.append('time', time);
    formDataToSend.append('description', description);
    formDataToSend.append('direccion', String(direccion || '').trim());
    formDataToSend.append('category', category);
    formDataToSend.append('familiasTipo', category === 'familias' ? familiasTipo : '');
    formDataToSend.append('animalTipo', category === 'perros_gatos' ? animalTipo : '');
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
        status: newMarker.status || 'pendiente_aprobacion',
        resolvedAt: newMarker.resolvedAt || null,
        caseId: newMarker.caseId || null,
        resolvedBy: newMarker.resolvedBy || null,
        resolvedByReportedAt: newMarker.resolvedByReportedAt || null,
        jurisdictionName: newMarker.jurisdictionName || null,
        createdAt: newMarker.createdAt || null,
      });
      setSelectedImage(newMarker.imageUrl ? buildImageUrl(newMarker.imageUrl) : null);
      setIsImageZoomed(false);
      setCanEdit(true); // El creador puede editar su propio marcador
      setShowDeleteOnly(false);
      // El popup permanece abierto para mostrar el estado "pendiente_aprobacion"
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

    const { lat, lng, image, date, time, description, direccion, category, status, familiasTipo, animalTipo } = formData;
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
    setMostrarNotificaciones(false);
    setMapCenter({ lat: Number(marker.lat), lng: Number(marker.lng) });
    if (mapRef.current) {
      mapRef.current.panTo({ lat: Number(marker.lat), lng: Number(marker.lng) });
      mapRef.current.setZoom(18);
    }
    handleMarkerClick(marker);
  }, [handleMarkerClick]);

  const verMisCasosEnElMapa = () => {
    setMostrarMisReportes(false);
    setSoloMisReportes(true);
  };

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
        setNoLeidasLocal((prev) => {
          const siguiente = Math.max(0, prev - 1);
          if (onNoLeidasChange) onNoLeidasChange(siguiente);
          return siguiente;
        });
      }
    } catch (error) {
      console.error('Error marcando aviso como leído:', error);
    }
    const marker = markers.find((item) =>
      String(item._id) === String(aviso.markerId)
      || (aviso.caseId && Number(item.caseId) === Number(aviso.caseId))
    );
    if (marker) {
      irAMiReporte(marker);
    } else {
      setMostrarNotificaciones(false);
      mostrarAviso('Ese reporte ya no está disponible en el mapa.', true);
    }
  }, [userId, markers, irAMiReporte, onNoLeidasChange]);

  const marcarTodasLeidas = async () => {
    try {
      await axios.patch(
        'http://localhost:5001/api/notificaciones/leer-todas',
        {},
        { headers: { 'x-user-id': userId } }
      );
      setNotificaciones((prev) => prev.map((item) => ({ ...item, leida: true })));
      setNoLeidasLocal(0);
      if (onNoLeidasChange) onNoLeidasChange(0);
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
      </>
    );
  };

  // Función para manejar la cancelación del formulario
  const handleCancel = () => {
    setFormData({
      lat: 0,
      lng: 0,
      image: null,
      date: '',
      time: '',
      description: '',
      direccion: '',
      status: 'pendiente_aprobacion',
      familiasTipo: '',
      animalTipo: '',
      resolvedAt: null,
    });
    setSelectedImage(null);
    setResolutionPhoto(null);
    setResolutionPreview(null);
    setMostrarResolucion(false);
    setMostrarCercanos(false);
    setCasosCercanos([]);
    setIsImageZoomed(false);
    setShowPopup(false);
    setEditMode(null); // Salir del modo de edición
    setShowDeleteOnly(false);
  };

  const handleImageClick = () => {
    // Alternar entre tamaño normal y ampliado al hacer clic en la imagen
    setIsImageZoomed((prev) => !prev);
  };

  const handleViewOnMap = () => {
    if (mapRef.current && formData.lat && formData.lng && editMode) {
      const target = { lat: formData.lat, lng: formData.lng };
      mapRef.current.panTo(target);
      mapRef.current.setZoom(18);
      setHighlightedMarkerId(editMode);
      setIsImageZoomed(false);
      setShowPopup(false);
      window.scrollTo({
        top: 0,
        behavior: 'smooth',
      });
    }
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
        zoomControl: true,
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
      return true; // Mostrar siempre: persona, perros_gatos, reparaciones
    });
    
    const visibleMarkers = markers.filter(marker => {
      // Filtro de aprobación: usuarios normales solo ven sus propios marcadores pendientes de aprobación
      if (!isAdmin && marker.status === 'pendiente_aprobacion') {
        const markerOwner = marker.createdBy
          ? String(marker.createdBy).trim().toLowerCase()
          : 'anonimo';
        // Solo mostrar si el usuario es el creador del marcador pendiente
        if (markerOwner !== userId) {
          return false; // Ocultar marcadores pendientes de aprobación de otros usuarios
        }
        // Si es el creador, permitir que vea su marcador pendiente en el mapa
      }
      
      // Familias y personas en situación de calle: solo el creador las ve en el mapa
      if (!isAdmin && (marker.category === 'familias' || marker.category === 'persona')) {
        const markerOwner = marker.createdBy
          ? String(marker.createdBy).trim().toLowerCase()
          : 'anonimo';
        if (markerOwner !== userId) {
          return false; // Ocultar marcadores de "familias" de otros usuarios
        }
      }
      
      const markerOwner = marker.createdBy
        ? String(marker.createdBy).trim().toLowerCase()
        : 'anonimo';
      if (soloMisReportes && markerOwner !== userId) {
        return false;
      }

      const categoria = esCasoFamilia(marker.category) ? 'familias' : (marker.category || 'reparaciones');
      const matchesCategory = categoryFilter === 'todas' || categoria === categoryFilter;
      const matchesAnimal = categoryFilter !== 'perros_gatos'
        || animalFilter === 'todos'
        || marker.animalTipo === animalFilter;
      return matchesCategory && matchesAnimal;
    });
    const misReportes = markers
      .filter((marker) => {
        const markerOwner = marker.createdBy
          ? String(marker.createdBy).trim().toLowerCase()
          : 'anonimo';
        return markerOwner === userId;
      })
      .sort((a, b) => Number(b.caseId || 0) - Number(a.caseId || 0));
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
    const statusLabel = statusLabels[currentStatus] || currentStatus;
    const renderStatusInfo = (withLabel = true) => {
      if (esCasoFamilia(formData.category) && !isAdmin) {
        if (!editMode) return null;
        const avisado = formData.avisadoAt
          ? new Date(formData.avisadoAt).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })
          : null;
        return (
          <div className={`familias-aviso-vecino${avisado ? ' listo' : ''}`}>
            <p>
              {avisado
                ? 'El administrador ya contactó a la oficina correspondiente. Este aviso es anónimo: tu nombre no se muestra en el mapa.'
                : 'Tu aviso ya llegó al administrador. Cuando contacte a la oficina, vas a ver la confirmación acá. Este aviso es anónimo: tu nombre no se muestra en el mapa.'}
            </p>
            {avisado && <small>{avisado}</small>}
          </div>
        );
      }
      const petStillOpen = formData.category === 'perros_gatos' && currentStatus !== 'resuelto';
      const daysLeft =
        currentStatus === 'resuelto' && formData.resolvedAt
          ? getDaysUntilRemoval(formData.resolvedAt)
          : petStillOpen
            ? getDaysUntilPetExpiry(formData.createdAt)
            : null;
      // Solo después de subir: en el formulario nuevo todavía no hay reporte.
      if (!editMode) return null;
      const isPendingApproval = currentStatus === 'pendiente_aprobacion';
    return (
        <div style={{ marginTop: '4px' }}>
          {withLabel && <label>Estado:</label>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={statusBadgeStyle}>{statusLabel}</span>
              {daysLeft !== null && (
                <small style={{ color: '#2563eb' }}>
                  {petStillOpen
                    ? `Si sigue abierto, se elimina en ${daysLeft} ${daysLeft === 1 ? 'día' : 'días'}.`
                    : `Se eliminará en ${daysLeft} ${daysLeft === 1 ? 'día' : 'días'}.`}
                </small>
              )}
            </div>
            {isPendingApproval && !isAdmin && !esCasoFamilia(formData.category) && (
              <small style={{ color: '#f59e0b', fontStyle: 'italic' }}>
                Tu reporte está esperando la aprobación de un administrador. Aparecerá en el mapa una vez aprobado.
              </small>
            )}
            {formData.category === 'perros_gatos' && formData.animalTipo === 'abandonado' && !isAdmin && editMode && (
              <small className={formData.avisadoAt ? 'familias-aviso-vecino listo' : 'familias-nota'}>
                {formData.avisadoAt
                  ? `El administrador ya avisó al área de animales. ${new Date(formData.avisadoAt).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}`
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
      if (!file) {
        setResolutionPhoto(null);
        setResolutionPreview(null);
        return;
      }
      if (!file.type.startsWith('image/')) {
        alert('La foto tiene que ser una imagen.');
        event.target.value = '';
        return;
      }
      setResolutionPhoto(file);
      setResolutionPreview(URL.createObjectURL(file));
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
    const renderResolucionVecino = () => {
      if (isAdmin) return null;
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
            <label className="resolucion-foto">
              {editandoResolucion ? 'Foto de cómo quedó (opcional si ya hay una)' : 'Foto de cómo quedó (obligatoria)'}
              <input
                type="file"
                accept="image/*"
                onChange={handleResolutionPhoto}
              />
            </label>
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
            <div style={{ marginTop: '8px', padding: '8px', background: '#dcfce7', borderRadius: '6px' }}>
              <small style={{ color: '#166534' }}>
                ✅ Este caso ya fue reportado como resuelto por: {formData.resolvedBy}
                {formData.resolvedByReportedAt && (
                  <span> el {new Date(formData.resolvedByReportedAt).toLocaleDateString()}</span>
                )}
              </small>
              {formData.resolutionDescription && (
                <p style={{ margin: '8px 0 0', color: '#166534', fontSize: '13px' }}>
                  <strong>Qué hizo:</strong> {formData.resolutionDescription}
                </p>
              )}
              {formData.resolutionImageUrl && (
                <img
                  src={buildImageUrl(formData.resolutionImageUrl)}
                  alt="Foto de la resolución"
                  style={{ width: '100%', maxHeight: '160px', objectFit: 'cover', borderRadius: '6px', marginTop: '8px' }}
                />
              )}
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

    const mostrarSelectorPunto = !showPopup && !mostrarCercanos && !mostrarMisReportes
      && !mostrarFiltros && !mostrarNotificaciones;

    return (
      <div className="mapa-envoltorio">
        {(soloMisReportes || categoryFilter !== 'todas') && (
          <div className="mapa-acciones">
            <div className="chip-filtros-activos">
              {soloMisReportes && <span>Solo mis reportes</span>}
              {categoryFilter !== 'todas' && (
                <span>
                  {categoryLabels[categoryFilter] || categoryFilter}
                  {categoryFilter === 'perros_gatos' && animalFilter !== 'todos'
                    ? ` · ${ANIMAL_TIPOS[animalFilter] || animalFilter}`
                    : ''}
                </span>
              )}
              <button
                type="button"
                onClick={() => {
                  setSoloMisReportes(false);
                  setCategoryFilter('todas');
                  setAnimalFilter('todos');
                }}
              >
                Limpiar
              </button>
            </div>
          </div>
        )}
        <div className="mapa-lienzo">
          <GoogleMap
            mapContainerClassName="mapa-ciudad"
            mapContainerStyle={{ width: '100%', height: '100%' }}
            center={mapCenter}
            zoom={userLocation ? 18 : 15}
            onLoad={onMapLoad}
            options={{
              mapTypeId: 'roadmap',
              streetViewControl: false,
              mapTypeControl: false,
              fullscreenControl: false,
            }}
          >
          {userLocation && (
            <OverlayView
              position={userLocation}
              mapPaneName={OverlayView.OVERLAY_LAYER}
            >
              <div className="ubicacion-actual">
                <span className="ubicacion-halo" />
                <span className="ubicacion-punto" />
              </div>
            </OverlayView>
          )}
          {visibleMarkers.map((marker, index) => {
            const posicion = { lat: Number(marker.lat), lng: Number(marker.lng) };
            const clave = marker._id || `nuevo-${index}`;
            const esMio = (marker.createdBy
              ? String(marker.createdBy).trim().toLowerCase()
              : 'anonimo') === userId;
            const destacar = highlightedMarkerId === marker._id || (soloMisReportes && esMio);
            if (destacar) {
              return (
                <OverlayView
                  key={clave}
                  position={posicion}
                  mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
                  getPixelPositionOffset={() => ({ x: -PUNTA_LUZ_X, y: -PUNTA_LUZ_Y })}
                >
                  <button
                    type="button"
                    className="pin-elegido"
                    style={{ width: ANCHO_LUZ, height: ALTO_LUZ }}
                    onMouseDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      handleMarkerClick(marker);
                    }}
                    aria-label="Reporte seleccionado"
                  >
                    <img src={marcadorCiudadLuz} alt="" className="pin-elegido-luz" />
                    <img
                      src={marcadorCiudad}
                      alt=""
                      className="pin-elegido-cuerpo"
                      style={{
                        width: ANCHO_PIN,
                        height: ALTO_PIN,
                        left: PUNTA_LUZ_X - ANCHO_PIN / 2,
                        top: PUNTA_LUZ_Y - PUNTA_PIN_Y,
                      }}
                    />
                  </button>
                </OverlayView>
              );
            }
            return (
              <Marker
                key={clave}
                position={posicion}
                onClick={() => handleMarkerClick(marker)}
                options={{ icon: iconoReporte(), zIndex: 1 }}
              />
            );
          })}
          </GoogleMap>

          {mostrarSelectorPunto && (
            <>
              <div
                className={`pin-central${pinMoviendo ? ' moviendo' : ''}`}
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
        </div>

        {showPopup && (
          <div
            className={`popup-fondo${isImageZoomed ? ' con-zoom' : ''}`}
            onMouseDown={() => setShowPopup(false)}
          >
            <div
              className={`popup-ciudadar${isImageZoomed ? ' ampliado' : ''}`}
              onMouseDown={stopPropagation}
              onClick={stopPropagation}
            >
              <div className="popup-cabecera">
                <strong>
                  {editMode ? `Reporte${formData.caseId ? ` #${formData.caseId}` : ''}` : 'Nuevo reporte'}
                </strong>
                <div className="popup-cabecera-acciones">
                  {editMode && (
                    <button
                      type="button"
                      className="btn-mapa chico"
                      onClick={handleViewOnMap}
                    >
                      Ver en el mapa
                    </button>
                  )}
                  <button
                    type="button"
                    className="popup-cerrar"
                    onClick={() => setShowPopup(false)}
                    aria-label="Cerrar"
                  >
                    ×
                  </button>
                </div>
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
                <div className="popup-cuerpo">
                  {selectedImage && (
                    <div className="popup-media">
                      <img
                        src={selectedImage}
                        alt="Foto del reporte"
                        className="popup-foto"
                        onClick={handleImageClick}
                        onError={handleImageError}
                      />
                    </div>
                  )}
                  {!showDeleteOnly && canEdit ? (
                    <form
                      className="popup-formulario"
                      onSubmit={(e) => handleSaveUpdate(e, editMode)}
                    >
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
                      <label>Dirección</label>
                      <input
                        type="text"
                        value={formData.direccion || ''}
                        onChange={handleDireccionChange}
                        placeholder="Dirección del punto"
                      />
                      <label>Fecha</label>
                      <input type="date" value={formData.date} onChange={handleDateChange} required />
                      <label>Hora</label>
                      <input type="time" value={formData.time} onChange={handleTimeChange} required />
                      <label>Descripción</label>
                      <textarea value={formData.description} onChange={handleDescriptionChange} required />
                      <label>Categoría</label>
                      <select value={formData.category} onChange={handleCategoryChange} required>
                        {categoryOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      {renderFamiliasTipo()}
                      {renderAnimalTipo()}
                      {renderStatusInfo(true)}
                      {renderResolucionVecino()}
                      <div className="popup-acciones">
                        <button type="submit">Guardar</button>
                        <button type="button" onClick={handleCancel}>Cancelar</button>
                        <button
                          type="button"
                          className="peligro"
                          onClick={() => handleDeleteMarker(editMode)}
                        >
                          Borrar
                        </button>
                      </div>
                    </form>
                  ) : showDeleteOnly ? (
                    <div className="popup-formulario popup-lectura">
                      {(formData.avisadoAt || (formData.status && formData.status !== 'pendiente_aprobacion')) && (
                        <p className="popup-nota">
                          Un administrador ya tomó acción sobre este caso. Solo podés consultarlo.
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
                      <div className="popup-ficha">
                        <div className="popup-ficha-campo popup-ficha-ancho">
                          <span className="popup-ficha-etiqueta">Dirección</span>
                          <span className="popup-ficha-valor">{formData.direccion || 'N/D'}</span>
                        </div>
                        <div className="popup-ficha-campo">
                          <span className="popup-ficha-etiqueta">Fecha</span>
                          <span className="popup-ficha-valor">{formData.date || 'N/D'}</span>
                        </div>
                        <div className="popup-ficha-campo">
                          <span className="popup-ficha-etiqueta">Hora</span>
                          <span className="popup-ficha-valor">{formData.time || 'N/D'}</span>
                        </div>
                        <div className="popup-ficha-campo">
                          <span className="popup-ficha-etiqueta">Categoría</span>
                          <span className="popup-ficha-valor">{categoryLabels[formData.category] || formData.category || 'N/D'}</span>
                        </div>
                        <div className="popup-ficha-campo popup-ficha-ancho">
                          <span className="popup-ficha-etiqueta">Descripción</span>
                          <span className="popup-ficha-valor">{formData.description || 'N/D'}</span>
                        </div>
                      </div>
                      <div className="popup-ficha-estado">
                        {renderStatusInfo(true)}
                      </div>
                      {formData.resolvedBy && (
                        <div className="popup-ficha-resolucion">
                          <span className="popup-ficha-etiqueta">Resolución</span>
                          <p>
                            Reportado por {formData.resolvedBy}
                            {formData.resolvedByReportedAt && (
                              <span> el {new Date(formData.resolvedByReportedAt).toLocaleDateString()}</span>
                            )}
                          </p>
                          {formData.resolutionDescription && (
                            <p><strong>Qué hizo:</strong> {formData.resolutionDescription}</p>
                          )}
                          {formData.resolutionImageUrl && (
                            <img
                              src={buildImageUrl(formData.resolutionImageUrl)}
                              alt="Foto de la resolución"
                              className="popup-foto"
                            />
                          )}
                        </div>
                      )}
                      <div className="popup-acciones">
                        <button type="button" onClick={handleCancel}>Cerrar</button>
                      </div>
                    </div>
                  ) : (
                    <div className="popup-formulario popup-lectura">
                      <p className="popup-lectura-aviso">
                        Esta publicación anónima solo puede ser editada por su creador.
                      </p>
                      <div className="popup-ficha">
                        <div className="popup-ficha-campo popup-ficha-ancho">
                          <span className="popup-ficha-etiqueta">Municipio</span>
                          <span className="popup-ficha-valor popup-ficha-municipio">
                            <IconoUbicacion />
                            <span>{textoMunicipio(formData.jurisdictionName)}</span>
                          </span>
                        </div>
                        <div className="popup-ficha-campo popup-ficha-ancho">
                          <span className="popup-ficha-etiqueta">Dirección</span>
                          <span className="popup-ficha-valor">{formData.direccion || 'N/D'}</span>
                        </div>
                        <div className="popup-ficha-campo">
                          <span className="popup-ficha-etiqueta">Fecha</span>
                          <span className="popup-ficha-valor">{formData.date || 'N/D'}</span>
                        </div>
                        <div className="popup-ficha-campo">
                          <span className="popup-ficha-etiqueta">Hora</span>
                          <span className="popup-ficha-valor">{formData.time || 'N/D'}</span>
                        </div>
                        <div className="popup-ficha-campo">
                          <span className="popup-ficha-etiqueta">Categoría</span>
                          <span className="popup-ficha-valor">{categoryLabels[formData.category] || formData.category || 'N/D'}</span>
                        </div>
                        <div className="popup-ficha-campo popup-ficha-ancho">
                          <span className="popup-ficha-etiqueta">Descripción</span>
                          <span className="popup-ficha-valor">{formData.description || 'N/D'}</span>
                        </div>
                      </div>
                      <div className="popup-ficha-estado">
                        {renderStatusInfo(true)}
                      </div>
                      {renderResolucionVecino()}
                      <div className="popup-acciones">
                        <button type="button" onClick={handleCancel}>Cerrar</button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="popup-cuerpo">
                  <div className="popup-media">
                    {!selectedImage ? (
                      <div {...getRootProps()} className="popup-dropzone">
                        <input {...getInputProps()} />
                        <p>Agregá una foto del reclamo</p>
                        <span className="popup-nota">Obligatoria · Arrastrá acá o elegí desde el celular</span>
                        <button type="button" className="btn-mapa chico" onClick={open}>
                          Seleccionar imagen
                        </button>
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
                    )}
                  </div>
                  <form className="popup-formulario" onSubmit={handleSubmit}>
                    <label>Dirección</label>
                    <input
                      type="text"
                      value={formData.direccion || ''}
                      onChange={handleDireccionChange}
                      placeholder="Se completa con el punto del mapa"
                    />
                    <label>Fecha</label>
                    <input type="date" value={formData.date} onChange={handleDateChange} required />
                    <label>Hora</label>
                    <input type="time" value={formData.time} onChange={handleTimeChange} required />
                    <label>Descripción</label>
                    <textarea value={formData.description} onChange={handleDescriptionChange} required />
                    <label>Categoría</label>
                    <select value={formData.category} onChange={handleCategoryChange} required>
                      {categoryOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    {renderFamiliasTipo()}
                    {renderAnimalTipo()}
                    {!esCasoFamilia(formData.category) && (
                      <small className="popup-nota">
                        Un administrador va a revisar tu reporte antes de publicarlo en el mapa.
                      </small>
                    )}
                    <div className="popup-acciones">
                      <button type="submit">Subir</button>
                      <button type="button" onClick={handleCancel}>Cancelar</button>
                    </div>
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
        {isAdmin && (
          <div className="panel-admin">
            <div className="panel-admin-encabezado">
              <div>
                <h3>Panel de administración</h3>
                <p>
                  {adminRole === 'SUPER_ADMIN'
                    ? 'Super administrador: ves los casos de todas las jurisdicciones.'
                    : `Administrás: ${adminJurisdictions.map((j) => j.name).join(', ')}`}
                </p>
              </div>
              <div className="panel-admin-controles">
                <label className="panel-admin-buscar">
                  Buscar por número de caso
                  <input
                    type="search"
                    value={busquedaAdmin}
                    onChange={(event) => setBusquedaAdmin(event.target.value)}
                    placeholder="Ejemplo: 12"
                  />
                </label>
                <label className="panel-admin-buscar">
                  Categoría
                  <select
                    value={filtroCategoriaAdmin}
                    onChange={(event) => setFiltroCategoriaAdmin(event.target.value)}
                  >
                    <option value="todas">Todas</option>
                    {categoryOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="panel-admin-buscar">
                  Estado
                  <select
                    value={filtroEstadoAdmin}
                    onChange={(event) => setFiltroEstadoAdmin(event.target.value)}
                  >
                    <option value="todos">Todos</option>
                    <option value="pendiente_aprobacion">Pendiente de aprobación</option>
                    <option value="pendiente">Pendiente</option>
                    <option value="en_proceso">En proceso</option>
                    <option value="resuelto">Resuelto</option>
                  </select>
                </label>
              </div>
            </div>
            {casosPorAprobar > 0 && (
              <button
                type="button"
                className={`panel-admin-aviso${soloPorAprobar ? ' panel-admin-aviso-activo' : ''}`}
                onClick={() => {
                  setSoloPorAprobar((activo) => !activo);
                  setSoloUrgentes(false);
                  setSoloResueltosVecino(false);
                }}
              >
                <span>
                  {soloPorAprobar
                    ? 'Volver a ver todos los casos'
                    : casosPorAprobar === 1
                      ? 'Tenés 1 caso para aprobar'
                      : `Tenés ${casosPorAprobar} casos para aprobar`}
                </span>
                {!soloPorAprobar && <span className="panel-admin-aviso-ver">Ver</span>}
              </button>
            )}
            {casosResueltosVecino > 0 && (
              <button
                type="button"
                className={`panel-admin-aviso panel-admin-resuelto${soloResueltosVecino ? ' panel-admin-aviso-activo' : ''}`}
                onClick={() => {
                  setSoloResueltosVecino((activo) => !activo);
                  setSoloPorAprobar(false);
                  setSoloUrgentes(false);
                }}
              >
                <span>
                  {soloResueltosVecino
                    ? 'Volver a ver todos los casos'
                    : casosResueltosVecino === 1
                      ? 'Tenés 1 caso que un vecino marcó como resuelto'
                      : `Tenés ${casosResueltosVecino} casos que un vecino marcó como resueltos`}
                </span>
                {!soloResueltosVecino && <span className="panel-admin-aviso-ver">Ver</span>}
              </button>
            )}
            {casosUrgentes > 0 && (
              <button
                type="button"
                className={`panel-admin-aviso panel-admin-urgente${soloUrgentes ? ' panel-admin-aviso-activo' : ''}`}
                onClick={() => {
                  setSoloUrgentes((activo) => !activo);
                  setSoloPorAprobar(false);
                  setSoloResueltosVecino(false);
                }}
              >
                <span>
                  {soloUrgentes
                    ? 'Volver a ver todos los casos'
                    : casosUrgentes === 1
                      ? 'Tenés 1 caso urgente: varios vecinos reportaron el mismo problema'
                      : `Tenés ${casosUrgentes} casos urgentes: varios vecinos reportaron el mismo problema`}
                </span>
                {!soloUrgentes && <span className="panel-admin-aviso-ver">Ver</span>}
              </button>
            )}
            {deletedMarker && (
              <div className="panel-admin-deshacer">
                <div>
                  <strong>
                    Caso #{deletedMarker.caseId || deletedMarker._id?.slice(-6)} eliminado
                  </strong>
                  <p>
                    El caso "{deletedMarker.description || 'Sin descripción'}" ha sido eliminado.
                    Se eliminará permanentemente en <strong>{deleteCountdown}</strong> segundo{deleteCountdown !== 1 ? 's' : ''}.
                  </p>
                </div>
                <button type="button" onClick={handleUndoDelete}>
                  Deshacer
                </button>
              </div>
            )}
            {casosAdmin.length === 0 && (
              <p className="panel-admin-vacio">
                {textoBusqueda
                  ? 'No hay un caso con ese número.'
                  : soloPorAprobar
                    ? 'No hay casos para aprobar.'
                    : soloUrgentes
                      ? 'No hay casos urgentes.'
                      : soloResueltosVecino
                        ? 'No hay casos marcados como resueltos por un vecino.'
                        : (filtroCategoriaAdmin !== 'todas' || filtroEstadoAdmin !== 'todos')
                          ? 'No hay casos con esos filtros.'
                          : 'No hay casos para administrar.'}
              </p>
            )}
            <div className="panel-admin-lista">
              {casosAdmin.map((marker) => {
                const daysLeft =
                  marker.status === 'resuelto' && marker.resolvedAt
                    ? getDaysUntilRemoval(marker.resolvedAt)
                    : marker.category === 'perros_gatos'
                      ? getDaysUntilPetExpiry(marker.createdAt)
                      : null;
                const creado = marker.createdAt
                  ? new Date(marker.createdAt).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })
                  : 'N/D';
                const vecinos = marker.neighborCount || 1;
                const urgente = casoEsUrgente(marker);
                const categoriaTexto = esCasoFamilia(marker.category)
                  ? 'Familias'
                  : marker.category === 'perros_gatos' && ANIMAL_TIPOS[marker.animalTipo]
                    ? `Perros y gatos · ${ANIMAL_TIPOS[marker.animalTipo]}`
                    : (categoryLabels[marker.category] || marker.category || 'N/D');
                return (
                  <article className={`caso-admin${urgente ? ' caso-admin-marcado' : ''}`} key={marker._id || marker.description}>
                    <div className="caso-admin-principal">
                      <div className="caso-admin-cabeza">
                        <strong className="caso-admin-id">{marker.caseId ? `#${marker.caseId}` : 'Sin número'}</strong>
                        <span className="caso-admin-chip">{categoriaTexto}</span>
                        <span className="caso-admin-municipio">{marker.jurisdictionName || 'Sin jurisdicción'}</span>
                        {urgente && <span className="caso-admin-chip urgente">Urgente</span>}
                      </div>
                      <p className="caso-admin-descripcion">{marker.description || 'Sin descripción'}</p>
                      <dl className="caso-admin-datos">
                        <div>
                          <dt>Dirección</dt>
                          <dd>{marker.direccion || 'Sin dirección'}</dd>
                        </div>
                        <div>
                          <dt>Usuario</dt>
                          <dd>{marker.createdBy || 'anonimo'}</dd>
                        </div>
                        <div>
                          <dt>Creado</dt>
                          <dd>{creado}</dd>
                        </div>
                        <div>
                          <dt>Expira</dt>
                          <dd>{daysLeft !== null ? `${daysLeft} ${daysLeft === 1 ? 'día' : 'días'}` : '-'}</dd>
                        </div>
                      </dl>
                      {marker.category === 'reparaciones' && (
                        <p className={`caso-admin-vecinos${urgente ? ' urgente' : ''}`}>
                          {vecinos === 1 ? '1 vecino lo reportó' : `${vecinos} vecinos lo reportaron`}
                        </p>
                      )}
                      {(marker.confirmations || []).length > 0 && (
                        <ul className="caso-admin-confirmaciones">
                          {marker.confirmations.map((confirmacion, indice) => (
                            <li key={`${marker._id}-confirma-${indice}`}>
                              {confirmacion.userId || 'Vecino'}: {confirmacion.description || 'Sin descripción'}
                            </li>
                          ))}
                        </ul>
                      )}
                      {esCasoFamilia(marker.category) || (marker.category === 'perros_gatos' && marker.animalTipo === 'abandonado') ? (
                        <div className="caso-admin-derivar">
                          <p>A quién avisar</p>
                          {renderOficinas(
                            esCasoFamilia(marker.category) ? tipoDeFamilia(marker) : 'abandonado',
                            marker.jurisdictionName
                          )}
                          {marker.avisadoAt ? (
                            <p className="caso-admin-avisado">
                              Ya avisaste · {new Date(marker.avisadoAt).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}
                            </p>
                          ) : (
                            <button
                              type="button"
                              className="caso-admin-avise"
                              disabled={avisando === marker._id}
                              onClick={() => marcarAvisado(marker._id)}
                            >
                              {avisando === marker._id ? 'Guardando...' : 'Ya avisé'}
                            </button>
                          )}
                        </div>
                      ) : null}
                      {marker.resolvedBy && (
                        <div className="caso-admin-resolucion">
                          <strong>Reportado por:</strong> {marker.resolvedBy}
                          <br />
                          <small>
                            {marker.resolvedByReportedAt
                              ? new Date(marker.resolvedByReportedAt).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })
                              : 'Fecha no disponible'}
                          </small>
                          {marker.resolutionDescription && (
                            <p>
                              <strong>Qué hizo:</strong> {marker.resolutionDescription}
                            </p>
                          )}
                          {marker.resolutionImageUrl && (
                            <div>
                              <a href={buildImageUrl(marker.resolutionImageUrl)} target="_blank" rel="noopener noreferrer">
                                Ver foto
                              </a>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="caso-admin-lateral">
                      {!esCasoFamilia(marker.category) && (
                        <div className="caso-admin-estado-caja">
                          <label htmlFor={`estado-${marker._id}`}>Estado</label>
                          <select
                            id={`estado-${marker._id}`}
                            className="caso-admin-estado"
                            value={estadosPendientes[marker._id] || marker.status || 'pendiente'}
                            aria-label="Estado del caso"
                            onChange={(e) => elegirEstado(marker._id, marker.status || 'pendiente', e.target.value)}
                          >
                            {statusOptions.map((status) => (
                              <option key={status} value={status}>
                                {statusLabels[status] || status.replace('_', ' ')}
                              </option>
                            ))}
                          </select>
                          {estadosPendientes[marker._id] && (
                            <button
                              type="button"
                              className="caso-admin-guardar"
                              disabled={guardandoEstado === marker._id}
                              onClick={() => guardarEstado(marker._id)}
                            >
                              {guardandoEstado === marker._id ? 'Guardando...' : 'Guardar'}
                            </button>
                          )}
                        </div>
                      )}
                      <div className="caso-admin-acciones">
                        <button type="button" className="caso-admin-ver" onClick={() => handleMarkerClick(marker, true)}>
                          Ver
                        </button>
                        <button type="button" className="caso-admin-eliminar" onClick={() => handleAdminDeleteMarker(marker)}>
                          Eliminar
                        </button>
                        {marker.status === 'pendiente_aprobacion' && !esCasoFamilia(marker.category) && (
                          <button type="button" className="caso-admin-aprobar" onClick={() => handleApproveMarker(marker._id)}>
                            Aprobar
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
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
                    value={categoryFilter}
                    onChange={(e) => {
                      setCategoryFilter(e.target.value);
                      if (e.target.value !== 'perros_gatos') setAnimalFilter('todos');
                    }}
                  >
                    <option value="todas">Todas</option>
                    {availableCategoryOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                {categoryFilter === 'perros_gatos' && (
                  <label>
                    De qué se trata
                    <select
                      value={animalFilter}
                      onChange={(e) => setAnimalFilter(e.target.value)}
                    >
                      <option value="todos">Todos</option>
                      {Object.entries(ANIMAL_TIPOS).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
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
          <div className="panel-vecino-fondo" onClick={() => setMostrarMisReportes(false)}>
            <div className="panel-vecino" onClick={(event) => event.stopPropagation()}>
              <div className="panel-vecino-cabecera">
                <h3>Mis reportes</h3>
                <button type="button" onClick={() => setMostrarMisReportes(false)}>Cerrar</button>
              </div>
              {misReportes.length === 0 ? (
                <p className="panel-vecino-vacio">Todavía no cargaste reportes con esta cuenta.</p>
              ) : (
                <>
                <button
                  type="button"
                  className="btn-aplicar-filtros"
                  onClick={verMisCasosEnElMapa}
                >
                  Ver mis casos en el mapa
                </button>
                <ul className="panel-vecino-lista panel-mis-reportes">
                  {misReportes.map((marker) => {
                    const categoria = esCasoFamilia(marker.category)
                      ? 'familias'
                      : (marker.category || 'reparaciones');
                    const labelsFamilias = {
                      violencia: 'Violencia en la casa',
                      hijos: 'Niños o adolescentes',
                      calle: 'Persona en situación de calle',
                    };
                    const subtipo = categoria === 'perros_gatos' && ANIMAL_TIPOS[marker.animalTipo]
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
                    return (
                      <li key={marker._id}>
                        <button
                          type="button"
                          className="tarjeta-mi-reporte"
                          onClick={() => irAMiReporte(marker)}
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
                            <strong>Caso #{marker.caseId || '-'}</strong>
                            <span className="tarjeta-mi-reporte-meta">
                              {categoryLabels[categoria] || categoria}
                              {subtipo ? ` · ${subtipo}` : ''}
                            </span>
                            <span
                              className="panel-vecino-estado"
                              style={getStatusBadgeStyle(marker.status || 'pendiente')}
                            >
                              {statusLabels[marker.status] || marker.status}
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
                      </li>
                    );
                  })}
                </ul>
                </>
              )}
            </div>
          </div>
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
            <button
              type="button"
              onClick={() => {
                setAvisoVecino('');
                setAvisoEsAlerta(false);
              }}
            >
              Cerrar
            </button>
          </div>
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
