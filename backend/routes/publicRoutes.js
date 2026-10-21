const express = require('express');
const Tenant = require('../models/tenant');
const Marker = require('../models/marker');
const { removeExpiredMarkers } = require('../utils/markerExpiry');

const router = express.Router();

router.get('/markers', async (req, res) => {
  try {
    const { tenant: tenantSlug, status, category } = req.query;
    const tenant = tenantSlug
      ? await Tenant.findOne({ slug: tenantSlug.trim().toLowerCase() })
      : null;
    const filters = {
      visibility: 'public',
      category: { $nin: ['familias', 'persona'] },
      status: { $ne: 'pendiente_aprobacion' },
    };
    if (tenant) {
      filters.tenant = tenant._id;
    }
    if (status && status !== 'pendiente_aprobacion') {
      filters.status = status;
    }
    if (category && category !== 'familias' && category !== 'persona') {
      filters.category = category;
    }
    await removeExpiredMarkers();
    const markers = await Marker.find(filters)
      .select('-image -resolutionImage -confirmations.image')
      .sort({ createdAt: -1 });
    res.json(markers.map((marker) => {
      const plain = marker.toObject();
      const confirmations = Array.isArray(plain.confirmations) ? plain.confirmations : [];
      plain.neighborCount = 1 + confirmations.length;
      delete plain.confirmations;
      delete plain.image;
      delete plain.resolutionImage;
      return plain;
    }));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
