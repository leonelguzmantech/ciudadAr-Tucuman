import React from 'react';
import MapComponent from './MapComponent';

const Home = ({ correoUsuario }) => {
  const GOOGLE_MAPS_API_KEY = 'AIzaSyBKHbs5m_qsi4sd80epFp-mLP8KSFixk_4';

  return (
    <div>
      <div className="container">
        <MapComponent googleMapsApiKey={GOOGLE_MAPS_API_KEY} currentUser={correoUsuario} />
      </div>
    </div>
  );
};

export default Home;
