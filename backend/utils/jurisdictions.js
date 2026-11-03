const mongoose = require('mongoose');
const Tenant = require('../models/tenant');
const { isAdminUser } = require('./users');

const LOCAL_TYPES = ['municipality', 'commune'];

const toObjectIds = (ids) =>
  (ids || [])
    .map((id) => {
      try {
        return new mongoose.Types.ObjectId(String(id));
      } catch {
        return null;
      }
    })
    .filter(Boolean);

const findJurisdictionForPoint = async (lat, lng) => {
  const latitude = Number(lat);
  const longitude = Number(lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return { tenant: null, province: null };
  }

  const matches = await Tenant.find({
    status: 'active',
    boundary: {
      $geoIntersects: {
        $geometry: { type: 'Point', coordinates: [longitude, latitude] },
      },
    },
  }).select('_id type name');

  const local =
    matches.find((t) => t.type === 'municipality') ||
    matches.find((t) => t.type === 'commune') ||
    null;
  const province = matches.find((t) => t.type === 'province') || null;

  return {
    tenant: local ? local._id : province ? province._id : null,
    province: province ? province._id : null,
  };
};

const mapJuris = (rows) =>
  (rows || []).map((t) => ({ id: t._id, name: t.name, type: t.type }));

const getAdminScope = async (userId) => {
  if (isAdminUser(userId)) {
    return {
      isSuperAdmin: true,
      isOperario: false,
      tenantIds: [],
      provinceIds: [],
      operarioTenantIds: [],
      jurisdictions: [],
      operarioJurisdictions: [],
    };
  }

  const [managed, crew] = await Promise.all([
    Tenant.find({ admins: userId, status: 'active' }).select('_id name type'),
    Tenant.find({ operarios: userId, status: 'active' }).select('_id name type'),
  ]);

  const tenantIds = managed
    .filter((t) => LOCAL_TYPES.includes(t.type))
    .map((t) => String(t._id));
  const provinceIds = managed
    .filter((t) => t.type === 'province')
    .map((t) => String(t._id));
  const operarioTenantIds = crew
    .filter((t) => LOCAL_TYPES.includes(t.type))
    .map((t) => String(t._id));

  const esAdmin = tenantIds.length > 0 || provinceIds.length > 0;

  return {
    isSuperAdmin: false,
    isOperario: !esAdmin && operarioTenantIds.length > 0,
    tenantIds,
    provinceIds,
    operarioTenantIds,
    jurisdictions: mapJuris(managed),
    operarioJurisdictions: mapJuris(crew),
  };
};

const isScopeAdmin = (scope) =>
  !!(scope && (scope.isSuperAdmin || scope.tenantIds.length > 0 || scope.provinceIds.length > 0));

const isScopeOperario = (scope) =>
  !!(scope && scope.isOperario && (scope.operarioTenantIds || []).length > 0);

const isScopeStaff = (scope) => isScopeAdmin(scope) || isScopeOperario(scope);

/**
 * ¿Puede gestionar este marcador?
 * - Super / admin municipal / operario del mismo tenant
 */
const canManageMarker = (scope, marker) => {
  if (!scope) return false;
  if (scope.isSuperAdmin) return true;

  const tenantId = marker?.tenant && (marker.tenant._id || marker.tenant);
  const provinceId = marker?.province && (marker.province._id || marker.province);
  const tenantStr = tenantId ? String(tenantId) : '';
  const provinceStr = provinceId ? String(provinceId) : '';

  if (tenantStr && scope.tenantIds.includes(tenantStr)) return true;
  if (tenantStr && (scope.operarioTenantIds || []).includes(tenantStr)) return true;

  if (scope.provinceIds.length && provinceStr && scope.provinceIds.includes(provinceStr)) {
    return true;
  }

  return false;
};

const buildManagedMarkersFilter = (scope) => {
  if (!scope || scope.isSuperAdmin) return {};

  const localIds = toObjectIds(scope.tenantIds);
  const provinceIds = toObjectIds(scope.provinceIds);
  const operarioIds = toObjectIds(scope.operarioTenantIds);
  const or = [];

  if (localIds.length) {
    or.push({ tenant: { $in: localIds } });
  }
  if (provinceIds.length) {
    or.push({ province: { $in: provinceIds } });
  }
  if (operarioIds.length) {
    or.push({ tenant: { $in: operarioIds } });
  }

  if (!or.length) return { _id: { $exists: false } };
  if (or.length === 1) return or[0];
  return { $or: or };
};

module.exports = {
  findJurisdictionForPoint,
  getAdminScope,
  isScopeAdmin,
  isScopeOperario,
  isScopeStaff,
  canManageMarker,
  buildManagedMarkersFilter,
};
