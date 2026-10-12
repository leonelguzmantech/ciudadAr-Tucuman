const mongoose = require('mongoose');
const Tenant = require('../models/tenant');
const { normalizeUserId, isAdminUser } = require('../utils/users');

const resolveTenantFilter = (identifier) => {
  if (!identifier) return null;
  if (mongoose.Types.ObjectId.isValid(identifier)) {
    return { _id: identifier };
  }
  return { slug: String(identifier).trim().toLowerCase() };
};

const buildUserContext = (req) => {
  const rawUserId = req.headers['x-user-id'] || '';
  const userId = normalizeUserId(rawUserId);
  const headerRole = String(req.headers['x-user-role'] || '').toUpperCase();
  const isSuperAdmin = isAdminUser(userId);

  return {
    id: userId,
    role: isSuperAdmin ? 'SUPER_ADMIN' : headerRole || 'PUBLIC_USER',
    isSuperAdmin,
  };
};

const requireTenant = async (req, res, next) => {
  try {
    let tenantIdentifier =
      req.headers['x-tenant-id'] || req.query.tenantId || req.body.tenantId;
    if (!tenantIdentifier && process.env.DEFAULT_TENANT_SLUG) {
      tenantIdentifier = process.env.DEFAULT_TENANT_SLUG;
    }
    const filter = resolveTenantFilter(tenantIdentifier);

    if (!filter) {
      return res.status(400).json({
        message: 'No se proporcionó un tenant válido. Usa el header x-tenant-id o tenantId en la request.',
      });
    }

    const tenant = await Tenant.findOne(filter);
    if (!tenant) {
      return res.status(404).json({ message: 'Tenant no encontrado' });
    }

    req.tenant = tenant;
    req.userContext = buildUserContext(req);

    next();
  } catch (error) {
    console.error('Error en requireTenant:', error);
    res.status(500).json({ message: 'Error al resolver el tenant' });
  }
};

const authorizeTenantRole = (...allowedRoles) => (req, res, next) => {
  if (!req.userContext) {
    req.userContext = buildUserContext(req);
  }

  if (req.userContext.isSuperAdmin) {
    return next();
  }

  if (!allowedRoles.length) {
    return next();
  }

  if (!allowedRoles.includes(req.userContext.role)) {
    return res.status(403).json({ message: 'No tienes permisos para esta acción' });
  }

  next();
};

module.exports = {
  requireTenant,
  authorizeTenantRole,
};

