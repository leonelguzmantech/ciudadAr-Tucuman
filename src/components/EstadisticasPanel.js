import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import {
  BarrasHorizontales,
  DonaEstados,
  LineaIngresosResueltos,
  PeriodoSelector,
  KpiGrid,
  EmbudoProceso,
  CompararPeriodo,
  TablaOperarios,
} from './EstadisticasCharts';
import SelectMunicipio from './SelectMunicipio';

const fmt = (n) => (n == null || Number.isNaN(Number(n)) ? '—' : String(n));

const hoyISO = () => new Date().toISOString().slice(0, 10);
const haceDiasISO = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};
const fmtFechaCorta = (iso) => {
  if (!iso) return '';
  const d = new Date(`${String(iso).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
};
const fmtFechaISO = (valor) => {
  if (!valor) return '';
  try {
    return new Date(valor).toISOString().slice(0, 10);
  } catch {
    return '';
  }
};
const fmtDemora = (horas) => {
  if (horas == null || Number.isNaN(Number(horas))) return '—';
  const h = Number(horas);
  if (h >= 48) return `${Math.round((h / 24) * 10) / 10} días`;
  return `${h} h`;
};
const csvEscape = (v) => {
  const s = v == null ? '' : String(v);
  if (/[",;\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
};

/**
 * Panel de estadísticas de casos / uso.
 * url: endpoint completo (admin o super)
 * headers: auth
 * titulo / subtitulo opcionales
 */
const EstadisticasPanel = ({
  url,
  headers,
  titulo = 'Estadísticas',
  subtitulo = 'Control de casos y uso de las publicaciones de vecinos',
  extraParams = {},
  /** Lista { id, name, typeLabel? } para filtrar por municipio (super) */
  tenants = null,
}) => {
  const [periodo, setPeriodo] = useState(30); // 7 | 30 | 90 | 'personalizado'
  const [fechaDesde, setFechaDesde] = useState(() => haceDiasISO(30));
  const [fechaHasta, setFechaHasta] = useState(hoyISO);
  const [tenantId, setTenantId] = useState('');
  const [data, setData] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const personalizado = periodo === 'personalizado';
  const rangoListo = !personalizado || (fechaDesde && fechaHasta && fechaDesde <= fechaHasta);

  const tieneSelector = Array.isArray(tenants) && tenants.length > 0;
  const tenantElegido = tieneSelector
    ? tenants.find((t) => String(t.id) === String(tenantId))
    : null;

  const extraKey = JSON.stringify({
    ...(extraParams || {}),
    ...(tieneSelector && tenantId ? { tenantId } : {}),
  });
  const cargar = useCallback(async () => {
    if (!url || !headers || !rangoListo) return;
    // Super: no cargar toda la provincia mezclada; primero elegir municipio.
    if (tieneSelector && !tenantId) {
      setData(null);
      setCargando(false);
      setError('');
      return;
    }
    setCargando(true);
    setError('');
    try {
      const extras = extraKey ? JSON.parse(extraKey) : {};
      const params = personalizado
        ? { fechaDesde, fechaHasta, ...extras }
        : { dias: periodo, ...extras };
      const { data: payload } = await axios.get(url, { headers, params });
      setData(payload);
    } catch (err) {
      setData(null);
      setError(err.response?.data?.message || 'No se pudieron cargar las estadísticas');
    } finally {
      setCargando(false);
    }
  }, [url, headers, periodo, personalizado, fechaDesde, fechaHasta, rangoListo, extraKey, tieneSelector, tenantId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const elegirPeriodo = (valor) => {
    if (valor === 'personalizado') {
      if (!personalizado) {
        setFechaDesde(haceDiasISO(30));
        setFechaHasta(hoyISO());
      }
      setPeriodo('personalizado');
      return;
    }
    setPeriodo(Number(valor));
  };

  const diasPeriodo = data?.periodo?.dias ?? (personalizado ? null : Number(periodo));
  const etiquetaPeriodo = personalizado && fechaDesde && fechaHasta
    ? `${fmtFechaCorta(fechaDesde)} – ${fmtFechaCorta(fechaHasta)}`
    : `${diasPeriodo ?? periodo} días`;
  const etiquetaPeriodoLarga = personalizado && fechaDesde && fechaHasta
    ? `entre el ${fmtFechaCorta(fechaDesde)} y el ${fmtFechaCorta(fechaHasta)}`
    : `en los últimos ${diasPeriodo ?? periodo} días`;

  const op = data?.operacion || {};
  const uso = data?.uso || {};
  const comparar = data?.comparar || {};

  const demoraTexto = fmtDemora(op.demoraMediaHoras);

  const kpisOperacion = [
    {
      label: 'Por aprobar',
      valor: fmt(op.porAprobar),
      alerta: op.porAprobar > 0,
      ayuda: 'Casos que el vecino mandó y todavía no revisaste',
    },
    {
      label: 'Publicados abiertos',
      valor: fmt(op.abiertos),
      ayuda: 'Casos ya aprobados, todavía sin tomar (estado pendiente)',
    },
    {
      label: 'En proceso',
      valor: fmt(op.enProceso),
      ayuda: 'Casos que el municipio o la cuadrilla ya están atendiendo',
    },
    {
      label: 'Esperan cierre',
      valor: fmt(op.pendienteCierre),
      alerta: op.pendienteCierre > 0,
      ayuda: 'La cuadrilla propuso cierre y falta tu confirmación',
    },
    {
      label: 'Derivados a oficina',
      valor: fmt(op.derivados),
      ayuda: 'Casos avisados a una oficina (siguen en el mapa)',
    },
    {
      label: 'Demora hasta resolver',
      valor: demoraTexto,
      ayuda: 'Tiempo promedio desde que se creó el caso hasta que se resolvió (en el período)',
    },
  ];

  const kpisUso = [
    {
      label: 'Nuevos reportes',
      valor: fmt(uso.publicadosPeriodo),
      ayuda: `Cuántos casos crearon los vecinos ${etiquetaPeriodoLarga}`,
    },
    {
      label: 'Aprobados',
      valor: fmt(uso.aprobadosPeriodo),
      ayuda: `Casos que el admin aprobó ${etiquetaPeriodoLarga}`,
    },
    {
      label: 'Tomados por cuadrilla',
      valor: fmt(uso.tomadosPeriodo),
      ayuda: `Casos que un operario tomó ${etiquetaPeriodoLarga}`,
    },
    {
      label: 'Resueltos',
      valor: fmt(uso.resueltosPeriodo),
      ayuda: `Casos cerrados como resueltos ${etiquetaPeriodoLarga}`,
    },
    {
      label: 'Anulados',
      valor: fmt(uso.anuladosPeriodo),
      ayuda: `Casos anulados o no aprobados ${etiquetaPeriodoLarga}`,
    },
    {
      label: 'Vencidos',
      valor: fmt(uso.vencidosPeriodo),
      ayuda: `Avisos de animales/perdidas que caducaron solos (15 días) ${etiquetaPeriodoLarga}`,
    },
    {
      label: '% que se resolvió',
      valor: uso.pctResueltos == null ? '—' : `${uso.pctResueltos}%`,
      ayuda: 'De los que salieron del mapa (resuelto + anulado + vencido), qué % terminó resuelto',
    },
    {
      label: 'Vecinos distintos',
      valor: fmt(uso.vecinosDistinctos),
      ayuda: 'Cantidad de cuentas distintas que publicaron en el período',
    },
    {
      label: '“Yo también” en reparaciones',
      valor: fmt(uso.confirmacionesReparacion),
      ayuda: 'Vecinos que confirmaron el mismo aviso de reparación (bache, luminaria, vereda, etc.)',
    },
    {
      label: 'Reclamos en perdidas',
      valor: fmt(uso.reclamosPerdidas),
      ayuda: 'Vecinos que reclamaron un objeto en avisos de cosas perdidas',
    },
  ];

  const itemsComparar = [
    {
      key: 'creados',
      label: 'Nuevos reportes',
      actual: comparar.creados?.actual,
      anterior: comparar.creados?.anterior,
      pct: comparar.creados?.pct,
    },
    {
      key: 'tomados',
      label: 'Tomados',
      actual: comparar.tomados?.actual,
      anterior: comparar.tomados?.anterior,
      pct: comparar.tomados?.pct,
    },
    {
      key: 'resueltos',
      label: 'Resueltos',
      actual: comparar.resueltos?.actual,
      anterior: comparar.resueltos?.anterior,
      pct: comparar.resueltos?.pct,
    },
    {
      key: 'anulados',
      label: 'Anulados',
      actual: comparar.anulados?.actual,
      anterior: comparar.anulados?.anterior,
      pct: comparar.anulados?.pct,
      invertir: true,
    },
    {
      key: 'demora',
      label: 'Demora media',
      actual: fmtDemora(comparar.demoraMediaHoras?.actual),
      anterior: fmtDemora(comparar.demoraMediaHoras?.anterior),
      pct: comparar.demoraMediaHoras?.pct,
      invertir: true,
    },
    {
      key: 'vecinos',
      label: 'Vecinos distintos',
      actual: comparar.vecinosDistinctos?.actual,
      anterior: comparar.vecinosDistinctos?.anterior,
      pct: comparar.vecinosDistinctos?.pct,
    },
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
  ];

  const usuarios = data?.usuarios || {};
  const kpisUsuarios = usuarios.disponibles ? [
    {
      label: usuarios.ambito === 'global' ? 'Registrados (red)' : 'Registrados en el municipio',
      valor: fmt(usuarios.registrados),
      ayuda: usuarios.ambito === 'global'
        ? 'Cuentas activas en toda la plataforma'
        : 'Cuentas activas que eligieron este municipio al registrarse',
    },
    {
      label: 'Usuarios nuevos',
      valor: fmt(usuarios.nuevos),
      ayuda: `Se registraron ${etiquetaPeriodoLarga}`,
    },
    {
      label: 'Activos (reportaron)',
      valor: fmt(usuarios.activos),
      ayuda: `Vecinos distintos que publicaron al menos un aviso ${etiquetaPeriodoLarga}`,
    },
    {
      label: 'Nuevos que reportaron',
      valor: fmt(usuarios.nuevosActivos),
      ayuda: 'De los que se registraron en el período, cuántos ya mandaron un aviso',
    },
    {
      label: 'Nuevos sin reportar',
      valor: fmt(usuarios.nuevosQuietos),
      ayuda: 'Se registraron en el período pero todavía no publicaron nada',
    },
  ] : [];

  const exportarCsv = () => {
    if (!data) return;
    const lineas = [];
    const push = (cols) => lineas.push(cols.map(csvEscape).join(';'));
    push(['CiudadAr — Estadísticas']);
    push(['Jurisdicción', tenantElegido?.name || 'General']);
    push(['Período', etiquetaPeriodo]);
    push(['Desde', fmtFechaISO(data.periodo?.desde)]);
    push(['Hasta', fmtFechaISO(data.periodo?.hasta)]);
    push([]);
    push(['Cola ahora']);
    push(['Métrica', 'Valor']);
    kpisOperacion.forEach((k) => push([k.label, k.valor]));
    push([]);
    push(['Antigüedad de la cola abierta']);
    push(['Rango', 'Cantidad']);
    (data.antiguedad || []).forEach((a) => push([a.label, a.n]));
    push([]);
    push(['Actividad del período']);
    push(['Métrica', 'Valor']);
    kpisUso.forEach((k) => push([k.label, k.valor]));
    push([]);
    push(['Embudo del período']);
    push(['Etapa', 'Cantidad']);
    (data.embudo || []).forEach((e) => push([e.label, e.n]));
    push([]);
    push(['Comparación vs período anterior']);
    push(['Métrica', 'Actual', 'Anterior', 'Variación %']);
    itemsComparar.forEach((c) => push([c.label, c.actual, c.anterior, c.pct ?? '']));
    push([]);
    push(['Por categoría']);
    push(['Categoría', 'Cantidad']);
    (data.porCategoria || []).forEach((c) => push([c.label, c.n]));
    push([]);
    push(['Rendimiento de cuadrilla']);
    push(['Operario', 'Tomados', 'Resueltos', 'Demora media (h)']);
    (data.porOperario || []).forEach((o) => push([
      o.label,
      o.tomados,
      o.resueltos,
      o.demoraMediaHoras ?? '',
    ]));
    push([]);
    push(['Serie diaria']);
    push(['Fecha', 'Ingresos', 'Resueltos']);
    (data.serieDiaria || []).forEach((s) => push([s.fecha, s.ingresos, s.resueltos]));

    const blob = new Blob([`\uFEFF${lineas.join('\n')}`], { type: 'text/csv;charset=utf-8;' });
    const urlBlob = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = urlBlob;
    a.download = `estadisticas-ciudadar-${fmtFechaISO(data.periodo?.desde) || 'periodo'}_${fmtFechaISO(data.periodo?.hasta) || 'hoy'}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(urlBlob);
  };

  const subtituloActivo = tenantElegido
    ? `Casos y uso en ${tenantElegido.name}`
    : subtitulo;

  const prevDesde = fmtFechaCorta(data?.periodo?.anterior?.desde);
  const prevHasta = fmtFechaCorta(data?.periodo?.anterior?.hasta);

  return (
    <div className="estadisticas-panel">
      <header className="estadisticas-cabecera">
        <div>
          <h1>{titulo}</h1>
          <p className="admin-dash-sub">{subtituloActivo}</p>
        </div>
        <div className="estadisticas-cabecera-controles">
          {tieneSelector && (
            <SelectMunicipio
              className="estadisticas-tenant-select"
              value={tenantId}
              onChange={setTenantId}
              options={tenants}
              emptyLabel="Seleccionar municipio"
              placeholder="Buscar municipio…"
              ariaLabel="Municipio"
              disabled={cargando}
              allowEmpty
            />
          )}
          <PeriodoSelector
            valor={periodo}
            onChange={elegirPeriodo}
            disabled={cargando}
            personalizado={personalizado}
            fechaDesde={fechaDesde}
            fechaHasta={fechaHasta}
            onFechaDesde={setFechaDesde}
            onFechaHasta={setFechaHasta}
          />
          <button
            type="button"
            className="estadisticas-exportar"
            disabled={!data || cargando}
            onClick={exportarCsv}
          >
            Exportar CSV
          </button>
        </div>
      </header>

      {error && <p className="admin-dash-vacio">{error}</p>}
      {personalizado && !rangoListo && (
        <p className="admin-dash-vacio">Elegí una fecha desde y hasta válidas.</p>
      )}
      {tieneSelector && !tenantId ? (
        <p className="admin-dash-vacio">
          Seleccioná un municipio para ver sus estadísticas. No se mezclan todos juntos.
        </p>
      ) : cargando && !data ? (
        <p className="admin-dash-vacio">Cargando estadísticas…</p>
      ) : data ? (
        <>
          <p className="estadisticas-guia">
            Arriba: cómo está la cola <strong>ahora</strong> (incluye antigüedad).
            Abajo: embudo, comparación con el período previo, actividad y gráficas
            {' '}
            <strong>{etiquetaPeriodoLarga}</strong>
            {tenantElegido ? ` en ${tenantElegido.name}` : ''}.
            Pasá el mouse por cada número para ver el detalle.
          </p>

          <section className="admin-dash-bloque">
            <h2>Cola de casos (ahora)</h2>
            <KpiGrid items={kpisOperacion} />
          </section>

          <section className="admin-dash-bloque">
            <h2>Antigüedad de la cola abierta</h2>
            <p className="estadisticas-ayuda">
              Cuánto llevan abiertos los casos que todavía no se cerraron.
              Si hay muchos con más de 30 días, la cola está envejeciendo.
            </p>
            <BarrasHorizontales
              items={data.antiguedad || []}
              vacio="No hay casos abiertos"
            />
          </section>

          <section className="admin-dash-bloque">
            <h2>Actividad ({etiquetaPeriodo})</h2>
            <p className="estadisticas-ayuda">
              Cuántos casos entraron, se aprobaron, tomó la cuadrilla y se resolvieron.
            </p>
            <KpiGrid items={kpisUso} />
            <div className="estadisticas-grid-charts" style={{ marginTop: 16 }}>
              <section className="admin-dash-bloque estadisticas-chart-card">
                <h2>Flujo del período (barras)</h2>
                <p className="estadisticas-ayuda">
                  De izquierda a derecha conceptual: entraron, se aprobaron, tomó la cuadrilla y cómo cerraron.
                </p>
                <BarrasHorizontales
                  items={[
                    { key: 'creados', label: 'Nuevos reportes', n: uso.publicadosPeriodo || 0 },
                    { key: 'aprobados', label: 'Aprobados', n: uso.aprobadosPeriodo || 0 },
                    { key: 'tomados', label: 'Tomados por cuadrilla', n: uso.tomadosPeriodo || 0 },
                    { key: 'resueltos', label: 'Resueltos', n: uso.resueltosPeriodo || 0 },
                    { key: 'rechazado', label: 'Anulados', n: uso.anuladosPeriodo || 0 },
                    { key: 'vencido', label: 'Vencidos', n: uso.vencidosPeriodo || 0 },
                  ]}
                  vacio="Sin actividad en el período"
                />
              </section>
              <section className="admin-dash-bloque estadisticas-chart-card">
                <h2>Cómo cerraron (dona)</h2>
                <p className="estadisticas-ayuda">
                  De los que salieron del mapa {etiquetaPeriodoLarga}: resueltos, anulados
                  o vencidos (animales/perdidas a los 15 días).
                  {uso.pctResueltos != null ? ` ${uso.pctResueltos}% terminó resuelto.` : ''}
                </p>
                <DonaEstados
                  items={[
                    { key: 'resuelto', label: 'Resueltos', n: uso.resueltosPeriodo || 0 },
                    { key: 'rechazado', label: 'Anulados', n: uso.anuladosPeriodo || 0 },
                    { key: 'vencido', label: 'Vencidos', n: uso.vencidosPeriodo || 0 },
                  ]}
                  vacio="No hubo cierres en el período"
                  centroLabel="cierres"
                />
              </section>
            </div>
          </section>

          {usuarios.disponibles ? (
            <section className="admin-dash-bloque">
              <h2>
                {usuarios.ambito === 'global'
                  ? `Usuarios de la red (${etiquetaPeriodo})`
                  : `Usuarios del municipio (${etiquetaPeriodo})`}
              </h2>
              <p className="estadisticas-ayuda">
                {usuarios.ambito === 'global'
                  ? 'Altas y actividad en toda la plataforma.'
                  : 'Altas nuevas y quiénes participaron publicando avisos.'}
              </p>
              <KpiGrid items={kpisUsuarios} />
              <div className="estadisticas-grid-charts" style={{ marginTop: 16 }}>
                <section className="admin-dash-bloque estadisticas-chart-card">
                  <h2>Resumen en barras</h2>
                  <p className="estadisticas-ayuda">
                    Registrados totales vs altas y actividad {etiquetaPeriodoLarga}.
                  </p>
                  <BarrasHorizontales
                    items={[
                      { key: 'creados', label: 'Registrados', n: usuarios.registrados || 0 },
                      { key: 'aprobados', label: 'Nuevos', n: usuarios.nuevos || 0 },
                      { key: 'resueltos', label: 'Activos (reportaron)', n: usuarios.activos || 0 },
                    ]}
                    vacio="Sin datos de usuarios"
                  />
                </section>
                <section className="admin-dash-bloque estadisticas-chart-card">
                  <h2>De los usuarios nuevos</h2>
                  <p className="estadisticas-ayuda">
                    Qué parte de las altas ya publicó un aviso y qué parte todavía no.
                  </p>
                  <DonaEstados
                    items={[
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
                    ]}
                    vacio="No hubo usuarios nuevos en el período"
                    centroLabel="nuevos"
                  />
                </section>
                <section className="admin-dash-bloque estadisticas-chart-card estadisticas-chart-wide">
                  <h2>Usuarios en el tiempo</h2>
                  <p className="estadisticas-ayuda">
                    Evolución de altas y participación.
                    <strong> Azul:</strong> cuentas nuevas que se registraron.
                    <strong> Verde:</strong> vecinos distintos que publicaron al menos un aviso
                    (si alguien manda 3 reportes el mismo día, cuenta 1).
                  </p>
                  <LineaIngresosResueltos
                    serie={data.serieUsuarios || []}
                    vacio="Sin altas ni reportes de usuarios en el período"
                    labelA="usuarios nuevos"
                    labelB="usuarios activos"
                    leyendaA="Azul: altas nuevas (registros)"
                    leyendaB="Verde: vecinos que publicaron"
                    ariaLabel="Usuarios nuevos y activos en el tiempo"
                    variante="usuarios"
                    totalA={usuarios.nuevos}
                    totalB={usuarios.activos}
                  />
                </section>
              </div>
            </section>
          ) : null}

          <div className="estadisticas-grid-charts">
            <section className="admin-dash-bloque estadisticas-chart-card">
              <h2>Embudo de reparaciones</h2>
              <p className="estadisticas-ayuda">
                Solo reparaciones urbanas {etiquetaPeriodoLarga}: creadas, aprobadas, avanzadas
                (cuadrilla tomó el caso, un vecino avisó que lo resolvió, o hay cierre propuesto) y resueltas.
                Si se achica mucho entre pasos, ahí está el cuello de botella.
              </p>
              <EmbudoProceso items={data.embudo || []} />
            </section>

            <section className="admin-dash-bloque estadisticas-chart-card">
              <h2>Vs período anterior</h2>
              <p className="estadisticas-ayuda">
                Compara este rango con el anterior de la misma duración
                {prevDesde && prevHasta ? ` (${prevDesde} – ${prevHasta})` : ''}.
                Verde = mejora habitual; rojo = empeora (en anulados y demora, subir es peor).
              </p>
              <CompararPeriodo items={itemsComparar} />
            </section>

            <section className="admin-dash-bloque estadisticas-chart-card">
              <h2>¿De qué tipo son los casos nuevos?</h2>
              <p className="estadisticas-ayuda">
                Barras = cantidad de publicaciones en el período (reparaciones, animales, familias, perdidas).
              </p>
              <BarrasHorizontales items={data.porCategoria || []} />
            </section>

            <section className="admin-dash-bloque estadisticas-chart-card">
              <h2>¿En qué estado están?</h2>
              <p className="estadisticas-ayuda">
                Cola activa ahora. Cada color es un estado abierto (sin cerrados).
              </p>
              <DonaEstados
                items={data.estados || []}
                vacio="Sin casos activos"
                centroLabel="activos"
              />
            </section>

            <section className="admin-dash-bloque estadisticas-chart-card estadisticas-chart-wide">
              <h2>¿Entran más casos de los que se resuelven?</h2>
              <p className="estadisticas-ayuda">
                Línea azul = casos nuevos. Línea verde = casos resueltos. Si el azul va arriba del verde, la cola crece.
              </p>
              <LineaIngresosResueltos serie={data.serieDiaria || []} />
            </section>

            <section className="admin-dash-bloque estadisticas-chart-card">
              <h2>Rendimiento de la cuadrilla</h2>
              <p className="estadisticas-ayuda">
                Operarios que tomaron o resolvieron casos {etiquetaPeriodoLarga}.
                Demora media = tiempo promedio hasta resolver los que cerraron.
              </p>
              <TablaOperarios items={data.porOperario || []} />
            </section>

            <section className="admin-dash-bloque estadisticas-chart-card">
              <h2>Cosas perdidas: ¿perdí o encontré?</h2>
              <p className="estadisticas-ayuda">
                Cuántos avisos de “Perdí algo” vs “Encontré algo” hubo en el período.
              </p>
              <BarrasHorizontales items={data.perdidaTipos || []} />
            </section>
          </div>
        </>
      ) : null}
    </div>
  );
};

export default EstadisticasPanel;
