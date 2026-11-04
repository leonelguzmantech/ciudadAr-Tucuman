import React, { useState, useEffect } from 'react';
import appfirebase from '../src/components/credenciales';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import Login from '../src/components/Login';
import Home from '../src/components/Home';
import VerificarEmail from '../src/components/VerificarEmail';
import CompletarCelular from '../src/components/CompletarCelular';
import Barra from '../src/components/Barra';
import AdminDashboard from '../src/components/AdminDashboard';
import SuperDashboard from '../src/components/SuperDashboard';
import OperarioDashboard from '../src/components/OperarioDashboard';
import './App.css';
import axios from 'axios';

const auth = getAuth(appfirebase);

const leerVistaAdmin = () => {
  try {
    const guardada = sessionStorage.getItem('ciudadar-vista-admin');
    if (guardada === 'mapa' || guardada === 'dashboard' || guardada === 'casos') return guardada;
  } catch {
    /* ignore */
  }
  return 'dashboard';
};

function App() {
  const [usuario, setUsuario] = useState(null);
  const [correoConfirmado, setCorreoConfirmado] = useState(false);
  const [sesionLista, setSesionLista] = useState(false);
  const [cuentaLista, setCuentaLista] = useState(false);
  const [tieneCelular, setTieneCelular] = useState(false);
  const [panelVecino, setPanelVecino] = useState(null);
  const [noLeidas, setNoLeidas] = useState(0);
  const [perdidasNoLeidas, setPerdidasNoLeidas] = useState(0);
  const [esAdmin, setEsAdmin] = useState(false);
  const [esOperario, setEsOperario] = useState(false);
  const [rolAdmin, setRolAdmin] = useState('');
  const [rolListo, setRolListo] = useState(false);
  // dashboard | mapa | casos (super → panel municipal de casos)
  const [vistaAdmin, setVistaAdmin] = useState(leerVistaAdmin);
  // Caso a enfocar en el mapa vecino (desde "Ver en el mapa" del dashboard)
  const [focoCasoMapa, setFocoCasoMapa] = useState(null);

  useEffect(() => {
    try {
      sessionStorage.setItem('ciudadar-vista-admin', vistaAdmin);
    } catch {
      /* ignore */
    }
  }, [vistaAdmin]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (usuariofirebase) => {
      setUsuario(usuariofirebase);
      setCorreoConfirmado(!!usuariofirebase?.emailVerified);
      setSesionLista(true);
      if (!usuariofirebase) {
        setEsAdmin(false);
        setEsOperario(false);
        setRolAdmin('');
        setRolListo(false);
        setVistaAdmin('dashboard');
        // No heredar vistas/filtros entre sesiones (admin arranca en Inicio)
        try {
          sessionStorage.removeItem('ciudadar-mis-reportes-vista');
          sessionStorage.removeItem('ciudadar-radar-vista');
          sessionStorage.removeItem('ciudadar-admin-seccion');
          sessionStorage.removeItem('ciudadar-super-seccion');
          sessionStorage.removeItem('ciudadar-super-casos-foco');
          sessionStorage.setItem('ciudadar-vista-admin', 'dashboard');
        } catch {
          /* ignore */
        }
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
      setEsOperario(false);
      setRolAdmin('');
      setRolListo(false);
      return undefined;
    }
    let cancelado = false;
    setRolListo(false);
    axios.get('http://localhost:5001/api/auth/me', {
      headers: { 'x-user-id': usuario.email },
    }).then((respuesta) => {
      if (cancelado) return;
      const role = respuesta.data.role || '';
      const soloOperario = role === 'OPERARIO' || !!respuesta.data.isOperario;
      setEsOperario(soloOperario);
      setEsAdmin(!!respuesta.data.isAdmin);
      setRolAdmin(role);
      setRolListo(true);
      // Operario: solo panel cuadrilla (sin vista vecino)
      if (soloOperario && role === 'OPERARIO') {
        setVistaAdmin((v) => (v === 'mapa' ? 'dashboard' : v));
      }
    }).catch(() => {
      if (cancelado) return;
      setEsAdmin(false);
      setEsOperario(false);
      setRolAdmin('');
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
  const esSuper = rolAdmin === 'SUPER_ADMIN';
  const esSoloOperario = esOperario && rolAdmin === 'OPERARIO';
  const enPanelAdmin = !!(
    sesionCompleta && rolListo && esAdmin
    && (esSoloOperario || vistaAdmin === 'dashboard' || vistaAdmin === 'casos')
  );
  const enDashboardAdmin = enPanelAdmin;
  const enMapaVecino = !!(
    sesionCompleta && rolListo && !esSoloOperario
    && (!esAdmin || vistaAdmin === 'mapa')
  );
  const irMapaVecino = () => {
    setFocoCasoMapa(null);
    setVistaAdmin('mapa');
  };

  const abrirCasoDesdeNotifAdmin = (foco = {}) => {
    try {
      sessionStorage.setItem('ciudadar-super-casos-foco', JSON.stringify(foco || {}));
    } catch {
      /* ignore */
    }
    setFocoCasoMapa(null);
    // Super: entrar directo a Operar casos; municipal: su dashboard de casos
    setVistaAdmin(esSuper ? 'casos' : 'dashboard');
  };

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
  } else if (enPanelAdmin && esSoloOperario) {
    pantalla = (
      <OperarioDashboard
        userId={usuario.email}
      />
    );
  } else if (enPanelAdmin && esSuper && vistaAdmin === 'dashboard') {
    pantalla = (
      <SuperDashboard
        userId={usuario.email}
        onOperarCasos={(foco = {}) => {
          try {
            sessionStorage.setItem('ciudadar-super-casos-foco', JSON.stringify(foco || {}));
          } catch {
            /* ignore */
          }
          setVistaAdmin('casos');
        }}
        onSalirMapaVecino={irMapaVecino}
      />
    );
  } else if (enPanelAdmin) {
    pantalla = (
      <AdminDashboard
        userId={usuario.email}
        onSalirMapaVecino={irMapaVecino}
        onVolverSuper={esSuper ? () => setVistaAdmin('dashboard') : undefined}
      />
    );
  } else if (usuario && correoConfirmado) {
    pantalla = (
      <Home
        correoUsuario={usuario.email}
        panelVecino={panelVecino}
        onPanelVecinoVisto={() => setPanelVecino(null)}
        onNoLeidasChange={setNoLeidas}
        onPerdidasNoLeidasChange={setPerdidasNoLeidas}
        onAbrirCasoAdmin={esAdmin ? abrirCasoDesdeNotifAdmin : null}
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
          perdidasNoLeidas={perdidasNoLeidas}
          conSidebar
          esAdmin={esAdmin}
          esOperario={esSoloOperario}
          onFiltros={() => setPanelVecino('filtros')}
          onReportar={() => setPanelVecino('reportar')}
          onMisReportes={() => setPanelVecino('mis-reportes')}
          onCosasPerdidas={() => setPanelVecino('cosas-perdidas')}
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
