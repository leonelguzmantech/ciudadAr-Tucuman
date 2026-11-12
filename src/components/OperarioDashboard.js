import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { getAuth, signOut } from 'firebase/auth';
import appFirebase from './credenciales';
import logoCiudad from '../assets/ciudadar-logo-circulo-estilo.jpg';
import MapComponent from './MapComponent';
import CamaraEnVivo from './CamaraEnVivo';
import MiPerfil from './MiPerfil';

const dataUrlAFile = async (dataUrl, nombre = `cierre-${Date.now()}.jpg`) => {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  return new File([blob], nombre, { type: blob.type || 'image/jpeg' });
};

const auth = getAuth(appFirebase);
const API = 'http://localhost:5001';
const GOOGLE_MAPS_API_KEY = 'AIzaSyBKHbs5m_qsi4sd80epFp-mLP8KSFixk_4';

const STATUS_LABEL = {
  pendiente: 'Pendiente de atención',
  en_proceso: 'En atención',
  pendiente_cierre: 'Cierre propuesto · esperando al admin',
  resuelto: 'Resuelto',
  rechazado: 'Anulado',
};

const CATEGORY_LABEL = {
  reparaciones: 'Reparación',
  perros_gatos: 'Animales',
  familias: 'Familias',
  cosas_perdidas: 'Cosas perdidas',
};

const ANIMAL_LABEL = {
  perdido: 'Perdido',
  encontrado: 'Encontrado',
  abandonado: 'Abandonado',
  maltrato: 'Maltrato',
};

const FAMILIAS_LABEL = {
  calle: 'En situación de calle',
  indigencia: 'Indigencia',
  otro: 'Otro',
};

const PERDIDA_LABEL = {
  perdi: 'Perdí',
  encontre: 'Encontré',
};

/** Avisos de vecino/Radar: no van en la campanita de cuadrilla */
const TIPOS_AVISO_VECINO = new Set(['cerca', 'reclamo', 'chat', 'nueva_perdida']);

const buildImageUrl = (path) => {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  return `${API}${path}`;
};

const lineaCategoria = (m) => {
  if (!m) return '—';
  if (m.category === 'cosas_perdidas') {
    const sub = PERDIDA_LABEL[m.perdidaTipo];
    return sub ? `Cosas perdidas / ${sub}` : 'Cosas perdidas';
  }
  if (m.category === 'perros_gatos') {
    const sub = ANIMAL_LABEL[m.animalTipo];
    return sub ? `Perros y gatos / ${sub}` : 'Perros y gatos';
  }
  if (m.category === 'familias' || m.category === 'persona') {
    const sub = FAMILIAS_LABEL[m.familiasTipo]
      || (m.category === 'persona' ? FAMILIAS_LABEL.calle : null);
    return sub ? `Familias / ${sub}` : 'Familias';
  }
  return CATEGORY_LABEL[m.category] || m.category || 'Reporte';
};

const etiquetaCierreRegistro = (m) => {
  if (m?.status === 'rechazado') return 'Anulado';
  if (m?.status === 'resuelto') return 'Resuelto';
  return 'En registro';
};

const IconoInicio = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 3 4 9v12h5v-7h6v7h5V9z" /></svg>
);
const IconoCasos = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M6 2h9l5 5v15H6V2zm8 1.5V8h4.5L14 3.5zM8 12h8v2H8v-2zm0 4h8v2H8v-2z" /></svg>
);
const IconoRegistro = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path fill="currentColor" d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-1 9H9V4h10v7zM9 13h10v3H9v-3z" />
  </svg>
);
const IconoCampana = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path fill="currentColor" d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6V11c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z" />
  </svg>
);
const IconoMapa = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2C8.1 2 5 5.1 5 9c0 5.2 7 13 7 13s7-7.8 7-13c0-3.9-3.1-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5z" /></svg>
);
const IconoSalir = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M10 17v-3H3v-4h7V7l5 5-5 5zm9-14H11v2h8v14h-8v2h8a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2z" /></svg>
);

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

const FotoCasoOperario = ({ src }) => {
  const [ok, setOk] = useState(Boolean(src));
  useEffect(() => {
    setOk(Boolean(src));
  }, [src]);
  if (!src || !ok) {
    return <p className="admin-dash-sin-foto">Sin foto</p>;
  }
  return (
    <img
      className="admin-dash-foto admin-dash-foto-grande"
      src={src}
      alt="Foto del reporte"
      onError={() => setOk(false)}
    />
  );
};

