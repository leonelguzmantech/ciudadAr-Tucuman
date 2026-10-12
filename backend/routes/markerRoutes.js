// backend/routes/markerRoutes.js
const express = require('express');
const multer = require('multer');
const Marker = require('../models/marker');
const { requireTenant } = require('../middleware/tenant');
const {
  normalizeUserId,
  getRequestUser,
  requireAdmin,
  isAdminUser,
} = require('../utils/users');
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

const sanitizeMarkerResponse = (markerDoc) => {
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
  return marker;
};

const allowsOrphanMarkers = (req) =>
  !!req.tenant &&
  !!process.env.DEFAULT_TENANT_SLUG &&
  req.tenant.slug === process.env.DEFAULT_TENANT_SLUG;

const buildMarkerLookupFilter = (markerId, req) => {
  const tenantId = req.tenant ? req.tenant._id : null;
  if (!tenantId) {
    return { _id: markerId };
  }
  if (allowsOrphanMarkers(req)) {
    return {
      _id: markerId,
      $or: [{ tenant: tenantId }, { tenant: { $exists: false } }, { tenant: null }],
    };
  }
  return { _id: markerId, tenant: tenantId };
};

router.use(requireTenant);

// Ruta para obtener todos los marcadores
router.get('/', async (req, res) => {
  try {
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    await Marker.deleteMany({
      status: 'resuelto',
      resolvedAt: { $lte: tenDaysAgo },
    });

    const requester = getRequestUser(req);
    const isAdmin = isAdminUser(requester);
    const tenantId = req.tenant ? req.tenant._id : null;
    const allowOrphans =
      !!tenantId &&
      !!process.env.DEFAULT_TENANT_SLUG &&
      req.tenant.slug === process.env.DEFAULT_TENANT_SLUG;
    const tenantCriteria = tenantId
      ? allowOrphans
        ? { $or: [{ tenant: tenantId }, { tenant: { $exists: false } }, { tenant: null }] }
        : { tenant: tenantId }
      : {};
    
    // Obtener todos los marcadores sin la información binaria de la imagen
    let markers = await Marker.find(tenantCriteria).select('-image');
    
    // Filtrar marcadores según permisos del usuario
    if (!isAdmin) {
      markers = markers.filter(marker => {
        if (marker.tenant && tenantId && String(marker.tenant) !== String(tenantId)) {
          return false;
        }
        // Marcadores pendientes de aprobación: solo el creador puede verlos
        if (marker.status === 'pendiente_aprobacion') {
          const markerOwner = normalizeUserId(marker.createdBy);
          return markerOwner === requester; // Solo ver sus propios marcadores pendientes
        }
        
        // Filtrar marcadores de "familias": solo mostrar si el usuario es el creador
        if (marker.category === 'familias') {
          const markerOwner = normalizeUserId(marker.createdBy);
          return markerOwner === requester;
        }
        return true; // Mostrar todos los demás marcadores aprobados (pendiente, en_proceso, resuelto)
      });
    }
    
    res.json(markers.map(sanitizeMarkerResponse));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});


// Ruta para agregar un nuevo marcador
router.post('/', upload.single('image'), async (req, res) => {
  const { lat, lng, date, time, description, urgency, status, category, visibility } = req.body;
  const createdBy = getRequestUser(req);
  const isAdmin = isAdminUser(createdBy);
  const normalizedCategory = normalizeCategory(category);
  const tenantId = req.tenant ? req.tenant._id : null;
  
  // Usuarios normales crean marcadores con "pendiente_aprobacion", admins pueden especificar el estado
  let finalStatus;
  if (isAdmin && status) {
    finalStatus = normalizeStatus(status, 'pendiente');
  } else {
    finalStatus = 'pendiente_aprobacion'; // Usuarios normales siempre crean con este estado
  }

  // Generar caseId único tomando el último caseId existente
  const caseId = await getNextCaseId();

  const newMarker = new Marker({
    tenant: tenantId,
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

  try {
    const savedMarker = await newMarker.save();
    res.status(201).json(sanitizeMarkerResponse(savedMarker));
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Ruta para actualizar un marcador existente
router.put('/:id', upload.single('image'), async (req, res) => {
  const { id } = req.params;
  const { lat, lng, date, time, description, urgency, status, category, visibility } = req.body;
  const requester = getRequestUser(req);
  const tenantId = req.tenant ? req.tenant._id : null;

  try {
    const existingMarker = await Marker.findById(id);
    if (!existingMarker) {
      return res.status(404).json({ message: 'Marker not found' });
    }
    if (
      tenantId &&
      existingMarker.tenant &&
      String(existingMarker.tenant) !== String(tenantId)
    ) {
      return res.status(403).json({ message: 'No autorizado para editar este marcador' });
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

    if (req.file) {
      updateData.image = {
        data: req.file.buffer,
        contentType: req.file.mimetype || 'application/octet-stream',
      };
      updateData.imageUrl = `/api/markers/${existingMarker._id}/image`;
    }

    const updatedMarker = await Marker.findByIdAndUpdate(id, updateData, {
      new: true,
    });
    res.json(sanitizeMarkerResponse(updatedMarker));
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Ruta para eliminar un marcador
router.delete('/:id', async (req, res) => {
  const requester = getRequestUser(req);
  const tenantId = req.tenant ? req.tenant._id : null;
  try {
    const existingMarker = await Marker.findById(req.params.id);
    if (!existingMarker) {
      return res.status(404).json({ message: 'Marker not found' });
    }
    if (
      tenantId &&
      existingMarker.tenant &&
      String(existingMarker.tenant) !== String(tenantId)
    ) {
      return res.status(403).json({ message: 'No autorizado para eliminar este marcador' });
    }
    const markerOwner = normalizeUserId(existingMarker.createdBy);
    if (markerOwner !== requester && !isAdminUser(requester)) {
      return res.status(403).json({ message: 'No autorizado para eliminar este marcador' });
    }

    await existingMarker.deleteOne();
    res.json({ message: 'Marker deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ----- Rutas de administrador -----
router.get('/admin', requireAdmin, async (req, res) => {
  try {
    const tenantId = req.tenant ? req.tenant._id : null;
    const criteria = tenantId ? { tenant: tenantId } : {};
    const markers = await Marker.find(criteria).select('-image').sort({ createdAt: -1 });
    res.json(markers.map(sanitizeMarkerResponse));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.patch('/admin/:id/status', requireAdmin, async (req, res) => {
  const { status } = req.body;
  if (!status) {
    return res.status(400).json({ message: 'Estado requerido' });
  }
  const normalizedStatus = normalizeStatus(status);
  try {
    const tenantId = req.tenant ? req.tenant._id : null;
    const filter = tenantId ? { _id: req.params.id, tenant: tenantId } : { _id: req.params.id };
    const updatedMarker = await Marker.findOneAndUpdate(
      filter,
      {
        status: normalizedStatus,
        resolvedAt: computeResolvedAt(normalizedStatus),
      },
      { new: true }
    );
    if (!updatedMarker) {
      return res.status(404).json({ message: 'Marker not found' });
    }
    res.json(sanitizeMarkerResponse(updatedMarker));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Ruta para aprobar un marcador (cambiar de pendiente_aprobacion a pendiente)
router.patch('/admin/:id/approve', requireAdmin, async (req, res) => {
  try {
    const tenantId = req.tenant ? req.tenant._id : null;
    const filter = tenantId ? { _id: req.params.id, tenant: tenantId } : { _id: req.params.id };
    const marker = await Marker.findOne(filter);
    if (!marker) {
      return res.status(404).json({ message: 'Marker not found' });
    }
    if (marker.status !== 'pendiente_aprobacion') {
      return res.status(400).json({ message: 'El marcador no está pendiente de aprobación' });
    }
    const updatedMarker = await Marker.findOneAndUpdate(
      filter,
      {
        status: 'pendiente',
        resolvedAt: null,
      },
      { new: true }
    );
    res.json(sanitizeMarkerResponse(updatedMarker));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Ruta para obtener la imagen asociada a un marcador
router.get('/:id/image', async (req, res) => {
  try {
    const marker = await Marker.findOne(buildMarkerLookupFilter(req.params.id, req)).select('image imageUrl');
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

// Ruta para que usuarios reporten que resolvieron un caso
router.post('/:id/report-resolved', async (req, res) => {
  try {
    const tenantId = req.tenant ? req.tenant._id : null;
    const filter = tenantId ? { _id: req.params.id, tenant: tenantId } : { _id: req.params.id };
    const marker = await Marker.findOne(filter);
    if (!marker) {
      return res.status(404).json({ message: 'Marker not found' });
    }
    
    // Solo permitir reportar resolución para casos aprobados (pendiente o en_proceso)
    if (marker.status !== 'pendiente' && marker.status !== 'en_proceso') {
      return res.status(400).json({ message: 'Solo se pueden reportar casos pendientes o en proceso' });
    }
    
    const reporter = getRequestUser(req);
    const updatedMarker = await Marker.findOneAndUpdate(
      filter,
      {
        resolvedBy: reporter,
        resolvedByReportedAt: new Date(),
      },
      { new: true }
    );
    res.json(sanitizeMarkerResponse(updatedMarker));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
