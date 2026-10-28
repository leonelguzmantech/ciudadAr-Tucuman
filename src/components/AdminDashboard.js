import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { getAuth, signOut } from 'firebase/auth';
import appFirebase from './credenciales';
import logoCiudad from '../assets/ciudadar-logo-circulo-estilo.jpg';
import ChatReclamo from './ChatReclamo';
import MapComponent from './MapComponent';

const auth = getAuth(appFirebase);

const IconoInicio = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 3 4 9v12h5v-7h6v7h5V9z" /></svg>
);
const IconoReportes = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M6 2h9l5 5v15H6V2zm8 1.5V8h4.5L14 3.5zM8 12h8v2H8v-2zm0 4h8v2H8v-2z" /></svg>
);
const IconoPerdidas = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M10 4h4a2 2 0 0 1 2 2v1h3a1 1 0 0 1 1 1v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a1 1 0 0 1 1-1h3V6a2 2 0 0 1 2-2zm0 3h4V6h-4v1z" /></svg>
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
const IconoRegistro = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M5 3h11l5 5v13H5V3zm10 1.5V9h4.5L15 4.5zM7 12h10v1.6H7V12zm0 3.2h10V17H7v-1.8z" /></svg>
);
const API = 'http://localhost:5001';
const GOOGLE_MAPS_API_KEY = 'AIzaSyBKHbs5m_qsi4sd80epFp-mLP8KSFixk_4';

const STATUS_LABEL = {
  pendiente_aprobacion: 'Pendiente',
  pendiente: 'Publicado',
  en_proceso: 'En proceso',
  resuelto: 'Resuelto',
  rechazado: 'Rechazado',
};

// Filtro de Reportes / Cosas perdidas: solo casos activos en mapa
const STATUS_OPTIONS_ACTIVOS = ['pendiente', 'en_proceso'];

const REGISTRO_TIPO_CIERRE = [
  { value: '', label: 'Todo tipo de cierre' },
  { value: 'resuelto', label: 'Resuelto' },
  { value: 'anulado', label: 'Anulado' },
  { value: 'vencido', label: 'Vencido' },
];

const REGISTRO_CATEGORIA = [
  { value: '', label: 'Todas las categorías' },
  { value: 'reportes', label: 'Reportes' },
  { value: 'cosas_perdidas', label: 'Cosas perdidas' },
];

