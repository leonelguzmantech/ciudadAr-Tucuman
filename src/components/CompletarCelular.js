import React, { useState } from 'react';
import axios from 'axios';
import logoCiudad from '../assets/ciudadar-logo-circulo-estilo.jpg';

const celularValido = (valor) => {
  const digitos = String(valor || '').replace(/\D/g, '');
  return digitos.length >= 8 && digitos.length <= 15;
};

const CompletarCelular = ({ correo, nombre, proveedor, onListo }) => {
  const [celular, setCelular] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [guardando, setGuardando] = useState(false);

  const guardar = async (event) => {
    event.preventDefault();
    if (!celularValido(celular)) {
      setMensaje('Escribí un celular válido.');
      return;
    }
    setGuardando(true);
    try {
      await axios.post('http://localhost:5001/api/usuarios', {
        email: correo,
        nombre: nombre || '',
        telefono: celular.trim(),
        proveedor: proveedor === 'google' ? 'google' : 'correo',
      });
      onListo();
    } catch (error) {
      setMensaje(error.response?.data?.message || 'No se pudo guardar el celular. Intentá de nuevo.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="pantalla-acceso">
      <div className="pantalla-acceso-tarjeta">
        <div className="card card-body shadow-lg">
          <img src={logoCiudad} alt="CiudadAr" className="logo-acceso" />
          <h2 className="verificacion-titulo">Tu celular</h2>
          <p className="verificacion-texto">
            La cuenta de {correo} ya quedó creada. Para terminar, escribí tu número de celular.
          </p>
          <form onSubmit={guardar}>
            <input
              type="tel"
              className="caja-texto"
              placeholder="Celular"
              value={celular}
              onChange={(event) => setCelular(event.target.value)}
              inputMode="numeric"
              autoFocus
              required
            />
            <button className="btnform" type="submit" disabled={guardando}>
              {guardando ? 'Guardando...' : 'Guardar'}
            </button>
          </form>
          {mensaje && <p className="verificacion-texto">{mensaje}</p>}
        </div>
      </div>
    </div>
  );
};

export default CompletarCelular;
