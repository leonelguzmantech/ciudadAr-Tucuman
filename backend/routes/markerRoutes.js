// backend/routes/markerRoutes.js
const express = require('express');
const multer = require('multer');
const Marker = require('../models/marker');
const { normalizeUserId, getRequestUser } = require('../utils/users');
const {
  findJurisdictionForPoint,
  getAdminScope,
  isScopeAdmin,
  canManageMarker,
  buildManagedMarkersFilter,
} = require('../utils/jurisdictions');
const { removeExpiredMarkers } = require('../utils/markerExpiry');
const router = express.Router();

// Configuración de multer para almacenar los archivos en memoria
const storage = multer.memoryStorage();
const upload = multer({ storage });

const STATUS_VALUES = ['pendiente_aprobacion', 'pendiente', 'en_proceso', 'resuelto'];
const CATEGORY_VALUES = ['familias', 'persona', 'perros_gatos', 'reparaciones'];

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

router.use(loadAdminScope);

// Ruta para obtener todos los marcadores
router.get('/', async (req, res) => {
  try {
    await removeExpiredMarkers();

    const { requester, adminScope } = req;

    // Obtener todos los marcadores sin la información binaria de la imagen
    const markers = await Marker.find()
      .select('-image -resolutionImage -confirmations.image')
      .populate('tenant', JURISDICTION_FIELDS);

    // Los admins ven todo lo de su jurisdicción; el resto, solo lo aprobado y no privado
    const visibleMarkers = markers.filter((marker) => {
      if (canManageMarker(adminScope, marker)) {
        return true;
      }
      const markerOwner = normalizeUserId(marker.createdBy);
      // Marcadores pendientes de aprobación: solo el creador puede verlos
      if (marker.status === 'pendiente_aprobacion') {
        return markerOwner === requester;
      }
      // Familias y personas en situación de calle: solo el creador puede verlas
      if (marker.category === 'familias' || marker.category === 'persona') {
        return markerOwner === requester;
      }
      return true;
    });

    res.json(visibleMarkers.map((marker) => sanitizeMarkerResponse(marker, adminScope, requester)));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});


// Ruta para agregar un nuevo marcador
router.post('/', upload.single('image'), async (req, res) => {
  const { lat, lng, date, time, description, urgency, status, category, visibility } = req.body;
  const { requester: createdBy, adminScope } = req;
  const normalizedCategory = normalizeCategory(category);

  try {
    const jurisdiction = await findJurisdictionForPoint(lat, lng);

    // Solo quien administra esa jurisdicción puede crear con un estado distinto
    let finalStatus = 'pendiente_aprobacion';
    if (status && canManageMarker(adminScope, jurisdiction)) {
      finalStatus = normalizeStatus(status, 'pendiente');
    }

    // Generar caseId único tomando el último caseId existente
    const caseId = await getNextCaseId();

    const newMarker = new Marker({
      tenant: jurisdiction.tenant,
      province: jurisdiction.province,
      lat,
      lng,
      date,
      time,
      description,
      urgency,
      status: finalStatus,
      category: normalizedCategory,
      visibility: visibility || 'public',
      createdBy,
      caseId,
      resolvedAt: computeResolvedAt(finalStatus),
    });

    if (req.file) {
      newMarker.image = {
        data: req.file.buffer,
        contentType: req.file.mimetype || 'application/octet-stream',
      };
      newMarker.imageUrl = `/api/markers/${newMarker._id}/image`;
    }

    const savedMarker = await newMarker.save();
    await savedMarker.populate('tenant', JURISDICTION_FIELDS);
    res.status(201).json(sanitizeMarkerResponse(savedMarker, adminScope, createdBy));
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Ruta para actualizar un marcador existente
router.put('/:id', upload.single('image'), async (req, res) => {
  const { id } = req.params;
  const { lat, lng, date, time, description, urgency, status, category, visibility } = req.body;
  const { requester, adminScope } = req;

  try {
    const existingMarker = await Marker.findById(id);
    if (!existingMarker) {
      return res.status(404).json({ message: 'Marker not found' });
    }
    const markerOwner = normalizeUserId(existingMarker.createdBy);
    if (markerOwner !== requester) {
      return res.status(403).json({ message: 'No autorizado para editar este marcador' });
    }

    const normalizedStatus = normalizeStatus(status, existingMarker.status);
    const normalizedCategory = normalizeCategory(category, existingMarker.category);
    const updateData = {
      lat,
      lng,
      date,
      time,
      description,
      urgency,
      status: normalizedStatus,
      category: normalizedCategory,
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

// Ruta para eliminar un marcador
router.delete('/:id', async (req, res) => {
  const { requester, adminScope } = req;
  try {
    const existingMarker = await Marker.findById(req.params.id);
    if (!existingMarker) {
      return res.status(404).json({ message: 'Marker not found' });
    }
    const markerOwner = normalizeUserId(existingMarker.createdBy);
    if (markerOwner !== requester && !canManageMarker(adminScope, existingMarker)) {
      return res.status(403).json({ message: 'No autorizado para eliminar este marcador' });
    }

    await existingMarker.deleteOne();
    res.json({ message: 'Marker deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ----- Rutas de administrador -----
router.get('/admin', requireJurisdictionAdmin, async (req, res) => {
  try {
    const markers = await Marker.find(buildManagedMarkersFilter(req.adminScope))
      .select('-image -resolutionImage -confirmations.image')
      .populate('tenant', JURISDICTION_FIELDS)
      .sort({ createdAt: -1 });
    res.json(markers.map((marker) => sanitizeMarkerResponse(marker, req.adminScope, req.requester)));
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
  try {
    const marker = await Marker.findById(req.params.id);
    if (!marker) {
      return res.status(404).json({ message: 'Marker not found' });
    }
    if (!canManageMarker(req.adminScope, marker)) {
      return res.status(403).json({ message: 'Este caso no pertenece a tu jurisdicción' });
    }
    const updatedMarker = await Marker.findByIdAndUpdate(
      marker._id,
      {
        status: normalizedStatus,
        resolvedAt: computeResolvedAt(normalizedStatus),
      },
      { new: true }
    ).populate('tenant', JURISDICTION_FIELDS);
    res.json(sanitizeMarkerResponse(updatedMarker, req.adminScope, req.requester));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Ruta para aprobar un marcador (cambiar de pendiente_aprobacion a pendiente)
router.patch('/admin/:id/approve', requireJurisdictionAdmin, async (req, res) => {
  try {
    const marker = await Marker.findById(req.params.id);
    if (!marker) {
      return res.status(404).json({ message: 'Marker not found' });
    }
    if (!canManageMarker(req.adminScope, marker)) {
      return res.status(403).json({ message: 'Este caso no pertenece a tu jurisdicción' });
    }
    if (marker.status !== 'pendiente_aprobacion') {
      return res.status(400).json({ message: 'El marcador no está pendiente de aprobación' });
    }
    const updatedMarker = await Marker.findByIdAndUpdate(
      marker._id,
      {
        status: 'pendiente',
        resolvedAt: null,
      },
      { new: true }
    ).populate('tenant', JURISDICTION_FIELDS);
    res.json(sanitizeMarkerResponse(updatedMarker, req.adminScope, req.requester));
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
    if (!req.file) {
      return res.status(400).json({ message: 'Tenés que adjuntar una foto de cómo quedó' });
    }
    if (!String(req.file.mimetype || '').startsWith('image/')) {
      return res.status(400).json({ message: 'El archivo tiene que ser una imagen' });
    }

    const marker = await Marker.findById(req.params.id);
    if (!marker) {
      return res.status(404).json({ message: 'Marker not found' });
    }
    if (marker.resolvedBy) {
      return res.status(400).json({ message: 'Este caso ya tiene un aviso de resolución' });
    }

    // Solo permitir reportar resolución para casos aprobados (pendiente o en_proceso)
    if (marker.status !== 'pendiente' && marker.status !== 'en_proceso') {
      return res.status(400).json({ message: 'Solo se pueden reportar casos pendientes o en proceso' });
    }

    const updatedMarker = await Marker.findByIdAndUpdate(
      marker._id,
      {
        resolvedBy: req.requester,
        resolvedByReportedAt: new Date(),
        resolutionImage: {
          data: req.file.buffer,
          contentType: req.file.mimetype || 'application/octet-stream',
        },
        resolutionImageUrl: `/api/markers/${marker._id}/resolution-image`,
      },
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

module.exports = router;
