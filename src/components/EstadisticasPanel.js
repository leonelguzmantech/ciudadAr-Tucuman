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
  useEffect(() => {
    if (!tieneSelector) return;
    if (tenantId && tenants.some((t) => String(t.id) === String(tenantId))) return;
    setTenantId(String(tenants[0].id));
  }, [tieneSelector, tenants, tenantId]);
  const tenantElegido = tieneSelector
    ? tenants.find((t) => String(t.id) === String(tenantId))
    : null;

  const extraKey = JSON.stringify({
    ...(extraParams || {}),
    ...(tieneSelector && tenantId ? { tenantId } : {}),
  });
  const cargar = useCallback(async () => {
    if (!url || !headers || !rangoListo) return;
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
  }, [url, headers, periodo, personalizado, fechaDesde, fechaHasta, rangoListo, extraKey]);

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
      label: '% que se resolvió',
      valor: uso.pctResueltos == null ? '—' : `${uso.pctResueltos}%`,
      ayuda: 'De los que se cerraron (resuelto + anulado), qué % terminó resuelto',
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
  ];

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
              placeholder="Buscar municipio…"
              ariaLabel="Municipio"
              disabled={cargando}
              allowEmpty={false}
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
      {cargando && !data ? (
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
          </section>

          <div className="estadisticas-grid-charts">
            <section className="admin-dash-bloque estadisticas-chart-card">
              <h2>Embudo del proceso</h2>
              <p className="estadisticas-ayuda">
                De los creados {etiquetaPeriodoLarga}: cuántos se aprobaron, tomó la cuadrilla y se resolvieron.
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
