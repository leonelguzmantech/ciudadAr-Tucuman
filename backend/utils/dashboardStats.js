/**
 * Agrega métricas de casos / uso para dashboards (admin municipal y super).
 * matchBase: filtro Mongo ya acotado a la jurisdicción (o {} para toda la red).
 */
const mongoose = require('mongoose');
const Usuario = require('../models/usuario');

const categoriaCanon = (category) => (
  category === 'persona' ? 'familias' : (category || 'reparaciones')
);

/** Extrae ObjectIds de tenant desde el match de casos ({ tenant } | { tenant: { $in } }). */
const extraerTenantIds = (matchBase = {}) => {
  const raw = matchBase && matchBase.tenant;
  if (raw == null) return [];
  const lista = raw.$in ? raw.$in : [raw];
  return lista
    .map((id) => {
      try {
        return new mongoose.Types.ObjectId(String(id));
      } catch {
        return null;
      }
    })
    .filter(Boolean);
};

const diaKey = (fecha) => {
  const d = new Date(fecha);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
};

const parseFechaSoloDia = (valor, finDelDia = false) => {
  const raw = String(valor || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const d = new Date(`${raw}T${finDelDia ? '23:59:59.999' : '00:00:00.000'}`);
  return Number.isNaN(d.getTime()) ? null : d;
};

const diffDiasCalendario = (desde, hasta) => {
  const a = new Date(desde);
  const b = new Date(hasta);
  a.setHours(0, 0, 0, 0);
  b.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((b - a) / (24 * 60 * 60 * 1000)));
};

const msAHoras = (ms) => Math.round((ms / (1000 * 60 * 60)) * 10) / 10;

const pctCambio = (actual, anterior) => {
  if (anterior == null || actual == null) return null;
  if (anterior === 0) return actual === 0 ? 0 : 100;
  return Math.round(((actual - anterior) / anterior) * 1000) / 10;
};

/** Atajos 7/30/90 o rango personalizado (fechaDesde / fechaHasta = YYYY-MM-DD). */
const resolverRango = (opciones = {}) => {
  const fechaDesde = parseFechaSoloDia(opciones.fechaDesde, false);
  const fechaHasta = parseFechaSoloDia(opciones.fechaHasta, true);
  if (fechaDesde && fechaHasta && fechaDesde <= fechaHasta) {
    let desde = fechaDesde;
    let hasta = fechaHasta;
    let dias = diffDiasCalendario(desde, hasta);
    if (dias > 366) {
      desde = new Date(hasta);
      desde.setDate(desde.getDate() - 366);
      desde.setHours(0, 0, 0, 0);
      dias = diffDiasCalendario(desde, hasta);
    }
    return { dias, desde, hasta, modo: 'personalizado' };
  }
  const n = [7, 30, 90].includes(Number(opciones.dias)) ? Number(opciones.dias) : 30;
  const hasta = new Date();
  const desde = new Date(Date.now() - n * 24 * 60 * 60 * 1000);
  return { dias: n, desde, hasta, modo: 'preset' };
};

/** Período anterior de la misma duración, justo antes de `desde`. */
const rangoAnterior = (desde, hasta) => {
  const spanMs = Math.max(0, new Date(hasta) - new Date(desde));
  const prevHasta = new Date(new Date(desde).getTime() - 1);
  const prevDesde = new Date(prevHasta.getTime() - spanMs);
  return {
    desde: prevDesde,
    hasta: prevHasta,
    dias: diffDiasCalendario(prevDesde, prevHasta),
  };
};

const serieVacia = (desde, dias, extra = {}) => {
  const out = [];
  const base = new Date(desde);
  base.setHours(0, 0, 0, 0);
  for (let i = 0; i <= dias; i += 1) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    out.push({ fecha: d.toISOString().slice(0, 10), ingresos: 0, resueltos: 0, ...extra });
  }
  return out;
};

const conBase = (base, extra) => {
  if (!base || !Object.keys(base).length) return extra;
  if (Array.isArray(base.$and)) return { $and: [...base.$and, extra] };
  return { $and: [base, extra] };
};

