const express = require('express');
const Business = require('../models/business');
const BusinessLocation = require('../models/businessLocation');
const { requireTenant, authorizeTenantRole } = require('../../../middleware/tenant');

const router = express.Router();

router.use(requireTenant);

const ensureBusinessForTenant = async (businessId, tenantId) => {
  if (!businessId) return null;
  const business = await Business.findOne({
    _id: businessId,
    tenant: tenantId,
  });
  return business;
};

const sanitizeLocation = (locationDoc) => {
  if (!locationDoc) return null;
  const location = locationDoc.toObject ? locationDoc.toObject() : locationDoc;
  return location;
};

router.post(
  '/',
  authorizeTenantRole('TENANT_ADMIN', 'TENANT_STAFF'),
  async (req, res) => {
    try {
      const business = new Business({
        tenant: req.tenant._id,
        name: req.body.name,
        description: req.body.description,
        category: req.body.category,
        status: req.body.status,
        contact: req.body.contact,
        settings: req.body.settings,
        metadata: req.body.metadata,
        createdBy: req.userContext?.id || 'system',
      });
      const saved = await business.save();
      res.status(201).json(saved);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  }
);

router.get('/', authorizeTenantRole('TENANT_ADMIN', 'TENANT_STAFF'), async (req, res) => {
  try {
    const filters = {
      tenant: req.tenant._id,
    };
    if (req.query.category) {
      filters.category = req.query.category;
    }
    if (req.query.status) {
      filters.status = req.query.status;
    }
    if (req.query.q) {
      filters.name = { $regex: req.query.q, $options: 'i' };
    }
    const businesses = await Business.find(filters).sort({ createdAt: -1 });
    res.json(businesses);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/:businessId', authorizeTenantRole('TENANT_ADMIN', 'TENANT_STAFF'), async (req, res) => {
  try {
    const business = await ensureBusinessForTenant(req.params.businessId, req.tenant._id);
    if (!business) {
      return res.status(404).json({ message: 'Negocio no encontrado' });
    }
    res.json(business);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.patch(
  '/:businessId',
  authorizeTenantRole('TENANT_ADMIN'),
  async (req, res) => {
    try {
      const business = await ensureBusinessForTenant(req.params.businessId, req.tenant._id);
      if (!business) {
        return res.status(404).json({ message: 'Negocio no encontrado' });
      }
      const updates = {};
      ['name', 'description', 'category', 'status', 'contact', 'settings', 'metadata'].forEach(
        (field) => {
          if (req.body[field] !== undefined) {
            updates[field] = req.body[field];
          }
        }
      );
      const updated = await Business.findByIdAndUpdate(business._id, updates, { new: true });
      res.json(updated);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  }
);

router.delete(
  '/:businessId',
  authorizeTenantRole('TENANT_ADMIN'),
  async (req, res) => {
    try {
      const business = await ensureBusinessForTenant(req.params.businessId, req.tenant._id);
      if (!business) {
        return res.status(404).json({ message: 'Negocio no encontrado' });
      }
      await BusinessLocation.deleteMany({ business: business._id });
      await business.deleteOne();
      res.json({ message: 'Negocio eliminado' });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }
);

router.post(
  '/:businessId/locations',
  authorizeTenantRole('TENANT_ADMIN', 'TENANT_STAFF'),
  async (req, res) => {
    try {
      const business = await ensureBusinessForTenant(req.params.businessId, req.tenant._id);
      if (!business) {
        return res.status(404).json({ message: 'Negocio no encontrado' });
      }
      const latValue = parseFloat(req.body.lat);
      const lngValue = parseFloat(req.body.lng);
      if (Number.isNaN(latValue) || Number.isNaN(lngValue)) {
        return res.status(400).json({ message: 'Latitud o longitud inválida' });
      }
      const location = new BusinessLocation({
        business: business._id,
        tenant: req.tenant._id,
        name: req.body.name,
        status: req.body.status,
        visibility: req.body.visibility || 'public',
        lat: latValue,
        lng: lngValue,
        location: {
          type: 'Point',
          coordinates: [lngValue, latValue],
        },
        address: req.body.address,
        city: req.body.city,
        province: req.body.province,
        contactPhone: req.body.contactPhone,
        notes: req.body.notes,
        hours: req.body.hours,
        metadata: req.body.metadata,
        createdBy: req.userContext?.id || 'system',
      });
      const saved = await location.save();
      res.status(201).json(sanitizeLocation(saved));
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  }
);

router.get(
  '/:businessId/locations',
  authorizeTenantRole('TENANT_ADMIN', 'TENANT_STAFF'),
  async (req, res) => {
  try {
    const business = await ensureBusinessForTenant(req.params.businessId, req.tenant._id);
    if (!business) {
      return res.status(404).json({ message: 'Negocio no encontrado' });
    }
    const locations = await BusinessLocation.find({
      business: business._id,
      tenant: req.tenant._id,
    }).sort({ createdAt: -1 });
    res.json(locations.map(sanitizeLocation));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
  }
);

router.patch(
  '/locations/:locationId',
  authorizeTenantRole('TENANT_ADMIN', 'TENANT_STAFF'),
  async (req, res) => {
    try {
      const location = await BusinessLocation.findOne({
        _id: req.params.locationId,
        tenant: req.tenant._id,
      });
      if (!location) {
        return res.status(404).json({ message: 'Ubicación no encontrada' });
      }
      const updates = {};
      [
        'name',
        'status',
        'visibility',
        'lat',
        'lng',
        'address',
        'city',
        'province',
        'contactPhone',
        'notes',
        'hours',
        'metadata',
      ].forEach((field) => {
        if (req.body[field] !== undefined) {
          updates[field] = req.body[field];
        }
      });
      if (updates.lat !== undefined || updates.lng !== undefined) {
        const nextLat =
          updates.lat !== undefined ? parseFloat(updates.lat) : location.lat;
        const nextLng =
          updates.lng !== undefined ? parseFloat(updates.lng) : location.lng;
        if (Number.isNaN(nextLat) || Number.isNaN(nextLng)) {
          return res.status(400).json({ message: 'Latitud o longitud inválida' });
        }
        updates.lat = nextLat;
        updates.lng = nextLng;
        updates.location = {
          type: 'Point',
          coordinates: [nextLng, nextLat],
        };
      }
      const updated = await BusinessLocation.findByIdAndUpdate(location._id, updates, {
        new: true,
      });
      res.json(sanitizeLocation(updated));
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  }
);

router.delete(
  '/locations/:locationId',
  authorizeTenantRole('TENANT_ADMIN'),
  async (req, res) => {
    try {
      const location = await BusinessLocation.findOne({
        _id: req.params.locationId,
        tenant: req.tenant._id,
      });
      if (!location) {
        return res.status(404).json({ message: 'Ubicación no encontrada' });
      }
      await location.deleteOne();
      res.json({ message: 'Ubicación eliminada' });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }
);

module.exports = router;

