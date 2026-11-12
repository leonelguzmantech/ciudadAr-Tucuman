import React, { useState, useEffect } from 'react';
import appfirebase from '../src/components/credenciales';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import Login from '../src/components/Login';
import Home from '../src/components/Home';
import VerificarEmail from '../src/components/VerificarEmail';
import CompletarCelular from '../src/components/CompletarCelular';
import VerificarCelular from '../src/components/VerificarCelular';
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
  const [celularConfirmado, setCelularConfirmado] = useState(false);
  const [telefonoUsuario, setTelefonoUsuario] = useState('');
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
  const [cuentaDesactivada, setCuentaDesactivada] = useState('');

  useEffect(() => {
    try {
      sessionStorage.setItem('ciudadar-vista-admin', vistaAdmin);
    } catch {
      /* ignore */
    }
  }, [vistaAdmin]);

  useEffect(() => {
    let habiaUsuario = false;
    const unsubscribe = onAuthStateChanged(auth, (usuariofirebase) => {
      setUsuario(usuariofirebase);
      setCorreoConfirmado(!!usuariofirebase?.emailVerified);
      setSesionLista(true);
      if (usuariofirebase) {
        habiaUsuario = true;
        return;
      }
      setEsAdmin(false);
      setEsOperario(false);
      setRolAdmin('');
      setRolListo(false);
      setTieneCelular(false);
      setCelularConfirmado(false);
      setTelefonoUsuario('');
      setCuentaLista(false);
      setVistaAdmin('dashboard');
      // Solo limpiar al cerrar sesión de verdad (no en el flash null del refresh)
      if (!habiaUsuario) return;
      habiaUsuario = false;
      try {
        sessionStorage.removeItem('ciudadar-mis-reportes-vista');
        sessionStorage.removeItem('ciudadar-radar-vista');
        sessionStorage.removeItem('ciudadar-admin-seccion');
        sessionStorage.removeItem('ciudadar-super-seccion');
        sessionStorage.removeItem('ciudadar-super-casos-foco');
        sessionStorage.setItem('ciudadar-vista-admin', 'dashboard');
        localStorage.removeItem('ciudadar-radar-prefs');
      } catch {
        /* ignore */
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!usuario?.email || !correoConfirmado) {
      setCuentaLista(false);
      setTieneCelular(false);
      setCelularConfirmado(false);
      setTelefonoUsuario('');
      setEsAdmin(false);
      setEsOperario(false);
      setRolAdmin('');
      setRolListo(false);
      return undefined;
    }
    let cancelado = false;
    setRolListo(false);
    const headers = { 'x-user-id': usuario.email };
    Promise.all([
      axios.get('http://localhost:5001/api/usuarios/me', { headers }).catch((err) => err),
      axios.get('http://localhost:5001/api/auth/me', { headers }).catch(() => null),
    ]).then(([meRes, authRes]) => {
      if (cancelado) return;
      if (meRes?.response?.status === 403 && meRes.response?.data?.code === 'CUENTA_DESACTIVADA') {
        const msg = meRes.response.data?.message
          || 'Tu cuenta fue desactivada por el municipio.';
        setCuentaDesactivada(msg);
        setCuentaLista(true);
        setRolListo(true);
        auth.signOut().catch(() => {});
        return;
      }
      setCuentaDesactivada('');
      const role = authRes?.data?.role || '';
      const soloOperario = role === 'OPERARIO' || !!authRes?.data?.isOperario;
      const esStaff = !!authRes?.data?.isAdmin || soloOperario
        || role === 'SUPER_ADMIN'
        || role === 'JURISDICTION_ADMIN'
        || role === 'OPERARIO';

      if (esStaff) {
        setEsOperario(soloOperario);
        setEsAdmin(!!authRes.data.isAdmin);
        setRolAdmin(role);
        setRolListo(true);
        setTieneCelular(true);
        setCelularConfirmado(true);
        setTelefonoUsuario(meRes?.data?.telefono || '');
        setCuentaLista(true);
        if (soloOperario && role === 'OPERARIO') {
          setVistaAdmin((v) => (v === 'mapa' ? 'dashboard' : v));
        }
        return;
      }

      setEsAdmin(false);
      setEsOperario(false);
      setRolAdmin(role || 'PUBLIC_USER');
      setRolListo(true);

      if (meRes?.response?.status === 404 || meRes?.isAxiosError) {
        if (meRes?.response?.status === 404) {
          setTieneCelular(false);
          setCelularConfirmado(false);
          setTelefonoUsuario('');
          setCuentaLista(true);
          return;
        }
        // Error de red u otro: no bloquear
        setTieneCelular(true);
        setCelularConfirmado(true);
        setCuentaLista(true);
        return;
      }

      // Vecino: perfil completo = nombre + DNI + celular + fotos DNI
      setTieneCelular(!!meRes.data?.perfilCompleto);
      setCelularConfirmado(!!meRes.data?.telefonoConfirmado);
      setTelefonoUsuario(meRes.data?.telefono || '');
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

  const sesionCompleta = !!(
    usuario && correoConfirmado && cuentaLista && tieneCelular && celularConfirmado
  );
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
  if (cuentaDesactivada && !usuario) {
    pantalla = (
      <div className="pantalla-acceso">
        <div className="pantalla-acceso-tarjeta">
          <div className="card card-body shadow-lg">
            <h2 className="verificacion-titulo">Cuenta desactivada</h2>
            <p className="verificacion-texto">{cuentaDesactivada}</p>
            <button
              type="button"
              className="btnform"
              onClick={() => setCuentaDesactivada('')}
            >
              Volver al inicio
            </button>
          </div>
        </div>
      </div>
    );
  } else if (usuario && correoConfirmado && !cuentaLista) {
    pantalla = <div className="cargando-sesion">Cargando...</div>;
  } else if (usuario && correoConfirmado && !tieneCelular) {
    pantalla = (
      <CompletarCelular
        correo={usuario.email}
        nombre={usuario.displayName}
        proveedor={entroConGoogle ? 'google' : 'correo'}
        onListo={(datos) => {
          setTieneCelular(true);
          const tel = datos?.telefono || telefonoUsuario;
          if (tel) setTelefonoUsuario(tel);
          // Solo pedir OTP si el celular no quedó confirmado (número nuevo o cambiado).
          setCelularConfirmado(!!datos?.telefonoConfirmado);
        }}
      />
    );
  } else if (usuario && correoConfirmado && !celularConfirmado) {
    pantalla = (
      <VerificarCelular
        correo={usuario.email}
        telefonoInicial={telefonoUsuario}
        onListo={() => setCelularConfirmado(true)}
        onCambiarCelular={() => setTieneCelular(false)}
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
          esSuper={esSuper}
          onFiltros={() => setPanelVecino('filtros')}
          onReportar={() => setPanelVecino('reportar')}
          onMisReportes={() => setPanelVecino('mis-reportes')}
          onCosasPerdidas={() => setPanelVecino('cosas-perdidas')}
          onNotificaciones={() => setPanelVecino('notificaciones')}
          onDashboardAdmin={esAdmin ? () => setVistaAdmin('dashboard') : undefined}
          onPerfilActualizado={(datos) => {
            if (datos && datos.telefonoConfirmado === false) {
              setTelefonoUsuario(datos.telefono || telefonoUsuario);
              setCelularConfirmado(false);
            }
          }}
        />
      )}
      <div className={enMapaVecino || enDashboardAdmin ? 'app-principal' : undefined}>
        {pantalla}
      </div>
    </div>
  );
}

export default App;
