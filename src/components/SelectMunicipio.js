import React, { useEffect, useMemo, useRef, useState } from 'react';

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
}) => {
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState('');
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
      if (!wrapRef.current?.contains(e.target)) {
        setAbierto(false);
        setBusqueda('');
      }
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

      {abierto && (
        <div className="select-municipio-panel" role="listbox" aria-label={ariaLabel}>
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
          <ul className="select-municipio-lista">
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
      )}
    </div>
  );
};

export default SelectMunicipio;
