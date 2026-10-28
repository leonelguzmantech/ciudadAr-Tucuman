import React, { useState, useEffect } from 'react';
import appfirebase from '../src/components/credenciales';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import Login from '../src/components/Login';
import Home from '../src/components/Home';
import VerificarEmail from '../src/components/VerificarEmail';
import CompletarCelular from '../src/components/CompletarCelular';
import Barra from '../src/components/Barra';
import AdminDashboard from '../src/components/AdminDashboard';
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
  const [esAdmin, setEsAdmin] = useState(false);
  const [rolListo, setRolListo] = useState(false);
  // Por defecto el admin entra al dashboard; puede pasar a vista vecino (mapa) si hace falta
  const [vistaAdmin, setVistaAdmin] = useState('dashboard');
  // Caso a enfocar en el mapa vecino (desde "Ver en el mapa" del dashboard)
  const [focoCasoMapa, setFocoCasoMapa] = useState(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (usuariofirebase) => {
      setUsuario(usuariofirebase);
      setCorreoConfirmado(!!usuariofirebase?.emailVerified);
      setSesionLista(true);
      if (!usuariofirebase) {
        setEsAdmin(false);
        setRolListo(false);
        setVistaAdmin('dashboard');
      }
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

  useEffect(() => {
    if (!usuario?.email || !correoConfirmado || !tieneCelular) {
      setEsAdmin(false);
      setRolListo(false);
      return undefined;
    }
    let cancelado = false;
    setRolListo(false);
    axios.get('http://localhost:5001/api/auth/me', {
      headers: { 'x-user-id': usuario.email },
    }).then((respuesta) => {
      if (cancelado) return;
      setEsAdmin(!!respuesta.data.isAdmin);
      setRolListo(true);
      if (respuesta.data.isAdmin) setVistaAdmin('dashboard');
    }).catch(() => {
      if (cancelado) return;
      setEsAdmin(false);
      setRolListo(true);
    });
    return () => {
      cancelado = true;
    };
  }, [usuario, correoConfirmado, tieneCelular]);

  if (!sesionLista) {
    return <div className="cargando-sesion">Cargando...</div>;
  }

  const entroConGoogle = !!usuario?.providerData?.some((dato) => dato.providerId === 'google.com')
    && !usuario?.providerData?.some((dato) => dato.providerId === 'password');

  const sesionCompleta = !!(usuario && correoConfirmado && cuentaLista && tieneCelular);
  const enDashboardAdmin = !!(sesionCompleta && rolListo && esAdmin && vistaAdmin === 'dashboard');
  const enMapaVecino = !!(sesionCompleta && rolListo && (!esAdmin || vistaAdmin === 'mapa'));

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
  } else if (usuario && correoConfirmado && !rolListo) {
    pantalla = <div className="cargando-sesion">Cargando...</div>;
  } else if (enDashboardAdmin) {
    pantalla = (
      <AdminDashboard
        userId={usuario.email}
        onSalirMapaVecino={() => {
          setFocoCasoMapa(null);
          setVistaAdmin('mapa');
        }}
      />
    );
  } else if (usuario && correoConfirmado) {
    pantalla = (
      <Home
        correoUsuario={usuario.email}
        panelVecino={panelVecino}
        onPanelVecinoVisto={() => setPanelVecino(null)}
        onNoLeidasChange={setNoLeidas}
        esAdmin={esAdmin}
        onAbrirDashboardAdmin={esAdmin ? () => {
          setFocoCasoMapa(null);
          setVistaAdmin('dashboard');
        } : undefined}
        focoCasoMapa={focoCasoMapa}
        onFocoCasoVisto={() => setFocoCasoMapa(null)}
      />
    );
  } else if (usuario) {
    pantalla = <VerificarEmail onConfirmado={() => setCorreoConfirmado(true)} />;
  }

  return (
    <div className={enMapaVecino ? 'app-shell' : (enDashboardAdmin ? 'app-shell app-shell-admin' : undefined)}>
      {usuario && enMapaVecino && (
        <Barra
          usuario={usuario}
          noLeidas={noLeidas}
          conSidebar
          esAdmin={esAdmin}
          onFiltros={() => setPanelVecino('filtros')}
          onMisReportes={() => setPanelVecino('mis-reportes')}
          onNotificaciones={() => setPanelVecino('notificaciones')}
          onDashboardAdmin={esAdmin ? () => setVistaAdmin('dashboard') : undefined}
        />
      )}
      <div className={enMapaVecino || enDashboardAdmin ? 'app-principal' : undefined}>
        {pantalla}
      </div>
    </div>
  );
}

export default App;
