import React, { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import CamaraEnVivo from './CamaraEnVivo';
import EditorImagen from './EditorImagen';

const API = 'http://localhost:5001';

const IconoClip = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
    <path
      fill="currentColor"
      d="M16.5 6.5v8.8a4.5 4.5 0 1 1-9 0V6.2a3.2 3.2 0 1 1 6.4 0v8.6a1.9 1.9 0 1 1-3.8 0V7.5h1.7v7.3a.2.2 0 1 0 .4 0V6.2a1.5 1.5 0 1 0-3 0v9.1a3.2 3.2 0 1 0 6.4 0V6.5h1.7z"
    />
  </svg>
);

const buildImageUrl = (path, userId) => {
  if (!path) return null;
  if (path.startsWith('blob:') || path.startsWith('data:')) return path;
  const base = path.startsWith('http') ? path : `${API}${path}`;
  if (!userId || userId === 'anonimo') return base;
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}userId=${encodeURIComponent(userId)}`;
};

const ChatReclamo = ({
  markerId,
  caseId,
  userId,
  soloLectura = false,
  onCerrar,
  onChatAbierto,
}) => {
  const [mensajes, setMensajes] = useState([]);
  const [texto, setTexto] = useState('');
  const [cargando, setCargando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const [lecturaForzada, setLecturaForzada] = useState(soloLectura);
  const [mostrarOpcionesAdjunto, setMostrarOpcionesAdjunto] = useState(false);
  const [adjuntoPreview, setAdjuntoPreview] = useState(null);
  const [adjuntoFile, setAdjuntoFile] = useState(null);
  const [editorSrc, setEditorSrc] = useState(null);
  const [mostrarCamara, setMostrarCamara] = useState(false);
  const [fotoZoom, setFotoZoom] = useState(null);
  const listaRef = useRef(null);
  const inputGaleriaRef = useRef(null);
  const inputCamaraRef = useRef(null);
  const avisoAbiertoRef = useRef(false);
  const onChatAbiertoRef = useRef(onChatAbierto);
  onChatAbiertoRef.current = onChatAbierto;

  const esSoloLectura = soloLectura || lecturaForzada;

  useEffect(() => {
    if (soloLectura) setLecturaForzada(true);
  }, [soloLectura]);

  const cargar = useCallback(async () => {
    if (!markerId || !userId) return;
    try {
      const { data } = await axios.get(`${API}/api/markers/${markerId}/chat`, {
        headers: { 'x-user-id': userId },
      });
      setMensajes(data.mensajes || []);
      if (data.soloLectura) setLecturaForzada(true);
      if (data.chatAbiertoPorMi && !avisoAbiertoRef.current && onChatAbiertoRef.current) {
        avisoAbiertoRef.current = true;
        onChatAbiertoRef.current();
      }
      setError('');
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo cargar el chat');
    } finally {
      setCargando(false);
    }
  }, [markerId, userId]);

  useEffect(() => {
    cargar();
    const timer = setInterval(cargar, 8000);
    return () => clearInterval(timer);
  }, [cargar]);

  useEffect(() => {
    if (listaRef.current) {
      listaRef.current.scrollTop = listaRef.current.scrollHeight;
    }
  }, [mensajes]);

  const quitarAdjunto = () => {
    setAdjuntoFile(null);
    setAdjuntoPreview(null);
    setMostrarOpcionesAdjunto(false);
  };

  const abrirEditorDesdeSrc = (src) => {
    if (!src) return;
    setEditorSrc(src);
    setMostrarCamara(false);
    setMostrarOpcionesAdjunto(false);
  };

  const abrirDesdeArchivo = (file) => {
    if (!file || !file.type?.startsWith('image/')) {
      setError('La foto tiene que ser una imagen.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => abrirEditorDesdeSrc(reader.result);
    reader.readAsDataURL(file);
  };

  const onElegirArchivo = (event) => {
    const file = event.target.files && event.target.files[0];
    event.target.value = '';
    if (file) abrirDesdeArchivo(file);
  };

  const abrirCamara = () => {
    const esMovil = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
    if (esMovil && inputCamaraRef.current) {
      inputCamaraRef.current.click();
      return;
    }
    setMostrarOpcionesAdjunto(false);
    setMostrarCamara(true);
  };

  const confirmarFotoEditada = ({ dataUrl, file }) => {
    setAdjuntoPreview(dataUrl);
    setAdjuntoFile(file);
    setEditorSrc(null);
    setMostrarOpcionesAdjunto(false);
  };

  const enviar = async (e) => {
    e.preventDefault();
    if (esSoloLectura || enviando) return;
    const mensaje = texto.trim();
    if (!mensaje && !adjuntoFile) return;
    setEnviando(true);
    try {
      const body = new FormData();
      if (mensaje) body.append('texto', mensaje);
      if (adjuntoFile) body.append('image', adjuntoFile);
      const { data } = await axios.post(
        `${API}/api/markers/${markerId}/chat`,
        body,
        { headers: { 'x-user-id': userId } }
      );
      setMensajes((prev) => [...prev, data]);
      setTexto('');
      quitarAdjunto();
      setError('');
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo enviar');
    } finally {
      setEnviando(false);
    }
  };

  const hora = (fecha) => {
    if (!fecha) return '';
    try {
      return new Date(fecha).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  const puedeEnviar = !esSoloLectura && Boolean(texto.trim() || adjuntoFile) && !enviando;

  return (
    <div className="chat-reclamo">
      <div className="chat-reclamo-cabecera">
        <div>
          <strong>{`Reclamo · Caso #${caseId || ''}`}</strong>
        </div>
        {onCerrar && (
          <button type="button" className="chat-reclamo-cerrar" onClick={onCerrar} aria-label="Cerrar chat">
            ×
          </button>
        )}
      </div>

      <div className="chat-reclamo-aviso">
        {esSoloLectura
          ? 'Caso cerrado. Podés ver la conversación, pero ya no se pueden enviar mensajes.'
          : 'Conversación entre vecinos. Cuando el objeto vuelva, quien lo había perdido confirma “Ya lo recuperé” y el caso se cierra.'}
      </div>

      <div className="chat-reclamo-lista" ref={listaRef}>
        {cargando && <p className="chat-reclamo-vacio">Cargando mensajes…</p>}
        {!cargando && !mensajes.length && (
          <p className="chat-reclamo-vacio">
            Todavía no hay mensajes. Escribí el primero o adjuntá una foto.
          </p>
        )}
        {mensajes.map((m) => (
          <div
            key={m.id}
            className={`chat-burbuja${m.mio ? ' mia' : ' otra'}`}
          >
            <span className="chat-burbuja-nombre">{m.nombre || 'Vecino'}</span>
            {m.imageUrl && (
              <button
                type="button"
                className="chat-burbuja-foto-btn"
                onClick={() => setFotoZoom(buildImageUrl(m.imageUrl, userId))}
              >
                <img
                  src={buildImageUrl(m.imageUrl, userId)}
                  alt="Foto del chat"
                  className="chat-burbuja-foto"
                />
              </button>
            )}
            {m.texto && m.texto !== '📷 Foto' && <p>{m.texto}</p>}
            {m.texto === '📷 Foto' && !m.imageUrl && <p>{m.texto}</p>}
            <span className="chat-burbuja-hora">{hora(m.createdAt)}</span>
          </div>
        ))}
      </div>

      {error && <p className="chat-reclamo-error">{error}</p>}

      <form className="chat-reclamo-form" onSubmit={enviar}>
        <input
          ref={inputGaleriaRef}
          type="file"
          accept="image/*"
          className="sr-only-file"
          onChange={onElegirArchivo}
          disabled={esSoloLectura}
        />
        <input
          ref={inputCamaraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only-file"
          onChange={onElegirArchivo}
          disabled={esSoloLectura}
        />

        {adjuntoPreview && !esSoloLectura && (
          <div className="chat-reclamo-adjunto-preview">
            <img src={adjuntoPreview} alt="Adjunto" />
            <button type="button" onClick={quitarAdjunto} aria-label="Quitar foto">
              ×
            </button>
          </div>
        )}

        {mostrarOpcionesAdjunto && !adjuntoPreview && !esSoloLectura && (
          <div className="chat-reclamo-adjunto-opciones">
            <button
              type="button"
              onClick={() => inputGaleriaRef.current?.click()}
            >
              Galería
            </button>
            <button type="button" onClick={abrirCamara}>
              Cámara
            </button>
            <button
              type="button"
              className="chat-reclamo-adjunto-cancelar"
              onClick={() => setMostrarOpcionesAdjunto(false)}
            >
              Cancelar
            </button>
          </div>
        )}

        <div className="chat-reclamo-form-fila">
          <button
            type="button"
            className={`chat-reclamo-clip${adjuntoPreview ? ' activo' : ''}`}
            onClick={() => {
              if (esSoloLectura) return;
              setMostrarOpcionesAdjunto((v) => !v);
            }}
            aria-label="Adjuntar foto"
            title={esSoloLectura ? 'Chat cerrado' : 'Adjuntar foto'}
            disabled={esSoloLectura || enviando}
          >
            <IconoClip />
          </button>
          <input
            type="text"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder={
              esSoloLectura
                ? 'Chat cerrado'
                : (adjuntoPreview ? 'Agregá un mensaje (opcional)…' : 'Escribí un mensaje…')
            }
            maxLength={1000}
            disabled={esSoloLectura || enviando}
            readOnly={esSoloLectura}
          />
          <button type="submit" disabled={!puedeEnviar}>
            Enviar
          </button>
        </div>
      </form>

      <p className="chat-reclamo-privacidad">
        Solo escriben quien publicó el aviso y quien reclamó. Podés adjuntar una foto con el clip.
      </p>

      {mostrarCamara && (
        <CamaraEnVivo
          onCancelar={() => setMostrarCamara(false)}
          onCapturar={(dataUrl) => {
            setMostrarCamara(false);
            abrirEditorDesdeSrc(dataUrl);
          }}
        />
      )}

      {editorSrc && (
        <EditorImagen
          imagenSrc={editorSrc}
          onCancelar={() => setEditorSrc(null)}
          onConfirmar={confirmarFotoEditada}
        />
      )}

      {fotoZoom && (
        <div
          className="chat-foto-zoom-fondo"
          role="dialog"
          aria-modal="true"
          onClick={() => setFotoZoom(null)}
        >
          <img src={fotoZoom} alt="Foto ampliada" onClick={(e) => e.stopPropagation()} />
          <button type="button" onClick={() => setFotoZoom(null)}>
            Cerrar
          </button>
        </div>
      )}
    </div>
  );
};

export default ChatReclamo;
