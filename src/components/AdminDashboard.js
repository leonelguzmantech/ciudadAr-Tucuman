import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { getAuth, signOut } from 'firebase/auth';
import appFirebase from './credenciales';
import logoCiudad from '../assets/ciudadar-logo-circulo-estilo.jpg';
import ChatReclamo from './ChatReclamo';
import MapComponent from './MapComponent';

const auth = getAuth(appFirebase);

const ADMIN_VISTA_KEY = 'ciudadar-admin-seccion';
const SECCIONES_ADMIN = new Set([
  'inicio',
  'reportes',
  'cosas_perdidas',
  'por_aprobar',
  'derivados',
  'registro',
  'mapa',
  'operarios',
]);
const ATENCIONES_OK = new Set(['urgentes', 'resolucion', 'respuestas', 'cierres', 'derivados']);

const leerVistaAdminGuardada = () => {
  try {
    const raw = sessionStorage.getItem(ADMIN_VISTA_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return null;
    return {
      seccion: SECCIONES_ADMIN.has(data.seccion) ? data.seccion : 'inicio',
      casoId: data.casoId ? String(data.casoId) : null,
      atencion: ATENCIONES_OK.has(data.atencion) ? data.atencion : '',
      estado: ['pendiente', 'en_proceso'].includes(data.estado) ? data.estado : 'pendiente',
      tenantId: data.tenantId != null ? String(data.tenantId) : null,
    };
  } catch {
    return null;
  }
};

const SUPER_CASOS_FOCO_KEY = 'ciudadar-super-casos-foco';
/** Evita perder el foco con Strict Mode (monta 2 veces y borraba sessionStorage). */
let focoSuperCasosMemoria = null;

const leerFocoSuperCasos = () => {
  try {
    const raw = sessionStorage.getItem(SUPER_CASOS_FOCO_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (data && typeof data === 'object') {
        focoSuperCasosMemoria = data;
        return data;
      }
    }
    return focoSuperCasosMemoria;
  } catch {
    return focoSuperCasosMemoria;
  }
};

const IconoInicio = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 3 4 9v12h5v-7h6v7h5V9z" /></svg>
);
/** Alerta / reporte ciudadano */
const IconoReportes = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path fill="currentColor" d="M12 5.99 19.53 19H4.47L12 5.99M12 2 1 21h22L12 2zm1 14h-2v2h2v-2zm0-6h-2v4h2v-4z" />
  </svg>
);
/** Radar / cercanía (cosas perdidas) */
const IconoPerdidas = () => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" opacity="0.35" />
    <circle cx="12" cy="12" r="5.5" stroke="currentColor" strokeWidth="1.8" opacity="0.65" />
    <circle cx="12" cy="12" r="2.2" fill="currentColor" />
    <path
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      d="M12 3v2.2M21 12h-2.2M12 21v-2.2M3 12h2.2"
    />
  </svg>
);
const IconoMapa = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2C8.1 2 5 5.1 5 9c0 5.2 7 13 7 13s7-7.8 7-13c0-3.9-3.1-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5z" /></svg>
);
const IconoSalir = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M10 17v-3H3v-4h7V7l5 5-5 5zm9-14H11v2h8v14h-8v2h8a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2z" /></svg>
);
const IconoCheck = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M9.2 16.6 4.8 12.2l1.4-1.4 3 3 8-8 1.4 1.4z" /></svg>
);
const IconoChat = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M4 4h16v12H7l-3 3V4zm4 5v2h8V9H8z" /></svg>
);
const IconoX = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M18.3 5.7 12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7 2.9 18.3 9.2 12 2.9 5.7 4.3 4.3l6.3 6.3 6.3-6.3z" /></svg>
);
/** Libros encimados / historial de registro */
const IconoRegistro = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path fill="currentColor" d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-1 9H9V4h10v7zM9 13h10v3H9v-3z" />
  </svg>
);
/** Derivados a oficina (siguen en el mapa) */
const IconoDerivados = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path fill="currentColor" d="M12 2a7 7 0 0 1 7 7c0 5.25-7 13-7 13S5 14.25 5 9a7 7 0 0 1 7-7zm0 9.5A2.5 2.5 0 1 0 12 6a2.5 2.5 0 0 0 0 5.5z" />
  </svg>
);
/** Material Icons “engineering” (oficial) — persona con casco + engranajes */
const IconoCuadrilla = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path
      fill="currentColor"
      d="M9 15c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4zm13.1-8.16c.01-.11.02-.22.02-.34 0-.12-.01-.23-.03-.34l.74-.58c.07-.05.08-.15.04-.22l-.7-1.21c-.04-.08-.14-.1-.21-.08l-.86.35c-.18-.14-.38-.25-.59-.34l-.13-.93A.182.182 0 0 0 20.2 3h-1.4c-.09 0-.16.06-.17.15l-.13.93c-.21.09-.41.21-.59.34l-.87-.35c-.08-.03-.17 0-.21.08l-.7 1.21c-.04.08-.03.17.04.22l.74.58a1.953 1.953 0 0 0 0 .68l-.74.58c-.07.05-.08.15-.04.22l.7 1.21c.04.08.14.1.21.08l.87-.35c.18.14.38.25.59.34l.13.93c.01.09.08.15.17.15h1.4c.09 0 .16-.06.17-.15l.13-.93c.21-.09.41-.21.59-.34l.87.35c.08.03.17 0 .21-.08l.7-1.21c.04-.08.03-.17-.04-.22l-.73-.58zm-2.6.91a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5zm.42 3.93-.5-.87c-.03-.06-.1-.08-.15-.06l-.62.25c-.13-.1-.27-.18-.42-.24l-.09-.66A.15.15 0 0 0 18 10h-1c-.06 0-.11.04-.12.11l-.09.66c-.15.06-.29.15-.42.24l-.62-.25c-.06-.02-.12 0-.15.06l-.5.87c-.03.06-.02.12.03.16l.53.41c-.01.08-.02.16-.02.24 0 .08.01.17.02.24l-.53.41c-.05.04-.06.11-.03.16l.5.87c.03.06.1.08.15.06l.62-.25c.13.1.27.18.42.24l.09.66c.01.07.06.11.12.11h1c.06 0 .12-.04.12-.11l.09-.66c.15-.06.29-.15.42-.24l.62.25c.06.02.12 0 .15-.06l.5-.87c.03-.06.02-.12-.03-.16l-.52-.41c.01-.08.02-.16.02-.24 0-.08-.01-.17-.02-.24l.53-.41c.05-.04.06-.11.04-.17zm-2.42 1.65c-.46 0-.83-.38-.83-.83 0-.46.38-.83.83-.83s.83.38.83.83c0 .46-.37.83-.83.83zM4.74 9h8.53c.27 0 .49-.22.49-.49v-.02a.49.49 0 0 0-.49-.49H13c0-1.48-.81-2.75-2-3.45v.95c0 .28-.22.5-.5.5s-.5-.22-.5-.5V4.14C9.68 4.06 9.35 4 9 4s-.68.06-1 .14V5.5c0 .28-.22.5-.5.5S7 5.78 7 5.5v-.95C5.81 5.25 5 6.52 5 8h-.26a.49.49 0 0 0-.49.49v.03c0 .26.22.48.49.48zM9 13c1.86 0 3.41-1.28 3.86-3H5.14c.45 1.72 2 3 3.86 3z"
    />
  </svg>
);
const API = 'http://localhost:5001';
const GOOGLE_MAPS_API_KEY = 'AIzaSyBKHbs5m_qsi4sd80epFp-mLP8KSFixk_4';

const STATUS_LABEL = {
  pendiente_aprobacion: 'Pendiente',
  pendiente: 'Publicado',
  en_proceso: 'En proceso',
  pendiente_cierre: 'Cierre propuesto',
  resuelto: 'Resuelto',
  rechazado: 'Rechazado',
};

/** Familias no se publican en el mapa vecino: no decir "Publicado" */
const etiquetaEstadoAdmin = (m) => {
  if (!m) return '—';
  const esFamilia = m.category === 'familias' || m.category === 'persona';
  if (esFamilia) {
    if (m.status === 'pendiente_aprobacion') return 'Por revisar';
    if (m.status === 'pendiente') return m.avisadoAt ? 'Oficina avisada' : 'Aprobado (privado)';
    if (m.status === 'rechazado') return 'Anulado';
    if (m.status === 'resuelto') return 'Cerrado';
  }
  if (m.category === 'perros_gatos' && m.animalTipo === 'abandonado' && m.avisadoAt && !m.eliminadoAt) {
    return 'Oficina avisada';
  }
  return STATUS_LABEL[m.status] || m.status;
};

/** Etiquetas que ve el vecino (alineadas al backend) */
const STATUS_LABEL_VECINO = {
  pendiente_aprobacion: 'En revisión',
  pendiente: 'Publicado / pendiente de atención',
  en_proceso: 'El municipio lo está atendiendo',
  pendiente_cierre: 'Cierre propuesto · esperando confirmación',
  resuelto: 'Resuelto',
  rechazado: 'Anulado',
};

/** Etiqueta de cierre en Registro: Resuelto | Anulado | Vencido | Oficina avisada */
const etiquetaCierreRegistro = (marker) => {
  if (!marker) return 'Anulado';
  const motivo = String(marker.motivoEliminacion || '').toLowerCase();
  if (motivo.includes('oficina')) return 'Oficina avisada';
  if (motivo.includes('vencimiento')) return 'Vencido';
  if (marker.status === 'resuelto') return 'Resuelto';
  if (marker.status === 'rechazado') return 'Anulado';
  if (motivo.includes('resuelto') || motivo.includes('recuper') || motivo.includes('cierre')) {
    return 'Resuelto';
  }
  return 'Anulado';
};

const claseEstadoRegistro = (marker) => {
  const etiqueta = etiquetaCierreRegistro(marker);
  if (etiqueta === 'Resuelto' || etiqueta === 'Oficina avisada') return 'admin-dash-estado-resuelto';
  if (etiqueta === 'Vencido') return 'admin-dash-estado-vencido';
  return 'admin-dash-estado-rechazado';
};

// Filtro de Reportes / Cosas perdidas: solo casos activos en mapa
const STATUS_OPTIONS_ACTIVOS = ['pendiente', 'en_proceso'];

const REGISTRO_TIPO_CIERRE = [
  { value: 'resuelto', label: 'Resuelto' },
  { value: 'anulado', label: 'Anulado' },
  { value: 'vencido', label: 'Vencido' },
  { value: '', label: 'Todo tipo de cierre' },
];

const REGISTRO_CATEGORIA = [
  { value: 'reparaciones', label: 'Reparaciones' },
  { value: 'perros_gatos', label: 'Perros y gatos' },
  { value: 'familias', label: 'Familias' },
  { value: 'cosas_perdidas', label: 'Cosas perdidas' },
  { value: '', label: 'Todas las categorías' },
];

const REGISTRO_PERIODO = [
  { value: '7', label: 'Últimos 7 días' },
  { value: '30', label: 'Últimos 30 días' },
  { value: '90', label: 'Últimos 90 días' },
  { value: 'personalizado', label: 'Personalizado' },
  { value: '', label: 'Cualquier fecha' },
];

const PERDIDA_LABEL = {
  perdi: 'Perdí',
  encontre: 'Encontré',
};

const ANIMAL_LABEL = {
  abandonado: 'Abandonado',
  perdido: 'Perdido',
  adopcion: 'En adopción',
};

const FAMILIAS_LABEL = {
  violencia: 'Violencia en la casa',
  hijos: 'Niños o adolescentes',
  calle: 'Persona en situación de calle',
};

const CATEGORY_LABEL = {
  familias: 'Familias',
  perros_gatos: 'Perros y gatos',
  reparaciones: 'Reparaciones',
  cosas_perdidas: 'Cosas perdidas',
};

