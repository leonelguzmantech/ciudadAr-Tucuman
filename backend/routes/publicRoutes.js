const express = require('express');
const Tenant = require('../models/tenant');
const Marker = require('../models/marker');

const router = express.Router();

router.get('/markers', async (req, res) => {
  try {
    const { tenant: tenantSlug, status, category } = req.query;
    const tenant = tenantSlug
      ? await Tenant.findOne({ slug: tenantSlug.trim().toLowerCase() })
      : null;
    const filters = {
      visibility: 'public',
    };
    if (tenant) {
      filters.tenant = tenant._id;
    }
    if (status) {
      filters.status = status;
    }
    if (category) {
      filters.category = category;
    }
    const markers = await Marker.find(filters).select('-image').sort({ createdAt: -1 });
    res.json(markers.map((marker) => ({
      ...marker.toObject(),
      image: undefined,
    })));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
