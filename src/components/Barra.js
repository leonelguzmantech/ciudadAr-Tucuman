import React, { useEffect, useState } from 'react';
import { getAuth, signOut } from 'firebase/auth';
import appFirebase from './credenciales';

const auth = getAuth(appFirebase);

const Barra = ({ usuario }) => {
  const [menuAbierto, setMenuAbierto] = useState(false);

  useEffect(() => {
    if (!usuario) {
      setMenuAbierto(false);
    }
  }, [usuario]);

  const cerrarSesion = () => {
    setMenuAbierto(false);
    signOut(auth).catch((error) => {
      console.error('Error al cerrar sesión:', error);
    });
  };

  const nombre = usuario?.displayName || usuario?.email || '';

  return (
    <header className="barra">
      <span className="barra-marca">CiudadAr</span>
      <span className="barra-titulo">Sistema de Reportes Tucumán</span>
      {usuario && (
        <div className="barra-menu">
          <button
            type="button"
            className="barra-hamburguesa"
            aria-label="Abrir menú"
            aria-expanded={menuAbierto}
            onClick={() => setMenuAbierto((abierto) => !abierto)}
          >
            <span />
            <span />
            <span />
          </button>
          {menuAbierto && (
            <div className="barra-panel" role="menu">
              <p className="barra-usuario">{nombre}</p>
              {usuario.displayName && usuario.email && (
                <p className="barra-correo">{usuario.email}</p>
              )}
              <button type="button" className="barra-salir" onClick={cerrarSesion}>
                Cerrar sesión
              </button>
            </div>
          )}
        </div>
      )}
    </header>
  );
};

export default Barra;
