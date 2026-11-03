import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { getAuth, signOut } from 'firebase/auth';
import appFirebase from './credenciales';
import logoCiudad from '../assets/ciudadar-logo-circulo-estilo.jpg';

const auth = getAuth(appFirebase);
const API = 'http://localhost:5001';
const SUPER_VISTA_KEY = 'ciudadar-super-seccion';
const SECCIONES = new Set(['inicio', 'jurisdicciones', 'admins', 'sin_jurisdiccion']);

const CATEGORY_LABEL = {
  reparaciones: 'Reparación',
  perros_gatos: 'Animales',
  familias: 'Familias',
  cosas_perdidas: 'Cosas perdidas',
};

const IconoInicio = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 3 4 9v12h5v-7h6v7h5V9z" /></svg>
);
const IconoJuris = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2C8.1 2 5 5.1 5 9c0 5.2 7 13 7 13s7-7.8 7-13c0-3.9-3.1-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5z" /></svg>
);
const IconoAdmins = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4zm0 2c-4 0-8 2-8 4v2h16v-2c0-2-4-4-8-4z" /></svg>
);
const IconoCasos = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M6 2h9l5 5v15H6V2zm8 1.5V8h4.5L14 3.5zM8 12h8v2H8v-2zm0 4h8v2H8v-2z" /></svg>
);
const IconoMapa = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2C8.1 2 5 5.1 5 9c0 5.2 7 13 7 13s7-7.8 7-13c0-3.9-3.1-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5z" /></svg>
);
const IconoSalir = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M10 17v-3H3v-4h7V7l5 5-5 5zm9-14H11v2h8v14h-8v2h8a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2z" /></svg>
);

const STATUS_LABEL = {
  pendiente_aprobacion: 'Por aprobar',
  pendiente: 'Publicado',
  en_proceso: 'En proceso',
  resuelto: 'Resuelto',
  rechazado: 'Anulado',
};

const leerSeccion = () => {
  try {
    const s = sessionStorage.getItem(SUPER_VISTA_KEY);
    return SECCIONES.has(s) ? s : 'inicio';
  } catch {
    return 'inicio';
  }
};

