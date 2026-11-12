import React, { useEffect, useState } from 'react';
import axios from 'axios';
import logoCiudad from '../assets/ciudadar-logo-circulo-estilo.jpg';

/**
 * Confirmación del celular por código OTP (6 dígitos).
 * En modo demo el backend puede devolver codigoDemo (sin SMS real).
 */
const VerificarCelular = ({ correo, telefonoInicial = '', onListo, onCambiarCelular }) => {
  const [telefono, setTelefono] = useState(telefonoInicial || '');
  const [codigo, setCodigo] = useState('');
  const [codigoDemo, setCodigoDemo] = useState('');
  const [enviado, setEnviado] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [verificando, setVerificando] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const t = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(t);
  }, [cooldown]);

  const headers = { 'x-user-id': correo };

  const enviarCodigo = async () => {
    setError('');
    setMensaje('');
    setEnviando(true);
    try {
      const { data } = await axios.post(
        'http://localhost:5001/api/usuarios/me/celular/enviar-codigo',
        { telefono: telefono.trim() },
        { headers }
      );
      setEnviado(true);
      setMensaje(data.message || 'Código enviado.');
      if (data.codigoDemo) {
        setCodigoDemo(data.codigoDemo);
        setCodigo(data.codigoDemo);
      } else {
        setCodigoDemo('');
      }
      setCooldown(Number(data.reintentarEn) || 45);
    } catch (err) {
      const reint = err.response?.data?.reintentarEn;
      if (reint) setCooldown(Number(reint));
      setError(err.response?.data?.message || 'No se pudo enviar el código.');
    } finally {
      setEnviando(false);
    }
  };

  const verificar = async (event) => {
    event.preventDefault();
    setError('');
    setMensaje('');
    setVerificando(true);
    try {
      await axios.post(
        'http://localhost:5001/api/usuarios/me/celular/verificar',
        { codigo: String(codigo).replace(/\D/g, '') },
        { headers }
      );
      setMensaje('Celular confirmado.');
      onListo();
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo verificar el código.');
    } finally {
      setVerificando(false);
    }
  };

  return (
    <div className="pantalla-acceso">
      <div className="pantalla-acceso-tarjeta">
        <div className="card card-body shadow-lg">
          <img src={logoCiudad} alt="CiudadAr" className="logo-acceso" />
          <h2 className="verificacion-titulo">Confirmá tu celular</h2>
          <p className="verificacion-texto">
            Te mandamos un código de 6 dígitos para verificar que el número es tuyo
            y reducir cuentas falsas o spam.
          </p>

          <label className="verificacion-texto" style={{ display: 'block', textAlign: 'left', marginBottom: 4 }}>
            Celular
          </label>
          <input
            type="tel"
            className="caja-texto"
            value={telefono}
            onChange={(e) => {
              setTelefono(e.target.value);
              setEnviado(false);
              setCodigoDemo('');
            }}
            inputMode="numeric"
            autoComplete="tel"
            required
          />

          <button
            type="button"
            className="btnform"
            onClick={enviarCodigo}
            disabled={enviando || cooldown > 0}
          >
            {enviando
              ? 'Enviando…'
              : cooldown > 0
                ? `Reenviar en ${cooldown}s`
                : (enviado ? 'Reenviar código' : 'Enviar código')}
          </button>

          {codigoDemo && (
            <p className="verificacion-texto" style={{ marginTop: 12 }}>
              <strong>Modo demo:</strong> tu código es <strong>{codigoDemo}</strong>
              {' '}(sin SMS real; en producción iría por mensaje de texto).
            </p>
          )}

          {enviado && (
            <form onSubmit={verificar} style={{ marginTop: 12 }}>
              <input
                type="text"
                className="caja-texto"
                placeholder="Código de 6 dígitos"
                value={codigo}
                onChange={(e) => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                required
              />
              <button className="btnform" type="submit" disabled={verificando || codigo.length !== 6}>
                {verificando ? 'Verificando…' : 'Confirmar celular'}
              </button>
            </form>
          )}

          {onCambiarCelular && (
            <button type="button" className="btn-recupero" onClick={onCambiarCelular}>
              Volver a editar mis datos
            </button>
          )}

          {error && <p className="verificacion-texto" style={{ color: '#b91c1c' }}>{error}</p>}
          {mensaje && !error && <p className="verificacion-texto">{mensaje}</p>}
        </div>
      </div>
    </div>
  );
};

export default VerificarCelular;
