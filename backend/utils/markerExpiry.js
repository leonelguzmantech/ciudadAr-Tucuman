const Marker = require('../models/marker');

const TEN_DAYS_MS = 10 * 24 * 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

const removeExpiredMarkers = async () => {
  const now = Date.now();
  await Marker.deleteMany({
    status: 'resuelto',
    resolvedAt: { $lte: new Date(now - TEN_DAYS_MS) },
  });
  await Marker.deleteMany({
    category: 'perros_gatos',
    status: { $ne: 'resuelto' },
    createdAt: { $lte: new Date(now - THIRTY_DAYS_MS) },
  });
};

module.exports = { removeExpiredMarkers };