const filtroCierreEnRango = (desde, hasta) => ({
  $or: [
    { eliminadoAt: { $gte: desde, $lte: hasta } },
    { eliminadoAt: null, updatedAt: { $gte: desde, $lte: hasta } },
  ],
});

/** Métricas de un período (reutilizable para actual vs anterior). */
const metricasDePeriodo = async (Marker, base, desde, hasta) => {
  const con = (extra) => conBase(base, extra);
  const [
    creados,
    aprobados,
    tomados,
    resueltos,
    anulados,
    vencidos,
    docsCreados,
    docsResueltosDemora,
    confirmacionesAgg,
    reclamosAgg,
    tomadosPorOperario,
    resueltosPorOperario,
  ] = await Promise.all([
    Marker.countDocuments(con({ createdAt: { $gte: desde, $lte: hasta } })),
    Marker.countDocuments(con({ aprobadoAt: { $gte: desde, $lte: hasta } })),
    Marker.countDocuments(con({ atendidoAt: { $gte: desde, $lte: hasta } })),
    Marker.countDocuments(con({
      status: 'resuelto',
      ...filtroCierreEnRango(desde, hasta),
    })),
    // Anulados manuales: no mezclar vencimientos automáticos
    Marker.countDocuments(con({
      status: 'rechazado',
      motivoEliminacion: { $not: { $regex: 'vencimiento', $options: 'i' } },
      ...filtroCierreEnRango(desde, hasta),
    })),
    // Animales / cosas perdidas que caducaron (15 días)
    Marker.countDocuments(con({
      eliminadoAt: { $gte: desde, $lte: hasta },
      motivoEliminacion: { $regex: 'vencimiento', $options: 'i' },
    })),
    Marker.find(con({ createdAt: { $gte: desde, $lte: hasta } }))
      .select('category createdBy createdAt perdidaTipo')
      .lean(),
    Marker.find(con({
      status: 'resuelto',
      createdAt: { $exists: true },
      ...filtroCierreEnRango(desde, hasta),
    }))
      .select('createdAt eliminadoAt updatedAt')
      .lean(),
    Marker.aggregate([
      { $match: con({ createdAt: { $gte: desde, $lte: hasta }, category: 'reparaciones' }) },
      { $project: { n: { $size: { $ifNull: ['$confirmations', []] } } } },
      { $group: { _id: null, total: { $sum: '$n' } } },
    ]),
    Marker.aggregate([
      { $match: con({ createdAt: { $gte: desde, $lte: hasta }, category: 'cosas_perdidas' }) },
      { $project: { n: { $size: { $ifNull: ['$claims', []] } } } },
      { $group: { _id: null, total: { $sum: '$n' } } },
    ]),
    Marker.aggregate([
      {
        $match: con({
          atendidoPor: { $nin: [null, ''] },
          atendidoAt: { $gte: desde, $lte: hasta },
        }),
      },
      { $group: { _id: '$atendidoPor', tomados: { $sum: 1 } } },
    ]),
    Marker.aggregate([
      {
        $match: con({
          atendidoPor: { $nin: [null, ''] },
          status: 'resuelto',
          ...filtroCierreEnRango(desde, hasta),
        }),
      },
      {
        $group: {
          _id: '$atendidoPor',
          resueltos: { $sum: 1 },
          demoraMs: {
            $sum: {
              $max: [
                0,
                {
                  $subtract: [
                    { $ifNull: ['$eliminadoAt', '$updatedAt'] },
                    '$createdAt',
                  ],
                },
              ],
            },
          },
        },
      },
    ]),
  ]);

  const porCategoria = {
    reparaciones: 0,
    perros_gatos: 0,
    familias: 0,
    cosas_perdidas: 0,
  };
  const perdidaTipos = { perdi: 0, encontre: 0 };
  const vecinos = new Set();
  docsCreados.forEach((doc) => {
    const cat = categoriaCanon(doc.category);
    if (Object.prototype.hasOwnProperty.call(porCategoria, cat)) porCategoria[cat] += 1;
    if (doc.createdBy) vecinos.add(String(doc.createdBy).toLowerCase());
    if (cat === 'cosas_perdidas' && (doc.perdidaTipo === 'perdi' || doc.perdidaTipo === 'encontre')) {
      perdidaTipos[doc.perdidaTipo] += 1;
    }
  });

  let demoraSumaMs = 0;
  let demoraN = 0;
  docsResueltosDemora.forEach((doc) => {
    const fin = doc.eliminadoAt || doc.updatedAt;
    const ini = doc.createdAt;
    if (!fin || !ini) return;
    const ms = new Date(fin) - new Date(ini);
    if (!Number.isFinite(ms) || ms < 0) return;
    demoraSumaMs += ms;
    demoraN += 1;
  });

  const totalCierre = resueltos + anulados + vencidos;
  const operariosMap = new Map();
  tomadosPorOperario.forEach((row) => {
    const id = String(row._id || '').toLowerCase();
    if (!id) return;
    operariosMap.set(id, {
      id,
      label: id,
      tomados: row.tomados || 0,
      resueltos: 0,
      demoraMediaHoras: null,
    });
  });
  resueltosPorOperario.forEach((row) => {
    const id = String(row._id || '').toLowerCase();
    if (!id) return;
    const prev = operariosMap.get(id) || {
      id,
      label: id,
      tomados: 0,
      resueltos: 0,
      demoraMediaHoras: null,
    };
    prev.resueltos = row.resueltos || 0;
    prev.demoraMediaHoras = prev.resueltos
      ? msAHoras((row.demoraMs || 0) / prev.resueltos)
      : null;
    operariosMap.set(id, prev);
  });

  const porOperario = Array.from(operariosMap.values())
    .sort((a, b) => (b.tomados + b.resueltos) - (a.tomados + a.resueltos))
    .slice(0, 12)
    .map((o) => ({
      ...o,
      label: o.label.includes('@') ? o.label.split('@')[0] : o.label,
    }));

  return {
    creados,
    aprobados,
    tomados,
    resueltos,
    anulados,
    vencidos,
    pctResueltos: totalCierre ? Math.round((resueltos / totalCierre) * 100) : null,
    vecinosDistinctos: vecinos.size,
    vecinosEmails: Array.from(vecinos),
    confirmacionesReparacion: confirmacionesAgg[0]?.total || 0,
    reclamosPerdidas: reclamosAgg[0]?.total || 0,
    demoraMediaHoras: demoraN ? msAHoras(demoraSumaMs / demoraN) : null,
    porCategoria: [
      { key: 'reparaciones', label: 'Reparaciones', n: porCategoria.reparaciones },
      { key: 'perros_gatos', label: 'Animales', n: porCategoria.perros_gatos },
      { key: 'familias', label: 'Familias', n: porCategoria.familias },
      { key: 'cosas_perdidas', label: 'Cosas perdidas', n: porCategoria.cosas_perdidas },
    ],
    perdidaTipos: [
      { key: 'perdi', label: 'Perdí algo', n: perdidaTipos.perdi },
      { key: 'encontre', label: 'Encontré algo', n: perdidaTipos.encontre },
    ],
    porOperario,
    docsCreados,
    docsResueltosDemora,
  };
};

