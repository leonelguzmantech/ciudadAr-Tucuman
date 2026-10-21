const admins = require('../config/admins');

const normalizeUserId = (value) =>
  value ? String(value).trim().toLowerCase() : 'anonimo';

const isAdminUser = (value) => admins.includes(normalizeUserId(value));

const getRequestUser = (req) =>
  normalizeUserId(req.headers['x-user-id'] || req.body.userId || '');

module.exports = {
  normalizeUserId,
  isAdminUser,
  getRequestUser,
};

