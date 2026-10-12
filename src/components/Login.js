import React, { useState, useEffect } from 'react';
import imagenLogin from '../assets/checkmark.png';
import appFirebase from './credenciales';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';

const auth = getAuth(appFirebase);

const Login = () => {
  const [registrando, setRegistrando] = useState(false);
  const [mensaje, setMensaje] = useState('');

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

  const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
      setMensaje('¡Inicio de sesión con Google exitoso!');
      // Aquí podrías redirigir a la página de inicio o hacer alguna acción después de iniciar sesión
    } catch (error) {
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
              <img src={imagenLogin} alt="" className='imagen-login'/>
              <form onSubmit={functauth}>
                <input type="text" placeholder='Correo electrónico' className='caja-texto' id='email' />
                <input type="password" placeholder='Contraseña' className='caja-texto' id='password' />
                <button className='btnform'>{registrando ? "Registrarse" : "Iniciar sesión"}</button>
              </form>
              <button className='btnform' onClick={signInWithGoogle}>Iniciar sesión con Google</button>
              <h4 className='textbtnform2'>{registrando ? "¿Ya tienes cuenta?" : "¿No tienes cuenta?"}<button className='btnform2' onClick={() => setRegistrando(!registrando)}>{registrando ? "Iniciar sesión" : "Registrarse"}</button></h4>
              {mensaje && <p className="mensaje">{mensaje}</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
