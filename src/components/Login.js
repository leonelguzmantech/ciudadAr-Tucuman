import React, { useState, useEffect } from 'react';
import axios from 'axios';
import logoCiudad from '../assets/ciudadar-logo-circulo-estilo.jpg';
import appFirebase from './credenciales';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, GoogleAuthProvider, signInWithPopup, sendPasswordResetEmail } from 'firebase/auth';

const celularValido = (valor) => {
  const digitos = String(valor || '').replace(/\D/g, '');
  return digitos.length >= 8 && digitos.length <= 15;
};

const guardarCuenta = (datos) => axios.post('http://localhost:5001/api/usuarios', datos);

const auth = getAuth(appFirebase);

const Login = () => {
  const [registrando, setRegistrando] = useState(false);
  const [correo, setCorreo] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [celular, setCelular] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [mostrarRecupero, setMostrarRecupero] = useState(false);
  const [correoRecupero, setCorreoRecupero] = useState('');
  const [mensajeRecupero, setMensajeRecupero] = useState('');
  const [enviandoRecupero, setEnviandoRecupero] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const mensajeErrorAuth = (error, esRegistro) => {
    switch (error?.code) {
      case 'auth/email-already-in-use':
        return 'Ese correo ya está registrado. Probá iniciar sesión.';
      case 'auth/invalid-email':
        return 'El correo no es válido.';
      case 'auth/weak-password':
        return 'La contraseña tiene que tener al menos 6 caracteres.';
      case 'auth/user-not-found':
      case 'auth/wrong-password':
      case 'auth/invalid-credential':
        return 'Correo o contraseña incorrectos.';
      case 'auth/too-many-requests':
        return 'Demasiados intentos. Esperá un momento y probá de nuevo.';
      case 'auth/network-request-failed':
        return 'Sin conexión. Revisá internet e intentá de nuevo.';
      case 'auth/user-disabled':
        return 'Esa cuenta está deshabilitada.';
      default:
        return esRegistro
          ? 'No se pudo registrar. Revisá los datos e intentá de nuevo.'
          : 'No se pudo iniciar sesión. Revisá los datos e intentá de nuevo.';
    }
  };

  const functauth = async (e) => {
    e.preventDefault();
    const correoIngresado = correo.trim();
    const contraseña = contrasena;
    const celularIngresado = celular;

    if (!correoIngresado || !contraseña) {
      setMensaje('Completá correo y contraseña.');
      return;
    }
    if (registrando && !celularValido(celularIngresado)) {
      setMensaje('Escribí un celular válido.');
      return;
    }

    setEnviando(true);
    setMensaje('');
    try {
      if (registrando) {
        await createUserWithEmailAndPassword(auth, correoIngresado, contraseña);
        try {
          await guardarCuenta({
            email: correoIngresado,
            telefono: celularIngresado.trim(),
            proveedor: 'correo',
          });
        } catch (_) {
          // La cuenta de Firebase ya quedó: el celular se pide después
        }
        setMensaje('¡Usuario registrado! Revisá el correo para confirmar la cuenta.');
        setCorreo('');
        setContrasena('');
        setCelular('');
      } else {
        await signInWithEmailAndPassword(auth, correoIngresado, contraseña);
        // No bloquear el ingreso si el backend no responde
        await guardarCuenta({ email: correoIngresado, proveedor: 'correo' }).catch(() => {});
        setMensaje('¡Inicio de sesión exitoso!');
      }
    } catch (error) {
      console.error('Error de autenticación:', error);
      setMensaje(mensajeErrorAuth(error, registrando));
    } finally {
      setEnviando(false);
    }
  };

  const abrirRecupero = () => {
    setCorreoRecupero('');
    setMensajeRecupero('');
    setMostrarRecupero(true);
  };

  const cerrarRecupero = () => {
    setMostrarRecupero(false);
  };

  const recuperarContrasena = async (e) => {
    e.preventDefault();
    const correo = correoRecupero.trim();
    if (!correo) {
      setMensajeRecupero('Escribí el correo de la cuenta que querés recuperar.');
      return;
    }
    setEnviandoRecupero(true);
    try {
      let proveedor = '';
      try {
        const cuenta = await axios.get(
          `http://localhost:5001/api/usuarios/correo/${encodeURIComponent(correo)}`
        );
        proveedor = cuenta.data.proveedor;
      } catch (errorCuenta) {
        if (errorCuenta.response?.status !== 404) throw errorCuenta;
      }
      await sendPasswordResetEmail(auth, correo);
      if (!proveedor) {
        await guardarCuenta({ email: correo, proveedor: 'google' }).catch(() => {});
      }
      setMensajeRecupero(
        proveedor === 'google' || !proveedor
          ? 'Si la cuenta entró con Google, este correo sirve para crear una contraseña de CiudadAr. Revisá también el spam.'
          : 'Te enviamos un correo para restablecer la contraseña. Revisá también el spam.'
      );
    } catch (error) {
      console.error('Error al recuperar contraseña:', error);
      if (error.response?.status === 404) {
        setMensajeRecupero('No hay una cuenta registrada con ese correo.');
      } else if (error.code === 'auth/invalid-email') {
        setMensajeRecupero('El correo no es válido.');
      } else if (error.code === 'auth/user-not-found') {
        setMensajeRecupero('No hay una cuenta registrada con ese correo.');
      } else if (error.code === 'auth/too-many-requests') {
        setMensajeRecupero('Demasiados intentos. Esperá un momento y probá de nuevo.');
      } else {
        setMensajeRecupero('No se pudo enviar el correo. Intentá de nuevo.');
      }
    } finally {
      setEnviandoRecupero(false);
    }
  };

  const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    setEnviando(true);
    setMensaje('');
    try {
      const credencial = await signInWithPopup(auth, provider);
      await guardarCuenta({
        email: credencial.user.email,
        nombre: credencial.user.displayName || '',
        proveedor: 'google',
      }).catch(() => {});
      setMensaje('¡Inicio de sesión con Google exitoso!');
    } catch (error) {
      if (error.code === 'auth/popup-closed-by-user' || error.code === 'auth/cancelled-popup-request') {
        return;
      }
      console.error('Error al iniciar sesión con Google:', error);
      setMensaje(
        error.code === 'auth/network-request-failed'
          ? 'Sin conexión. Revisá internet e intentá de nuevo.'
          : 'No se pudo iniciar sesión con Google. Intentá de nuevo.'
      );
    } finally {
      setEnviando(false);
    }
  };

  useEffect(() => {
    setMensaje('');
    setCorreo('');
    setContrasena('');
    setCelular('');
  }, [registrando]);

  return (
    <div className="pantalla-acceso">
      <div className="pantalla-acceso-tarjeta">
            <div className="card card-body shadow-lg">
              <img src={logoCiudad} alt="CiudadAr" className="logo-acceso" />
              {registrando && (
                <>
                  <h2 className="verificacion-titulo">Crear cuenta</h2>
                  <p className="verificacion-texto">Completá el correo, una contraseña de al menos 6 caracteres y tu celular.</p>
                </>
              )}
              <form onSubmit={functauth} autoComplete="on">
                <input
                  type="email"
                  placeholder="Correo electrónico"
                  className="caja-texto"
                  name="email"
                  autoComplete="username"
                  value={correo}
                  onChange={(event) => setCorreo(event.target.value)}
                  required
                />
                <input
                  type="password"
                  placeholder="Contraseña"
                  className="caja-texto"
                  name="password"
                  autoComplete={registrando ? 'new-password' : 'current-password'}
                  value={contrasena}
                  onChange={(event) => setContrasena(event.target.value)}
                  required
                  minLength={registrando ? 6 : undefined}
                />
                {registrando && (
                  <input
                    type="tel"
                    placeholder="Celular"
                    className="caja-texto"
                    name="tel"
                    autoComplete="tel"
                    value={celular}
                    onChange={(event) => setCelular(event.target.value)}
                    inputMode="numeric"
                    required
                  />
                )}
                <button className="btnform" type="submit" disabled={enviando}>
                  {enviando
                    ? (registrando ? 'Registrando...' : 'Ingresando...')
                    : (registrando ? 'Registrarse' : 'Iniciar sesión')}
                </button>
              </form>
              {!registrando && (
                <button type="button" className='btn-recupero' onClick={abrirRecupero}>
                  Olvidé mi contraseña
                </button>
              )}
              <button type="button" className="btnform btn-google" onClick={signInWithGoogle} disabled={enviando}>
                <svg className="logo-google" viewBox="0 0 48 48" aria-hidden="true">
                  <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303C33.654 32.657 29.083 36 24 36c-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"/>
                  <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"/>
                  <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"/>
                  <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"/>
                </svg>
                {registrando ? 'Registrarse con Google' : 'Iniciar sesión con Google'}
              </button>
              <h4 className='textbtnform2'>{registrando ? "¿Ya tienes cuenta?" : "¿No tienes cuenta?"}<button className='btnform2' onClick={() => setRegistrando(!registrando)}>{registrando ? "Iniciar sesión" : "Registrarse"}</button></h4>
              {mensaje && <p className="mensaje">{mensaje}</p>}
            </div>
      </div>
      {mostrarRecupero && (
        <div className="ventana-fondo" onClick={cerrarRecupero}>
          <div
            className="ventana-recupero"
            role="dialog"
            aria-labelledby="titulo-recupero"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="titulo-recupero" className="verificacion-titulo">Recuperar contraseña</h2>
            <p className="verificacion-texto">
              Escribí el correo con el que te registraste. Te vamos a enviar un enlace para elegir una contraseña nueva.
            </p>
            <form onSubmit={recuperarContrasena}>
              <input
                type="email"
                className="caja-texto"
                placeholder="Correo de recuperación"
                value={correoRecupero}
                onChange={(event) => setCorreoRecupero(event.target.value)}
                autoFocus
              />
              <button className="btnform" type="submit" disabled={enviandoRecupero}>
                {enviandoRecupero ? 'Enviando...' : 'Enviar enlace'}
              </button>
            </form>
            {mensajeRecupero && <p className="verificacion-texto">{mensajeRecupero}</p>}
            <button type="button" className="btn-recupero" onClick={cerrarRecupero}>
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Login;
