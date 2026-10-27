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

const MiPerfil = ({ usuario, onCerrar, onDatosGuardados }) => {
  const [nombre, setNombre] = useState(usuario?.displayName || '');
  const [celular, setCelular] = useState('');
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
        const respuesta = await axios.get('http://localhost:5001/api/usuarios/me', {
          headers: { 'x-user-id': correo },
        });
        if (cancelado) return;
        setNombre(respuesta.data.nombre || usuario?.displayName || '');
        setCelular(respuesta.data.telefono || '');
      } catch (error) {
        if (!cancelado) {
          setNombre(usuario?.displayName || '');
        }
      } finally {
        if (!cancelado) setCargando(false);
      }
    };
    cargar();
    return () => {
      cancelado = true;
    };
  }, [correo, usuario]);

  const guardarDatos = async (e) => {
    e.preventDefault();
    setMensajeDatos('');
    setErrorDatos('');

    const nombreLimpio = nombre.trim();
    const celularLimpio = celular.trim();
    if (!nombreLimpio) {
      setErrorDatos('Escribí tu nombre.');
      return;
    }
    if (!celularValido(celularLimpio)) {
      setErrorDatos('Escribí un celular válido.');
      return;
    }

    setGuardandoDatos(true);
    try {
      await axios.patch(
        'http://localhost:5001/api/usuarios/me',
        { nombre: nombreLimpio, telefono: celularLimpio },
        { headers: { 'x-user-id': correo } }
      );
      await updateProfile(usuario, { displayName: nombreLimpio });
      if (onDatosGuardados) onDatosGuardados(nombreLimpio);
      setMensajeDatos('Tus datos se guardaron correctamente.');
    } catch (err) {
      console.error('Error al guardar perfil:', err);
      setErrorDatos(err.response?.data?.message || 'No se pudieron guardar los datos.');
    } finally {
      setGuardandoDatos(false);
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
              <h4>Tus datos</h4>
              <label>Nombre</label>
              <input
                type="text"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                autoComplete="name"
                required
              />
              <label>Correo</label>
              <input type="email" value={correo} disabled readOnly />
              <label>Celular</label>
              <input
                type="tel"
                value={celular}
                onChange={(e) => setCelular(e.target.value)}
                inputMode="numeric"
                autoComplete="tel"
                required
              />
              <p className="perfil-ingreso">
                Ingreso: {tieneContrasena ? 'Correo y contraseña' : 'Cuenta de Google'}
              </p>
              {errorDatos && <p className="perfil-error">{errorDatos}</p>}
              {mensajeDatos && <p className="perfil-ok">{mensajeDatos}</p>}
              <button type="submit" className="btn-mapa" disabled={guardandoDatos}>
                {guardandoDatos ? 'Guardando...' : 'Guardar datos'}
              </button>
            </form>

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
    </div>
  );
};

export default MiPerfil;
