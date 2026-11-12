import React, { useEffect, useState } from 'react';
import { getAuth, signOut } from 'firebase/auth';
import appFirebase from './credenciales';
import logoCiudad from '../assets/ciudadar-logo-circulo-estilo.jpg';
import MiPerfil from './MiPerfil';

const auth = getAuth(appFirebase);

const IconoFiltros = () => (
  <svg className="sidebar-icono" viewBox="0 0 24 24" aria-hidden="true">
    <path
      fill="currentColor"
      d="M4 6h16v2H4V6zm3 5h10v2H7v-2zm3 5h4v2h-4v-2z"
    />
  </svg>
);

const IconoReportar = () => (
  <svg className="sidebar-icono" viewBox="0 0 24 24" aria-hidden="true">
    <path
      fill="currentColor"
      d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"
    />
  </svg>
);

const IconoReportes = () => (
  <svg className="sidebar-icono" viewBox="0 0 24 24" aria-hidden="true">
    <path
      fill="currentColor"
      d="M6 2h9l5 5v15H6V2zm8 1.5V8h4.5L14 3.5zM8 12h8v2H8v-2zm0 4h8v2H8v-2z"
    />
  </svg>
);

const IconoDashboard = () => (
  <svg className="sidebar-icono" viewBox="0 0 24 24" aria-hidden="true">
    <path
      fill="currentColor"
      d="M3 3h8v8H3V3zm10 0h8v5h-8V3zM3 13h8v8H3v-8zm10 7v-8h8v8h-8z"
    />
  </svg>
);

const IconoNotificaciones = () => (
  <svg className="sidebar-icono" viewBox="0 0 24 24" aria-hidden="true">
    <path
      fill="currentColor"
      d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22zm7-6V11a7 7 0 1 0-14 0v5l-2 2v1h18v-1l-2-2z"
    />
  </svg>
);

/** Radar / cercanía (cosas perdidas) */
const IconoPerdidas = () => (
  <svg className="sidebar-icono" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" opacity="0.35" />
    <circle cx="12" cy="12" r="5.5" stroke="currentColor" strokeWidth="1.8" opacity="0.65" />
    <circle cx="12" cy="12" r="2.2" fill="currentColor" />
    <path
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      d="M12 3v2.2M21 12h-2.2M12 21v-2.2M3 12h2.2"
    />
  </svg>
);

const IconoPerfil = () => (
  <svg className="sidebar-icono" viewBox="0 0 24 24" aria-hidden="true">
    <path
      fill="currentColor"
      d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.1 7.1 0 0 0-1.63-.94l-.36-2.54A.5.5 0 0 0 13.9 2h-3.8a.5.5 0 0 0-.5.42l-.36 2.54c-.59.24-1.13.55-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.7 8.48a.5.5 0 0 0 .12.64l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94L2.82 14.58a.5.5 0 0 0-.12.64l1.92 3.32c.13.23.4.32.64.22l2.39-.96c.5.39 1.04.7 1.63.94l.36 2.54c.05.24.26.42.5.42h3.8c.24 0 .45-.18.5-.42l.36-2.54c.59-.24 1.13-.55 1.63-.94l2.39.96c.24.1.51 0 .64-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58zM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7z"
    />
  </svg>
);

const IconoSalir = () => (
  <svg className="sidebar-icono" viewBox="0 0 24 24" aria-hidden="true">
    <path
      fill="currentColor"
      d="M10 17v-3H3v-4h7V7l5 5-5 5zm9-14H11v2h8v14h-8v2h8a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2z"
    />
  </svg>
);

