const Notificacion = require('../models/notificacion');
const Tenant = require('../models/tenant');
const Usuario = require('../models/usuario');
const adminsGlobales = require('../config/admins');
const { normalizeUserId } = require('./users');

const RADIO_CERCA_DEFAULT_M = 2500;
const MAX_AVISOS_CERCA = 80;

const distanciaMetros = (lat1, lng1, lat2, lng2) => {
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2
    + Math.cos((lat1 * Math.PI) / 180)
      * Math.cos((lat2 * Math.PI) / 180)
      * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const ESTADO_TEXTO = {
  pendiente_aprobacion: 'en revisión',
  pendiente: 'publicado / pendiente de atención',
  en_proceso: 'el municipio lo está atendiendo',
  pendiente_cierre: 'cierre propuesto, esperando confirmación del municipio',
  resuelto: 'resuelto',
  rechazado: 'anulado',
};

/** Texto amigable para el vecino (UI / notifs) */
const etiquetaEstadoVecino = (status) => ESTADO_TEXTO[status] || status;

const esCosasPerdidas = (marker) => marker?.category === 'cosas_perdidas';

const etiquetaCategoria = (marker) => {
  if (esCosasPerdidas(marker)) return 'cosas perdidas';
  if (marker?.category === 'reparaciones') return 'reparación';
  if (marker?.category === 'perros_gatos') return 'animales';
  if (marker?.category === 'familias' || marker?.category === 'persona') return 'familias';
  return 'reporte';
};

const tenantIdDeMarker = (marker) => {
  const t = marker?.tenant;
  if (!t) return null;
  return t._id || t;
};

const nombreJurisdiccionMarker = (marker) => {
  const t = marker?.tenant;
  if (t && typeof t === 'object' && t.name) return String(t.name).trim();
  return '';
};

const crearNotificacion = async ({ userId, markerId, caseId, tenantId, tipo, mensaje }) => {
  const destinatario = normalizeUserId(userId);
  if (!destinatario || destinatario === 'anonimo') return null;
  return Notificacion.create({
    userId: destinatario,
    markerId: markerId || null,
    caseId: caseId || null,
    tenantId: tenantId || null,
    tipo,
    mensaje,
  });
};

/**
 * Admins del municipio/comuna del caso.
 * Por defecto no notifica a ADMIN_USERS globales (el super usa el badge del panel).
 * Si no hay admin de jurisdicción, cae a los globales para que alguien lo vea.
 */
const listarAdminsDelCaso = async (marker, { soloJurisdiccion = true } = {}) => {
  const emails = new Set();
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
  if (!soloJurisdiccion || emails.size === 0) {
    (adminsGlobales || []).forEach((email) => {
      const n = normalizeUserId(email);
      if (n && n !== 'anonimo') emails.add(n);
    });
  }
  return [...emails];
};

/** Operarios (cuadrilla) del municipio/comuna del caso */
const listarOperariosDelCaso = async (marker) => {
  const emails = new Set();
  const id = marker?.tenant && (marker.tenant._id || marker.tenant);
  if (!id) return [];
  const tenant = await Tenant.findById(id).select('operarios type');
  if (!tenant || !['municipality', 'commune'].includes(tenant.type)) return [];
  (tenant.operarios || []).forEach((email) => {
    const n = normalizeUserId(email);
    if (n && n !== 'anonimo') emails.add(n);
  });
  return [...emails];
};

const avisarOperariosDelCaso = async (marker, mensaje, tipo = 'cuadrilla', excluirUserId = null) => {
  if (!marker || !mensaje) return [];
  const operarios = await listarOperariosDelCaso(marker);
  const excluir = normalizeUserId(excluirUserId);
  const tenantId = tenantIdDeMarker(marker);
  const creadas = [];
  for (const userId of operarios) {
    if (excluir && userId === excluir) continue;
    try {
      const n = await crearNotificacion({
        userId,
        markerId: marker._id,
        caseId: marker.caseId,
        tenantId,
        tipo,
        mensaje: String(mensaje).replace(/  +/g, ' ').trim(),
      });
      if (n) creadas.push(n);
    } catch (error) {
      console.error('Error notificando operario:', error.message);
    }
  }
  return creadas;
};

const avisarAdminsPorAprobar = async (marker) => {
  if (!marker || marker.status !== 'pendiente_aprobacion') return [];
  const categoria = etiquetaCategoria(marker);
  const caso = marker.caseId ? `#${marker.caseId}` : '';
  const lugar = nombreJurisdiccionMarker(marker);
  const admins = await listarAdminsDelCaso(marker, { soloJurisdiccion: true });
  const creador = normalizeUserId(marker.createdBy);
  const base = esCosasPerdidas(marker)
    ? `Nuevo aviso de cosas perdidas ${caso} esperando aprobación`
    : `Nuevo reporte (${categoria}) ${caso} esperando aprobación`;
  const mensaje = `${base}${lugar ? ` · ${lugar}` : ''}.`;
  const tenantId = tenantIdDeMarker(marker);
  const creadas = [];
  for (const admin of admins) {
    if (admin === creador) continue;
    try {
      const n = await crearNotificacion({
        userId: admin,
        markerId: marker._id,
        caseId: marker.caseId,
        tenantId,
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
  const lugar = nombreJurisdiccionMarker(marker);
  const perdida = esCosasPerdidas(marker);
  const tipo = perdida ? 'nueva_perdida' : 'nuevo_reporte';
  const base = perdida
    ? `Caso ${caso} de cosas perdidas aprobado. Revisalo en Cosas perdidas`
    : `Caso ${caso} aprobado. Revisalo en Reportes`;
  const mensaje = `${base}${lugar ? ` · ${lugar}` : ''}.`;
  const admins = await listarAdminsDelCaso(marker, { soloJurisdiccion: true });
  const tenantId = tenantIdDeMarker(marker);
  const creadas = [];
  for (const admin of admins) {
    try {
      const n = await crearNotificacion({
        userId: admin,
        markerId: marker._id,
        caseId: marker.caseId,
        tenantId,
        tipo,
        mensaje: mensaje.replace(/  +/g, ' ').trim(),
      });
      if (n) creadas.push(n);
    } catch (error) {
      console.error('Error notificando admin caso aprobado:', error.message);
    }
  }
  // Cuadrilla: solo reparaciones urbanas
  if (marker.category === 'reparaciones') {
    const msgCuadrilla = `Caso ${caso} publicado: disponible para la cuadrilla${lugar ? ` · ${lugar}` : ''}.`;
    await avisarOperariosDelCaso(marker, msgCuadrilla, 'nuevo_reporte');
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
  let mensaje = `Tu caso ${caso}: ${etiquetaEstadoVecino(estadoNuevo)}.`.replace(/  +/g, ' ').trim();
  if (estadoNuevo === 'pendiente' && estadoAnterior === 'pendiente_aprobacion') {
    tipo = 'aprobado';
    const esFamilia = marker.category === 'familias' || marker.category === 'persona';
    mensaje = esFamilia
      ? `Tu caso ${caso} fue aceptado. No se publica en el mapa de vecinos: el administrador lo gestiona con la oficina. Cuando avise, lo vas a ver en tu aviso.`
      : `Tu caso ${caso} fue aprobado y ya está publicado.`;
    mensaje = mensaje.replace(/  +/g, ' ').trim();
  }
  if (estadoNuevo === 'en_proceso') {
    mensaje = `Tu caso ${caso}: el municipio lo está atendiendo.`.replace(/  +/g, ' ').trim();
  }
  if (estadoNuevo === 'pendiente_cierre') {
    mensaje = `Tu caso ${caso}: la cuadrilla propuso el cierre. El municipio está confirmando la reparación.`
      .replace(/  +/g, ' ')
      .trim();
  }
  if (estadoNuevo === 'resuelto') {
    mensaje = `Tu caso ${caso} fue resuelto.`.replace(/  +/g, ' ').trim();
  }
  if (estadoNuevo === 'rechazado') {
    tipo = 'rechazado';
    mensaje = `Tu caso ${caso} no fue aprobado / fue anulado.`.replace(/  +/g, ' ').trim();
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

const avisarRechazo = async (marker, motivo = '', { eraPorAprobar = false } = {}) => {
  if (!marker) return null;
  const caso = marker.caseId ? `#${marker.caseId}` : '';
  const detalle = String(motivo || '').trim()
    || String(marker.motivoEliminacion || '').replace(/^Anulado:\s*/i, '').trim();
  const accion = eraPorAprobar ? 'no fue aprobado' : 'fue anulado';
  const mensaje = detalle
    ? `Tu caso ${caso} ${accion}. Motivo: ${detalle}`
    : `Tu caso ${caso} ${accion}.`;
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
  const esFamilia = marker.category === 'familias' || marker.category === 'persona';
  const mensaje = esFamilia
    ? `El administrador ya avisó a la oficina sobre tu caso ${caso}. Quedó registrado en el sistema.`
    : `El administrador ya avisó sobre tu caso ${caso}.`;
  return crearNotificacion({
    userId: marker.createdBy,
    markerId: marker._id,
    caseId: marker.caseId,
    tipo: 'avisado',
    mensaje: mensaje.replace(/  +/g, ' ').trim(),
  });
};

/** Emails de admin / cuadrilla: no reciben avisos de Radar (“perdido cerca”). */
const listarEmailsStaff = async () => {
  const set = new Set(
    (Array.isArray(adminsGlobales) ? adminsGlobales : []).map((e) => normalizeUserId(e)).filter(Boolean)
  );
  const tenants = await Tenant.find({ status: 'active' }).select('operarios admins');
  tenants.forEach((t) => {
    (t.operarios || []).forEach((e) => {
      const email = normalizeUserId(e);
      if (email) set.add(email);
    });
    (t.admins || []).forEach((e) => {
      const email = normalizeUserId(e);
      if (email) set.add(email);
    });
  });
  return set;
};

/**
 * Avisa a vecinos cerca del PIN del caso (no de la casa del que publica).
 * Usa última GPS y/o zona de alerta elegida en el mapa ("otra parte").
 * No notifica a admin ni cuadrilla (solo vecinos).
 */
const avisarVecinosCercanos = async (marker, { radioMetros = RADIO_CERCA_DEFAULT_M } = {}) => {
  if (!marker) return [];
  const cat = marker.category;
  if (cat !== 'cosas_perdidas' && cat !== 'perros_gatos') return [];
  if (!['pendiente', 'en_proceso'].includes(marker.status)) return [];
  const lat = Number(marker.lat);
  const lng = Number(marker.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];

  const radio = Math.min(8000, Math.max(500, Number(radioMetros) || RADIO_CERCA_DEFAULT_M));
  const deltaLat = radio / 111320;
  const deltaLng = radio / (111320 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)));

  const [usuarios, staffEmails] = await Promise.all([
    Usuario.find({
      $or: [
        {
          ultimaLat: { $gte: lat - deltaLat, $lte: lat + deltaLat },
          ultimaLng: { $gte: lng - deltaLng, $lte: lng + deltaLng },
        },
        {
          zonaAlertaLat: { $gte: lat - (8000 / 111320), $lte: lat + (8000 / 111320) },
          zonaAlertaLng: { $ne: null },
        },
      ],
    }).select('email ultimaLat ultimaLng zonaAlertaLat zonaAlertaLng zonaAlertaRadio'),
    listarEmailsStaff(),
  ]);

  const creador = normalizeUserId(marker.createdBy);
  const caso = marker.caseId ? `#${marker.caseId}` : '';
  const lugar = nombreJurisdiccionMarker(marker);
  let que = 'un aviso cerca de vos';
  if (cat === 'cosas_perdidas') {
    const tipo = String(marker.perdidaTipo || '');
    que = tipo === 'encontre'
      ? 'algo encontrado cerca de vos'
      : 'algo perdido cerca de vos';
    if (marker.objeto) que = `${que}: ${String(marker.objeto).slice(0, 60)}`;
  } else {
    const animal = String(marker.animalTipo || '');
    que = animal === 'perdido'
      ? 'un animal perdido cerca de vos'
      : (animal === 'adopcion'
        ? 'un aviso de adopción cerca de vos'
        : 'un animal cerca de vos');
  }
  const mensaje = `Hay ${que}${caso ? ` · caso ${caso}` : ''}${lugar ? ` · ${lugar}` : ''}.`
    .replace(/  +/g, ' ')
    .trim();

  const tenantId = tenantIdDeMarker(marker);
  const creadas = [];
  const yaAvisados = new Set();

  for (const u of usuarios) {
    const email = normalizeUserId(u.email);
    if (!email || email === 'anonimo' || email === creador || yaAvisados.has(email)) continue;
    // Cuadrilla / admin no son “vecinos” del Radar
    if (staffEmails.has(email)) continue;

    let cerca = false;
    if (Number.isFinite(u.ultimaLat) && Number.isFinite(u.ultimaLng)) {
      cerca = distanciaMetros(lat, lng, u.ultimaLat, u.ultimaLng) <= radio;
    }
    if (!cerca && Number.isFinite(u.zonaAlertaLat) && Number.isFinite(u.zonaAlertaLng)) {
      const radioZona = Math.min(8000, Math.max(500, Number(u.zonaAlertaRadio) || radio));
      cerca = distanciaMetros(lat, lng, u.zonaAlertaLat, u.zonaAlertaLng) <= radioZona;
    }
    if (!cerca) continue;

    yaAvisados.add(email);
    try {
      const n = await crearNotificacion({
        userId: email,
        markerId: marker._id,
        caseId: marker.caseId,
        tenantId,
        tipo: 'cerca',
        mensaje,
      });
      if (n) {
        creadas.push(n);
        if (creadas.length >= MAX_AVISOS_CERCA) break;
      }
    } catch (error) {
      console.error('Error notificando vecino cerca:', error.message);
    }
  }
  return creadas;
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
  avisarVecinosCercanos,
  avisarPartesCaso,
  listarAdminsDelCaso,
  listarOperariosDelCaso,
  avisarOperariosDelCaso,
  RADIO_CERCA_DEFAULT_M,
  ESTADO_TEXTO,
  etiquetaEstadoVecino,
};
