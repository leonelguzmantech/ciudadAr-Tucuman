// backend/routes/markerRoutes.js
const express = require('express');
const multer = require('multer');
const Marker = require('../models/marker');
const ChatMensaje = require('../models/chatMensaje');
const Usuario = require('../models/usuario');
const { normalizeUserId, getRequestUser, isAdminUser } = require('../utils/users');
const Tenant = require('../models/tenant');
const {
  findJurisdictionForPoint,
  getAdminScope,
  isScopeAdmin,
  isScopeOperario,
  isScopeStaff,
  canManageMarker,
  buildManagedMarkersFilter,
} = require('../utils/jurisdictions');
const { removeExpiredMarkers } = require('../utils/markerExpiry');
const { buildDashboardStats } = require('../utils/dashboardStats');
const {
  avisarCambioEstado,
  avisarOficina,
  avisarRechazo,
  crearNotificacion,
  avisarAdminsPorAprobar,
  avisarAdminsCasoAprobado,
  avisarVecinosCercanos,
  avisarComplementosPerdidaCercanos,
  avisarPartesCaso,
  listarAdminsDelCaso,
  avisarOperariosDelCaso,
  RADIO_CERCA_DEFAULT_M,
} = require('../utils/notificaciones');

const distanciaMetrosGeo = (lat1, lng1, lat2, lng2) => {
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2
    + Math.cos((lat1 * Math.PI) / 180)
      * Math.cos((lat2 * Math.PI) / 180)
      * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};
const router = express.Router();

// Configuración de multer para almacenar los archivos en memoria
const storage = multer.memoryStorage();
const upload = multer({ storage });

const STATUS_VALUES = [
  'pendiente_aprobacion',
  'pendiente',
  'en_proceso',
  'pendiente_cierre',
  'resuelto',
  'rechazado',
];
const CATEGORY_VALUES = ['familias', 'persona', 'perros_gatos', 'reparaciones', 'cosas_perdidas'];
const FAMILIAS_TIPOS = ['violencia', 'hijos', 'calle'];
const ANIMAL_TIPOS = ['abandonado', 'perdido', 'adopcion'];
const PERDIDA_TIPOS = ['perdi', 'encontre'];
const LIMITE_REPORTES_POR_DIA = 5;
const MS_UN_DIA = 24 * 60 * 60 * 1000;
const LIMITE_MAPA_DEFAULT = 100;
const LIMITE_ADMIN_DEFAULT = 20;
const LIMITE_MAX = 200;

const parsePageLimit = (query, defaultLimit) => {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  let limit = parseInt(query.limit, 10) || defaultLimit;
  if (!Number.isFinite(limit) || limit < 1) limit = defaultLimit;
  limit = Math.min(LIMITE_MAX, limit);
  return { page, limit, skip: (page - 1) * limit };
};

const buildListQuery = ({
  requester,
  adminScope,
  category,
  excludeCategory,
  animalTipo,
  excludeAnimalTipos,
  perdidaTipo,
  status,
  mine,
  myJurisdiction,
  q,
  atencion,
  tipoCierre,
  periodoDias,
  fechaDesde,
  fechaHasta,
  sinTenant = false,
  tenantId = null,
  soloCaseId = false,
  soloAdminScope = false,
  incluirEliminados = false,
  soloEliminados = false,
  excludeAvisados = false,
}) => {
  const textoQ = String(q || '').trim().replace(/^#/, '');
  // Búsqueda exacta por #caso: ignora estado / período / atención (sí respeta jurisdicción)
  if (soloCaseId && /^\d+$/.test(textoQ)) {
    const andExacto = [{ caseId: Number(textoQ) }];
    if (sinTenant) {
      andExacto.push({
        $or: [
          { tenant: null },
          { tenant: { $exists: false } },
        ],
      });
    } else if (tenantId) {
      try {
        andExacto.push({ tenant: new mongoose.Types.ObjectId(String(tenantId)) });
      } catch {
        andExacto.push({ tenant: String(tenantId) });
      }
    }
    if (soloAdminScope && !adminScope?.isSuperAdmin && !sinTenant) {
      // Incluye también sin municipio: el buscador por #caso debe hallarlos
      andExacto.push({
        $or: [
          buildManagedMarkersFilter(adminScope),
          { tenant: null },
          { tenant: { $exists: false } },
        ],
      });
    } else if (!soloAdminScope && !isScopeAdmin(adminScope)) {
      andExacto.push({
        $or: [
          { createdBy: requester },
          {
            status: { $nin: ['pendiente_aprobacion', 'rechazado'] },
            category: { $nin: ['familias', 'persona'] },
          },
        ],
      });
    }
    if (mine === '1' || mine === 'true') {
      const yo = normalizeUserId(requester);
      if (yo && yo !== 'anonimo') {
        andExacto.push({
          $expr: {
            $eq: [
              { $toLower: { $ifNull: ['$createdBy', ''] } },
              yo,
            ],
          },
        });
      } else {
        andExacto.push({ createdBy: requester });
      }
    }
    if (andExacto.length === 1) return andExacto[0];
    return { $and: andExacto };
  }

  const and = [];

  if (sinTenant) {
    and.push({
      $or: [
        { tenant: null },
        { tenant: { $exists: false } },
      ],
    });
  } else if (tenantId) {
    try {
      and.push({ tenant: new mongoose.Types.ObjectId(String(tenantId)) });
    } catch {
      and.push({ tenant: String(tenantId) });
    }
  }

  if (soloEliminados) {
    // Registro: bajas lógicas + resueltos/anulados (por si quedó alguno sin eliminadoAt)
    and.push({
      $or: [
        { eliminadoAt: { $ne: null } },
        { status: { $in: ['resuelto', 'rechazado'] } },
      ],
    });

    const cierre = String(tipoCierre || '').trim();
    if (cierre === 'resuelto') {
      // Resuelto real: no mezclar derivaciones a oficina (familias / similares)
      and.push({ status: 'resuelto' });
      and.push({
        motivoEliminacion: { $not: { $regex: 'oficina', $options: 'i' } },
      });
    } else if (cierre === 'anulado') {
      and.push({ status: 'rechazado' });
      and.push({
        motivoEliminacion: { $not: { $regex: 'oficina|vencimiento', $options: 'i' } },
      });
    } else if (cierre === 'vencido') {
      and.push({
        motivoEliminacion: { $regex: 'vencimiento', $options: 'i' },
      });
    } else if (cierre === 'oficina') {
      // Familias (y cierres equivalentes): oficina avisada → Registro
      and.push({
        motivoEliminacion: { $regex: 'oficina', $options: 'i' },
      });
    }

    // Fecha de baja (eliminadoAt) o, si falta, createdAt
    let desde = fechaDesde ? new Date(fechaDesde) : null;
    let hasta = fechaHasta ? new Date(fechaHasta) : null;
    const dias = parseInt(periodoDias, 10);
    if (!desde && Number.isFinite(dias) && dias > 0) {
      desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000);
    }
    if (desde && !Number.isNaN(desde.getTime())) {
      and.push({
        $or: [
          { eliminadoAt: { $gte: desde } },
          { eliminadoAt: null, createdAt: { $gte: desde } },
        ],
      });
    }
    if (hasta && !Number.isNaN(hasta.getTime())) {
      const fin = new Date(hasta);
      fin.setHours(23, 59, 59, 999);
      and.push({
        $or: [
          { eliminadoAt: { $lte: fin } },
          { eliminadoAt: null, createdAt: { $lte: fin } },
        ],
      });
    }
  } else if (!incluirEliminados) {
    and.push({ eliminadoAt: null });
    // Reportes / Cosas perdidas activos: no mezclar archivo
    if (soloAdminScope) {
      and.push({ status: { $nin: ['resuelto', 'rechazado'] } });
    }
  }

  // Atajos del dashboard: urgentes / resolución vecino / respondieron datos
  if (atencion === 'urgentes') {
    and.push({
      category: 'reparaciones',
      status: { $in: ['pendiente', 'en_proceso'] },
      'confirmations.0': { $exists: true },
    });
  } else if (atencion === 'resolucion') {
    and.push({
      resolvedBy: { $nin: [null, ''] },
      status: { $ne: 'resuelto' },
    });
  } else if (atencion === 'respuestas') {
    and.push({
      respuestaDatosAt: { $ne: null },
      status: { $nin: ['resuelto', 'rechazado', 'pendiente_cierre'] },
    });
  } else if (atencion === 'cierres') {
    and.push({ status: 'pendiente_cierre' });
  } else if (atencion === 'derivados') {
    // Oficina avisada, siguen en el mapa (no Registro)
    and.push({
      avisadoAt: { $ne: null },
      status: { $nin: ['resuelto', 'rechazado', 'pendiente_aprobacion'] },
    });
  }

  // Reportes / Cosas perdidas activos: no mezclar derivados a oficina
  if (excludeAvisados && atencion !== 'derivados') {
    and.push({
      $or: [
        { avisadoAt: null },
        { avisadoAt: { $exists: false } },
      ],
    });
  }

  if (soloAdminScope) {
    // Dashboard: siempre acotar a la jurisdicción del admin (salvo super admin)
    if (!adminScope?.isSuperAdmin) {
      and.push(buildManagedMarkersFilter(adminScope));
    }
  } else if (!isScopeAdmin(adminScope)) {
    // Vecino: no traer pendientes ajenos ni familias/persona ajenas
    and.push({
      $or: [
        { createdBy: requester },
        {
          status: { $nin: ['pendiente_aprobacion', 'rechazado'] },
          category: { $nin: ['familias', 'persona'] },
        },
      ],
    });
  }

  if (mine === '1' || mine === 'true') {
    // Case-insensitive: el dueño siempre ve lo suyo, aunque el caso esté en otra jurisdicción
    const yo = normalizeUserId(requester);
    if (yo && yo !== 'anonimo') {
      and.push({
        $expr: {
          $eq: [
            { $toLower: { $ifNull: ['$createdBy', ''] } },
            yo,
          ],
        },
      });
    } else {
      and.push({ createdBy: requester });
    }
  }

  // Mapa vecino: admin municipal acota a su municipio (no aplica si pide “solo mis reportes”)
  if (
    (myJurisdiction === '1' || myJurisdiction === 'true')
    && !(mine === '1' || mine === 'true')
    && isScopeAdmin(adminScope)
    && !adminScope.isSuperAdmin
  ) {
    and.push(buildManagedMarkersFilter(adminScope));
  }

  if (category && category !== 'todas') {
    if (category === 'familias') {
      and.push({ category: { $in: ['familias', 'persona'] } });
    } else if (CATEGORY_VALUES.includes(category)) {
      and.push({ category });
    }
  }

  const catsExcluidas = String(excludeCategory || '')
    .split(',')
    .map((c) => c.trim())
    .filter((c) => CATEGORY_VALUES.includes(c));
  if (catsExcluidas.length === 1) {
    and.push({ category: { $ne: catsExcluidas[0] } });
  } else if (catsExcluidas.length > 1) {
    and.push({ category: { $nin: catsExcluidas } });
  }

  if (animalTipo && animalTipo !== 'todos' && ANIMAL_TIPOS.includes(animalTipo)) {
    and.push({ animalTipo });
  }

  // Reportes municipales: sacar adopción / animal perdido (van al Radar entre vecinos)
  const tiposAnimalExcluidos = String(excludeAnimalTipos || '')
    .split(',')
    .map((t) => t.trim())
    .filter((t) => ANIMAL_TIPOS.includes(t));
  if (tiposAnimalExcluidos.length) {
    and.push({
      $nor: [{
        category: 'perros_gatos',
        animalTipo: { $in: tiposAnimalExcluidos },
      }],
    });
  }

  if (perdidaTipo && PERDIDA_TIPOS.includes(perdidaTipo)) {
    and.push({ perdidaTipo });
  }

  if (status && status !== 'todos' && STATUS_VALUES.includes(status)) {
    // Filtro de estado estricto (las novedades se ven por atencion=respuestas / badge)
    and.push({ status });
  }

  const texto = textoQ;
  if (texto) {
    const orTexto = [
      { description: { $regex: texto, $options: 'i' } },
      { direccion: { $regex: texto, $options: 'i' } },
      { objeto: { $regex: texto, $options: 'i' } },
      { createdBy: { $regex: texto, $options: 'i' } },
      { motivoEliminacion: { $regex: texto, $options: 'i' } },
      { resolutionDescription: { $regex: texto, $options: 'i' } },
    ];
    if (/^\d+$/.test(texto)) {
      orTexto.push({ caseId: Number(texto) });
    }
    if (mongoose.Types.ObjectId.isValid(texto) && String(texto).length === 24) {
      orTexto.push({ _id: new mongoose.Types.ObjectId(texto) });
    }
    and.push({ $or: orTexto });
  }

  if (!and.length) return {};
  if (and.length === 1) return and[0];
  return { $and: and };
};

const normalizeFamiliasTipo = (category, value) => {
  if (category !== 'familias') return null;
  const normalized = String(value || '').trim().toLowerCase();
  return FAMILIAS_TIPOS.includes(normalized) ? normalized : null;
};

const normalizeAnimalTipo = (category, value) => {
  if (category !== 'perros_gatos') return null;
  const normalized = String(value || '').trim().toLowerCase();
  return ANIMAL_TIPOS.includes(normalized) ? normalized : null;
};

const normalizePerdidaTipo = (category, value) => {
  if (category !== 'cosas_perdidas') return null;
  const normalized = String(value || '').trim().toLowerCase();
  return PERDIDA_TIPOS.includes(normalized) ? normalized : null;
};

// Solo dígitos; para animales debe tener entre 8 y 15
const normalizeContacto = (category, value) => {
  if (category !== 'perros_gatos') return '';
  const digitos = String(value || '').replace(/\D/g, '');
  if (digitos.length < 8 || digitos.length > 15) return null;
  return digitos;
};

const nombreDesdeUsuario = async (userId) => {
  const email = normalizeUserId(userId);
  if (!email || email === 'anonimo') return 'Vecino';
  try {
    const usuario = await Usuario.findOne({ email }).select('nombre email');
    if (usuario?.nombre) return usuario.nombre;
  } catch (_) { /* ignore */ }
  return email.split('@')[0] || 'Vecino';
};

const tieneFotoDniUsuario = (foto) => !!(foto && (foto.contentType || foto.data));

