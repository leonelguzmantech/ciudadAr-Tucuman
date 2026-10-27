import React, { useState, useEffect } from 'react';
import appfirebase from '../src/components/credenciales';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import Login from '../src/components/Login';
import Home from '../src/components/Home';
import VerificarEmail from '../src/components/VerificarEmail';
import CompletarCelular from '../src/components/CompletarCelular';
import Barra from '../src/components/Barra';
import './App.css';
import axios from 'axios';

const auth = getAuth(appfirebase);

function App() {
  const [usuario, setUsuario] = useState(null);
  const [correoConfirmado, setCorreoConfirmado] = useState(false);
  const [sesionLista, setSesionLista] = useState(false);
  const [cuentaLista, setCuentaLista] = useState(false);
  const [tieneCelular, setTieneCelular] = useState(false);
  const [panelVecino, setPanelVecino] = useState(null);
  const [noLeidas, setNoLeidas] = useState(0);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (usuariofirebase) => {
      setUsuario(usuariofirebase);
      setCorreoConfirmado(!!usuariofirebase?.emailVerified);
      setSesionLista(true);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!usuario?.email || !correoConfirmado) {
      setCuentaLista(false);
      setTieneCelular(false);
      return undefined;
    }
    let cancelado = false;
    axios.get('http://localhost:5001/api/usuarios/me', {
      headers: { 'x-user-id': usuario.email },
    }).then((respuesta) => {
      if (cancelado) return;
      setTieneCelular(!!respuesta.data.telefono);
      setCuentaLista(true);
    }).catch((error) => {
      if (cancelado) return;
      if (error.response?.status === 404) {
        setTieneCelular(false);
        setCuentaLista(true);
        return;
      }
      setTieneCelular(true);
      setCuentaLista(true);
    });
    return () => {
      cancelado = true;
    };
  }, [usuario, correoConfirmado]);

  if (!sesionLista) {
    return <div className="cargando-sesion">Cargando...</div>;
  }

  const entroConGoogle = !!usuario?.providerData?.some((dato) => dato.providerId === 'google.com')
    && !usuario?.providerData?.some((dato) => dato.providerId === 'password');

  const enMapa = !!(usuario && correoConfirmado && cuentaLista && tieneCelular);

  let pantalla = <Login />;
  if (usuario && correoConfirmado && !cuentaLista) {
    pantalla = <div className="cargando-sesion">Cargando...</div>;
  } else if (usuario && correoConfirmado && !tieneCelular) {
    pantalla = (
      <CompletarCelular
        correo={usuario.email}
        nombre={usuario.displayName}
        proveedor={entroConGoogle ? 'google' : 'correo'}
        onListo={() => setTieneCelular(true)}
      />
    );
  } else if (usuario && correoConfirmado) {
    pantalla = (
      <Home
        correoUsuario={usuario.email}
        panelVecino={panelVecino}
        onPanelVecinoVisto={() => setPanelVecino(null)}
        onNoLeidasChange={setNoLeidas}
      />
    );
  } else if (usuario) {
    pantalla = <VerificarEmail onConfirmado={() => setCorreoConfirmado(true)} />;
  }

  return (
    <div className={enMapa ? 'app-shell' : undefined}>
      {usuario && (
        <Barra
          usuario={usuario}
          noLeidas={noLeidas}
          conSidebar={enMapa}
          onFiltros={() => setPanelVecino('filtros')}
          onMisReportes={() => setPanelVecino('mis-reportes')}
          onNotificaciones={() => setPanelVecino('notificaciones')}
        />
      )}
      <div className={enMapa ? 'app-principal' : undefined}>
        {pantalla}
      </div>
    </div>
  );
}

export default App;
