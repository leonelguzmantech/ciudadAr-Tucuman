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
  !!(scope && (scope.isSuperAdmin || scope.tenantIds.length > 0 || scope.provinceIds.length > 0));

/**
 * ¿Puede gestionar este marcador?
 * - Super admin: sí
 * - Admin de municipio/comuna: solo si el caso pertenece a ese tenant local
 * - Admin de provincia: si el caso está en esa provincia (o en un tenant que administra)
 */
const canManageMarker = (scope, marker) => {
  if (!scope) return false;
  if (scope.isSuperAdmin) return true;

  const tenantId = marker?.tenant && (marker.tenant._id || marker.tenant);
  const provinceId = marker?.province && (marker.province._id || marker.province);
  const tenantStr = tenantId ? String(tenantId) : '';
  const provinceStr = provinceId ? String(provinceId) : '';

  if (tenantStr && scope.tenantIds.includes(tenantStr)) return true;

  // Solo los admins de provincia amplían por province.
  // Un admin solo de municipio NO debe ver casos de otros municipios
  // aunque compartan la misma provincia.
  if (scope.provinceIds.length && provinceStr && scope.provinceIds.includes(provinceStr)) {
    return true;
  }

  return false;
};

/**
 * Filtro Mongo para listados/stats del dashboard admin.
 * Nunca usa `$in: []` (evita comportamientos raros) y no abre el alcance
 * de un admin municipal a toda la provincia.
 */
const buildManagedMarkersFilter = (scope) => {
  if (!scope || scope.isSuperAdmin) return {};

  const localIds = toObjectIds(scope.tenantIds);
  const provinceIds = toObjectIds(scope.provinceIds);
  const or = [];

  if (localIds.length) {
    or.push({ tenant: { $in: localIds } });
  }
  if (provinceIds.length) {
    or.push({ province: { $in: provinceIds } });
  }

  // Admin sin jurisdicciones asignadas: no ve nada
  if (!or.length) return { _id: { $exists: false } };
  if (or.length === 1) return or[0];
  return { $or: or };
};

module.exports = {
  findJurisdictionForPoint,
  getAdminScope,
  isScopeAdmin,
  canManageMarker,
  buildManagedMarkersFilter,
};