const lineaCategoria = (m) => {
  if (m.category === 'cosas_perdidas') {
    const sub = PERDIDA_LABEL[m.perdidaTipo];
    return sub ? `Categoría: Cosas perdidas / ${sub}` : 'Categoría: Cosas perdidas';
  }
  if (m.category === 'perros_gatos') {
    const sub = ANIMAL_LABEL[m.animalTipo];
    return sub ? `Categoría: Perros y gatos / ${sub}` : 'Categoría: Perros y gatos';
  }
  if (m.category === 'familias' || m.category === 'persona') {
    const sub = FAMILIAS_LABEL[m.familiasTipo]
      || (m.category === 'persona' ? FAMILIAS_LABEL.calle : null);
    return sub ? `Categoría: Familias / ${sub}` : 'Categoría: Familias';
  }
  const base = CATEGORY_LABEL[m.category] || m.category || 'Reporte';
  return `Categoría: ${base}`;
};

const metaCasoLista = (m) => lineaCategoria(m);

const buildImageUrl = (path) => {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  return `${API}${path}`;
};

const whatsappUrlAdmin = (contacto, texto = '') => {
  let d = String(contacto || '').replace(/\D/g, '');
  if (!d) return null;
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('0')) d = d.slice(1);
  if (!d.startsWith('54')) {
    d = d.startsWith('9') ? `54${d}` : `549${d}`;
  }
  const base = `https://wa.me/${d}`;
  return texto ? `${base}?text=${encodeURIComponent(texto)}` : base;
};

/** Números cortos de emergencia: solo llamada, sin WhatsApp. */
const TEL_SOLO_LLAMADA = new Set(['911', '144', '102', '103', '100', '107', '101']);

