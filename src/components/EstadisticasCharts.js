import React, { useMemo } from 'react';

const COLORS = {
  reparaciones: '#2563eb',
  perros_gatos: '#16a34a',
  familias: '#9333ea',
  cosas_perdidas: '#ea580c',
  pendiente_aprobacion: '#f59e0b',
  pendiente: '#64748b',
  en_proceso: '#2563eb',
  pendiente_cierre: '#0d9488',
  resuelto: '#16a34a',
  rechazado: '#dc2626',
  vencido: '#a855f7',
  perdi: '#0b2c5e',
  encontre: '#00a3e0',
  ingresos: '#2563eb',
  resueltos: '#16a34a',
  d0_7: '#22c55e',
  d8_15: '#eab308',
  d16_30: '#f97316',
  d30_mas: '#dc2626',
  creados: '#64748b',
  aprobados: '#2563eb',
  tomados: '#0d9488',
};

const colorDe = (key, fallback = '#94a3b8') => COLORS[key] || fallback;

/** Barras horizontales simples */
export const BarrasHorizontales = ({ items = [], vacio = 'Sin datos en el período' }) => {
  const max = Math.max(1, ...items.map((i) => Number(i.n) || 0));
  if (!items.length || items.every((i) => !i.n)) {
    return <p className="estadisticas-vacio-chart">{vacio}</p>;
  }
  return (
    <ul className="estadisticas-barras">
      {items.map((item) => {
        const n = Number(item.n) || 0;
        const pct = Math.round((n / max) * 100);
        return (
          <li key={item.key || item.label}>
            <div className="estadisticas-barras-meta">
              <span>{item.label}</span>
              <strong>{n}</strong>
            </div>
            <div className="estadisticas-barras-track" aria-hidden="true">
              <span
                className="estadisticas-barras-fill"
                style={{ width: `${pct}%`, background: colorDe(item.key) }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
};

/** Dona SVG */
export const DonaEstados = ({
  items = [],
  vacio = 'Sin casos activos',
  centroLabel = 'activos',
}) => {
  const total = items.reduce((acc, i) => acc + (Number(i.n) || 0), 0);
  const size = 160;
  const stroke = 28;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;

  const arcs = useMemo(() => {
    if (!total) return [];
    let offset = 0;
    return items
      .filter((i) => (Number(i.n) || 0) > 0)
      .map((item) => {
        const n = Number(item.n) || 0;
        const len = (n / total) * c;
        const arc = {
          key: item.key,
          label: item.label,
          n,
          color: colorDe(item.key),
          dash: `${len} ${c - len}`,
          offset,
        };
        offset -= len;
        return arc;
      });
  }, [items, total, c]);

  if (!total) {
    return <p className="estadisticas-vacio-chart">{vacio}</p>;
  }

  return (
    <div className="estadisticas-dona">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          {arcs.map((arc) => (
            <circle
              key={arc.key}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={arc.color}
              strokeWidth={stroke}
              strokeDasharray={arc.dash}
              strokeDashoffset={arc.offset}
            />
          ))}
        </g>
        <text
          x="50%"
          y="48%"
          textAnchor="middle"
          className="estadisticas-dona-total"
        >
          {total}
        </text>
        <text
          x="50%"
          y="60%"
          textAnchor="middle"
          className="estadisticas-dona-sub"
        >
          {centroLabel}
        </text>
      </svg>
      <ul className="estadisticas-dona-leyenda">
        {arcs.map((arc) => (
          <li key={arc.key}>
            <i style={{ background: arc.color }} />
            <span>{arc.label}</span>
            <strong>{arc.n}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
};

/** Agrupa por semana si hay muchos días (más legible). */
const agruparSerie = (serie) => {
  if (!serie || serie.length <= 21) {
    return { puntos: serie || [], unidad: 'día' };
  }
  const semanas = [];
  for (let i = 0; i < serie.length; i += 7) {
    const chunk = serie.slice(i, i + 7);
    semanas.push({
      fecha: chunk[0]?.fecha,
      label: chunk[0]?.fecha ? `sem. ${chunk[0].fecha.slice(5)}` : `S${semanas.length + 1}`,
      ingresos: chunk.reduce((a, d) => a + (Number(d.ingresos) || 0), 0),
      resueltos: chunk.reduce((a, d) => a + (Number(d.resueltos) || 0), 0),
    });
  }
  return { puntos: semanas, unidad: 'semana' };
};

/** Línea ingresos vs resueltos */
export const LineaIngresosResueltos = ({
  serie = [],
  vacio = 'Sin movimiento en el período',
  labelA = 'casos nuevos',
  labelB = 'casos resueltos',
  leyendaA = 'Azul: casos nuevos',
  leyendaB = 'Verde: casos resueltos',
  ariaLabel = 'Casos nuevos y resueltos en el tiempo',
  /** 'casos' | 'usuarios' — cambia el texto del resumen y la tip de lectura */
  variante = 'casos',
  tipLectura = '',
  /** Totales reales del período (evita sumar días/semanas y contar de más). */
  totalA = null,
  totalB = null,
}) => {
  const width = 420;
  const height = 180;
  const pad = { t: 16, r: 12, b: 28, l: 32 };
  const innerW = width - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;

  const { puntos: serieVis, unidad } = useMemo(() => agruparSerie(serie), [serie]);

  const totalIngresosSerie = serieVis.reduce((a, d) => a + (Number(d.ingresos) || 0), 0);
  const totalResueltosSerie = serieVis.reduce((a, d) => a + (Number(d.resueltos) || 0), 0);
  const totalIngresos = totalA != null ? Number(totalA) : totalIngresosSerie;
  const totalResueltos = totalB != null ? Number(totalB) : totalResueltosSerie;

  const maxY = Math.max(
    1,
    ...serieVis.map((d) => Math.max(Number(d.ingresos) || 0, Number(d.resueltos) || 0))
  );

  const puntos = useMemo(() => {
    if (!serieVis.length) return { ingresos: '', resueltos: '' };
    const n = serieVis.length;
    const xAt = (i) => pad.l + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
    const yAt = (v) => pad.t + innerH - ((Number(v) || 0) / maxY) * innerH;
    const path = (key) => serieVis
      .map((d, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i).toFixed(1)} ${yAt(d[key]).toFixed(1)}`)
      .join(' ');
    return {
      ingresos: path('ingresos'),
      resueltos: path('resueltos'),
      xAt,
    };
  }, [serieVis, maxY, innerW, innerH, pad.l, pad.t]);

  const hayDatos = totalIngresosSerie + totalResueltosSerie > 0;
  if (!serieVis.length || !hayDatos) {
    return <p className="estadisticas-vacio-chart">{vacio}</p>;
  }

  const ticks = [0, Math.ceil(maxY / 2), maxY];
  const labelIdx = [
    0,
    Math.floor((serieVis.length - 1) / 2),
    serieVis.length - 1,
  ].filter((v, i, arr) => arr.indexOf(v) === i);

  const tipPorDefecto = variante === 'usuarios'
    ? (
      unidad === 'semana'
        ? 'Cada punto suma una semana. Azul alto y verde bajo = se registran pero poco publican. Si ambas líneas suben juntas, la gente que llega también reporta.'
        : 'Cada punto es un día. Azul alto y verde bajo = se registran pero poco publican. Si ambas líneas suben juntas, la gente que llega también reporta.'
    )
    : (
      unidad === 'semana'
        ? 'Cada punto suma una semana. Si el azul va arriba del verde, la cola tiende a crecer.'
        : 'Cada punto es un día. Si el azul va arriba del verde, la cola tiende a crecer.'
    );
  const tip = tipLectura || tipPorDefecto;

  return (
    <div className="estadisticas-linea-wrap">
      <p className="estadisticas-linea-resumen">
        {variante === 'usuarios' ? (
          <>
            Total del período: <strong>{totalIngresos}</strong> altas nuevas
            {' · '}
            <strong>{totalResueltos}</strong> vecinos distintos que publicaron
            {unidad === 'semana'
              ? ' · el gráfico está agrupado por semana (el rango es largo)'
              : ' · el gráfico muestra un punto por día'}
          </>
        ) : (
          <>
            En el período: <strong>{totalIngresos}</strong> {labelA}
            {' · '}
            <strong>{totalResueltos}</strong> {labelB}
            {unidad === 'semana' ? ' · (agrupado por semana)' : ''}
          </>
        )}
      </p>
      {tip ? <p className="estadisticas-linea-tip">{tip}</p> : null}
      <svg
        className="estadisticas-linea"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={ariaLabel}
      >
        {ticks.map((t) => {
          const y = pad.t + innerH - (t / maxY) * innerH;
          return (
            <g key={`t-${t}`}>
              <line
                x1={pad.l}
                x2={width - pad.r}
                y1={y}
                y2={y}
                className="estadisticas-linea-grid"
              />
              <text x={pad.l - 6} y={y + 3} textAnchor="end" className="estadisticas-linea-tick">
                {t}
              </text>
            </g>
          );
        })}
        <path d={puntos.ingresos} fill="none" stroke={COLORS.ingresos} strokeWidth="2.5" />
        <path d={puntos.resueltos} fill="none" stroke={COLORS.resueltos} strokeWidth="2.5" />
        {labelIdx.map((i) => {
          const d = serieVis[i];
          if (!d) return null;
          const x = puntos.xAt(i);
          const label = d.label || d.fecha?.slice(5) || '';
          return (
            <text
              key={`l-${d.fecha}-${i}`}
              x={x}
              y={height - 8}
              textAnchor="middle"
              className="estadisticas-linea-tick"
            >
              {label}
            </text>
          );
        })}
      </svg>
      <div className="estadisticas-linea-leyenda">
        <span><i style={{ background: COLORS.ingresos }} /> {leyendaA}</span>
        <span><i style={{ background: COLORS.resueltos }} /> {leyendaB}</span>
      </div>
    </div>
  );
};

export const PeriodoSelector = ({
  valor,
  onChange,
  disabled,
  personalizado = false,
  fechaDesde = '',
  fechaHasta = '',
  onFechaDesde,
  onFechaHasta,
}) => (
  <div className="estadisticas-periodo-wrap">
    <div className="estadisticas-periodo" role="group" aria-label="Período">
      {[7, 30, 90].map((d) => (
        <button
          key={d}
          type="button"
          className={!personalizado && Number(valor) === d ? 'activo' : ''}
          disabled={disabled}
          onClick={() => onChange(d)}
        >
          {d} días
        </button>
      ))}
      <button
        type="button"
        className={personalizado ? 'activo' : ''}
        disabled={disabled}
        onClick={() => onChange('personalizado')}
      >
        Personalizado
      </button>
    </div>
    {personalizado && (
      <div className="estadisticas-fechas-rango" role="group" aria-label="Rango de fechas">
        <label className="estadisticas-fecha">
          <span>Desde</span>
          <input
            type="date"
            value={fechaDesde}
            max={fechaHasta || undefined}
            disabled={disabled}
            onChange={(e) => onFechaDesde?.(e.target.value)}
            aria-label="Fecha desde"
          />
        </label>
        <label className="estadisticas-fecha">
          <span>Hasta</span>
          <input
            type="date"
            value={fechaHasta}
            min={fechaDesde || undefined}
            disabled={disabled}
            onChange={(e) => onFechaHasta?.(e.target.value)}
            aria-label="Fecha hasta"
          />
        </label>
      </div>
    )}
  </div>
);

export const KpiGrid = ({ items = [] }) => (
  <div className="estadisticas-kpis">
    {items.map((item) => {
      const clase = `estadisticas-kpi${item.alerta ? ' alerta' : ''}${item.onClick ? ' clickable' : ''}`;
      if (item.onClick) {
        return (
          <button
            key={item.label}
            type="button"
            className={clase}
            title={item.ayuda || ''}
            onClick={item.onClick}
          >
            <strong>{item.valor}</strong>
            <span>{item.label}</span>
          </button>
        );
      }
      return (
        <div
          key={item.label}
          className={clase}
          title={item.ayuda || ''}
        >
          <strong>{item.valor}</strong>
          <span>{item.label}</span>
        </div>
      );
    })}
  </div>
);

/** Embudo vertical: cada etapa relativa a la primera. */
export const EmbudoProceso = ({ items = [], vacio = 'Sin datos en el período' }) => {
  if (!items.length || items.every((i) => !i.n)) {
    return <p className="estadisticas-vacio-chart">{vacio}</p>;
  }
  const base = Math.max(1, Number(items[0]?.n) || 0);
  return (
    <ol className="estadisticas-embudo">
      {items.map((item, idx) => {
        const n = Number(item.n) || 0;
        const pctBase = Math.round((n / base) * 100);
        const prev = idx > 0 ? Number(items[idx - 1].n) || 0 : null;
        const pctPaso = prev > 0 ? Math.round((n / prev) * 100) : null;
        const width = Math.max(18, Math.round((n / base) * 100));
        return (
          <li key={item.key || item.label}>
            <div
              className="estadisticas-embudo-barra"
              style={{ width: `${width}%`, background: colorDe(item.key, '#94a3b8') }}
            >
              <strong>{n}</strong>
              <span>{item.label}</span>
            </div>
            <div className="estadisticas-embudo-meta">
              <span>{pctBase}% del inicio</span>
              {pctPaso != null && <span>{pctPaso}% del paso anterior</span>}
            </div>
          </li>
        );
      })}
    </ol>
  );
};

const fmtPct = (pct) => {
  if (pct == null || Number.isNaN(Number(pct))) return '—';
  const n = Number(pct);
  const signo = n > 0 ? '+' : '';
  return `${signo}${n}%`;
};

/** Comparación período actual vs anterior. */
export const CompararPeriodo = ({ items = [], vacio = 'Sin comparación disponible' }) => {
  if (!items.length) {
    return <p className="estadisticas-vacio-chart">{vacio}</p>;
  }
  return (
    <ul className="estadisticas-comparar">
      {items.map((item) => {
        const pct = item.pct;
        const clase = pct == null
          ? ''
          : (item.invertir ? (pct > 0 ? 'malo' : pct < 0 ? 'bueno' : '') : (pct > 0 ? 'bueno' : pct < 0 ? 'malo' : ''));
        return (
          <li key={item.key || item.label}>
            <span className="estadisticas-comparar-label">{item.label}</span>
            <span className="estadisticas-comparar-vals">
              <strong>{item.actualLabel ?? item.actual}</strong>
              <em>vs {item.anteriorLabel ?? item.anterior ?? '—'}</em>
            </span>
            <span className={`estadisticas-comparar-pct ${clase}`}>{fmtPct(pct)}</span>
          </li>
        );
      })}
    </ul>
  );
};

/** Tabla simple de rendimiento por operario/cuadrilla. */
export const TablaOperarios = ({
  items = [],
  vacio = 'Nadie de la cuadrilla tomó casos en el período',
}) => {
  if (!items.length) {
    return <p className="estadisticas-vacio-chart">{vacio}</p>;
  }
  return (
    <div className="estadisticas-tabla-wrap">
      <table className="estadisticas-tabla">
        <thead>
          <tr>
            <th>Operario</th>
            <th>Tomados</th>
            <th>Resueltos</th>
            <th>Demora media</th>
          </tr>
        </thead>
        <tbody>
          {items.map((row) => (
            <tr key={row.id || row.label}>
              <td>{row.label}</td>
              <td>{row.tomados || 0}</td>
              <td>{row.resueltos || 0}</td>
              <td>
                {row.demoraMediaHoras == null
                  ? '—'
                  : (row.demoraMediaHoras >= 48
                    ? `${Math.round((row.demoraMediaHoras / 24) * 10) / 10} d`
                    : `${row.demoraMediaHoras} h`)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const EstadisticasCharts = {
  BarrasHorizontales,
  DonaEstados,
  LineaIngresosResueltos,
  PeriodoSelector,
  KpiGrid,
  EmbudoProceso,
  CompararPeriodo,
  TablaOperarios,
};

export default EstadisticasCharts;