const OperarioDashboard = ({ userId }) => {
  const headers = useMemo(() => ({ 'x-user-id': userId }), [userId]);
  const [seccion, setSeccion] = useState('inicio');
  const [jurisdicciones, setJurisdicciones] = useState([]);
  const [stats, setStats] = useState({});
  const [markers, setMarkers] = useState([]);
  const [filtroEstado, setFiltroEstado] = useState('pendiente');
  const [misAtencion, setMisAtencion] = useState([]);
  const [casoId, setCasoId] = useState(null);
  const [casoDetalle, setCasoDetalle] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [aviso, setAviso] = useState('');
  const [accionando, setAccionando] = useState(false);
  const [dialogo, setDialogo] = useState(null);
  const [dialogoTexto, setDialogoTexto] = useState('');
  const [dialogoFoto, setDialogoFoto] = useState(null);
  const [dialogoFotoPreview, setDialogoFotoPreview] = useState('');
  const [mostrarOpcionesFoto, setMostrarOpcionesFoto] = useState(false);
  const [mostrarCamara, setMostrarCamara] = useState(false);
  const [dialogoError, setDialogoError] = useState('');
  const [notificaciones, setNotificaciones] = useState([]);
  const [noLeidas, setNoLeidas] = useState(0);
  const [mostrarNotifs, setMostrarNotifs] = useState(false);
  const [mapaCaso, setMapaCaso] = useState(null);
  const [perfilReportante, setPerfilReportante] = useState(null);
  const [mostrarPerfil, setMostrarPerfil] = useState(false);
  const [autoGuia, setAutoGuia] = useState(false);
  const [ofertaGuia, setOfertaGuia] = useState(false);
  const [respuestaCuadrillaTexto, setRespuestaCuadrillaTexto] = useState('');
  const inputGaleriaRef = useRef(null);

  const enRegistro = seccion === 'registro';

  useEffect(() => {
    if (!dialogoFoto) {
      setDialogoFotoPreview('');
      return undefined;
    }
    const url = URL.createObjectURL(dialogoFoto);
    setDialogoFotoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [dialogoFoto]);

  const mostrarAviso = (texto) => {
    setAviso(texto);
    window.setTimeout(() => setAviso(''), 3500);
  };

  const cargarNotifs = useCallback(async () => {
    if (!userId) return;
    try {
      const { data } = await axios.get(`${API}/api/notificaciones`, { headers });
      const lista = (data.notificaciones || []).filter((n) => !TIPOS_AVISO_VECINO.has(n.tipo));
      setNotificaciones(lista);
      setNoLeidas(lista.filter((n) => !n.leida).length);
    } catch {
      /* ignore */
    }
  }, [userId, headers]);

  const cargarMisAtencion = useCallback(async () => {
    if (!userId) return;
    try {
      const { data } = await axios.get(`${API}/api/markers/admin`, {
        headers,
        params: { status: 'en_proceso', mios: 1, page: 1, limit: 5 },
      });
      setMisAtencion(data.items || []);
    } catch {
      setMisAtencion([]);
    }
  }, [userId, headers]);

  const cargar = useCallback(async () => {
    if (!userId) return;
    setCargando(true);
    try {
      const params = { page: 1, limit: 40 };
      if (enRegistro) {
        params.eliminados = 1;
      } else if (filtroEstado) {
        params.status = filtroEstado;
      }
      const [authRes, statsRes, listRes] = await Promise.all([
        axios.get(`${API}/api/auth/me`, { headers }),
        axios.get(`${API}/api/markers/admin/stats`, { headers }),
        axios.get(`${API}/api/markers/admin`, { headers, params }),
      ]);
      setJurisdicciones(authRes.data.jurisdictions || []);
      setStats(statsRes.data || {});
      setMarkers(listRes.data.items || []);
    } catch (err) {
      mostrarAviso(err.response?.data?.message || 'No se pudo cargar');
    } finally {
      setCargando(false);
    }
  }, [userId, headers, filtroEstado, enRegistro]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useEffect(() => {
    if (seccion === 'inicio') cargarMisAtencion();
  }, [seccion, cargarMisAtencion]);

  useEffect(() => {
    cargarNotifs();
    const t = setInterval(cargarNotifs, 15000);
    return () => clearInterval(t);
  }, [cargarNotifs]);

  const caso = casoDetalle && casoDetalle._id === casoId
    ? casoDetalle
    : (markers.find((m) => m._id === casoId) || null);

  useEffect(() => {
    if (!casoId) {
      setCasoDetalle(null);
      return undefined;
    }
    const enLista = markers.find((m) => m._id === casoId);
    if (enLista) {
      setCasoDetalle(enLista);
      return undefined;
    }
    let cancelado = false;
    axios.get(`${API}/api/markers/admin`, {
      headers,
      params: {
        q: String(casoId),
        limit: 5,
        ...(enRegistro ? { eliminados: 1 } : {}),
      },
    }).then(({ data }) => {
      if (cancelado) return;
      const found = (data.items || []).find((m) => m._id === casoId);
      if (found) setCasoDetalle(found);
      else setCasoId(null);
    }).catch(() => {
      if (!cancelado) setCasoId(null);
    });
    return () => { cancelado = true; };
  }, [casoId, markers, headers, enRegistro]);

  const actualizarLocal = (actualizado) => {
    setMarkers((prev) => prev.map((m) => (m._id === actualizado._id ? { ...m, ...actualizado } : m)));
    setCasoDetalle((prev) => (prev && prev._id === actualizado._id ? { ...prev, ...actualizado } : prev));
    setMisAtencion((prev) => {
      if (!actualizado || actualizado.status !== 'en_proceso') {
        return prev.filter((m) => m._id !== actualizado._id);
      }
      const resto = prev.filter((m) => m._id !== actualizado._id);
      return [actualizado, ...resto].slice(0, 5);
    });
  };

  const tomarCaso = async (marker = caso) => {
    if (!marker || accionando) return;
    setAccionando(true);
    try {
      const { data } = await axios.patch(
        `${API}/api/markers/admin/${marker._id}/status`,
        { status: 'en_proceso' },
        { headers }
      );
      actualizarLocal(data);
      mostrarAviso(`Caso #${data.caseId} en atención`);
      setOfertaGuia(true);
      await cargar();
    } catch (err) {
      mostrarAviso(err.response?.data?.message || 'No se pudo tomar el caso');
    } finally {
      setAccionando(false);
    }
  };

  const responderCuadrilla = async (marker = caso) => {
    if (!marker || accionando) return;
    const texto = String(respuestaCuadrillaTexto || '').trim();
    if (texto.length < 5) {
      mostrarAviso('Escribí al menos unas palabras');
      return;
    }
    setAccionando(true);
    try {
      const { data } = await axios.patch(
        `${API}/api/markers/admin/${marker._id}/responder-cuadrilla`,
        { mensaje: texto },
        { headers }
      );
      actualizarLocal(data);
      setRespuestaCuadrillaTexto('');
      mostrarAviso('Respuesta enviada al administrador');
    } catch (err) {
      mostrarAviso(err.response?.data?.message || 'No se pudo enviar la respuesta');
    } finally {
      setAccionando(false);
    }
  };

  const resetDialogo = () => {
    setDialogo(null);
    setDialogoTexto('');
    setDialogoFoto(null);
    setDialogoFotoPreview('');
    setMostrarOpcionesFoto(false);
    setMostrarCamara(false);
    setDialogoError('');
  };

  const cerrarDialogo = () => {
    if (accionando) return;
    resetDialogo();
  };

  const abrirDialogo = (tipo, marker) => {
    setDialogo({ tipo, marker });
    setDialogoTexto('');
    setDialogoFoto(null);
    setDialogoFotoPreview('');
    setMostrarOpcionesFoto(false);
    setMostrarCamara(false);
    setDialogoError('');
  };

  const onElegirFotoCierre = (e) => {
    const file = e.target.files?.[0] || null;
    setDialogoFoto(file);
    setMostrarOpcionesFoto(false);
    e.target.value = '';
  };

  const abrirCamaraCierre = () => {
    // Cámara en vivo (getUserMedia). El input capture suele abrir la galería en desktop.
    setMostrarCamara(true);
  };

  const onCapturarFotoCierre = async (dataUrl) => {
    setMostrarCamara(false);
    try {
      const file = await dataUrlAFile(dataUrl);
      setDialogoFoto(file);
      setMostrarOpcionesFoto(false);
    } catch {
      setDialogoError('No se pudo guardar la foto. Probá de nuevo o usá la galería.');
    }
  };

  const quitarFotoCierre = () => {
    setDialogoFoto(null);
    setMostrarOpcionesFoto(false);
  };

  const confirmarDialogo = async () => {
    if (!dialogo?.marker || accionando) return;
    const texto = String(dialogoTexto || '').trim();
    if (texto.length < 5) {
      setDialogoError('Escribí al menos unas palabras');
      return;
    }
    setAccionando(true);
    setDialogoError('');
    try {
      if (dialogo.tipo === 'pedir_datos') {
        const { data } = await axios.patch(
          `${API}/api/markers/admin/${dialogo.marker._id}/pedir-datos`,
          { mensaje: texto },
          { headers }
        );
        actualizarLocal(data);
        mostrarAviso('Pedido de datos enviado al vecino');
      } else if (dialogo.tipo === 'proponer_cierre') {
        const form = new FormData();
        form.append('descripcion', texto);
        if (dialogoFoto) form.append('image', dialogoFoto);
        const { data } = await axios.patch(
          `${API}/api/markers/admin/${dialogo.marker._id}/proponer-cierre`,
          form,
          { headers: { ...headers, 'Content-Type': 'multipart/form-data' } }
        );
        actualizarLocal(data);
        mostrarAviso('Cierre propuesto · el admin debe confirmar');
        setCasoId(null);
        await cargar();
      }
      resetDialogo();
    } catch (err) {
      setDialogoError(err.response?.data?.message || 'No se pudo completar');
    } finally {
      setAccionando(false);
    }
  };

  const abrirDesdeNotif = async (avisoItem) => {
    try {
      if (avisoItem && !avisoItem.leida && avisoItem._id) {
        await axios.patch(`${API}/api/notificaciones/${avisoItem._id}/leer`, {}, { headers });
        setNotificaciones((prev) => prev.map((n) => (n._id === avisoItem._id ? { ...n, leida: true } : n)));
        setNoLeidas((n) => Math.max(0, n - 1));
      }
    } catch {
      /* ignore */
    }
    setMostrarNotifs(false);
    if (avisoItem?.markerId) {
      setSeccion('casos');
      setFiltroEstado('');
      setCasoId(String(avisoItem.markerId));
    }
  };

  const marcarTodasLeidas = async () => {
    try {
      await axios.patch(`${API}/api/notificaciones/leer-todas`, {}, { headers });
      setNotificaciones((prev) => prev.map((n) => ({ ...n, leida: true })));
      setNoLeidas(0);
    } catch {
      /* ignore */
    }
  };

  const irSeccion = (id) => {
    setMostrarNotifs(false);
    setSeccion(id);
    setCasoId(null);
    setMapaCaso(null);
    setAutoGuia(false);
    setOfertaGuia(false);
    setMarkers([]);
    if (id !== 'casos') setFiltroEstado('');
  };

  const abrirPanelAvisos = () => {
    setCasoId(null);
    setMapaCaso(null);
    setAutoGuia(false);
    setOfertaGuia(false);
    setMostrarNotifs(true);
    cargarNotifs();
  };

  const verEnMapa = (marker, { iniciarGuia = false } = {}) => {
    if (!marker) return;
    setOfertaGuia(false);
    setAutoGuia(Boolean(iniciarGuia));
    setMapaCaso(marker);
    window.requestAnimationFrame(() => {
      const panel = document.querySelector('.admin-dash-contenido');
      if (panel) panel.scrollTo({ top: 0, behavior: 'smooth' });
    });
  };

  const pedirBrujulaSiHaceFalta = async () => {
    try {
      if (
        typeof DeviceOrientationEvent !== 'undefined'
        && typeof DeviceOrientationEvent.requestPermission === 'function'
      ) {
        await DeviceOrientationEvent.requestPermission();
      }
    } catch {
      /* en desktop o si niega, la guía igual funciona con GPS */
    }
  };

  const comoLlegar = async (marker = caso) => {
    await pedirBrujulaSiHaceFalta();
    verEnMapa(marker, { iniciarGuia: true });
  };

  const abrirCaso = (marker, { guia = false } = {}) => {
    if (!marker) return;
    setCasoDetalle(marker);
    setCasoId(marker._id);
    if (guia) {
      window.setTimeout(() => {
        comoLlegar(marker);
      }, 0);
    }
  };

  const volverAFichaDesdeMapa = () => {
    setMapaCaso(null);
    setAutoGuia(false);
  };

  useEffect(() => {
    setMapaCaso(null);
    setAutoGuia(false);
    setOfertaGuia(false);
    setRespuestaCuadrillaTexto('');
  }, [casoId]);

  const nombreJuris = (jurisdicciones || []).map((j) => j.name).filter(Boolean).join(', ') || 'Tu municipio';
  const casoEnRegistro = Boolean(caso?.eliminadoAt);
  const viendoMapaEnFicha = Boolean(caso && mapaCaso && mapaCaso._id === caso._id);

  const tituloBread = caso
    ? `Caso #${caso.caseId}`
    : (mostrarNotifs
      ? 'Avisos'
      : ({ inicio: 'Inicio', casos: 'Casos', registro: 'Registro' }[seccion] || 'Cuadrilla'));

  return (
    <div className="admin-dash admin-dash-video admin-dash-root">
      <aside className="admin-dash-sidebar">
        <div className="admin-dash-brand">
          <img src={logoCiudad} alt="CiudadAr" className="admin-dash-brand-logo" />
          <div className="admin-dash-brand-texto">
            <small className="admin-dash-brand-rol">Operario / Cuadrilla</small>
            <strong className="admin-dash-brand-jurisdiccion">{nombreJuris}</strong>
          </div>
        </div>
        <nav className="admin-dash-nav">
          <button type="button" className={!mostrarNotifs && seccion === 'inicio' && !casoId ? 'activo' : ''} onClick={() => irSeccion('inicio')}>
            <IconoInicio /> Inicio
          </button>
          <button type="button" className={!mostrarNotifs && (seccion === 'casos' || (casoId && !casoEnRegistro)) ? 'activo' : ''} onClick={() => irSeccion('casos')}>
            <IconoCasos /> Casos
          </button>
          <button type="button" className={!mostrarNotifs && (seccion === 'registro' || casoEnRegistro) ? 'activo' : ''} onClick={() => irSeccion('registro')}>
            <IconoRegistro /> Registro
          </button>
          <button
            type="button"
            className={mostrarNotifs ? 'activo' : ''}
            onClick={abrirPanelAvisos}
          >
            <IconoCampana /> Avisos
            {noLeidas > 0 && <em className="admin-dash-tab-badge">{noLeidas}</em>}
          </button>
        </nav>
        <div className="admin-dash-sidebar-pie">
          <button
            type="button"
            className="admin-dash-sidebar-sec"
            onClick={() => setMostrarPerfil(true)}
          >
            Mi perfil
          </button>
          <button type="button" className="admin-dash-sidebar-salir" onClick={() => signOut(auth).catch(() => {})}>
            <IconoSalir /> Cerrar sesión
          </button>
        </div>
      </aside>

      {mostrarPerfil && auth.currentUser && (
        <MiPerfil
          usuario={auth.currentUser}
          rol="OPERARIO"
          onCerrar={() => setMostrarPerfil(false)}
        />
      )}

      <div className="admin-dash-contenido">
        <div className="admin-dash-breadcrumb">
          Cuadrilla › {tituloBread}
        </div>
        {aviso && <div className="admin-dash-toast">{aviso}</div>}

        {mostrarNotifs ? (
          <div className="admin-dash-panel">
            <div className="admin-dash-lista-wrap">
              <header className="admin-dash-lista-cabecera">
                <div>
                  <h1>Avisos {noLeidas > 0 ? `(${noLeidas})` : ''}</h1>
                  <p className="admin-dash-sub">Mensajes del admin y novedades de casos</p>
                </div>
                {noLeidas > 0 && (
                  <button type="button" className="admin-dash-btn" onClick={marcarTodasLeidas}>
                    Marcar leídos
                  </button>
                )}
              </header>
              {notificaciones.length === 0 ? (
                <p className="admin-dash-vacio">No tenés avisos todavía.</p>
              ) : (
                <ul className="admin-dash-lista admin-dash-lista-avisos">
                  {notificaciones.map((n) => (
                    <li key={n._id}>
                      <button
                        type="button"
                        className={`admin-dash-lista-item${n.leida ? '' : ' aviso-nuevo'}`}
                        onClick={() => abrirDesdeNotif(n)}
                      >
                        {!n.leida && <span className="admin-dash-aviso-pill">Nuevo</span>}
                        <strong>{n.mensaje}</strong>
                        <small>{fechaTexto(n.createdAt)}</small>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : (
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
                      : `${lineaCategoria(caso)}${caso.jurisdictionName ? ` · ${caso.jurisdictionName}` : ''}`}
                  </p>
                </div>
                {!viendoMapaEnFicha && (
                  <span className={`admin-dash-estado ${
                    casoEnRegistro || caso.status === 'resuelto' || caso.status === 'rechazado'
                      ? 'admin-dash-estado-resuelto'
                      : `admin-dash-estado-${caso.status}`
                  }`}
                  >
                    {casoEnRegistro || caso.status === 'resuelto' || caso.status === 'rechazado'
                      ? etiquetaCierreRegistro(caso)
                      : (STATUS_LABEL[caso.status] || caso.status)}
                  </span>
                )}
              </header>

              {viendoMapaEnFicha ? (
                <section className="admin-dash-card admin-dash-card-mapa">
                  <div className="admin-ficha-mapa">
                    <MapComponent
                      key={`solo-caso-op-${caso._id}-${autoGuia ? 'guia' : 'mapa'}`}
                      googleMapsApiKey={GOOGLE_MAPS_API_KEY}
                      currentUser={userId}
                      modoSoloCaso
                      habilitarGuiaGps
                      autoIniciarGuia={autoGuia}
                      focoCasoMapa={mapaCaso}
                      onCerrarSoloCaso={volverAFichaDesdeMapa}
                      onGuiaIniciada={() => setAutoGuia(false)}
                    />
                  </div>
                </section>
              ) : (
                <>
                  {caso.notaCuadrilla && (() => {
                    const pendienteRespuesta = !caso.respuestaCuadrillaAt
                      || (caso.notaCuadrillaAt
                        && new Date(caso.respuestaCuadrillaAt) < new Date(caso.notaCuadrillaAt));
                    return (
                      <aside className="admin-dash-msg-admin" role="status">
                        <header className="admin-dash-msg-admin-cabecera">
                          <span className="admin-dash-msg-admin-etiqueta">Mensaje del administrador</span>
                          {caso.notaCuadrillaAt ? (
                            <time className="admin-dash-msg-admin-fecha" dateTime={caso.notaCuadrillaAt}>
                              {fechaTexto(caso.notaCuadrillaAt)}
                            </time>
                          ) : null}
                        </header>
                        <p className="admin-dash-msg-admin-cuerpo">{caso.notaCuadrilla}</p>
                        {caso.respuestaCuadrilla && !pendienteRespuesta && (
                          <div className="admin-dash-msg-admin-respuesta">
                            <span className="admin-dash-msg-admin-etiqueta admin-dash-msg-admin-etiqueta-respuesta">
                              Tu respuesta
                            </span>
                            <p className="admin-dash-msg-admin-cuerpo">{caso.respuestaCuadrilla}</p>
                            {caso.respuestaCuadrillaAt && (
                              <small>{fechaTexto(caso.respuestaCuadrillaAt)}</small>
                            )}
                          </div>
                        )}
                        {pendienteRespuesta && !casoEnRegistro && (
                          <div className="admin-dash-msg-admin-form">
                            <label>
                              <span>Tu respuesta</span>
                              <textarea
                                value={respuestaCuadrillaTexto}
                                onChange={(e) => setRespuestaCuadrillaTexto(e.target.value)}
                                rows={2}
                                placeholder="Respondé al administrador…"
                                disabled={accionando}
                              />
                            </label>
                            <button
                              type="button"
                              className="admin-dash-btn primario"
                              disabled={accionando}
                              onClick={() => responderCuadrilla(caso)}
                            >
                              {accionando ? 'Enviando…' : 'Enviar respuesta'}
                            </button>
                          </div>
                        )}
                      </aside>
                    );
                  })()}
                  {ofertaGuia && !casoEnRegistro && (
                    <div className="admin-dash-oferta-guia">
                      <div>
                        <strong>Caso en atención</strong>
                        <p>¿Iniciamos la guía GPS hasta el lugar?</p>
                      </div>
                      <div className="admin-dash-oferta-guia-acciones">
                        <button type="button" className="admin-dash-btn" onClick={() => setOfertaGuia(false)}>
                          Ahora no
                        </button>
                        <button
                          type="button"
                          className="admin-dash-btn primario"
                          onClick={() => comoLlegar(caso)}
                        >
                          Iniciar guía
                        </button>
                      </div>
                    </div>
                  )}
                  {casoEnRegistro ? (
                    <p className="admin-dash-aviso-registro">
                      Caso en Registro · solo consulta
                      {caso.motivoEliminacion ? ` · ${caso.motivoEliminacion}` : ''}
                    </p>
                  ) : caso.status === 'pendiente_cierre' ? (
                    <p className="admin-dash-aviso-registro">
                      Ya propusiste el cierre. El administrador municipal debe confirmarlo.
                    </p>
                  ) : null}
                  <div className="admin-dash-acciones">
                    {!casoEnRegistro && caso.status === 'pendiente' && (
                      <button type="button" className="admin-dash-btn primario" disabled={accionando} onClick={() => tomarCaso(caso)}>
                        Tomar · En atención
                      </button>
                    )}
                    {!casoEnRegistro && (caso.status === 'pendiente' || caso.status === 'en_proceso') && (
                      <>
                        <button type="button" className="admin-dash-btn" disabled={accionando} onClick={() => abrirDialogo('pedir_datos', caso)}>
                          Pedir datos al vecino
                        </button>
                        <button type="button" className="admin-dash-btn primario" disabled={accionando} onClick={() => abrirDialogo('proponer_cierre', caso)}>
                          Proponer cierre
                        </button>
                      </>
                    )}
                    {!casoEnRegistro && (
                      <button type="button" className="admin-dash-btn primario" onClick={() => comoLlegar(caso)}>
                        Cómo llegar
                      </button>
                    )}
                    <button type="button" className="admin-dash-btn" onClick={() => verEnMapa(caso)}>
                      <IconoMapa /> Ver en el mapa
                    </button>
                  </div>

                  <div className="admin-dash-grid admin-dash-grid-operario">
                    <section className="admin-dash-card admin-dash-card-foto-caso">
                      <h2>Foto del reporte</h2>
                      <FotoCasoOperario
                        key={`foto-${caso._id}-${caso.imageUrl || ''}`}
                        src={buildImageUrl(caso.imageUrl || (caso._id ? `/api/markers/${caso._id}/image` : null))}
                      />
                      {caso.resolutionImageUrl && (
                        <>
                          <h2 className="admin-dash-foto-cierre-titulo">Foto del cierre</h2>
                          <img
                            className="admin-dash-foto admin-dash-foto-grande"
                            src={buildImageUrl(caso.resolutionImageUrl)}
                            alt="Foto del cierre"
                          />
                        </>
                      )}
                    </section>
                    <section className="admin-dash-card">
                      <h2>Detalles del caso</h2>
                      <dl className="admin-dash-dl">
                        <div>
                          <dt>Reportado por</dt>
                          <dd>
                            {(() => {
                              const r = caso.reportante || {};
                              const nombre = r.nombre || caso.createdBy || 'Sin nombre';
                              const hayDatos = !!(r.nombre || r.dni || r.telefono || r.email || caso.createdBy);
                              if (!hayDatos) return '—';
                              return (
                                <button
                                  type="button"
                                  className="admin-dash-reportante-link"
                                  onClick={() => setPerfilReportante({
                                    ...r,
                                    email: r.email || caso.createdBy || '',
                                    caseId: caso.caseId,
                                  })}
                                >
                                  {nombre}
                                </button>
                              );
                            })()}
                          </dd>
                        </div>
                        <div>
                          <dt>Categoría</dt>
                          <dd>{lineaCategoria(caso)}</dd>
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
                        {caso.category === 'perros_gatos' && caso.contacto && (
                          <div>
                            <dt>Contacto</dt>
                            <dd>{caso.contacto}</dd>
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
                        {caso.resolutionDescription && (
                          <div className="ancho">
                            <dt>Propuesta de cierre</dt>
                            <dd>{caso.resolutionDescription}</dd>
                          </div>
                        )}
                      </dl>
                    </section>
                    {(caso.pideDatosAt
                      || caso.ultimoPedidoDatosMensaje
                      || caso.respuestaDatosMensaje
                      || caso.respuestaDatosImageUrl
                      || caso.ultimaRespuestaDatosAt) && (
                      <section className="admin-dash-card admin-dash-intercambio-datos">
                        <h2>
                          {!caso.pideDatosAt
                            && (caso.respuestaDatosMensaje || caso.respuestaDatosImageUrl || caso.ultimaRespuestaDatosAt)
                            ? 'Respuesta del vecino'
                            : 'Pedido de datos'}
                        </h2>
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
                  </div>
                </>
              )}
            </div>
          ) : seccion === 'inicio' ? (
            <div className="admin-dash-inicio">
              <h1>Cuadrilla</h1>
              <p>Atendés reparaciones urbanas: tomá el caso, pedí datos al vecino si hace falta y proponé el cierre. El admin confirma. Revisá Avisos si te escriben.</p>
              <section className="admin-dash-bloque">
                <h2>Tu cola</h2>
                <div className="admin-dash-stats admin-dash-stats-3">
                  <button type="button" onClick={() => { setFiltroEstado('pendiente'); setSeccion('casos'); }}>
                    <strong>{stats.pendientes || 0}</strong>
                    <span>Por tomar</span>
                  </button>
                  <button type="button" onClick={() => { setFiltroEstado('en_proceso'); setSeccion('casos'); }}>
                    <strong>{stats.enProceso || 0}</strong>
                    <span>En atención</span>
                  </button>
                  <button type="button" onClick={() => { setFiltroEstado('pendiente_cierre'); setSeccion('casos'); }}>
                    <strong>{stats.cierresPendientes || 0}</strong>
                    <span>Esperando confirmación</span>
                  </button>
                </div>
              </section>
              <section className="admin-dash-bloque">
                <h2>Mis casos en atención</h2>
                {misAtencion.length === 0 ? (
                  <p className="admin-dash-vacio">Todavía no tomaste ningún caso. Empezá por “Por tomar”.</p>
                ) : (
                  <ul className="admin-dash-recientes">
                    {misAtencion.map((m) => {
                      const direccion = String(m.direccion || '').trim();
                      return (
                        <li key={m._id}>
                          <div className="admin-dash-recientes-item">
                            <button type="button" onClick={() => abrirCaso(m)}>
                              <span className="admin-dash-recientes-top">
                                <strong>#{m.caseId || '—'}</strong>
                                <span className={`admin-dash-estado admin-dash-estado-${m.status}`}>
                                  {STATUS_LABEL[m.status] || m.status}
                                </span>
                              </span>
                              <span className="admin-dash-recientes-meta">{lineaCategoria(m)}</span>
                              {direccion ? <small>{direccion}</small> : null}
                              {m.notaCuadrilla ? (
                                <span className="admin-dash-msg-admin-preview">
                                  <em>Admin</em>
                                  <span>{m.notaCuadrilla}</span>
                                </span>
                              ) : null}
                            </button>
                            <div className="admin-dash-recientes-acciones">
                              <button type="button" className="admin-dash-btn" onClick={() => abrirCaso(m)}>
                                Ver ficha
                              </button>
                              <button
                                type="button"
                                className="admin-dash-btn admin-dash-btn-primario"
                                onClick={() => abrirCaso(m, { guia: true })}
                              >
                                <IconoMapa /> Cómo llegar
                              </button>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {misAtencion.length >= 5 && (
                  <button
                    type="button"
                    className="admin-dash-btn"
                    style={{ marginTop: 10 }}
                    onClick={() => { setFiltroEstado('en_proceso'); setSeccion('casos'); }}
                  >
                    Ver más en atención
                  </button>
                )}
              </section>
              {noLeidas > 0 && (
                <section className="admin-dash-bloque">
                  <button type="button" className="admin-dash-btn admin-dash-btn-primario" onClick={() => setMostrarNotifs(true)}>
                    Tenés {noLeidas} aviso{noLeidas === 1 ? '' : 's'} sin leer
                  </button>
                </section>
              )}
            </div>
          ) : (
            <div className="admin-dash-lista-wrap">
              <header className="admin-dash-lista-cabecera">
                <div>
                  <h1>{enRegistro ? 'Registro' : 'Casos'}</h1>
                  <p className="admin-dash-sub">
                    {enRegistro
                      ? 'Tus reparaciones y casos que el admin confirmó o anuló (solo consulta)'
                      : 'Reparaciones publicadas de tu municipio'}
                  </p>
                </div>
                {!enRegistro && (
                  <div className="admin-dash-filtros">
                    <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)} aria-label="Estado">
                      <option value="pendiente">Por tomar</option>
                      <option value="en_proceso">En atención</option>
                      <option value="pendiente_cierre">Cierre propuesto · esperando al admin</option>
                    </select>
                  </div>
                )}
              </header>
              {cargando ? (
                <p className="admin-dash-vacio">Cargando…</p>
              ) : markers.length === 0 ? (
                <p className="admin-dash-vacio">No hay casos con ese filtro.</p>
              ) : (
                <ul className="admin-dash-lista admin-dash-tarjetas">
                  {markers.map((m) => {
                    const foto = m.imageUrl ? buildImageUrl(m.imageUrl) : null;
                    const descripcion = String(m.description || '').trim();
                    const direccion = String(m.direccion || '').trim();
                    const enReg = Boolean(m.eliminadoAt);
                    return (
                      <li key={m._id}>
                        <button
                          type="button"
                          className={`tarjeta-mi-reporte admin-dash-tarjeta${m.notaCuadrilla ? ' admin-dash-tarjeta-nueva' : ''}`}
                          onClick={() => setCasoId(m._id)}
                        >
                          {foto ? (
                            <img src={foto} alt="" className="tarjeta-mi-reporte-foto" />
                          ) : (
                            <span className="tarjeta-mi-reporte-sin-foto" aria-hidden="true">Sin foto</span>
                          )}
                          <span className="tarjeta-mi-reporte-info">
                            <strong>
                              Caso #{m.caseId || '—'}
                              {m.notaCuadrilla ? (
                                <em className="admin-dash-nuevo-etiqueta">Mensaje admin</em>
                              ) : null}
                            </strong>
                            <span className="tarjeta-mi-reporte-meta">{lineaCategoria(m)}</span>
                            <span className={`admin-dash-estado ${
                              enReg || m.status === 'resuelto' || m.status === 'rechazado'
                                ? 'admin-dash-estado-resuelto'
                                : `admin-dash-estado-${m.status}`
                            }`}
                            >
                              {enReg || m.status === 'resuelto' || m.status === 'rechazado'
                                ? etiquetaCierreRegistro(m)
                                : (STATUS_LABEL[m.status] || m.status)}
                            </span>
                            {direccion && (
                              <span className="tarjeta-mi-reporte-direccion">{direccion}</span>
                            )}
                            {descripcion && (
                              <span className="tarjeta-mi-reporte-desc">{descripcion}</span>
                            )}
                            {m.notaCuadrilla ? (
                              <span className="admin-dash-msg-admin-preview">
                                <em>Admin</em>
                                <span>{m.notaCuadrilla}</span>
                              </span>
                            ) : null}
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
              )}
            </div>
          )}
        </div>
        )}
      </div>

      {mostrarCamara && (
        <CamaraEnVivo
          onCancelar={() => setMostrarCamara(false)}
          onCapturar={onCapturarFotoCierre}
        />
      )}

      {dialogo?.marker && (() => {
        const casoNum = dialogo.marker.caseId ? `#${dialogo.marker.caseId}` : '';
        const esCierre = dialogo.tipo === 'proponer_cierre';
        const cfg = esCierre
          ? {
            titulo: 'Proponer cierre',
            meta: `Caso ${casoNum} · el admin debe confirmar el cierre propuesto`,
            label: '¿Qué se hizo en el lugar?',
            placeholder: 'Ej: Se reparó el bache y se rellenó con asfalto.',
            confirmar: 'Proponer cierre',
          }
          : {
            titulo: 'Pedir datos al vecino',
            meta: `Caso ${casoNum} · el vecino recibe una notificación y puede responder`,
            label: '¿Qué datos necesitás?',
            placeholder: 'Ej: ¿Podés aclarar la dirección exacta o subir una foto más cercana?',
            confirmar: 'Enviar pedido',
          };
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

              {esCierre && (
                <div className="admin-dash-modal-campo admin-dash-modal-foto-campo">
                  <span>Foto del trabajo (opcional)</span>
                  <input
                    ref={inputGaleriaRef}
                    type="file"
                    accept="image/*"
                    className="sr-only-file"
                    onChange={onElegirFotoCierre}
                  />
                  {dialogoFotoPreview ? (
                    <div className="popup-pedido-datos-preview admin-dash-modal-preview">
                      <img src={dialogoFotoPreview} alt="Vista previa del cierre" />
                      <div className="popup-pedido-datos-preview-acciones">
                        <button
                          type="button"
                          className="popup-foto-opcion"
                          disabled={accionando}
                          onClick={() => setMostrarOpcionesFoto(true)}
                        >
                          Cambiar
                        </button>
                        <button
                          type="button"
                          className="popup-foto-opcion"
                          disabled={accionando}
                          onClick={quitarFotoCierre}
                        >
                          Quitar
                        </button>
                      </div>
                    </div>
                  ) : !mostrarOpcionesFoto ? (
                    <button
                      type="button"
                      className="admin-dash-btn"
                      disabled={accionando}
                      onClick={() => setMostrarOpcionesFoto(true)}
                    >
                      Agregar foto
                    </button>
                  ) : (
                    <div className="popup-pedido-datos-opciones">
                      <p>¿Cómo querés cargar la foto?</p>
                      <div className="popup-foto-botones">
                        <button
                          type="button"
                          className="popup-foto-opcion"
                          disabled={accionando}
                          onClick={() => inputGaleriaRef.current?.click()}
                        >
                          Galería
                        </button>
                        <button
                          type="button"
                          className="popup-foto-opcion"
                          disabled={accionando}
                          onClick={abrirCamaraCierre}
                        >
                          Sacar foto
                        </button>
                      </div>
                      <button
                        type="button"
                        className="popup-foto-volver-opciones"
                        disabled={accionando}
                        onClick={() => setMostrarOpcionesFoto(false)}
                      >
                        Cancelar
                      </button>
                    </div>
                  )}
                </div>
              )}

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

      {perfilReportante && (
        <div
          className="admin-dash-modal-fondo"
          role="dialog"
          aria-modal="true"
          aria-label="Perfil del reportante"
          onClick={() => setPerfilReportante(null)}
        >
          <div
            className="admin-dash-modal admin-dash-modal-perfil"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="admin-dash-modal-cabecera">
              <h2>Perfil del reportante</h2>
              <button
                type="button"
                className="admin-dash-btn"
                onClick={() => setPerfilReportante(null)}
              >
                Cerrar
              </button>
            </div>
            {perfilReportante.caseId ? (
              <p className="admin-dash-modal-meta">Caso #{perfilReportante.caseId}</p>
            ) : null}
            <dl className="admin-dash-perfil-dl">
              <div>
                <dt>Nombre</dt>
                <dd>{perfilReportante.nombre || '—'}</dd>
              </div>
              <div>
                <dt>DNI</dt>
                <dd>{perfilReportante.dni || '—'}</dd>
              </div>
              <div>
                <dt>Celular</dt>
                <dd>
                  {perfilReportante.telefono
                    ? `${perfilReportante.telefono}${
                      perfilReportante.telefonoConfirmado ? ' · confirmado' : ' · sin confirmar'
                    }`
                    : '—'}
                </dd>
              </div>
              <div>
                <dt>Correo</dt>
                <dd>{perfilReportante.email || '—'}</dd>
              </div>
            </dl>
          </div>
        </div>
      )}
    </div>
  );
};

export default OperarioDashboard;
