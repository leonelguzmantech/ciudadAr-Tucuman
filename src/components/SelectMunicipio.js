import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const normalizar = (valor) => String(valor || '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '');

/**
 * Selector de municipio/comuna con buscador.
 * options: [{ id, name, typeLabel? }]
 */
const SelectMunicipio = ({
  value = '',
  onChange,
  options = [],
  placeholder = 'Buscar municipio…',
  emptyLabel = 'Elegí municipio…',
  allowEmpty = true,
  required = false,
  disabled = false,
  ariaLabel = 'Municipio',
  className = '',
  compact = false,
  /** Al cambiar este número, abre el panel (p. ej. chip “+N más”). */
  openSignal = 0,
  /** Evita que overflow de padres recorte la lista (banner, modales, etc.). */
  panelFijo = false,
}) => {
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [panelPos, setPanelPos] = useState(null);
  const wrapRef = useRef(null);
  const inputRef = useRef(null);
  const openSignalPrev = useRef(0);

  const seleccionado = useMemo(
    () => options.find((t) => String(t.id) === String(value)) || null,
    [options, value]
  );

  const filtrados = useMemo(() => {
    const q = normalizar(busqueda).trim();
    if (!q) return options;
    return options.filter((t) => {
      const hay = `${t.name || ''} ${t.typeLabel || ''} ${t.slug || ''}`;
      return normalizar(hay).includes(q);
    });
  }, [options, busqueda]);

  useEffect(() => {
    if (!abierto) return undefined;
    const onDoc = (e) => {
      const t = e.target;
      if (wrapRef.current?.contains(t)) return;
      if (t?.closest?.('[data-select-municipio-panel="1"]')) return;
      setAbierto(false);
      setBusqueda('');
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setAbierto(false);
        setBusqueda('');
      }
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [abierto]);

  useEffect(() => {
    if (abierto) {
      window.setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [abierto]);

  useEffect(() => {
    if (!abierto || !panelFijo) {
      setPanelPos(null);
      return undefined;
    }
    const actualizar = () => {
      const el = wrapRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const ancho = Math.max(r.width, 280);
      const maxH = Math.min(320, Math.max(180, window.innerHeight - 24));
      const spaceBelow = window.innerHeight - r.bottom - 8;
      const spaceAbove = r.top - 8;
      const abrirArriba = spaceBelow < 220 && spaceAbove > spaceBelow;
      const left = Math.min(
        Math.max(8, r.left),
        Math.max(8, window.innerWidth - ancho - 8)
      );
      if (abrirArriba) {
        setPanelPos({
          position: 'fixed',
          left,
          width: ancho,
          bottom: window.innerHeight - r.top + 4,
          top: 'auto',
          maxHeight: Math.min(maxH, spaceAbove),
        });
      } else {
        setPanelPos({
          position: 'fixed',
          left,
          width: ancho,
          top: r.bottom + 4,
          bottom: 'auto',
          maxHeight: Math.min(maxH, Math.max(160, spaceBelow)),
        });
      }
    };
    actualizar();
    window.addEventListener('resize', actualizar);
    window.addEventListener('scroll', actualizar, true);
    return () => {
      window.removeEventListener('resize', actualizar);
      window.removeEventListener('scroll', actualizar, true);
    };
  }, [abierto, panelFijo]);

  useEffect(() => {
    if (openSignal && openSignal !== openSignalPrev.current && !disabled) {
      setAbierto(true);
      wrapRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
    }
    openSignalPrev.current = openSignal;
  }, [openSignal, disabled]);

  const etiqueta = seleccionado
    ? `${seleccionado.name}${seleccionado.typeLabel ? ` (${seleccionado.typeLabel})` : ''}`
    : emptyLabel;
  // En el botón cerrado solo el nombre (más cabe); completo en title y en el panel
  const etiquetaCorta = seleccionado ? (seleccionado.name || emptyLabel) : emptyLabel;

  const elegir = (id) => {
    onChange(String(id || ''));
    setAbierto(false);
    setBusqueda('');
  };

  const panel = abierto && (!panelFijo || panelPos) ? (
    <div
      className={`select-municipio-panel${panelFijo ? ' select-municipio-panel-fijo' : ''}`}
      role="listbox"
      aria-label={ariaLabel}
      style={panelFijo ? panelPos : undefined}
      data-select-municipio-panel="1"
    >
      <div className="select-municipio-buscar">
        <input
          ref={inputRef}
          type="search"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder={placeholder}
          aria-label="Buscar municipio"
          autoComplete="off"
        />
      </div>
      <ul
        className="select-municipio-lista"
        style={panelFijo && panelPos?.maxHeight
          ? { maxHeight: Math.max(120, panelPos.maxHeight - 52) }
          : undefined}
      >
        {allowEmpty && (
          <li>
            <button
              type="button"
              className={!value ? 'activo' : ''}
              onClick={() => elegir('')}
            >
              {emptyLabel}
            </button>
          </li>
        )}
        {filtrados.length === 0 ? (
          <li className="select-municipio-vacio">Ningún municipio coincide</li>
        ) : (
          filtrados.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                className={String(t.id) === String(value) ? 'activo' : ''}
                onClick={() => elegir(t.id)}
              >
                <strong>{t.name}</strong>
                {t.typeLabel ? <em>{t.typeLabel}</em> : null}
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  ) : null;

  return (
    <div
      className={`select-municipio${compact ? ' select-municipio-compacto' : ''}${className ? ` ${className}` : ''}${abierto ? ' abierto' : ''}`}
      ref={wrapRef}
    >
      {/* Campo oculto para validación HTML de formularios required */}
      {required && (
        <input type="hidden" value={value || ''} required />
      )}
      <button
        type="button"
        className={`select-municipio-trigger${seleccionado ? ' con-valor' : ''}`}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-expanded={abierto}
        aria-haspopup="listbox"
        title={seleccionado ? etiqueta : undefined}
        onClick={() => {
          if (disabled) return;
          setAbierto((v) => !v);
        }}
      >
        <span className="select-municipio-texto">{etiquetaCorta}</span>
        <span className="select-municipio-chevron" aria-hidden="true">▾</span>
      </button>

      {panelFijo && panel && typeof document !== 'undefined'
        ? createPortal(panel, document.body)
        : panel}
    </div>
  );
};

export default SelectMunicipio;
