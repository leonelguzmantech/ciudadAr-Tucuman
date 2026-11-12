import React, { useEffect, useState } from 'react';
import axios from 'axios';
import logoCiudad from '../assets/ciudadar-logo-circulo-estilo.jpg';
import CapturaDniCamara from './CapturaDniCamara';
import SelectMunicipio from './SelectMunicipio';

const celularValido = (valor) => {
  const digitos = String(valor || '').replace(/\D/g, '');
  return digitos.length >= 8 && digitos.length <= 15;
};

const dniValido = (valor) => {
  const digitos = String(valor || '').replace(/\D/g, '');
  return digitos.length >= 7 && digitos.length <= 8;
};

/**
 * Completa identidad del vecino (nombre, DNI, celular, municipio, fotos DNI).
 * Las fotos del DNI se sacan con cámara + encuadre (sin galería).
 */
const CompletarCelular = ({ correo, nombre: nombreInicial, proveedor, onListo }) => {
  const [nombre, setNombre] = useState(nombreInicial || '');
  const [nombreFijo, setNombreFijo] = useState(false);
  const [dni, setDni] = useState('');
  const [dniFijo, setDniFijo] = useState(false);
  const [celular, setCelular] = useState('');
  const [celularFijo, setCelularFijo] = useState(false);
  const [municipioTenantId, setMunicipioTenantId] = useState('');
  const [municipioFijo, setMunicipioFijo] = useState(false);
  const [municipios, setMunicipios] = useState([]);
  const [frente, setFrente] = useState(null);
  const [dorso, setDorso] = useState(null);
  const [previewFrente, setPreviewFrente] = useState('');
  const [previewDorso, setPreviewDorso] = useState('');
  const [fotosYaCargadas, setFotosYaCargadas] = useState(false);
  const [capturandoLado, setCapturandoLado] = useState(null); // 'frente' | 'dorso' | null
  const [mensaje, setMensaje] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [esCompletarFaltante, setEsCompletarFaltante] = useState(false);

  useEffect(() => {
    let cancelado = false;
    const cargar = async () => {
      if (!correo) {
        setCargando(false);
        return;
      }
      try {
        const [meRes, munRes] = await Promise.all([
          axios.get('http://localhost:5001/api/usuarios/me', {
            headers: { 'x-user-id': correo },
          }).catch((err) => err),
          axios.get('http://localhost:5001/api/usuarios/municipios').catch(() => null),
        ]);
        if (cancelado) return;
        if (munRes?.data?.items) setMunicipios(munRes.data.items || []);
        const data = meRes?.data;
        if (data && !meRes?.isAxiosError) {
          if (data.nombre) {
            setNombre(data.nombre);
            setNombreFijo(true);
          }
          if (data.dni) {
            setDni(data.dni);
            setDniFijo(true);
          }
          if (data.telefono) {
            setCelular(data.telefono);
            // Si ya estaba confirmado, no pedirlo de nuevo al completar otro dato liberado.
            if (data.telefonoConfirmado) setCelularFijo(true);
          }
          if (data.municipioTenantId || data.municipioPendiente) {
            setMunicipioTenantId(data.municipioTenantId ? String(data.municipioTenantId) : '__pendiente__');
            setMunicipioFijo(true);
          }
          setFotosYaCargadas(!!data.dniFotosCargadas);
          setEsCompletarFaltante(!!(
            data.nombre || data.dni || data.telefono || data.dniFotosCargadas
            || data.municipioTenantId || data.municipioPendiente
          ));
        }
      } catch {
        /* alta nueva: formulario vacío */
      } finally {
        if (!cancelado) setCargando(false);
      }
    };
    cargar();
    return () => {
      cancelado = true;
    };
  }, [correo]);

  useEffect(() => () => {
    if (previewFrente) URL.revokeObjectURL(previewFrente);
    if (previewDorso) URL.revokeObjectURL(previewDorso);
  }, [previewFrente, previewDorso]);

  const aplicarCaptura = (lado, archivo) => {
    const url = URL.createObjectURL(archivo);
    if (lado === 'frente') {
      if (previewFrente) URL.revokeObjectURL(previewFrente);
      setFrente(archivo);
      setPreviewFrente(url);
    } else {
      if (previewDorso) URL.revokeObjectURL(previewDorso);
      setDorso(archivo);
      setPreviewDorso(url);
    }
    setCapturandoLado(null);
    setMensaje('');
  };

  const guardar = async (event) => {
    event.preventDefault();
    const nombreLimpio = nombre.trim();
    const celularLimpio = celular.trim();
    const dniLimpio = String(dni).replace(/\D/g, '');
    if (!nombreLimpio || nombreLimpio.length < 3) {
      setMensaje('Escribí tu nombre y apellido.');
      return;
    }
    if (!dniFijo && !dniValido(dniLimpio)) {
      setMensaje('El DNI debe tener 7 u 8 números.');
      return;
    }
    if (!celularValido(celularLimpio)) {
      setMensaje('Escribí un celular válido.');
      return;
    }
    if (!municipioTenantId) {
      setMensaje('Elegí tu municipio o comuna.');
      return;
    }
    if (!fotosYaCargadas && (!frente || !dorso)) {
      setMensaje('Sacá la foto del frente y del dorso del DNI con la cámara.');
      return;
    }
    setGuardando(true);
    setMensaje('');
    try {
      const body = {
        email: correo,
        nombre: nombreLimpio,
        telefono: celularLimpio,
        municipioTenantId,
        proveedor: proveedor === 'google' ? 'google' : 'correo',
      };
      if (!dniFijo) body.dni = dniLimpio;
      const perfilRes = await axios.post('http://localhost:5001/api/usuarios', body);

      let datosGuardados = perfilRes?.data || {};
      if (!fotosYaCargadas) {
        const form = new FormData();
        form.append('frente', frente);
        form.append('dorso', dorso);
        const fotosRes = await axios.post('http://localhost:5001/api/usuarios/me/dni-fotos', form, {
          headers: { 'x-user-id': correo },
        });
        if (fotosRes?.data) datosGuardados = fotosRes.data;
      }
      onListo({
        telefono: datosGuardados.telefono || celularLimpio,
        telefonoConfirmado: !!datosGuardados.telefonoConfirmado,
      });
    } catch (error) {
      setMensaje(error.response?.data?.message || 'No se pudieron guardar los datos. Intentá de nuevo.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="pantalla-acceso">
      <div className="pantalla-acceso-tarjeta">
        <div className="card card-body shadow-lg">
          <img src={logoCiudad} alt="CiudadAr" className="logo-acceso" />
          <h2 className="verificacion-titulo">
            {esCompletarFaltante ? 'Completá el dato liberado' : 'Completá tu identidad'}
          </h2>
          <p className="verificacion-texto">
            {esCompletarFaltante
              ? 'El municipio liberó un dato para que lo corrijas. Completá solo lo que falta; el resto queda como estaba.'
              : 'Necesitamos tu nombre, DNI, celular, municipio y fotos del documento (frente y dorso), sacadas con la cámara encuadrando el DNI. Así el municipio puede identificar al reportante y reducir cuentas falsas.'}
          </p>
          {cargando ? (
            <p className="verificacion-texto">Cargando...</p>
          ) : (
            <form onSubmit={guardar}>
              <input
                type="text"
                className="caja-texto"
                placeholder="Nombre y apellido"
                value={nombre}
                onChange={(event) => setNombre(event.target.value)}
                autoComplete="name"
                autoFocus={!nombreFijo}
                disabled={nombreFijo}
                readOnly={nombreFijo}
                required
              />
              <input
                type="text"
                className="caja-texto"
                placeholder="DNI (solo números)"
                value={dni}
                onChange={(event) => setDni(event.target.value.replace(/\D/g, '').slice(0, 8))}
                inputMode="numeric"
                disabled={dniFijo}
                readOnly={dniFijo}
                required
              />
              <input
                type="tel"
                className="caja-texto"
                placeholder="Celular"
                value={celular}
                onChange={(event) => setCelular(event.target.value)}
                inputMode="numeric"
                autoComplete="tel"
                disabled={celularFijo}
                readOnly={celularFijo}
                required
              />
              {celularFijo && (
                <p className="dni-fotos-nota">
                  Celular ya confirmado. Si querés cambiarlo, pedí soporte o editá el número desde Mi perfil.
                </p>
              )}

              <div className="completar-municipio">
                <SelectMunicipio
                  value={municipioTenantId}
                  onChange={setMunicipioTenantId}
                  options={municipios}
                  placeholder="Buscar municipio o comuna…"
                  emptyLabel="Tu municipio o comuna…"
                  allowEmpty={false}
                  required
                  disabled={municipioFijo}
                  ariaLabel="Municipio o comuna"
                />
                <p className="dni-fotos-nota">
                  {municipioFijo
                    ? 'El municipio ya está cargado. Si está mal, pedí soporte en Mi perfil.'
                    : 'Si el tuyo aún no figura o no está activo, elegí esa opción: el soporte lo atiende CiudadAr.'}
                </p>
              </div>

              {fotosYaCargadas ? (
                <p className="verificacion-texto">Fotos del DNI ya cargadas.</p>
              ) : (
                <div className="dni-fotos-carga">
                  <p className="dni-fotos-nota">
                    Sacá las fotos con la cámara. No se puede subir desde la galería.
                  </p>
                  <div className="dni-foto-campo">
                    <span>Frente del DNI</span>
                    {previewFrente ? (
                      <img src={previewFrente} alt="Vista previa frente DNI" className="dni-foto-preview" />
                    ) : null}
                    <button
                      type="button"
                      className="dni-foto-btn-camara"
                      onClick={() => setCapturandoLado('frente')}
                    >
                      {previewFrente ? 'Volver a sacar frente' : 'Abrir cámara · frente'}
                    </button>
                  </div>
                  <div className="dni-foto-campo">
                    <span>Dorso del DNI</span>
                    {previewDorso ? (
                      <img src={previewDorso} alt="Vista previa dorso DNI" className="dni-foto-preview" />
                    ) : null}
                    <button
                      type="button"
                      className="dni-foto-btn-camara"
                      onClick={() => setCapturandoLado('dorso')}
                    >
                      {previewDorso ? 'Volver a sacar dorso' : 'Abrir cámara · dorso'}
                    </button>
                  </div>
                </div>
              )}

              <button className="btnform" type="submit" disabled={guardando}>
                {guardando ? 'Guardando...' : 'Guardar y continuar'}
              </button>
            </form>
          )}
          {mensaje && <p className="verificacion-texto">{mensaje}</p>}
        </div>
      </div>

      {capturandoLado && (
        <CapturaDniCamara
          lado={capturandoLado}
          onCerrar={() => setCapturandoLado(null)}
          onCaptura={(archivo) => aplicarCaptura(capturandoLado, archivo)}
        />
      )}
    </div>
  );
};

export default CompletarCelular;
