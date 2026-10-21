import React, { useState, useEffect } from 'react';
import imagenLogin from '../assets/banner-ciudad-celu.jpg';
import appFirebase from './credenciales';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, GoogleAuthProvider, signInWithPopup, sendPasswordResetEmail } from 'firebase/auth';

const auth = getAuth(appFirebase);

const Login = () => {
  const [registrando, setRegistrando] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [mostrarRecupero, setMostrarRecupero] = useState(false);
  const [correoRecupero, setCorreoRecupero] = useState('');
  const [mensajeRecupero, setMensajeRecupero] = useState('');
  const [enviandoRecupero, setEnviandoRecupero] = useState(false);

  const functauth = async (e) => {
    e.preventDefault();
    const correo = e.target.email.value;
    const contraseña = e.target.password.value;

    try {
      if (registrando) {
        await createUserWithEmailAndPassword(auth, correo, contraseña);
        setMensaje('¡Usuario registrado con éxito!');
        // Limpia los campos del formulario después de un registro exitoso
        e.target.email.value = '';
        e.target.password.value = '';
      } else {
        await signInWithEmailAndPassword(auth, correo, contraseña);
        setMensaje('¡Inicio de sesión exitoso!');
        // Aquí podrías redirigir a la página de inicio o hacer alguna acción después de iniciar sesión
      }
    } catch (error) {
      console.error('Error de autenticación:', error);
      if (registrando && error.code === 'auth/email-already-in-use') {
        setMensaje('El correo electrónico ya está en uso. Intenta iniciar sesión.');
      } else {
        setMensaje('Error al autenticar. Verifica tus datos e intenta nuevamente.');
      }
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
      await sendPasswordResetEmail(auth, correo);
      setMensajeRecupero('Te enviamos un correo para restablecer la contraseña. Revisá también el spam.');
    } catch (error) {
      console.error('Error al recuperar contraseña:', error);
      if (error.code === 'auth/invalid-email') {
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
    try {
      await signInWithPopup(auth, provider);
      setMensaje('¡Inicio de sesión con Google exitoso!');
    } catch (error) {
      if (error.code === 'auth/popup-closed-by-user' || error.code === 'auth/cancelled-popup-request') {
        return;
      }
      console.error('Error al iniciar sesión con Google:', error);
      setMensaje('Error al iniciar sesión con Google. Intenta nuevamente.');
    }
  };

  useEffect(() => {
    setMensaje('');
  }, [registrando]);

  return (
    <div className="container">
      <div className="row">
        <div className="col-md-4">
          <div className="padre">
            <div className="card card-body shadow-lg">
              <img src={imagenLogin} alt="Ciudad con vecinos, un perro y un pin de mapa" className='imagen-login'/>
              {registrando && (
                <>
                  <h2 className="verificacion-titulo">Crear cuenta</h2>
                  <p className="verificacion-texto">Completá el correo y una contraseña de al menos 6 caracteres.</p>
                </>
              )}
              <form onSubmit={functauth}>
                <input type="email" placeholder='Correo electrónico' className='caja-texto' id='email' required />
                <input type="password" placeholder='Contraseña' className='caja-texto' id='password' required minLength={registrando ? 6 : undefined} />
                <button className='btnform'>{registrando ? "Registrarse" : "Iniciar sesión"}</button>
              </form>
              {!registrando && (
                <button type="button" className='btn-recupero' onClick={abrirRecupero}>
                  Olvidé mi contraseña
                </button>
              )}
              <button className='btnform btn-google' onClick={signInWithGoogle}>
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