const REGISTRO_PERIODO = [
  { value: '', label: 'Cualquier fecha' },
  { value: '7', label: 'Últimos 7 días' },
  { value: '30', label: 'Últimos 30 días' },
  { value: '90', label: 'Últimos 90 días' },
  { value: 'personalizado', label: 'Personalizado' },
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
  persona: 'Persona en situación de calle',
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

/**
 * Panel admin de pantalla completa.
 * El mapa solo aparece en la pestaña Mapa o al pedir "Ver en el mapa" desde un caso.
 */
const AdminDashboard = ({ userId, onSalirMapaVecino }) => {
  const [seccion, setSeccion] = useState('inicio');
  const [casoId, setCasoId] = useState(null);
  const [busqueda, setBusqueda] = useState('');
  const [busquedaDebounced, setBusquedaDebounced] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('pendiente');
  const [filtroAtencion, setFiltroAtencion] = useState('');
  const [filtroRegistroTipo, setFiltroRegistroTipo] = useState('resuelto');
  const [filtroRegistroCategoria, setFiltroRegistroCategoria] = useState('reportes');
  const [filtroRegistroPeriodo, setFiltroRegistroPeriodo] = useState('7');
  const [filtroRegistroDesde, setFiltroRegistroDesde] = useState('');
  const [filtroRegistroHasta, setFiltroRegistroHasta] = useState('');
  const [markers, setMarkers] = useState([]);
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({ total: 0, hasMore: false, limit: 20 });
  const [stats, setStats] = useState({
    total: 0,
    reportes: 0,
    perdidas: 0,
    porAprobar: 0,
    enProceso: 0,
    registro: 0,
    nuevosReportes: 0,
    nuevasPerdidas: 0,
    urgentes: 0,
    resueltosVecino: 0,
    respuestasDatos: 0,
    recientes: [],
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

  const paramsLista = useMemo(() => {
    const params = { page, limit: 20 };
    if (seccion === 'cosas_perdidas') params.category = 'cosas_perdidas';
    if (seccion === 'reportes') params.excludeCategory = 'cosas_perdidas';
    // Registro: archivo histórico con filtros de búsqueda
    if (seccion === 'registro') {
      params.eliminados = 1;
      if (filtroRegistroTipo) params.tipoCierre = filtroRegistroTipo;
      if (filtroRegistroCategoria === 'cosas_perdidas') {
        params.category = 'cosas_perdidas';
      } else if (filtroRegistroCategoria === 'reportes') {
        params.excludeCategory = 'cosas_perdidas';
      }
      if (filtroRegistroPeriodo === 'personalizado') {
        if (filtroRegistroDesde) params.fechaDesde = filtroRegistroDesde;
        if (filtroRegistroHasta) params.fechaHasta = filtroRegistroHasta;
      } else if (filtroRegistroPeriodo) {
        params.periodoDias = filtroRegistroPeriodo;
      }
      if (busquedaDebounced) params.q = busquedaDebounced;
      return params;
    }
    // Por aprobar: solo pendientes de revisión, sin otros filtros
    if (seccion === 'por_aprobar') {
      params.status = 'pendiente_aprobacion';
      return params;
    }
    // Mapa: todos los estados activos (sin filtro de estado)
    if (seccion === 'mapa') {
      params.limit = 80;
      if (busquedaDebounced) params.q = busquedaDebounced;
      return params;
    }
    if (
      filtroAtencion === 'urgentes'
      || filtroAtencion === 'resolucion'
      || filtroAtencion === 'respuestas'
    ) {
      params.atencion = filtroAtencion;
      if (busquedaDebounced) params.q = busquedaDebounced;
      return params;
    }
    params.status = filtroEstado || 'pendiente';
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
    busquedaDebounced,
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
      setMarkers(items);
      setMeta({
        total: data.total || items.length,
        hasMore: !!data.hasMore,
        limit: data.limit || 20,
      });

      // Primera carga de Reportes / Cosas perdidas: sombrear nuevos y bajar el badge
      if (
        (seccion === 'reportes' || seccion === 'cosas_perdidas')
        && seccionVistosRef.current !== seccion
      ) {
        seccionVistosRef.current = seccion;
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
    } catch (err) {
      mostrarAviso(err.response?.data?.message || 'No se pudo cargar el panel');
    } finally {
      setCargando(false);
    }
  }, [userId, headers, paramsLista, seccion, cargarAuthYStats]);

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
    busquedaDebounced,
  ]);

  useEffect(() => {
    cargarLista();
  }, [cargarLista]);

  const actualizarLocal = (actualizado) => {
    setMarkers((prev) => prev.map((m) => (m._id === actualizado._id ? { ...m, ...actualizado, canManage: true } : m)));
    setCasoDetalle((prev) => (prev && prev._id === actualizado._id ? { ...prev, ...actualizado } : prev));
    cargarAuthYStats();
  };

  const lista = markers;
  const caso = casoDetalle && casoDetalle._id === casoId
    ? casoDetalle
    : (markers.find((m) => m._id === casoId) || null);

  useEffect(() => {
    if (!casoId) {
      setCasoDetalle(null);
      return;
    }
    const enLista = markers.find((m) => m._id === casoId);
    if (enLista) {
      setCasoDetalle(enLista);
      return;
    }
    // Si el caso no está en la página actual, pedirlo por admin list q=caseId
    let cancelado = false;
    axios.get(`${API}/api/markers/admin`, {
      headers,
      params: {
        q: String(casoId),
        limit: 5,
        page: 1,
        ...(seccion === 'registro' ? { eliminados: 1 } : {}),
      },
    }).then(({ data }) => {
      if (cancelado) return;
      const found = (data.items || []).find((m) => m._id === casoId);
      if (found) setCasoDetalle({ ...found, canManage: true });
      else setCasoId(null);
    }).catch(() => {
      if (!cancelado) setCasoId(null);
    });
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
      if (id !== 'reportes' && id !== 'cosas_perdidas') {
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
    // Tras aprobar, los nuevos quedan en estado "pendiente"
    if (id === 'reportes' || id === 'cosas_perdidas') {
      setFiltroEstado(opciones.atencion ? 'pendiente' : (opciones.estado || 'pendiente'));
    }
    if (id === 'registro') {
      setFiltroRegistroTipo('resuelto');
      setFiltroRegistroCategoria('reportes');
      setFiltroRegistroPeriodo('7');
      setFiltroRegistroDesde('');
      setFiltroRegistroHasta('');
    }
  };

  const abrirCasoDesdeInicio = (m) => {
    if (!m?._id) return;
    const destino = m.category === 'cosas_perdidas'
      ? 'cosas_perdidas'
      : (m.status === 'pendiente_aprobacion' ? 'por_aprobar' : 'reportes');
    setFiltroAtencion('');
    setSeccion(destino);
    setVerResolucion(false);
    setCasoId(m._id);
    setCasoDetalle({ ...m, canManage: true });
    setMapaCaso(null);
    setPage(1);
    if (destino === 'reportes' || destino === 'cosas_perdidas') {
      setFiltroEstado(m.status === 'pendiente_aprobacion' ? 'pendiente' : (m.status || 'pendiente'));
    }
  };


  const aprobar = async (marker = caso) => {
    if (!marker || accionando) return;
    setAccionando(true);
    try {
      const { data } = await axios.patch(`${API}/api/markers/admin/${marker._id}/approve`, {}, { headers });
      actualizarLocal(data);
      mostrarAviso(`Caso #${data.caseId} aprobado`);
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

    if (tipo === 'pedir_datos' || tipo === 'cerrar') {
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
        mostrarAviso('Pedido enviado · el caso sigue pendiente hasta que actúe el municipio');
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

  const avisarOficina = async (marker = caso) => {
    if (!marker || accionando) return;
    setAccionando(true);
    try {
      const { data } = await axios.patch(
        `${API}/api/markers/admin/${marker._id}/avisar`,
        {},
        { headers }
      );
      actualizarLocal(data);
      mostrarAviso('Se registró el aviso a la oficina');
    } catch (err) {
      mostrarAviso(err.response?.data?.message || 'No se pudo avisar');
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

  const tituloSeccion = filtroAtencion === 'urgentes'
    ? 'Urgentes · varios vecinos'
    : filtroAtencion === 'resolucion'
      ? 'Resolución reportada por vecino'
      : filtroAtencion === 'respuestas'
        ? 'Respondieron al pedido de datos'
      : ({
        inicio: 'Dashboard',
        reportes: 'Reportes',
        cosas_perdidas: 'Cosas perdidas',
        por_aprobar: 'Por aprobar',
        registro: 'Registro',
        mapa: 'Mapa',
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
                : `Mostrando ${lista.length} de ${meta.total} casos${meta.hasMore ? ' · usá filtros o pasá de página' : ''}`}
          </p>
        </div>
        {seccion !== 'por_aprobar' && (
          <div className="admin-dash-filtros">
            <input
              type="search"
              placeholder={seccion === 'registro'
                ? 'Buscar #caso, zona, objeto, motivo…'
                : 'Buscar #caso…'}
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
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
                  <>
                    <label className="admin-dash-fecha">
                      <span>Desde</span>
                      <input
                        type="date"
                        value={filtroRegistroDesde}
                        max={filtroRegistroHasta || undefined}
                        onChange={(e) => setFiltroRegistroDesde(e.target.value)}
                        aria-label="Desde"
                      />
                    </label>
                    <label className="admin-dash-fecha">
                      <span>Hasta</span>
                      <input
                        type="date"
                        value={filtroRegistroHasta}
                        min={filtroRegistroDesde || undefined}
                        onChange={(e) => setFiltroRegistroHasta(e.target.value)}
                        aria-label="Hasta"
                      />
                    </label>
                  </>
                )}
              </>
            )}
            {seccion !== 'registro' && seccion !== 'por_aprobar' && !filtroAtencion && (
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
                    : 'Resolución vecino'}
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
                      <span className={`admin-dash-estado ${m.eliminadoAt ? 'admin-dash-estado-eliminado' : `admin-dash-estado-${m.status}`}`}>
                        {m.eliminadoAt ? 'En registro' : (STATUS_LABEL[m.status] || m.status)}
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
    seccion === 'reportes' || (caso && !caso.eliminadoAt && caso.category !== 'cosas_perdidas' && seccion !== 'registro') ? 'Reportes' : null,
    seccion === 'cosas_perdidas' || (caso && !caso.eliminadoAt && caso.category === 'cosas_perdidas' && seccion !== 'registro') ? 'Cosas perdidas' : null,
    seccion === 'mapa' ? 'Mapa' : null,
    seccion === 'por_aprobar' ? 'Por aprobar' : null,
    seccion === 'registro' || (caso && caso.eliminadoAt) ? 'Registro' : null,
    caso ? `Caso #${caso.caseId}` : null,
  ].filter(Boolean);

  const casoEnRegistro = Boolean(caso?.eliminadoAt);

  const navActivo = (id) => (
    seccion === id || (caso && id === 'cosas_perdidas' && caso.category === 'cosas_perdidas')
    || (caso && id === 'reportes' && caso.category !== 'cosas_perdidas')
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
          <button type="button" className={navActivo('registro') ? 'activo' : ''} onClick={() => irSeccion('registro')}>
            <IconoRegistro /> Registro
          </button>
        </nav>
        <div className="admin-dash-sidebar-pie">
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
          {breadcrumb.join(' › ')}
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
                      setCasoId(null);
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
                  <span className={`admin-dash-estado ${casoEnRegistro ? 'admin-dash-estado-eliminado' : `admin-dash-estado-${caso.status}`}`}>
                    {casoEnRegistro ? 'En registro' : (STATUS_LABEL[caso.status] || caso.status)}
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
                    <p className="admin-dash-aviso-respuesta">
                      El vecino respondió a tu pedido de datos
                      {caso.ultimaRespuestaDatosAt || caso.respuestaDatosAt
                        ? ` · ${fechaTexto(caso.ultimaRespuestaDatosAt || caso.respuestaDatosAt)}`
                        : ''}.
                      Revisá la descripción y la foto actualizadas abajo.
                    </p>
                  )}
                  <div className="admin-dash-acciones">
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
                    {caso.status !== 'pendiente_aprobacion' && caso.status !== 'rechazado' && caso.status !== 'resuelto' && (
                      <button type="button" className="admin-dash-btn peligro" onClick={() => rechazarCaso()} disabled={accionando}>
                        <IconoX /> Anular
                      </button>
                    )}
                    {caso.category !== 'cosas_perdidas'
                      && caso.status !== 'pendiente_aprobacion'
                      && caso.status !== 'resuelto'
                      && caso.status !== 'rechazado' && (
                      <button type="button" className="admin-dash-btn" onClick={() => pedirDatos()} disabled={accionando}>
                        <IconoChat /> Pedir más datos
                      </button>
                    )}
                    {caso.category !== 'cosas_perdidas'
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
                    {caso.status !== 'resuelto' && caso.status !== 'rechazado' && caso.status !== 'pendiente_aprobacion' && (
                      <button type="button" className="admin-dash-btn" onClick={() => cambiarEstado('resuelto')} disabled={accionando}>
                        <IconoX /> Cerrar caso
                      </button>
                    )}
                    {(caso.category === 'familias' || caso.category === 'persona'
                      || (caso.category === 'perros_gatos' && caso.animalTipo === 'abandonado')) && (
                      <button type="button" className="admin-dash-btn" onClick={() => avisarOficina()} disabled={accionando || !!caso.avisadoAt}>
                        {caso.avisadoAt ? 'Ya avisado' : 'Avisar oficina'}
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
                    {caso.pideDatosAt && (
                      <div className="ancho">
                        <dt>Pedido de datos al vecino</dt>
                        <dd>
                          {fechaTexto(caso.pideDatosAt)}
                          {caso.pideDatosMensaje ? ` — ${caso.pideDatosMensaje}` : ''}
                          <span className="admin-dash-pedido-pendiente"> · esperando respuesta</span>
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
                </div>
              </section>

              <section className="admin-dash-bloque">
                <h2>Resumen</h2>
                <div className="admin-dash-stats">
                  <button type="button" onClick={() => irSeccion('reportes')}>
                    <strong>{stats.reportes || 0}</strong>
                    <span>Reportes</span>
                  </button>
                  <button type="button" onClick={() => irSeccion('cosas_perdidas')}>
                    <strong>{stats.perdidas || 0}</strong>
                    <span>Cosas perdidas</span>
                  </button>
                  <button type="button" onClick={() => irSeccion('por_aprobar')}>
                    <strong>{stats.porAprobar || 0}</strong>
                    <span>Por aprobar</span>
                  </button>
                  <button type="button" onClick={() => irSeccion('registro')}>
                    <strong>{stats.registro || 0}</strong>
                    <span>Registro</span>
                  </button>
                </div>
              </section>

              <section className="admin-dash-bloque">
                <h2>Últimos casos</h2>
                {(stats.recientes || []).length === 0 ? (
                  <p className="admin-dash-vacio">Todavía no hay casos en tu jurisdicción.</p>
                ) : (
                  <ul className="admin-dash-recientes">
                    {(stats.recientes || []).map((m) => (
                      <li key={m._id}>
                        <button type="button" onClick={() => abrirCasoDesdeInicio(m)}>
                          <span className="admin-dash-recientes-top">
                            <strong>#{m.caseId || '—'}</strong>
                            <span className={`admin-dash-estado admin-dash-estado-${m.status}`}>
                              {STATUS_LABEL[m.status] || m.status}
                            </span>
                          </span>
                          <span className="admin-dash-recientes-meta">{metaCasoLista(m)}</span>
                          <small>
                            {m.jurisdictionName || 'Sin municipio'}
                            {m.createdAt ? ` · ${fechaTexto(m.createdAt)}` : ''}
                          </small>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
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

      {dialogo?.marker && (() => {
        const casoId = dialogo.marker.caseId ? `#${dialogo.marker.caseId}` : '';
        const cfg = {
          pedir_datos: {
            titulo: 'Pedir más datos',
            meta: `Caso ${casoId} · el vecino recibe una notificación y puede responder`,
            label: '¿Qué datos necesitás?',
            placeholder: 'Ej: ¿Podés aclarar la dirección exacta o subir una foto más cercana?',
            obligatorio: true,
            confirmar: 'Enviar pedido',
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
            meta: `Caso ${casoId} · dejará de verse en el mapa público y pasará al Registro`,
            label: 'Motivo (opcional)',
            placeholder: 'Ej: Duplicado / información incorrecta…',
            obligatorio: false,
            confirmar: 'Anular',
            peligro: true,
          },
          no_aprobar: {
            titulo: 'No aprobar',
            meta: `Caso ${casoId} · no se publicará en el mapa y pasará al Registro`,
            label: 'Motivo (opcional)',
            placeholder: 'Ej: Falta información / fuera de jurisdicción…',
            obligatorio: false,
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