const Barra = ({
  usuario,
  noLeidas = 0,
  perdidasNoLeidas = 0,
  conSidebar = false,
  esAdmin = false,
  esOperario = false,
  esSuper = false,
  onReportar,
  onMisReportes,
  onCosasPerdidas,
  onFiltros,
  onNotificaciones,
  onDashboardAdmin,
  onPerfilActualizado,
}) => {
  const [menuMovilAbierto, setMenuMovilAbierto] = useState(false);
  const [mostrarPerfil, setMostrarPerfil] = useState(false);
  const [nombrePerfil, setNombrePerfil] = useState('');

  useEffect(() => {
    if (!usuario) {
      setMenuMovilAbierto(false);
      setMostrarPerfil(false);
      setNombrePerfil('');
      return;
    }
    setNombrePerfil(usuario.displayName || usuario.email || '');
  }, [usuario]);

  const cerrarSesion = () => {
    setMenuMovilAbierto(false);
    setMostrarPerfil(false);
    try {
      sessionStorage.removeItem('ciudadar-mis-reportes-vista');
      sessionStorage.removeItem('ciudadar-radar-vista');
      localStorage.removeItem('ciudadar-radar-prefs');
    } catch {
      /* ignore */
    }
    signOut(auth).catch((error) => {
      console.error('Error al cerrar sesión:', error);
    });
  };

  const nombre = nombrePerfil || usuario?.email || '';

  if (!conSidebar) {
    return (
      <header className="barra">
        <span className="barra-marca">
          <img src={logoCiudad} alt="CiudadAr" className="barra-logo" />
        </span>
      </header>
    );
  }

  return (
    <>
      <aside className={`sidebar${menuMovilAbierto ? ' abierta' : ''}`}>
        <div className="sidebar-marca">
          <span className="sidebar-marca-logo-wrap" aria-hidden="true">
            <img src={logoCiudad} alt="" className="sidebar-marca-logo" />
          </span>
          <div className="sidebar-marca-texto">
            <strong className="sidebar-marca-nombre">CiudadAr</strong>
            <small className="sidebar-marca-sub">Reportes Tucumán</small>
          </div>
        </div>

        <nav className="sidebar-nav" aria-label="Menú principal">
          <button
            type="button"
            className="sidebar-item"
            onClick={() => {
              setMenuMovilAbierto(false);
              if (onFiltros) onFiltros();
            }}
          >
            <span className="sidebar-item-contenido">
              <IconoFiltros />
              Filtros
            </span>
          </button>
          <button
            type="button"
            className="sidebar-item"
            onClick={() => {
              setMenuMovilAbierto(false);
              if (onReportar) onReportar();
            }}
          >
            <span className="sidebar-item-contenido">
              <IconoReportar />
              Reportar
            </span>
          </button>
          <button
            type="button"
            className="sidebar-item"
            onClick={() => {
              setMenuMovilAbierto(false);
              if (onMisReportes) onMisReportes();
            }}
          >
            <span className="sidebar-item-contenido">
              <IconoReportes />
              Mis reportes
            </span>
          </button>
          <button
            type="button"
            className="sidebar-item"
            onClick={() => {
              setMenuMovilAbierto(false);
              if (onCosasPerdidas) onCosasPerdidas();
            }}
          >
            <span className="sidebar-item-contenido">
              <IconoPerdidas />
              Radar
            </span>
            {perdidasNoLeidas > 0 && (
              <span className="sidebar-badge">{perdidasNoLeidas > 9 ? '9+' : perdidasNoLeidas}</span>
            )}
          </button>
          <button
            type="button"
            className="sidebar-item"
            onClick={() => {
              setMenuMovilAbierto(false);
              if (onNotificaciones) onNotificaciones();
            }}
          >
            <span className="sidebar-item-contenido">
              <IconoNotificaciones />
              Notificaciones
            </span>
            {noLeidas > 0 && (
              <span className="sidebar-badge">{noLeidas > 9 ? '9+' : noLeidas}</span>
            )}
          </button>
        </nav>

        <div className="sidebar-pie">
          {esAdmin && onDashboardAdmin && (
            <button
              type="button"
              className="sidebar-item sidebar-item-admin sidebar-item-dashboard"
              onClick={() => {
                setMenuMovilAbierto(false);
                onDashboardAdmin();
              }}
            >
              <span className="sidebar-item-contenido">
                <IconoDashboard />
                {esOperario
                  ? 'Panel cuadrilla'
                  : (esSuper ? 'Dashboard de super admin' : 'Dashboard admin')}
              </span>
            </button>
          )}
          <p className="barra-usuario">{nombre}</p>
          {usuario.displayName && usuario.email && (
            <p className="barra-correo">{usuario.email}</p>
          )}
          <div className="sidebar-pie-acciones">
            <button
              type="button"
              className="barra-salir"
              onClick={() => {
                setMenuMovilAbierto(false);
                setMostrarPerfil(true);
              }}
            >
              <IconoPerfil />
              Mi perfil
            </button>
            <button type="button" className="barra-salir" onClick={cerrarSesion}>
              <IconoSalir />
              Salir
            </button>
          </div>
        </div>
      </aside>

      {menuMovilAbierto && (
        <button
          type="button"
          className="sidebar-fondo"
          aria-label="Cerrar menú"
          onClick={() => setMenuMovilAbierto(false)}
        />
      )}

      <header className="barra barra-superior">
        <button
          type="button"
          className="sidebar-abrir"
          aria-label="Abrir menú"
          onClick={() => setMenuMovilAbierto(true)}
        >
          Menú
        </button>
      </header>

      {mostrarPerfil && (
        <MiPerfil
          usuario={usuario}
          rol={esSuper ? 'SUPER_ADMIN' : (esOperario ? 'OPERARIO' : (esAdmin ? 'JURISDICTION_ADMIN' : 'PUBLIC_USER'))}
          onCerrar={() => setMostrarPerfil(false)}
          onDatosGuardados={(datos) => {
            const nombreNuevo = typeof datos === 'string' ? datos : datos?.nombre;
            setNombrePerfil(nombreNuevo || usuario?.email || '');
            if (onPerfilActualizado) {
              onPerfilActualizado(
                typeof datos === 'string'
                  ? { nombre: datos }
                  : (datos || {})
              );
            }
          }}
        />
      )}
    </>
  );
};

export default Barra;