/** Datos de identidad del vecino: staff gestiona el caso; fotos DNI solo admin municipal. */
const datosReportantePublicos = (usuario, emailFallback = '', opts = {}) => {
  const dniFotosCargadas = tieneFotoDniUsuario(usuario?.dniFotoFrente)
    && tieneFotoDniUsuario(usuario?.dniFotoDorso);
  const base = {
    email: (usuario && usuario.email) || emailFallback || '',
    nombre: (usuario && usuario.nombre) || '',
    dni: (usuario && usuario.dni) || '',
    telefono: (usuario && usuario.telefono) || '',
    telefonoConfirmado: !!(usuario && usuario.telefonoConfirmado),
    dniFotosCargadas,
  };
  if (opts.incluirDniFotos && opts.markerId && dniFotosCargadas) {
    base.dniFotoFrenteUrl = `/api/markers/admin/${opts.markerId}/reportante/dni/frente`;
    base.dniFotoDorsoUrl = `/api/markers/admin/${opts.markerId}/reportante/dni/dorso`;
  }
  return base;
};

const mapaUsuariosPorEmail = async (emails) => {
  const unicos = [...new Set(
    (emails || [])
      .map((e) => normalizeUserId(e))
      .filter((e) => e && e !== 'anonimo')
  )];
  const mapa = new Map();
  if (!unicos.length) return mapa;
  const usuarios = await Usuario.find({ email: { $in: unicos } })
    .select('email nombre dni telefono telefonoConfirmado dniFotoFrente.contentType dniFotoDorso.contentType')
    .lean();
  usuarios.forEach((u) => {
    mapa.set(normalizeUserId(u.email), u);
  });
  return mapa;
};

/** Adjunta `reportante` a marcadores que el scope puede gestionar. */
const enriquecerConReportante = async (markers, scope = null) => {
  const lista = Array.isArray(markers) ? markers.filter(Boolean) : [];
  if (!lista.length) return lista;
  const emails = lista
    .filter((m) => m.canManage)
    .map((m) => m.createdBy);
  const mapa = await mapaUsuariosPorEmail(emails);
  // Fotos del DNI: solo admin municipal / super (no cuadrilla)
  const incluirDniFotos = isScopeAdmin(scope);
  return lista.map((marker) => {
    if (!marker.canManage) return marker;
    const email = normalizeUserId(marker.createdBy);
    return {
      ...marker,
      reportante: datosReportantePublicos(
        mapa.get(email),
        marker.createdBy || '',
        { incluirDniFotos, markerId: marker._id }
      ),
    };
  });
};

// Escribir: solo quien publicó y quien reclamó
const puedeEscribirChat = (marker, requester) => {
  if (!marker || !requester || requester === 'anonimo') return false;
  if (normalizeUserId(marker.createdBy) === requester) return true;
  return (marker.claims || []).some((c) => normalizeUserId(c.userId) === requester);
};

// Leer: participantes + admin del municipio (historial / auditoría)
const puedeLeerChat = (marker, requester, adminScope) => {
  if (puedeEscribirChat(marker, requester)) return true;
  return canManageMarker(adminScope, marker);
};

const normalizeStatus = (value, fallback = 'pendiente_aprobacion') => {
  if (!value) return fallback;
  const normalized = String(value).toLowerCase();
  return STATUS_VALUES.includes(normalized) ? normalized : fallback;
};

// "persona" es legado (= situación de calle). Siempre canónico: familias.
const normalizeCategory = (value, fallback = 'reparaciones') => {
  const raw = (value != null && String(value).trim() !== '') ? value : fallback;
  const normalized = String(raw || 'reparaciones').trim().toLowerCase();
  if (normalized === 'persona' || normalized.includes('persona')) return 'familias';
  if (CATEGORY_VALUES.includes(normalized)) return normalized;
  if (normalized.includes('familia')) return 'familias';
  if (normalized.includes('perro') || normalized.includes('gato')) return 'perros_gatos';
  if (normalized.includes('repar')) return 'reparaciones';
  if (normalized.includes('perdid') || normalized.includes('encontr')) return 'cosas_perdidas';
  const fb = String(fallback || 'reparaciones').trim().toLowerCase();
  if (fb === 'persona') return 'familias';
  return CATEGORY_VALUES.includes(fb) ? fb : 'reparaciones';
};

/** Si venía category=persona (o familias sin tipo), tipificar calle cuando corresponde */
const resolverFamiliasTipoAlGuardar = (categoryRaw, categoryCanon, familiasTipo) => {
  const raw = String(categoryRaw || '').trim().toLowerCase();
  const eraPersona = raw === 'persona' || raw.includes('persona');
  const tipo = normalizeFamiliasTipo(categoryCanon, familiasTipo);
  if (categoryCanon !== 'familias') return null;
  if (tipo) return tipo;
  if (eraPersona) return 'calle';
  return null;
};

const computeResolvedAt = (status, currentResolvedAt = null) => {
  if (status === 'resuelto') {
    return new Date();
  }
  if (status && status !== 'resuelto') {
    return null;
  }
  return currentResolvedAt;
};

const getNextCaseId = async () => {
  const lastMarker = await Marker.findOne().sort({ caseId: -1 }).select('caseId');
  const lastCaseId = lastMarker && typeof lastMarker.caseId === 'number'
    ? lastMarker.caseId
    : 0;
  return lastCaseId + 1;
};

const JURISDICTION_FIELDS = 'name type';

const RADIO_MISMO_CASO_METROS = 50;

