// backend/routes/markerRoutes.js
const express = require('express');
const multer = require('multer');
const Marker = require('../models/marker');
const ChatMensaje = require('../models/chatMensaje');
const Usuario = require('../models/usuario');
const { normalizeUserId, getRequestUser } = require('../utils/users');
const {
  findJurisdictionForPoint,
  getAdminScope,
  isScopeAdmin,
  canManageMarker,
  buildManagedMarkersFilter,
} = require('../utils/jurisdictions');
const { removeExpiredMarkers } = require('../utils/markerExpiry');
const {
  avisarCambioEstado,
  avisarOficina,
  avisarRechazo,
  crearNotificacion,
  avisarAdminsPorAprobar,
  avisarAdminsCasoAprobado,
  avisarPartesCaso,
  listarAdminsDelCaso,
} = require('../utils/notificaciones');
const router = express.Router();

// Configuración de multer para almacenar los archivos en memoria
const storage = multer.memoryStorage();
const upload = multer({ storage });

const STATUS_VALUES = ['pendiente_aprobacion', 'pendiente', 'en_proceso', 'resuelto', 'rechazado'];
const CATEGORY_VALUES = ['familias', 'persona', 'perros_gatos', 'reparaciones', 'cosas_perdidas'];
const FAMILIAS_TIPOS = ['violencia', 'hijos', 'calle'];
const ANIMAL_TIPOS = ['abandonado', 'perdido', 'adopcion'];
const PERDIDA_TIPOS = ['perdi', 'encontre'];
const LIMITE_REPORTES_POR_DIA = 5;
const MS_UN_DIA = 24 * 60 * 60 * 1000;
const LIMITE_MAPA_DEFAULT = 60;
const LIMITE_ADMIN_DEFAULT = 20;
const LIMITE_MAX = 100;

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
  soloAdminScope = false,
  incluirEliminados = false,
  soloEliminados = false,
}) => {
  const and = [];

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
      and.push({ status: 'resuelto' });
    } else if (cierre === 'anulado') {
      and.push({ status: 'rechazado' });
    } else if (cierre === 'vencido') {
      and.push({
        motivoEliminacion: { $regex: 'vencimiento', $options: 'i' },
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
      status: { $nin: ['resuelto', 'rechazado'] },
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
    and.push({ createdBy: requester });
  }

  // Mapa vecino: admin municipal acota a su municipio/comuna/provincia
  if (
    (myJurisdiction === '1' || myJurisdiction === 'true')
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

  if (excludeCategory && CATEGORY_VALUES.includes(excludeCategory)) {
    and.push({ category: { $ne: excludeCategory } });
  }

  if (animalTipo && animalTipo !== 'todos' && ANIMAL_TIPOS.includes(animalTipo)) {
    and.push({ animalTipo });
  }

  if (perdidaTipo && PERDIDA_TIPOS.includes(perdidaTipo)) {
    and.push({ perdidaTipo });
  }

  if (status && status !== 'todos' && STATUS_VALUES.includes(status)) {
    // En el panel admin, no esconder casos con novedad (respuesta de datos / nuevo)
    // aunque el filtro de estado no coincida (p. ej. quedó en_proceso).
    if (soloAdminScope) {
      and.push({
        $or: [
          { status },
          { respuestaDatosAt: { $ne: null } },
          { nuevoParaAdmin: true },
        ],
      });
    } else {
      and.push({ status });
    }
  }

  const texto = String(q || '').trim().replace(/^#/, '');
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

const normalizeCategory = (value, fallback = 'persona') => {
  if (!value) return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (CATEGORY_VALUES.includes(normalized)) return normalized;
  // Mapeo flexible para compatibilidad
  if (normalized.includes('familia')) return 'familias';
  if (normalized.includes('perro') || normalized.includes('gato')) return 'perros_gatos';
  if (normalized.includes('repar')) return 'reparaciones';
  if (normalized.includes('perdid') || normalized.includes('encontr')) return 'cosas_perdidas';
  return fallback;
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
  if (marker.image) {
    delete marker.image;
  }
  if (marker.resolutionImage) {
    delete marker.resolutionImage;
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
    // Registro del vecino: solo sus propias bajas (resueltos / anulados / vencidos)
    const registroPropio = mineOn && (
      req.query.eliminados === '1'
      || req.query.eliminados === 'true'
      || req.query.registro === '1'
    );
    const filtro = buildListQuery({
      requester,
      adminScope,
      category: req.query.category,
      excludeCategory: req.query.excludeCategory,
      animalTipo: req.query.animalTipo,
      perdidaTipo: req.query.perdidaTipo,
      status: req.query.status,
      mine: req.query.mine,
      myJurisdiction: req.query.myJurisdiction,
      q: req.query.q,
      soloAdminScope: false,
      soloEliminados: registroPropio,
    });

    const [total, markers] = await Promise.all([
      Marker.countDocuments(filtro),
      Marker.find(filtro)
        .select('-image -resolutionImage -confirmations.image')
        .populate('tenant', JURISDICTION_FIELDS)
        .sort(registroPropio ? { eliminadoAt: -1, createdAt: -1 } : { createdAt: -1 })
        .skip(skip)
        .limit(limit),
    ]);

    // Seguridad extra por si el filtro no alcanzó (p. ej. admin de jurisdicción)
    const visibles = markers.filter((marker) => {
      const markerOwner = normalizeUserId(marker.createdBy);
      if (registroPropio) {
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

    res.json({
      items: visibles.map((marker) => sanitizeMarkerResponse(marker, adminScope, requester)),
      total,
      page,
      limit,
      hasMore: skip + limit < total,
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
      familiasTipo: normalizeFamiliasTipo(normalizedCategory, familiasTipo),
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
      familiasTipo: normalizeFamiliasTipo(normalizedCategory, familiasTipo),
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
router.get('/admin/stats', requireJurisdictionAdmin, async (req, res) => {
  try {
    const geo = buildManagedMarkersFilter(req.adminScope);
    const conGeo = (extra) => (
      req.adminScope.isSuperAdmin ? extra : { $and: [geo, extra] }
    );
    // Reportes / Cosas perdidas / Activos: solo casos ya aprobados (no pendientes ni rechazados)
    const publicados = {
      eliminadoAt: null,
      status: { $nin: ['pendiente_aprobacion', 'rechazado'] },
    };
    const urgentesFiltro = conGeo({
      eliminadoAt: null,
      category: 'reparaciones',
      status: { $in: ['pendiente', 'en_proceso'] },
      'confirmations.0': { $exists: true },
    });
    const resolucionFiltro = conGeo({
      eliminadoAt: null,
      resolvedBy: { $nin: [null, ''] },
      status: { $ne: 'resuelto' },
    });
    const respuestasFiltro = conGeo({
      eliminadoAt: null,
      respuestaDatosAt: { $ne: null },
      status: { $nin: ['resuelto', 'rechazado'] },
    });
    const recientesFiltro = conGeo({
      eliminadoAt: null,
      status: { $ne: 'rechazado' },
    });

    const [
      total,
      reportes,
      perdidas,
      porAprobar,
      enProceso,
      registro,
      nuevosReportes,
      nuevasPerdidas,
      urgentes,
      resueltosVecino,
      respuestasDatos,
      recientesDocs,
    ] = await Promise.all([
      Marker.countDocuments(conGeo({ ...publicados })),
      Marker.countDocuments(conGeo({ ...publicados, category: { $ne: 'cosas_perdidas' } })),
      Marker.countDocuments(conGeo({ ...publicados, category: 'cosas_perdidas' })),
      Marker.countDocuments(conGeo({ eliminadoAt: null, status: 'pendiente_aprobacion' })),
      Marker.countDocuments(conGeo({ eliminadoAt: null, status: 'en_proceso' })),
      Marker.countDocuments(conGeo({ eliminadoAt: { $ne: null } })),
      Marker.countDocuments(conGeo({
        ...publicados,
        nuevoParaAdmin: true,
        category: { $ne: 'cosas_perdidas' },
      })),
      Marker.countDocuments(conGeo({
        ...publicados,
        nuevoParaAdmin: true,
        category: 'cosas_perdidas',
      })),
      Marker.countDocuments(urgentesFiltro),
      Marker.countDocuments(resolucionFiltro),
      Marker.countDocuments(respuestasFiltro),
      Marker.find(recientesFiltro)
        .select('-image -resolutionImage -confirmations.image')
        .populate('tenant', JURISDICTION_FIELDS)
        .sort({ createdAt: -1 })
        .limit(5),
    ]);

    const recientes = recientesDocs
      .filter((marker) => canManageMarker(req.adminScope, marker))
      .map((marker) => sanitizeMarkerResponse(marker, req.adminScope, req.requester));

    res.json({
      total,
      reportes,
      perdidas,
      porAprobar,
      enProceso,
      registro,
      nuevosReportes,
      nuevasPerdidas,
      urgentes,
      resueltosVecino,
      respuestasDatos,
      recientes,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Marca como vistos los casos nuevos del admin (limpia el badge al abrir la sección)
router.patch('/admin/marcar-vistos', requireJurisdictionAdmin, async (req, res) => {
  try {
    const seccion = String(req.body?.seccion || req.query?.seccion || '').trim();
    const geo = buildManagedMarkersFilter(req.adminScope);
    const base = {
      eliminadoAt: null,
      nuevoParaAdmin: true,
      status: { $nin: ['pendiente_aprobacion', 'rechazado'] },
    };
    if (seccion === 'cosas_perdidas') {
      base.category = 'cosas_perdidas';
    } else if (seccion === 'reportes') {
      base.category = { $ne: 'cosas_perdidas' };
    } else {
      return res.status(400).json({ message: 'Indicá la sección: reportes o cosas_perdidas' });
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

router.get('/admin', requireJurisdictionAdmin, async (req, res) => {
  try {
    const { page, limit, skip } = parsePageLimit(req.query, LIMITE_ADMIN_DEFAULT);
    const soloEliminados = req.query.eliminados === '1' || req.query.eliminados === 'true'
      || req.query.soloEliminados === '1';
    const atencion = String(req.query.atencion || '').trim();
    const filtro = buildListQuery({
      requester: req.requester,
      adminScope: req.adminScope,
      category: req.query.category,
      excludeCategory: req.query.excludeCategory,
      animalTipo: req.query.animalTipo,
      perdidaTipo: req.query.perdidaTipo,
      // Los atajos de atención ya filtran por estado
      status: (atencion === 'urgentes' || atencion === 'resolucion' || atencion === 'respuestas')
        ? undefined
        : req.query.status,
      mine: req.query.mine,
      q: req.query.q,
      atencion,
      tipoCierre: req.query.tipoCierre,
      periodoDias: req.query.periodoDias,
      fechaDesde: req.query.fechaDesde,
      fechaHasta: req.query.fechaHasta,
      soloAdminScope: true,
      soloEliminados,
    });

    const orden = soloEliminados
      ? { eliminadoAt: -1, createdAt: -1 }
      : { nuevoParaAdmin: -1, createdAt: -1 };

    const [total, markers] = await Promise.all([
      Marker.countDocuments(filtro),
      Marker.find(filtro)
        .select('-image -resolutionImage -confirmations.image')
        .populate('tenant', JURISDICTION_FIELDS)
        .sort(orden)
        .skip(skip)
        .limit(limit),
    ]);

    const items = markers
      .filter((marker) => canManageMarker(req.adminScope, marker))
      .map((marker) => sanitizeMarkerResponse(marker, req.adminScope, req.requester));

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

router.patch('/admin/:id/status', requireJurisdictionAdmin, async (req, res) => {
  const { status } = req.body;
  if (!status) {
    return res.status(400).json({ message: 'Estado requerido' });
  }
  const normalizedStatus = normalizeStatus(status);
  const descripcionCierre = String(req.body.descripcion || req.body.motivo || '').trim();
  try {
    const marker = await Marker.findById(req.params.id);
    if (!marker) {
      return res.status(404).json({ message: 'Marker not found' });
    }
    if (rejectIfEliminado(marker, res)) return;
    if (!canManageMarker(req.adminScope, marker)) {
      return res.status(403).json({ message: 'Este caso no pertenece a tu jurisdicción' });
    }
    // Cerrar caso: descripción obligatoria + pasa al registro de inmediato
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
      await marker.save();
      await marker.populate('tenant', JURISDICTION_FIELDS);
      const caso = marker.caseId ? `#${marker.caseId}` : '';
      await avisarPartesCaso(
        marker,
        `Tu caso ${caso} fue cerrado por el administrador y pasó al registro. ${descripcionCierre}`
      ).catch(() => {});
      return res.json(sanitizeMarkerResponse(marker, req.adminScope, req.requester));
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
    const puedeAvisar = marker.category === 'familias'
      || marker.category === 'persona'
      || (marker.category === 'perros_gatos' && marker.animalTipo === 'abandonado');
    if (!puedeAvisar) {
      return res.status(400).json({ message: 'Este aviso es solo para familias o animales abandonados' });
    }
    const eraNuevoAviso = !marker.avisadoAt;
    if (!marker.avisadoAt) {
      marker.avisadoAt = new Date();
      await marker.save();
    }
    if (eraNuevoAviso) {
      await avisarOficina(marker).catch(() => {});
    }
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
    const estadoAnterior = marker.status;
    marker.status = 'rechazado';
    marker.resolvedAt = null;
    // Anulado: sale del mapa y pasa al Registro
    marker.eliminadoAt = new Date();
    marker.eliminadoPor = req.requester;
    marker.motivoEliminacion = motivo
      ? `Anulado: ${motivo}`
      : 'Anulado por el administrador';
    marker.nuevoParaAdmin = false;
    await marker.save();
    await marker.populate('tenant', JURISDICTION_FIELDS);
    try {
      await avisarRechazo(marker, motivo);
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

router.patch('/admin/:id/pedir-datos', requireJurisdictionAdmin, async (req, res) => {
  try {
    const marker = await Marker.findById(req.params.id);
    if (!marker) {
      return res.status(404).json({ message: 'Marker not found' });
    }
    if (rejectIfEliminado(marker, res)) return;
    if (!canManageMarker(req.adminScope, marker)) {
      return res.status(403).json({ message: 'Este caso no pertenece a tu jurisdicción' });
    }
    if (marker.status === 'resuelto' || marker.status === 'rechazado') {
      return res.status(400).json({ message: 'Este caso ya está cerrado' });
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
    if (descripcion.length >= 5) {
      marker.description = descripcion.slice(0, 2000);
    }
    if (req.file) {
      marker.image = {
        data: req.file.buffer,
        contentType: req.file.mimetype || 'application/octet-stream',
      };
      marker.imageUrl = `/api/markers/${marker._id}/image`;
    }
    marker.pideDatosMensaje = '';
    marker.pideDatosAt = null;
    marker.respuestaDatosAt = new Date();
    marker.ultimaRespuestaDatosAt = marker.respuestaDatosAt;
    marker.nuevoParaAdmin = true;
    await marker.save();
    const caso = marker.caseId ? `#${marker.caseId}` : '';
    const admins = await listarAdminsDelCaso(marker);
    for (const admin of admins) {
      await crearNotificacion({
        userId: admin,
        markerId: marker._id,
        caseId: marker.caseId,
        tipo: 'respuesta_datos',
        mensaje: `El vecino respondió al pedido de datos del caso ${caso}. Revisalo en Reportes.`,
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