const fechaTexto = (value) => {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString('es-AR', {
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

const SuperDashboard = ({ userId, onOperarCasos, onSalirMapaVecino }) => {
  const [seccion, setSeccion] = useState(leerSeccion);
  const [stats, setStats] = useState(null);
  const [ranking, setRanking] = useState([]);
  const [jurisdicciones, setJurisdicciones] = useState([]);
  const [tenantsAsignacion, setTenantsAsignacion] = useState([]);
  const [admins, setAdmins] = useState([]);
  const [sinTenantItems, setSinTenantItems] = useState([]);
  const [sinTenantMeta, setSinTenantMeta] = useState({ total: 0, page: 1, hasMore: false });
  const [asignacionLocal, setAsignacionLocal] = useState({});
  const [cargando, setCargando] = useState(true);
  const [aviso, setAviso] = useState('');
  const [accionando, setAccionando] = useState(false);

  const [filtroJurisQ, setFiltroJurisQ] = useState('');
  const [filtroJurisTipo, setFiltroJurisTipo] = useState('municipality');
  const [filtroJurisEstado, setFiltroJurisEstado] = useState('active');
  const [filtroSoloSinLimite, setFiltroSoloSinLimite] = useState(false);
  const [filtroSoloConAdmins, setFiltroSoloConAdmins] = useState(false);
  const [filtroAdminQ, setFiltroAdminQ] = useState('');

  const [nuevoEmail, setNuevoEmail] = useState('');
  const [nuevoTenantId, setNuevoTenantId] = useState('');

  const headers = useMemo(() => ({ 'x-user-id': userId }), [userId]);

  const mostrarAviso = (texto) => {
    setAviso(texto);
    window.setTimeout(() => setAviso(''), 3500);
  };

  useEffect(() => {
    try {
      sessionStorage.setItem(SUPER_VISTA_KEY, seccion);
    } catch {
      /* ignore */
    }
  }, [seccion]);

  const cargarStats = useCallback(async () => {
    const [{ data: statsData }, { data: rankingData }] = await Promise.all([
      axios.get(`${API}/api/super/stats`, { headers }),
      axios.get(`${API}/api/super/ranking`, { headers, params: { limit: 12 } }),
    ]);
    setStats(statsData);
    setRanking(rankingData.items || []);
  }, [headers]);

  const cargarJurisdicciones = useCallback(async () => {
    const params = {};
    if (filtroJurisQ.trim()) params.q = filtroJurisQ.trim();
    if (filtroJurisTipo) params.type = filtroJurisTipo;
    if (filtroJurisEstado) params.status = filtroJurisEstado;
    const { data } = await axios.get(`${API}/api/super/jurisdicciones`, { headers, params });
    setJurisdicciones(data.items || []);
  }, [headers, filtroJurisQ, filtroJurisTipo, filtroJurisEstado]);

  const cargarAdmins = useCallback(async () => {
    const params = {};
    if (filtroAdminQ.trim()) params.q = filtroAdminQ.trim();
    const { data } = await axios.get(`${API}/api/super/admins`, { headers, params });
    setAdmins(data.items || []);
  }, [headers, filtroAdminQ]);

  // Selector de asignación: municipios y comunas activas (sin el filtro de la otra pestaña)
  const cargarTenantsAsignacion = useCallback(async () => {
    const { data } = await axios.get(`${API}/api/super/jurisdicciones`, {
      headers,
      params: { status: 'active' },
    });
    const items = (data.items || []).filter((t) => (
      t.type === 'municipality' || t.type === 'commune'
    ));
    setTenantsAsignacion(items);
  }, [headers]);

  const cargarSinTenant = useCallback(async (page = 1) => {
    const { data } = await axios.get(`${API}/api/super/sin-tenant`, {
      headers,
      params: { page, limit: 20 },
    });
    setSinTenantItems(data.items || []);
    setSinTenantMeta({
      total: data.total || 0,
      page: data.page || page,
      hasMore: !!data.hasMore,
    });
  }, [headers]);

  const refrescar = useCallback(async () => {
    if (!userId) return;
    setCargando(true);
    try {
      // Stats livianos en paralelo para el badge de “Sin jurisdicción”
      const extras = [];
      if (seccion !== 'inicio') {
        extras.push(
          axios.get(`${API}/api/super/stats`, { headers })
            .then(({ data }) => setStats((prev) => ({ ...(prev || {}), ...data })))
            .catch(() => {})
        );
      }
      if (seccion === 'inicio') await cargarStats();
      else if (seccion === 'jurisdicciones') await Promise.all([cargarJurisdicciones(), ...extras]);
      else if (seccion === 'admins') {
        await Promise.all([cargarAdmins(), cargarTenantsAsignacion(), ...extras]);
      } else if (seccion === 'sin_jurisdiccion') {
        await Promise.all([cargarSinTenant(1), cargarTenantsAsignacion(), ...extras]);
      } else {
        await Promise.all(extras);
      }
    } catch (err) {
      mostrarAviso(err.response?.data?.message || 'No se pudo cargar el panel');
    } finally {
      setCargando(false);
    }
  }, [
    userId,
    seccion,
    headers,
    cargarStats,
    cargarJurisdicciones,
    cargarAdmins,
    cargarTenantsAsignacion,
    cargarSinTenant,
  ]);

  useEffect(() => {
    refrescar();
  }, [refrescar]);

  const cambiarEstadoJuris = async (item, status) => {
    if (accionando) return;
    setAccionando(true);
    try {
      const { data } = await axios.patch(
        `${API}/api/super/jurisdicciones/${item.id}`,
        { status },
        { headers }
      );
      setJurisdicciones((prev) => prev.map((j) => (j.id === data.id ? { ...j, ...data } : j)));
      mostrarAviso(`${data.name} → ${status === 'active' ? 'activa' : 'inactiva'}`);
    } catch (err) {
      mostrarAviso(err.response?.data?.message || 'No se pudo actualizar');
    } finally {
      setAccionando(false);
    }
  };

  const asignarAdmin = async (event) => {
    event.preventDefault();
    if (accionando) return;
    const email = nuevoEmail.trim().toLowerCase();
    if (!email || !nuevoTenantId) {
      mostrarAviso('Completá email y jurisdicción');
      return;
    }
    setAccionando(true);
    try {
      const { data } = await axios.post(
        `${API}/api/super/admins`,
        { email, tenantId: nuevoTenantId },
        { headers }
      );
      mostrarAviso(data.message || 'Admin asignado');
      setNuevoEmail('');
      await Promise.all([cargarAdmins(), cargarTenantsAsignacion()]);
    } catch (err) {
      mostrarAviso(err.response?.data?.message || 'No se pudo asignar');
    } finally {
      setAccionando(false);
    }
  };

  const quitarAdmin = async (asig) => {
    if (accionando) return;
    setAccionando(true);
    try {
      await axios.delete(`${API}/api/super/admins`, {
        headers,
        data: { email: asig.email, tenantId: asig.tenantId },
      });
      mostrarAviso(`Se quitó ${asig.email}`);
      await Promise.all([cargarAdmins(), cargarTenantsAsignacion()]);
    } catch (err) {
      mostrarAviso(err.response?.data?.message || 'No se pudo quitar');
    } finally {
      setAccionando(false);
    }
  };

  const asignarTenantCaso = async (casoId) => {
    if (accionando) return;
    const tenantId = String(asignacionLocal[casoId] || '').trim();
    if (!tenantId) {
      mostrarAviso('Elegí un municipio o comuna');
      return;
    }
    setAccionando(true);
    try {
      const { data } = await axios.patch(
        `${API}/api/super/casos/${casoId}/tenant`,
        { tenantId },
        { headers }
      );
      mostrarAviso(data.message || 'Caso asignado');
      setAsignacionLocal((prev) => {
        const next = { ...prev };
        delete next[casoId];
        return next;
      });
      await Promise.all([
        cargarSinTenant(sinTenantMeta.page || 1),
        cargarStats().catch(() => {}),
      ]);
    } catch (err) {
      mostrarAviso(err.response?.data?.message || 'No se pudo asignar');
    } finally {
      setAccionando(false);
    }
  };

  const irSeccion = (id, opciones = {}) => {
    if (id === 'jurisdicciones') {
      if (Object.prototype.hasOwnProperty.call(opciones, 'tipo')) {
        setFiltroJurisTipo(opciones.tipo);
      }
      if (Object.prototype.hasOwnProperty.call(opciones, 'estado')) {
        setFiltroJurisEstado(opciones.estado);
      }
      if (Object.prototype.hasOwnProperty.call(opciones, 'q')) {
        setFiltroJurisQ(opciones.q);
      }
      setFiltroSoloSinLimite(!!opciones.soloSinLimite);
      setFiltroSoloConAdmins(!!opciones.soloConAdmins);
    } else {
      setFiltroSoloSinLimite(false);
      setFiltroSoloConAdmins(false);
    }
    if (id === 'admins' && Object.prototype.hasOwnProperty.call(opciones, 'q')) {
      setFiltroAdminQ(opciones.q);
    }
    setSeccion(id);
  };

  const operarCasos = (foco = {}) => {
    if (typeof onOperarCasos === 'function') onOperarCasos(foco);
  };

  const jurisdiccionesVisibles = useMemo(() => {
    let lista = jurisdicciones;
    if (filtroSoloSinLimite) lista = lista.filter((j) => !j.hasBoundary);
    if (filtroSoloConAdmins) lista = lista.filter((j) => (j.adminCount || 0) > 0);
    return lista;
  }, [jurisdicciones, filtroSoloSinLimite, filtroSoloConAdmins]);

  const titulo = {
    inicio: 'Tablero global',
    jurisdicciones: 'Jurisdicciones',
    admins: 'Administradores municipales',
    sin_jurisdiccion: 'Sin jurisdicción',
  }[seccion] || 'Super administración';

  const tenantsParaSelect = useMemo(
    () => [...tenantsAsignacion].sort((a, b) => {
      const tipo = String(a.typeLabel || '').localeCompare(String(b.typeLabel || ''));
      if (tipo !== 0) return tipo;
      return a.name.localeCompare(b.name);
    }),
    [tenantsAsignacion]
  );

  return (
    <div className="admin-dash admin-dash-video admin-dash-root">
      <aside className="admin-dash-sidebar">
        <div className="admin-dash-brand">
          <img src={logoCiudad} alt="CiudadAr" className="admin-dash-brand-logo" />
          <div className="admin-dash-brand-texto">
            <small className="admin-dash-brand-rol">Super administrador</small>
            <strong className="admin-dash-brand-jurisdiccion">Toda la provincia</strong>
          </div>
        </div>
        <nav className="admin-dash-nav">
          <button type="button" className={seccion === 'inicio' ? 'activo' : ''} onClick={() => irSeccion('inicio')}>
            <IconoInicio /> Inicio
          </button>
          <button type="button" className={seccion === 'jurisdicciones' ? 'activo' : ''} onClick={() => irSeccion('jurisdicciones')}>
            <IconoJuris /> Jurisdicciones
          </button>
          <button type="button" className={seccion === 'admins' ? 'activo' : ''} onClick={() => irSeccion('admins')}>
            <IconoAdmins /> Admins
          </button>
          <button
            type="button"
            className={seccion === 'sin_jurisdiccion' ? 'activo' : ''}
            onClick={() => irSeccion('sin_jurisdiccion')}
          >
            <IconoCasos /> Sin jurisdicción
            {(stats?.sinTenant > 0) && (
              <em className="admin-dash-tab-badge">{stats.sinTenant}</em>
            )}
          </button>
          {onOperarCasos && (
            <button type="button" className="admin-dash-nav-secundario" onClick={() => operarCasos()}>
              <IconoCasos /> Operar casos
            </button>
          )}
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
          Super › {titulo}
        </div>
        {aviso && <div className="admin-dash-toast">{aviso}</div>}

        <div className="admin-dash-panel">
          {cargando && !stats && seccion === 'inicio' ? (
            <p className="admin-dash-vacio">Cargando…</p>
          ) : null}

          {seccion === 'inicio' && stats && (
            <div className="admin-dash-inicio">
              <h1>Gobernanza CiudadAr</h1>
              <p>Visión global de jurisdicciones, admins y carga operativa.</p>

              <section className="admin-dash-bloque">
                <h2>Sistema</h2>
                <div className="admin-dash-stats admin-dash-stats-4">
                  <button
                    type="button"
                    onClick={() => irSeccion('jurisdicciones', {
                      tipo: 'municipality',
                      estado: 'active',
                      q: '',
                      soloSinLimite: false,
                      soloConAdmins: false,
                    })}
                  >
                    <strong>{stats.jurisdicciones || 0}</strong>
                    <span>Jurisdicciones</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => irSeccion('jurisdicciones', {
                      tipo: '',
                      estado: 'active',
                      q: '',
                      soloSinLimite: false,
                      soloConAdmins: true,
                    })}
                  >
                    <strong>{stats.conAdmins || 0}</strong>
                    <span>Con admin asignado</span>
                  </button>
                  <button
                    type="button"
                    className={stats.sinLimite > 0 ? 'admin-dash-stat-alerta' : ''}
                    onClick={() => irSeccion('jurisdicciones', {
                      tipo: '',
                      estado: '',
                      q: '',
                      soloSinLimite: true,
                      soloConAdmins: false,
                    })}
                  >
                    <strong>{stats.sinLimite || 0}</strong>
                    <span>Sin límite en mapa</span>
                  </button>
                  <button
                    type="button"
                    className={stats.inactivas > 0 ? 'admin-dash-stat-alerta' : ''}
                    onClick={() => irSeccion('jurisdicciones', {
                      tipo: '',
                      estado: 'inactive',
                      q: '',
                      soloSinLimite: false,
                      soloConAdmins: false,
                    })}
                  >
                    <strong>{stats.inactivas || 0}</strong>
                    <span>Inactivas</span>
                  </button>
                </div>
              </section>

              <section className="admin-dash-bloque">
                <h2>Casos en toda la provincia</h2>
                <div className="admin-dash-stats admin-dash-stats-4">
                  <button
                    type="button"
                    className={stats.porAprobar > 0 ? 'admin-dash-stat-alerta' : ''}
                    onClick={() => operarCasos({ seccion: 'por_aprobar' })}
                  >
                    <strong>{stats.porAprobar || 0}</strong>
                    <span>Por aprobar</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => operarCasos({ seccion: 'reportes', estado: 'pendiente' })}
                  >
                    <strong>{stats.abiertos || 0}</strong>
                    <span>Abiertos</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => operarCasos({
                      seccion: 'registro',
                      registroTipo: '',
                      registroCategoria: '',
                      registroPeriodo: '',
                    })}
                  >
                    <strong>{stats.registro || 0}</strong>
                    <span>En registro</span>
                  </button>
                  <button
                    type="button"
                    className={stats.sinTenant > 0 ? 'admin-dash-stat-alerta' : ''}
                    onClick={() => irSeccion('sin_jurisdiccion')}
                  >
                    <strong>{stats.sinTenant || 0}</strong>
                    <span>Sin jurisdicción</span>
                  </button>
                </div>
              </section>

              <section className="admin-dash-bloque">
                <h2>Ranking por municipio</h2>
                <p className="admin-dash-sub super-ranking-ayuda">
                  Si un municipio no tiene admin, todavía no está sumado al proyecto: dale de alta un administrador.
                  Operar los casos le corresponde a ese municipio, no al super.
                </p>
                {ranking.length === 0 ? (
                  <p className="admin-dash-vacio">No hay carga operativa destacada.</p>
                ) : (
                  <ul className="super-ranking">
                    {[...ranking]
                      .sort((a, b) => {
                        // Primero los que aún no se sumaron (sin admin)
                        if (a.sinAdmin !== b.sinAdmin) return a.sinAdmin ? -1 : 1;
                        if (b.carga !== a.carga) return b.carga - a.carga;
                        return a.name.localeCompare(b.name);
                      })
                      .map((r, idx) => (
                      <li key={r.id} className={`super-ranking-item${r.sinAdmin ? ' super-ranking-pendiente' : ''}`}>
                        <button
                          type="button"
                          className="super-ranking-btn"
                          onClick={() => {
                            if (r.sinAdmin) {
                              setNuevoTenantId(r.id);
                              irSeccion('admins');
                              return;
                            }
                            operarCasos({
                              seccion: r.porAprobar > 0 ? 'por_aprobar' : 'reportes',
                              estado: 'pendiente',
                              tenantId: r.id,
                            });
                          }}
                        >
                          <span className="super-ranking-pos">{idx + 1}</span>
                          <span className="super-ranking-info">
                            <strong>{r.name}</strong>
                            <span className="super-meta">
                              {r.typeLabel}
                              {r.sinAdmin
                                ? ' · Pendiente de sumar al proyecto'
                                : ` · ${r.adminCount} admin`}
                            </span>
                          </span>
                          <span className="super-ranking-nums">
                            <em className={r.porAprobar > 0 ? 'alerta' : ''}>{r.porAprobar} por aprobar</em>
                            <em>{r.abiertos} abiertos</em>
                          </span>
                        </button>
                        {r.sinAdmin ? (
                          <button
                            type="button"
                            className="admin-dash-btn admin-dash-btn-primario"
                            onClick={() => {
                              setNuevoTenantId(r.id);
                              irSeccion('admins');
                            }}
                          >
                            Sumar al proyecto
                          </button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

            </div>
          )}

          {seccion === 'sin_jurisdiccion' && (
            <div className="super-seccion">
              <header className="super-seccion-cabecera">
                <div>
                  <h1>Sin jurisdicción</h1>
                  <p>
                    Casos que no cayeron en ningún municipio/comuna. Asignales territorio para que el admin local los vea.
                  </p>
                </div>
              </header>

              {cargando ? (
                <p className="admin-dash-vacio">Cargando…</p>
              ) : sinTenantItems.length === 0 ? (
                <p className="admin-dash-vacio">
                  {sinTenantMeta.total === 0
                    ? 'No hay casos sin jurisdicción. Todo en orden.'
                    : 'No hay más casos en esta página.'}
                </p>
              ) : (
                <>
                  <p className="admin-dash-sub">
                    {sinTenantMeta.total} caso{sinTenantMeta.total === 1 ? '' : 's'} sin territorio
                  </p>
                  <ul className="super-lista">
                    {sinTenantItems.map((c) => (
                      <li key={c.id} className="super-tarjeta">
                        <div className="super-tarjeta-info">
                          <strong>Caso #{c.caseId || '—'}</strong>
                          <span className="super-meta">
                            {CATEGORY_LABEL[c.category] || c.category}
                            {' · '}
                            {STATUS_LABEL[c.status] || c.status}
                            {c.direccion ? ` · ${c.direccion}` : ''}
                          </span>
                          {(c.description || c.objeto) && (
                            <span className="super-contadores">
                              {(c.objeto || c.description || '').slice(0, 120)}
                            </span>
                          )}
                          <small className="super-admins-linea">{fechaTexto(c.createdAt)}</small>
                        </div>
                        <div className="super-tarjeta-acciones super-asignar-caso">
                          <select
                            value={asignacionLocal[c.id] || ''}
                            onChange={(e) => setAsignacionLocal((prev) => ({
                              ...prev,
                              [c.id]: e.target.value,
                            }))}
                            aria-label={`Asignar jurisdicción al caso ${c.caseId || ''}`}
                          >
                            <option value="">Elegir municipio/comuna…</option>
                            {tenantsParaSelect.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.name} ({t.typeLabel})
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            className="admin-dash-btn admin-dash-btn-primario"
                            disabled={accionando || !asignacionLocal[c.id]}
                            onClick={() => asignarTenantCaso(c.id)}
                          >
                            Asignar
                          </button>
                          <button
                            type="button"
                            className="admin-dash-btn"
                            onClick={() => operarCasos({
                              seccion: c.status === 'pendiente_aprobacion'
                                ? 'por_aprobar'
                                : (c.category === 'cosas_perdidas' ? 'cosas_perdidas' : 'reportes'),
                              casoId: c.id,
                              sinTenant: true,
                            })}
                          >
                            Ver caso
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                  {(sinTenantMeta.page > 1 || sinTenantMeta.hasMore) && (
                    <div className="admin-dash-paginacion">
                      <button
                        type="button"
                        className="admin-dash-btn"
                        disabled={cargando || sinTenantMeta.page <= 1}
                        onClick={() => cargarSinTenant(sinTenantMeta.page - 1)}
                      >
                        Anterior
                      </button>
                      <span>Página {sinTenantMeta.page}</span>
                      <button
                        type="button"
                        className="admin-dash-btn"
                        disabled={cargando || !sinTenantMeta.hasMore}
                        onClick={() => cargarSinTenant(sinTenantMeta.page + 1)}
                      >
                        Siguiente
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {seccion === 'jurisdicciones' && (
            <div className="super-seccion">
              <header className="super-seccion-cabecera">
                <div>
                  <h1>Jurisdicciones</h1>
                  <p>Municipios, comunas y provincia. Activá o pausá territorios.</p>
                </div>
              </header>

              <div className="admin-dash-filtros super-filtros">
                <input
                  type="search"
                  placeholder="Buscar por nombre o slug…"
                  value={filtroJurisQ}
                  onChange={(e) => setFiltroJurisQ(e.target.value)}
                  aria-label="Buscar jurisdicción"
                />
                <select
                  value={filtroJurisTipo}
                  onChange={(e) => {
                    setFiltroJurisTipo(e.target.value);
                    setFiltroSoloSinLimite(false);
                    setFiltroSoloConAdmins(false);
                  }}
                  aria-label="Tipo"
                >
                  <option value="municipality">Municipio</option>
                  <option value="commune">Comuna</option>
                  <option value="province">Provincia</option>
                  <option value="">Todos los tipos</option>
                </select>
                <select
                  value={filtroJurisEstado}
                  onChange={(e) => {
                    setFiltroJurisEstado(e.target.value);
                    setFiltroSoloSinLimite(false);
                    setFiltroSoloConAdmins(false);
                  }}
                  aria-label="Estado"
                >
                  <option value="active">Activas</option>
                  <option value="inactive">Inactivas</option>
                  <option value="pending">Pendientes</option>
                  <option value="">Todos los estados</option>
                </select>
              </div>

              {(filtroSoloSinLimite || filtroSoloConAdmins) && (
                <p className="super-filtro-activo-aviso">
                  {filtroSoloSinLimite ? 'Mostrando solo jurisdicciones sin límite en el mapa. ' : ''}
                  {filtroSoloConAdmins ? 'Mostrando solo jurisdicciones con admin asignado. ' : ''}
                  <button
                    type="button"
                    className="admin-dash-back"
                    onClick={() => {
                      setFiltroSoloSinLimite(false);
                      setFiltroSoloConAdmins(false);
                    }}
                  >
                    Quitar este filtro
                  </button>
                </p>
              )}

              {cargando ? (
                <p className="admin-dash-vacio">Cargando…</p>
              ) : jurisdiccionesVisibles.length === 0 ? (
                <p className="admin-dash-vacio">No hay jurisdicciones con esos filtros.</p>
              ) : (
                <ul className="super-lista">
                  {jurisdiccionesVisibles.map((j) => (
                    <li key={j.id} className="super-tarjeta">
                      <div className="super-tarjeta-info">
                        <strong>{j.name}</strong>
                        <span className="super-meta">
                          {j.typeLabel} · {j.slug}
                          {!j.hasBoundary ? ' · Sin límite' : ''}
                        </span>
                        <span className="super-contadores">
                          {j.porAprobar} por aprobar · {j.abiertos} abiertos · {j.registro} registro · {j.adminCount} admin · {j.operarioCount || 0} operarios
                        </span>
                        {(j.admins || []).length > 0 && (
                          <small className="super-admins-linea">{j.admins.join(', ')}</small>
                        )}
                      </div>
                      <div className="super-tarjeta-acciones">
                        <span className={`admin-dash-estado ${j.status === 'active' ? 'admin-dash-estado-resuelto' : 'admin-dash-estado-rechazado'}`}>
                          {j.status === 'active' ? 'Activa' : (j.status === 'pending' ? 'Pendiente' : 'Inactiva')}
                        </span>
                        {(j.type === 'municipality' || j.type === 'commune') && (
                          <button
                            type="button"
                            className="admin-dash-btn admin-dash-btn-primario"
                            onClick={() => operarCasos({
                              seccion: j.porAprobar > 0 ? 'por_aprobar' : 'reportes',
                              estado: 'pendiente',
                              tenantId: j.id,
                            })}
                          >
                            Ver casos
                          </button>
                        )}
                        {j.status === 'active' ? (
                          <button
                            type="button"
                            className="admin-dash-btn"
                            disabled={accionando}
                            onClick={() => cambiarEstadoJuris(j, 'inactive')}
                          >
                            Desactivar
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="admin-dash-btn admin-dash-btn-primario"
                            disabled={accionando}
                            onClick={() => cambiarEstadoJuris(j, 'active')}
                          >
                            Activar
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {seccion === 'admins' && (
            <div className="super-seccion">
              <header className="super-seccion-cabecera">
                <div>
                  <h1>Administradores municipales</h1>
                  <p>Asigná o quitá quién opera cada jurisdicción.</p>
                </div>
              </header>

              <form className="super-form-asignar" onSubmit={asignarAdmin}>
                <input
                  type="email"
                  placeholder="email@municipio.gob.ar"
                  value={nuevoEmail}
                  onChange={(e) => setNuevoEmail(e.target.value)}
                  required
                  aria-label="Email del admin"
                />
                <select
                  value={nuevoTenantId}
                  onChange={(e) => setNuevoTenantId(e.target.value)}
                  required
                  aria-label="Jurisdicción"
                >
                  <option value="">Elegí jurisdicción…</option>
                  {tenantsParaSelect.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.typeLabel})
                    </option>
                  ))}
                </select>
                <button type="submit" className="admin-dash-btn admin-dash-btn-primario" disabled={accionando}>
                  Asignar
                </button>
              </form>

              <div className="admin-dash-filtros super-filtros">
                <input
                  type="search"
                  placeholder="Buscar por email o municipio…"
                  value={filtroAdminQ}
                  onChange={(e) => setFiltroAdminQ(e.target.value)}
                  aria-label="Buscar admin"
                />
              </div>

              {cargando ? (
                <p className="admin-dash-vacio">Cargando…</p>
              ) : admins.length === 0 ? (
                <p className="admin-dash-vacio">Todavía no hay administradores municipales asignados.</p>
              ) : (
                <ul className="super-lista">
                  {admins.map((a) => (
                    <li key={`${a.email}-${a.tenantId}`} className="super-tarjeta">
                      <div className="super-tarjeta-info">
                        <strong>{a.email}</strong>
                        <span className="super-meta">
                          {a.tenantName} · {a.typeLabel}
                        </span>
                      </div>
                      <div className="super-tarjeta-acciones">
                        <button
                          type="button"
                          className="admin-dash-btn"
                          disabled={accionando}
                          onClick={() => quitarAdmin(a)}
                        >
                          Quitar
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SuperDashboard;
