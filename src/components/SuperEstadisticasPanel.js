import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import {
  KpiGrid,
  BarrasHorizontales,
  DonaEstados,
  LineaIngresosResueltos,
  CompararPeriodo,
} from './EstadisticasCharts';
import EstadisticasPanel from './EstadisticasPanel';

const API = 'http://localhost:5001';
const fmt = (n) => (n == null || Number.isNaN(Number(n)) ? '—' : String(n));
const fmtDemora = (horas) => {
  if (horas == null || Number.isNaN(Number(horas))) return '—';
  const h = Number(horas);
  if (h >= 48) return `${Math.round((h / 24) * 10) / 10} d`;
  return `${h} h`;
};

/**
 * Estadísticas del super:
 * 1) Excepciones de gobernanza (no mezclar municipios)
 * 2) Usuarios a nivel red
 * 3) Comparativo provincial (ranking)
 * 4) Detalle de un municipio (mismo panel que el admin local)
 */
const SuperEstadisticasPanel = ({
  userId,
  headers,
  tenants = [],
  stats = null,
  onIrSeccion,
  onOperarCasos,
  onSumarAdmin,
}) => {
  const [ranking, setRanking] = useState([]);
  const [diasRanking, setDiasRanking] = useState(30);
  const [cargandoRanking, setCargandoRanking] = useState(true);
  const [errorRanking, setErrorRanking] = useState('');
  const [orden, setOrden] = useState('carga'); // carga | porAprobar | demora
  const [usuariosDash, setUsuariosDash] = useState(null);
  const [cargandoUsuarios, setCargandoUsuarios] = useState(true);
  const [errorUsuarios, setErrorUsuarios] = useState('');

  const cargarRanking = useCallback(async () => {
    if (!userId) return;
    setCargandoRanking(true);
    setErrorRanking('');
    try {
      const { data } = await axios.get(`${API}/api/super/ranking`, {
        headers,
        params: { limit: 60, dias: diasRanking, todos: 1 },
      });
      setRanking(data.items || []);
    } catch (err) {
      setRanking([]);
      setErrorRanking(err.response?.data?.message || 'No se pudo cargar el ranking');
    } finally {
      setCargandoRanking(false);
    }
  }, [userId, headers, diasRanking]);

  const cargarUsuariosGlobales = useCallback(async () => {
    if (!userId) return;
    setCargandoUsuarios(true);
    setErrorUsuarios('');
    try {
      const { data } = await axios.get(`${API}/api/super/dashboard`, {
        headers,
        params: { dias: diasRanking },
      });
      setUsuariosDash(data);
    } catch (err) {
      setUsuariosDash(null);
      setErrorUsuarios(err.response?.data?.message || 'No se pudieron cargar usuarios');
    } finally {
      setCargandoUsuarios(false);
    }
  }, [userId, headers, diasRanking]);

  useEffect(() => {
    cargarRanking();
  }, [cargarRanking]);

  useEffect(() => {
    cargarUsuariosGlobales();
  }, [cargarUsuariosGlobales]);

  const sinAdminActivos = useMemo(
    () => ranking.filter((r) => r.sinAdmin).length,
    [ranking]
  );

  const excepciones = useMemo(() => ([
    {
      label: 'Sin jurisdicción',
      valor: fmt(stats?.sinTenant),
      ayuda: 'Pines que no cayeron en ningún municipio/comuna',
      alerta: (stats?.sinTenant || 0) > 0,
      onClick: onIrSeccion
        ? () => onIrSeccion('sin_jurisdiccion', { sinTenantEstado: 'todos' })
        : undefined,
    },
    {
      label: 'Casos en municipios sin admin',
      valor: fmt(stats?.casosSinAdmin),
      ayuda: 'Ya tienen municipio, pero nadie local los atiende: el Super puede operar o sumar admin',
      alerta: (stats?.casosSinAdmin || 0) > 0,
      onClick: undefined,
    },
    {
      label: 'Municipios sin admin',
      valor: fmt(stats?.municipiosSinAdmin ?? sinAdminActivos),
      ayuda: 'Municipios/comunas activos sin administrador local',
      alerta: (stats?.municipiosSinAdmin ?? sinAdminActivos) > 0,
      onClick: onIrSeccion
        ? () => onIrSeccion('admins')
        : undefined,
    },
    {
      label: 'Sin límite en mapa',
      valor: fmt(stats?.sinLimite),
      ayuda: 'Territorios sin polígono: los pines pueden caer mal',
      alerta: (stats?.sinLimite || 0) > 0,
      onClick: onIrSeccion
        ? () => onIrSeccion('jurisdicciones', {
          tipo: '',
          estado: '',
          q: '',
          soloSinLimite: true,
          soloConAdmins: false,
        })
        : undefined,
    },
  ]), [stats, onIrSeccion, sinAdminActivos]);

  const rankingOrdenado = useMemo(() => {
    const lista = [...ranking];
    if (orden === 'porAprobar') {
      lista.sort((a, b) => (b.porAprobar || 0) - (a.porAprobar || 0) || a.name.localeCompare(b.name));
    } else if (orden === 'demora') {
      lista.sort((a, b) => {
        const da = a.demoraMediaHoras == null ? -1 : a.demoraMediaHoras;
        const db = b.demoraMediaHoras == null ? -1 : b.demoraMediaHoras;
        return db - da || a.name.localeCompare(b.name);
      });
    } else {
      lista.sort((a, b) => (b.carga || 0) - (a.carga || 0) || a.name.localeCompare(b.name));
    }
    return lista;
  }, [ranking, orden]);

  const usuarios = usuariosDash?.usuarios || {};
  const comparar = usuariosDash?.comparar || {};
  const kpisUsuariosGlobales = useMemo(() => {
    if (!usuarios.disponibles) return [];
    return [
      {
        label: 'Registrados (red)',
        valor: fmt(usuarios.registrados),
        ayuda: 'Cuentas activas en toda la plataforma',
      },
      {
        label: 'Usuarios nuevos',
        valor: fmt(usuarios.nuevos),
        ayuda: `Se registraron en los últimos ${diasRanking} días`,
      },
      {
        label: 'Activos (reportaron)',
        valor: fmt(usuarios.activos),
        ayuda: `Vecinos distintos que publicaron al menos un aviso en ${diasRanking} días`,
      },
      {
        label: 'Nuevos que reportaron',
        valor: fmt(usuarios.nuevosActivos),
        ayuda: 'De los que se registraron en el período, cuántos ya mandaron un aviso',
      },
      {
        label: 'Nuevos sin reportar',
        valor: fmt(usuarios.nuevosQuietos),
        ayuda: 'Se registraron en el período pero todavía no publicaron',
      },
    ];
  }, [usuarios, diasRanking]);

  const itemsCompararUsuarios = useMemo(() => ([
    {
      key: 'usuariosNuevos',
      label: 'Usuarios nuevos',
      actual: comparar.usuariosNuevos?.actual,
      anterior: comparar.usuariosNuevos?.anterior,
      pct: comparar.usuariosNuevos?.pct,
    },
    {
      key: 'usuariosActivos',
      label: 'Usuarios activos',
      actual: comparar.usuariosActivos?.actual,
      anterior: comparar.usuariosActivos?.anterior,
      pct: comparar.usuariosActivos?.pct,
    },
  ]), [comparar]);

  const barrasResumenUsuarios = useMemo(() => ([
    { key: 'creados', label: 'Registrados', n: usuarios.registrados || 0 },
    { key: 'aprobados', label: 'Nuevos', n: usuarios.nuevos || 0 },
    { key: 'resueltos', label: 'Activos (reportaron)', n: usuarios.activos || 0 },
  ]), [usuarios]);

  const donaNuevosUsuarios = useMemo(() => ([
    {
      key: 'resuelto',
      label: 'Nuevos que reportaron',
      n: usuarios.nuevosActivos || 0,
    },
    {
      key: 'pendiente',
      label: 'Nuevos sin reportar',
      n: usuarios.nuevosQuietos || 0,
    },
  ]), [usuarios]);

  return (
    <div className="super-estadisticas">
      <header className="super-seccion-cabecera">
        <div>
          <h1>Estadísticas provinciales</h1>
          <p>
            Primero mirá excepciones, adopción de usuarios y el ranking por municipio.
            El detalle operativo (embudo, demoras, cuadrilla) es por territorio: elegí uno abajo.
          </p>
        </div>
      </header>

      <section className="admin-dash-bloque">
        <h2>Excepciones de gobernanza</h2>
        <p className="estadisticas-ayuda">
          Cosas que el super debe resolver (no son cola de un municipio concreto).
        </p>
        <KpiGrid items={excepciones} />
      </section>

      <section className="admin-dash-bloque">
        <h2>Usuarios (toda la red)</h2>
        <p className="estadisticas-ayuda">
          Altas y actividad de vecinos en el conjunto de la plataforma (últimos {diasRanking} días).
        </p>
        {errorUsuarios && <p className="admin-dash-vacio">{errorUsuarios}</p>}
        {cargandoUsuarios && !usuariosDash ? (
          <p className="admin-dash-vacio">Cargando usuarios…</p>
        ) : (
          <>
            <KpiGrid items={kpisUsuariosGlobales} />
            <div className="estadisticas-grid-charts" style={{ marginTop: 16 }}>
              <section className="admin-dash-bloque estadisticas-chart-card">
                <h2>Resumen en barras</h2>
                <p className="estadisticas-ayuda">
                  Registrados totales vs altas y actividad de los últimos {diasRanking} días.
                </p>
                <BarrasHorizontales
                  items={barrasResumenUsuarios}
                  vacio="Sin datos de usuarios"
                />
              </section>
              <section className="admin-dash-bloque estadisticas-chart-card">
                <h2>De los usuarios nuevos</h2>
                <p className="estadisticas-ayuda">
                  Qué parte de las altas ya publicó un aviso y qué parte todavía no.
                </p>
                <DonaEstados
                  items={donaNuevosUsuarios}
                  vacio="No hubo usuarios nuevos en el período"
                  centroLabel="nuevos"
                />
              </section>
              <section className="admin-dash-bloque estadisticas-chart-card estadisticas-chart-wide">
                <h2>Usuarios en el tiempo</h2>
                <p className="estadisticas-ayuda">
                  Evolución de altas y participación en toda la red.
                  <strong> Azul:</strong> cuentas nuevas que se registraron.
                  <strong> Verde:</strong> vecinos distintos que publicaron al menos un aviso
                  (si alguien manda 3 reportes el mismo día, cuenta 1).
                </p>
                <LineaIngresosResueltos
                  serie={usuariosDash?.serieUsuarios || []}
                  vacio="Sin altas ni reportes en el período"
                  labelA="usuarios nuevos"
                  labelB="usuarios activos"
                  leyendaA="Azul: altas nuevas (registros)"
                  leyendaB="Verde: vecinos que publicaron"
                  ariaLabel="Usuarios nuevos y activos en toda la red"
                  variante="usuarios"
                  totalA={usuarios.nuevos}
                  totalB={usuarios.activos}
                />
              </section>
              <section className="admin-dash-bloque estadisticas-chart-card">
                <h2>Vs período anterior</h2>
                <p className="estadisticas-ayuda">
                  Compara estos {diasRanking} días con el tramo anterior de la misma duración.
                </p>
                <CompararPeriodo items={itemsCompararUsuarios} />
              </section>
            </div>
          </>
        )}
      </section>

      <section className="admin-dash-bloque">
        <h2>Comparativo provincial</h2>
        <p className="estadisticas-ayuda">
          Quién tiene más carga ahora y cómo le fue al cerrar reparaciones en los últimos {diasRanking} días.
          Tocá un municipio para operar ahí.
        </p>
        <div className="admin-dash-filtros" style={{ marginBottom: '0.75rem' }}>
          {[
            { id: 7, label: '7 días' },
            { id: 30, label: '30 días' },
            { id: 90, label: '90 días' },
          ].map((f) => (
            <button
              key={f.id}
              type="button"
              className={`admin-dash-btn${diasRanking === f.id ? ' primario' : ''}`}
              onClick={() => setDiasRanking(f.id)}
            >
              {f.label}
            </button>
          ))}
          <span className="admin-dash-sub" style={{ marginLeft: 8 }}>Orden:</span>
          {[
            { id: 'carga', label: 'Carga' },
            { id: 'porAprobar', label: 'Por aprobar' },
            { id: 'demora', label: 'Demora' },
          ].map((f) => (
            <button
              key={f.id}
              type="button"
              className={`admin-dash-btn${orden === f.id ? ' primario' : ''}`}
              onClick={() => setOrden(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>

        {errorRanking && <p className="admin-dash-vacio">{errorRanking}</p>}
        {cargandoRanking ? (
          <p className="admin-dash-vacio">Cargando ranking…</p>
        ) : rankingOrdenado.length === 0 ? (
          <p className="admin-dash-vacio">No hay municipios para comparar.</p>
        ) : (
          <div className="estadisticas-tabla-wrap">
            <table className="estadisticas-tabla super-ranking-tabla">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Municipio</th>
                  <th>Por aprobar</th>
                  <th>Abiertos</th>
                  <th>Carga</th>
                  <th>Resueltos ({diasRanking}d)</th>
                  <th>Demora media</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rankingOrdenado.map((row, idx) => (
                  <tr key={row.id} className={row.sinAdmin ? 'super-ranking-fila-alerta' : ''}>
                    <td>{idx + 1}</td>
                    <td>
                      <strong>{row.name}</strong>
                      <div className="super-meta">
                        {row.typeLabel}
                        {row.sinAdmin ? ' · sin admin' : ` · ${row.adminCount} admin`}
                      </div>
                    </td>
                    <td>{row.porAprobar || 0}</td>
                    <td>{row.abiertos || 0}</td>
                    <td><strong>{row.carga || 0}</strong></td>
                    <td>{row.resueltos || 0}</td>
                    <td>{fmtDemora(row.demoraMediaHoras)}</td>
                    <td>
                      <button
                        type="button"
                        className="admin-dash-btn"
                        onClick={() => onOperarCasos && onOperarCasos({
                          seccion: row.porAprobar > 0 ? 'por_aprobar' : 'reportes',
                          estado: 'pendiente',
                          tenantId: row.id,
                        })}
                      >
                        Operar
                      </button>
                      {row.sinAdmin ? (
                        <button
                          type="button"
                          className="admin-dash-btn admin-dash-btn-primario"
                          style={{ marginLeft: 6 }}
                          onClick={() => onSumarAdmin && onSumarAdmin(row.id)}
                        >
                          Sumar admin
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="admin-dash-bloque">
        <h2>Detalle de un municipio</h2>
        <p className="estadisticas-ayuda">
          Embudo de reparaciones, antigüedad de cola y actividad: igual que ve el admin local.
        </p>
        <EstadisticasPanel
          url={`${API}/api/super/dashboard`}
          headers={headers}
          titulo="Detalle municipal"
          subtitulo="Elegí un municipio para ver su cola y su embudo (no se mezcla con otros)."
          tenants={tenants}
        />
      </section>
    </div>
  );
};

export default SuperEstadisticasPanel;
