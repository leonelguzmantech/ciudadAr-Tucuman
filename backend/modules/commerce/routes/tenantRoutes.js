const express = require('express');
const Tenant = require('../../../models/tenant');
const { requireAdmin } = require('../../../utils/users');

const router = express.Router();

const buildTenantFilter = (query) => {
  const filters = {};
  if (query.type) {
    filters.type = query.type;
  }
  if (query.status) {
    filters.status = query.status;
  }
  if (query.plan) {
    filters.billingPlan = query.plan;
  }
  if (query.slug) {
    filters.slug = query.slug.trim().toLowerCase();
  }
  return filters;
};

const findTenantByIdOrSlug = async (identifier) => {
  if (!identifier) return null;
  if (identifier.match(/^[0-9a-fA-F]{24}$/)) {
    return Tenant.findById(identifier);
  }
  return Tenant.findOne({ slug: identifier.trim().toLowerCase() });
};

router.post('/', requireAdmin, async (req, res) => {
  try {
    const data = {
      name: req.body.name,
      slug: req.body.slug,
      type: req.body.type,
      status: req.body.status,
      billingPlan: req.body.billingPlan,
      contactEmail: req.body.contactEmail,
      settings: req.body.settings || {},
      metadata: req.body.metadata || {},
    };
    const tenant = new Tenant(data);
    const saved = await tenant.save();
    res.status(201).json(saved);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.get('/', requireAdmin, async (req, res) => {
  try {
    const filters = buildTenantFilter(req.query);
    const tenants = await Tenant.find(filters).sort({ createdAt: -1 });
    res.json(tenants);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/:tenantId', requireAdmin, async (req, res) => {
  try {
    const tenant = await findTenantByIdOrSlug(req.params.tenantId);
    if (!tenant) {
      return res.status(404).json({ message: 'Tenant no encontrado' });
    }
    res.json(tenant);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.patch('/:tenantId', requireAdmin, async (req, res) => {
  try {
    const tenant = await findTenantByIdOrSlug(req.params.tenantId);
    if (!tenant) {
      return res.status(404).json({ message: 'Tenant no encontrado' });
    }
    const updates = {};
    ['name', 'type', 'status', 'billingPlan', 'contactEmail', 'settings', 'metadata'].forEach(
      (field) => {
        if (req.body[field] !== undefined) {
          updates[field] = req.body[field];
        }
      }
    );
    if (req.body.slug) {
      updates.slug = req.body.slug.trim().toLowerCase();
    }
    const updated = await Tenant.findByIdAndUpdate(tenant._id, updates, { new: true });
    res.json(updated);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

module.exports = router;

