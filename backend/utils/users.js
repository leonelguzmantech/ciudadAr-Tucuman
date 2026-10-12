const admins = require('../config/admins');

const normalizeUserId = (value) =>
  value ? String(value).trim().toLowerCase() : 'anonimo';

const isAdminUser = (value) => admins.includes(normalizeUserId(value));

const getRequestUser = (req) =>
  normalizeUserId(req.headers['x-user-id'] || req.body.userId || '');

const requireAdmin = (req, res, next) => {
  const requester = getRequestUser(req);
  if (!isAdminUser(requester)) {
    return res.status(403).json({ message: 'Acceso de administrador requerido' });
  }
  next();
};

module.exports = {
  normalizeUserId,
  isAdminUser,
  getRequestUser,
  requireAdmin,
};

