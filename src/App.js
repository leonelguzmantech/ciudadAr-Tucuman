import React, { useState, useEffect } from 'react';
import appfirebase from '../src/components/credenciales';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import Login from '../src/components/Login';
import Home from '../src/components/Home';
import './App.css';

const auth = getAuth(appfirebase);

function App() {
  const [usuario, setUsuario] = useState(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (usuariofirebase) => {
      if (usuariofirebase) {
        // Solo establecer usuario si hay un usuariofirebase, pero no cambiarlo si ya hay uno registrado
        if (!usuario) {
          setUsuario(usuariofirebase);
        }
      } else {
        setUsuario(null);
      }
    });

    // Limpia el listener al desmontar el componente
    return () => unsubscribe();
  }, [usuario]);

  return (
    <div>
      {usuario ? <Home correoUsuario={usuario.email} /> : <Login />}
    </div>
  );
}

export default App;
