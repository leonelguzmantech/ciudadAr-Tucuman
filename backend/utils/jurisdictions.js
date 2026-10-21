const Tenant = require('../models/tenant');
const { isAdminUser } = require('./users');

const LOCAL_TYPES = ['municipality', 'commune'];

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

const getAdminScope = async (userId) => {
  if (isAdminUser(userId)) {
    return { isSuperAdmin: true, tenantIds: [], provinceIds: [], jurisdictions: [] };
  }

  const managed = await Tenant.find({ admins: userId, status: 'active' }).select('_id name type');
  return {
    isSuperAdmin: false,
    tenantIds: managed.filter((t) => LOCAL_TYPES.includes(t.type)).map((t) => String(t._id)),
    provinceIds: managed.filter((t) => t.type === 'province').map((t) => String(t._id)),
    jurisdictions: managed.map((t) => ({ id: t._id, name: t.name, type: t.type })),
  };
};

const isScopeAdmin = (scope) =>
  scope.isSuperAdmin || scope.tenantIds.length > 0 || scope.provinceIds.length > 0;

const canManageMarker = (scope, marker) => {
  if (scope.isSuperAdmin) return true;
  const tenantId = marker.tenant && (marker.tenant._id || marker.tenant);
  const provinceId = marker.province && (marker.province._id || marker.province);
  return (
    (!!tenantId && scope.tenantIds.includes(String(tenantId))) ||
    (!!provinceId && scope.provinceIds.includes(String(provinceId)))
  );
};

const buildManagedMarkersFilter = (scope) => {
  if (scope.isSuperAdmin) return {};
  return {
    $or: [{ tenant: { $in: scope.tenantIds } }, { province: { $in: scope.provinceIds } }],
  };
};

module.exports = {
  findJurisdictionForPoint,
  getAdminScope,
  isScopeAdmin,
  canManageMarker,
  buildManagedMarkersFilter,
};