const distanciaMetros = (lat1, lng1, lat2, lng2) => {
  const tierra = 6371000;
  const aGrados = (grados) => (grados * Math.PI) / 180;
  const dLat = aGrados(lat2 - lat1);
  const dLng = aGrados(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(aGrados(lat1)) * Math.cos(aGrados(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * tierra * Math.asin(Math.min(1, Math.sqrt(a)));
};

const sanitizeMarkerResponse = (markerDoc, scope = null, requester = null) => {
  if (!markerDoc) {
    return null;
  }
  const marker = markerDoc.toObject ? markerDoc.toObject() : markerDoc;
  if (!marker.imageUrl && marker.image && marker._id) {
    marker.imageUrl = `/api/markers/${marker._id}/image`;
  }
  if (!marker.resolutionImageUrl && marker.resolutionImage && marker._id) {
    marker.resolutionImageUrl = `/api/markers/${marker._id}/resolution-image`;
  }
  if (!marker.respuestaDatosImageUrl && marker.respuestaDatosImage && marker._id) {
    marker.respuestaDatosImageUrl = `/api/markers/${marker._id}/respuesta-datos-image`;
  }
  if (marker.image) {
    delete marker.image;
  }
  if (marker.resolutionImage) {
    delete marker.resolutionImage;
  }
  if (marker.respuestaDatosImage) {
    delete marker.respuestaDatosImage;
  }
  // API nunca expone category "persona": unificar a familias (calle)
  if (marker.category === 'persona') {
    marker.category = 'familias';
    if (!marker.familiasTipo) marker.familiasTipo = 'calle';
  }
  const confirmations = Array.isArray(marker.confirmations) ? marker.confirmations : [];
  const puedeVerVecinos = scope && canManageMarker(scope, marker);
  marker.neighborCount = 1 + confirmations.length;
  marker.confirmedByMe = !!requester && confirmations.some(
    (confirmacion) => normalizeUserId(confirmacion.userId) === requester
  );
  marker.confirmations = confirmations.map((confirmacion, index) => ({
    description: confirmacion.description || '',
    createdAt: confirmacion.createdAt,
    imageUrl: confirmacion.imageUrl
      || (confirmacion.image && confirmacion.image.data
        ? `/api/markers/${marker._id}/confirmations/${index}/image`
        : ''),
    ...(puedeVerVecinos ? { userId: confirmacion.userId } : {}),
  }));
  const claims = Array.isArray(marker.claims) ? marker.claims : [];
  marker.claimCount = claims.length;
  marker.claimedByMe = !!requester && claims.some(
    (claim) => normalizeUserId(claim.userId) === requester
  );
  marker.canChat = !!requester && (
    normalizeUserId(marker.createdBy) === requester
    || marker.claimedByMe
  );
  marker.claims = claims.map((claim) => ({
    nombre: claim.nombre || '',
    createdAt: claim.createdAt,
    ...(puedeVerVecinos || normalizeUserId(marker.createdBy) === requester
      ? { userId: claim.userId }
      : {}),
  }));
  const chatAbierto = (marker.chatAbiertoPor || []).map((id) => normalizeUserId(id));
  const confirmaciones = Array.isArray(marker.confirmacionesPerdida)
    ? marker.confirmacionesPerdida
    : [];
  marker.chatAbiertoPorMi = !!requester && chatAbierto.includes(requester);
  marker.confirmacionPerdidaMia = confirmaciones.find(
    (c) => normalizeUserId(c.userId) === requester
  ) || null;
  marker.confirmacionesPerdidaCount = confirmaciones.length;
  // Ya no hace falta doble marca: cierra quien perdió el objeto
  marker.perdidaEsperaOtraParte = false;
  const jurisdiction = marker.tenant && marker.tenant.name ? marker.tenant : null;
  marker.jurisdictionName = jurisdiction ? jurisdiction.name : null;
  marker.jurisdictionType = jurisdiction ? jurisdiction.type : null;
  if (marker.tenant && marker.tenant._id) marker.tenant = marker.tenant._id;
  if (marker.province && marker.province._id) marker.province = marker.province._id;
  if (scope) {
    marker.canManage = canManageMarker(scope, marker);
  }
  return marker;
};

const loadAdminScope = async (req, res, next) => {
  try {
    req.requester = getRequestUser(req);
    req.adminScope = await getAdminScope(req.requester);
    next();
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const requireJurisdictionAdmin = (req, res, next) => {
  if (!isScopeAdmin(req.adminScope)) {
    return res.status(403).json({ message: 'Acceso de administrador requerido' });
  }
  next();
};

const requireStaff = (req, res, next) => {
  if (!isScopeStaff(req.adminScope)) {
    return res.status(403).json({ message: 'Acceso de personal municipal requerido' });
  }
  next();
};

const rejectIfEliminado = (marker, res) => {
  if (marker && marker.eliminadoAt) {
    res.status(400).json({
      message: 'Este caso está en el registro de eliminados y no se puede modificar',
    });
    return true;
  }
  return false;
};

router.use(loadAdminScope);

// Lista paginada + filtros en servidor (no trae todo el dataset)
router.get('/', async (req, res) => {
  try {
    await removeExpiredMarkers();

    const { requester, adminScope } = req;
    const { page, limit, skip } = parsePageLimit(req.query, LIMITE_MAPA_DEFAULT);
    const myJurisdictionOn = req.query.myJurisdiction === '1' || req.query.myJurisdiction === 'true';
    const mineOn = req.query.mine === '1' || req.query.mine === 'true';
    const misPerdidas = req.query.misPerdidas === '1' || req.query.misPerdidas === 'true';
    const cercaOn = req.query.cerca === '1' || req.query.cerca === 'true';
    const nearLat = Number(req.query.lat);
    const nearLng = Number(req.query.lng);
    const nearRadius = Math.min(
      8000,
      Math.max(500, parseInt(req.query.radius, 10) || RADIO_CERCA_DEFAULT_M)
    );
    const cercaValido = cercaOn
      && Number.isFinite(nearLat)
      && Number.isFinite(nearLng)
      && nearLat >= -90 && nearLat <= 90
      && nearLng >= -180 && nearLng <= 180;
    // Registro del vecino: solo sus propias bajas (resueltos / anulados / vencidos)
    const registroPropio = mineOn && !misPerdidas && !cercaOn && (
      req.query.eliminados === '1'
      || req.query.eliminados === 'true'
      || req.query.registro === '1'
    );
    const registroPerdidas = misPerdidas && (
      req.query.eliminados === '1'
      || req.query.eliminados === 'true'
      || req.query.registro === '1'
    );

    // Cerca (Radar): categoría según query (cosas_perdidas | perros_gatos)
    let filtro = buildListQuery({
      requester,
      adminScope,
      category: cercaValido
        ? undefined
        : (misPerdidas ? 'cosas_perdidas' : req.query.category),
      excludeCategory: (misPerdidas || cercaValido) ? undefined : req.query.excludeCategory,
      animalTipo: cercaValido ? undefined : req.query.animalTipo,
      perdidaTipo: req.query.perdidaTipo,
      status: cercaValido ? undefined : req.query.status,
      mine: (misPerdidas || cercaValido) ? undefined : req.query.mine,
      myJurisdiction: req.query.myJurisdiction,
      q: req.query.q,
      // Mis reportes → Registro: mismos filtros de cierre/período que el admin
      tipoCierre: (registroPropio || registroPerdidas) ? req.query.tipoCierre : undefined,
      periodoDias: (registroPropio || registroPerdidas) ? req.query.periodoDias : undefined,
      fechaDesde: (registroPropio || registroPerdidas) ? req.query.fechaDesde : undefined,
      fechaHasta: (registroPropio || registroPerdidas) ? req.query.fechaHasta : undefined,
      // Búsqueda exacta por #caso: ignora período / estado (igual que admin)
      soloCaseId: req.query.soloCaseId === '1' || req.query.soloCaseId === 'true',
      soloAdminScope: false,
      soloEliminados: registroPropio || registroPerdidas,
    });

    if (cercaValido) {
      // Bounding box un poco holgado (×1.2) para no cortar el borde del círculo geodésico
      const margen = 1.2;
      const deltaLat = (nearRadius * margen) / 111320;
      const deltaLng = (nearRadius * margen)
        / (111320 * Math.max(0.2, Math.cos((nearLat * Math.PI) / 180)));
      const animalTiposOk = ['perdido', 'abandonado', 'adopcion'];
      const animalTipoQ = String(req.query.animalTipo || '').trim();
      let cercaCategoriaFiltro;
      if (req.query.category === 'cosas_perdidas') {
        cercaCategoriaFiltro = { category: 'cosas_perdidas' };
      } else if (req.query.category === 'perros_gatos') {
        cercaCategoriaFiltro = animalTiposOk.includes(animalTipoQ)
          ? { category: 'perros_gatos', animalTipo: animalTipoQ }
          : { category: 'perros_gatos', animalTipo: { $in: animalTiposOk } };
      } else {
        // Compat: ambos mundos si no mandan categoría
        cercaCategoriaFiltro = {
          $or: [
            { category: 'cosas_perdidas' },
            { category: 'perros_gatos', animalTipo: { $in: animalTiposOk } },
          ],
        };
      }
      const yoCerca = normalizeUserId(requester);
      filtro = {
        $and: [
          filtro,
          cercaCategoriaFiltro,
          { status: { $in: ['pendiente', 'en_proceso'] } },
          { eliminadoAt: null },
          // Cerca = avisos de otros (comparación case-insensitive); los propios van en Míos
          ...(yoCerca && yoCerca !== 'anonimo'
            ? [{
              $expr: {
                $ne: [
                  { $toLower: { $ifNull: ['$createdBy', ''] } },
                  yoCerca,
                ],
              },
            }]
            : []),
          { lat: { $gte: nearLat - deltaLat, $lte: nearLat + deltaLat } },
          { lng: { $gte: nearLng - deltaLng, $lte: nearLng + deltaLng } },
        ],
      };
    }

    // Vecino: avisos propios o donde reclamó
    if (misPerdidas) {
      const yo = normalizeUserId(requester);
      filtro = {
        $and: [
          filtro,
          {
            $or: [
              { createdBy: yo },
              { 'claims.userId': yo },
            ],
          },
        ],
      };
    }

    let markersQuery = Marker.find(filtro)
      .select('-image -resolutionImage -respuestaDatosImage -confirmations.image')
      .populate('tenant', JURISDICTION_FIELDS);

    if (cercaValido) {
      // Candidatos del bbox sin tope chico: si limitás antes del Haversine,
      // al agrandar el radio Mongo devuelve 100 al azar y faltan pines dentro del círculo.
      markersQuery = markersQuery.limit(2000);
    } else {
      markersQuery = markersQuery
        .sort((registroPropio || registroPerdidas) ? { eliminadoAt: -1, createdAt: -1 } : { createdAt: -1 })
        .skip(skip)
        .limit(limit);
    }

    const [totalRaw, markers] = await Promise.all([
      cercaValido ? Promise.resolve(0) : Marker.countDocuments(filtro),
      markersQuery,
    ]);

    // Seguridad extra por si el filtro no alcanzó (p. ej. admin de jurisdicción)
    let visibles = markers.filter((marker) => {
      const markerOwner = normalizeUserId(marker.createdBy);
      if (cercaValido) {
        // Nunca listar el propio aviso en Cerca (aunque el $ne falle por casing raro)
        if (markerOwner && markerOwner === requester) return false;
        if (marker.status === 'pendiente_aprobacion' || marker.status === 'rechazado') {
          return false;
        }
        if (marker.category === 'familias' || marker.category === 'persona') return false;
        const d = distanciaMetrosGeo(nearLat, nearLng, Number(marker.lat), Number(marker.lng));
        marker._distanciaMetros = d;
        return d <= nearRadius;
      }
      if (misPerdidas) {
        const yo = normalizeUserId(requester);
        if (markerOwner === yo) return true;
        return (marker.claims || []).some((c) => normalizeUserId(c.userId) === yo);
      }
      // Mis reportes / registro propio: siempre los del dueño (aunque el admin no gestione ese municipio)
      if (mineOn || registroPropio) {
        return markerOwner === requester;
      }
      // "Mi jurisdicción": solo casos que el admin puede gestionar
      if (myJurisdictionOn && isScopeAdmin(adminScope) && !adminScope.isSuperAdmin) {
        return canManageMarker(adminScope, marker);
      }
      if (canManageMarker(adminScope, marker)) return true;
      if (marker.status === 'pendiente_aprobacion' || marker.status === 'rechazado') {
        return markerOwner === requester;
      }
      if (marker.category === 'familias' || marker.category === 'persona') {
        return markerOwner === requester;
      }
      return true;
    });

    if (cercaValido) {
      visibles.sort((a, b) => (a._distanciaMetros || 0) - (b._distanciaMetros || 0));
      const totalCerca = visibles.length;
      // Devolver todos los del círculo (ya filtrados); el front pagina en cliente si hace falta
      return res.json({
        items: visibles.map((marker) => ({
          ...sanitizeMarkerResponse(marker, adminScope, requester),
          distanciaMetros: Math.round(marker._distanciaMetros || 0),
        })),
        total: totalCerca,
        page: 1,
        limit: totalCerca,
        hasMore: false,
        lat: nearLat,
        lng: nearLng,
        radius: nearRadius,
      });
    }

    res.json({
      items: visibles.map((marker) => sanitizeMarkerResponse(marker, adminScope, requester)),
      total: totalRaw,
      page,
      limit,
      hasMore: skip + limit < totalRaw,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});


// Ruta para agregar un nuevo marcador
router.post('/', upload.single('image'), async (req, res) => {
  const {
    lat, lng, date, time, description, direccion, status, category, visibility,
    familiasTipo, animalTipo, perdidaTipo, objeto, contacto,
  } = req.body;
  const { requester: createdBy, adminScope } = req;
  const normalizedCategory = normalizeCategory(category);
  const familiasTipoCanon = resolverFamiliasTipoAlGuardar(category, normalizedCategory, familiasTipo);

  try {
    // Los vecinos tienen un tope diario. Los admins no, para poder gestionar.
    if (!isScopeAdmin(adminScope) && createdBy && createdBy !== 'anonimo') {
      const desde = new Date(Date.now() - MS_UN_DIA);
      const creadosHoy = await Marker.countDocuments({
        createdBy,
        createdAt: { $gte: desde },
        eliminadoAt: null,
      });
      if (creadosHoy >= LIMITE_REPORTES_POR_DIA) {
        return res.status(429).json({
          message: `Llegaste al límite de ${LIMITE_REPORTES_POR_DIA} reportes en 24 horas. Probá mañana.`,
          limite: LIMITE_REPORTES_POR_DIA,
          creadosHoy,
        });
      }
    }

    const jurisdiction = await findJurisdictionForPoint(lat, lng);

    // Solo quien administra esa jurisdicción puede crear con un estado distinto
    let finalStatus = 'pendiente_aprobacion';
    if (status && canManageMarker(adminScope, jurisdiction)) {
      finalStatus = normalizeStatus(status, 'pendiente');
    }

    if (!req.file) {
      return res.status(400).json({ message: 'La foto del reporte es obligatoria.' });
    }

    // Generar caseId único tomando el último caseId existente
    const caseId = await getNextCaseId();

    if (normalizedCategory === 'cosas_perdidas' && !normalizePerdidaTipo(normalizedCategory, perdidaTipo)) {
      return res.status(400).json({ message: 'Elegí si perdiste o encontraste algo.' });
    }
    if (normalizedCategory === 'perros_gatos' && !normalizeAnimalTipo(normalizedCategory, animalTipo)) {
      return res.status(400).json({ message: 'Elegí de qué se trata el aviso de animales.' });
    }
    const contactoNormalizado = normalizeContacto(normalizedCategory, contacto);
    if (normalizedCategory === 'perros_gatos' && !contactoNormalizado) {
      return res.status(400).json({
        message: 'En avisos de animales el celular de contacto es obligatorio (para WhatsApp).',
      });
    }

    const newMarker = new Marker({
      tenant: jurisdiction.tenant,
      province: jurisdiction.province,
      lat,
      lng,
      date,
      time,
      description,
      direccion: String(direccion || '').trim(),
      status: finalStatus,
      category: normalizedCategory,
      familiasTipo: familiasTipoCanon,
      animalTipo: normalizeAnimalTipo(normalizedCategory, animalTipo),
      perdidaTipo: normalizePerdidaTipo(normalizedCategory, perdidaTipo),
      objeto: normalizedCategory === 'cosas_perdidas' ? String(objeto || '').trim().slice(0, 120) : '',
      contacto: contactoNormalizado || '',
      visibility: visibility || 'public',
      createdBy,
      caseId,
      resolvedAt: computeResolvedAt(finalStatus),
    });

    newMarker.image = {
      data: req.file.buffer,
      contentType: req.file.mimetype || 'application/octet-stream',
    };
    newMarker.imageUrl = `/api/markers/${newMarker._id}/image`;

    const savedMarker = await newMarker.save();
    await savedMarker.populate('tenant', JURISDICTION_FIELDS);
    if (savedMarker.status === 'pendiente_aprobacion') {
      avisarAdminsPorAprobar(savedMarker).catch((err) => {
        console.error('No se pudo notificar a admins del nuevo caso:', err.message);
      });
    } else if (savedMarker.status === 'pendiente') {
      avisarVecinosCercanos(savedMarker).catch((err) => {
        console.error('No se pudo avisar vecinos cerca:', err.message);
      });
      avisarComplementosPerdidaCercanos(savedMarker).catch((err) => {
        console.error('No se pudo avisar complementos de pérdida:', err.message);
      });
    }
    res.status(201).json(sanitizeMarkerResponse(savedMarker, adminScope, createdBy));
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Ruta para actualizar un marcador existente
router.put('/:id', upload.single('image'), async (req, res) => {
  const { id } = req.params;
  const {
    lat, lng, date, time, description, direccion, status, category, visibility,
    familiasTipo, animalTipo, perdidaTipo, objeto, contacto,
  } = req.body;
  const { requester, adminScope } = req;

  try {
    const existingMarker = await Marker.findById(id);
    if (!existingMarker) {
      return res.status(404).json({ message: 'Marker not found' });
    }
    if (rejectIfEliminado(existingMarker, res)) return;
    const markerOwner = normalizeUserId(existingMarker.createdBy);
    if (markerOwner !== requester) {
      return res.status(403).json({ message: 'No autorizado para editar este marcador' });
    }
    const adminYaActuo =
      Boolean(existingMarker.avisadoAt)
      || (existingMarker.status && existingMarker.status !== 'pendiente_aprobacion');
    if (adminYaActuo && !canManageMarker(adminScope, existingMarker)) {
      return res.status(403).json({
        message: 'Este caso ya fue tomado por un administrador y no se puede editar.',
      });
    }

    const normalizedStatus = normalizeStatus(status, existingMarker.status);
    const normalizedCategory = normalizeCategory(category, existingMarker.category);
    const familiasTipoCanon = resolverFamiliasTipoAlGuardar(
      category != null ? category : existingMarker.category,
      normalizedCategory,
      familiasTipo != null ? familiasTipo : existingMarker.familiasTipo
    );
    if (normalizedCategory === 'cosas_perdidas' && !normalizePerdidaTipo(normalizedCategory, perdidaTipo || existingMarker.perdidaTipo)) {
      return res.status(400).json({ message: 'Elegí si perdiste o encontraste algo.' });
    }
    if (normalizedCategory === 'perros_gatos' && !normalizeAnimalTipo(normalizedCategory, animalTipo || existingMarker.animalTipo)) {
      return res.status(400).json({ message: 'Elegí de qué se trata el aviso de animales.' });
    }
    const contactoFuente = contacto != null ? contacto : existingMarker.contacto;
    const contactoNormalizado = normalizeContacto(normalizedCategory, contactoFuente);
    if (normalizedCategory === 'perros_gatos' && !contactoNormalizado) {
      return res.status(400).json({
        message: 'En avisos de animales el celular de contacto es obligatorio (para WhatsApp).',
      });
    }

    const updateData = {
      lat,
      lng,
      date,
      time,
      description,
      direccion: String(direccion || '').trim(),
      status: normalizedStatus,
      category: normalizedCategory,
      familiasTipo: familiasTipoCanon,
      animalTipo: normalizeAnimalTipo(normalizedCategory, animalTipo),
      perdidaTipo: normalizePerdidaTipo(normalizedCategory, perdidaTipo || existingMarker.perdidaTipo),
      objeto: normalizedCategory === 'cosas_perdidas'
        ? String(objeto != null ? objeto : existingMarker.objeto || '').trim().slice(0, 120)
        : '',
      contacto: contactoNormalizado || '',
      visibility: visibility || existingMarker.visibility || 'public',
      resolvedAt: computeResolvedAt(normalizedStatus, existingMarker.resolvedAt),
    };

    const moved =
      Number(lat) !== existingMarker.lat || Number(lng) !== existingMarker.lng;
    if (moved) {
      const jurisdiction = await findJurisdictionForPoint(lat, lng);
      updateData.tenant = jurisdiction.tenant;
      updateData.province = jurisdiction.province;
    }

    if (req.file) {
      updateData.image = {
        data: req.file.buffer,
        contentType: req.file.mimetype || 'application/octet-stream',
      };
      updateData.imageUrl = `/api/markers/${existingMarker._id}/image`;
    }

    const updatedMarker = await Marker.findByIdAndUpdate(id, updateData, {
      new: true,
    }).populate('tenant', JURISDICTION_FIELDS);
    res.json(sanitizeMarkerResponse(updatedMarker, adminScope, requester));
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Baja lógica: sale del mapa/listas activas pero queda en el registro
router.delete('/:id', async (req, res) => {
  const { requester, adminScope } = req;
  try {
    const existingMarker = await Marker.findById(req.params.id);
    if (!existingMarker) {
      return res.status(404).json({ message: 'Marker not found' });
    }
    if (existingMarker.eliminadoAt) {
      return res.status(400).json({ message: 'Este caso ya está en el registro de eliminados' });
    }
    const markerOwner = normalizeUserId(existingMarker.createdBy);
    const esAdminDelCaso = canManageMarker(adminScope, existingMarker);
    if (markerOwner !== requester && !esAdminDelCaso) {
      return res.status(403).json({ message: 'No autorizado para eliminar este marcador' });
    }
    const adminYaActuo =
      Boolean(existingMarker.avisadoAt)
      || (existingMarker.status && existingMarker.status !== 'pendiente_aprobacion');
    if (markerOwner === requester && adminYaActuo && !esAdminDelCaso) {
      return res.status(403).json({
        message: 'Este caso ya fue tomado por un administrador y no se puede eliminar.',
      });
    }

    const motivo = String(req.body?.motivo || req.query?.motivo || '').trim().slice(0, 400);
    existingMarker.eliminadoAt = new Date();
    existingMarker.eliminadoPor = requester;
    existingMarker.motivoEliminacion = motivo
      || (esAdminDelCaso && markerOwner !== requester
        ? 'Eliminado por administrador (baja lógica)'
        : 'Eliminado por el vecino (baja lógica)');
    // Si no estaba cerrado, queda como anulado para el Registro / filtros
    if (existingMarker.status !== 'resuelto' && existingMarker.status !== 'rechazado') {
      existingMarker.status = 'rechazado';
    }
    await existingMarker.save();
    await existingMarker.populate('tenant', JURISDICTION_FIELDS);

    try {
      if (esAdminDelCaso && markerOwner !== requester && markerOwner !== 'anonimo') {
        await crearNotificacion({
          userId: markerOwner,
          markerId: existingMarker._id,
          caseId: existingMarker.caseId,
          tipo: 'estado',
          mensaje: `Tu caso #${existingMarker.caseId} fue dado de baja y ya no aparece en el mapa.`,
        });
      }
    } catch (errorNotif) {
      console.error('No se pudo notificar la baja lógica:', errorNotif.message);
    }

    res.json({
      message: 'Caso dado de baja (queda en el registro)',
      marker: sanitizeMarkerResponse(existingMarker, adminScope, requester),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Contadores livianos para el dashboard (sin traer los documentos)
// Dashboard de estadísticas (casos + uso) · período 7 / 30 / 90 días
router.get('/admin/dashboard', requireStaff, async (req, res) => {
  try {
    const geo = buildManagedMarkersFilter(req.adminScope);
    const matchBase = req.adminScope.isSuperAdmin ? {} : geo;
    const tenantId = String(req.query.tenantId || '').trim();
    let filtro = matchBase;
    if (tenantId && req.adminScope.isSuperAdmin) {
      filtro = { tenant: tenantId };
    } else if (tenantId && !req.adminScope.isSuperAdmin) {
      const ids = (req.adminScope.tenantIds || []).map(String);
      if (!ids.includes(tenantId)) {
        return res.status(403).json({ message: 'No administrás esa jurisdicción' });
      }
      filtro = { tenant: tenantId };
    }
    const data = await buildDashboardStats(Marker, filtro, {
      dias: req.query.dias,
      fechaDesde: req.query.fechaDesde,
      fechaHasta: req.query.fechaHasta,
    });
    res.json(data);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

/** Super admin: dónde están los pendientes (sin listar todos los casos juntos). */
const contarPorMunicipio = async (match) => {
  const rows = await Marker.aggregate([
    { $match: match },
    { $group: { _id: '$tenant', n: { $sum: 1 } } },
    { $match: { _id: { $ne: null } } },
    {
      $lookup: {
        from: 'tenants',
        localField: '_id',
        foreignField: '_id',
        as: 'tenantDoc',
      },
    },
    { $unwind: { path: '$tenantDoc', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 0,
        tenantId: { $toString: '$_id' },
        name: { $ifNull: ['$tenantDoc.name', 'Sin nombre'] },
        n: 1,
      },
    },
    { $sort: { n: -1, name: 1 } },
  ]);
  return rows;
};

router.get('/admin/stats', requireStaff, async (req, res) => {
  try {
    const geo = buildManagedMarkersFilter(req.adminScope);
    const esOperario = isScopeOperario(req.adminScope);
    const esSuper = !!req.adminScope.isSuperAdmin;
    const conGeo = (extra) => (
      esSuper ? extra : { $and: [geo, extra] }
    );
    // Activos en mapa (alineado a listas Reportes / Cosas): sin por aprobar / cierre / rechazados
    // y sin derivados (avisadoAt) — esos van solo a la sección Derivados
    const publicados = {
      eliminadoAt: null,
      status: { $nin: ['pendiente_aprobacion', 'rechazado', 'pendiente_cierre'] },
      $or: [
        { avisadoAt: null },
        { avisadoAt: { $exists: false } },
      ],
    };
    // Reportes = resto municipal (familias / abandonados…). Reparaciones → sección propia.
    const filtroColaReportes = {
      ...publicados,
      category: { $nin: ['cosas_perdidas', 'reparaciones'] },
      $nor: [{
        category: 'perros_gatos',
        animalTipo: { $in: ['adopcion', 'perdido'] },
      }],
    };
    const filtroColaReparaciones = {
      ...publicados,
      category: 'reparaciones',
    };
    // Cuadrilla: contadores solo de reparaciones
    const soloReparaciones = esOperario ? { category: 'reparaciones' } : {};
    const urgentesFiltro = conGeo({
      eliminadoAt: null,
      category: 'reparaciones',
      status: { $in: ['pendiente', 'en_proceso'] },
      'confirmations.0': { $exists: true },
      $or: [
        { avisadoAt: null },
        { avisadoAt: { $exists: false } },
      ],
    });
    const resolucionFiltro = conGeo({
      eliminadoAt: null,
      resolvedBy: { $nin: [null, ''] },
      status: { $ne: 'resuelto' },
      $or: [
        { avisadoAt: null },
        { avisadoAt: { $exists: false } },
      ],
    });
    const respuestasFiltro = conGeo({
      eliminadoAt: null,
      respuestaDatosAt: { $ne: null },
      status: { $nin: ['resuelto', 'rechazado'] },
      $or: [
        { avisadoAt: null },
        { avisadoAt: { $exists: false } },
      ],
    });
    const [
      total,
      reportes,
      reparaciones,
      perdidas,
      porAprobar,
      pendientes,
      enProceso,
      registro,
      nuevosReportes,
      nuevosReparaciones,
      nuevasPerdidas,
      urgentes,
      resueltosVecino,
      respuestasDatos,
      cierresPendientes,
      derivados,
      nuevosDerivados,
    ] = await Promise.all([
      Marker.countDocuments(conGeo({ ...publicados })),
      Marker.countDocuments(conGeo(filtroColaReportes)),
      Marker.countDocuments(conGeo(filtroColaReparaciones)),
      Marker.countDocuments(conGeo({ ...publicados, category: 'cosas_perdidas' })),
      Marker.countDocuments(conGeo({ eliminadoAt: null, status: 'pendiente_aprobacion' })),
      Marker.countDocuments(conGeo({ eliminadoAt: null, status: 'pendiente', ...soloReparaciones })),
      Marker.countDocuments(conGeo({ eliminadoAt: null, status: 'en_proceso', ...soloReparaciones })),
      Marker.countDocuments(conGeo({ eliminadoAt: { $ne: null } })),
      Marker.countDocuments(conGeo({
        ...filtroColaReportes,
        nuevoParaAdmin: true,
      })),
      Marker.countDocuments(conGeo({
        ...filtroColaReparaciones,
        nuevoParaAdmin: true,
      })),
      Marker.countDocuments(conGeo({
        ...publicados,
        nuevoParaAdmin: true,
        category: 'cosas_perdidas',
      })),
      Marker.countDocuments(urgentesFiltro),
      Marker.countDocuments(resolucionFiltro),
      Marker.countDocuments(respuestasFiltro),
      Marker.countDocuments(conGeo({ eliminadoAt: null, status: 'pendiente_cierre', ...soloReparaciones })),
      Marker.countDocuments(conGeo({
        eliminadoAt: null,
        avisadoAt: { $ne: null },
        status: { $nin: ['resuelto', 'rechazado', 'pendiente_aprobacion'] },
      })),
      // Badge Derivados: solo no vistos (flag explícito)
      Marker.countDocuments(conGeo({
        eliminadoAt: null,
        avisadoAt: { $ne: null },
        status: { $nin: ['resuelto', 'rechazado', 'pendiente_aprobacion'] },
        nuevoDerivadoParaAdmin: true,
      })),
    ]);

    // Desglose por municipio (solo super): el badge indica dónde saltar, sin listar todo
    let porMunicipio = null;
    if (esSuper) {
      const [
        pmNuevosReportes,
        pmNuevosReparaciones,
        pmNuevasPerdidas,
        pmNuevosDerivados,
        pmPorAprobar,
        pmUrgentes,
        pmResueltosVecino,
        pmRespuestasDatos,
        pmCierres,
      ] = await Promise.all([
        contarPorMunicipio(conGeo({ ...filtroColaReportes, nuevoParaAdmin: true })),
        contarPorMunicipio(conGeo({ ...filtroColaReparaciones, nuevoParaAdmin: true })),
        contarPorMunicipio(conGeo({
          ...publicados,
          nuevoParaAdmin: true,
          category: 'cosas_perdidas',
        })),
        contarPorMunicipio(conGeo({
          eliminadoAt: null,
          avisadoAt: { $ne: null },
          status: { $nin: ['resuelto', 'rechazado', 'pendiente_aprobacion'] },
          nuevoDerivadoParaAdmin: true,
        })),
        contarPorMunicipio(conGeo({ eliminadoAt: null, status: 'pendiente_aprobacion' })),
        contarPorMunicipio(urgentesFiltro),
        contarPorMunicipio(resolucionFiltro),
        contarPorMunicipio(respuestasFiltro),
        contarPorMunicipio(conGeo({
          eliminadoAt: null,
          status: 'pendiente_cierre',
          ...soloReparaciones,
        })),
      ]);
      porMunicipio = {
        nuevosReportes: pmNuevosReportes,
        nuevosReparaciones: pmNuevosReparaciones,
        nuevasPerdidas: pmNuevasPerdidas,
        nuevosDerivados: pmNuevosDerivados,
        porAprobar: pmPorAprobar,
        urgentes: pmUrgentes,
        resueltosVecino: pmResueltosVecino,
        respuestasDatos: pmRespuestasDatos,
        cierresPendientes: pmCierres,
      };
    }

    res.json({
      total,
      reportes,
      reparaciones,
      perdidas,
      porAprobar,
      pendientes,
      enProceso,
      registro,
      nuevosReportes,
      nuevosReparaciones,
      nuevasPerdidas,
      urgentes,
      resueltosVecino,
      respuestasDatos,
      cierresPendientes,
      derivados,
      nuevosDerivados,
      porMunicipio,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Marca como vistos los casos nuevos del admin (limpia el badge al abrir la sección)
router.patch('/admin/marcar-vistos', requireStaff, async (req, res) => {
  try {
    const seccion = String(req.body?.seccion || req.query?.seccion || '').trim();
    const geo = buildManagedMarkersFilter(req.adminScope);
    if (seccion === 'derivados') {
      // Todos los derivados activos pasan a “vistos” (limpia badge, incl. legacy sin flag)
      const baseDerivados = {
        eliminadoAt: null,
        avisadoAt: { $ne: null },
        status: { $nin: ['resuelto', 'rechazado', 'pendiente_aprobacion'] },
      };
      const filtroDerivados = req.adminScope.isSuperAdmin
        ? baseDerivados
        : { $and: [geo, baseDerivados] };
      const resultDerivados = await Marker.updateMany(
        filtroDerivados,
        { $set: { nuevoDerivadoParaAdmin: false } }
      );
      return res.json({
        message: 'Derivados marcados como vistos',
        modificados: resultDerivados.modifiedCount || 0,
      });
    }
    const base = {
      eliminadoAt: null,
      nuevoParaAdmin: true,
      status: { $nin: ['pendiente_aprobacion', 'rechazado'] },
    };
    if (seccion === 'cosas_perdidas') {
      base.category = 'cosas_perdidas';
    } else if (seccion === 'reparaciones') {
      base.category = 'reparaciones';
    } else if (seccion === 'reportes') {
      base.category = { $nin: ['cosas_perdidas', 'reparaciones'] };
      base.$nor = [{
        category: 'perros_gatos',
        animalTipo: { $in: ['adopcion', 'perdido'] },
      }];
    } else {
      return res.status(400).json({
        message: 'Indicá la sección: reportes, reparaciones, cosas_perdidas o derivados',
      });
    }
    const filtro = req.adminScope.isSuperAdmin ? base : { $and: [geo, base] };
    const result = await Marker.updateMany(filtro, { $set: { nuevoParaAdmin: false } });
    res.json({
      message: 'Casos marcados como vistos',
      modificados: result.modifiedCount || 0,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/admin', requireStaff, async (req, res) => {
  try {
    const { page, limit, skip } = parsePageLimit(req.query, LIMITE_ADMIN_DEFAULT);
    const soloEliminados = req.query.eliminados === '1' || req.query.eliminados === 'true'
      || req.query.soloEliminados === '1';
    const atencion = String(req.query.atencion || '').trim();
    const esOperario = isScopeOperario(req.adminScope);
    let statusQuery = (
      atencion === 'urgentes'
      || atencion === 'resolucion'
      || atencion === 'respuestas'
      || atencion === 'cierres'
      || atencion === 'derivados'
    )
      ? undefined
      : req.query.status;
    // Operario: por defecto solo cola operativa (no por aprobar)
    if (esOperario && !statusQuery && !atencion) {
      statusQuery = undefined; // se acota abajo con $in
    }
    const filtro = buildListQuery({
      requester: req.requester,
      adminScope: req.adminScope,
      category: req.query.category,
      excludeCategory: req.query.excludeCategory,
      animalTipo: req.query.animalTipo,
      excludeAnimalTipos: req.query.excludeAnimalTipos,
      perdidaTipo: req.query.perdidaTipo,
      status: statusQuery,
      mine: req.query.mine,
      q: req.query.q,
      atencion,
      tipoCierre: req.query.tipoCierre,
      periodoDias: req.query.periodoDias,
      fechaDesde: req.query.fechaDesde,
      fechaHasta: req.query.fechaHasta,
      sinTenant: req.query.sinTenant === '1' || req.query.sinTenant === 'true',
      tenantId: req.query.tenantId || null,
      soloCaseId: req.query.soloCaseId === '1' || req.query.soloCaseId === 'true',
      soloAdminScope: true,
      soloEliminados,
      excludeAvisados: req.query.excludeAvisados === '1' || req.query.excludeAvisados === 'true',
    });

    // Operario · solo reparaciones. Registro: su trabajo ya cerrado/anulado por el admin
    let filtroFinal = filtro;
    if (esOperario) {
      const yo = normalizeUserId(req.requester);
      const soloMios = req.query.mios === '1' || req.query.mios === 'true';
      if (soloEliminados) {
        filtroFinal = {
          $and: [
            filtro,
            { category: 'reparaciones' },
            { status: { $in: ['resuelto', 'rechazado'] } },
            {
              $or: [
                { atendidoPor: yo },
                { cierrePropuestoPor: yo },
              ],
            },
          ],
        };
      } else {
        const andOps = [
          filtro,
          { category: 'reparaciones' },
        ];
        if (!statusQuery && atencion !== 'cierres') {
          andOps.push({ status: { $in: ['pendiente', 'en_proceso', 'pendiente_cierre'] } });
        }
        if (soloMios) {
          andOps.push({ atendidoPor: yo });
        }
        filtroFinal = { $and: andOps };
      }
    }

    // Cola FIFO: pendientes | omitidos | cuadrilla (diferidos = omitidos+cuadrilla, compat)
    const cola = String(req.query.cola || '').trim();
    if (cola === 'pendientes') {
      filtroFinal = {
        $and: [
          filtroFinal,
          { $or: [{ colaAdminAt: null }, { colaAdminAt: { $exists: false } }] },
        ],
      };
    } else if (cola === 'omitidos') {
      // Omitidos a retomar (legacy sin motivoCola: con colaAdminAt y sin aviso a cuadrilla)
      filtroFinal = {
        $and: [
          filtroFinal,
          { colaAdminAt: { $ne: null } },
          {
            $or: [
              { motivoCola: 'omitido' },
              {
                $and: [
                  { $or: [{ motivoCola: null }, { motivoCola: { $exists: false } }] },
                  { $or: [{ notaCuadrillaAt: null }, { notaCuadrillaAt: { $exists: false } }] },
                ],
              },
            ],
          },
        ],
      };
    } else if (cola === 'cuadrilla') {
      // Legacy: casos que quedaron en “esperando cuadrilla” (el aviso ya no mueve la cola)
      filtroFinal = {
        $and: [
          filtroFinal,
          { colaAdminAt: { $ne: null } },
          {
            $or: [
              { motivoCola: 'cuadrilla' },
              {
                $and: [
                  { $or: [{ motivoCola: null }, { motivoCola: { $exists: false } }] },
                  { notaCuadrillaAt: { $ne: null } },
                ],
              },
            ],
          },
        ],
      };
    } else if (cola === 'diferidos') {
      filtroFinal = { $and: [filtroFinal, { colaAdminAt: { $ne: null } }] };
    }

    // Cola FIFO (más antiguos primero). “Nuevo” solo sombrea; no salta al frente.
    // Tras omitir, colaAdminAt empuja el caso. Registro: cierres más recientes primero.
    let orden;
    if (soloEliminados) {
      orden = { eliminadoAt: -1, createdAt: -1 };
    } else if (statusQuery === 'pendiente_aprobacion') {
      orden = { createdAt: 1 };
    } else if (atencion === 'derivados') {
      orden = { createdAt: 1 };
    } else if (cola === 'omitidos' || cola === 'cuadrilla' || cola === 'diferidos') {
      orden = { colaAdminAt: 1, createdAt: 1 };
    } else {
      orden = { colaAdminAt: 1, createdAt: 1 };
    }

    const [total, markers] = await Promise.all([
      Marker.countDocuments(filtroFinal),
      Marker.find(filtroFinal)
        .select('-image -resolutionImage -respuestaDatosImage -confirmations.image')
        .populate('tenant', JURISDICTION_FIELDS)
        .sort(orden)
        .skip(skip)
        .limit(limit),
    ]);

    const items = await enriquecerConReportante(
      markers
        .filter((marker) => canManageMarker(req.adminScope, marker))
        .map((marker) => sanitizeMarkerResponse(marker, req.adminScope, req.requester)),
      req.adminScope
    );

    res.json({
      items,
      total,
      page,
      limit,
      hasMore: skip + limit < total,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

/** Foto del DNI del reportante: solo admin municipal/super (no operario). */
router.get('/admin/:id/reportante/dni/:lado', async (req, res) => {
  try {
    const lado = String(req.params.lado || '').toLowerCase();
    if (lado !== 'frente' && lado !== 'dorso') {
      return res.status(400).json({ message: 'Lado inválido (frente o dorso)' });
    }
    // <img> no manda x-user-id: aceptamos ?userId= como en el chat
    const viewer = normalizeUserId(req.query.userId || req.requester);
    const scope = viewer && viewer === req.requester
      ? req.adminScope
      : await getAdminScope(viewer);
    if (!isScopeAdmin(scope)) {
      return res.status(403).json({ message: 'Acceso de administrador requerido' });
    }
    const marker = await Marker.findById(req.params.id).select('createdBy tenant province');
    if (!marker) {
      return res.status(404).json({ message: 'Caso no encontrado' });
    }
    if (!canManageMarker(scope, marker)) {
      return res.status(403).json({ message: 'No tenés permiso para ver este caso' });
    }
    const email = normalizeUserId(marker.createdBy);
    if (!email || email === 'anonimo') {
      return res.status(404).json({ message: 'Este caso no tiene reportante registrado' });
    }
    const campo = lado === 'frente' ? 'dniFotoFrente' : 'dniFotoDorso';
    const usuario = await Usuario.findOne({ email }).select(campo);
    const foto = usuario?.[campo];
    if (!foto?.data || !foto.contentType) {
      return res.status(404).json({ message: 'No hay foto de DNI cargada' });
    }
    res.set('Content-Type', foto.contentType);
    res.set('Cache-Control', 'private, max-age=300');
    res.send(foto.data);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.patch('/admin/:id/status', requireStaff, async (req, res) => {
  const { status } = req.body;
  if (!status) {
    return res.status(400).json({ message: 'Estado requerido' });
  }
  const normalizedStatus = normalizeStatus(status);
  const descripcionCierre = String(req.body.descripcion || req.body.motivo || '').trim();
  const esOperario = isScopeOperario(req.adminScope);
  try {
    const marker = await Marker.findById(req.params.id);
    if (!marker) {
      return res.status(404).json({ message: 'Marker not found' });
    }
    if (rejectIfEliminado(marker, res)) return;
    if (!canManageMarker(req.adminScope, marker)) {
      return res.status(403).json({ message: 'Este caso no pertenece a tu jurisdicción' });
    }

    // Operario: solo reparaciones; pendiente → en_proceso (tomar el caso)
    if (esOperario) {
      if (marker.category !== 'reparaciones') {
        return res.status(403).json({
          message: 'La cuadrilla solo atiende casos de reparación urbana',
        });
      }
      if (normalizedStatus !== 'en_proceso') {
        return res.status(403).json({
          message: 'La cuadrilla solo puede poner el caso en proceso. Para cerrar usá “Proponer cierre”.',
        });
      }
      if (!['pendiente', 'en_proceso'].includes(marker.status)) {
        return res.status(400).json({ message: 'Solo podés tomar casos publicados o ya en proceso' });
      }
      const estadoAnterior = marker.status;
      marker.status = 'en_proceso';
      marker.resolvedAt = null;
      if (!marker.atendidoPor) {
        marker.atendidoPor = req.requester;
        marker.atendidoAt = new Date();
      }
      await marker.save();
      await marker.populate('tenant', JURISDICTION_FIELDS);
      await avisarCambioEstado(marker, estadoAnterior, 'en_proceso').catch(() => {});
      return res.json(sanitizeMarkerResponse(marker, req.adminScope, req.requester));
    }

    // Admin: cierre directo → registro
    if (normalizedStatus === 'resuelto') {
      if (descripcionCierre.length < 5) {
        return res.status(400).json({
          message: 'Escribí una breve descripción del cierre para notificar al vecino',
        });
      }
      marker.status = 'resuelto';
      marker.resolvedAt = new Date();
      marker.resolutionDescription = descripcionCierre;
      marker.eliminadoAt = new Date();
      marker.eliminadoPor = req.requester;
      marker.motivoEliminacion = `Cierre del administrador: ${descripcionCierre}`;
      marker.nuevoParaAdmin = false;
      marker.cierrePropuestoPor = null;
      marker.cierrePropuestoAt = null;
      await marker.save();
      await marker.populate('tenant', JURISDICTION_FIELDS);
      const caso = marker.caseId ? `#${marker.caseId}` : '';
      await avisarPartesCaso(
        marker,
        `Tu caso ${caso} fue resuelto. ${descripcionCierre}`
      ).catch(() => {});
      return res.json(sanitizeMarkerResponse(marker, req.adminScope, req.requester));
    }

    if (normalizedStatus === 'pendiente_cierre') {
      return res.status(400).json({
        message: 'Usá la acción de proponer o confirmar cierre',
      });
    }

    const estadoAnterior = marker.status;
    const updatedMarker = await Marker.findByIdAndUpdate(
      marker._id,
      {
        status: normalizedStatus,
        resolvedAt: computeResolvedAt(normalizedStatus),
      },
      { new: true }
    ).populate('tenant', JURISDICTION_FIELDS);
    try {
      await avisarCambioEstado(updatedMarker, estadoAnterior, normalizedStatus);
    } catch (errorNotif) {
      console.error('No se pudo crear la notificación de estado:', errorNotif.message);
    }
    res.json(sanitizeMarkerResponse(updatedMarker, req.adminScope, req.requester));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Cuadrilla propone cierre → admin debe confirmar
router.patch('/admin/:id/proponer-cierre', requireStaff, upload.single('image'), async (req, res) => {
  try {
    const marker = await Marker.findById(req.params.id);
    if (!marker) {
      return res.status(404).json({ message: 'Marker not found' });
    }
    if (rejectIfEliminado(marker, res)) return;
    if (!canManageMarker(req.adminScope, marker)) {
      return res.status(403).json({ message: 'Este caso no pertenece a tu jurisdicción' });
    }
    if (marker.category !== 'reparaciones') {
      return res.status(403).json({
        message: 'La cuadrilla solo propone cierre en reparaciones urbanas',
      });
    }
    if (!['pendiente', 'en_proceso'].includes(marker.status)) {
      return res.status(400).json({ message: 'Solo se puede proponer cierre de casos abiertos' });
    }
    const descripcion = String(req.body.descripcion || req.body.description || '').trim();
    if (descripcion.length < 5) {
      return res.status(400).json({ message: 'Contá qué se hizo en el lugar (mínimo unas palabras)' });
    }
    if (req.file && !String(req.file.mimetype || '').startsWith('image/')) {
      return res.status(400).json({ message: 'El archivo tiene que ser una imagen' });
    }

    const estadoAnterior = marker.status;
    marker.status = 'pendiente_cierre';
    marker.resolutionDescription = descripcion;
    marker.cierrePropuestoPor = req.requester;
    marker.cierrePropuestoAt = new Date();
    if (!marker.atendidoPor) {
      marker.atendidoPor = req.requester;
      marker.atendidoAt = new Date();
    }
    marker.nuevoParaAdmin = true;
    if (req.file) {
      marker.resolutionImage = {
        data: req.file.buffer,
        contentType: req.file.mimetype || 'application/octet-stream',
      };
      marker.resolutionImageUrl = `/api/markers/${marker._id}/resolution-image`;
    }
    await marker.save();
    await marker.populate('tenant', JURISDICTION_FIELDS);

    await avisarCambioEstado(marker, estadoAnterior, 'pendiente_cierre').catch(() => {});
    const caso = marker.caseId ? `#${marker.caseId}` : '';
    const admins = await listarAdminsDelCaso(marker, { soloJurisdiccion: true });
    for (const admin of admins) {
      if (admin === req.requester) continue;
      await crearNotificacion({
        userId: admin,
        markerId: marker._id,
        caseId: marker.caseId,
        tenantId: marker.tenant,
        tipo: 'estado',
        mensaje: `La cuadrilla propuso cierre del caso ${caso}. Revisá y confirmá.`,
      }).catch(() => {});
    }

    res.json(sanitizeMarkerResponse(marker, req.adminScope, req.requester));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Admin confirma el cierre propuesto por la cuadrilla → Registro
router.patch('/admin/:id/confirmar-cierre', requireJurisdictionAdmin, async (req, res) => {
  try {
    const marker = await Marker.findById(req.params.id);
    if (!marker) {
      return res.status(404).json({ message: 'Marker not found' });
    }
    if (rejectIfEliminado(marker, res)) return;
    if (!canManageMarker(req.adminScope, marker)) {
      return res.status(403).json({ message: 'Este caso no pertenece a tu jurisdicción' });
    }
    if (marker.status !== 'pendiente_cierre') {
      return res.status(400).json({ message: 'Este caso no está pendiente de cierre' });
    }
    const quienPropuso = marker.cierrePropuestoPor;
    const nota = String(req.body.descripcion || req.body.motivo || marker.resolutionDescription || '').trim();
    marker.status = 'resuelto';
    marker.resolvedAt = new Date();
    marker.eliminadoAt = new Date();
    marker.eliminadoPor = req.requester;
    marker.motivoEliminacion = `Cierre confirmado: ${nota || 'reparación verificada'}`;
    marker.nuevoParaAdmin = false;
    await marker.save();
    await marker.populate('tenant', JURISDICTION_FIELDS);
    const caso = marker.caseId ? `#${marker.caseId}` : '';
    await avisarPartesCaso(
      marker,
      `Tu caso ${caso} fue resuelto.${nota ? ` ${nota}` : ''}`
    ).catch(() => {});
    if (quienPropuso) {
      await crearNotificacion({
        userId: quienPropuso,
        markerId: marker._id,
        caseId: marker.caseId,
        tenantId: marker.tenant,
        tipo: 'cuadrilla',
        mensaje: `El admin confirmó tu cierre del caso ${caso}. Ya está en Registro.`,
      }).catch(() => {});
    } else {
      await avisarOperariosDelCaso(
        marker,
        `El admin confirmó el cierre del caso ${caso}. Ya está en Registro.`,
        'cuadrilla',
        req.requester
      ).catch(() => {});
    }
    res.json(sanitizeMarkerResponse(marker, req.adminScope, req.requester));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Admin reopen: vuelve a en_proceso
router.patch('/admin/:id/reabrir-cierre', requireJurisdictionAdmin, async (req, res) => {
  try {
    const marker = await Marker.findById(req.params.id);
    if (!marker) {
      return res.status(404).json({ message: 'Marker not found' });
    }
    if (rejectIfEliminado(marker, res)) return;
    if (!canManageMarker(req.adminScope, marker)) {
      return res.status(403).json({ message: 'Este caso no pertenece a tu jurisdicción' });
    }
    if (marker.status !== 'pendiente_cierre') {
      return res.status(400).json({ message: 'Este caso no está pendiente de cierre' });
    }
    const quienPropuso = marker.cierrePropuestoPor;
    const notaAdmin = String(req.body.mensaje || req.body.motivo || '').trim();
    const estadoAnterior = marker.status;
    marker.status = 'en_proceso';
    marker.cierrePropuestoPor = null;
    marker.cierrePropuestoAt = null;
    marker.nuevoParaAdmin = false;
    if (notaAdmin.length >= 5) {
      marker.notaCuadrilla = notaAdmin.slice(0, 500);
      marker.notaCuadrillaAt = new Date();
      marker.notaCuadrillaPor = req.requester;
      marker.respuestaCuadrilla = '';
      marker.respuestaCuadrillaAt = null;
      marker.respuestaCuadrillaPor = null;
    }
    await marker.save();
    await marker.populate('tenant', JURISDICTION_FIELDS);
    await avisarCambioEstado(marker, estadoAnterior, 'en_proceso').catch(() => {});
    const caso = marker.caseId ? `#${marker.caseId}` : '';
    const msg = notaAdmin.length >= 5
      ? `El admin reabrió el caso ${caso}: ${notaAdmin}`
      : `El admin reabrió el caso ${caso}. Revisalo de nuevo.`;
    if (quienPropuso) {
      await crearNotificacion({
        userId: quienPropuso,
        markerId: marker._id,
        caseId: marker.caseId,
        tenantId: marker.tenant,
        tipo: 'cuadrilla',
        mensaje: msg,
      }).catch(() => {});
    } else {
      await avisarOperariosDelCaso(marker, msg, 'cuadrilla', req.requester).catch(() => {});
    }
    res.json(sanitizeMarkerResponse(marker, req.adminScope, req.requester));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Admin: reabre un caso del Registro → vuelve a la cola activa (mapa / bandejas)
router.patch('/admin/:id/reabrir-registro', requireJurisdictionAdmin, async (req, res) => {
  try {
    const marker = await Marker.findById(req.params.id);
    if (!marker) {
      return res.status(404).json({ message: 'Marker not found' });
    }
    if (!canManageMarker(req.adminScope, marker)) {
      return res.status(403).json({ message: 'Este caso no pertenece a tu jurisdicción' });
    }
    const enRegistro = Boolean(marker.eliminadoAt)
      || marker.status === 'resuelto'
      || marker.status === 'rechazado';
    if (!enRegistro) {
      return res.status(400).json({ message: 'Este caso no está en el Registro' });
    }
    const motivo = String(req.body.mensaje || req.body.motivo || '').trim().slice(0, 500);
    if (motivo.length < 5) {
      return res.status(400).json({ message: 'Escribí el motivo de la reapertura' });
    }
    const estadoAnterior = marker.status;
    // Si nunca se había aprobado (no aprobar), vuelve a Por aprobar
    const nuevoStatus = (estadoAnterior === 'rechazado' && !marker.aprobadoAt)
      ? 'pendiente_aprobacion'
      : 'pendiente';

    marker.status = nuevoStatus;
    marker.eliminadoAt = null;
    marker.eliminadoPor = null;
    marker.motivoEliminacion = '';
    marker.resolvedAt = null;
    // Sale de Derivados / oficina: vuelve a la bandeja operativa
    marker.avisadoAt = null;
    marker.nuevoDerivadoParaAdmin = false;
    marker.colaAdminAt = null;
    marker.motivoCola = null;
    marker.nuevoParaAdmin = true;
    marker.cierrePropuestoPor = null;
    marker.cierrePropuestoAt = null;
    await marker.save();
    await marker.populate('tenant', JURISDICTION_FIELDS);

    await avisarCambioEstado(marker, estadoAnterior, nuevoStatus).catch(() => {});
    const caso = marker.caseId ? `#${marker.caseId}` : '';
    if (marker.createdBy) {
      await crearNotificacion({
        userId: marker.createdBy,
        markerId: marker._id,
        caseId: marker.caseId,
        tenantId: marker.tenant,
        tipo: 'estado',
        mensaje: `Tu caso ${caso} fue reabierto por el municipio. ${motivo}`,
      }).catch(() => {});
    }

    res.json(sanitizeMarkerResponse(marker, req.adminScope, req.requester));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Admin omite el caso por ahora → bandeja Omitidos (retomar después)
router.patch('/admin/:id/omitir-cola', requireJurisdictionAdmin, async (req, res) => {
  try {
    const marker = await Marker.findById(req.params.id);
    if (!marker) {
      return res.status(404).json({ message: 'Marker not found' });
    }
    if (rejectIfEliminado(marker, res)) return;
    if (!canManageMarker(req.adminScope, marker)) {
      return res.status(403).json({ message: 'Este caso no pertenece a tu jurisdicción' });
    }
    if (['resuelto', 'rechazado', 'pendiente_aprobacion'].includes(marker.status)) {
      return res.status(400).json({ message: 'Este caso no está en la cola activa' });
    }
    marker.colaAdminAt = new Date();
    marker.motivoCola = 'omitido';
    marker.nuevoParaAdmin = false;
    await marker.save();
    await marker.populate('tenant', JURISDICTION_FIELDS);
    res.json(sanitizeMarkerResponse(marker, req.adminScope, req.requester));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Admin retoma un caso omitido / diferido → vuelve a Por atender
router.patch('/admin/:id/retomar-cola', requireJurisdictionAdmin, async (req, res) => {
  try {
    const marker = await Marker.findById(req.params.id);
    if (!marker) {
      return res.status(404).json({ message: 'Marker not found' });
    }
    if (rejectIfEliminado(marker, res)) return;
    if (!canManageMarker(req.adminScope, marker)) {
      return res.status(403).json({ message: 'Este caso no pertenece a tu jurisdicción' });
    }
    if (['resuelto', 'rechazado', 'pendiente_aprobacion'].includes(marker.status)) {
      return res.status(400).json({ message: 'Este caso no está en la cola activa' });
    }
    if (!marker.colaAdminAt) {
      return res.status(400).json({ message: 'Este caso no está omitido' });
    }
    marker.colaAdminAt = null;
    marker.motivoCola = null;
    await marker.save();
    await marker.populate('tenant', JURISDICTION_FIELDS);
    res.json(sanitizeMarkerResponse(marker, req.adminScope, req.requester));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Admin → cuadrilla: instrucción o pedido de info (campanita al operario)
router.patch('/admin/:id/avisar-cuadrilla', requireJurisdictionAdmin, async (req, res) => {
  try {
    const marker = await Marker.findById(req.params.id);
    if (!marker) {
      return res.status(404).json({ message: 'Marker not found' });
    }
    if (rejectIfEliminado(marker, res)) return;
    if (!canManageMarker(req.adminScope, marker)) {
      return res.status(403).json({ message: 'Este caso no pertenece a tu jurisdicción' });
    }
    if (marker.category !== 'reparaciones') {
      return res.status(400).json({
        message: 'La cuadrilla solo recibe avisos de reparaciones urbanas',
      });
    }
    if (['resuelto', 'rechazado', 'pendiente_aprobacion'].includes(marker.status)) {
      return res.status(400).json({ message: 'Este caso no admite aviso a la cuadrilla' });
    }
    const mensaje = String(req.body.mensaje || '').trim().slice(0, 500);
    if (mensaje.length < 5) {
      return res.status(400).json({ message: 'Escribí el mensaje para la cuadrilla' });
    }
    marker.notaCuadrilla = mensaje;
    marker.notaCuadrillaAt = new Date();
    marker.notaCuadrillaPor = req.requester;
    // Solo notifica: no saca el caso de la cola activa
    // Nuevo pedido: limpia la respuesta anterior
    marker.respuestaCuadrilla = '';
    marker.respuestaCuadrillaAt = null;
    marker.respuestaCuadrillaPor = null;
    await marker.save();
    await marker.populate('tenant', JURISDICTION_FIELDS);
    const caso = marker.caseId ? `#${marker.caseId}` : '';
    const enviadas = await avisarOperariosDelCaso(
      marker,
      `Admin · caso ${caso}: ${mensaje}`,
      'cuadrilla',
      req.requester
    );
    if (!enviadas.length) {
      return res.status(400).json({
        message: 'No hay operarios asignados en este municipio. Sumalos en Cuadrilla.',
      });
    }
    res.json(sanitizeMarkerResponse(marker, req.adminScope, req.requester));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Cuadrilla responde al aviso del admin
router.patch('/admin/:id/responder-cuadrilla', requireStaff, async (req, res) => {
  try {
    const marker = await Marker.findById(req.params.id);
    if (!marker) {
      return res.status(404).json({ message: 'Marker not found' });
    }
    if (rejectIfEliminado(marker, res)) return;
    if (!canManageMarker(req.adminScope, marker)) {
      return res.status(403).json({ message: 'Este caso no pertenece a tu jurisdicción' });
    }
    if (!isScopeOperario(req.adminScope) && !isScopeAdmin(req.adminScope)) {
      return res.status(403).json({ message: 'Solo la cuadrilla o el admin pueden registrar esta respuesta' });
    }
    if (marker.category !== 'reparaciones') {
      return res.status(400).json({ message: 'Solo aplica a reparaciones urbanas' });
    }
    if (!marker.notaCuadrillaAt || !String(marker.notaCuadrilla || '').trim()) {
      return res.status(400).json({ message: 'No hay un aviso del admin para responder' });
    }
    const mensaje = String(req.body.mensaje || '').trim().slice(0, 1000);
    if (mensaje.length < 5) {
      return res.status(400).json({ message: 'Escribí la respuesta (mínimo unas palabras)' });
    }
    marker.respuestaCuadrilla = mensaje;
    marker.respuestaCuadrillaAt = new Date();
    marker.respuestaCuadrillaPor = req.requester;
    if (isScopeOperario(req.adminScope) && !marker.atendidoPor) {
      marker.atendidoPor = req.requester;
      marker.atendidoAt = new Date();
    }
    marker.nuevoParaAdmin = true;
    await marker.save();
    await marker.populate('tenant', JURISDICTION_FIELDS);
    const caso = marker.caseId ? `#${marker.caseId}` : '';
    const tenantId = marker.tenant && marker.tenant._id ? marker.tenant._id : marker.tenant;
    const admins = await listarAdminsDelCaso(marker, { soloJurisdiccion: true });
    if (marker.notaCuadrillaPor) admins.push(normalizeUserId(marker.notaCuadrillaPor));
    const vistos = new Set();
    for (const admin of admins) {
      const uid = normalizeUserId(admin);
      if (!uid || uid === 'anonimo' || uid === req.requester || vistos.has(uid)) continue;
      vistos.add(uid);
      await crearNotificacion({
        userId: uid,
        markerId: marker._id,
        caseId: marker.caseId,
        tenantId,
        tipo: 'estado',
        mensaje: `Cuadrilla respondió al aviso del caso ${caso}.`,
      }).catch(() => {});
    }
    res.json(sanitizeMarkerResponse(marker, req.adminScope, req.requester));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Alta / baja de operarios (admin municipal o super)
router.get('/admin/operarios', requireJurisdictionAdmin, async (req, res) => {
  try {
    const filtro = req.adminScope.isSuperAdmin
      ? { type: { $in: ['municipality', 'commune'] }, status: 'active' }
      : { _id: { $in: req.adminScope.tenantIds }, status: 'active' };
    const tenants = await Tenant.find(filtro).select('name type operarios admins').sort({ name: 1 });
    const items = [];
    tenants.forEach((t) => {
      (t.operarios || []).forEach((email) => {
        items.push({
          email,
          tenantId: String(t._id),
          tenantName: t.name,
          tenantType: t.type,
        });
      });
    });
    items.sort((a, b) => a.email.localeCompare(b.email) || a.tenantName.localeCompare(b.tenantName));
    res.json({
      items,
      tenants: tenants.map((t) => ({
        id: String(t._id),
        name: t.name,
        type: t.type,
        operarios: t.operarios || [],
      })),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/admin/operarios', requireJurisdictionAdmin, async (req, res) => {
  try {
    const email = normalizeUserId(req.body.email || '');
    const tenantId = String(req.body.tenantId || '').trim();
    if (!email || !email.includes('@')) {
      return res.status(400).json({ message: 'Indicá un email válido' });
    }
    if (isAdminUser(email)) {
      return res.status(400).json({ message: 'Ese email es super administrador' });
    }
    const tenant = await Tenant.findById(tenantId);
    if (!tenant || !['municipality', 'commune'].includes(tenant.type)) {
      return res.status(404).json({ message: 'Jurisdicción no encontrada' });
    }
    if (!req.adminScope.isSuperAdmin && !req.adminScope.tenantIds.includes(String(tenant._id))) {
      return res.status(403).json({ message: 'No administrás esa jurisdicción' });
    }
    if ((tenant.admins || []).includes(email)) {
      return res.status(400).json({ message: 'Ese email ya es administrador municipal' });
    }
    const antes = (tenant.operarios || []).length;
    tenant.operarios = Array.from(new Set([...(tenant.operarios || []), email]));
    await tenant.save();
    res.json({
      message: tenant.operarios.length === antes ? 'Ya era operario' : 'Operario asignado',
      tenantId: String(tenant._id),
      operarios: tenant.operarios,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.delete('/admin/operarios', requireJurisdictionAdmin, async (req, res) => {
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
    if (!req.adminScope.isSuperAdmin && !req.adminScope.tenantIds.includes(String(tenant._id))) {
      return res.status(403).json({ message: 'No administrás esa jurisdicción' });
    }
    tenant.operarios = (tenant.operarios || []).filter((a) => a !== email);
    await tenant.save();
    res.json({ message: 'Operario quitado', operarios: tenant.operarios });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Ruta para aprobar un marcador (cambiar de pendiente_aprobacion a pendiente)
router.patch('/admin/:id/avisar', requireJurisdictionAdmin, async (req, res) => {
  try {
    const marker = await Marker.findById(req.params.id);
    if (!marker) {
      return res.status(404).json({ message: 'Marker not found' });
    }
    if (rejectIfEliminado(marker, res)) return;
    if (!canManageMarker(req.adminScope, marker)) {
      return res.status(403).json({ message: 'Este caso no pertenece a tu jurisdicción' });
    }
    const esFamilia = marker.category === 'familias' || marker.category === 'persona';
    const puedeAvisar = esFamilia
      || (marker.category === 'perros_gatos' && marker.animalTipo === 'abandonado');
    if (!puedeAvisar) {
      return res.status(400).json({ message: 'Este aviso es solo para familias o animales abandonados' });
    }
    if (marker.status === 'pendiente_aprobacion') {
      return res.status(400).json({
        message: 'Primero aprobá el aviso y después podés avisar a la oficina',
      });
    }
    if (['rechazado', 'resuelto'].includes(marker.status)) {
      return res.status(400).json({ message: 'Este caso ya está cerrado' });
    }
    const eraNuevoAviso = !marker.avisadoAt;
    if (!marker.avisadoAt) {
      marker.avisadoAt = new Date();
    }
    // Sale de la bandeja “nuevos” (Reportes / Cosas)
    marker.nuevoParaAdmin = false;
    // Familias: tras avisar a la oficina, sale de Reportes → Registro (no van al mapa)
    if (esFamilia && !marker.eliminadoAt) {
      marker.eliminadoAt = new Date();
      marker.eliminadoPor = req.requester;
      marker.motivoEliminacion = 'Oficina correspondiente avisada';
      marker.nuevoDerivadoParaAdmin = false;
    } else if (!esFamilia) {
      // Abandonados: siguen en el mapa → sección Animales (oficina avisada)
      marker.nuevoDerivadoParaAdmin = true;
      marker.colaAdminAt = null;
      marker.motivoCola = null;
    }
    await marker.save();
    if (eraNuevoAviso) {
      await avisarOficina(marker).catch(() => {});
    }
    await marker.populate('tenant', JURISDICTION_FIELDS);
    res.json(sanitizeMarkerResponse(marker, req.adminScope, req.requester));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

/** Abandonado con oficina avisada → vuelve a Reportes (deshace la derivación a Animales). */
router.patch('/admin/:id/volver-reportes', requireJurisdictionAdmin, async (req, res) => {
  try {
    const marker = await Marker.findById(req.params.id);
    if (!marker) {
      return res.status(404).json({ message: 'Marker not found' });
    }
    if (rejectIfEliminado(marker, res)) return;
    if (!canManageMarker(req.adminScope, marker)) {
      return res.status(403).json({ message: 'Este caso no pertenece a tu jurisdicción' });
    }
    const esAbandonadoAvisado = marker.category === 'perros_gatos'
      && marker.animalTipo === 'abandonado'
      && Boolean(marker.avisadoAt);
    if (!esAbandonadoAvisado) {
      return res.status(400).json({
        message: 'Solo aplica a animales abandonados que ya fueron avisados a la oficina.',
      });
    }
    if (['rechazado', 'resuelto', 'pendiente_aprobacion'].includes(marker.status)) {
      return res.status(400).json({ message: 'Este caso no se puede devolver a Reportes en este estado.' });
    }
    marker.avisadoAt = null;
    marker.nuevoDerivadoParaAdmin = false;
    marker.nuevoParaAdmin = true;
    marker.colaAdminAt = null;
    marker.motivoCola = null;
    await marker.save();
    await marker.populate('tenant', JURISDICTION_FIELDS);
    res.json(sanitizeMarkerResponse(marker, req.adminScope, req.requester));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.patch('/admin/:id/approve', requireJurisdictionAdmin, async (req, res) => {
  try {
    const marker = await Marker.findById(req.params.id);
    if (!marker) {
      return res.status(404).json({ message: 'Marker not found' });
    }
    if (rejectIfEliminado(marker, res)) return;
    if (!canManageMarker(req.adminScope, marker)) {
      return res.status(403).json({ message: 'Este caso no pertenece a tu jurisdicción' });
    }
    if (marker.status !== 'pendiente_aprobacion') {
      return res.status(400).json({ message: 'El marcador no está pendiente de aprobación' });
    }
    const estadoAnterior = marker.status;
    const updatedMarker = await Marker.findByIdAndUpdate(
      marker._id,
      {
        status: 'pendiente',
        resolvedAt: null,
        aprobadoAt: new Date(),
        nuevoParaAdmin: true,
      },
      { new: true }
    ).populate('tenant', JURISDICTION_FIELDS);
    try {
      await avisarCambioEstado(updatedMarker, estadoAnterior, 'pendiente');
    } catch (errorNotif) {
      console.error('No se pudo crear la notificación de aprobación:', errorNotif.message);
    }
    avisarAdminsCasoAprobado(updatedMarker).catch((err) => {
      console.error('No se pudo notificar admins del caso aprobado:', err.message);
    });
    avisarVecinosCercanos(updatedMarker).catch((err) => {
      console.error('No se pudo avisar vecinos cerca:', err.message);
    });
    avisarComplementosPerdidaCercanos(updatedMarker).catch((err) => {
      console.error('No se pudo avisar complementos de pérdida:', err.message);
    });
    res.json(sanitizeMarkerResponse(updatedMarker, req.adminScope, req.requester));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// No aprobar / anular: casos que no corresponden
router.patch('/admin/:id/rechazar', requireJurisdictionAdmin, async (req, res) => {
  try {
    const marker = await Marker.findById(req.params.id);
    if (!marker) {
      return res.status(404).json({ message: 'Marker not found' });
    }
    if (rejectIfEliminado(marker, res)) return;
    if (!canManageMarker(req.adminScope, marker)) {
      return res.status(403).json({ message: 'Este caso no pertenece a tu jurisdicción' });
    }
    if (marker.status === 'rechazado') {
      return res.status(400).json({ message: 'Este caso ya está rechazado' });
    }
    if (marker.status === 'resuelto') {
      return res.status(400).json({ message: 'No se puede anular un caso ya resuelto' });
    }
    const motivo = String(req.body.motivo || '').trim().slice(0, 400);
    if (motivo.length < 5) {
      return res.status(400).json({
        message: 'Escribí el motivo de la anulación (al menos unas palabras)',
      });
    }
    const estadoAnterior = marker.status;
    const eraPorAprobar = estadoAnterior === 'pendiente_aprobacion';
    marker.status = 'rechazado';
    marker.resolvedAt = null;
    // Anulado: sale del mapa y pasa al Registro
    marker.eliminadoAt = new Date();
    marker.eliminadoPor = req.requester;
    marker.motivoEliminacion = `Anulado: ${motivo}`;
    marker.nuevoParaAdmin = false;
    await marker.save();
    await marker.populate('tenant', JURISDICTION_FIELDS);
    try {
      await avisarRechazo(marker, motivo, { eraPorAprobar });
    } catch (errorNotif) {
      console.error('No se pudo notificar el rechazo:', errorNotif.message);
      try {
        await avisarCambioEstado(marker, estadoAnterior, 'rechazado');
      } catch (_) { /* ignore */ }
    }
    res.json(sanitizeMarkerResponse(marker, req.adminScope, req.requester));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Ruta para obtener la imagen asociada a un marcador
router.get('/:id/image', async (req, res) => {
  try {
    const marker = await Marker.findById(req.params.id).select('image imageUrl');
    if (!marker || !marker.image || !marker.image.data) {
      return res.status(404).json({ message: 'Imagen no encontrada' });
    }
    res.set('Content-Type', marker.image.contentType || 'application/octet-stream');
    res.set('Cache-Control', 'private, max-age=3600');
    res.send(marker.image.data);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Ruta para obtener la foto con la que un vecino avisó que resolvió el caso
router.get('/:id/resolution-image', async (req, res) => {
  try {
    const marker = await Marker.findById(req.params.id).select('resolutionImage');
    if (!marker || !marker.resolutionImage || !marker.resolutionImage.data) {
      return res.status(404).json({ message: 'Imagen no encontrada' });
    }
    res.set('Content-Type', marker.resolutionImage.contentType || 'application/octet-stream');
    res.set('Cache-Control', 'private, max-age=3600');
    res.send(marker.resolutionImage.data);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Foto de la respuesta al pedido de datos
router.get('/:id/respuesta-datos-image', async (req, res) => {
  try {
    const marker = await Marker.findById(req.params.id).select('respuestaDatosImage');
    if (!marker || !marker.respuestaDatosImage || !marker.respuestaDatosImage.data) {
      return res.status(404).json({ message: 'Imagen no encontrada' });
    }
    res.set('Content-Type', marker.respuestaDatosImage.contentType || 'application/octet-stream');
    res.set('Cache-Control', 'private, max-age=3600');
    res.send(marker.respuestaDatosImage.data);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Ruta para que usuarios reporten que resolvieron un caso. La foto es obligatoria.
router.post('/:id/report-resolved', upload.single('image'), async (req, res) => {
  try {
    const resolutionDescription = String(req.body.description || '').trim();
    if (!resolutionDescription) {
      return res.status(400).json({ message: 'Contá qué hiciste para resolver el caso' });
    }
    if (req.file && !String(req.file.mimetype || '').startsWith('image/')) {
      return res.status(400).json({ message: 'El archivo tiene que ser una imagen' });
    }

    const marker = await Marker.findById(req.params.id);
    if (!marker) {
      return res.status(404).json({ message: 'Marker not found' });
    }

    const yaReporto = normalizeUserId(marker.resolvedBy) === req.requester;
    if (marker.resolvedBy && !yaReporto) {
      return res.status(400).json({ message: 'Este caso ya tiene un aviso de resolución' });
    }
    if (!yaReporto && !req.file) {
      return res.status(400).json({ message: 'Tenés que adjuntar una foto de cómo quedó' });
    }

    // Solo permitir reportar o editar mientras el caso sigue abierto
    if (marker.status !== 'pendiente' && marker.status !== 'en_proceso') {
      return res.status(400).json({ message: 'Solo se pueden reportar casos pendientes o en proceso' });
    }

    const cambios = {
      resolvedBy: req.requester,
      resolvedByReportedAt: new Date(),
      resolutionDescription,
      nuevoParaAdmin: true,
    };
    if (req.file) {
      cambios.resolutionImage = {
        data: req.file.buffer,
        contentType: req.file.mimetype || 'application/octet-stream',
      };
      cambios.resolutionImageUrl = `/api/markers/${marker._id}/resolution-image`;
    }

    const updatedMarker = await Marker.findByIdAndUpdate(
      marker._id,
      cambios,
      { new: true }
    ).populate('tenant', JURISDICTION_FIELDS);
    res.json(sanitizeMarkerResponse(updatedMarker, req.adminScope, req.requester));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/:id/confirm', upload.single('image'), async (req, res) => {
  try {
    const marker = await Marker.findById(req.params.id);
    if (!marker) {
      return res.status(404).json({ message: 'Marker not found' });
    }
    if (marker.category !== 'reparaciones') {
      return res.status(400).json({ message: 'Solo se pueden sumar denuncias a una reparación' });
    }
    if (marker.status !== 'pendiente' && marker.status !== 'en_proceso') {
      return res.status(400).json({ message: 'Este caso todavía no está publicado o ya se resolvió' });
    }
    if (normalizeUserId(marker.createdBy) === req.requester) {
      return res.status(400).json({ message: 'Este caso ya es tuyo' });
    }
    const yaConfirmo = (marker.confirmations || []).some(
      (confirmacion) => normalizeUserId(confirmacion.userId) === req.requester
    );
    if (yaConfirmo) {
      return res.status(409).json({ message: 'Ya sumaste tu denuncia a este caso' });
    }

    const lat = Number(req.body.lat);
    const lng = Number(req.body.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ message: 'Falta la ubicación de la denuncia' });
    }
    if (distanciaMetros(lat, lng, marker.lat, marker.lng) > RADIO_MISMO_CASO_METROS) {
      return res.status(400).json({ message: 'Ese caso está a más de 50 metros' });
    }
    if (req.file && !String(req.file.mimetype || '').startsWith('image/')) {
      return res.status(400).json({ message: 'El archivo tiene que ser una imagen' });
    }

    marker.confirmations.push({
      userId: req.requester,
      description: String(req.body.description || '').slice(0, 500),
      createdAt: new Date(),
      ...(req.file ? {
        image: {
          data: req.file.buffer,
          contentType: req.file.mimetype || 'application/octet-stream',
        },
      } : {}),
    });
    await marker.save();
    if (req.file) {
      const indice = marker.confirmations.length - 1;
      marker.confirmations[indice].imageUrl = `/api/markers/${marker._id}/confirmations/${indice}/image`;
      marker.markModified('confirmations');
      await marker.save();
    }
    await marker.populate('tenant', JURISDICTION_FIELDS);
    res.json(sanitizeMarkerResponse(marker, req.adminScope, req.requester));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/:id/confirmations/:index/image', async (req, res) => {
  try {
    const marker = await Marker.findById(req.params.id).select('confirmations');
    const indice = Number(req.params.index);
    const confirmacion = marker && marker.confirmations && marker.confirmations[indice];
    if (!confirmacion || !confirmacion.image || !confirmacion.image.data) {
      return res.status(404).json({ message: 'Imagen no encontrada' });
    }
    res.set('Content-Type', confirmacion.image.contentType || 'application/octet-stream');
    res.set('Cache-Control', 'private, max-age=3600');
    res.send(confirmacion.image.data);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ----- Cosas perdidas: reclamo + chat -----
router.post('/:id/reclamar', async (req, res) => {
  try {
    const marker = await Marker.findById(req.params.id);
    if (!marker) {
      return res.status(404).json({ message: 'Marker not found' });
    }
    if (marker.category !== 'cosas_perdidas') {
      return res.status(400).json({ message: 'Solo se puede reclamar un aviso de cosas perdidas' });
    }
    if (marker.status !== 'pendiente' && marker.status !== 'en_proceso') {
      return res.status(400).json({ message: 'Este aviso todavía no está publicado o ya se cerró' });
    }
    if (normalizeUserId(marker.createdBy) === req.requester) {
      return res.status(400).json({ message: 'Este aviso es tuyo' });
    }
    const yaReclamo = (marker.claims || []).some(
      (claim) => normalizeUserId(claim.userId) === req.requester
    );
    if (!yaReclamo) {
      const nombre = await nombreDesdeUsuario(req.requester);
      marker.claims.push({
        userId: req.requester,
        nombre,
        createdAt: new Date(),
      });
      await marker.save();
      const caso = marker.caseId ? `#${marker.caseId}` : '';
      try {
        await crearNotificacion({
          userId: marker.createdBy,
          markerId: marker._id,
          caseId: marker.caseId,
          tipo: 'reclamo',
          mensaje: `${nombre} cree que el aviso ${caso} es suyo y quiere chatear.`,
        });
      } catch (errorNotif) {
        console.error('No se pudo notificar el reclamo:', errorNotif.message);
      }
    }
    await marker.populate('tenant', JURISDICTION_FIELDS);
    res.json(sanitizeMarkerResponse(marker, req.adminScope, req.requester));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Cierra quien perdió el objeto (una sola marca: "Ya lo recuperé")
router.patch('/:id/resolver-perdida', async (req, res) => {
  try {
    const marker = await Marker.findById(req.params.id);
    if (!marker) {
      return res.status(404).json({ message: 'Marker not found' });
    }
    if (marker.category !== 'cosas_perdidas') {
      return res.status(400).json({ message: 'Solo aplica a avisos de cosas perdidas' });
    }
    if (rejectIfEliminado(marker, res)) return;
    if (marker.status === 'resuelto') {
      await marker.populate('tenant', JURISDICTION_FIELDS);
      return res.json(sanitizeMarkerResponse(marker, req.adminScope, req.requester));
    }
    if (marker.status !== 'pendiente' && marker.status !== 'en_proceso') {
      return res.status(400).json({ message: 'Este aviso todavía no está publicado o ya se cerró' });
    }
    if (!(marker.claims || []).length) {
      return res.status(400).json({ message: 'Todavía no hay un vecino que haya reclamado' });
    }

    const duenoId = normalizeUserId(marker.createdBy);
    const esDueno = duenoId === req.requester;
    const esReclamante = (marker.claims || []).some(
      (claim) => normalizeUserId(claim.userId) === req.requester
    );
    // Quien perdió: dueño si publicó "Perdí", o reclamante si el aviso es "Encontré"
    const soyQuienPerdio = marker.perdidaTipo === 'perdi' ? esDueno : esReclamante;
    if (!soyQuienPerdio) {
      return res.status(403).json({
        message: 'Solo quien había perdido el objeto puede marcar que ya lo recuperó',
      });
    }

    const abrioChat = (marker.chatAbiertoPor || []).some(
      (id) => normalizeUserId(id) === req.requester
    );
    if (!abrioChat) {
      return res.status(400).json({
        message: 'Primero abrí el chat del reclamo. Después vas a poder marcar que ya lo recuperaste.',
      });
    }

    if (!Array.isArray(marker.confirmacionesPerdida)) {
      marker.confirmacionesPerdida = [];
    }
    const yaConfirmo = marker.confirmacionesPerdida.some(
      (c) => normalizeUserId(c.userId) === req.requester
    );
    if (!yaConfirmo) {
      marker.confirmacionesPerdida.push({
        userId: req.requester,
        accion: 'recupere',
        createdAt: new Date(),
      });
    }

    const caso = marker.caseId ? `#${marker.caseId}` : '';
    marker.status = 'resuelto';
    marker.resolvedAt = new Date();
    marker.resolvedBy = req.requester;
    marker.resolvedByReportedAt = new Date();
    marker.resolutionDescription = 'Quien había perdido el objeto confirmó que ya lo recuperó.';
    marker.eliminadoAt = new Date();
    marker.eliminadoPor = req.requester;
    marker.motivoEliminacion = 'Cierre: el dueño del objeto confirmó que lo recuperó';
    marker.nuevoParaAdmin = false;

    await marker.save();
    await marker.populate('tenant', JURISDICTION_FIELDS);

    await avisarPartesCaso(
      marker,
      `El caso ${caso} de cosas perdidas quedó resuelto: ya recuperaron el objeto. Pasó al registro.`,
      'estado'
    ).catch(() => {});

    res.json(sanitizeMarkerResponse(marker, req.adminScope, req.requester));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/:id/chat', async (req, res) => {
  try {
    const marker = await Marker.findById(req.params.id);
    if (!marker) {
      return res.status(404).json({ message: 'Marker not found' });
    }
    if (marker.category !== 'cosas_perdidas') {
      return res.status(400).json({ message: 'Este caso no tiene chat de reclamo' });
    }
    if (!puedeLeerChat(marker, req.requester, req.adminScope)) {
      return res.status(403).json({ message: 'No tenés acceso a este chat' });
    }
    // Registrar que el participante abrió el chat (habilita botones de cierre)
    if (puedeEscribirChat(marker, req.requester)) {
      const ya = (marker.chatAbiertoPor || []).some(
        (id) => normalizeUserId(id) === req.requester
      );
      if (!ya) {
        marker.chatAbiertoPor = [...(marker.chatAbiertoPor || []), req.requester];
        await marker.save();
      }
    }
    const mensajes = await ChatMensaje.find({ markerId: marker._id })
      .select('-image.data')
      .sort({ createdAt: 1 })
      .limit(200)
      .lean();
    const casoCerrado = marker.status === 'resuelto'
      || marker.status === 'rechazado'
      || !!marker.eliminadoAt;
    const esParticipante = puedeEscribirChat(marker, req.requester);
    // Cerrado o admin (no participante): solo historial, sin escribir
    const soloLectura = casoCerrado || !esParticipante;
    const abrioChat = (marker.chatAbiertoPor || []).some(
      (id) => normalizeUserId(id) === req.requester
    );
    res.json({
      markerId: marker._id,
      caseId: marker.caseId,
      soloLectura,
      chatAbiertoPorMi: abrioChat || esParticipante,
      mensajes: mensajes.map((m) => ({
        id: m._id,
        userId: m.userId,
        nombre: m.nombre || '',
        texto: m.texto || '',
        createdAt: m.createdAt,
        mio: normalizeUserId(m.userId) === req.requester,
        imageUrl: m.tieneImagen
          ? `/api/markers/${marker._id}/chat/${m._id}/image`
          : null,
      })),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/:id/chat/:mensajeId/image', async (req, res) => {
  try {
    const marker = await Marker.findById(req.params.id).select('category createdBy claims tenant province');
    if (!marker) {
      return res.status(404).json({ message: 'Marker not found' });
    }
    // <img> no puede mandar x-user-id: aceptamos ?userId= como en el resto del auth local
    const viewer = normalizeUserId(req.query.userId || req.requester);
    const adminScope = viewer
      ? (viewer === req.requester ? req.adminScope : await getAdminScope(viewer))
      : null;
    if (!puedeLeerChat(marker, viewer, adminScope || req.adminScope)) {
      return res.status(403).json({ message: 'No tenés acceso a este chat' });
    }
    const mensaje = await ChatMensaje.findOne({
      _id: req.params.mensajeId,
      markerId: marker._id,
    }).select('image');
    if (!mensaje?.image?.data) {
      return res.status(404).json({ message: 'Imagen no encontrada' });
    }
    const buffer = Buffer.isBuffer(mensaje.image.data)
      ? mensaje.image.data
      : Buffer.from(mensaje.image.data.buffer || mensaje.image.data);
    res.set('Content-Type', mensaje.image.contentType || 'image/jpeg');
    res.set('Cache-Control', 'private, max-age=3600');
    return res.send(buffer);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/:id/chat', upload.single('image'), async (req, res) => {
  try {
    const texto = String(req.body.texto || '').trim();
    if (!texto && !req.file) {
      return res.status(400).json({ message: 'Escribí un mensaje o adjuntá una foto' });
    }
    if (texto.length > 1000) {
      return res.status(400).json({ message: 'El mensaje es demasiado largo' });
    }
    const marker = await Marker.findById(req.params.id);
    if (!marker) {
      return res.status(404).json({ message: 'Marker not found' });
    }
    if (marker.category !== 'cosas_perdidas') {
      return res.status(400).json({ message: 'Este caso no tiene chat de reclamo' });
    }
    if (marker.status === 'resuelto' || marker.eliminadoAt) {
      return res.status(400).json({ message: 'El caso ya está cerrado' });
    }
    // Solo dueño (con reclamo) o reclamante — el admin solo lee historial
    if (!puedeEscribirChat(marker, req.requester)) {
      return res.status(403).json({ message: 'Solo los vecinos del reclamo pueden escribir en este chat' });
    }
    const esDueno = normalizeUserId(marker.createdBy) === req.requester;
    const esReclamante = (marker.claims || []).some(
      (claim) => normalizeUserId(claim.userId) === req.requester
    );
    if (esDueno && !(marker.claims || []).length) {
      return res.status(400).json({ message: 'Todavía no hay un vecino que haya reclamado' });
    }
    if (!esDueno && !esReclamante) {
      return res.status(403).json({ message: 'No tenés acceso a este chat' });
    }

    const nombre = await nombreDesdeUsuario(req.requester);
    const payload = {
      markerId: marker._id,
      userId: req.requester,
      nombre,
      texto: texto || (req.file ? '📷 Foto' : ''),
      tieneImagen: Boolean(req.file),
    };
    if (req.file) {
      payload.image = {
        data: req.file.buffer,
        contentType: req.file.mimetype || 'image/jpeg',
      };
    }
    const mensaje = await ChatMensaje.create(payload);

    const destinatarios = new Set();
    destinatarios.add(normalizeUserId(marker.createdBy));
    (marker.claims || []).forEach((claim) => destinatarios.add(normalizeUserId(claim.userId)));
    destinatarios.delete(req.requester);
    destinatarios.delete('anonimo');
    const caso = marker.caseId ? `#${marker.caseId}` : '';
    await Promise.allSettled(
      [...destinatarios].map((userId) => crearNotificacion({
        userId,
        markerId: marker._id,
        caseId: marker.caseId,
        tipo: 'chat',
        mensaje: req.file
          ? `Nueva foto en el reclamo ${caso}.`
          : `Nuevo mensaje en el reclamo ${caso}.`,
      }))
    );

    res.status(201).json({
      id: mensaje._id,
      userId: mensaje.userId,
      nombre: mensaje.nombre,
      texto: mensaje.texto,
      createdAt: mensaje.createdAt,
      mio: true,
      imageUrl: mensaje.tieneImagen
        ? `/api/markers/${marker._id}/chat/${mensaje._id}/image`
        : null,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.patch('/admin/:id/pedir-datos', requireStaff, async (req, res) => {
  try {
    const marker = await Marker.findById(req.params.id);
    if (!marker) {
      return res.status(404).json({ message: 'Marker not found' });
    }
    if (rejectIfEliminado(marker, res)) return;
    if (!canManageMarker(req.adminScope, marker)) {
      return res.status(403).json({ message: 'Este caso no pertenece a tu jurisdicción' });
    }
    if (['resuelto', 'rechazado', 'pendiente_cierre'].includes(marker.status)) {
      return res.status(400).json({ message: 'Este caso ya no admite pedido de datos' });
    }
    const caso = marker.caseId ? `#${marker.caseId}` : '';
    const nota = String(req.body.mensaje || '').trim().slice(0, 500);
    if (nota.length < 5) {
      return res.status(400).json({
        message: 'Escribí qué datos necesitás (al menos unas palabras)',
      });
    }
    // No cambia el estado: En proceso es solo cuando el municipio actúa
    marker.pideDatosMensaje = nota;
    marker.pideDatosAt = new Date();
    marker.pideDatosPor = req.requester;
    if (isScopeOperario(req.adminScope) && !marker.atendidoPor) {
      marker.atendidoPor = req.requester;
      marker.atendidoAt = new Date();
    }
    await marker.save();
    await crearNotificacion({
      userId: marker.createdBy,
      markerId: marker._id,
      caseId: marker.caseId,
      tipo: 'pedir_datos',
      mensaje: `Te piden más datos del caso ${caso}: ${nota}`,
    });
    await marker.populate('tenant', JURISDICTION_FIELDS);
    res.json(sanitizeMarkerResponse(marker, req.adminScope, req.requester));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// El vecino responde al pedido de datos (descripción y/o foto)
router.patch('/:id/responder-datos', upload.single('image'), async (req, res) => {
  try {
    const marker = await Marker.findById(req.params.id);
    if (!marker) {
      return res.status(404).json({ message: 'Marker not found' });
    }
    if (rejectIfEliminado(marker, res)) return;
    if (normalizeUserId(marker.createdBy) !== req.requester) {
      return res.status(403).json({ message: 'Solo quien publicó el caso puede responder' });
    }
    if (!marker.pideDatosAt) {
      return res.status(400).json({ message: 'No hay un pedido de datos pendiente' });
    }
    if (marker.status === 'resuelto' || marker.status === 'rechazado') {
      return res.status(400).json({ message: 'Este caso ya está cerrado' });
    }
    const descripcion = String(req.body.description || req.body.descripcion || '').trim();
    if (descripcion.length < 5 && !req.file) {
      return res.status(400).json({
        message: 'Agregá una descripción o una foto para responder',
      });
    }

    // Conservar el pedido en la ficha (admin / operario)
    marker.ultimoPedidoDatosMensaje = marker.pideDatosMensaje || '';
    marker.ultimoPedidoDatosAt = marker.pideDatosAt || new Date();
    marker.ultimoPedidoDatosPor = marker.pideDatosPor || null;

    if (descripcion.length >= 5) {
      marker.respuestaDatosMensaje = descripcion.slice(0, 2000);
      marker.description = descripcion.slice(0, 2000);
    } else {
      marker.respuestaDatosMensaje = '';
    }
    if (req.file) {
      const img = {
        data: req.file.buffer,
        contentType: req.file.mimetype || 'application/octet-stream',
      };
      marker.respuestaDatosImage = img;
      marker.respuestaDatosImageUrl = `/api/markers/${marker._id}/respuesta-datos-image`;
      marker.image = img;
      marker.imageUrl = `/api/markers/${marker._id}/image`;
    }

    marker.pideDatosMensaje = '';
    marker.pideDatosAt = null;
    marker.pideDatosPor = null;
    marker.respuestaDatosAt = new Date();
    marker.ultimaRespuestaDatosAt = marker.respuestaDatosAt;
    marker.nuevoParaAdmin = true;
    await marker.save();
    const caso = marker.caseId ? `#${marker.caseId}` : '';
    const destinatarios = new Set(await listarAdminsDelCaso(marker));
    if (marker.atendidoPor) destinatarios.add(normalizeUserId(marker.atendidoPor));
    if (marker.ultimoPedidoDatosPor) destinatarios.add(normalizeUserId(marker.ultimoPedidoDatosPor));
    for (const userId of destinatarios) {
      if (!userId || userId === 'anonimo') continue;
      await crearNotificacion({
        userId,
        markerId: marker._id,
        caseId: marker.caseId,
        tipo: 'respuesta_datos',
        mensaje: `Nueva respuesta del vecino${caso ? ` · caso ${caso}` : ''}.`,
      }).catch(() => {});
    }
    await marker.populate('tenant', JURISDICTION_FIELDS);
    res.json(sanitizeMarkerResponse(marker, req.adminScope, req.requester));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Vecino renueva una publicación vencida (vuelve al mapa 15 días más)
router.patch('/:id/renovar', async (req, res) => {
  try {
    const marker = await Marker.findById(req.params.id);
    if (!marker) {
      return res.status(404).json({ message: 'Marker not found' });
    }
    if (normalizeUserId(marker.createdBy) !== req.requester) {
      return res.status(403).json({ message: 'Solo quien publicó el aviso puede renovarlo' });
    }
    if (marker.category !== 'perros_gatos' && marker.category !== 'cosas_perdidas') {
      return res.status(400).json({ message: 'Solo se pueden renovar avisos de animales o cosas perdidas' });
    }
    const motivo = String(marker.motivoEliminacion || '').toLowerCase();
    const esVencido = Boolean(marker.eliminadoAt) && motivo.includes('vencimiento');
    if (!esVencido) {
      return res.status(400).json({
        message: 'Solo se pueden renovar publicaciones vencidas',
      });
    }
    marker.eliminadoAt = null;
    marker.eliminadoPor = null;
    marker.motivoEliminacion = '';
    marker.status = 'pendiente';
    marker.aprobadoAt = new Date();
    marker.resolvedAt = null;
    marker.nuevoParaAdmin = true;
    await marker.save();
    const caso = marker.caseId ? `#${marker.caseId}` : '';
    await crearNotificacion({
      userId: marker.createdBy,
      markerId: marker._id,
      caseId: marker.caseId,
      tipo: 'renovado',
      mensaje: `Renovaste tu publicación ${caso}. Vuelve a estar visible 15 días más.`,
    }).catch(() => {});
    await marker.populate('tenant', JURISDICTION_FIELDS);
    res.json(sanitizeMarkerResponse(marker, req.adminScope, req.requester));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Admin abrió la ficha tras una respuesta de datos
router.patch('/admin/:id/visto-respuesta', requireJurisdictionAdmin, async (req, res) => {
  try {
    const marker = await Marker.findById(req.params.id);
    if (!marker) {
      return res.status(404).json({ message: 'Marker not found' });
    }
    if (!canManageMarker(req.adminScope, marker)) {
      return res.status(403).json({ message: 'Este caso no pertenece a tu jurisdicción' });
    }
    marker.respuestaDatosAt = null;
    marker.nuevoParaAdmin = false;
    await marker.save();
    await marker.populate('tenant', JURISDICTION_FIELDS);
    res.json(sanitizeMarkerResponse(marker, req.adminScope, req.requester));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
