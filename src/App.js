import React, { useState, useEffect } from 'react';
import appfirebase from '../src/components/credenciales';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import Login from '../src/components/Login';
import Home from '../src/components/Home';
import VerificarEmail from '../src/components/VerificarEmail';
import Barra from '../src/components/Barra';
import './App.css';

const auth = getAuth(appfirebase);

function App() {
  const [usuario, setUsuario] = useState(null);
  const [correoConfirmado, setCorreoConfirmado] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (usuariofirebase) => {
      setUsuario(usuariofirebase);
      setCorreoConfirmado(!!usuariofirebase?.emailVerified);
    });

    return () => unsubscribe();
  }, []);

  let pantalla = <Login />;
  if (usuario && correoConfirmado) {
    pantalla = <Home correoUsuario={usuario.email} />;
  } else if (usuario) {
    pantalla = <VerificarEmail onConfirmado={() => setCorreoConfirmado(true)} />;
  }

  return (
    <div>
      {usuario && <Barra usuario={usuario} />}
      {pantalla}
    </div>
  );
}

export default App;
