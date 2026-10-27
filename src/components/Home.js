import React from 'react';
import MapComponent from './MapComponent';

const Home = ({ correoUsuario, panelVecino, onPanelVecinoVisto, onNoLeidasChange }) => {
  const GOOGLE_MAPS_API_KEY = 'AIzaSyBKHbs5m_qsi4sd80epFp-mLP8KSFixk_4';

  return (
    <div>
      <div className="container">
        <MapComponent
          googleMapsApiKey={GOOGLE_MAPS_API_KEY}
          currentUser={correoUsuario}
          panelVecino={panelVecino}
          onPanelVecinoVisto={onPanelVecinoVisto}
          onNoLeidasChange={onNoLeidasChange}
        />
      </div>
    </div>
  );
};

export default Home;
