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

const IconoReportes = () => (
  <svg className="sidebar-icono" viewBox="0 0 24 24" aria-hidden="true">
    <path
      fill="currentColor"
      d="M12 2C8.1 2 5 5.1 5 9c0 5.2 7 13 7 13s7-7.8 7-13c0-3.9-3.1-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5z"
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
  conSidebar = false,
  onMisReportes,
  onFiltros,
  onNotificaciones,
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
    signOut(auth).catch((error) => {
      console.error('Error al cerrar sesión:', error);
    });
  };

  const nombre = nombrePerfil || usuario?.email || '';

  if (!conSidebar) {
    return (
      <header className="barra">
        <span className="barra-marca">
          <img src={logoCiudad} alt="" className="barra-logo" />
          CiudadAr
        </span>
      </header>
    );
  }

  return (
    <>
      <aside className={`sidebar${menuMovilAbierto ? ' abierta' : ''}`}>
        <div className="sidebar-marca">
          <img src={logoCiudad} alt="" className="barra-logo" />
          <div>
            <strong>CiudadAr</strong>
            <small>Reportes Tucumán</small>
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
          onCerrar={() => setMostrarPerfil(false)}
          onDatosGuardados={(nombreNuevo) => {
            setNombrePerfil(nombreNuevo || usuario?.email || '');
            if (onPerfilActualizado) onPerfilActualizado(nombreNuevo);
          }}
        />
      )}
    </>
  );
};

export default Barra;
