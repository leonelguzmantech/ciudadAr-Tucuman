const Notificacion = require('../models/notificacion');
const Tenant = require('../models/tenant');
const adminsGlobales = require('../config/admins');
const { normalizeUserId } = require('./users');

const ESTADO_TEXTO = {
  pendiente_aprobacion: 'Pendiente de aprobación',
  pendiente: 'Pendiente',
  en_proceso: 'En proceso',
  resuelto: 'Resuelto',
  rechazado: 'Rechazado',
};

const esCosasPerdidas = (marker) => marker?.category === 'cosas_perdidas';

const etiquetaCategoria = (marker) => {
  if (esCosasPerdidas(marker)) return 'cosas perdidas';
  if (marker?.category === 'reparaciones') return 'reparación';
  if (marker?.category === 'perros_gatos') return 'animales';
  if (marker?.category === 'familias' || marker?.category === 'persona') return 'familias';
  return 'reporte';
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

const listarAdminsDelCaso = async (marker) => {
  const emails = new Set(
    (adminsGlobales || []).map((e) => normalizeUserId(e)).filter((e) => e && e !== 'anonimo')
  );
  const ids = [marker?.tenant, marker?.province]
    .map((id) => (id && id._id ? id._id : id))
    .filter(Boolean);
  if (ids.length) {
    const tenants = await Tenant.find({ _id: { $in: ids }, status: 'active' }).select('admins');
    tenants.forEach((t) => {
      (t.admins || []).forEach((email) => {
        const n = normalizeUserId(email);
        if (n && n !== 'anonimo') emails.add(n);
      });
    });
  }
  return [...emails];
};

const avisarAdminsPorAprobar = async (marker) => {
  if (!marker || marker.status !== 'pendiente_aprobacion') return [];
  const categoria = etiquetaCategoria(marker);
  const caso = marker.caseId ? `#${marker.caseId}` : '';
  const admins = await listarAdminsDelCaso(marker);
  const creador = normalizeUserId(marker.createdBy);
  const mensaje = esCosasPerdidas(marker)
    ? `Nuevo aviso de cosas perdidas ${caso} esperando aprobación.`
    : `Nuevo reporte (${categoria}) ${caso} esperando aprobación.`;
  const creadas = [];
  for (const admin of admins) {
    if (admin === creador) continue;
    try {
      const n = await crearNotificacion({
        userId: admin,
        markerId: marker._id,
        caseId: marker.caseId,
        tipo: 'por_aprobar',
        mensaje: mensaje.replace(/  +/g, ' ').trim(),
      });
      if (n) creadas.push(n);
    } catch (error) {
      console.error('Error notificando admin por aprobar:', error.message);
    }
  }
  return creadas;
};

const avisarAdminsCasoAprobado = async (marker) => {
  if (!marker) return [];
  const caso = marker.caseId ? `#${marker.caseId}` : '';
  const perdida = esCosasPerdidas(marker);
  const tipo = perdida ? 'nueva_perdida' : 'nuevo_reporte';
  const mensaje = perdida
    ? `Caso ${caso} de cosas perdidas aprobado. Revisalo en Cosas perdidas.`
    : `Caso ${caso} aprobado. Revisalo en Reportes.`;
  const admins = await listarAdminsDelCaso(marker);
  const creadas = [];
  for (const admin of admins) {
    try {
      const n = await crearNotificacion({
        userId: admin,
        markerId: marker._id,
        caseId: marker.caseId,
        tipo,
        mensaje: mensaje.replace(/  +/g, ' ').trim(),
      });
      if (n) creadas.push(n);
    } catch (error) {
      console.error('Error notificando admin caso aprobado:', error.message);
    }
  }
  return creadas;
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
  if (estadoNuevo === 'en_proceso') {
    mensaje = `Tu caso ${caso} está en proceso: el municipio ya lo está atendiendo.`.replace(/  +/g, ' ').trim();
  }
  if (estadoNuevo === 'rechazado') {
    tipo = 'rechazado';
    mensaje = `Tu caso ${caso} no fue aprobado / fue anulado por un administrador.`.replace(/  +/g, ' ').trim();
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

const avisarRechazo = async (marker, motivo = '') => {
  if (!marker) return null;
  const caso = marker.caseId ? `#${marker.caseId}` : '';
  const detalle = String(motivo || '').trim();
  const mensaje = detalle
    ? `Tu caso ${caso} no fue aprobado. Motivo: ${detalle}`
    : `Tu caso ${caso} no fue aprobado / fue anulado porque no corresponde publicarlo.`;
  return crearNotificacion({
    userId: marker.createdBy,
    markerId: marker._id,
    caseId: marker.caseId,
    tipo: 'rechazado',
    mensaje: mensaje.replace(/  +/g, ' ').trim(),
  });
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

/** Notifica a quien publicó y a quienes reclamaron (p. ej. cierre / registro). */
const avisarPartesCaso = async (marker, mensaje, tipo = 'estado', excluirUserId = null) => {
  if (!marker || !mensaje) return [];
  const destinatarios = new Set();
  destinatarios.add(normalizeUserId(marker.createdBy));
  (marker.claims || []).forEach((claim) => destinatarios.add(normalizeUserId(claim.userId)));
  if (excluirUserId) destinatarios.delete(normalizeUserId(excluirUserId));
  destinatarios.delete('anonimo');
  destinatarios.delete('');
  const creadas = [];
  for (const userId of destinatarios) {
    try {
      const n = await crearNotificacion({
        userId,
        markerId: marker._id,
        caseId: marker.caseId,
        tipo,
        mensaje: String(mensaje).replace(/  +/g, ' ').trim(),
      });
      if (n) creadas.push(n);
    } catch (error) {
      console.error('Error notificando parte del caso:', error.message);
    }
  }
  return creadas;
};

module.exports = {
  crearNotificacion,
  avisarCambioEstado,
  avisarRechazo,
  avisarOficina,
  avisarAdminsPorAprobar,
  avisarAdminsCasoAprobado,
  avisarPartesCaso,
  listarAdminsDelCaso,
  ESTADO_TEXTO,
};
