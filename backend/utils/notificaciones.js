const Notificacion = require('../models/notificacion');
const { normalizeUserId } = require('./users');

const ESTADO_TEXTO = {
  pendiente_aprobacion: 'Pendiente de aprobación',
  pendiente: 'Pendiente',
  en_proceso: 'En proceso',
  resuelto: 'Resuelto',
};

const crearNotificacion = async ({ userId, markerId, caseId, tipo, mensaje }) => {
  const destinatario = normalizeUserId(userId);
  if (!destinatario || destinatario === 'anonimo') return null;
  return Notificacion.create({
    userId: destinatario,
    markerId: markerId || null,
    caseId: caseId || null,
    tipo,
    mensaje,
  });
};

const avisarCambioEstado = async (marker, estadoAnterior, estadoNuevo) => {
  if (!marker || estadoAnterior === estadoNuevo) return null;
  const destinatario = normalizeUserId(marker.createdBy);
  if (!destinatario || destinatario === 'anonimo') {
    console.warn('No se pudo notificar: el caso no tiene creador válido', marker?._id);
    return null;
  }
  const caso = marker.caseId ? `#${marker.caseId}` : '';
  let tipo = 'estado';
  let mensaje = `Tu caso ${caso} cambió a ${ESTADO_TEXTO[estadoNuevo] || estadoNuevo}.`.replace(/  +/g, ' ').trim();
  if (estadoNuevo === 'pendiente' && estadoAnterior === 'pendiente_aprobacion') {
    tipo = 'aprobado';
    mensaje = `Tu caso ${caso} fue aprobado y ya está publicado.`.replace(/  +/g, ' ').trim();
  }
  try {
    return await crearNotificacion({
      userId: destinatario,
      markerId: marker._id,
      caseId: marker.caseId,
      tipo,
      mensaje,
    });
  } catch (error) {
    console.error('Error creando notificación de estado:', error.message);
    throw error;
  }
};

const avisarOficina = async (marker) => {
  if (!marker) return null;
  const caso = marker.caseId ? `#${marker.caseId}` : '';
  return crearNotificacion({
    userId: marker.createdBy,
    markerId: marker._id,
    caseId: marker.caseId,
    tipo: 'avisado',
    mensaje: `El administrador ya avisó sobre tu caso ${caso}.`.replace('  ', ' ').trim(),
  });
};

module.exports = {
  crearNotificacion,
  avisarCambioEstado,
  avisarOficina,
  ESTADO_TEXTO,
};
