import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import SelectMunicipio from './SelectMunicipio';

const API = 'http://localhost:5001';

/**
 * Administración de vecinos (Mongo).
 * Super: todos. Admin municipal: solo su jurisdicción.
 */
const UsuariosPanel = ({
  userId,
  esSuper = false,
  tenantsOptions = [],
}) => {
  const headers = { 'x-user-id': userId };
  const [q, setQ] = useState('');
  const [qDebounced, setQDebounced] = useState('');
  const [estado, setEstado] = useState('activos');
  const [tenantId, setTenantId] = useState('');
  const [soloPendiente, setSoloPendiente] = useState(false);
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [accionando, setAccionando] = useState(false);
  const [aviso, setAviso] = useState('');
  const [detalle, setDetalle] = useState(null);
  const [mostrandoDni, setMostrandoDni] = useState(false);

  const urlDni = (path) => {
    if (!path || !userId) return '';
    const base = path.startsWith('http') ? path : `${API}${path}`;
    const sep = base.includes('?') ? '&' : '?';
    return `${base}${sep}userId=${encodeURIComponent(userId)}`;
  };

  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const cargar = useCallback(async (pagina = 1) => {
    if (!userId) return;
    setCargando(true);
    try {
      const params = {
        q: qDebounced || undefined,
        estado,
        page: pagina,
        limit: 40,
      };
      if (esSuper && soloPendiente) params.pendiente = 1;
      else if (tenantId) params.tenantId = tenantId;

      const { data } = await axios.get(`${API}/api/usuarios/admin/usuarios`, {
        headers,
        params,
      });
      setItems(data.items || []);
      setTotal(data.total || 0);
      setPage(data.page || pagina);
      setHasMore(!!data.hasMore);
    } catch (err) {
      setItems([]);
      setTotal(0);
      setAviso(err.response?.data?.message || 'No se pudo cargar la lista.');
    } finally {
      setCargando(false);
    }
  }, [userId, qDebounced, estado, tenantId, soloPendiente, esSuper]);

  useEffect(() => {
    cargar(1);
  }, [cargar]);

  const toast = (msg) => {
    setAviso(msg);
    window.setTimeout(() => setAviso(''), 3500);
  };

  const desactivar = async (item) => {
    if (!item?.email || accionando) return;
    const nota = window.prompt(
      `Motivo para desactivar a ${item.nombre || item.email} (opcional):`,
      ''
    );
    if (nota === null) return;
    setAccionando(true);
    try {
      await axios.post(
        `${API}/api/usuarios/admin/usuarios/${encodeURIComponent(item.email)}/desactivar`,
        { nota },
        { headers }
      );
      toast('Cuenta desactivada.');
      await cargar(page);
      if (detalle?.email === item.email) {
        setDetalle((d) => (d ? { ...d, activo: false, desactivadoNota: nota } : d));
      }
    } catch (err) {
      toast(err.response?.data?.message || 'No se pudo desactivar.');
    } finally {
      setAccionando(false);
    }
  };

  const activar = async (item) => {
    if (!item?.email || accionando) return;
    setAccionando(true);
    try {
      await axios.post(
        `${API}/api/usuarios/admin/usuarios/${encodeURIComponent(item.email)}/activar`,
        {},
        { headers }
      );
      toast('Cuenta reactivada.');
      await cargar(page);
      if (detalle?.email === item.email) {
        setDetalle((d) => (d ? { ...d, activo: true, desactivadoNota: '' } : d));
      }
    } catch (err) {
      toast(err.response?.data?.message || 'No se pudo reactivar.');
    } finally {
      setAccionando(false);
    }
  };

  const liberarCampo = async (item, campo, etiqueta) => {
    if (!item?.email || accionando) return;
    const ok = window.confirm(
      `¿Liberar ${etiqueta} de ${item.nombre || item.email}? Tendrá que volver a cargarlo.`
    );
    if (!ok) return;
    setAccionando(true);
    try {
      await axios.post(
        `${API}/api/usuarios/admin/usuarios/${encodeURIComponent(item.email)}/resetear-identidad`,
        { campo, nota: `Se liberó tu ${etiqueta}. Volvé a entrar y cargalo de nuevo.` },
        { headers }
      );
      toast(`Liberado · ${etiqueta}`);
      await cargar(page);
      if (detalle?.email === item.email) {
        const { data } = await axios.get(
          `${API}/api/usuarios/admin/usuarios/${encodeURIComponent(item.email)}`,
          { headers }
        );
        setDetalle(data);
        if (campo === 'fotos') setMostrandoDni(false);
      }
    } catch (err) {
      toast(err.response?.data?.message || 'No se pudo liberar.');
    } finally {
      setAccionando(false);
    }
  };

  const abrirDetalle = async (item) => {
    try {
      const { data } = await axios.get(
        `${API}/api/usuarios/admin/usuarios/${encodeURIComponent(item.email)}`,
        { headers }
      );
      setDetalle(data);
      setMostrandoDni(false);
    } catch (err) {
      toast(err.response?.data?.message || 'No se pudo abrir el detalle.');
    }
  };

  return (
    <div className="super-seccion">
      <header className="super-seccion-cabecera">
        <div>
          <h1>Usuarios</h1>
          <p>
            {esSuper
              ? 'Vecinos de toda la provincia: buscar, desactivar o liberar identidad sin entrar a Firebase.'
              : 'Vecinos de tu jurisdicción: buscar, desactivar o liberar identidad.'}
          </p>
        </div>
      </header>

      {aviso && <div className="admin-dash-toast">{aviso}</div>}

      <div className="admin-dash-filtros super-filtros" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
        <input
          type="search"
          placeholder="Buscar email, nombre, DNI…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Buscar usuario"
        />
        <select
          value={estado}
          onChange={(e) => setEstado(e.target.value)}
          aria-label="Estado de cuenta"
        >
          <option value="activos">Activos</option>
          <option value="desactivados">Desactivados</option>
        </select>
        {esSuper && (
          <>
            <SelectMunicipio
              value={soloPendiente ? '' : tenantId}
              onChange={(id) => {
                setSoloPendiente(false);
                setTenantId(id);
              }}
              options={tenantsOptions}
              emptyLabel="Todos los municipios…"
              placeholder="Filtrar municipio…"
              allowEmpty
              ariaLabel="Filtrar por municipio"
              compact
            />
            <button
              type="button"
              className={`admin-dash-btn${soloPendiente ? ' primario' : ''}`}
              onClick={() => {
                setSoloPendiente((v) => !v);
                setTenantId('');
              }}
            >
              Sin municipio activo
            </button>
          </>
        )}
      </div>

      <p className="admin-dash-sub" style={{ margin: '0.5rem 0 1rem' }}>
        {cargando ? 'Cargando…' : `${total} usuario${total === 1 ? '' : 's'}`}
      </p>

      {cargando && items.length === 0 ? (
        <p className="admin-dash-vacio">Cargando usuarios…</p>
      ) : items.length === 0 ? (
        <p className="admin-dash-vacio">No hay usuarios con ese filtro.</p>
      ) : (
        <ul className="super-lista">
          {items.map((item) => (
            <li key={item.email} className="super-tarjeta">
              <div className="super-tarjeta-info">
                <strong>{item.nombre || '(sin nombre)'}</strong>
                <span className="super-meta">{item.email}</span>
                <span className="super-meta">
                  DNI {item.dni || '—'} · Cel. {item.telefono || '—'}
                  {item.telefonoConfirmado ? ' ✓' : ''}
                </span>
                <span className="super-meta">
                  {item.municipioPendiente || !item.municipioTenantId
                    ? (item.municipioNombre || 'Municipio aún no activo')
                    : item.municipioNombre || '—'}
                  {' · '}
                  {item.activo === false ? 'Desactivado' : 'Activo'}
                  {item.soporteEstado === 'pendiente' ? ' · Soporte pendiente' : ''}
                </span>
              </div>
              <div className="super-tarjeta-acciones">
                <button
                  type="button"
                  className="admin-dash-btn"
                  disabled={accionando}
                  onClick={() => abrirDetalle(item)}
                >
                  Ver
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {(page > 1 || hasMore) && (
        <div className="admin-dash-filtros" style={{ marginTop: '1rem', gap: '0.5rem' }}>
          <button
            type="button"
            className="admin-dash-btn"
            disabled={page <= 1 || cargando}
            onClick={() => cargar(page - 1)}
          >
            Anterior
          </button>
          <span className="admin-dash-sub">Página {page}</span>
          <button
            type="button"
            className="admin-dash-btn"
            disabled={!hasMore || cargando}
            onClick={() => cargar(page + 1)}
          >
            Siguiente
          </button>
        </div>
      )}

      {detalle && (
        <div
          className="panel-vecino-fondo"
          onClick={() => {
            setDetalle(null);
            setMostrandoDni(false);
          }}
          role="presentation"
        >
          <div className="panel-vecino panel-mi-perfil" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="panel-vecino-cabecera">
              <h3>{detalle.nombre || 'Usuario'}</h3>
              <button
                type="button"
                onClick={() => {
                  setDetalle(null);
                  setMostrandoDni(false);
                }}
              >
                Cerrar
              </button>
            </div>
            <div className="perfil-formulario usuarios-ficha">
              <p className="perfil-nota usuarios-ficha-fila">
                <span><strong>Nombre:</strong> {detalle.nombre || '—'}</span>
                {detalle.nombre ? (
                  <button
                    type="button"
                    className="usuarios-ficha-accion"
                    disabled={accionando}
                    onClick={() => liberarCampo(detalle, 'nombre', 'nombre')}
                  >
                    Liberar
                  </button>
                ) : null}
              </p>
              <p className="perfil-nota usuarios-ficha-fila">
                <span><strong>Email:</strong> {detalle.email}</span>
              </p>
              <p className="perfil-nota usuarios-ficha-fila">
                <span><strong>DNI:</strong> {detalle.dni || '—'}</span>
                {detalle.dni ? (
                  <button
                    type="button"
                    className="usuarios-ficha-accion"
                    disabled={accionando}
                    onClick={() => liberarCampo(detalle, 'dni', 'DNI')}
                  >
                    Liberar
                  </button>
                ) : null}
              </p>
              <p className="perfil-nota usuarios-ficha-fila">
                <span><strong>Celular:</strong> {detalle.telefono || '—'}{detalle.telefonoConfirmado ? ' (confirmado)' : ''}</span>
              </p>
              <p className="perfil-nota usuarios-ficha-fila">
                <span><strong>Municipio:</strong> {detalle.municipioNombre || '—'}</span>
                {(detalle.municipioNombre || detalle.municipioTenantId || detalle.municipioPendiente) ? (
                  <button
                    type="button"
                    className="usuarios-ficha-accion"
                    disabled={accionando}
                    onClick={() => liberarCampo(detalle, 'municipio', 'municipio')}
                  >
                    Liberar
                  </button>
                ) : null}
              </p>
              <p className="perfil-nota usuarios-ficha-fila">
                <span><strong>Ingreso:</strong> {detalle.proveedor === 'google' ? 'Google' : 'Correo'}</span>
              </p>
              <p className="perfil-nota usuarios-ficha-fila">
                <span>
                  <strong>Fotos DNI:</strong>{' '}
                  {detalle.dniFotosCargadas ? 'Cargadas' : 'No'}
                  {detalle.dniFotosCargadas && (
                    <>
                      {' · '}
                      <button
                        type="button"
                        className="usuarios-ficha-accion"
                        onClick={() => setMostrandoDni((v) => !v)}
                      >
                        {mostrandoDni ? 'Ocultar' : 'Ver'}
                      </button>
                    </>
                  )}
                </span>
                {detalle.dniFotosCargadas ? (
                  <button
                    type="button"
                    className="usuarios-ficha-accion"
                    disabled={accionando}
                    onClick={() => liberarCampo(detalle, 'fotos', 'fotos del DNI')}
                  >
                    Liberar
                  </button>
                ) : null}
              </p>
              {mostrandoDni && detalle.dniFotosCargadas && (
                <div className="admin-dash-dni-fotos">
                  {detalle.dniFotoFrenteUrl && (
                    <figure>
                      <img src={urlDni(detalle.dniFotoFrenteUrl)} alt="Frente del DNI" />
                      <figcaption>Frente del DNI</figcaption>
                    </figure>
                  )}
                  {detalle.dniFotoDorsoUrl && (
                    <figure>
                      <img src={urlDni(detalle.dniFotoDorsoUrl)} alt="Dorso del DNI" />
                      <figcaption>Dorso del DNI</figcaption>
                    </figure>
                  )}
                </div>
              )}
              <p className="perfil-nota usuarios-ficha-fila">
                <span><strong>Estado:</strong> {detalle.activo === false ? 'Desactivado' : 'Activo'}</span>
                {detalle.activo === false ? (
                  <button
                    type="button"
                    className="usuarios-ficha-accion usuarios-ficha-accion-ok"
                    disabled={accionando}
                    onClick={() => activar(detalle)}
                  >
                    Activar
                  </button>
                ) : (
                  <button
                    type="button"
                    className="usuarios-ficha-accion usuarios-ficha-accion-peligro"
                    disabled={accionando}
                    onClick={() => desactivar(detalle)}
                  >
                    Desactivar
                  </button>
                )}
              </p>
              {detalle.desactivadoNota && (
                <p className="perfil-nota">Nota: {detalle.desactivadoNota}</p>
              )}
              {detalle.soporteEstado && (
                <p className="perfil-nota">
                  <strong>Soporte:</strong> {detalle.soporteEstado}
                  {detalle.soporteMensaje ? ` — “${detalle.soporteMensaje}”` : ''}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UsuariosPanel;
