import React from 'react';
import MapComponent from './MapComponent';

const Home = ({
  correoUsuario,
  panelVecino,
  onPanelVecinoVisto,
  onNoLeidasChange,
  onPerdidasNoLeidasChange,
  onAbrirCasoAdmin = null,
  focoCasoMapa = null,
  onFocoCasoVisto,
}) => {
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
          onPerdidasNoLeidasChange={onPerdidasNoLeidasChange}
          onAbrirCasoAdmin={onAbrirCasoAdmin}
          focoCasoMapa={focoCasoMapa}
          onFocoCasoVisto={onFocoCasoVisto}
        />
      </div>
    </div>
  );
};

export default Home;