/**
 * Usuarios: altas y cuántos reportaron en el período.
 * - Con tenantIds: acotado al/los municipio(s).
 * - Con global=true: toda la red (super).
 */
const metricasUsuarios = async (tenantIds, Marker, matchBase, desde, hasta, { global = false } = {}) => {
  const vacio = {
    registrados: 0,
    nuevos: 0,
    activos: 0,
    nuevosActivos: 0,
    nuevosQuietos: 0,
    docsNuevos: [],
    ambito: global ? 'global' : 'municipal',
  };
  if (!tenantIds.length && !global) return vacio;

  const filtroMuni = tenantIds.length
    ? { municipioTenantId: { $in: tenantIds } }
    : {};
  const [registrados, docsNuevos, emailsActivosAgg] = await Promise.all([
    Usuario.countDocuments({ ...filtroMuni, activo: { $ne: false } }),
    Usuario.find({
      ...filtroMuni,
      createdAt: { $gte: desde, $lte: hasta },
    })
      .select('email createdAt')
      .lean(),
    Marker.aggregate([
      {
        $match: conBase(matchBase, {
          createdAt: { $gte: desde, $lte: hasta },
          createdBy: { $exists: true, $nin: [null, '', 'anonimo'] },
        }),
      },
      { $group: { _id: { $toLower: '$createdBy' } } },
    ]),
  ]);

  const emailsActivos = new Set(
    (emailsActivosAgg || []).map((r) => String(r._id || '').toLowerCase()).filter(Boolean)
  );
  const emailsNuevos = docsNuevos
    .map((u) => String(u.email || '').toLowerCase())
    .filter(Boolean);
  const nuevosActivos = emailsNuevos.filter((e) => emailsActivos.has(e)).length;

  return {
    registrados,
    nuevos: docsNuevos.length,
    activos: emailsActivos.size,
    nuevosActivos,
    nuevosQuietos: Math.max(0, docsNuevos.length - nuevosActivos),
    docsNuevos,
    ambito: global ? 'global' : 'municipal',
  };
};

