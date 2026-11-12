import React, { useEffect, useRef, useState } from 'react';

/**
 * Captura de DNI con cámara + encuadre (estilo app bancaria).
 * No valida el documento: solo fuerza foto en vivo (sin galería).
 */
const CapturaDniCamara = ({ lado = 'frente', onCaptura, onCerrar }) => {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [error, setError] = useState('');
  const [listo, setListo] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');
  const [blobCaptura, setBlobCaptura] = useState(null);
  const [capturando, setCapturando] = useState(false);

  const titulo = lado === 'dorso' ? 'Dorso del DNI' : 'Frente del DNI';

  useEffect(() => {
    let cancelado = false;
    const iniciar = async () => {
      setError('');
      setListo(false);
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('Este dispositivo no permite usar la cámara desde el navegador.');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        });
        if (cancelado) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setListo(true);
      } catch (err) {
        const negado = err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError';
        setError(
          negado
            ? 'Necesitamos permiso de cámara para sacar la foto del DNI.'
            : 'No se pudo abrir la cámara. Revisá que no la esté usando otra app.'
        );
      }
    };
    iniciar();
    return () => {
      cancelado = true;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, []);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const detenerCamara = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  };

  const sacarFoto = async () => {
    const video = videoRef.current;
    if (!video || !listo || capturando) return;
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) {
      setError('La cámara todavía no está lista. Esperá un segundo.');
      return;
    }
    setCapturando(true);
    try {
      // Recorte al encuadre (proporción tipo documento ~1.586)
      const ratioDoc = 85.6 / 53.98;
      let cropW = vw * 0.86;
      let cropH = cropW / ratioDoc;
      if (cropH > vh * 0.62) {
        cropH = vh * 0.62;
        cropW = cropH * ratioDoc;
      }
      const sx = (vw - cropW) / 2;
      const sy = (vh - cropH) / 2;

      const canvas = document.createElement('canvas');
      const outW = Math.round(Math.min(1600, cropW));
      const outH = Math.round(outW / ratioDoc);
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, sx, sy, cropW, cropH, 0, 0, outW, outH);

      const blob = await new Promise((resolve) => {
        canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.88);
      });
      if (!blob) {
        setError('No se pudo capturar la foto. Probá de nuevo.');
        return;
      }
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setBlobCaptura(blob);
      setPreviewUrl(URL.createObjectURL(blob));
      detenerCamara();
      setListo(false);
    } finally {
      setCapturando(false);
    }
  };

  const repetir = async () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl('');
    setBlobCaptura(null);
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setListo(true);
    } catch {
      setError('No se pudo volver a abrir la cámara.');
    }
  };

  const confirmar = () => {
    if (!blobCaptura) return;
    const archivo = new File(
      [blobCaptura],
      `dni-${lado}-${Date.now()}.jpg`,
      { type: 'image/jpeg' }
    );
    onCaptura?.(archivo, previewUrl);
  };

  const cerrar = () => {
    detenerCamara();
    onCerrar?.();
  };

  return (
    <div className="dni-camara-fondo" role="dialog" aria-modal="true" aria-label={titulo}>
      <div className="dni-camara-panel">
        <header className="dni-camara-cabecera">
          <h3>{titulo}</h3>
          <button type="button" className="dni-camara-cerrar" onClick={cerrar}>
            Cerrar
          </button>
        </header>

        <p className="dni-camara-ayuda">
          Apoyá el documento sobre una superficie y encuadrálo dentro del marco.
          La foto se saca con la cámara (no se puede elegir de la galería).
        </p>

        <div className={`dni-camara-visor${previewUrl ? ' con-preview' : ''}`}>
          {!previewUrl ? (
            <>
              <video
                ref={videoRef}
                className="dni-camara-video"
                playsInline
                muted
                autoPlay
              />
              <div className="dni-camara-mascara" aria-hidden="true">
                <div className="dni-camara-marco">
                  <span className="dni-camara-esquina tl" />
                  <span className="dni-camara-esquina tr" />
                  <span className="dni-camara-esquina bl" />
                  <span className="dni-camara-esquina br" />
                </div>
              </div>
            </>
          ) : (
            <img src={previewUrl} alt={`Vista previa ${titulo}`} className="dni-camara-preview" />
          )}
        </div>

        {error && <p className="dni-camara-error">{error}</p>}

        <div className="dni-camara-acciones">
          {!previewUrl ? (
            <button
              type="button"
              className="dni-camara-btn primario"
              onClick={sacarFoto}
              disabled={!listo || capturando || !!error}
            >
              {capturando ? 'Capturando…' : 'Sacar foto'}
            </button>
          ) : (
            <>
              <button type="button" className="dni-camara-btn" onClick={repetir}>
                Repetir
              </button>
              <button type="button" className="dni-camara-btn primario" onClick={confirmar}>
                Usar esta foto
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default CapturaDniCamara;
