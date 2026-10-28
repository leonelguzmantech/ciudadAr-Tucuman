import React, { useCallback, useEffect, useRef, useState } from 'react';

const MAX_LADO = 1400;
const GROSOR_LAPIZ = 22;

const cargarImagen = (src) => new Promise((resolve, reject) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = reject;
  img.src = src;
});

const ajustarTamano = (ancho, alto) => {
  const mayor = Math.max(ancho, alto);
  if (mayor <= MAX_LADO) return { w: Math.round(ancho), h: Math.round(alto) };
  const escala = MAX_LADO / mayor;
  return { w: Math.round(ancho * escala), h: Math.round(alto * escala) };
};

/**
 * Editor de foto: recorte y lápiz para tapar datos sensibles.
 * onConfirmar({ dataUrl, file })
 */
const EditorImagen = ({ imagenSrc, onCancelar, onConfirmar }) => {
  const canvasRef = useRef(null);
  const dibujandoRef = useRef(false);
  const ultimoPuntoRef = useRef(null);
  const cropStartRef = useRef(null);
  const [herramienta, setHerramienta] = useState('lapiz');
  const [historial, setHistorial] = useState([]);
  const [cropRect, setCropRect] = useState(null);
  const [listo, setListo] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const snapshot = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    return canvas.toDataURL('image/jpeg', 0.92);
  }, []);

  const restaurar = useCallback((dataUrl) => {
    const canvas = canvasRef.current;
    if (!canvas || !dataUrl) return;
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    };
    img.src = dataUrl;
  }, []);

  const guardarHistorial = useCallback(() => {
    const shot = snapshot();
    if (!shot) return;
    setHistorial((prev) => [...prev.slice(-12), shot]);
  }, [snapshot]);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const img = await cargarImagen(imagenSrc);
        if (cancelado) return;
        const { w, h } = ajustarTamano(img.naturalWidth || img.width, img.naturalHeight || img.height);
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        setHistorial([canvas.toDataURL('image/jpeg', 0.92)]);
        setListo(true);
      } catch (err) {
        console.error('No se pudo cargar la imagen en el editor', err);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [imagenSrc]);

  const puntoEnCanvas = (event) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const clientX = event.touches ? event.touches[0].clientX : event.clientX;
    const clientY = event.touches ? event.touches[0].clientY : event.clientY;
    const x = ((clientX - rect.left) / rect.width) * canvas.width;
    const y = ((clientY - rect.top) / rect.height) * canvas.height;
    return { x, y };
  };

  const iniciarTrazo = (event) => {
    event.preventDefault();
    const punto = puntoEnCanvas(event);
    if (!punto) return;
    if (herramienta === 'lapiz') {
      guardarHistorial();
      dibujandoRef.current = true;
      ultimoPuntoRef.current = punto;
      const ctx = canvasRef.current.getContext('2d');
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(15, 23, 42, 0.92)';
      ctx.lineWidth = GROSOR_LAPIZ;
      ctx.beginPath();
      ctx.moveTo(punto.x, punto.y);
      ctx.lineTo(punto.x + 0.1, punto.y + 0.1);
      ctx.stroke();
    } else if (herramienta === 'recortar') {
      cropStartRef.current = punto;
      setCropRect({ x: punto.x, y: punto.y, w: 0, h: 0 });
    }
  };

  const moverTrazo = (event) => {
    event.preventDefault();
    const punto = puntoEnCanvas(event);
    if (!punto) return;
    if (herramienta === 'lapiz' && dibujandoRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      const prev = ultimoPuntoRef.current;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(15, 23, 42, 0.92)';
      ctx.lineWidth = GROSOR_LAPIZ;
      ctx.beginPath();
      ctx.moveTo(prev.x, prev.y);
      ctx.lineTo(punto.x, punto.y);
      ctx.stroke();
      ultimoPuntoRef.current = punto;
    } else if (herramienta === 'recortar' && cropStartRef.current) {
      const start = cropStartRef.current;
      setCropRect({
        x: Math.min(start.x, punto.x),
        y: Math.min(start.y, punto.y),
        w: Math.abs(punto.x - start.x),
        h: Math.abs(punto.y - start.y),
      });
    }
  };

  const soltarTrazo = (event) => {
    event.preventDefault();
    dibujandoRef.current = false;
    ultimoPuntoRef.current = null;
    cropStartRef.current = null;
  };

  const deshacer = () => {
    setHistorial((prev) => {
      if (prev.length <= 1) return prev;
      const next = prev.slice(0, -1);
      restaurar(next[next.length - 1]);
      return next;
    });
    setCropRect(null);
  };

  const aplicarRecorte = () => {
    const canvas = canvasRef.current;
    if (!canvas || !cropRect || cropRect.w < 8 || cropRect.h < 8) return;
    guardarHistorial();
    const ctx = canvas.getContext('2d');
    const x = Math.max(0, Math.floor(cropRect.x));
    const y = Math.max(0, Math.floor(cropRect.y));
    const w = Math.min(canvas.width - x, Math.floor(cropRect.w));
    const h = Math.min(canvas.height - y, Math.floor(cropRect.h));
    const recorte = ctx.getImageData(x, y, w, h);
    const { w: nw, h: nh } = ajustarTamano(w, h);
    canvas.width = nw;
    canvas.height = nh;
    const tmp = document.createElement('canvas');
    tmp.width = w;
    tmp.height = h;
    tmp.getContext('2d').putImageData(recorte, 0, 0);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, nw, nh);
    ctx.drawImage(tmp, 0, 0, nw, nh);
    setCropRect(null);
    setHistorial((prev) => [...prev, canvas.toDataURL('image/jpeg', 0.92)]);
  };

  const confirmar = async () => {
    const canvas = canvasRef.current;
    if (!canvas || guardando) return;
    setGuardando(true);
    try {
      const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
      const file = new File([blob], `aviso-${Date.now()}.jpg`, { type: 'image/jpeg' });
      onConfirmar({ dataUrl, file });
    } catch (err) {
      console.error(err);
      setGuardando(false);
    }
  };

  const pct = (valor, total) => `${(valor / total) * 100}%`;

  return (
    <div className="editor-imagen-fondo" role="dialog" aria-modal="true" aria-label="Editar foto">
      <div className="editor-imagen-panel">
        <header className="editor-imagen-cabecera">
          <strong>Editar foto</strong>
          <button type="button" className="popup-nav-btn" onClick={onCancelar} aria-label="Cerrar">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="currentColor"
                d="M18.3 5.7 12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7 2.9 18.3 9.2 12 2.9 5.7 4.3 4.3l6.3 6.3 6.3-6.3z"
              />
            </svg>
          </button>
        </header>

        <p className="editor-imagen-ayuda">
          {herramienta === 'lapiz'
            ? 'Usá el lápiz para tapar datos sensibles (patente, documento, cara…).'
            : 'Arrastrá para marcar el recorte y tocá “Aplicar recorte”.'}
        </p>

        <div className="editor-imagen-lienzo-wrap">
          <canvas
            ref={canvasRef}
            className={`editor-imagen-canvas${herramienta === 'recortar' ? ' modo-recorte' : ' modo-lapiz'}`}
            onMouseDown={iniciarTrazo}
            onMouseMove={moverTrazo}
            onMouseUp={soltarTrazo}
            onMouseLeave={soltarTrazo}
            onTouchStart={iniciarTrazo}
            onTouchMove={moverTrazo}
            onTouchEnd={soltarTrazo}
          />
          {herramienta === 'recortar' && cropRect && canvasRef.current && (
            <div
              className="editor-imagen-crop"
              style={{
                left: pct(cropRect.x, canvasRef.current.width),
                top: pct(cropRect.y, canvasRef.current.height),
                width: pct(cropRect.w, canvasRef.current.width),
                height: pct(cropRect.h, canvasRef.current.height),
              }}
            />
          )}
          {!listo && <div className="editor-imagen-cargando">Cargando foto…</div>}
        </div>

        <div className="editor-imagen-herramientas">
          <button
            type="button"
            className={herramienta === 'lapiz' ? 'activo' : ''}
            onClick={() => { setHerramienta('lapiz'); setCropRect(null); }}
          >
            Lápiz
          </button>
          <button
            type="button"
            className={herramienta === 'recortar' ? 'activo' : ''}
            onClick={() => setHerramienta('recortar')}
          >
            Recortar
          </button>
          <button type="button" onClick={deshacer} disabled={historial.length <= 1}>
            Deshacer
          </button>
          {herramienta === 'recortar' && (
            <button
              type="button"
              onClick={aplicarRecorte}
              disabled={!cropRect || cropRect.w < 8 || cropRect.h < 8}
            >
              Aplicar recorte
            </button>
          )}
        </div>

        <div className="editor-imagen-acciones">
          <button type="button" className="popup-btn-secundario" onClick={onCancelar}>
            Cancelar
          </button>
          <button
            type="button"
            className="popup-btn-publicar"
            onClick={confirmar}
            disabled={!listo || guardando}
          >
            {guardando ? 'Guardando…' : 'Usar esta foto'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default EditorImagen;
