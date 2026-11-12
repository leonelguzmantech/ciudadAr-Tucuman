const express = require('express');
const Tenant = require('../models/tenant');
const Marker = require('../models/marker');
const { getRequestUser, normalizeUserId, isAdminUser } = require('../utils/users');
const { getAdminScope } = require('../utils/jurisdictions');
const { buildDashboardStats } = require('../utils/dashboardStats');

const router = express.Router();

const TYPE_LABEL = {
  province: 'Provincia',
  municipality: 'Municipio',
  commune: 'Comuna',
};

const requireSuperAdmin = async (req, res, next) => {
  try {
    req.requester = getRequestUser(req);
    if (!req.requester || req.requester === 'anonimo' || !isAdminUser(req.requester)) {
      return res.status(403).json({ message: 'Solo el super administrador puede acceder' });
    }
    req.adminScope = await getAdminScope(req.requester);
    next();
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

router.use(requireSuperAdmin);

const resumenTenant = (tenant, contadores = {}) => ({
  id: String(tenant._id),
  name: tenant.name,
  slug: tenant.slug,
  type: tenant.type,
  typeLabel: TYPE_LABEL[tenant.type] || tenant.type,
  status: tenant.status || 'active',
  admins: Array.isArray(tenant.admins) ? tenant.admins : [],
  adminCount: Array.isArray(tenant.admins) ? tenant.admins.length : 0,
  operarios: Array.isArray(tenant.operarios) ? tenant.operarios : [],
  operarioCount: Array.isArray(tenant.operarios) ? tenant.operarios.length : 0,
  contactEmail: tenant.contactEmail || '',
  hasBoundary: Boolean(tenant.boundary && tenant.boundary.coordinates && tenant.boundary.coordinates.length),
  abiertos: contadores.abiertos || 0,
  porAprobar: contadores.porAprobar || 0,
  registro: contadores.registro || 0,
});

/** Casos sin municipio/comuna: tenant vacío o (legado) tenant = provincia. */
const buildFiltroSinTenant = async (extra = {}) => {
  const provincias = await Tenant.find({ type: 'province' }).select('_id').lean();
  const provinceIds = provincias.map((t) => t._id);
  const orTenant = [{ tenant: null }, { tenant: { $exists: false } }];
  if (provinceIds.length) orTenant.push({ tenant: { $in: provinceIds } });
  return {
    eliminadoAt: null,
    status: { $nin: ['resuelto', 'rechazado'] },
    $or: orTenant,
    ...extra,
  };
};

/** Municipios/comunas activos sin ningún admin local. */
const idsMunicipiosSinAdmin = async () => {
  const rows = await Tenant.find({
    type: { $in: ['municipality', 'commune'] },
    status: 'active',
    $or: [{ admins: { $exists: false } }, { admins: { $size: 0 } }],
  })
    .select('_id')
    .lean();
  return rows.map((t) => t._id);
};

// Tablero global
router.get('/stats', async (req, res) => {
  try {
    const filtroSinTenantBase = await buildFiltroSinTenant();
    const sinAdminIds = await idsMunicipiosSinAdmin();
    const filtroCasosSinAdmin = {
      eliminadoAt: null,
      status: { $nin: ['resuelto', 'rechazado'] },
      tenant: { $in: sinAdminIds },
    };
    const [
      jurisdicciones,
      conAdmins,
      sinLimite,
      inactivas,
      porAprobar,
      abiertos,
      registro,
      sinTenant,
      sinTenantPorAprobar,
      sinTenantAprobados,
      municipiosSinAdmin,
      casosSinAdmin,
      casosSinAdminPorAprobar,
    ] = await Promise.all([
      Tenant.countDocuments({}),
      Tenant.countDocuments({ 'admins.0': { $exists: true } }),
      Tenant.countDocuments({
        $or: [
          { boundary: { $exists: false } },
          { boundary: null },
          { 'boundary.coordinates.0': { $exists: false } },
        ],
      }),
      Tenant.countDocuments({ status: { $ne: 'active' } }),
      Marker.countDocuments({ eliminadoAt: null, status: 'pendiente_aprobacion' }),
      Marker.countDocuments({
        eliminadoAt: null,
        status: { $in: ['pendiente', 'en_proceso'] },
      }),
      Marker.countDocuments({
        $or: [
          { eliminadoAt: { $ne: null } },
          { status: { $in: ['resuelto', 'rechazado'] } },
        ],
      }),
      Marker.countDocuments(filtroSinTenantBase),
      Marker.countDocuments({
        ...filtroSinTenantBase,
        status: 'pendiente_aprobacion',
      }),
      Marker.countDocuments({
        ...filtroSinTenantBase,
        status: { $in: ['pendiente', 'en_proceso', 'pendiente_cierre'] },
      }),
      Promise.resolve(sinAdminIds.length),
      Marker.countDocuments(filtroCasosSinAdmin),
      Marker.countDocuments({
        ...filtroCasosSinAdmin,
        status: 'pendiente_aprobacion',
      }),
    ]);

    res.json({
      jurisdicciones,
      conAdmins,
      sinLimite,
      inactivas,
      porAprobar,
      abiertos,
      registro,
      sinTenant,
      sinTenantPorAprobar,
      sinTenantAprobados,
      municipiosSinAdmin,
      casosSinAdmin,
      casosSinAdminPorAprobar,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Estadísticas de casos / uso (provincia o un municipio)
router.get('/dashboard', async (req, res) => {
  try {
    const tenantId = String(req.query.tenantId || '').trim();
    const filtro = tenantId ? { tenant: tenantId } : {};
    const data = await buildDashboardStats(Marker, filtro, {
      dias: req.query.dias,
      fechaDesde: req.query.fechaDesde,
      fechaHasta: req.query.fechaHasta,
      tenantIds: tenantId ? [tenantId] : [],
      // Sin municipio: altas y actividad de toda la red (panel Super).
      usuariosGlobales: !tenantId,
    });
    res.json(data);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Ranking operativo por municipio/comuna (carga + demoras)
router.get('/ranking', async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 12, 1), 80);
    const incluirSinCarga = String(req.query.todos || '') === '1';
    const dias = [7, 30, 90].includes(Number(req.query.dias)) ? Number(req.query.dias) : 30;
    const desdePeriodo = new Date(Date.now() - dias * 24 * 60 * 60 * 1000);

    const tenants = await Tenant.find({
      type: { $in: ['municipality', 'commune'] },
      status: 'active',
    })
      .select('name slug type status admins operarios')
      .lean();

    const ids = tenants.map((t) => t._id);
    const [abiertosAgg, porAprobarAgg, resueltosAgg] = await Promise.all([
      Marker.aggregate([
        {
          $match: {
            tenant: { $in: ids },
            eliminadoAt: null,
            status: { $in: ['pendiente', 'en_proceso', 'pendiente_cierre'] },
          },
        },
        { $group: { _id: '$tenant', n: { $sum: 1 } } },
      ]),
      Marker.aggregate([
        {
          $match: {
            tenant: { $in: ids },
            eliminadoAt: null,
            status: 'pendiente_aprobacion',
          },
        },
        { $group: { _id: '$tenant', n: { $sum: 1 } } },
      ]),
      Marker.aggregate([
        {
          $match: {
            tenant: { $in: ids },
            status: 'resuelto',
            createdAt: { $exists: true, $ne: null },
            $or: [
              { eliminadoAt: { $gte: desdePeriodo } },
              { eliminadoAt: null, updatedAt: { $gte: desdePeriodo } },
            ],
          },
        },
        {
          $group: {
            _id: '$tenant',
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

    const mapCount = (rows) => {
      const m = new Map();
      rows.forEach((r) => m.set(String(r._id), r.n));
      return m;
    };
    const abiertos = mapCount(abiertosAgg);
    const porAprobar = mapCount(porAprobarAgg);
    const resueltosMap = new Map();
    resueltosAgg.forEach((r) => {
      resueltosMap.set(String(r._id), {
        resueltos: r.resueltos || 0,
        demoraMediaHoras: r.resueltos
          ? Math.round(((r.demoraMs || 0) / r.resueltos) / (1000 * 60 * 60) * 10) / 10
          : null,
      });
    });

    let items = tenants.map((t) => {
      const id = String(t._id);
      const pa = porAprobar.get(id) || 0;
      const ab = abiertos.get(id) || 0;
      const cierre = resueltosMap.get(id) || { resueltos: 0, demoraMediaHoras: null };
      const adminCount = Array.isArray(t.admins) ? t.admins.length : 0;
      return {
        id,
        name: t.name,
        slug: t.slug,
        type: t.type,
        typeLabel: TYPE_LABEL[t.type] || t.type,
        adminCount,
        porAprobar: pa,
        abiertos: ab,
        carga: pa + ab,
        resueltos: cierre.resueltos,
        demoraMediaHoras: cierre.demoraMediaHoras,
        sinAdmin: adminCount === 0,
      };
    });

    if (!incluirSinCarga) {
      // Solo territorios con trabajo (o cierres recientes). Sin admin “vacíos” no entran acá.
      items = items.filter((t) => t.carga > 0 || t.resueltos > 0);
    }

    items.sort((a, b) => {
      // Prioridad: sin admin local pero con cola (el Super debe verlos primero).
      const aPri = a.sinAdmin && a.carga > 0 ? 1 : 0;
      const bPri = b.sinAdmin && b.carga > 0 ? 1 : 0;
      if (bPri !== aPri) return bPri - aPri;
      if (b.carga !== a.carga) return b.carga - a.carga;
      if (b.porAprobar !== a.porAprobar) return b.porAprobar - a.porAprobar;
      if (a.sinAdmin !== b.sinAdmin) return a.sinAdmin ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    // Con todos=1 devolvemos el listado completo (comparativo provincial).
    if (!incluirSinCarga && limit < items.length) {
      items = items.slice(0, limit);
    }

    res.json({ items, total: items.length, dias });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Cola de casos sin jurisdicción (para asignar territorio)
// estado: todos | por_aprobar | aprobados
router.get('/sin-tenant', async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 50);
    const skip = (page - 1) * limit;
    const estado = String(req.query.estado || 'todos').trim();
    const extra = {};
    if (estado === 'por_aprobar') {
      extra.status = 'pendiente_aprobacion';
    } else if (estado === 'aprobados') {
      extra.status = { $in: ['pendiente', 'en_proceso', 'pendiente_cierre'] };
    }
    const filtro = await buildFiltroSinTenant(extra);

    const [total, docs] = await Promise.all([
      Marker.countDocuments(filtro),
      Marker.find(filtro)
        .select('caseId status category description direccion lat lng createdAt createdBy objeto perdidaTipo')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
    ]);

    res.json({
      items: docs.map((m) => ({
        id: String(m._id),
        caseId: m.caseId,
        status: m.status,
        category: m.category,
        description: m.description || '',
        direccion: m.direccion || '',
        lat: m.lat,
        lng: m.lng,
        objeto: m.objeto || '',
        createdAt: m.createdAt,
        createdBy: m.createdBy || '',
      })),
      total,
      page,
      hasMore: skip + docs.length < total,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Asignar jurisdicción a un caso huérfano
router.patch('/casos/:id/tenant', async (req, res) => {
  try {
    const tenantId = String(req.body.tenantId || '').trim();
    if (!tenantId) {
      return res.status(400).json({ message: 'Indicá la jurisdicción' });
    }
    const tenant = await Tenant.findById(tenantId);
    if (!tenant) {
      return res.status(404).json({ message: 'Jurisdicción no encontrada' });
    }
    if (!['municipality', 'commune'].includes(tenant.type)) {
      return res.status(400).json({ message: 'Asigná un municipio o comuna' });
    }
    if (tenant.status !== 'active') {
      return res.status(400).json({ message: 'Esa jurisdicción no está activa' });
    }

    const marker = await Marker.findById(req.params.id);
    if (!marker || marker.eliminadoAt) {
      return res.status(404).json({ message: 'Caso no encontrado' });
    }

    let provinceId = tenant.parent || null;
    if (!provinceId) {
      const provincia = await Tenant.findOne({ type: 'province', status: 'active' }).select('_id');
      provinceId = provincia?._id || null;
    }

    marker.tenant = tenant._id;
    marker.province = provinceId;
    await marker.save();

    res.json({
      message: `Caso #${marker.caseId || '—'} asignado a ${tenant.name}`,
      item: {
        id: String(marker._id),
        caseId: marker.caseId,
        tenantId: String(tenant._id),
        tenantName: tenant.name,
        status: marker.status,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Listado de jurisdicciones (+ contadores livianos)
router.get('/jurisdicciones', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const tipo = String(req.query.type || '').trim();
    const estado = String(req.query.status || '').trim();
    const filtro = {};
    if (q) {
      filtro.$or = [
        { name: { $regex: q, $options: 'i' } },
        { slug: { $regex: q, $options: 'i' } },
      ];
    }
    if (['province', 'municipality', 'commune'].includes(tipo)) {
      filtro.type = tipo;
    }
    if (['active', 'inactive', 'pending'].includes(estado)) {
      filtro.status = estado;
    }

    const tenants = await Tenant.find(filtro)
      .select('name slug type status admins operarios contactEmail boundary')
      .sort({ type: 1, name: 1 })
      .lean();

    const ids = tenants.map((t) => t._id);
    const [abiertosAgg, porAprobarAgg, registroAgg] = await Promise.all([
      Marker.aggregate([
        {
          $match: {
            tenant: { $in: ids },
            eliminadoAt: null,
            status: { $in: ['pendiente', 'en_proceso'] },
          },
        },
        { $group: { _id: '$tenant', n: { $sum: 1 } } },
      ]),
      Marker.aggregate([
        {
          $match: {
            tenant: { $in: ids },
            eliminadoAt: null,
            status: 'pendiente_aprobacion',
          },
        },
        { $group: { _id: '$tenant', n: { $sum: 1 } } },
      ]),
      Marker.aggregate([
        {
          $match: {
            tenant: { $in: ids },
            $or: [
              { eliminadoAt: { $ne: null } },
              { status: { $in: ['resuelto', 'rechazado'] } },
            ],
          },
        },
        { $group: { _id: '$tenant', n: { $sum: 1 } } },
      ]),
    ]);

    const mapCount = (rows) => {
      const m = new Map();
      rows.forEach((r) => m.set(String(r._id), r.n));
      return m;
    };
    const abiertos = mapCount(abiertosAgg);
    const porAprobar = mapCount(porAprobarAgg);
    const registro = mapCount(registroAgg);

    res.json({
      items: tenants.map((t) => resumenTenant(t, {
        abiertos: abiertos.get(String(t._id)) || 0,
        porAprobar: porAprobar.get(String(t._id)) || 0,
        registro: registro.get(String(t._id)) || 0,
      })),
      total: tenants.length,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Activar / desactivar jurisdicción
router.patch('/jurisdicciones/:id', async (req, res) => {
  try {
    const tenant = await Tenant.findById(req.params.id);
    if (!tenant) {
      return res.status(404).json({ message: 'Jurisdicción no encontrada' });
    }
    const status = String(req.body.status || '').trim();
    if (!['active', 'inactive', 'pending'].includes(status)) {
      return res.status(400).json({ message: 'Estado inválido' });
    }
    tenant.status = status;
    await tenant.save();
    res.json(resumenTenant(tenant.toObject()));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Lista plana de asignaciones admin ↔ jurisdicción
router.get('/admins', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim().toLowerCase();
    const tenants = await Tenant.find({ 'admins.0': { $exists: true } })
      .select('name slug type status admins')
      .sort({ name: 1 })
      .lean();

    const asignaciones = [];
    tenants.forEach((t) => {
      (t.admins || []).forEach((email) => {
        if (q && !email.includes(q) && !String(t.name).toLowerCase().includes(q)) return;
        asignaciones.push({
          email,
          tenantId: String(t._id),
          tenantName: t.name,
          tenantSlug: t.slug,
          tenantType: t.type,
          typeLabel: TYPE_LABEL[t.type] || t.type,
          tenantStatus: t.status,
        });
      });
    });

    asignaciones.sort((a, b) => a.email.localeCompare(b.email) || a.tenantName.localeCompare(b.tenantName));
    res.json({ items: asignaciones, total: asignaciones.length });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Asignar admin a una jurisdicción
router.post('/admins', async (req, res) => {
  try {
    const email = normalizeUserId(req.body.email || '');
    const tenantId = String(req.body.tenantId || '').trim();
    const slug = String(req.body.slug || '').trim().toLowerCase();

    if (!email || email === 'anonimo' || !email.includes('@')) {
      return res.status(400).json({ message: 'Indicá un email válido' });
    }
    if (isAdminUser(email)) {
      return res.status(400).json({
        message: 'Ese email es super administrador; no hace falta asignarlo a un municipio',
      });
    }

    const tenant = tenantId
      ? await Tenant.findById(tenantId)
      : await Tenant.findOne({ slug });
    if (!tenant) {
      return res.status(404).json({ message: 'Jurisdicción no encontrada' });
    }

    const antes = (tenant.admins || []).length;
    tenant.admins = Array.from(new Set([...(tenant.admins || []), email]));
    await tenant.save();

    res.json({
      message: tenant.admins.length === antes
        ? 'Ese admin ya estaba asignado'
        : 'Admin asignado',
      tenant: resumenTenant(tenant.toObject()),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Quitar admin de una jurisdicción
router.delete('/admins', async (req, res) => {
  try {
    const email = normalizeUserId(req.body.email || req.query.email || '');
    const tenantId = String(req.body.tenantId || req.query.tenantId || '').trim();
    if (!email || !tenantId) {
      return res.status(400).json({ message: 'Faltan email o jurisdicción' });
    }
    const tenant = await Tenant.findById(tenantId);
    if (!tenant) {
      return res.status(404).json({ message: 'Jurisdicción no encontrada' });
    }
    tenant.admins = (tenant.admins || []).filter((a) => a !== email);
    await tenant.save();
    res.json({
      message: 'Admin quitado',
      tenant: resumenTenant(tenant.toObject()),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
