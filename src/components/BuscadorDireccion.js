import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const CENTRO_TUCUMAN = { lat: -26.8084602, lng: -65.2175701 };
const VIEWBOX_TUCUMAN = '-65.55,-26.55,-64.95,-27.25';

const distanciaKm = (lat, lng) => {
  const dLat = ((lat - CENTRO_TUCUMAN.lat) * Math.PI) / 180;
  const dLng = ((lng - CENTRO_TUCUMAN.lng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((CENTRO_TUCUMAN.lat * Math.PI) / 180) *
      Math.cos((lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const parsearCalleNumero = (consulta) => {
  const limpio = consulta.trim().replace(/\s+/g, ' ');
  const match = limpio.match(/^(.+?)\s+(\d+[A-Za-z]?)$/);
  if (!match) return { calle: limpio, numero: '' };
  return { calle: match[1].trim(), numero: match[2].trim() };
};

const esTucuman = (texto = '') => /tucum[aá]n/i.test(texto);

const tituloDesdeNominatim = (item) => {
  const a = item.address || {};
  const ruta = a.road || a.pedestrian || a.path || a.residential || '';
  const numero = a.house_number || '';
  if (item.name && item.name !== ruta) return item.name;
  if (ruta) return numero ? `${ruta} ${numero}` : ruta;
  return (item.display_name || '').split(',')[0] || 'Lugar';
};

const detalleDesdeNominatim = (item) => {
  const a = item.address || {};
  const partes = [
    a.suburb || a.neighbourhood || a.quarter,
    a.city || a.town || a.village || a.municipality,
    a.state,
  ].filter(Boolean);
  if (partes.length) return partes.join(', ');
  return (item.display_name || '').split(',').slice(1, 4).join(',').trim();
};

const mapearNominatim = (results) =>
  (results || [])
    .filter((item) => item.lat != null && item.lon != null)
    .map((item) => {
      const lat = Number(item.lat);
      const lng = Number(item.lon);
      const a = item.address || {};
      const titulo = tituloDesdeNominatim(item);
      const detalle = detalleDesdeNominatim(item);
      const state = a.state || '';
      const city = a.city || a.town || a.village || '';
      return {
        id: `nom-${item.place_id || `${lat}-${lng}`}`,
        titulo,
        detalle,
        direccion: detalle ? `${titulo}, ${detalle}` : titulo,
        lat,
        lng,
        numero: a.house_number || '',
        calle: a.road || '',
        enTucuman: esTucuman(state) || esTucuman(city) || esTucuman(item.display_name || ''),
        km: distanciaKm(lat, lng),
        tipo: 'nominatim',
      };
    });

const mapearPhoton = (features) =>
  (features || [])
    .map((feature) => {
      const coords = feature.geometry?.coordinates;
      if (!coords || coords.length < 2) return null;
      const lng = Number(coords[0]);
      const lat = Number(coords[1]);
      if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
      const p = feature.properties || {};
      const calle = p.street || '';
      const numero = p.housenumber || '';
      const titulo = p.name
        || (calle ? (numero ? `${calle} ${numero}` : calle) : (p.city || 'Lugar'));
      const detalle = [p.district || p.locality || p.suburb, p.city || p.town, p.state]
        .filter(Boolean)
        .join(', ');
      const enTucuman = esTucuman(p.state) || esTucuman(p.city) || p.countrycode === 'AR';
      return {
        id: `pho-${p.osm_type || 'x'}-${p.osm_id || `${lat}-${lng}`}`,
        titulo,
        detalle,
        direccion: detalle ? `${titulo}, ${detalle}` : titulo,
        lat,
        lng,
        numero,
        calle,
        enTucuman,
        km: distanciaKm(lat, lng),
        tipo: 'photon',
      };
    })
    .filter(Boolean);

const rankearYFiltrar = (items, { calle = '', numero = '' } = {}) => {
  const calleNorm = calle.toLowerCase();
  const unicos = [];
  const vistos = new Set();
  items.forEach((item) => {
    const clave = `${item.lat.toFixed(5)},${item.lng.toFixed(5)},${item.titulo}`;
    if (vistos.has(clave)) return;
    vistos.add(clave);
    unicos.push(item);
  });

  return unicos
    .map((item) => {
      let score = 0;
      if (item.enTucuman) score += 40;
      if (item.km < 8) score += 25;
      else if (item.km < 25) score += 12;
      else if (item.km < 60) score += 4;
      else score -= 20;
      if (numero && item.numero && String(item.numero) === String(numero)) score += 35;
      if (numero && !item.numero) score -= 8;
      if (calleNorm && item.calle && item.calle.toLowerCase().includes(calleNorm.split(' ')[0])) score += 10;
      if (calleNorm && item.titulo.toLowerCase().includes(calleNorm.split(' ')[0])) score += 6;
      score -= item.km * 0.4;
      return { ...item, score };
    })
    .sort((a, b) => b.score - a.score)
    .filter((item) => item.km < 120 || item.enTucuman)
    .slice(0, 7);
};

const BuscadorDireccion = ({
  valor = '',
  onChange,
  onElegirLugar,
  onLimpiar,
  placeholder = 'Buscá una dirección',
  disabled = false,
  conLupa = false,
}) => {
  const [texto, setTexto] = useState(valor);
  const [sugerencias, setSugerencias] = useState([]);
  const [abierto, setAbierto] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const [aviso, setAviso] = useState('');
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0, width: 0 });
  const contenedorRef = useRef(null);
  const inputRef = useRef(null);
  const timerRef = useRef(null);
  const editandoRef = useRef(false);
  const abortRef = useRef(null);
  const busquedaSeqRef = useRef(0);

  useEffect(() => {
    if (editandoRef.current && document.activeElement === inputRef.current) return;
    setTexto(valor || '');
  }, [valor]);

  const actualizarPosicionMenu = () => {
    if (!inputRef.current) return;
    const rect = inputRef.current.getBoundingClientRect();
    setMenuPos({
      top: Math.max(8, rect.top - 8),
      left: rect.left,
      width: rect.width,
      abrirArriba: true,
    });
  };

  useEffect(() => {
    const cerrar = (event) => {
      const enInput = contenedorRef.current?.contains(event.target);
      const enLista = event.target.closest?.('.buscador-direccion-lista');
      if (!enInput && !enLista) {
        setAbierto(false);
        editandoRef.current = false;
      }
    };
    const reposicionar = () => {
      if (abierto) actualizarPosicionMenu();
    };
    document.addEventListener('mousedown', cerrar);
    window.addEventListener('resize', reposicionar);
    window.addEventListener('scroll', reposicionar, true);
    return () => {
      document.removeEventListener('mousedown', cerrar);
      window.removeEventListener('resize', reposicionar);
      window.removeEventListener('scroll', reposicionar, true);
    };
  }, [abierto]);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (abortRef.current) abortRef.current.abort();
  }, []);

  const mostrarResultados = (mapped) => {
    setBuscando(false);
    if (!mapped.length) {
      setSugerencias([]);
      setAviso('No encontramos esa dirección en Tucumán.');
      setAbierto(true);
      actualizarPosicionMenu();
      return;
    }
    setSugerencias(mapped);
    setAviso('');
    setAbierto(true);
    actualizarPosicionMenu();
  };

  const buscarDirecciones = async (consulta, seq) => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const { calle, numero } = parsearCalleNumero(consulta);
    const signal = controller.signal;

    try {
      const photonUrl =
        `https://photon.komoot.io/api/?q=${encodeURIComponent(consulta)}` +
        `&lat=${CENTRO_TUCUMAN.lat}&lon=${CENTRO_TUCUMAN.lng}` +
        `&limit=8&location_bias_scale=0.4`;

      const nominatimLibre =
        `https://nominatim.openstreetmap.org/search?format=jsonv2` +
        `&q=${encodeURIComponent(`${consulta}, Tucumán, Argentina`)}` +
        `&addressdetails=1&limit=5&countrycodes=ar` +
        `&viewbox=${VIEWBOX_TUCUMAN}&bounded=1` +
        `&accept-language=es`;

      const peticiones = [
        fetch(photonUrl, { signal, headers: { Accept: 'application/json' } })
          .then((r) => (r.ok ? r.json() : { features: [] }))
          .catch(() => ({ features: [] })),
        fetch(nominatimLibre, {
          signal,
          headers: { Accept: 'application/json' },
        })
          .then((r) => (r.ok ? r.json() : []))
          .catch(() => []),
      ];

      if (numero) {
        const estructurada =
          `https://nominatim.openstreetmap.org/search?format=jsonv2` +
          `&street=${encodeURIComponent(`${calle} ${numero}`)}` +
          `&city=${encodeURIComponent('San Miguel de Tucumán')}` +
          `&state=${encodeURIComponent('Tucumán')}` +
          `&country=${encodeURIComponent('Argentina')}` +
          `&addressdetails=1&limit=5&countrycodes=ar`;
        peticiones.push(
          fetch(estructurada, {
            signal,
            headers: { Accept: 'application/json' },
          })
            .then((r) => (r.ok ? r.json() : []))
            .catch(() => [])
        );
      }

      const [photonData, nomLibre, nomEstructurada = []] = await Promise.all(peticiones);
      if (seq !== busquedaSeqRef.current) return;

      const combinados = [
        ...mapearPhoton(photonData.features || []),
        ...mapearNominatim(nomLibre),
        ...mapearNominatim(nomEstructurada),
      ];
      mostrarResultados(rankearYFiltrar(combinados, { calle, numero }));
    } catch (err) {
      if (err?.name === 'AbortError') return;
      if (seq !== busquedaSeqRef.current) return;
      setBuscando(false);
      setSugerencias([]);
      setAviso('No se pudo buscar direcciones. Probá de nuevo.');
      setAbierto(true);
      actualizarPosicionMenu();
    }
  };

  const buscarSugerencias = (consulta) => {
    setAviso('');
    const seq = ++busquedaSeqRef.current;
    buscarDirecciones(consulta, seq);
  };

  const handleInput = (event) => {
    const siguiente = event.target.value;
    editandoRef.current = true;
    setTexto(siguiente);
    if (onChange) onChange(siguiente);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!siguiente.trim() || siguiente.trim().length < 3) {
      busquedaSeqRef.current += 1;
      if (abortRef.current) abortRef.current.abort();
      setSugerencias([]);
      setAbierto(false);
      setBuscando(false);
      setAviso('');
      return;
    }
    setBuscando(true);
    actualizarPosicionMenu();
    timerRef.current = setTimeout(() => buscarSugerencias(siguiente.trim()), 280);
  };

  const confirmarLugar = ({ direccion, lat, lng }) => {
    editandoRef.current = false;
    setTexto(direccion);
    if (onChange) onChange(direccion);
    if (onElegirLugar && lat != null && lng != null) {
      onElegirLugar({ direccion, lat, lng });
    }
    setAbierto(false);
    setSugerencias([]);
    setAviso('');
  };

  const elegirSugerencia = (item) => {
    confirmarLugar({
      direccion: item.direccion,
      lat: item.lat,
      lng: item.lng,
    });
  };

  const lista = abierto && (sugerencias.length > 0 || aviso)
    ? createPortal(
      <ul
        className="buscador-direccion-lista buscador-direccion-lista-arriba"
        role="listbox"
        style={{
          top: 'auto',
          bottom: `${window.innerHeight - menuPos.top}px`,
          left: `${menuPos.left}px`,
          width: `${menuPos.width}px`,
        }}
      >
        {sugerencias.map((item) => (
          <li key={item.id}>
            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => elegirSugerencia(item)}>
              <strong>{item.titulo}</strong>
              {item.detalle && <span>{item.detalle}</span>}
            </button>
          </li>
        ))}
        {!sugerencias.length && aviso && (
          <li className="buscador-direccion-vacio">{aviso}</li>
        )}
      </ul>,
      document.body
    )
    : null;

  const limpiar = (event) => {
    event.preventDefault();
    event.stopPropagation();
    editandoRef.current = true;
    busquedaSeqRef.current += 1;
    if (abortRef.current) abortRef.current.abort();
    setTexto('');
    setSugerencias([]);
    setAbierto(false);
    setAviso('');
    setBuscando(false);
    if (onChange) onChange('');
    if (onLimpiar) onLimpiar();
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  return (
    <div
      className={`buscador-direccion${conLupa ? ' con-lupa' : ''}${texto ? ' con-limpiar' : ''}`}
      ref={contenedorRef}
    >
      {conLupa && (
        <span className="buscador-direccion-lupa" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path
              fill="currentColor"
              d="M15.5 14h-.79l-.28-.27A6.5 6.5 0 1 0 14 15.5l.27.28v.79l5 5L20.49 19l-5-5zm-6 0A4.5 4.5 0 1 1 14 9.5 4.5 4.5 0 0 1 9.5 14z"
            />
          </svg>
        </span>
      )}
      <input
        ref={inputRef}
        type="text"
        value={texto}
        onChange={handleInput}
        onFocus={() => {
          editandoRef.current = true;
          actualizarPosicionMenu();
          if (sugerencias.length || aviso) setAbierto(true);
        }}
        onBlur={() => {
          setTimeout(() => {
            editandoRef.current = false;
          }, 200);
        }}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
      />
      {!!texto && !disabled && (
        <button
          type="button"
          className="buscador-direccion-limpiar"
          onMouseDown={limpiar}
          aria-label="Borrar dirección"
          title="Borrar para escribir"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="currentColor"
              d="M18.3 5.71a1 1 0 0 0-1.41 0L12 10.59 7.11 5.7A1 1 0 0 0 5.7 7.11L10.59 12 5.7 16.89a1 1 0 1 0 1.41 1.41L12 13.41l4.89 4.89a1 1 0 0 0 1.41-1.41L13.41 12l4.89-4.89a1 1 0 0 0 0-1.4z"
            />
          </svg>
        </button>
      )}
      {buscando && <small className="buscador-direccion-estado">Buscando...</small>}
      {lista}
    </div>
  );
};

export default BuscadorDireccion;
