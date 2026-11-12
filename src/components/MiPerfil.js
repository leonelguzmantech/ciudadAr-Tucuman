import React, { useEffect, useState } from 'react';
import axios from 'axios';
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
  updateProfile,
} from 'firebase/auth';

const celularValido = (valor) => {
  const digitos = String(valor || '').replace(/\D/g, '');
  return digitos.length >= 8 && digitos.length <= 15;
};

const dniValido = (valor) => {
  const digitos = String(valor || '').replace(/\D/g, '');
  return digitos.length >= 7 && digitos.length <= 8;
};

const ETIQUETA_ROL = {
  SUPER_ADMIN: 'Super administrador',
  JURISDICTION_ADMIN: 'Administrador municipal',
  OPERARIO: 'Cuadrilla / Operario',
  PUBLIC_USER: 'Vecino',
};

const ETIQUETA_CAMPO_EDITAR = {
  nombre: 'nombre',
  dni: 'DNI',
  fotos: 'fotos del DNI',
  municipio: 'municipio',
};

/**
 * Perfil de cuenta.
 * - Vecino: identidad (nombre fijo, DNI, celular, soporte)
 * - Admin / Super / Cuadrilla: cuenta de trabajo (sin DNI ni soporte)
 */
const MiPerfil = ({
  usuario,
  onCerrar,
  onDatosGuardados,
  rol = 'PUBLIC_USER',
}) => {
  const esStaff = rol === 'SUPER_ADMIN'
    || rol === 'JURISDICTION_ADMIN'
    || rol === 'OPERARIO';

  const [nombre, setNombre] = useState(usuario?.displayName || '');
  const [nombreFijo, setNombreFijo] = useState(false);
  const [dni, setDni] = useState('');
  const [dniFijo, setDniFijo] = useState(false);
  const [celular, setCelular] = useState('');
  const [celularConfirmado, setCelularConfirmado] = useState(false);
  const [dniFotosCargadas, setDniFotosCargadas] = useState(false);
  const [jurisdicciones, setJurisdicciones] = useState([]);
  const [soporteEstado, setSoporteEstado] = useState('');
  const [soporteCampo, setSoporteCampo] = useState('');
  const [soporteMensaje, setSoporteMensaje] = useState('');
  const [soporteTenantName, setSoporteTenantName] = useState('');
  const [soporteNotaAdmin, setSoporteNotaAdmin] = useState('');
  const [municipioTenantId, setMunicipioTenantId] = useState('');
  const [municipioNombre, setMunicipioNombre] = useState('');
  const [municipioFijo, setMunicipioFijo] = useState(false);
  const [enviandoSoporte, setEnviandoSoporte] = useState('');
  const [mensajeSoporte, setMensajeSoporte] = useState('');
  const [errorSoporte, setErrorSoporte] = useState('');
  const [pedidoEditar, setPedidoEditar] = useState(null);
  const [motivoEditar, setMotivoEditar] = useState('');
  const [errorPedido, setErrorPedido] = useState('');
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [repetir, setRepetir] = useState('');
  const [mensajeDatos, setMensajeDatos] = useState('');
  const [errorDatos, setErrorDatos] = useState('');
  const [mensajePass, setMensajePass] = useState('');
  const [errorPass, setErrorPass] = useState('');
  const [guardandoDatos, setGuardandoDatos] = useState(false);
  const [guardandoPass, setGuardandoPass] = useState(false);
  const [cargando, setCargando] = useState(true);

  const tieneContrasena = !!usuario?.providerData?.some(
    (dato) => dato.providerId === 'password'
  );
  const correo = usuario?.email || '';

  useEffect(() => {
    let cancelado = false;
    const cargar = async () => {
      if (!correo) {
        setCargando(false);
        return;
      }
      try {
        const headers = { 'x-user-id': correo };
        const peticiones = [
          axios.get('http://localhost:5001/api/usuarios/me', { headers }),
        ];
        if (esStaff) {
          peticiones.push(axios.get('http://localhost:5001/api/auth/me', { headers }));
        }
        const [meRes, authRes] = await Promise.all(peticiones);
        if (cancelado) return;
        const data = meRes.data || {};
        setNombre(data.nombre || usuario?.displayName || '');
        setNombreFijo(!esStaff && (!!data.nombreFijo || !!data.nombre));
        setDni(data.dni || '');
        setDniFijo(!!data.dni);
        setCelular(data.telefono || '');
        setCelularConfirmado(!!data.telefonoConfirmado);
        setDniFotosCargadas(!!data.dniFotosCargadas);
        setSoporteEstado(data.soporteEstado || '');
        setSoporteCampo(data.soporteCampo || '');
        setSoporteMensaje(data.soporteMensaje || '');
        setSoporteTenantName(data.soporteTenantName || '');
        setSoporteNotaAdmin(data.soporteNotaAdmin || '');
        setMunicipioTenantId(data.municipioTenantId ? String(data.municipioTenantId) : '');
        setMunicipioNombre(data.municipioNombre || '');
        setMunicipioFijo(!esStaff && !!(data.municipioTenantId || data.municipioPendiente || data.municipioNombre));
        if (esStaff && authRes?.data?.jurisdictions) {
          setJurisdicciones(authRes.data.jurisdictions || []);
        }
      } catch {
        if (!cancelado) setNombre(usuario?.displayName || '');
      } finally {
        if (!cancelado) setCargando(false);
      }
    };
    cargar();
    return () => {
      cancelado = true;
    };
  }, [correo, usuario, esStaff]);

  const guardarDatos = async (e) => {
    e.preventDefault();
    setMensajeDatos('');
    setErrorDatos('');

    const nombreLimpio = nombre.trim();
    const celularLimpio = celular.trim();
    const dniLimpio = String(dni || '').replace(/\D/g, '');

    if (!nombreLimpio || nombreLimpio.length < 3) {
      setErrorDatos('Escribí tu nombre y apellido.');
      return;
    }
    if (!esStaff) {
      if (!nombreFijo && (!nombreLimpio || nombreLimpio.length < 3)) {
        setErrorDatos('Escribí tu nombre y apellido.');
        return;
      }
      if (!dniFijo && !dniValido(dniLimpio)) {
        setErrorDatos('El DNI debe tener 7 u 8 números.');
        return;
      }
      if (!celularValido(celularLimpio)) {
        setErrorDatos('Escribí un celular válido.');
        return;
      }
    } else if (celularLimpio && !celularValido(celularLimpio)) {
      setErrorDatos('Escribí un celular válido o dejalo vacío.');
      return;
    }

    setGuardandoDatos(true);
    try {
      const body = esStaff
        ? { nombre: nombreLimpio, telefono: celularLimpio, staff: true }
        : { nombre: nombreLimpio, telefono: celularLimpio };
      if (!esStaff && !dniFijo) body.dni = dniLimpio;

      const { data } = await axios.patch(
        'http://localhost:5001/api/usuarios/me',
        body,
        { headers: { 'x-user-id': correo } }
      );

      if (esStaff || !nombreFijo) {
        await updateProfile(usuario, { displayName: nombreLimpio });
        if (!esStaff) setNombreFijo(true);
      }
      if (!esStaff && !dniFijo) {
        setDni(dniLimpio);
        setDniFijo(true);
      }
      const confirmado = !!data.telefonoConfirmado;
      setCelularConfirmado(confirmado);
      if (onDatosGuardados) {
        onDatosGuardados({
          nombre: data.nombre || nombreLimpio,
          telefono: data.telefono || celularLimpio,
          telefonoConfirmado: esStaff ? true : confirmado,
        });
      }
      setMensajeDatos(
        esStaff
          ? 'Tus datos se guardaron correctamente.'
          : (confirmado
            ? 'Tus datos se guardaron correctamente.'
            : 'Datos guardados. Confirmá el celular con el código que te pedimos a continuación.')
      );
    } catch (err) {
      console.error('Error al guardar perfil:', err);
      setErrorDatos(err.response?.data?.message || 'No se pudieron guardar los datos.');
    } finally {
      setGuardandoDatos(false);
    }
  };

  const abrirPedidoEditar = (campo) => {
    setErrorSoporte('');
    setMensajeSoporte('');
    setErrorPedido('');
    setMotivoEditar('');
    setPedidoEditar({
      campo,
      etiqueta: ETIQUETA_CAMPO_EDITAR[campo] || 'dato',
    });
  };

  const cerrarPedidoEditar = () => {
    if (enviandoSoporte) return;
    setPedidoEditar(null);
    setMotivoEditar('');
    setErrorPedido('');
  };

  const confirmarPedidoEditar = async () => {
    if (!pedidoEditar?.campo) return;
    const motivo = String(motivoEditar || '').trim();
    if (motivo.length < 5) {
      setErrorPedido('Escribí por qué querés cambiar ese dato (mínimo unas palabras).');
      return;
    }
    const campo = pedidoEditar.campo;
    setMensajeSoporte('');
    setErrorSoporte('');
    setErrorPedido('');
    setEnviandoSoporte(campo);
    try {
      const { data } = await axios.post(
        'http://localhost:5001/api/usuarios/me/soporte',
        {
          campo,
          mensaje: motivo,
          tenantId: municipioTenantId || undefined,
        },
        { headers: { 'x-user-id': correo } }
      );
      setSoporteEstado(data.soporteEstado || 'pendiente');
      setSoporteCampo(data.soporteCampo || campo);
      setSoporteMensaje(data.soporteMensaje || motivo);
      setSoporteTenantName(data.soporteTenantName || '');
      setSoporteNotaAdmin('');
      setMensajeSoporte('Pedido enviado. Cuando el municipio lo libere, vas a poder cargarlo de nuevo.');
      setPedidoEditar(null);
      setMotivoEditar('');
    } catch (err) {
      setErrorPedido(err.response?.data?.message || 'No se pudo enviar el pedido.');
    } finally {
      setEnviandoSoporte('');
    }
  };

  const cambiarContrasena = async (e) => {
    e.preventDefault();
    setMensajePass('');
    setErrorPass('');

    if (!nueva || nueva.length < 6) {
      setErrorPass('La nueva contraseña tiene que tener al menos 6 caracteres.');
      return;
    }
    if (nueva !== repetir) {
      setErrorPass('Las contraseñas nuevas no coinciden.');
      return;
    }

    setGuardandoPass(true);
    try {
      const credencial = EmailAuthProvider.credential(correo, actual);
      await reauthenticateWithCredential(usuario, credencial);
      await updatePassword(usuario, nueva);
      setActual('');
      setNueva('');
      setRepetir('');
      setMensajePass('Tu contraseña se actualizó correctamente.');
    } catch (err) {
      console.error('Error al cambiar contraseña:', err);
      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setErrorPass('La contraseña actual no es correcta.');
      } else if (err.code === 'auth/requires-recent-login') {
        setErrorPass('Por seguridad, cerrá sesión y volvé a entrar para cambiar la contraseña.');
      } else if (err.code === 'auth/weak-password') {
        setErrorPass('Elegí una contraseña más segura.');
      } else {
        setErrorPass('No se pudo cambiar la contraseña. Intentá de nuevo.');
      }
    } finally {
      setGuardandoPass(false);
    }
  };

  const textoJuris = jurisdicciones.map((j) => j.name).filter(Boolean).join(', ');

  return (
    <div className="panel-vecino-fondo" onClick={onCerrar}>
      <div className="panel-vecino panel-mi-perfil" onClick={(event) => event.stopPropagation()}>
        <div className="panel-vecino-cabecera">
          <h3>Mi perfil</h3>
          <button type="button" onClick={onCerrar}>Cerrar</button>
        </div>

        {cargando ? (
          <p className="perfil-nota">Cargando...</p>
        ) : (
          <>
            <form className="perfil-formulario" onSubmit={guardarDatos}>
              <h4>{esStaff ? 'Cuenta de trabajo' : 'Tus datos'}</h4>
              <p className="perfil-nota">
                Rol: {ETIQUETA_ROL[rol] || ETIQUETA_ROL.PUBLIC_USER}
              </p>
              {esStaff && textoJuris && (
                <p className="perfil-nota">
                  {rol === 'OPERARIO' ? 'Operás en: ' : 'Administrás: '}
                  {textoJuris}
                </p>
              )}
              {rol === 'SUPER_ADMIN' && (
                <p className="perfil-nota">Acceso a todas las jurisdicciones.</p>
              )}

              <div className="usuarios-ficha-fila">
                <label>Nombre y apellido</label>
                {!esStaff && nombreFijo && (
                  <button
                    type="button"
                    className="usuarios-ficha-accion"
                    disabled={!!enviandoSoporte || soporteEstado === 'pendiente'}
                    onClick={() => abrirPedidoEditar('nombre')}
                  >
                    Editar
                  </button>
                )}
              </div>
              <input
                type="text"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                autoComplete="name"
                disabled={!esStaff && nombreFijo}
                readOnly={!esStaff && nombreFijo}
                required
              />

              {!esStaff && (
                <>
                  <div className="usuarios-ficha-fila">
                    <label>DNI</label>
                    {dniFijo && (
                      <button
                        type="button"
                        className="usuarios-ficha-accion"
                        disabled={!!enviandoSoporte || soporteEstado === 'pendiente'}
                        onClick={() => abrirPedidoEditar('dni')}
                      >
                        Editar
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    value={dni}
                    onChange={(e) => setDni(e.target.value.replace(/\D/g, '').slice(0, 8))}
                    inputMode="numeric"
                    disabled={dniFijo}
                    readOnly={dniFijo}
                    required
                  />
                  <div className="usuarios-ficha-fila">
                    <p className="perfil-nota">
                      {dniFotosCargadas
                        ? 'Fotos del DNI (frente y dorso) cargadas.'
                        : 'Faltan las fotos del DNI: completá tu identidad al ingresar.'}
                    </p>
                    {dniFotosCargadas && (
                      <button
                        type="button"
                        className="usuarios-ficha-accion"
                        disabled={!!enviandoSoporte || soporteEstado === 'pendiente'}
                        onClick={() => abrirPedidoEditar('fotos')}
                      >
                        Editar
                      </button>
                    )}
                  </div>
                </>
              )}

              <label>Correo</label>
              <input type="email" value={correo} disabled readOnly />

              {!esStaff && (
                <>
                  <div className="usuarios-ficha-fila">
                    <label>Municipio o comuna</label>
                    {municipioFijo && (
                      <button
                        type="button"
                        className="usuarios-ficha-accion"
                        disabled={!!enviandoSoporte || soporteEstado === 'pendiente'}
                        onClick={() => abrirPedidoEditar('municipio')}
                      >
                        Editar
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    value={municipioNombre || (municipioFijo ? 'Municipio pendiente / no activo' : 'Sin municipio')}
                    disabled
                    readOnly
                  />
                </>
              )}

              <label>Celular{esStaff ? ' (opcional)' : ''}</label>
              <input
                type="tel"
                value={celular}
                onChange={(e) => setCelular(e.target.value)}
                inputMode="numeric"
                autoComplete="tel"
                required={!esStaff}
              />
              {!esStaff && (
                <p className="perfil-nota">
                  {celularConfirmado
                    ? 'Celular confirmado.'
                    : 'Celular sin confirmar: al guardar un número nuevo te pediremos un código.'}
                </p>
              )}
              <p className="perfil-ingreso">
                Ingreso: {tieneContrasena ? 'Correo y contraseña' : 'Cuenta de Google'}
              </p>
              {errorDatos && <p className="perfil-error">{errorDatos}</p>}
              {mensajeDatos && <p className="perfil-ok">{mensajeDatos}</p>}
              <button type="submit" className="btn-mapa" disabled={guardandoDatos}>
                {guardandoDatos ? 'Guardando...' : 'Guardar datos'}
              </button>
            </form>

            {!esStaff && (errorSoporte || mensajeSoporte || soporteEstado === 'pendiente' || soporteEstado === 'reseteado' || soporteEstado === 'rechazado') && (
              <div className="perfil-formulario perfil-formulario-soporte">
                {soporteEstado === 'pendiente' && (
                  <p className="perfil-nota">
                    Pedido pendiente
                    {soporteMensaje ? `: ${soporteMensaje}` : (soporteCampo ? ` (${soporteCampo})` : '')}
                    {soporteTenantName ? ` · ${soporteTenantName}` : ''}.
                    {' '}
                    Cuando lo liberen, volvé a entrar para cargarlo de nuevo.
                  </p>
                )}
                {soporteEstado === 'reseteado' && (
                  <p className="perfil-ok">
                    {soporteNotaAdmin || 'El municipio liberó el dato pedido. Cerrá sesión o recargá para cargarlo de nuevo.'}
                  </p>
                )}
                {soporteEstado === 'rechazado' && (
                  <p className="perfil-nota">
                    Última respuesta: {soporteNotaAdmin || 'pedido respondido sin liberar.'}
                  </p>
                )}
                {errorSoporte && <p className="perfil-error">{errorSoporte}</p>}
                {mensajeSoporte && soporteEstado !== 'pendiente' && (
                  <p className="perfil-ok">{mensajeSoporte}</p>
                )}
              </div>
            )}

            {tieneContrasena ? (
              <form className="perfil-formulario perfil-formulario-pass" onSubmit={cambiarContrasena}>
                <h4>Cambiar contraseña</h4>
                <label>Contraseña actual</label>
                <input
                  type="password"
                  value={actual}
                  onChange={(e) => setActual(e.target.value)}
                  autoComplete="current-password"
                  required
                />
                <label>Nueva contraseña</label>
                <input
                  type="password"
                  value={nueva}
                  onChange={(e) => setNueva(e.target.value)}
                  autoComplete="new-password"
                  required
                  minLength={6}
                />
                <label>Repetir nueva contraseña</label>
                <input
                  type="password"
                  value={repetir}
                  onChange={(e) => setRepetir(e.target.value)}
                  autoComplete="new-password"
                  required
                  minLength={6}
                />
                {errorPass && <p className="perfil-error">{errorPass}</p>}
                {mensajePass && <p className="perfil-ok">{mensajePass}</p>}
                <button type="submit" className="btn-mapa" disabled={guardandoPass}>
                  {guardandoPass ? 'Guardando...' : 'Guardar contraseña'}
                </button>
              </form>
            ) : (
              <p className="perfil-nota">
                Entraste con Google, así que la contraseña se administra desde tu cuenta de Google.
              </p>
            )}
          </>
        )}
      </div>

      {pedidoEditar && (
        <div
          className="perfil-pedido-fondo"
          role="dialog"
          aria-modal="true"
          aria-label="Pedir edición a soporte"
          onClick={cerrarPedidoEditar}
        >
          <div className="perfil-pedido-modal" onClick={(event) => event.stopPropagation()}>
            <h4>Pedir a soporte</h4>
            <p className="perfil-nota">
              Para cambiar tu <strong>{pedidoEditar.etiqueta}</strong> hay que pedírselo a soporte
              {municipioTenantId === '__pendiente__' || (municipioNombre || '').includes('no activo')
                ? ' de CiudadAr'
                : ` de ${municipioNombre || 'tu municipio'}`}.
              {' '}
              Contá por qué querés cambiarlo y tocá OK.
            </p>
            <label htmlFor="perfil-motivo-editar">Motivo</label>
            <textarea
              id="perfil-motivo-editar"
              value={motivoEditar}
              onChange={(e) => setMotivoEditar(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="Ej.: me equivoqué al cargar el dato"
              disabled={!!enviandoSoporte}
              autoFocus
            />
            {errorPedido && <p className="perfil-error">{errorPedido}</p>}
            <div className="perfil-pedido-acciones">
              <button
                type="button"
                className="usuarios-ficha-accion"
                onClick={cerrarPedidoEditar}
                disabled={!!enviandoSoporte}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="usuarios-ficha-accion usuarios-ficha-accion-ok"
                onClick={confirmarPedidoEditar}
                disabled={!!enviandoSoporte}
              >
                {enviandoSoporte ? 'Enviando…' : 'OK'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MiPerfil;
