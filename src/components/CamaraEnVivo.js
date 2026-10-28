import React, { useEffect, useRef, useState } from 'react';

/**
 * Captura una foto con la cámara del dispositivo (getUserMedia).
 * onCapturar(dataUrl)
 */
const CamaraEnVivo = ({ onCapturar, onCancelar }) => {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [error, setError] = useState('');
  const [listo, setListo] = useState(false);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          setError('Este navegador no permite usar la cámara acá. Probá desde el celular o subí desde la galería.');
          return;
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        if (cancelado) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setListo(true);
        }
      } catch (err) {
        console.error(err);
        setError('No se pudo abrir la cámara. Revisá los permisos o usá la galería.');
      }
    })();
    return () => {
      cancelado = true;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, []);

  const capturar = () => {
    const video = videoRef.current;
    if (!video || !listo) return;
    const canvas = document.createElement('canvas');
    const w = video.videoWidth || 1280;
    const h = video.videoHeight || 720;
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d').drawImage(video, 0, 0, w, h);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    onCapturar(canvas.toDataURL('image/jpeg', 0.92));
  };

  return (
    <div className="editor-imagen-fondo" role="dialog" aria-modal="true" aria-label="Tomar foto">
      <div className="editor-imagen-panel">
        <header className="editor-imagen-cabecera">
          <strong>Tomar foto</strong>
          <button type="button" className="popup-nav-btn" onClick={onCancelar} aria-label="Cerrar">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="currentColor"
                d="M18.3 5.7 12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7 2.9 18.3 9.2 12 2.9 5.7 4.3 4.3l6.3 6.3 6.3-6.3z"
              />
            </svg>
          </button>
        </header>
        {error ? (
          <p className="editor-imagen-ayuda">{error}</p>
        ) : (
          <div className="camara-vivo-wrap">
            <video ref={videoRef} playsInline muted className="camara-vivo-video" />
          </div>
        )}
        <div className="editor-imagen-acciones">
          <button type="button" className="popup-btn-secundario" onClick={onCancelar}>
            Cancelar
          </button>
          {!error && (
            <button
              type="button"
              className="popup-btn-publicar"
              onClick={capturar}
              disabled={!listo}
            >
              Capturar
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default CamaraEnVivo;
