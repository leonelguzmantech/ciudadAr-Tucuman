const express = require('express');
const crypto = require('crypto');
const multer = require('multer');
const Usuario = require('../models/usuario');
const Tenant = require('../models/tenant');
const adminsGlobales = require('../config/admins');
const { normalizeUserId } = require('../utils/users');
const { getAdminScope, isScopeAdmin, isScopeOperario } = require('../utils/jurisdictions');
const { crearNotificacion } = require('../utils/notificaciones');

const router = express.Router();
const uploadDni = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 6 * 1024 * 1024, files: 2 },
});

/** En desarrollo se puede devolver el código en la respuesta (sin SMS real). */
const OTP_DEMO = process.env.OTP_DEMO !== '0';
const OTP_MINUTOS = 10;
const OTP_COOLDOWN_SEG = 45;

const MUNICIPIO_PENDIENTE_ID = '__pendiente__';

/** Admins del municipio activo; si no hay o no está activo, cae a admins globales (super). */
const listarEmailsAdminDeTenant = async (tenantId) => {
  const emails = new Set();
  if (tenantId) {
    const tenant = await Tenant.findOne({
      _id: tenantId,
      status: 'active',
      type: { $in: ['municipality', 'commune'] },
    }).select('admins');
    (tenant?.admins || []).forEach((email) => {
      const n = normalizeUserId(email);
      if (n && n !== 'anonimo') emails.add(n);
    });
  }
  if (emails.size === 0) {
    (adminsGlobales || []).forEach((email) => {
      const n = normalizeUserId(email);
      if (n && n !== 'anonimo') emails.add(n);
    });
  }
  return [...emails];
};

/** Tenant IDs que puede ver/atender este admin en Soporte. */
const tenantIdsSoporteDelScope = async (scope) => {
  if (!scope || scope.isSuperAdmin) return null; // null = todos
  const ids = new Set((scope.tenantIds || []).map(String));
  if ((scope.provinceIds || []).length) {
    const hijos = await Tenant.find({
      parent: { $in: scope.provinceIds },
      type: { $in: ['municipality', 'commune'] },
      status: 'active',
    }).select('_id');
    hijos.forEach((t) => ids.add(String(t._id)));
  }
  return [...ids];
};

const adminPuedeAtenderSoporte = async (scope, soporteTenantId) => {
  if (!scope) return false;
  if (scope.isSuperAdmin) return true;
  // Sin municipio activo: solo el super
  if (!soporteTenantId) return false;
  const permitidos = await tenantIdsSoporteDelScope(scope);
  return (permitidos || []).includes(String(soporteTenantId));
};

/** Vecino gestionable por jurisdicción de residencia (o soporte). Pendiente → solo super. */
const adminPuedeGestionarVecino = async (scope, usuario) => {
  if (!scope || !usuario) return false;
  if (scope.isSuperAdmin) return true;
  const tid = usuario.municipioTenantId || usuario.soporteTenantId;
  if (!tid) return false;
  const permitidos = await tenantIdsSoporteDelScope(scope);
  return (permitidos || []).includes(String(tid));
};

const resumenUsuarioAdmin = (u) => {
  const dniFotosCargadas = !!(u.dniFotosAt || (u.dniFotoFrente && u.dniFotoDorso));
  const emailEnc = encodeURIComponent(u.email || '');
  return {
    email: u.email,
    nombre: u.nombre || '',
    dni: u.dni || '',
    telefono: u.telefono || '',
    telefonoConfirmado: !!u.telefonoConfirmado,
    proveedor: u.proveedor || 'correo',
    municipioTenantId: u.municipioTenantId ? String(u.municipioTenantId) : '',
    municipioNombre: u.municipioNombre || '',
    municipioPendiente: !!u.municipioPendiente,
    activo: u.activo !== false,
    desactivadoAt: u.desactivadoAt || null,
    desactivadoPor: u.desactivadoPor || '',
    desactivadoNota: u.desactivadoNota || '',
    soporteEstado: u.soporteEstado || '',
    soporteMensaje: u.soporteMensaje || '',
    soporteAt: u.soporteAt || null,
    dniFotosCargadas,
    dniFotoFrenteUrl: dniFotosCargadas
      ? `/api/usuarios/admin/usuarios/${emailEnc}/dni/frente`
      : '',
    dniFotoDorsoUrl: dniFotosCargadas
      ? `/api/usuarios/admin/usuarios/${emailEnc}/dni/dorso`
      : '',
    createdAt: u.createdAt || null,
    updatedAt: u.updatedAt || null,
  };
};

/** Activo o pendiente de activación (aún sin operación local). */
const resolverMunicipioLocal = async (tenantId) => {
  const id = String(tenantId || '').trim();
  if (!id || id === MUNICIPIO_PENDIENTE_ID) return null;
  return Tenant.findOne({
    _id: id,
    type: { $in: ['municipality', 'commune'] },
    status: { $in: ['active', 'pending'] },
  }).select('_id name status');
};

const aplicarMunicipioEnCambios = async (rawTenantId, cambios) => {
  const id = String(rawTenantId || '').trim();
  if (!id) {
    return { ok: false, message: 'Elegí tu municipio o comuna.' };
  }
  if (id === MUNICIPIO_PENDIENTE_ID) {
    cambios.municipioTenantId = null;
    cambios.municipioNombre = 'Aún no activo en CiudadAr';
    cambios.municipioPendiente = true;
    return { ok: true, pendiente: true, tenant: null };
  }
  const municipio = await resolverMunicipioLocal(id);
  if (!municipio) {
    return { ok: false, message: 'Elegí un municipio o comuna válido.' };
  }
  cambios.municipioTenantId = municipio._id;
  cambios.municipioNombre = municipio.name || '';
  cambios.municipioPendiente = municipio.status !== 'active';
  return { ok: true, pendiente: municipio.status !== 'active', tenant: municipio };
};