const textoPlanoOficina = (valor) => String(valor || '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '');

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

const OFICINA_ANIMALES = {
  titulo: 'Área de animales',
  detalle: 'Número de prueba. El equipo todavía no existe.',
  llamar: { href: 'tel:+543810000000', texto: 'Llamar al 381 000-0000' },
  extras: [],
};

const oficinaCalle = (jurisdiccion) => {
  const nombre = textoPlanoOficina(jurisdiccion);
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

const oficinasDelCasoAdmin = (tipo, jurisdiccion) => {
  if (tipo === 'calle') return [oficinaCalle(jurisdiccion)];
  if (OFICINAS_FAMILIAS[tipo]) return [OFICINAS_FAMILIAS[tipo]];
  return [OFICINAS_FAMILIAS.violencia, OFICINAS_FAMILIAS.hijos];
};

const tipoFamiliaCaso = (m) => {
  if (!m) return '';
  if (m.category === 'persona') return 'calle';
  return m.familiasTipo || '';
};

const casoRequiereOficina = (m) => {
  if (!m) return false;
  if (m.category === 'familias' || m.category === 'persona') return true;
  return m.category === 'perros_gatos' && m.animalTipo === 'abandonado';
};

const oficinasParaCaso = (m) => {
  if (!casoRequiereOficina(m)) return [];
  if (m.category === 'perros_gatos' && m.animalTipo === 'abandonado') {
    return [OFICINA_ANIMALES];
  }
  const juris = m.jurisdictionName
    || (typeof m.tenant === 'object' && m.tenant?.name)
    || '';
  return oficinasDelCasoAdmin(tipoFamiliaCaso(m), juris);
};

const mensajeParaOficina = (m) => {
  if (!m) return '';
  const caso = m.caseId ? `#${m.caseId}` : '';
  const cat = lineaCategoria(m).replace(/^Categoría:\s*/i, '');
  const lugar = [m.direccion, m.jurisdictionName].filter(Boolean).join(' · ') || 'sin dirección';
  const desc = String(m.description || '').trim().slice(0, 280);
  return [
    `Hola, escribo desde CiudadAr (municipio). Caso ${caso || 'sin número'}.`,
    `Tema: ${cat}.`,
    `Ubicación: ${lugar}.`,
    desc ? `Detalle: ${desc}` : null,
    '¿Pueden tomar el aviso?',
  ].filter(Boolean).join('\n');
};

/** Si el href es tel: con celular AR, ofrece wa.me con mensaje listo. */
const whatsappDesdeHref = (href, mensaje) => {
  const raw = String(href || '');
  if (raw.startsWith('https://wa.me/') || raw.startsWith('http://wa.me/')) {
    const base = raw.split('?')[0];
    return mensaje ? `${base}?text=${encodeURIComponent(mensaje)}` : base;
  }
  if (!raw.startsWith('tel:')) return null;
  const digitos = raw.replace(/\D/g, '');
  if (!digitos || TEL_SOLO_LLAMADA.has(digitos)) return null;
  if (digitos.length < 10) return null;
  return whatsappUrlAdmin(digitos, mensaje);
};

const fechaTexto = (valor) => {
  if (!valor) return '—';
  try {
    return new Date(valor).toLocaleString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
};

/** Fecha corta para avisos: "hoy 21:27" o "02/11 21:27". */
const fechaCortaAviso = (valor) => {
  if (!valor) return '';
  try {
    const d = new Date(valor);
    if (Number.isNaN(d.getTime())) return '';
    const hora = d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
    const hoy = new Date();
    if (d.toDateString() === hoy.toDateString()) return `hoy ${hora}`;
    return `${d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })} ${hora}`;
  } catch {
    return '';
  }
};

/**
 * Panel admin de pantalla completa.
 * El mapa solo aparece en la pestaña Mapa o al pedir "Ver en el mapa" desde un caso.
 */
const AdminDashboard = ({ userId, onSalirMapaVecino, onVolverSuper }) => {
  const vistaInicial = useMemo(() => {
    const guardada = leerVistaAdminGuardada() || {};
    const foco = leerFocoSuperCasos() || {};
    const seccion = SECCIONES_ADMIN.has(foco.seccion)
      ? foco.seccion
      : (SECCIONES_ADMIN.has(guardada.seccion) ? guardada.seccion : 'inicio');
    const casoDesdeFoco = foco.casoId || foco.markerId || null;
    const caseNumberRaw = foco.caseNumber != null ? Number(foco.caseNumber) : NaN;
    const caseNumber = Number.isFinite(caseNumberRaw) && caseNumberRaw > 0
      ? caseNumberRaw
      : null;
    return {
      seccion,
      casoId: casoDesdeFoco ? String(casoDesdeFoco) : (guardada.casoId || null),
      caseNumber,
      atencion: ATENCIONES_OK.has(foco.atencion)
        ? foco.atencion
        : (guardada.atencion || ''),
      estado: ['pendiente', 'en_proceso'].includes(foco.estado)
        ? foco.estado
        : (guardada.estado || 'pendiente'),
      registroTipo: Object.prototype.hasOwnProperty.call(foco, 'registroTipo')
        ? String(foco.registroTipo || '')
        : 'resuelto',
      registroCategoria: Object.prototype.hasOwnProperty.call(foco, 'registroCategoria')
        ? String(foco.registroCategoria || '')
        : 'reparaciones',
      registroPeriodo: Object.prototype.hasOwnProperty.call(foco, 'registroPeriodo')
        ? String(foco.registroPeriodo || '')
        : '7',
      sinTenant: !!foco.sinTenant,
      tenantId: Object.prototype.hasOwnProperty.call(foco, 'tenantId')
        ? String(foco.tenantId || '')
        : (Object.prototype.hasOwnProperty.call(foco, 'registroTenantId')
          ? String(foco.registroTenantId || '')
          : (guardada.tenantId != null ? String(guardada.tenantId) : null)),
    };
  }, []);
  const [seccion, setSeccion] = useState(vistaInicial.seccion || 'inicio');
  const [casoId, setCasoId] = useState(vistaInicial.casoId || null);
  /** Número de caso pendiente de abrir una sola vez (desde notificación). */
  const caseNumberFocoRef = useRef(vistaInicial.caseNumber || null);
  const [busqueda, setBusqueda] = useState(
    vistaInicial.caseNumber ? String(vistaInicial.caseNumber) : ''
  );
  const [busquedaDebounced, setBusquedaDebounced] = useState(
    vistaInicial.caseNumber ? String(vistaInicial.caseNumber) : ''
  );

  const cerrarFichaCaso = useCallback(() => {
    caseNumberFocoRef.current = null;
    setCasoDetalle(null);
    setCasoId(null);
    setVerResolucion(false);
    setMapaCaso(null);
  }, []);

  // Quitar el foco de sessionStorage al montar; la memoria aguanta el remount de Strict Mode
  useEffect(() => {
    try {
      sessionStorage.removeItem(SUPER_CASOS_FOCO_KEY);
    } catch {
      /* ignore */
    }
    const t = window.setTimeout(() => {
      focoSuperCasosMemoria = null;
    }, 800);
    return () => window.clearTimeout(t);
  }, []);
  const [filtroEstado, setFiltroEstado] = useState(vistaInicial.estado || 'pendiente');
  const [filtroAtencion, setFiltroAtencion] = useState(vistaInicial.atencion || '');
  const [filtroRegistroTipo, setFiltroRegistroTipo] = useState(vistaInicial.registroTipo);
  const [filtroRegistroCategoria, setFiltroRegistroCategoria] = useState(vistaInicial.registroCategoria);
  const [filtroRegistroPeriodo, setFiltroRegistroPeriodo] = useState(vistaInicial.registroPeriodo);
  const [filtroRegistroDesde, setFiltroRegistroDesde] = useState('');
  const [filtroRegistroHasta, setFiltroRegistroHasta] = useState('');
  const [filtroSinTenant, setFiltroSinTenant] = useState(!!vistaInicial.sinTenant);
  const [filtroTenantId, setFiltroTenantId] = useState(
    vistaInicial.tenantId != null ? vistaInicial.tenantId : ''
  );
  const [tenantsSuper, setTenantsSuper] = useState([]);
  const [markers, setMarkers] = useState([]);
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({ total: 0, hasMore: false, limit: 20 });
  const [operariosLista, setOperariosLista] = useState([]);
  const [operariosTenants, setOperariosTenants] = useState([]);
  const [nuevoOperarioEmail, setNuevoOperarioEmail] = useState('');
  const [nuevoOperarioTenantId, setNuevoOperarioTenantId] = useState('');
  const [stats, setStats] = useState({
    total: 0,
    reportes: 0,
    perdidas: 0,
    porAprobar: 0,
    enProceso: 0,
    cierresPendientes: 0,
    registro: 0,
    nuevosReportes: 0,
    nuevasPerdidas: 0,
    urgentes: 0,
    resueltosVecino: 0,
    respuestasDatos: 0,
    derivados: 0,
    nuevosDerivados: 0,
  });
  const [cargando, setCargando] = useState(true);
  const [accionando, setAccionando] = useState(false);
  const [aviso, setAviso] = useState('');
  const [mapaCaso, setMapaCaso] = useState(null);
  const [roleInfo, setRoleInfo] = useState({ role: '', jurisdictions: [] });
  const [casoDetalle, setCasoDetalle] = useState(null);
  const [verResolucion, setVerResolucion] = useState(false);
  const [dialogo, setDialogo] = useState(null); // { tipo, marker }
  const [dialogoTexto, setDialogoTexto] = useState('');
  const [dialogoError, setDialogoError] = useState('');
  // IDs de casos recién aprobados a sombrear al abrir Reportes / Cosas perdidas
  const [idsNuevosDestacados, setIdsNuevosDestacados] = useState(() => new Set());
  // Mientras está abierta la ficha, seguir mostrando el aviso aunque ya se marcó vista
  const [avisoRespuestaCasoId, setAvisoRespuestaCasoId] = useState(null);
  const seccionVistosRef = useRef('');
  const respuestaVistaRef = useRef('');

  const headers = useMemo(() => ({ 'x-user-id': userId }), [userId]);

  const mostrarAviso = (texto) => {
    setAviso(texto);
    setTimeout(() => setAviso(''), 3500);
  };

  const abrirDialogo = (tipo, marker = caso) => {
    if (!marker || accionando) return;
    setDialogo({ tipo, marker });
    setDialogoTexto('');
    setDialogoError('');
  };

  const cerrarDialogo = () => {
    if (accionando) return;
    setDialogo(null);
    setDialogoTexto('');
    setDialogoError('');
  };

  useEffect(() => {
    const t = setTimeout(() => setBusquedaDebounced(busqueda.trim()), 350);
    return () => clearTimeout(t);
  }, [busqueda]);

  // Conservar sección / ficha abierta al refrescar
  useEffect(() => {
    try {
      sessionStorage.setItem(ADMIN_VISTA_KEY, JSON.stringify({
        seccion,
        casoId: casoId || null,
        atencion: filtroAtencion || '',
        estado: filtroEstado || 'pendiente',
        tenantId: filtroTenantId || '',
      }));
    } catch {
      /* ignore */
    }
  }, [seccion, casoId, filtroAtencion, filtroEstado, filtroTenantId]);

  const paramsLista = useMemo(() => {
    const params = { page, limit: 20 };
    const aplicarTenant = () => {
      if (!filtroSinTenant && filtroTenantId) params.tenantId = filtroTenantId;
    };
    if (!filtroSinTenant) {
      if (seccion === 'cosas_perdidas') params.category = 'cosas_perdidas';
      if (seccion === 'reportes') params.excludeCategory = 'cosas_perdidas';
    }
    // Registro: archivo histórico con filtros de búsqueda
    if (seccion === 'registro') {
      params.eliminados = 1;
      if (filtroRegistroTipo) params.tipoCierre = filtroRegistroTipo;
      if (filtroRegistroCategoria === 'reportes') {
        // Compat: foco viejo “reportes” = todo menos cosas perdidas
        params.excludeCategory = 'cosas_perdidas';
      } else if (filtroRegistroCategoria) {
        params.category = filtroRegistroCategoria;
      }
      if (filtroRegistroPeriodo === 'personalizado') {
        if (filtroRegistroDesde) params.fechaDesde = filtroRegistroDesde;
        if (filtroRegistroHasta) params.fechaHasta = filtroRegistroHasta;
      } else if (filtroRegistroPeriodo) {
        params.periodoDias = filtroRegistroPeriodo;
      }
      aplicarTenant();
      if (busquedaDebounced) {
        params.q = busquedaDebounced;
        // Si escriben solo el número (#30), buscar por caseId exacto
        if (/^\d+$/.test(String(busquedaDebounced).trim())) {
          params.soloCaseId = 1;
        }
      }
      return params;
    }
    // Por aprobar: solo pendientes de revisión
    if (seccion === 'por_aprobar') {
      params.status = 'pendiente_aprobacion';
      aplicarTenant();
      if (busquedaDebounced) params.q = busquedaDebounced;
      return params;
    }
    // Derivados: oficina avisada, siguen en el mapa (no Registro)
    if (seccion === 'derivados') {
      params.atencion = 'derivados';
      aplicarTenant();
      if (busquedaDebounced) params.q = busquedaDebounced;
      return params;
    }
    // Mapa: todos los estados activos (sin filtro de estado)
    if (seccion === 'mapa') {
      params.limit = 80;
      aplicarTenant();
      if (busquedaDebounced) params.q = busquedaDebounced;
      return params;
    }
    if (
      filtroAtencion === 'urgentes'
      || filtroAtencion === 'resolucion'
      || filtroAtencion === 'respuestas'
      || filtroAtencion === 'cierres'
    ) {
      params.atencion = filtroAtencion;
      aplicarTenant();
      if (busquedaDebounced) params.q = busquedaDebounced;
      return params;
    }
    if (filtroSinTenant) {
      params.sinTenant = 1;
    } else {
      params.status = filtroEstado || 'pendiente';
      // Reportes / Cosas: no mezclar casos ya derivados a oficina
      if (seccion === 'reportes' || seccion === 'cosas_perdidas') {
        params.excludeAvisados = 1;
      }
      aplicarTenant();
    }
    if (busquedaDebounced) params.q = busquedaDebounced;
    return params;
  }, [
    seccion,
    page,
    filtroEstado,
    filtroAtencion,
    filtroRegistroTipo,
    filtroRegistroCategoria,
    filtroRegistroPeriodo,
    filtroRegistroDesde,
    filtroRegistroHasta,
    filtroTenantId,
    filtroSinTenant,
    busquedaDebounced,
    roleInfo.role,
    onVolverSuper,
  ]);

  const cargarAuthYStats = useCallback(async () => {
    if (!userId) return;
    try {
      const [authRes, statsRes] = await Promise.all([
        axios.get(`${API}/api/auth/me`, { headers }),
        axios.get(`${API}/api/markers/admin/stats`, { headers }),
      ]);
      setRoleInfo({
        role: authRes.data.role || '',
        jurisdictions: authRes.data.jurisdictions || [],
      });
      setStats(statsRes.data || {});
    } catch (err) {
      console.error(err);
    }
  }, [userId, headers]);

  const cargarLista = useCallback(async () => {
    if (!userId) return;
    if (seccion === 'inicio') {
      setCargando(false);
      return;
    }
    setCargando(true);
    try {
      const params = { ...paramsLista };
      if (seccion === 'mapa') {
        params.page = 1;
        delete params.excludeCategory;
        delete params.category;
        delete params.status;
      }
      const { data } = await axios.get(`${API}/api/markers/admin`, { headers, params });
      const items = (data.items || []).map((m) => ({ ...m, canManage: true }));
      setMarkers((prev) => {
        // No pisar la ficha abierta si la página actual no la trae
        if (!casoId) return items;
        const abierto = prev.find((m) => String(m._id) === String(casoId));
        if (!abierto) return items;
        if (items.some((m) => String(m._id) === String(casoId))) return items;
        return [abierto, ...items];
      });
      setMeta({
        total: data.total || items.length,
        hasMore: !!data.hasMore,
        limit: data.limit || 20,
      });

      // Primera carga de Reportes / Cosas / Derivados: sombrear nuevos y bajar el badge
      if (
        (seccion === 'reportes' || seccion === 'cosas_perdidas' || seccion === 'derivados')
        && seccionVistosRef.current !== seccion
      ) {
        seccionVistosRef.current = seccion;
        if (seccion === 'derivados') {
          // Sombrear no vistos (true) o legacy sin flag; siempre limpiar badge al abrir
          const nuevosDeriv = items.filter((m) => (
            Boolean(m.avisadoAt)
            && !m.eliminadoAt
            && m.nuevoDerivadoParaAdmin !== false
          )).map((m) => String(m._id));
          if (nuevosDeriv.length) {
            setIdsNuevosDestacados(new Set(nuevosDeriv));
          }
          setMarkers(items.map((m) => (
            m.avisadoAt ? { ...m, nuevoDerivadoParaAdmin: false } : m
          )));
          setStats((prev) => ({ ...prev, nuevosDerivados: 0 }));
          axios.patch(
            `${API}/api/markers/admin/marcar-vistos`,
            { seccion: 'derivados' },
            { headers }
          ).then(() => cargarAuthYStats()).catch(() => {});
        } else {
          const nuevos = items.filter((m) => m.nuevoParaAdmin).map((m) => String(m._id));
          if (nuevos.length) {
            setIdsNuevosDestacados(new Set(nuevos));
            setMarkers(items.map((m) => (
              m.nuevoParaAdmin ? { ...m, nuevoParaAdmin: false } : m
            )));
            axios.patch(
              `${API}/api/markers/admin/marcar-vistos`,
              { seccion },
              { headers }
            ).then(() => cargarAuthYStats()).catch(() => {});
          }
        }
      }
    } catch (err) {
      mostrarAviso(err.response?.data?.message || 'No se pudo cargar el panel');
    } finally {
      setCargando(false);
    }
  }, [userId, headers, paramsLista, seccion, casoId, cargarAuthYStats]);

  useEffect(() => {
    cargarAuthYStats();
    const timer = setInterval(cargarAuthYStats, 15000);
    return () => clearInterval(timer);
  }, [cargarAuthYStats]);

  useEffect(() => {
    setPage(1);
  }, [
    seccion,
    filtroEstado,
    filtroAtencion,
    filtroRegistroTipo,
    filtroRegistroCategoria,
    filtroRegistroPeriodo,
    filtroRegistroDesde,
    filtroRegistroHasta,
    filtroTenantId,
    filtroSinTenant,
    busquedaDebounced,
  ]);

  const esSuperOperando = roleInfo.role === 'SUPER_ADMIN' || Boolean(onVolverSuper);
  const tenantsSuperListosRef = useRef(false);

  useEffect(() => {
    if (!userId || !esSuperOperando) return undefined;
    let cancelado = false;
    axios.get(`${API}/api/super/jurisdicciones`, {
      headers,
      params: { status: 'active' },
    }).then(({ data }) => {
      if (cancelado) return;
      const items = (data.items || [])
        .filter((t) => t.type === 'municipality' || t.type === 'commune')
        .sort((a, b) => {
          const tipo = String(a.typeLabel || '').localeCompare(String(b.typeLabel || ''));
          if (tipo !== 0) return tipo;
          return a.name.localeCompare(b.name);
        });
      setTenantsSuper(items);
      if (!tenantsSuperListosRef.current && items.length) {
        tenantsSuperListosRef.current = true;
        // Solo default al primer municipio si no vino foco/sesión
        if (vistaInicial.tenantId == null) {
          setFiltroTenantId(items[0].id);
        }
      }
    }).catch(() => {
      if (!cancelado) setTenantsSuper([]);
    });
    return () => { cancelado = true; };
  }, [userId, headers, esSuperOperando]);

  useEffect(() => {
    cargarLista();
  }, [cargarLista]);

  const perteneceASeccion = useCallback((m, sec = seccion) => {
    if (!m) return false;
    if (sec === 'por_aprobar') {
      return m.status === 'pendiente_aprobacion' && !m.eliminadoAt;
    }
    if (sec === 'registro') {
      return Boolean(m.eliminadoAt) || m.status === 'resuelto' || m.status === 'rechazado';
    }
    if (sec === 'derivados') {
      return Boolean(m.avisadoAt) && !m.eliminadoAt
        && m.status !== 'resuelto' && m.status !== 'rechazado' && m.status !== 'pendiente_aprobacion';
    }
    if (sec === 'cosas_perdidas') {
      if (m.eliminadoAt || m.status === 'pendiente_aprobacion' || m.status === 'rechazado') return false;
      if (m.avisadoAt) return false;
      return m.category === 'cosas_perdidas';
    }
    if (sec === 'reportes') {
      if (m.eliminadoAt || m.status === 'pendiente_aprobacion' || m.status === 'rechazado') return false;
      if (m.category === 'cosas_perdidas') return false;
      if (m.avisadoAt) return false;
      if (filtroEstado && m.status !== filtroEstado) return false;
      return true;
    }
    return true;
  }, [seccion, filtroEstado]);

  const actualizarLocal = (actualizado) => {
    const merged = { ...actualizado, canManage: true };
    setMarkers((prev) => {
      if (!perteneceASeccion(merged)) {
        return prev.filter((m) => m._id !== merged._id);
      }
      const existe = prev.some((m) => m._id === merged._id);
      if (!existe) return [merged, ...prev];
      return prev.map((m) => (m._id === merged._id ? { ...m, ...merged } : m));
    });
    setCasoDetalle((prev) => {
      if (!prev || prev._id !== merged._id) return prev;
      if (!perteneceASeccion(merged)) return null;
      return { ...prev, ...merged };
    });
    if (!perteneceASeccion(merged) && casoId === merged._id) {
      setCasoId(null);
    }
    cargarAuthYStats();
  };

  const lista = markers;
  const caso = casoDetalle && String(casoDetalle._id) === String(casoId)
    ? casoDetalle
    : (markers.find((m) => String(m._id) === String(casoId)) || null);

  useEffect(() => {
    const nroPendiente = caseNumberFocoRef.current;
    if (!casoId && !nroPendiente) {
      return undefined;
    }
    const enLista = casoId
      ? markers.find((m) => String(m._id) === String(casoId))
      : markers.find((m) => Number(m.caseId) === Number(nroPendiente));
    if (enLista) {
      setCasoDetalle(enLista);
      // Ya abrimos el caso: no reabrir al tocar Volver
      caseNumberFocoRef.current = null;
      if (String(enLista._id) !== String(casoId || '')) {
        setCasoId(String(enLista._id));
      }
      return undefined;
    }
    // Si no está en la página actual, buscar por id Mongo y/o número de caso
    let cancelado = false;
    const baseParams = {
      limit: 10,
      page: 1,
      ...(seccion === 'registro' ? { eliminados: 1 } : {}),
    };
    const pick = (items, idBuscado, nro) => {
      const lista = items || [];
      if (idBuscado) {
        const porId = lista.find((m) => String(m._id) === String(idBuscado));
        if (porId) return porId;
      }
      if (nro) {
        return lista.find((m) => Number(m.caseId) === Number(nro)) || null;
      }
      return null;
    };
    const cargarFicha = async () => {
      try {
        let found = null;
        if (casoId) {
          const { data } = await axios.get(`${API}/api/markers/admin`, {
            headers,
            params: { ...baseParams, q: String(casoId) },
          });
          found = pick(data.items, casoId, nroPendiente);
        }
        if (!found && nroPendiente) {
          const { data } = await axios.get(`${API}/api/markers/admin`, {
            headers,
            params: { ...baseParams, q: String(nroPendiente) },
          });
          found = pick(data.items, casoId, nroPendiente);
        }
        if (cancelado) return;
        if (found) {
          const listo = { ...found, canManage: true };
          caseNumberFocoRef.current = null;
          setCasoDetalle(listo);
          setCasoId(String(found._id));
          setMarkers((prev) => (
            prev.some((m) => String(m._id) === String(found._id))
              ? prev
              : [listo, ...prev]
          ));
          if (found.caseId) {
            const nro = String(found.caseId);
            setBusqueda((prev) => (prev === nro ? prev : nro));
            setBusquedaDebounced((prev) => (prev === nro ? prev : nro));
          }
        } else if (casoId && !nroPendiente) {
          // Solo cerrar si ya no hay foco pendiente por número
          setCasoDetalle(null);
          setCasoId(null);
        }
      } catch {
        if (!cancelado && casoId && !caseNumberFocoRef.current) {
          setCasoDetalle(null);
          setCasoId(null);
        }
      }
    };
    cargarFicha();
    return () => { cancelado = true; };
  }, [casoId, markers, headers, seccion]);

  // Al abrir una ficha con respuesta de datos, marcarla vista (baja el indicador)
  useEffect(() => {
    if (!casoId) {
      setAvisoRespuestaCasoId(null);
      return undefined;
    }
    if (!casoDetalle?.respuestaDatosAt || casoDetalle._id !== casoId) return undefined;
    if (respuestaVistaRef.current === casoId) return undefined;
    respuestaVistaRef.current = casoId;
    setAvisoRespuestaCasoId(casoId);
    const id = casoId;
    let cancelado = false;
    axios.patch(
      `${API}/api/markers/admin/${id}/visto-respuesta`,
      {},
      { headers }
    ).then(({ data }) => {
      if (cancelado) return;
      setMarkers((prev) => prev.map((m) => (
        m._id === id
          ? { ...m, ...data, respuestaDatosAt: null, nuevoParaAdmin: false }
          : m
      )));
      setCasoDetalle((prev) => (
        prev && prev._id === id
          ? { ...prev, ...data, respuestaDatosAt: null, nuevoParaAdmin: false }
          : prev
      ));
      cargarAuthYStats();
    }).catch(() => {});
    return () => { cancelado = true; };
  }, [casoId, casoDetalle?._id, casoDetalle?.respuestaDatosAt, headers, cargarAuthYStats]);

  useEffect(() => {
    if (!casoId) respuestaVistaRef.current = '';
  }, [casoId]);

  const irSeccion = (id, opciones = {}) => {
    if (id !== seccion) {
      seccionVistosRef.current = '';
      if (id !== 'reportes' && id !== 'cosas_perdidas' && id !== 'derivados') {
        setIdsNuevosDestacados(new Set());
      }
    }
    setSeccion(id);
    setCasoId(null);
    setCasoDetalle(null);
    setVerResolucion(false);
    setMapaCaso(null);
    setPage(1);
    setFiltroAtencion(opciones.atencion || '');
    setFiltroSinTenant(!!opciones.sinTenant);
    // Tras aprobar, los nuevos quedan en estado "pendiente"
    // Cosas perdidas: sin "en proceso" (flujo entre vecinos)
    if (id === 'reportes' || id === 'cosas_perdidas') {
      setFiltroEstado(
        id === 'cosas_perdidas'
          ? 'pendiente'
          : (opciones.atencion ? 'pendiente' : (opciones.estado || 'pendiente'))
      );
    }
    if (id === 'registro') {
      setFiltroRegistroTipo(
        Object.prototype.hasOwnProperty.call(opciones, 'registroTipo')
          ? opciones.registroTipo
          : 'resuelto'
      );
      setFiltroRegistroCategoria(
        Object.prototype.hasOwnProperty.call(opciones, 'registroCategoria')
          ? opciones.registroCategoria
          : 'reparaciones'
      );
      setFiltroRegistroPeriodo(
        Object.prototype.hasOwnProperty.call(opciones, 'registroPeriodo')
          ? opciones.registroPeriodo
          : '7'
      );
      setFiltroRegistroDesde('');
      setFiltroRegistroHasta('');
    }
    if (Object.prototype.hasOwnProperty.call(opciones, 'tenantId')) {
      setFiltroTenantId(String(opciones.tenantId || ''));
    } else if (Object.prototype.hasOwnProperty.call(opciones, 'registroTenantId')) {
      setFiltroTenantId(String(opciones.registroTenantId || ''));
    }
  };

  const selectJurisdiccionSuper = esSuperOperando ? (
    <select
      value={filtroTenantId}
      onChange={(e) => setFiltroTenantId(e.target.value)}
      aria-label="Municipio o comuna"
    >
      {tenantsSuper.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name} ({t.typeLabel})
        </option>
      ))}
      <option value="">Todas las jurisdicciones</option>
    </select>
  ) : null;

  const aprobar = async (marker = caso) => {
    if (!marker || accionando) return;
    setAccionando(true);
    try {
      const { data } = await axios.patch(`${API}/api/markers/admin/${marker._id}/approve`, {}, { headers });
      actualizarLocal(data);
      const esFamilia = data.category === 'familias' || data.category === 'persona';
      mostrarAviso(
        data.category === 'cosas_perdidas'
          ? `Caso #${data.caseId} aprobado · pasó a Cosas perdidas`
          : esFamilia
            ? `Caso #${data.caseId} aprobado (privado) · pasó a Reportes`
            : `Caso #${data.caseId} aprobado · pasó a Reportes (Publicado)`
      );
    } catch (err) {
      mostrarAviso(err.response?.data?.message || 'No se pudo aprobar');
    } finally {
      setAccionando(false);
    }
  };

  const cambiarEstado = async (status, marker = caso, descripcion = '') => {
    if (!marker || accionando) return;
    if (status === 'resuelto') {
      abrirDialogo('cerrar', marker);
      return;
    }
    setAccionando(true);
    try {
      const { data } = await axios.patch(
        `${API}/api/markers/admin/${marker._id}/status`,
        { status, descripcion },
        { headers }
      );
      actualizarLocal(data);
      mostrarAviso(`Estado → ${STATUS_LABEL[status] || status}`);
    } catch (err) {
      mostrarAviso(err.response?.data?.message || 'No se pudo cambiar el estado');
    } finally {
      setAccionando(false);
    }
  };

  const pedirDatos = (marker = caso) => abrirDialogo('pedir_datos', marker);
  const avisarCuadrilla = (marker = caso) => abrirDialogo('avisar_cuadrilla', marker);

  const confirmarCierreCuadrilla = async (marker = caso) => {
    if (!marker || accionando) return;
    setAccionando(true);
    try {
      const { data } = await axios.patch(
        `${API}/api/markers/admin/${marker._id}/confirmar-cierre`,
        {},
        { headers }
      );
      actualizarLocal(data);
      mostrarAviso(`Caso #${data.caseId} confirmado · pasó al Registro`);
      irSeccion('registro');
    } catch (err) {
      mostrarAviso(err.response?.data?.message || 'No se pudo confirmar');
    } finally {
      setAccionando(false);
    }
  };

  const reabrirCierreCuadrilla = (marker = caso) => abrirDialogo('reabrir_cierre', marker);

  const cargarOperarios = useCallback(async () => {
    if (!userId || roleInfo.role === 'SUPER_ADMIN') return;
    try {
      const { data } = await axios.get(`${API}/api/markers/admin/operarios`, { headers });
      setOperariosLista(data.items || []);
      setOperariosTenants(data.tenants || []);
      if (!nuevoOperarioTenantId && (data.tenants || []).length) {
        setNuevoOperarioTenantId(data.tenants[0].id);
      }
    } catch {
      setOperariosLista([]);
      setOperariosTenants([]);
    }
  }, [userId, headers, roleInfo.role, nuevoOperarioTenantId]);

  useEffect(() => {
    if (seccion === 'operarios') cargarOperarios();
  }, [seccion, cargarOperarios]);

  const asignarOperario = async (event) => {
    event.preventDefault();
    if (accionando) return;
    const email = nuevoOperarioEmail.trim().toLowerCase();
    if (!email || !nuevoOperarioTenantId) {
      mostrarAviso('Completá email y jurisdicción');
      return;
    }
    setAccionando(true);
    try {
      const { data } = await axios.post(
        `${API}/api/markers/admin/operarios`,
        { email, tenantId: nuevoOperarioTenantId },
        { headers }
      );
      mostrarAviso(data.message || 'Operario asignado');
      setNuevoOperarioEmail('');
      await cargarOperarios();
    } catch (err) {
      mostrarAviso(err.response?.data?.message || 'No se pudo asignar');
    } finally {
      setAccionando(false);
    }
  };

  const quitarOperario = async (item) => {
    if (accionando) return;
    setAccionando(true);
    try {
      await axios.delete(`${API}/api/markers/admin/operarios`, {
        headers,
        data: { email: item.email, tenantId: item.tenantId },
      });
      mostrarAviso(`Se quitó ${item.email}`);
      await cargarOperarios();
    } catch (err) {
      mostrarAviso(err.response?.data?.message || 'No se pudo quitar');
    } finally {
      setAccionando(false);
    }
  };

  const rechazarCaso = (marker = caso) => {
    if (!marker || accionando) return;
    abrirDialogo(
      marker.status === 'pendiente_aprobacion' ? 'no_aprobar' : 'anular',
      marker
    );
  };

  const confirmarDialogo = async () => {
    if (!dialogo?.marker || accionando) return;
    const { tipo, marker } = dialogo;
    const texto = String(dialogoTexto || '').trim();

    if (
      tipo === 'pedir_datos'
      || tipo === 'cerrar'
      || tipo === 'avisar_cuadrilla'
      || tipo === 'anular'
      || tipo === 'no_aprobar'
    ) {
      if (texto.length < 5) {
        setDialogoError('Escribí al menos unas palabras');
        return;
      }
    }

    setDialogoError('');
    setAccionando(true);
    try {
      if (tipo === 'pedir_datos') {
        const { data } = await axios.patch(
          `${API}/api/markers/admin/${marker._id}/pedir-datos`,
          { mensaje: texto },
          { headers }
        );
        actualizarLocal(data);
        mostrarAviso('Pedido enviado al vecino');
      } else if (tipo === 'avisar_cuadrilla') {
        const { data } = await axios.patch(
          `${API}/api/markers/admin/${marker._id}/avisar-cuadrilla`,
          { mensaje: texto },
          { headers }
        );
        actualizarLocal(data);
        mostrarAviso('Aviso enviado a la cuadrilla');
      } else if (tipo === 'reabrir_cierre') {
        const { data } = await axios.patch(
          `${API}/api/markers/admin/${marker._id}/reabrir-cierre`,
          { mensaje: texto },
          { headers }
        );
        actualizarLocal(data);
        mostrarAviso(`Caso #${data.caseId} reabierto · en proceso`);
        setFiltroAtencion('');
        setFiltroEstado('en_proceso');
      } else if (tipo === 'cerrar') {
        const { data } = await axios.patch(
          `${API}/api/markers/admin/${marker._id}/status`,
          { status: 'resuelto', descripcion: texto },
          { headers }
        );
        actualizarLocal(data);
        setDialogo(null);
        setDialogoTexto('');
        mostrarAviso(`Caso #${data.caseId || marker.caseId} cerrado · pasó al Registro`);
        irSeccion('registro');
        return;
      } else if (tipo === 'anular' || tipo === 'no_aprobar') {
        const { data } = await axios.patch(
          `${API}/api/markers/admin/${marker._id}/rechazar`,
          { motivo: texto },
          { headers }
        );
        actualizarLocal(data);
        setDialogo(null);
        setDialogoTexto('');
        mostrarAviso(
          tipo === 'no_aprobar'
            ? 'Caso no aprobado · pasó al Registro'
            : 'Caso anulado · pasó al Registro'
        );
        irSeccion('registro');
        setFiltroRegistroTipo('anulado');
        return;
      }
      setDialogo(null);
      setDialogoTexto('');
    } catch (err) {
      setDialogoError(err.response?.data?.message || 'No se pudo completar la acción');
    } finally {
      setAccionando(false);
    }
  };

  const avisarOficina = (marker = caso) => {
    if (!marker || marker.avisadoAt) return;
    if (marker.status === 'pendiente_aprobacion') {
      mostrarAviso('Primero aprobá el aviso y después podés avisar a la oficina.', true);
      return;
    }
    abrirDialogo('avisar_oficina', marker);
  };

  const confirmarAvisarOficina = async (marker) => {
    if (!marker || accionando) return;
    setAccionando(true);
    setDialogoError('');
    try {
      const { data } = await axios.patch(
        `${API}/api/markers/admin/${marker._id}/avisar`,
        {},
        { headers }
      );
      actualizarLocal(data);
      setDialogo(null);
      setDialogoTexto('');
      const esFamilia = data.category === 'familias' || data.category === 'persona'
        || marker.category === 'familias' || marker.category === 'persona';
      if (esFamilia && data.eliminadoAt) {
        mostrarAviso(`Caso #${data.caseId || marker.caseId}: oficina avisada · pasó al Registro`);
        irSeccion('registro');
        return;
      }
      // Abandonados: siguen en el mapa → Derivados
      mostrarAviso(`Caso #${data.caseId || marker.caseId}: oficina avisada · sigue en el mapa`);
      irSeccion('derivados');
      return;
    } catch (err) {
      setDialogoError(err.response?.data?.message || 'No se pudo registrar el aviso');
    } finally {
      setAccionando(false);
    }
  };

  const verEnMapa = (marker) => {
    if (!marker) return;
    // Muestra el mapa dentro del recuadro de la ficha (sin salir del admin)
    setMapaCaso(marker);
    // Subir al tope para que la ficha/mapa quede a la vista, centrada
    window.requestAnimationFrame(() => {
      const panel = document.querySelector('.admin-dash-contenido');
      if (panel) panel.scrollTo({ top: 0, behavior: 'smooth' });
    });
  };

  const volverAFichaDesdeMapa = () => {
    setMapaCaso(null);
  };

  useEffect(() => {
    // Si cambia de caso, cerrar el mapa embebido
    setMapaCaso(null);
  }, [casoId]);

  const viendoMapaEnFicha = Boolean(caso && mapaCaso && mapaCaso._id === caso._id);
  const fechaAvisoRespuesta = caso
    ? fechaCortaAviso(caso.ultimaRespuestaDatosAt || caso.respuestaDatosAt)
    : '';
  const tituloIntercambioDatos = caso && !caso.pideDatosAt
    && (caso.respuestaDatosMensaje || caso.respuestaDatosImageUrl || caso.ultimaRespuestaDatosAt)
    ? 'Respuesta del vecino'
    : 'Pedido de datos';

  const tituloSeccion = filtroAtencion === 'urgentes'
    ? 'Urgentes · varios vecinos'
    : filtroAtencion === 'resolucion'
      ? 'Resolución reportada por vecino'
      : filtroAtencion === 'respuestas'
        ? 'Respondieron al pedido de datos'
        : filtroAtencion === 'cierres'
          ? 'Cierres propuestos por la cuadrilla'
          : ({
            inicio: 'Dashboard',
            reportes: 'Reportes',
            cosas_perdidas: 'Cosas perdidas',
            por_aprobar: 'Por aprobar',
            derivados: 'Derivados a oficina',
            registro: 'Registro',
            mapa: 'Mapa',
            operarios: 'Cuadrilla / Operarios',
          }[seccion] || 'Dashboard');

  const totalPaginas = Math.max(1, Math.ceil((meta.total || 0) / (meta.limit || 20)));

  const textoAdminSidebar = roleInfo.role === 'SUPER_ADMIN'
    ? 'Super administrador'
    : ((roleInfo.jurisdictions || []).map((j) => j.name).filter(Boolean).join(', ') || 'Tu jurisdicción');

  const renderLista = () => (
    <div className="admin-dash-lista-wrap">
      <header className="admin-dash-lista-cabecera">
        <div>
          <h1>{tituloSeccion}</h1>
          <p className="admin-dash-sub">
            {seccion === 'por_aprobar'
              ? (meta.total
                ? `${meta.total} caso${meta.total === 1 ? '' : 's'} esperando revisión`
                : 'No hay casos pendientes de aprobación')
              : seccion === 'registro'
                ? (meta.total
                  ? `${meta.total} caso${meta.total === 1 ? '' : 's'} dados de baja (baja lógica)`
                  : 'Todavía no hay bajas en el registro')
                : seccion === 'derivados'
                  ? (meta.total
                    ? `${meta.total} caso${meta.total === 1 ? '' : 's'} con oficina avisada (siguen en el mapa)`
                    : 'Todavía no hay casos derivados a oficina')
                  : `Mostrando ${lista.length} de ${meta.total} casos${meta.hasMore ? ' · usá filtros o pasá de página' : ''}`}
          </p>
        </div>
        {(seccion !== 'por_aprobar' || esSuperOperando) && (
          <div className="admin-dash-filtros">
            <input
              type="search"
              placeholder={
                seccion === 'registro' && esSuperOperando
                  ? 'Buscar por #caso…'
                  : seccion === 'registro'
                    ? 'Buscar #caso, zona, objeto, motivo…'
                    : 'Buscar #caso…'
              }
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
            {esSuperOperando && !filtroSinTenant && selectJurisdiccionSuper}
            {seccion === 'registro' && (
              <>
                <select
                  value={filtroRegistroTipo}
                  onChange={(e) => setFiltroRegistroTipo(e.target.value)}
                  aria-label="Tipo de cierre"
                >
                  {REGISTRO_TIPO_CIERRE.map((opt) => (
                    <option key={opt.value || 'todos'} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                <select
                  value={filtroRegistroCategoria}
                  onChange={(e) => setFiltroRegistroCategoria(e.target.value)}
                  aria-label="Categoría"
                >
                  {REGISTRO_CATEGORIA.map((opt) => (
                    <option key={opt.value || 'todas'} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                <select
                  value={filtroRegistroPeriodo}
                  onChange={(e) => {
                    setFiltroRegistroPeriodo(e.target.value);
                    if (e.target.value !== 'personalizado') {
                      setFiltroRegistroDesde('');
                      setFiltroRegistroHasta('');
                    }
                  }}
                  aria-label="Período"
                >
                  {REGISTRO_PERIODO.map((opt) => (
                    <option key={opt.value || 'siempre'} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                {filtroRegistroPeriodo === 'personalizado' && (
                  <div className="admin-dash-fechas-rango" role="group" aria-label="Rango de fechas">
                    <label className="admin-dash-fecha">
                      <span>Desde</span>
                      <input
                        type="date"
                        value={filtroRegistroDesde}
                        max={filtroRegistroHasta || undefined}
                        onChange={(e) => setFiltroRegistroDesde(e.target.value)}
                        aria-label="Fecha desde"
                      />
                    </label>
                    <label className="admin-dash-fecha">
                      <span>Hasta</span>
                      <input
                        type="date"
                        value={filtroRegistroHasta}
                        min={filtroRegistroDesde || undefined}
                        onChange={(e) => setFiltroRegistroHasta(e.target.value)}
                        aria-label="Fecha hasta"
                      />
                    </label>
                  </div>
                )}
              </>
            )}
            {seccion !== 'registro'
              && seccion !== 'por_aprobar'
              && seccion !== 'derivados'
              && seccion !== 'mapa'
              && seccion !== 'cosas_perdidas'
              && !filtroAtencion && (
              <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}>
                {STATUS_OPTIONS_ACTIVOS.map((s) => (
                  <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                ))}
              </select>
            )}
            {filtroAtencion && (
              <button
                type="button"
                className="admin-dash-btn"
                onClick={() => setFiltroAtencion('')}
              >
                Quitar filtro:{' '}
                {filtroAtencion === 'urgentes'
                  ? 'Urgentes'
                  : filtroAtencion === 'respuestas'
                    ? 'Respondieron datos'
                    : filtroAtencion === 'cierres'
                      ? 'Cierres de cuadrilla'
                      : 'Resolución vecino'}
              </button>
            )}
            {filtroSinTenant && (
              <button
                type="button"
                className="admin-dash-btn"
                onClick={() => setFiltroSinTenant(false)}
              >
                Quitar filtro: Sin jurisdicción
              </button>
            )}
          </div>
        )}
      </header>
      {cargando ? (
        <p className="admin-dash-vacio">Cargando casos…</p>
      ) : !lista.length ? (
        <p className="admin-dash-vacio">
          {seccion === 'por_aprobar'
            ? 'No hay nada para aprobar por ahora.'
            : seccion === 'registro'
              ? 'No hay casos en el registro.'
              : 'No hay casos con esos filtros.'}
        </p>
      ) : (
        <>
          <ul className="admin-dash-lista admin-dash-tarjetas">
            {lista.map((m) => {
              const foto = m.imageUrl ? buildImageUrl(m.imageUrl) : null;
              const descripcion = String(m.description || '').trim();
              const direccion = String(m.direccion || '').trim();
              const esNuevo = idsNuevosDestacados.has(String(m._id)) || !!m.nuevoParaAdmin;
              const respondioDatos = Boolean(m.respuestaDatosAt);
              return (
                <li key={m._id}>
                  <button
                    type="button"
                    className={`tarjeta-mi-reporte admin-dash-tarjeta${esNuevo || respondioDatos ? ' admin-dash-tarjeta-nueva' : ''}`}
                    onClick={() => {
                      setVerResolucion(false);
                      setCasoId(m._id);
                    }}
                  >
                    {foto ? (
                      <img src={foto} alt="" className="tarjeta-mi-reporte-foto" />
                    ) : (
                      <span className="tarjeta-mi-reporte-sin-foto" aria-hidden="true">Sin foto</span>
                    )}
                    <span className="tarjeta-mi-reporte-info">
                      <strong>
                        Caso #{m.caseId || '—'}
                        {respondioDatos ? (
                          <em className="admin-dash-nuevo-etiqueta admin-dash-respondio-etiqueta">Respondió</em>
                        ) : esNuevo ? (
                          <em className="admin-dash-nuevo-etiqueta">Nuevo</em>
                        ) : null}
                      </strong>
                      <span className="tarjeta-mi-reporte-meta">{metaCasoLista(m)}</span>
                      <span className={`admin-dash-estado ${
                        seccion === 'registro' || m.eliminadoAt || m.status === 'resuelto' || m.status === 'rechazado'
                          ? claseEstadoRegistro(m)
                          : (m.avisadoAt && !m.eliminadoAt
                            ? 'admin-dash-estado-oficina_avisada'
                            : `admin-dash-estado-${m.status}`)
                      }`}
                      >
                        {seccion === 'registro' || m.eliminadoAt || m.status === 'resuelto' || m.status === 'rechazado'
                          ? etiquetaCierreRegistro(m)
                          : etiquetaEstadoAdmin(m)}
                      </span>
                      {direccion && (
                        <span className="tarjeta-mi-reporte-direccion">{direccion}</span>
                      )}
                      {descripcion && (
                        <span className="tarjeta-mi-reporte-desc">{descripcion}</span>
                      )}
                      <small>
                        {m.jurisdictionName || 'Sin municipio'}
                        {m.createdAt ? ` · ${fechaTexto(m.createdAt)}` : ''}
                        {m.eliminadoAt ? ` · Baja: ${fechaTexto(m.eliminadoAt)}` : ''}
                      </small>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="admin-dash-paginacion">
            <button
              type="button"
              className="admin-dash-btn"
              disabled={page <= 1 || cargando}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Anterior
            </button>
            <span>Página {page} de {totalPaginas}</span>
            <button
              type="button"
              className="admin-dash-btn"
              disabled={!meta.hasMore || cargando}
              onClick={() => setPage((p) => p + 1)}
            >
              Siguiente
            </button>
          </div>
        </>
      )}
    </div>
  );

  const breadcrumb = [
    'Inicio',
    seccion === 'reportes'
      || (caso && !caso.eliminadoAt && !caso.avisadoAt && caso.category !== 'cosas_perdidas'
        && seccion !== 'registro' && seccion !== 'derivados' && seccion !== 'por_aprobar')
      ? 'Reportes' : null,
    seccion === 'cosas_perdidas'
      || (caso && !caso.eliminadoAt && !caso.avisadoAt && caso.category === 'cosas_perdidas'
        && seccion !== 'registro' && seccion !== 'derivados')
      ? 'Cosas perdidas' : null,
    seccion === 'mapa' ? 'Mapa' : null,
    seccion === 'por_aprobar' ? 'Por aprobar' : null,
    seccion === 'derivados' || (caso && caso.avisadoAt && !caso.eliminadoAt) ? 'Derivados' : null,
    seccion === 'registro' || (caso && caso.eliminadoAt) ? 'Registro' : null,
    caso ? `Caso #${caso.caseId}` : null,
  ].filter(Boolean);

  const casoEnRegistro = Boolean(caso?.eliminadoAt);

  const navActivo = (id) => (
    seccion === id
    || (caso && id === 'derivados' && caso.avisadoAt && !caso.eliminadoAt)
    || (caso && id === 'cosas_perdidas' && caso.category === 'cosas_perdidas' && !caso.avisadoAt && !caso.eliminadoAt)
    || (caso && id === 'reportes' && caso.category !== 'cosas_perdidas' && !caso.avisadoAt && !caso.eliminadoAt)
  );

  return (
    <div className="admin-dash admin-dash-video admin-dash-root">
      <aside className="admin-dash-sidebar">
        <div className="admin-dash-brand">
          <img src={logoCiudad} alt="CiudadAr" className="admin-dash-brand-logo" />
          <div className="admin-dash-brand-texto">
            <small className="admin-dash-brand-rol">Administrador</small>
            <strong className="admin-dash-brand-jurisdiccion">{textoAdminSidebar}</strong>
          </div>
        </div>
        <nav className="admin-dash-nav">
          <button type="button" className={navActivo('inicio') && !caso ? 'activo' : ''} onClick={() => irSeccion('inicio')}>
            <IconoInicio /> Inicio
          </button>
          <button type="button" className={navActivo('reportes') ? 'activo' : ''} onClick={() => irSeccion('reportes')}>
            <IconoReportes /> Reportes
            {stats.nuevosReportes > 0 && <em className="admin-dash-tab-badge">{stats.nuevosReportes}</em>}
          </button>
          <button type="button" className={navActivo('cosas_perdidas') ? 'activo' : ''} onClick={() => irSeccion('cosas_perdidas')}>
            <IconoPerdidas /> Cosas perdidas
            {stats.nuevasPerdidas > 0 && <em className="admin-dash-tab-badge">{stats.nuevasPerdidas}</em>}
          </button>
          <button type="button" className={navActivo('por_aprobar') ? 'activo' : ''} onClick={() => irSeccion('por_aprobar')}>
            <IconoCheck /> Por aprobar
            {stats.porAprobar > 0 && <em className="admin-dash-tab-badge">{stats.porAprobar}</em>}
          </button>
          <button type="button" className={navActivo('derivados') ? 'activo' : ''} onClick={() => irSeccion('derivados')}>
            <IconoDerivados /> Derivados
            {stats.nuevosDerivados > 0 && (
              <em className="admin-dash-tab-badge">{stats.nuevosDerivados}</em>
            )}
          </button>
          <button type="button" className={navActivo('registro') ? 'activo' : ''} onClick={() => irSeccion('registro')}>
            <IconoRegistro /> Registro
          </button>
          {roleInfo.role === 'JURISDICTION_ADMIN' && (
            <button type="button" className={navActivo('operarios') ? 'activo' : ''} onClick={() => irSeccion('operarios')}>
              <IconoCuadrilla /> Cuadrilla
            </button>
          )}
        </nav>
        <div className="admin-dash-sidebar-pie">
          {onVolverSuper && (
            <button type="button" className="admin-dash-sidebar-sec" onClick={onVolverSuper}>
              <IconoInicio /> Panel super
            </button>
          )}
          {onSalirMapaVecino && (
            <button type="button" className="admin-dash-sidebar-sec" onClick={onSalirMapaVecino}>
              <IconoMapa /> Vista vecino
            </button>
          )}
          <button
            type="button"
            className="admin-dash-sidebar-salir"
            onClick={() => signOut(auth).catch(() => {})}
          >
            <IconoSalir /> Cerrar sesión
          </button>
        </div>
      </aside>

      <div className="admin-dash-contenido">
        <div className="admin-dash-breadcrumb">
          {onVolverSuper ? `Super › Casos › ${breadcrumb.slice(1).join(' › ') || 'Inicio'}` : breadcrumb.join(' › ')}
        </div>

        {aviso && <div className="admin-dash-toast">{aviso}</div>}

        <div className="admin-dash-panel">
          {caso ? (
            <div className={`admin-dash-detalle${viendoMapaEnFicha ? ' admin-dash-detalle-mapa' : ''}`}>
              <header className="admin-dash-detalle-cabecera">
                <div>
                  <button
                    type="button"
                    className="admin-dash-back"
                    onClick={() => {
                      if (viendoMapaEnFicha) {
                        volverAFichaDesdeMapa();
                        return;
                      }
                      cerrarFichaCaso();
                    }}
                  >
                    ← {viendoMapaEnFicha ? 'Volver a la ficha' : 'Volver'}
                  </button>
                  <h1>Caso #{caso.caseId}</h1>
                  <p className="admin-dash-sub">
                    {viendoMapaEnFicha
                      ? (caso.direccion || caso.jurisdictionName || 'Ubicación en el mapa')
                      : (caso.category === 'cosas_perdidas'
                        ? `${PERDIDA_LABEL[caso.perdidaTipo] || 'Aviso'} · ${caso.objeto || 'objeto'}${caso.jurisdictionName ? `, ${caso.jurisdictionName}` : ''}`
                        : `${CATEGORY_LABEL[caso.category] || caso.category}${caso.jurisdictionName ? ` · ${caso.jurisdictionName}` : ''}`)}
                  </p>
                </div>
                {!viendoMapaEnFicha && (
                  <span className={`admin-dash-estado ${
                    casoEnRegistro || caso.status === 'resuelto' || caso.status === 'rechazado'
                      ? claseEstadoRegistro(caso)
                      : `admin-dash-estado-${caso.status}`
                  }`}
                  >
                    {casoEnRegistro || caso.status === 'resuelto' || caso.status === 'rechazado'
                      ? etiquetaCierreRegistro(caso)
                      : etiquetaEstadoAdmin(caso)}
                  </span>
                )}
              </header>

              {viendoMapaEnFicha ? (
                <section className="admin-dash-card admin-dash-card-mapa">
                  <div className="admin-ficha-mapa">
                    <MapComponent
                      key={`solo-caso-${caso._id}`}
                      googleMapsApiKey={GOOGLE_MAPS_API_KEY}
                      currentUser={userId}
                      modoSoloCaso
                      focoCasoMapa={mapaCaso}
                      onCerrarSoloCaso={volverAFichaDesdeMapa}
                    />
                  </div>
                </section>
              ) : (
              <>
              {casoEnRegistro ? (
                <p className="admin-dash-aviso-registro">
                  Baja lógica · no aparece en el mapa · queda como historial
                </p>
              ) : (
                <>
                  {(caso.respuestaDatosAt || avisoRespuestaCasoId === caso._id) && (
                    <div className="admin-dash-aviso-respuesta" role="status">
                      <span>
                        {fechaAvisoRespuesta
                          ? `Nueva respuesta del vecino · ${fechaAvisoRespuesta}`
                          : 'Nueva respuesta del vecino'}
                      </span>
                      <button
                        type="button"
                        className="admin-dash-aviso-ver"
                        onClick={() => {
                          const nodo = document.getElementById('admin-respuesta-vecino');
                          if (!nodo) return;
                          nodo.scrollIntoView({ behavior: 'smooth', block: 'start' });
                          nodo.classList.add('admin-dash-intercambio-destacado');
                          window.setTimeout(
                            () => nodo.classList.remove('admin-dash-intercambio-destacado'),
                            1800
                          );
                        }}
                      >
                        Ver
                      </button>
                    </div>
                  )}
                  {caso.status === 'pendiente_cierre' && (
                    <div className="admin-dash-aviso-respuesta admin-dash-aviso-cierre">
                      <p>
                        <strong>La cuadrilla marcó el trabajo como terminado</strong>
                        {caso.cierrePropuestoPor ? ` · ${caso.cierrePropuestoPor}` : ''}.
                        {' '}Esperá tu OK para cerrar el caso.
                      </p>
                      {caso.resolutionDescription ? (
                        <p>
                          <strong>Qué hicieron:</strong>
                          {' '}
                          {caso.resolutionDescription}
                        </p>
                      ) : null}
                      <p>
                        Si está bien, usá <strong>Confirmar cierre</strong> (pasa al Registro).
                        Si falta algo, usá <strong>Reabrir · en proceso</strong>.
                      </p>
                    </div>
                  )}
                  {caso.notaCuadrilla && (
                    <aside className="admin-dash-msg-admin admin-dash-msg-admin-enviado" role="status">
                      <header className="admin-dash-msg-admin-cabecera">
                        <span className="admin-dash-msg-admin-etiqueta">Último aviso a la cuadrilla</span>
                        {caso.notaCuadrillaAt ? (
                          <time className="admin-dash-msg-admin-fecha" dateTime={caso.notaCuadrillaAt}>
                            {fechaTexto(caso.notaCuadrillaAt)}
                          </time>
                        ) : null}
                      </header>
                      <p className="admin-dash-msg-admin-cuerpo">{caso.notaCuadrilla}</p>
                      {caso.respuestaCuadrilla
                        && caso.respuestaCuadrillaAt
                        && (!caso.notaCuadrillaAt
                          || new Date(caso.respuestaCuadrillaAt) >= new Date(caso.notaCuadrillaAt)) && (
                        <div className="admin-dash-msg-admin-respuesta">
                          <span className="admin-dash-msg-admin-etiqueta admin-dash-msg-admin-etiqueta-respuesta">
                            Respuesta de la cuadrilla
                            {caso.respuestaCuadrillaPor ? ` · ${caso.respuestaCuadrillaPor}` : ''}
                          </span>
                          <p className="admin-dash-msg-admin-cuerpo">{caso.respuestaCuadrilla}</p>
                          <small>{fechaTexto(caso.respuestaCuadrillaAt)}</small>
                        </div>
                      )}
                      {caso.notaCuadrillaAt
                        && (!caso.respuestaCuadrillaAt
                          || new Date(caso.respuestaCuadrillaAt) < new Date(caso.notaCuadrillaAt)) && (
                        <p className="admin-dash-msg-admin-pendiente">Esperando respuesta de la cuadrilla</p>
                      )}
                    </aside>
                  )}
                  <div className="admin-dash-acciones">
                    {caso.status === 'pendiente_cierre' && (
                      <>
                        <button type="button" className="admin-dash-btn primario" onClick={() => confirmarCierreCuadrilla()} disabled={accionando}>
                          <IconoCheck /> Confirmar cierre
                        </button>
                        <button type="button" className="admin-dash-btn" onClick={() => reabrirCierreCuadrilla()} disabled={accionando}>
                          Reabrir · en proceso
                        </button>
                      </>
                    )}
                    {caso.status === 'pendiente_aprobacion' && (
                      <button type="button" className="admin-dash-btn primario" onClick={() => aprobar()} disabled={accionando}>
                        <IconoCheck /> Aprobar
                      </button>
                    )}
                    {caso.status === 'pendiente_aprobacion' && (
                      <button type="button" className="admin-dash-btn peligro" onClick={() => rechazarCaso()} disabled={accionando}>
                        <IconoX /> No aprobar
                      </button>
                    )}
                    {caso.status !== 'pendiente_aprobacion' && caso.status !== 'rechazado' && caso.status !== 'resuelto' && caso.status !== 'pendiente_cierre' && (
                      <button type="button" className="admin-dash-btn peligro" onClick={() => rechazarCaso()} disabled={accionando}>
                        <IconoX /> Anular
                      </button>
                    )}
                    {caso.category !== 'cosas_perdidas'
                      && caso.status !== 'pendiente_aprobacion'
                      && caso.status !== 'resuelto'
                      && caso.status !== 'rechazado'
                      && caso.status !== 'pendiente_cierre' && (
                      <button type="button" className="admin-dash-btn" onClick={() => pedirDatos()} disabled={accionando}>
                        <IconoChat /> Pedir datos al vecino
                      </button>
                    )}
                    {caso.category === 'reparaciones'
                      && caso.status !== 'pendiente_aprobacion'
                      && caso.status !== 'resuelto'
                      && caso.status !== 'rechazado' && (
                      <button type="button" className="admin-dash-btn" onClick={() => avisarCuadrilla()} disabled={accionando}>
                        <IconoCuadrilla /> Avisar a cuadrilla
                      </button>
                    )}
                    {caso.category === 'reparaciones'
                      && caso.status === 'pendiente' && (
                      <button
                        type="button"
                        className="admin-dash-btn primario"
                        onClick={() => cambiarEstado('en_proceso')}
                        disabled={accionando}
                      >
                        <IconoCheck /> Pasar a en proceso
                      </button>
                    )}
                    {caso.category !== 'familias'
                      && caso.category !== 'persona'
                      && caso.status !== 'resuelto'
                      && caso.status !== 'rechazado'
                      && caso.status !== 'pendiente_aprobacion'
                      && caso.status !== 'pendiente_cierre' && (
                      <button type="button" className="admin-dash-btn" onClick={() => cambiarEstado('resuelto')} disabled={accionando}>
                        <IconoX /> Cerrar caso
                      </button>
                    )}
                    {casoRequiereOficina(caso)
                      && caso.status !== 'pendiente_aprobacion'
                      && caso.status !== 'rechazado'
                      && caso.status !== 'resuelto'
                      && !caso.eliminadoAt && (
                      <button
                        type="button"
                        className={`admin-dash-btn${caso.avisadoAt ? '' : ' primario'}`}
                        onClick={() => avisarOficina()}
                        disabled={accionando || !!caso.avisadoAt}
                      >
                        {caso.avisadoAt ? 'Oficina ya avisada' : 'Avisar oficina'}
                      </button>
                    )}
                    <button type="button" className="admin-dash-btn" onClick={() => verEnMapa(caso)}>
                      <IconoMapa /> Ver en el mapa
                    </button>
                  </div>
                </>
              )}

              <div className={`admin-dash-grid${caso.category === 'cosas_perdidas' ? ' con-chat' : ''}`}>
                <section className="admin-dash-card">
                  <h2>Detalles del caso</h2>
                  <dl className="admin-dash-dl">
                    <div>
                      <dt>Reportado por</dt>
                      <dd>{caso.createdBy || '—'}</dd>
                    </div>
                    <div>
                      <dt>Categoría</dt>
                      <dd>{lineaCategoria(caso).replace(/^Categoría:\s*/i, '')}</dd>
                    </div>
                    <div>
                      <dt>Fecha de reporte</dt>
                      <dd>{fechaTexto(caso.createdAt)}</dd>
                    </div>
                    {caso.eliminadoAt && (
                      <>
                        <div>
                          <dt>Fecha de baja</dt>
                          <dd>{fechaTexto(caso.eliminadoAt)}</dd>
                        </div>
                        <div>
                          <dt>Dado de baja por</dt>
                          <dd>{caso.eliminadoPor || '—'}</dd>
                        </div>
                        <div className="ancho">
                          <dt>Motivo de baja</dt>
                          <dd>{caso.motivoEliminacion || '—'}</dd>
                        </div>
                      </>
                    )}
                    {caso.category === 'cosas_perdidas' && (
                      <div>
                        <dt>Objeto</dt>
                        <dd>{caso.objeto || '—'}</dd>
                      </div>
                    )}
                    {caso.category === 'perros_gatos' && (
                      <div>
                        <dt>Contacto</dt>
                        <dd>
                          {caso.contacto || '—'}
                          {caso.contacto && (
                            <>
                              {' · '}
                              <a
                                className="btn-whatsapp admin-dash-wsp"
                                href={whatsappUrlAdmin(
                                  caso.contacto,
                                  `Hola, te escribo desde CiudadAr por el caso #${caso.caseId || ''}.`
                                )}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                WhatsApp
                              </a>
                            </>
                          )}
                        </dd>
                      </div>
                    )}
                    <div>
                      <dt>Ubicación</dt>
                      <dd>
                        {[caso.direccion, caso.jurisdictionName].filter(Boolean).join(' · ') || '—'}
                      </dd>
                    </div>
                    <div className="ancho">
                      <dt>Descripción</dt>
                      <dd>{caso.description || '—'}</dd>
                    </div>
                    {casoRequiereOficina(caso) && (
                      <div className="ancho">
                        <dt>Oficina a contactar</dt>
                        <dd>
                          {caso.avisadoAt ? (
                            <p className="admin-dash-oficina-avisada">
                              Ya avisada · {fechaTexto(caso.avisadoAt)}
                            </p>
                          ) : caso.status === 'pendiente_aprobacion' ? (
                            <p className="admin-dash-oficina-ayuda">
                              Primero aprobá el aviso. Después vas a poder avisar a la oficina.
                            </p>
                          ) : (
                            <p className="admin-dash-oficina-ayuda">
                              Llamá o escribí a la oficina. Cuando lo hayas hecho, usá «Avisar oficina» para registrarlo y avisarle al vecino.
                            </p>
                          )}
                          <div className="admin-dash-oficinas">
                            {oficinasParaCaso(caso).map((oficina) => {
                              const msg = mensajeParaOficina(caso);
                              const waPrincipal = whatsappDesdeHref(oficina.llamar?.href, msg);
                              return (
                                <div className="admin-dash-oficina" key={oficina.titulo}>
                                  <strong>{oficina.titulo}</strong>
                                  {oficina.detalle && <span>{oficina.detalle}</span>}
                                  <div className="admin-dash-oficina-acciones">
                                    {oficina.llamar?.href && (
                                      <a className="admin-dash-oficina-btn" href={oficina.llamar.href}>
                                        {oficina.llamar.texto || 'Llamar'}
                                      </a>
                                    )}
                                    {waPrincipal && (
                                      <a
                                        className="admin-dash-oficina-btn wsp"
                                        href={waPrincipal}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                      >
                                        WhatsApp
                                      </a>
                                    )}
                                  </div>
                                  {oficina.nota && <span className="admin-dash-oficina-nota">{oficina.nota}</span>}
                                  {(oficina.extras || []).length > 0 && (
                                    <div className="admin-dash-oficina-extras">
                                      {oficina.extras.map((extra) => {
                                        const waExtra = whatsappDesdeHref(extra.href, msg);
                                        return (
                                          <React.Fragment key={extra.href}>
                                            <a href={extra.href}>{extra.texto}</a>
                                            {waExtra && (
                                              <a
                                                href={waExtra}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                              >
                                                WhatsApp
                                              </a>
                                            )}
                                          </React.Fragment>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </dd>
                      </div>
                    )}
                    {caso.resolvedBy && (
                      <div className="ancho">
                        <dt>Aviso de resolución del vecino</dt>
                        <dd className="admin-dash-resolucion-resumen">
                          <span>
                            {caso.resolvedBy} · {fechaTexto(caso.resolvedByReportedAt)}
                          </span>
                          <button
                            type="button"
                            className="admin-dash-btn admin-dash-btn-ver"
                            onClick={() => setVerResolucion(true)}
                          >
                            Ver
                          </button>
                        </dd>
                      </div>
                    )}
                  </dl>
                  {caso.imageUrl && (
                    <img className="admin-dash-foto" src={buildImageUrl(caso.imageUrl)} alt="Foto del caso" />
                  )}
                </section>

                {(caso.pideDatosAt
                  || caso.ultimoPedidoDatosMensaje
                  || caso.respuestaDatosMensaje
                  || caso.respuestaDatosImageUrl
                  || caso.ultimaRespuestaDatosAt) && (
                  <section
                    id="admin-respuesta-vecino"
                    className="admin-dash-card admin-dash-intercambio-datos"
                  >
                    <h2>{tituloIntercambioDatos}</h2>
                    <div className="admin-dash-intercambio-bloque">
                      <h3>Lo que se pidió</h3>
                      {caso.pideDatosAt ? (
                        <>
                          <p>{caso.pideDatosMensaje || 'Se pidieron más datos.'}</p>
                          <small>
                            {fechaTexto(caso.pideDatosAt)}
                            {caso.pideDatosPor ? ` · ${caso.pideDatosPor}` : ''}
                            <span className="admin-dash-pedido-pendiente"> · esperando respuesta</span>
                          </small>
                        </>
                      ) : (
                        <>
                          <p>{caso.ultimoPedidoDatosMensaje || 'Se pidieron más datos.'}</p>
                          <small>
                            {fechaTexto(caso.ultimoPedidoDatosAt)}
                            {caso.ultimoPedidoDatosPor ? ` · ${caso.ultimoPedidoDatosPor}` : ''}
                          </small>
                        </>
                      )}
                    </div>
                    {!caso.pideDatosAt && (caso.respuestaDatosMensaje || caso.respuestaDatosImageUrl || caso.ultimaRespuestaDatosAt) && (
                      <div className="admin-dash-intercambio-bloque admin-dash-intercambio-respuesta">
                        <h3>Respuesta del vecino</h3>
                        {caso.respuestaDatosMensaje ? (
                          <p>{caso.respuestaDatosMensaje}</p>
                        ) : (
                          <p className="admin-dash-intercambio-sin-texto">Respondió con foto (sin texto).</p>
                        )}
                        <small>{fechaTexto(caso.ultimaRespuestaDatosAt || caso.respuestaDatosAt)}</small>
                        {caso.respuestaDatosImageUrl && (
                          <img
                            className="admin-dash-foto"
                            src={buildImageUrl(
                              `${caso.respuestaDatosImageUrl}${caso.respuestaDatosImageUrl.includes('?') ? '&' : '?'}t=${caso.ultimaRespuestaDatosAt || Date.now()}`
                            )}
                            alt="Foto de la respuesta del vecino"
                          />
                        )}
                      </div>
                    )}
                  </section>
                )}

                {caso.category === 'cosas_perdidas' && (
                  <section className="admin-dash-card admin-dash-chat">
                    <ChatReclamo
                      markerId={caso._id}
                      caseId={caso.caseId}
                      userId={userId}
                      soloLectura
                    />
                  </section>
                )}
              </div>
              </>
              )}
            </div>
          ) : seccion === 'operarios' ? (
            <div className="super-seccion">
              <header className="super-seccion-cabecera">
                <div>
                  <h1>Cuadrilla / Operarios</h1>
                  <p>
                    Dan de alta a quienes van al terreno. Pueden tomar casos, pedir datos y proponer cierre;
                    vos confirmás el cierre.
                  </p>
                </div>
              </header>
              <form className="super-form-asignar" onSubmit={asignarOperario}>
                <input
                  type="email"
                  placeholder="email del operario…"
                  value={nuevoOperarioEmail}
                  onChange={(e) => setNuevoOperarioEmail(e.target.value)}
                  required
                />
                <select
                  value={nuevoOperarioTenantId}
                  onChange={(e) => setNuevoOperarioTenantId(e.target.value)}
                  required
                  aria-label="Municipio"
                >
                  {operariosTenants.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
                <button type="submit" className="admin-dash-btn admin-dash-btn-primario" disabled={accionando}>
                  Sumar operario
                </button>
              </form>
              {operariosLista.length === 0 ? (
                <p className="admin-dash-vacio">Todavía no hay operarios en tu jurisdicción.</p>
              ) : (
                <ul className="super-lista">
                  {operariosLista.map((o) => (
                    <li key={`${o.email}-${o.tenantId}`} className="super-tarjeta">
                      <div className="super-tarjeta-info">
                        <strong>{o.email}</strong>
                        <span className="super-meta">{o.tenantName}</span>
                      </div>
                      <div className="super-tarjeta-acciones">
                        <button type="button" className="admin-dash-btn" disabled={accionando} onClick={() => quitarOperario(o)}>
                          Quitar
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : seccion === 'inicio' ? (
            <div className="admin-dash-inicio">
              <h1>El administrador interviene</h1>
              <p>
                {roleInfo.role === 'SUPER_ADMIN'
                  ? 'Super administrador · todas las jurisdicciones'
                  : `Administrás ${(roleInfo.jurisdictions || []).map((j) => j.name).join(', ') || 'tu jurisdicción'}`}
              </p>

              <section className="admin-dash-bloque">
                <h2>Atención ya</h2>
                <div className="admin-dash-stats admin-dash-stats-atencion">
                  <button
                    type="button"
                    className={stats.porAprobar > 0 ? 'admin-dash-stat-alerta' : ''}
                    onClick={() => irSeccion('por_aprobar')}
                  >
                    <strong>{stats.porAprobar || 0}</strong>
                    <span>Por aprobar</span>
                  </button>
                  <button
                    type="button"
                    className={stats.urgentes > 0 ? 'admin-dash-stat-alerta' : ''}
                    onClick={() => irSeccion('reportes', { atencion: 'urgentes' })}
                  >
                    <strong>{stats.urgentes || 0}</strong>
                    <span>Varios vecinos</span>
                  </button>
                  <button
                    type="button"
                    className={stats.resueltosVecino > 0 ? 'admin-dash-stat-alerta' : ''}
                    onClick={() => irSeccion('reportes', { atencion: 'resolucion' })}
                  >
                    <strong>{stats.resueltosVecino || 0}</strong>
                    <span>Resolución del vecino</span>
                  </button>
                  <button
                    type="button"
                    className={stats.respuestasDatos > 0 ? 'admin-dash-stat-alerta' : ''}
                    onClick={() => irSeccion('reportes', { atencion: 'respuestas' })}
                  >
                    <strong>{stats.respuestasDatos || 0}</strong>
                    <span>Respondieron datos</span>
                  </button>
                  <button
                    type="button"
                    className={stats.cierresPendientes > 0 ? 'admin-dash-stat-alerta' : ''}
                    onClick={() => irSeccion('reportes', { atencion: 'cierres' })}
                  >
                    <strong>{stats.cierresPendientes || 0}</strong>
                    <span>Cierres de cuadrilla</span>
                  </button>
                </div>
              </section>

              <section className="admin-dash-bloque">
                <h2>Resumen</h2>
                <div className="admin-dash-stats admin-dash-stats-3">
                  <button type="button" onClick={() => irSeccion('reportes')}>
                    <strong>{stats.reportes || 0}</strong>
                    <span>Reportes</span>
                  </button>
                  <button type="button" onClick={() => irSeccion('cosas_perdidas')}>
                    <strong>{stats.perdidas || 0}</strong>
                    <span>Cosas perdidas</span>
                  </button>
                  <button type="button" onClick={() => irSeccion('registro')}>
                    <strong>{stats.registro || 0}</strong>
                    <span>Registro</span>
                  </button>
                </div>
              </section>

            </div>
          ) : (
            renderLista()
          )}
        </div>
      </div>

      {verResolucion && casoDetalle?.resolvedBy && (
        <div
          className="admin-dash-modal-fondo"
          role="dialog"
          aria-modal="true"
          aria-label="Resolución del vecino"
          onClick={() => setVerResolucion(false)}
        >
          <div
            className="admin-dash-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="admin-dash-modal-cabecera">
              <h2>Resolución del vecino</h2>
              <button
                type="button"
                className="admin-dash-btn"
                onClick={() => setVerResolucion(false)}
              >
                Cerrar
              </button>
            </div>
            <p className="admin-dash-modal-meta">
              {casoDetalle.resolvedBy}
              {casoDetalle.resolvedByReportedAt
                ? ` · ${fechaTexto(casoDetalle.resolvedByReportedAt)}`
                : ''}
            </p>
            <p className="admin-dash-modal-desc">
              {casoDetalle.resolutionDescription || 'Sin descripción.'}
            </p>
            {casoDetalle.resolutionImageUrl && (
              <img
                className="admin-dash-modal-foto"
                src={buildImageUrl(casoDetalle.resolutionImageUrl)}
                alt="Foto enviada por el vecino"
              />
            )}
          </div>
        </div>
      )}

      {dialogo?.marker && dialogo.tipo === 'avisar_oficina' && (() => {
        const m = dialogo.marker;
        const casoId = m.caseId ? `#${m.caseId}` : '';
        const oficinas = oficinasParaCaso(m);
        const msg = mensajeParaOficina(m);
        const esFamilia = m.category === 'familias' || m.category === 'persona';
        return (
          <div
            className="admin-dash-modal-fondo"
            role="dialog"
            aria-modal="true"
            aria-label="Avisar oficina"
            onClick={cerrarDialogo}
          >
            <div
              className="admin-dash-modal admin-dash-modal-accion admin-dash-modal-oficina"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="admin-dash-modal-cabecera">
                <h2>Avisar oficina</h2>
                <button
                  type="button"
                  className="admin-dash-btn"
                  onClick={cerrarDialogo}
                  disabled={accionando}
                >
                  Cancelar
                </button>
              </div>
              <p className="admin-dash-modal-meta">
                Caso {casoId} · contactá a la oficina (llamada o WhatsApp). Después confirmá acá para registrar el aviso
                {esFamilia ? ' y pasar el caso al Registro' : ''} · el vecino recibe la notificación.
              </p>
              <div className="admin-dash-oficinas">
                {oficinas.map((oficina) => {
                  const waPrincipal = whatsappDesdeHref(oficina.llamar?.href, msg);
                  return (
                    <div className="admin-dash-oficina" key={oficina.titulo}>
                      <strong>{oficina.titulo}</strong>
                      {oficina.detalle && <span>{oficina.detalle}</span>}
                      <div className="admin-dash-oficina-acciones">
                        {oficina.llamar?.href && (
                          <a className="admin-dash-oficina-btn" href={oficina.llamar.href}>
                            {oficina.llamar.texto || 'Llamar'}
                          </a>
                        )}
                        {waPrincipal && (
                          <a
                            className="admin-dash-oficina-btn wsp"
                            href={waPrincipal}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            WhatsApp con datos del caso
                          </a>
                        )}
                      </div>
                      {oficina.nota && <span className="admin-dash-oficina-nota">{oficina.nota}</span>}
                      {(oficina.extras || []).length > 0 && (
                        <div className="admin-dash-oficina-extras">
                          {oficina.extras.map((extra) => {
                            const waExtra = whatsappDesdeHref(extra.href, msg);
                            return (
                              <React.Fragment key={extra.href}>
                                <a href={extra.href}>{extra.texto}</a>
                                {waExtra && (
                                  <a href={waExtra} target="_blank" rel="noopener noreferrer">
                                    WhatsApp
                                  </a>
                                )}
                              </React.Fragment>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {dialogoError && (
                <p className="admin-dash-modal-error">{dialogoError}</p>
              )}
              <div className="admin-dash-modal-acciones">
                <button
                  type="button"
                  className="admin-dash-btn"
                  onClick={cerrarDialogo}
                  disabled={accionando}
                >
                  Volver
                </button>
                <button
                  type="button"
                  className="admin-dash-btn primario"
                  onClick={() => confirmarAvisarOficina(m)}
                  disabled={accionando}
                >
                  Ya avisé · registrar
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {dialogo?.marker && dialogo.tipo !== 'avisar_oficina' && (() => {
        const casoId = dialogo.marker.caseId ? `#${dialogo.marker.caseId}` : '';
        const cfg = {
          pedir_datos: {
            titulo: 'Pedir datos al vecino',
            meta: `Caso ${casoId} · el vecino recibe una notificación y puede responder`,
            label: '¿Qué datos necesitás?',
            placeholder: 'Ej: ¿Podés aclarar la dirección exacta o subir una foto más cercana?',
            obligatorio: true,
            confirmar: 'Enviar pedido',
            peligro: false,
          },
          avisar_cuadrilla: {
            titulo: 'Avisar a la cuadrilla',
            meta: `Caso ${casoId} · los operarios reciben el mensaje en Avisos (campanita)`,
            label: 'Mensaje o pedido de información',
            placeholder: 'Ej: ¿Pueden confirmar si ya fue reparado? / Priorizar este caso mañana…',
            obligatorio: true,
            confirmar: 'Enviar a cuadrilla',
            peligro: false,
          },
          reabrir_cierre: {
            titulo: 'Reabrir caso',
            meta: `Caso ${casoId} · vuelve a «en proceso» y se avisa a quien propuso el cierre`,
            label: 'Motivo o indicación (opcional)',
            placeholder: 'Ej: Falta foto del trabajo / no está completo…',
            obligatorio: false,
            confirmar: 'Reabrir',
            peligro: false,
          },
          cerrar: {
            titulo: 'Cerrar caso',
            meta: `Caso ${casoId} · saldrá del mapa, se notificará al vecino y quedará en Registro`,
            label: 'Descripción del cierre',
            placeholder: 'Ej: La cuadrilla reparó el bache el martes.',
            obligatorio: true,
            confirmar: 'Cerrar caso',
            peligro: false,
          },
          anular: {
            titulo: 'Anular caso',
            meta: `Caso ${casoId} · dejará de verse en el mapa, pasará al Registro y el vecino verá el motivo`,
            label: 'Motivo (lo recibe el vecino)',
            placeholder: 'Ej: Duplicado / información incorrecta…',
            obligatorio: true,
            confirmar: 'Anular',
            peligro: true,
          },
          no_aprobar: {
            titulo: 'No aprobar',
            meta: `Caso ${casoId} · no se publicará, pasará al Registro y el vecino verá el motivo`,
            label: 'Motivo (lo recibe el vecino)',
            placeholder: 'Ej: Falta información / fuera de jurisdicción…',
            obligatorio: true,
            confirmar: 'No aprobar',
            peligro: true,
          },
        }[dialogo.tipo] || null;
        if (!cfg) return null;
        return (
          <div
            className="admin-dash-modal-fondo"
            role="dialog"
            aria-modal="true"
            aria-label={cfg.titulo}
            onClick={cerrarDialogo}
          >
            <div
              className="admin-dash-modal admin-dash-modal-accion"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="admin-dash-modal-cabecera">
                <h2>{cfg.titulo}</h2>
                <button
                  type="button"
                  className="admin-dash-btn"
                  onClick={cerrarDialogo}
                  disabled={accionando}
                >
                  Cancelar
                </button>
              </div>
              <p className="admin-dash-modal-meta">{cfg.meta}</p>
              <label className="admin-dash-modal-campo">
                <span>{cfg.label}</span>
                <textarea
                  value={dialogoTexto}
                  onChange={(e) => {
                    setDialogoTexto(e.target.value);
                    if (dialogoError) setDialogoError('');
                  }}
                  rows={4}
                  placeholder={cfg.placeholder}
                  autoFocus
                  disabled={accionando}
                />
              </label>
              {dialogoError && (
                <p className="admin-dash-modal-error">{dialogoError}</p>
              )}
              <div className="admin-dash-modal-acciones">
                <button
                  type="button"
                  className="admin-dash-btn"
                  onClick={cerrarDialogo}
                  disabled={accionando}
                >
                  Volver
                </button>
                <button
                  type="button"
                  className={`admin-dash-btn${cfg.peligro ? ' peligro' : ' primario'}`}
                  onClick={confirmarDialogo}
                  disabled={accionando}
                >
                  {accionando ? 'Guardando…' : cfg.confirmar}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

export default AdminDashboard;
