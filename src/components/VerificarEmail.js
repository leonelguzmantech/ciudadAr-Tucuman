import React, { useEffect, useState } from 'react';
import { getAuth, sendEmailVerification, signOut } from 'firebase/auth';
import appFirebase from './credenciales';
import logoCiudad from '../assets/ciudadar-logo-circulo-estilo.jpg';

const auth = getAuth(appFirebase);

const VerificarEmail = ({ onConfirmado }) => {
  const usuario = auth.currentUser;
  const [mensaje, setMensaje] = useState('');
  const [enviando, setEnviando] = useState(false);

  const enviarCorreo = async (avisoInicial) => {
    if (!usuario) return;
    setEnviando(true);
    try {
      await sendEmailVerification(usuario);
      setMensaje(
        avisoInicial
          ? `Te enviamos un enlace a ${usuario.email}. Abrilo para confirmar el correo. Revisá también el spam.`
          : 'Reenviamos el enlace. Revisá también el spam.'
      );
    } catch (error) {
      console.error('Error al enviar confirmación:', error);
      if (error.code === 'auth/too-many-requests') {
        setMensaje('Ya enviamos varios correos. Esperá un momento y probá de nuevo.');
      } else {
        setMensaje('No se pudo enviar el correo. Intentá de nuevo.');
      }
    } finally {
      setEnviando(false);
    }
  };

  useEffect(() => {
    if (!usuario?.email) return;
    const clave = `verificacion-enviada:${usuario.email}`;
    if (sessionStorage.getItem(clave)) {
      setMensaje(`Te enviamos un enlace a ${usuario.email}. Abrilo para confirmar el correo.`);
      return;
    }
    sessionStorage.setItem(clave, '1');
    enviarCorreo(true);
    // El correo se envía una sola vez al llegar a esta pantalla.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuario?.email]);

  const yaConfirme = async () => {
    if (!auth.currentUser) return;
    await auth.currentUser.reload();
    if (auth.currentUser.emailVerified) {
      onConfirmado();
      return;
    }
    setMensaje('Todavía no figura como confirmado. Abrí el enlace del correo y volvé a intentar.');
  };

  return (
    <div className="pantalla-acceso">
      <div className="pantalla-acceso-tarjeta">
            <div className="card card-body shadow-lg">
              <img src={logoCiudad} alt="CiudadAr" className="logo-acceso" />
              <h2 className="verificacion-titulo">Confirmá tu correo</h2>
              <p className="verificacion-texto">
                Para usar el mapa, {usuario?.email || 'tu correo'} tiene que estar confirmado.
              </p>
              {mensaje && <p className="verificacion-texto">{mensaje}</p>}
              <button type="button" className="btnform" onClick={yaConfirme}>
                Ya confirmé, entrar
              </button>
              <button
                type="button"
                className="btnform"
                onClick={() => enviarCorreo(false)}
                disabled={enviando}
              >
                Reenviar correo
              </button>
              <button type="button" className="btn-recupero" onClick={() => signOut(auth)}>
                Cerrar sesión
              </button>
            </div>
      </div>
    </div>
  );
};

export default VerificarEmail;