const requireAdmin = async (req, res, next) => {
  try {
    const email = normalizeUserId(req.headers['x-user-id'] || '');
    if (!email || email === 'anonimo') {
      return res.status(401).json({ message: 'Falta el correo de la cuenta' });
    }
    const scope = await getAdminScope(email);
    if (!isScopeAdmin(scope)) {
      return res.status(403).json({ message: 'Solo administradores' });
    }
    req.requester = email;
    req.adminScope = scope;
    return next();
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const telefonoValido = (valor) => {
  const digitos = String(valor || '').replace(/\D/g, '');
  return digitos.length >= 8 && digitos.length <= 15;
};

/** DNI argentino: 7 u 8 dígitos */
const normalizarDni = (valor) => String(valor || '').replace(/\D/g, '');
const dniValido = (valor) => {
  const digitos = normalizarDni(valor);
  return digitos.length >= 7 && digitos.length <= 8;
};

const tieneFotoDni = (foto) => !!(foto && foto.data && foto.contentType);

const hashOtp = (codigo, email) => crypto
  .createHash('sha256')
  .update(`${codigo}:${String(email || '').toLowerCase()}`)
  .digest('hex');

const datosPublicos = (usuario) => {
  const dniFotosCargadas = tieneFotoDni(usuario.dniFotoFrente)
    && tieneFotoDni(usuario.dniFotoDorso);
  return {
    email: usuario.email,
    nombre: usuario.nombre || '',
    nombreFijo: Boolean(usuario.nombre),
    dni: usuario.dni || '',
    telefono: usuario.telefono || '',
    telefonoConfirmado: !!usuario.telefonoConfirmado,
    proveedor: usuario.proveedor,
    dniFotosCargadas,
    perfilCompleto: Boolean(
      usuario.nombre
      && usuario.dni
      && usuario.telefono
      && (usuario.municipioTenantId || usuario.municipioPendiente)
      && dniFotosCargadas
    ),
    municipioTenantId: usuario.municipioTenantId
      ? String(usuario.municipioTenantId)
      : (usuario.municipioPendiente ? MUNICIPIO_PENDIENTE_ID : ''),
    municipioNombre: usuario.municipioNombre || '',
    municipioPendiente: !!usuario.municipioPendiente,
    activo: usuario.activo !== false,
    desactivadoAt: usuario.desactivadoAt || null,
    desactivadoNota: usuario.desactivadoNota || '',
    soporteEstado: usuario.soporteEstado || '',
    soporteCampo: usuario.soporteCampo || '',
    soporteMensaje: usuario.soporteMensaje || '',
    soporteTenantId: usuario.soporteTenantId ? String(usuario.soporteTenantId) : '',
    soporteTenantName: usuario.soporteTenantName || '',
    soporteAt: usuario.soporteAt || null,
    soporteNotaAdmin: usuario.soporteNotaAdmin || '',
    ultimaLat: usuario.ultimaLat,
    ultimaLng: usuario.ultimaLng,
    ubicacionAt: usuario.ubicacionAt,
    zonaAlertaLat: usuario.zonaAlertaLat,
    zonaAlertaLng: usuario.zonaAlertaLng,
    zonaAlertaRadio: usuario.zonaAlertaRadio || 2500,
    zonaAlertaAt: usuario.zonaAlertaAt,
  };
};

const coordValida = (lat, lng) => (
  Number.isFinite(lat) && Number.isFinite(lng)
  && lat >= -90 && lat <= 90
  && lng >= -180 && lng <= 180
);

router.get('/me', async (req, res) => {
  try {
    const email = normalizeUserId(req.headers['x-user-id'] || '');
    if (!email || email === 'anonimo') {
      return res.status(401).json({ message: 'Falta el correo de la cuenta' });
    }
    const usuario = await Usuario.findOne({ email });
    if (!usuario) {
      return res.status(404).json({ message: 'No hay una cuenta registrada con ese correo.' });
    }
    if (usuario.activo === false) {
      return res.status(403).json({
        code: 'CUENTA_DESACTIVADA',
        message: 'Tu cuenta fue desactivada por el municipio. Si creés que es un error, contactá soporte.',
      });
    }
    res.json(datosPublicos(usuario));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/correo/:email', async (req, res) => {
  try {
    const email = normalizeUserId(req.params.email);
    const usuario = await Usuario.findOne({ email }).select('email proveedor');
    if (!usuario) {
      return res.status(404).json({ message: 'No hay una cuenta registrada con ese correo.' });
    }
    res.json({ email: usuario.email, proveedor: usuario.proveedor });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const email = normalizeUserId(req.body.email);
    if (!email || email === 'anonimo' || !email.includes('@')) {
      return res.status(400).json({ message: 'El correo no es válido' });
    }
    const telefono = String(req.body.telefono || '').trim();
    if (telefono && !telefonoValido(telefono)) {
      return res.status(400).json({ message: 'El celular no es válido' });
    }
    const proveedor = req.body.proveedor === 'google' ? 'google' : 'correo';
    const nombre = String(req.body.nombre || '').trim();
    const dni = normalizarDni(req.body.dni);
    const municipioTenantId = String(req.body.municipioTenantId || req.body.tenantId || '').trim();
    if (dni && !dniValido(dni)) {
      return res.status(400).json({ message: 'El DNI debe tener 7 u 8 números' });
    }
    const existente = await Usuario.findOne({ email });
    const cambios = {};
    let municipioResuelto = null;
    if (municipioTenantId) {
      municipioResuelto = await aplicarMunicipioEnCambios(municipioTenantId, cambios);
      if (!municipioResuelto.ok) {
        return res.status(400).json({ message: municipioResuelto.message });
      }
    }
    // Alta nueva por correo: identidad completa (anti spam / cuentas falsas)
    if (!existente && proveedor === 'correo') {
      if (!nombre || nombre.length < 3) {
        return res.status(400).json({ message: 'Escribí tu nombre y apellido' });
      }
      if (!dniValido(dni)) {
        return res.status(400).json({ message: 'El DNI es obligatorio (7 u 8 números)' });
      }
      if (!telefonoValido(telefono)) {
        return res.status(400).json({ message: 'El celular es obligatorio' });
      }
      if (!municipioResuelto?.ok) {
        return res.status(400).json({ message: 'Elegí tu municipio o comuna.' });
      }
      const dniUsado = await Usuario.findOne({ dni });
      if (dniUsado) {
        return res.status(409).json({ message: 'Ese DNI ya está registrado en otra cuenta' });
      }
    }

    if (existente?.nombre) {
      if (nombre && nombre !== existente.nombre) {
        return res.status(400).json({
          message: 'El nombre no se puede cambiar. Pedí soporte en Mi perfil si te equivocaste.',
        });
      }
    } else if (nombre) {
      cambios.nombre = nombre;
    }
    if (telefono) {
      cambios.telefono = telefono;
      // Nuevo número o alta: hay que confirmar por código
      if (!existente || existente.telefono !== telefono) {
        cambios.telefonoConfirmado = false;
        cambios.telefonoConfirmadoAt = null;
        cambios.telefonoCodigoHash = '';
        cambios.telefonoCodigoExpira = null;
      }
    }
    if (dni) {
      if (!existente?.dni || existente.dni === dni) {
        cambios.dni = dni;
      } else if (existente.dni !== dni) {
        // No permitir cambiar DNI una vez cargado
        return res.status(400).json({ message: 'El DNI ya está cargado y no se puede cambiar' });
      }
      if (!existente?.dni) {
        const dniUsado = await Usuario.findOne({ dni, email: { $ne: email } });
        if (dniUsado) {
          return res.status(409).json({ message: 'Ese DNI ya está registrado en otra cuenta' });
        }
      }
    }
    if (municipioResuelto?.ok && (existente?.municipioTenantId || existente?.municipioPendiente)) {
      const mismoPendiente = existente.municipioPendiente && municipioResuelto.pendiente && !municipioResuelto.tenant;
      const mismoTenant = existente.municipioTenantId
        && municipioResuelto.tenant
        && String(existente.municipioTenantId) === String(municipioResuelto.tenant._id);
      if (!mismoPendiente && !mismoTenant) {
        return res.status(400).json({
          message: 'El municipio no se puede cambiar. Pedí soporte en Mi perfil si te equivocaste.',
        });
      }
      delete cambios.municipioTenantId;
      delete cambios.municipioNombre;
      delete cambios.municipioPendiente;
    }
    const actualizacion = { $setOnInsert: { email, proveedor } };
    if (Object.keys(cambios).length) actualizacion.$set = cambios;
    const usuario = await Usuario.findOneAndUpdate(
      { email },
      actualizacion,
      { new: true, upsert: true, runValidators: true }
    );
    res.status(existente ? 200 : 201).json(datosPublicos(usuario));
  } catch (error) {
    if (error?.code === 11000 && String(error.message || '').includes('dni')) {
      return res.status(409).json({ message: 'Ese DNI ya está registrado en otra cuenta' });
    }
    res.status(400).json({ message: error.message });
  }
});

router.patch('/me', async (req, res) => {
  try {
    const email = normalizeUserId(req.headers['x-user-id'] || '');
    if (!email || email === 'anonimo') {
      return res.status(401).json({ message: 'Falta el correo de la cuenta' });
    }

    const existente = await Usuario.findOne({ email });
    if (!existente) {
      return res.status(404).json({ message: 'No hay una cuenta registrada con ese correo.' });
    }

    const scope = await getAdminScope(email);
    const esStaff = isScopeAdmin(scope) || isScopeOperario(scope);

    const nombre = String(req.body.nombre || '').trim();
    const telefono = String(req.body.telefono || '').trim();
    const dni = normalizarDni(req.body.dni);
    const municipioTenantId = String(req.body.municipioTenantId || req.body.tenantId || '').trim();

    if (telefono && !telefonoValido(telefono)) {
      return res.status(400).json({ message: 'Escribí un celular válido.' });
    }
    if (!esStaff && !telefonoValido(telefono)) {
      return res.status(400).json({ message: 'Escribí un celular válido.' });
    }

    const cambios = {};
    if (telefono) {
      cambios.telefono = telefono;
      if (existente.telefono !== telefono) {
        cambios.telefonoConfirmado = false;
        cambios.telefonoConfirmadoAt = null;
        cambios.telefonoCodigoHash = '';
        cambios.telefonoCodigoExpira = null;
      }
    } else if (esStaff) {
      cambios.telefono = '';
    }

    if (esStaff) {
      // Cuenta de trabajo: el nombre se puede actualizar
      if (!nombre || nombre.length < 3) {
        return res.status(400).json({ message: 'Escribí tu nombre y apellido.' });
      }
      cambios.nombre = nombre;
    } else if (existente.nombre) {
      if (nombre && nombre !== existente.nombre) {
        return res.status(400).json({
          message: 'El nombre no se puede cambiar. Pedí soporte en Mi perfil si te equivocaste.',
        });
      }
    } else {
      if (!nombre || nombre.length < 3) {
        return res.status(400).json({ message: 'Escribí tu nombre y apellido.' });
      }
      cambios.nombre = nombre;
    }

    if (!esStaff) {
      if (!existente.dni) {
        if (!dniValido(dni)) {
          return res.status(400).json({ message: 'El DNI es obligatorio (7 u 8 números)' });
        }
        const dniUsado = await Usuario.findOne({ dni, email: { $ne: email } });
        if (dniUsado) {
          return res.status(409).json({ message: 'Ese DNI ya está registrado en otra cuenta' });
        }
        cambios.dni = dni;
      } else if (dni && dni !== existente.dni) {
        return res.status(400).json({ message: 'El DNI ya está cargado y no se puede cambiar' });
      }

      const yaTieneMunicipio = !!(existente.municipioTenantId || existente.municipioPendiente);
      if (yaTieneMunicipio) {
        if (municipioTenantId) {
          const idActual = existente.municipioPendiente
            ? MUNICIPIO_PENDIENTE_ID
            : String(existente.municipioTenantId);
          if (municipioTenantId !== idActual) {
            return res.status(400).json({
              message: 'El municipio no se puede cambiar. Pedí soporte en Mi perfil si te equivocaste.',
            });
          }
        }
      } else {
        const mun = await aplicarMunicipioEnCambios(municipioTenantId, cambios);
        if (!mun.ok) {
          return res.status(400).json({ message: mun.message });
        }
      }
    }

    const usuario = await Usuario.findOneAndUpdate(
      { email },
      { $set: cambios },
      { new: true, runValidators: true }
    );
    res.json(datosPublicos(usuario));
  } catch (error) {
    if (error?.code === 11000 && String(error.message || '').includes('dni')) {
      return res.status(409).json({ message: 'Ese DNI ya está registrado en otra cuenta' });
    }
    res.status(400).json({ message: error.message });
  }
});

/** Sube frente y dorso del DNI (obligatorio para perfil completo). */
router.post(
  '/me/dni-fotos',
  uploadDni.fields([
    { name: 'frente', maxCount: 1 },
    { name: 'dorso', maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const email = normalizeUserId(req.headers['x-user-id'] || '');
      if (!email || email === 'anonimo') {
        return res.status(401).json({ message: 'Falta el correo de la cuenta' });
      }
      const frente = req.files?.frente?.[0];
      const dorso = req.files?.dorso?.[0];
      if (!frente || !dorso) {
        return res.status(400).json({ message: 'Subí la foto del frente y del dorso del DNI' });
      }
      const tiposOk = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
      if (!tiposOk.includes(String(frente.mimetype || '').toLowerCase())
        || !tiposOk.includes(String(dorso.mimetype || '').toLowerCase())) {
        return res.status(400).json({ message: 'Las fotos del DNI tienen que ser imagen (JPG, PNG o WEBP)' });
      }
      const usuario = await Usuario.findOne({ email });
      if (!usuario) {
        return res.status(404).json({ message: 'No hay una cuenta registrada con ese correo.' });
      }
      if (!usuario.dni) {
        return res.status(400).json({ message: 'Primero cargá el número de DNI' });
      }
      usuario.dniFotoFrente = {
        data: frente.buffer,
        contentType: frente.mimetype,
      };
      usuario.dniFotoDorso = {
        data: dorso.buffer,
        contentType: dorso.mimetype,
      };
      usuario.dniFotosAt = new Date();
      await usuario.save();
      res.json({
        message: 'Fotos del DNI guardadas',
        ...datosPublicos(usuario),
      });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }
);

/** Envía (o genera en demo) un código OTP al celular del usuario */
router.post('/me/celular/enviar-codigo', async (req, res) => {
  try {
    const email = normalizeUserId(req.headers['x-user-id'] || '');
    if (!email || email === 'anonimo') {
      return res.status(401).json({ message: 'Falta el correo de la cuenta' });
    }
    const usuario = await Usuario.findOne({ email });
    if (!usuario) {
      return res.status(404).json({ message: 'No hay una cuenta registrada con ese correo.' });
    }
    const telefonoBody = String(req.body.telefono || '').trim();
    const telefono = telefonoBody || usuario.telefono || '';
    if (!telefonoValido(telefono)) {
      return res.status(400).json({ message: 'Escribí un celular válido' });
    }
    if (usuario.telefonoConfirmado && usuario.telefono === telefono) {
      return res.json({
        message: 'Este celular ya está confirmado',
        telefonoConfirmado: true,
        ...datosPublicos(usuario),
      });
    }
    if (usuario.telefonoCodigoEnviadoAt) {
      const esperaMs = OTP_COOLDOWN_SEG * 1000
        - (Date.now() - new Date(usuario.telefonoCodigoEnviadoAt).getTime());
      if (esperaMs > 0) {
        return res.status(429).json({
          message: `Esperá ${Math.ceil(esperaMs / 1000)} s para pedir otro código`,
          reintentarEn: Math.ceil(esperaMs / 1000),
        });
      }
    }

    const codigo = String(crypto.randomInt(100000, 1000000));
    const expira = new Date(Date.now() + OTP_MINUTOS * 60 * 1000);
    usuario.telefono = telefono;
    usuario.telefonoConfirmado = false;
    usuario.telefonoConfirmadoAt = null;
    usuario.telefonoCodigoHash = hashOtp(codigo, email);
    usuario.telefonoCodigoExpira = expira;
    usuario.telefonoCodigoEnviadoAt = new Date();
    await usuario.save();

    // Integración SMS real (Twilio, etc.): acá. Por ahora log + modo demo.
    console.log(`[OTP celular] ${email} → ${telefono} · código ${codigo} (vence ${expira.toISOString()})`);

    const payload = {
      message: OTP_DEMO
        ? 'Código generado. En modo demo se muestra abajo (sin SMS real).'
        : 'Te enviamos un código a tu celular.',
      telefono,
      expiraEnMinutos: OTP_MINUTOS,
      telefonoConfirmado: false,
    };
    if (OTP_DEMO) payload.codigoDemo = codigo;
    res.json(payload);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

/** Confirma el celular con el código OTP */
router.post('/me/celular/verificar', async (req, res) => {
  try {
    const email = normalizeUserId(req.headers['x-user-id'] || '');
    if (!email || email === 'anonimo') {
      return res.status(401).json({ message: 'Falta el correo de la cuenta' });
    }
    const codigo = String(req.body.codigo || '').replace(/\D/g, '');
    if (codigo.length !== 6) {
      return res.status(400).json({ message: 'Ingresá el código de 6 dígitos' });
    }
    const usuario = await Usuario.findOne({ email });
    if (!usuario) {
      return res.status(404).json({ message: 'No hay una cuenta registrada con ese correo.' });
    }
    if (usuario.telefonoConfirmado) {
      return res.json({ message: 'Celular ya confirmado', ...datosPublicos(usuario) });
    }
    if (!usuario.telefonoCodigoHash || !usuario.telefonoCodigoExpira) {
      return res.status(400).json({ message: 'Pedí un código primero' });
    }
    if (new Date(usuario.telefonoCodigoExpira).getTime() < Date.now()) {
      return res.status(400).json({ message: 'El código venció. Pedí uno nuevo.' });
    }
    if (usuario.telefonoCodigoHash !== hashOtp(codigo, email)) {
      return res.status(400).json({ message: 'Código incorrecto' });
    }

    usuario.telefonoConfirmado = true;
    usuario.telefonoConfirmadoAt = new Date();
    usuario.telefonoCodigoHash = '';
    usuario.telefonoCodigoExpira = null;
    await usuario.save();
    res.json({
      message: 'Celular confirmado',
      ...datosPublicos(usuario),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

/** Guarda la ubicación GPS actual del vecino (throttled desde el cliente). */
router.patch('/me/ubicacion', async (req, res) => {
  try {
    const email = normalizeUserId(req.headers['x-user-id'] || '');
    if (!email || email === 'anonimo') {
      return res.status(401).json({ message: 'Falta el correo de la cuenta' });
    }
    const lat = Number(req.body.lat);
    const lng = Number(req.body.lng);
    if (!coordValida(lat, lng)) {
      return res.status(400).json({ message: 'Ubicación inválida' });
    }
    const usuario = await Usuario.findOneAndUpdate(
      { email },
      {
        $set: {
          ultimaLat: lat,
          ultimaLng: lng,
          ubicacionAt: new Date(),
        },
      },
      { new: true, upsert: false }
    );
    if (!usuario) {
      return res.status(404).json({ message: 'No hay una cuenta registrada con ese correo.' });
    }
    res.json({
      ok: true,
      ultimaLat: usuario.ultimaLat,
      ultimaLng: usuario.ultimaLng,
      ubicacionAt: usuario.ubicacionAt,
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

/**
 * Zona del mapa donde el vecino quiere recibir avisos
 * (si busca / perdió algo lejos de su ubicación habitual).
 */
router.patch('/me/zona-alerta', async (req, res) => {
  try {
    const email = normalizeUserId(req.headers['x-user-id'] || '');
    if (!email || email === 'anonimo') {
      return res.status(401).json({ message: 'Falta el correo de la cuenta' });
    }
    if (req.body.quitar === true || req.body.quitar === '1') {
      const usuario = await Usuario.findOneAndUpdate(
        { email },
        {
          $set: {
            zonaAlertaLat: null,
            zonaAlertaLng: null,
            zonaAlertaAt: null,
          },
        },
        { new: true }
      );
      if (!usuario) {
        return res.status(404).json({ message: 'No hay una cuenta registrada con ese correo.' });
      }
      return res.json(datosPublicos(usuario));
    }
    const lat = Number(req.body.lat);
    const lng = Number(req.body.lng);
    const radio = Math.min(8000, Math.max(500, Number(req.body.radio) || 2500));
    if (!coordValida(lat, lng)) {
      return res.status(400).json({ message: 'Elegí un punto válido en el mapa.' });
    }
    const usuario = await Usuario.findOneAndUpdate(
      { email },
      {
        $set: {
          zonaAlertaLat: lat,
          zonaAlertaLng: lng,
          zonaAlertaRadio: radio,
          zonaAlertaAt: new Date(),
        },
      },
      { new: true }
    );
    if (!usuario) {
      return res.status(404).json({ message: 'No hay una cuenta registrada con ese correo.' });
    }
    res.json(datosPublicos(usuario));
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

/** Lista pública de municipios/comunas (activos + pendientes de activación). */
router.get('/municipios', async (_req, res) => {
  try {
    const tenants = await Tenant.find({
      type: { $in: ['municipality', 'commune'] },
      status: { $in: ['active', 'pending'] },
    })
      .select('name type slug status')
      .sort({ name: 1 })
      .lean();
    const items = tenants.map((t) => ({
      id: String(t._id),
      name: t.name,
      type: t.type,
      status: t.status,
      typeLabel: t.status === 'pending'
        ? (t.type === 'commune' ? 'Comuna · aún no activo' : 'Municipio · aún no activo')
        : (t.type === 'commune' ? 'Comuna' : 'Municipio'),
      slug: t.slug || '',
    }));
    items.push({
      id: MUNICIPIO_PENDIENTE_ID,
      name: 'Mi municipio aún no figura / no está activo',
      type: 'pending_option',
      status: 'pending',
      typeLabel: 'Atención CiudadAr',
      slug: '',
    });
    res.json({ items });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

const SOPORTE_CAMPOS = {
  nombre: 'nombre',
  dni: 'DNI',
  fotos: 'fotos del DNI',
  municipio: 'municipio',
};

const etiquetaSoporteCampo = (campo) => SOPORTE_CAMPOS[campo] || 'identidad';

/** Libera solo el campo pedido (o todo si no hay campo = pedidos viejos). */
const liberarCampoIdentidad = async (usuario, campo) => {
  const email = usuario.email;
  const unset = {};
  if (!campo) {
    usuario.nombre = '';
    usuario.dni = '';
    usuario.dniFotoFrente = undefined;
    usuario.dniFotoDorso = undefined;
    usuario.dniFotosAt = null;
    usuario.municipioTenantId = null;
    usuario.municipioNombre = '';
    usuario.municipioPendiente = false;
    unset.dniFotoFrente = 1;
    unset.dniFotoDorso = 1;
    unset.municipioTenantId = 1;
  } else if (campo === 'nombre') {
    usuario.nombre = '';
  } else if (campo === 'dni') {
    usuario.dni = '';
  } else if (campo === 'fotos') {
    usuario.dniFotoFrente = undefined;
    usuario.dniFotoDorso = undefined;
    usuario.dniFotosAt = null;
    unset.dniFotoFrente = 1;
    unset.dniFotoDorso = 1;
  } else if (campo === 'municipio') {
    usuario.municipioTenantId = null;
    usuario.municipioNombre = '';
    usuario.municipioPendiente = false;
    unset.municipioTenantId = 1;
  }
  await usuario.save();
  if (Object.keys(unset).length) {
    await Usuario.updateOne({ email }, { $unset: unset });
  }
};

/** Vecino pide editar un dato concreto (nombre / DNI / fotos / municipio). */
router.post('/me/soporte', async (req, res) => {
  try {
    const email = normalizeUserId(req.headers['x-user-id'] || '');
    if (!email || email === 'anonimo') {
      return res.status(401).json({ message: 'Falta el correo de la cuenta' });
    }
    const campo = String(req.body.campo || '').trim().toLowerCase();
    if (!SOPORTE_CAMPOS[campo]) {
      return res.status(400).json({
        message: 'Elegí qué dato querés corregir: nombre, DNI, fotos o municipio.',
      });
    }
    const usuario = await Usuario.findOne({ email });
    if (!usuario) {
      return res.status(404).json({ message: 'No hay una cuenta registrada con ese correo.' });
    }
    if (usuario.soporteEstado === 'pendiente') {
      return res.status(400).json({
        message: 'Ya tenés un pedido de soporte pendiente. Esperá la respuesta del municipio.',
      });
    }
    if (campo === 'nombre' && !usuario.nombre) {
      return res.status(400).json({ message: 'Todavía no tenés nombre cargado.' });
    }
    if (campo === 'dni' && !usuario.dni) {
      return res.status(400).json({ message: 'Todavía no tenés DNI cargado.' });
    }
    if (campo === 'fotos' && !(tieneFotoDni(usuario.dniFotoFrente) && tieneFotoDni(usuario.dniFotoDorso))) {
      return res.status(400).json({ message: 'Todavía no tenés fotos del DNI cargadas.' });
    }
    if (campo === 'municipio' && !(usuario.municipioTenantId || usuario.municipioPendiente)) {
      return res.status(400).json({ message: 'Todavía no tenés municipio cargado.' });
    }

    const rawTenantId = String(
      req.body.tenantId
      || (usuario.municipioPendiente ? MUNICIPIO_PENDIENTE_ID : '')
      || usuario.municipioTenantId
      || ''
    ).trim();
    if (!rawTenantId && !usuario.municipioPendiente) {
      return res.status(400).json({
        message: 'Falta tu municipio en el perfil.',
      });
    }

    const esPendiente = rawTenantId === MUNICIPIO_PENDIENTE_ID || !!usuario.municipioPendiente;
    const tenant = esPendiente ? null : await resolverMunicipioLocal(rawTenantId);
    if (!esPendiente && !tenant) {
      return res.status(400).json({ message: 'Ese municipio o comuna no está disponible.' });
    }

    const nombreJuris = tenant?.name
      || usuario.municipioNombre
      || 'municipio aún no activo';
    const sinAdminLocal = esPendiente || !tenant || tenant.status !== 'active';
    const etiqueta = etiquetaSoporteCampo(campo);
    const motivo = String(req.body.mensaje || '').trim().slice(0, 500);
    if (!motivo || motivo.length < 5) {
      return res.status(400).json({
        message: 'Explicá brevemente por qué querés cambiar ese dato.',
      });
    }

    usuario.soporteEstado = 'pendiente';
    usuario.soporteCampo = campo;
    usuario.soporteMensaje = motivo;
    usuario.soporteTenantId = tenant?._id || null;
    usuario.soporteTenantName = sinAdminLocal
      ? `${nombreJuris} (atención CiudadAr)`
      : (tenant.name || '');
    usuario.soporteAt = new Date();
    usuario.soporteResueltoAt = null;
    usuario.soporteResueltoPor = '';
    usuario.soporteNotaAdmin = '';
    await usuario.save();

    const admins = await listarEmailsAdminDeTenant(sinAdminLocal ? null : tenant._id);
    const aviso = `${usuario.nombre || email} pidió editar su ${etiqueta} (${nombreJuris}). Revisá Soporte.`;
    await Promise.all(
      admins.map((adminEmail) => crearNotificacion({
        userId: adminEmail,
        tipo: 'soporte',
        mensaje: aviso,
        tenantId: tenant?._id || null,
      }))
    );

    res.json(datosPublicos(usuario));
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

/** Admin: listar pedidos de soporte de identidad (filtrados por jurisdicción) */
router.get('/admin/soporte', requireAdmin, async (req, res) => {
  try {
    const estado = String(req.query.estado || 'pendiente').trim();
    const filtro = estado === 'todos'
      ? { soporteEstado: { $in: ['pendiente', 'reseteado', 'rechazado'] } }
      : { soporteEstado: estado || 'pendiente' };
    const permitidos = await tenantIdsSoporteDelScope(req.adminScope);
    if (permitidos) {
      if (!permitidos.length) {
        return res.json({ items: [] });
      }
      // Solo pedidos de su jurisdicción (los “sin municipio activo” quedan para el super)
      filtro.soporteTenantId = { $in: permitidos };
    }
    const lista = await Usuario.find(filtro)
      .select('email nombre dni telefono soporteEstado soporteCampo soporteMensaje soporteTenantId soporteTenantName soporteAt soporteResueltoAt soporteResueltoPor soporteNotaAdmin dniFotosAt createdAt')
      .sort({ soporteAt: -1 })
      .limit(100)
      .lean();
    res.json({
      items: lista.map((u) => ({
        email: u.email,
        nombre: u.nombre || '',
        dni: u.dni || '',
        telefono: u.telefono || '',
        soporteEstado: u.soporteEstado || '',
        soporteCampo: u.soporteCampo || '',
        soporteCampoLabel: etiquetaSoporteCampo(u.soporteCampo),
        soporteMensaje: u.soporteMensaje || '',
        soporteTenantId: u.soporteTenantId ? String(u.soporteTenantId) : '',
        soporteTenantName: u.soporteTenantName || '',
        soporteAt: u.soporteAt || null,
        soporteResueltoAt: u.soporteResueltoAt || null,
        soporteResueltoPor: u.soporteResueltoPor || '',
        soporteNotaAdmin: u.soporteNotaAdmin || '',
        dniFotosAt: u.dniFotosAt || null,
      })),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

/** Admin: liberar el campo que el vecino pidió editar. */
router.post('/admin/soporte/:email/resetear', requireAdmin, async (req, res) => {
  try {
    const email = normalizeUserId(req.params.email);
    if (!email || email === 'anonimo') {
      return res.status(400).json({ message: 'Correo inválido' });
    }
    const nota = String(req.body.nota || '').trim().slice(0, 300);
    const usuario = await Usuario.findOne({ email });
    if (!usuario) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }
    if (!(await adminPuedeAtenderSoporte(req.adminScope, usuario.soporteTenantId))) {
      return res.status(403).json({ message: 'Este pedido corresponde a otro municipio.' });
    }
    if (usuario.soporteEstado !== 'pendiente') {
      return res.status(400).json({ message: 'No hay un pedido pendiente para este usuario.' });
    }

    const campo = String(req.body.campo || usuario.soporteCampo || '').trim().toLowerCase();
    const campoFinal = SOPORTE_CAMPOS[campo] ? campo : (usuario.soporteCampo || '');
    const etiqueta = etiquetaSoporteCampo(campoFinal);
    const tenantNotif = usuario.soporteTenantId || usuario.municipioTenantId || null;

    await liberarCampoIdentidad(usuario, campoFinal || null);
    // liberarCampoIdentidad ya hizo save; recargar para setear estado soporte
    const actualizado = await Usuario.findOne({ email });
    actualizado.soporteEstado = 'reseteado';
    actualizado.soporteResueltoAt = new Date();
    actualizado.soporteResueltoPor = req.requester;
    actualizado.soporteNotaAdmin = nota
      || `Se liberó tu ${etiqueta}. Volvé a entrar y cargalo de nuevo.`;
    await actualizado.save();

    await crearNotificacion({
      userId: email,
      tipo: 'soporte',
      mensaje: actualizado.soporteNotaAdmin,
      tenantId: tenantNotif,
    });

    res.json({
      ok: true,
      email,
      soporteEstado: 'reseteado',
      soporteCampo: campoFinal || '',
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

/** Admin: rechazar pedido de soporte sin resetear */
router.post('/admin/soporte/:email/rechazar', requireAdmin, async (req, res) => {
  try {
    const email = normalizeUserId(req.params.email);
    if (!email || email === 'anonimo') {
      return res.status(400).json({ message: 'Correo inválido' });
    }
    const nota = String(req.body.nota || '').trim().slice(0, 300);
    if (!nota || nota.length < 5) {
      return res.status(400).json({ message: 'Indicá un motivo breve para el vecino.' });
    }
    const usuario = await Usuario.findOne({ email });
    if (!usuario) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }
    if (!(await adminPuedeAtenderSoporte(req.adminScope, usuario.soporteTenantId))) {
      return res.status(403).json({ message: 'Este pedido corresponde a otro municipio.' });
    }
    if (usuario.soporteEstado !== 'pendiente') {
      return res.status(400).json({ message: 'No hay un pedido pendiente para este usuario.' });
    }
    usuario.soporteEstado = 'rechazado';
    usuario.soporteResueltoAt = new Date();
    usuario.soporteResueltoPor = req.requester;
    usuario.soporteNotaAdmin = nota;
    await usuario.save();

    await crearNotificacion({
      userId: email,
      tipo: 'soporte',
      mensaje: `Tu pedido de soporte fue respondido: ${nota}`,
      tenantId: usuario.soporteTenantId || null,
    });

    res.json({ ok: true, email, soporteEstado: 'rechazado' });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

/** Admin / Super: listar vecinos (scoped por jurisdicción). */
router.get('/admin/usuarios', requireAdmin, async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const estado = String(req.query.estado || 'todos').trim(); // activos | desactivados | todos
    const tenantId = String(req.query.tenantId || '').trim();
    const soloPendiente = String(req.query.pendiente || '') === '1';
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 40));

    const filtro = {};
    const permitidos = await tenantIdsSoporteDelScope(req.adminScope);

    if (permitidos) {
      if (!permitidos.length) return res.json({ items: [], total: 0, page, hasMore: false });
      if (tenantId && !permitidos.includes(tenantId)) {
        return res.json({ items: [], total: 0, page, hasMore: false });
      }
      filtro.municipioTenantId = { $in: tenantId ? [tenantId] : permitidos };
    } else if (soloPendiente) {
      filtro.$or = [
        { municipioPendiente: true },
        { municipioTenantId: null },
      ];
    } else if (tenantId) {
      filtro.municipioTenantId = tenantId;
    }

    if (estado === 'activos') filtro.activo = { $ne: false };
    if (estado === 'desactivados') filtro.activo = false;

    if (q) {
      const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      const digitos = q.replace(/\D/g, '');
      filtro.$and = (filtro.$and || []).concat([{
        $or: [
          { email: rx },
          { nombre: rx },
          { municipioNombre: rx },
          ...(digitos ? [{ dni: new RegExp(digitos) }, { telefono: new RegExp(digitos) }] : []),
        ],
      }]);
    }

    const total = await Usuario.countDocuments(filtro);
    const lista = await Usuario.find(filtro)
      .select('email nombre dni telefono telefonoConfirmado proveedor municipioTenantId municipioNombre municipioPendiente activo desactivadoAt desactivadoPor desactivadoNota soporteEstado soporteMensaje soporteAt dniFotosAt createdAt updatedAt')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    res.json({
      items: lista.map(resumenUsuarioAdmin),
      total,
      page,
      hasMore: page * limit < total,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/admin/usuarios/:email', requireAdmin, async (req, res) => {
  try {
    const email = normalizeUserId(req.params.email);
    const usuario = await Usuario.findOne({ email })
      .select('email nombre dni telefono telefonoConfirmado proveedor municipioTenantId municipioNombre municipioPendiente activo desactivadoAt desactivadoPor desactivadoNota soporteEstado soporteMensaje soporteAt soporteTenantName dniFotosAt createdAt updatedAt')
      .lean();
    if (!usuario) return res.status(404).json({ message: 'Usuario no encontrado' });
    if (!(await adminPuedeGestionarVecino(req.adminScope, usuario))) {
      return res.status(403).json({ message: 'No podés gestionar usuarios de otra jurisdicción.' });
    }
    res.json(resumenUsuarioAdmin(usuario));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

/** Admin: ver foto de DNI (frente/dorso). ?userId= para <img>. */
router.get('/admin/usuarios/:email/dni/:lado', async (req, res) => {
  try {
    const lado = String(req.params.lado || '').toLowerCase();
    if (lado !== 'frente' && lado !== 'dorso') {
      return res.status(400).json({ message: 'Lado inválido (frente o dorso)' });
    }
    const viewer = normalizeUserId(req.query.userId || req.headers['x-user-id'] || '');
    if (!viewer || viewer === 'anonimo') {
      return res.status(401).json({ message: 'Falta el correo de la cuenta' });
    }
    const scope = await getAdminScope(viewer);
    if (!isScopeAdmin(scope)) {
      return res.status(403).json({ message: 'Solo administradores' });
    }
    const email = normalizeUserId(req.params.email);
    const campo = lado === 'frente' ? 'dniFotoFrente' : 'dniFotoDorso';
    const usuario = await Usuario.findOne({ email }).select(`email municipioTenantId soporteTenantId ${campo}`);
    if (!usuario) return res.status(404).json({ message: 'Usuario no encontrado' });
    if (!(await adminPuedeGestionarVecino(scope, usuario))) {
      return res.status(403).json({ message: 'No podés ver usuarios de otra jurisdicción.' });
    }
    const foto = usuario[campo];
    if (!foto?.data || !foto.contentType) {
      return res.status(404).json({ message: 'No hay foto de DNI cargada' });
    }
    res.set('Content-Type', foto.contentType);
    res.set('Cache-Control', 'private, max-age=300');
    res.send(foto.data);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/admin/usuarios/:email/desactivar', requireAdmin, async (req, res) => {
  try {
    const email = normalizeUserId(req.params.email);
    if (email === req.requester) {
      return res.status(400).json({ message: 'No podés desactivar tu propia cuenta.' });
    }
    const nota = String(req.body.nota || '').trim().slice(0, 300);
    const usuario = await Usuario.findOne({ email });
    if (!usuario) return res.status(404).json({ message: 'Usuario no encontrado' });
    if (!(await adminPuedeGestionarVecino(req.adminScope, usuario))) {
      return res.status(403).json({ message: 'No podés gestionar usuarios de otra jurisdicción.' });
    }
    if (usuario.activo === false) {
      return res.json({ ok: true, email, activo: false });
    }
    usuario.activo = false;
    usuario.desactivadoAt = new Date();
    usuario.desactivadoPor = req.requester;
    usuario.desactivadoNota = nota || 'Cuenta desactivada por el administrador.';
    await usuario.save();

    await crearNotificacion({
      userId: email,
      tipo: 'soporte',
      mensaje: usuario.desactivadoNota,
      tenantId: usuario.municipioTenantId || null,
    }).catch(() => {});

    res.json({ ok: true, email, activo: false });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.post('/admin/usuarios/:email/activar', requireAdmin, async (req, res) => {
  try {
    const email = normalizeUserId(req.params.email);
    const usuario = await Usuario.findOne({ email });
    if (!usuario) return res.status(404).json({ message: 'Usuario no encontrado' });
    if (!(await adminPuedeGestionarVecino(req.adminScope, usuario))) {
      return res.status(403).json({ message: 'No podés gestionar usuarios de otra jurisdicción.' });
    }
    usuario.activo = true;
    usuario.desactivadoAt = null;
    usuario.desactivadoPor = '';
    usuario.desactivadoNota = '';
    await usuario.save();
    res.json({ ok: true, email, activo: true });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

/** Liberar un campo de identidad desde Usuarios (opcional: campo en body). */
router.post('/admin/usuarios/:email/resetear-identidad', requireAdmin, async (req, res) => {
  try {
    const email = normalizeUserId(req.params.email);
    const nota = String(req.body.nota || '').trim().slice(0, 300);
    const campoRaw = String(req.body.campo || '').trim().toLowerCase();
    const usuario = await Usuario.findOne({ email });
    if (!usuario) return res.status(404).json({ message: 'Usuario no encontrado' });
    if (!(await adminPuedeGestionarVecino(req.adminScope, usuario))) {
      return res.status(403).json({ message: 'No podés gestionar usuarios de otra jurisdicción.' });
    }

    const campo = SOPORTE_CAMPOS[campoRaw]
      ? campoRaw
      : (usuario.soporteCampo && SOPORTE_CAMPOS[usuario.soporteCampo] ? usuario.soporteCampo : '');
    if (!campo) {
      return res.status(400).json({
        message: 'Indicá el campo a liberar: nombre, dni, fotos o municipio.',
      });
    }
    const etiqueta = etiquetaSoporteCampo(campo);
    const tenantNotif = usuario.municipioTenantId || usuario.soporteTenantId || null;

    await liberarCampoIdentidad(usuario, campo);
    const actualizado = await Usuario.findOne({ email });
    actualizado.soporteEstado = 'reseteado';
    actualizado.soporteCampo = campo;
    actualizado.soporteResueltoAt = new Date();
    actualizado.soporteResueltoPor = req.requester;
    actualizado.soporteNotaAdmin = nota || `Se liberó tu ${etiqueta}. Volvé a entrar y cargalo de nuevo.`;
    await actualizado.save();

    await crearNotificacion({
      userId: email,
      tipo: 'soporte',
      mensaje: actualizado.soporteNotaAdmin,
      tenantId: tenantNotif,
    });

    res.json({ ok: true, email, soporteEstado: 'reseteado', soporteCampo: campo });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

module.exports = router;
