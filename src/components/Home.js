import React from 'react';
import { signOut } from 'firebase/auth';
import { getAuth } from 'firebase/auth';
import appFirebase from './credenciales';
import MapComponent from './MapComponent';

const auth = getAuth(appFirebase);

const Home = ({ correoUsuario }) => {
  const GOOGLE_MAPS_API_KEY = 'AIzaSyBKHbs5m_qsi4sd80epFp-mLP8KSFixk_4';

  const handleSignOut = () => {
    signOut(auth).catch((error) => {
      console.error('Error al cerrar sesión:', error);
    });
  };

  return (
    <div>
      <div className="container">
        <h2 className="text-center">
          Sistema de Reportes Municipales
          <span style={{ display: 'block', fontSize: '14px', fontWeight: 'normal', marginTop: '4px' }}>
            {correoUsuario}
          </span>
          <button className="btnlogout" onClick={handleSignOut}>
            Cerrar sesión
          </button>
        </h2>

        <MapComponent googleMapsApiKey={GOOGLE_MAPS_API_KEY} currentUser={correoUsuario} />
      </div>
    </div>
  );
};

export default Home;
