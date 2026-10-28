const Marker = require('../models/marker');
const { crearNotificacion } = require('./notificaciones');

const TEN_DAYS_MS = 10 * 24 * 60 * 60 * 1000;
const FIFTEEN_DAYS_MS = 15 * 24 * 60 * 60 * 1000;

// Baja lógica: no se borra de la base, solo se marca como eliminado
const marcarEliminado = async (filtro, motivo, eliminadoPor = 'sistema') => {
  await Marker.updateMany(
    { ...filtro, eliminadoAt: null },
    {
      $set: {
        eliminadoAt: new Date(),
        eliminadoPor,
        motivoEliminacion: motivo,
      },
    }
  );
};

const removeExpiredMarkers = async () => {
  // Resueltos y anulados: al registro de inmediato (limpia el mapa)
  await marcarEliminado(
    { status: 'resuelto' },
    'Archivo automático: caso resuelto',
    'sistema'
  );
  await marcarEliminado(
    { status: 'rechazado' },
    'Archivo automático: caso anulado',
    'sistema'
  );

  // Animales y cosas perdidas: 15 días desde la aprobación (no mientras espera aprobación)
  const corte = new Date(Date.now() - FIFTEEN_DAYS_MS);
  const candidatos = await Marker.find({
    eliminadoAt: null,
    category: { $in: ['perros_gatos', 'cosas_perdidas'] },
    status: { $in: ['pendiente', 'en_proceso'] },
    $or: [
      { aprobadoAt: { $ne: null, $lte: corte } },
      { aprobadoAt: null, createdAt: { $lte: corte } },
    ],
  }).select('_id caseId createdBy category aprobadoAt createdAt');

  for (const marker of candidatos) {
    const base = marker.aprobadoAt || marker.createdAt;
    if (!base || new Date(base).getTime() > corte.getTime()) continue;

    const motivo = marker.category === 'perros_gatos'
      ? 'Vencimiento automático: aviso de animales con más de 15 días desde la aprobación'
      : 'Vencimiento automático: aviso de cosas perdidas con más de 15 días desde la aprobación';

    await Marker.updateOne(
      { _id: marker._id, eliminadoAt: null },
      {
        $set: {
          eliminadoAt: new Date(),
          eliminadoPor: 'sistema',
          motivoEliminacion: motivo,
        },
      }
    );

    const caso = marker.caseId ? `#${marker.caseId}` : '';
    const tipoAviso = marker.category === 'perros_gatos' ? 'animales' : 'cosas perdidas';
    await crearNotificacion({
      userId: marker.createdBy,
      markerId: marker._id,
      caseId: marker.caseId,
      tipo: 'vencido',
      mensaje: `Tu publicación de ${tipoAviso} ${caso} venció y pasó al registro. Podés renovarla desde Mis reportes → Registro.`,
    }).catch(() => {});
  }
};

module.exports = {
  removeExpiredMarkers,
  marcarEliminado,
  FIFTEEN_DAYS_MS,
  TEN_DAYS_MS,
};