const buildDashboardStats = async (Marker, matchBase = {}, opciones = 30) => {
  const opts = (opciones && typeof opciones === 'object' && !Array.isArray(opciones))
    ? opciones
    : { dias: opciones };
  const { dias, desde, hasta, modo } = resolverRango(opts);
  const base = matchBase && Object.keys(matchBase).length ? matchBase : {};
  const con = (extra) => conBase(base, extra);
  const prev = rangoAnterior(desde, hasta);
  const tenantIdsExplicitos = Array.isArray(opts.tenantIds)
    ? opts.tenantIds
      .map((id) => {
        try {
          return new mongoose.Types.ObjectId(String(id));
        } catch {
          return null;
        }
      })
      .filter(Boolean)
    : [];
  const tenantIds = tenantIdsExplicitos.length
    ? tenantIdsExplicitos
    : extraerTenantIds(base);
  const usuariosGlobales = !!opts.usuariosGlobales && !tenantIds.length;

  // Embudo operativo: solo reparaciones (cuadrilla no atiende familias/animales/perdidas).
  const baseReparaciones = conBase(base, { category: 'reparaciones' });
  const conRep = (extra) => conBase(baseReparaciones, extra);

  const [
    porAprobar,
    abiertos,
    enProceso,
    pendienteCierre,
    derivados,
    estadosAgg,
    abiertosAgingDocs,
    actual,
    anterior,
    creadosReparaciones,
    aprobadosReparaciones,
    avanzadosReparaciones,
    resueltosReparaciones,
    usuariosActual,
    usuariosAnterior,
  ] = await Promise.all([
    Marker.countDocuments(con({ eliminadoAt: null, status: 'pendiente_aprobacion' })),
    Marker.countDocuments(con({
      eliminadoAt: null,
      status: 'pendiente',
      $or: [{ avisadoAt: null }, { avisadoAt: { $exists: false } }],
    })),
    Marker.countDocuments(con({ eliminadoAt: null, status: 'en_proceso' })),
    Marker.countDocuments(con({ eliminadoAt: null, status: 'pendiente_cierre' })),
    Marker.countDocuments(con({
      eliminadoAt: null,
      avisadoAt: { $ne: null },
      status: { $nin: ['resuelto', 'rechazado', 'pendiente_aprobacion'] },
    })),
    Marker.aggregate([
      { $match: con({ eliminadoAt: null, status: { $nin: ['resuelto', 'rechazado'] } }) },
      { $group: { _id: '$status', n: { $sum: 1 } } },
    ]),
    Marker.find(con({
      eliminadoAt: null,
      status: { $nin: ['resuelto', 'rechazado'] },
    }))
      .select('createdAt aprobadoAt')
      .lean(),
    metricasDePeriodo(Marker, base, desde, hasta),
    metricasDePeriodo(Marker, base, prev.desde, prev.hasta),
    Marker.countDocuments(conRep({ createdAt: { $gte: desde, $lte: hasta } })),
    Marker.countDocuments(conRep({ aprobadoAt: { $gte: desde, $lte: hasta } })),
    // Avance hacia el cierre: cuadrilla tomó, vecino avisó resolución, o se propuso cierre
    Marker.countDocuments(conRep({
      $or: [
        { atendidoAt: { $gte: desde, $lte: hasta } },
        { resolvedByReportedAt: { $gte: desde, $lte: hasta } },
        { cierrePropuestoAt: { $gte: desde, $lte: hasta } },
      ],
    })),
    Marker.countDocuments(conRep({
      status: 'resuelto',
      ...filtroCierreEnRango(desde, hasta),
    })),
    metricasUsuarios(tenantIds, Marker, base, desde, hasta, { global: usuariosGlobales }),
    metricasUsuarios(tenantIds, Marker, base, prev.desde, prev.hasta, { global: usuariosGlobales }),
  ]);

  const ahora = Date.now();
  const antiguedad = {
    d0_7: 0,
    d8_15: 0,
    d16_30: 0,
    d30_mas: 0,
  };
  abiertosAgingDocs.forEach((doc) => {
    const ini = doc.aprobadoAt || doc.createdAt;
    if (!ini) {
      antiguedad.d0_7 += 1;
      return;
    }
    const diasAbierto = Math.floor((ahora - new Date(ini).getTime()) / (24 * 60 * 60 * 1000));
    if (diasAbierto <= 7) antiguedad.d0_7 += 1;
    else if (diasAbierto <= 15) antiguedad.d8_15 += 1;
    else if (diasAbierto <= 30) antiguedad.d16_30 += 1;
    else antiguedad.d30_mas += 1;
  });

  const serieMap = new Map(
    serieVacia(desde, dias, { nuevos: 0, activos: 0 }).map((row) => [row.fecha, { ...row }])
  );
  actual.docsCreados.forEach((doc) => {
    const key = diaKey(doc.createdAt);
    if (key && serieMap.has(key)) serieMap.get(key).ingresos += 1;
  });
  actual.docsResueltosDemora.forEach((doc) => {
    const key = diaKey(doc.eliminadoAt || doc.updatedAt);
    if (key && serieMap.has(key)) serieMap.get(key).resueltos += 1;
  });

  // Serie de usuarios: altas por día + vecinos distintos que reportaron ese día
  const activosPorDia = new Map();
  actual.docsCreados.forEach((doc) => {
    const key = diaKey(doc.createdAt);
    const email = String(doc.createdBy || '').toLowerCase();
    if (!key || !serieMap.has(key) || !email || email === 'anonimo') return;
    if (!activosPorDia.has(key)) activosPorDia.set(key, new Set());
    activosPorDia.get(key).add(email);
  });
  activosPorDia.forEach((set, key) => {
    if (serieMap.has(key)) serieMap.get(key).activos = set.size;
  });
  (usuariosActual.docsNuevos || []).forEach((doc) => {
    const key = diaKey(doc.createdAt);
    if (key && serieMap.has(key)) serieMap.get(key).nuevos += 1;
  });

  const estados = {
    pendiente_aprobacion: 0,
    pendiente: 0,
    en_proceso: 0,
    pendiente_cierre: 0,
  };
  estadosAgg.forEach((row) => {
    if (Object.prototype.hasOwnProperty.call(estados, row._id)) estados[row._id] = row.n;
  });

  const embudo = [
    { key: 'creados', label: 'Creados', n: creadosReparaciones },
    { key: 'aprobados', label: 'Aprobados', n: aprobadosReparaciones },
    {
      key: 'tomados',
      label: 'Cuadrilla o cierre propuesto',
      n: avanzadosReparaciones,
    },
    { key: 'resueltos', label: 'Resueltos', n: resueltosReparaciones },
  ];

  const comparar = {
    creados: {
      actual: actual.creados,
      anterior: anterior.creados,
      pct: pctCambio(actual.creados, anterior.creados),
    },
    resueltos: {
      actual: actual.resueltos,
      anterior: anterior.resueltos,
      pct: pctCambio(actual.resueltos, anterior.resueltos),
    },
    anulados: {
      actual: actual.anulados,
      anterior: anterior.anulados,
      pct: pctCambio(actual.anulados, anterior.anulados),
    },
    vencidos: {
      actual: actual.vencidos,
      anterior: anterior.vencidos,
      pct: pctCambio(actual.vencidos, anterior.vencidos),
    },
    tomados: {
      actual: actual.tomados,
      anterior: anterior.tomados,
      pct: pctCambio(actual.tomados, anterior.tomados),
    },
    demoraMediaHoras: {
      actual: actual.demoraMediaHoras,
      anterior: anterior.demoraMediaHoras,
      pct: pctCambio(actual.demoraMediaHoras, anterior.demoraMediaHoras),
    },
    vecinosDistinctos: {
      actual: actual.vecinosDistinctos,
      anterior: anterior.vecinosDistinctos,
      pct: pctCambio(actual.vecinosDistinctos, anterior.vecinosDistinctos),
    },
    usuariosNuevos: {
      actual: usuariosActual.nuevos,
      anterior: usuariosAnterior.nuevos,
      pct: pctCambio(usuariosActual.nuevos, usuariosAnterior.nuevos),
    },
    usuariosActivos: {
      actual: usuariosActual.activos,
      anterior: usuariosAnterior.activos,
      pct: pctCambio(usuariosActual.activos, usuariosAnterior.activos),
    },
  };

  const serieDiaria = Array.from(serieMap.values());

  return {
    periodo: {
      dias,
      desde,
      hasta,
      modo,
      anterior: { dias: prev.dias, desde: prev.desde, hasta: prev.hasta },
    },
    operacion: {
      porAprobar,
      abiertos,
      enProceso,
      pendienteCierre,
      derivados,
      demoraMediaHoras: actual.demoraMediaHoras,
      abiertosTotales: abiertosAgingDocs.length,
    },
    antiguedad: [
      { key: 'd0_7', label: 'Hasta 7 días', n: antiguedad.d0_7 },
      { key: 'd8_15', label: '8 a 15 días', n: antiguedad.d8_15 },
      { key: 'd16_30', label: '16 a 30 días', n: antiguedad.d16_30 },
      { key: 'd30_mas', label: 'Más de 30 días', n: antiguedad.d30_mas, alerta: antiguedad.d30_mas > 0 },
    ],
    embudo,
    comparar,
    uso: {
      publicadosPeriodo: actual.creados,
      resueltosPeriodo: actual.resueltos,
      anuladosPeriodo: actual.anulados,
      vencidosPeriodo: actual.vencidos,
      pctResueltos: actual.pctResueltos,
      vecinosDistinctos: actual.vecinosDistinctos,
      confirmacionesReparacion: actual.confirmacionesReparacion,
      reclamosPerdidas: actual.reclamosPerdidas,
      aprobadosPeriodo: actual.aprobados,
      tomadosPeriodo: actual.tomados,
    },
    usuarios: (tenantIds.length || usuariosGlobales) ? {
      registrados: usuariosActual.registrados,
      nuevos: usuariosActual.nuevos,
      activos: usuariosActual.activos,
      nuevosActivos: usuariosActual.nuevosActivos,
      nuevosQuietos: usuariosActual.nuevosQuietos,
      ambito: usuariosActual.ambito || (usuariosGlobales ? 'global' : 'municipal'),
      disponibles: true,
    } : { disponibles: false },
    porCategoria: actual.porCategoria,
    perdidaTipos: actual.perdidaTipos,
    porOperario: actual.porOperario,
    estados: [
      { key: 'pendiente_aprobacion', label: 'Por aprobar', n: estados.pendiente_aprobacion },
      { key: 'pendiente', label: 'Pendiente', n: estados.pendiente },
      { key: 'en_proceso', label: 'En proceso', n: estados.en_proceso },
      { key: 'pendiente_cierre', label: 'Cierre propuesto', n: estados.pendiente_cierre },
    ],
    serieDiaria,
    serieUsuarios: serieDiaria.map((row) => ({
      fecha: row.fecha,
      ingresos: row.nuevos || 0,
      resueltos: row.activos || 0,
    })),
    composicionUsuariosNuevos: [
      { key: 'aprobados', label: 'Nuevos que reportaron', n: usuariosActual.nuevosActivos },
      { key: 'pendiente', label: 'Nuevos sin reportar', n: usuariosActual.nuevosQuietos },
    ],
  };
};

module.exports = {
  buildDashboardStats,
  resolverRango,
  /** @deprecated usar resolverRango */
  rangoDias: (dias) => resolverRango({ dias }),
};
