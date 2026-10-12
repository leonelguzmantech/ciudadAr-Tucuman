import React, { useState, useEffect } from 'react';
import axios from 'axios';

const SuperAdminPanel = ({ userId }) => {
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [stats, setStats] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTenant, setNewTenant] = useState({
    name: '',
    slug: '',
    type: 'municipality',
    billingPlan: 'free',
    contactEmail: '',
    status: 'pending',
  });

  const fetchTenants = async () => {
    try {
      setLoading(true);
      const response = await axios.get('http://localhost:5001/api/tenants', {
        headers: {
          'x-user-id': userId,
        },
      });
      setTenants(response.data || []);
      setError('');
    } catch (err) {
      console.error('Error fetching tenants:', err);
      setError('No se pudieron cargar los tenants.');
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await axios.get('http://localhost:5001/api/admin/stats', {
        headers: {
          'x-user-id': userId,
        },
      });
      setStats(response.data);
    } catch (err) {
      console.error('Error fetching stats:', err);
    }
  };

  useEffect(() => {
    if (userId) {
      fetchTenants();
      fetchStats();
    }
  }, [userId]);

  const handleCreateTenant = async (e) => {
    e.preventDefault();
    try {
      const response = await axios.post('http://localhost:5001/api/tenants', newTenant, {
        headers: {
          'x-user-id': userId,
        },
      });
      setTenants([...tenants, response.data]);
      setShowCreateModal(false);
      setNewTenant({
        name: '',
        slug: '',
        type: 'municipality',
        billingPlan: 'free',
        contactEmail: '',
        status: 'pending',
      });
      fetchStats();
    } catch (err) {
      console.error('Error creating tenant:', err);
      alert('Error al crear tenant: ' + (err.response?.data?.message || err.message));
    }
  };

  const handleUpdateTenant = async (tenantId, updates) => {
    try {
      const response = await axios.patch(`http://localhost:5001/api/tenants/${tenantId}`, updates, {
        headers: {
          'x-user-id': userId,
        },
      });
      setTenants(tenants.map(t => t._id === tenantId ? response.data : t));
      fetchStats();
    } catch (err) {
      console.error('Error updating tenant:', err);
      alert('Error al actualizar tenant: ' + (err.response?.data?.message || err.message));
    }
  };

  const getPlanColor = (plan) => {
    switch (plan) {
      case 'enterprise': return { bg: '#fef3c7', color: '#92400e' };
      case 'pro': return { bg: '#dbeafe', color: '#1e40af' };
      default: return { bg: '#f3f4f6', color: '#374151' };
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'active': return { bg: '#d1fae5', color: '#065f46' };
      case 'inactive': return { bg: '#fee2e2', color: '#991b1b' };
      default: return { bg: '#fef3c7', color: '#92400e' };
    }
  };

  if (loading) {
    return <div style={{ padding: '20px', textAlign: 'center' }}>Cargando...</div>;
  }

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '28px', fontWeight: 'bold' }}>Panel de Super Administración</h1>
          <p style={{ margin: '8px 0 0 0', color: '#6b7280' }}>
            Gestioná tenants, suscripciones y estadísticas globales
          </p>
          <p style={{ margin: '4px 0 0 0', color: '#9ca3af', fontSize: '14px', fontStyle: 'italic' }}>
            ⚠️ Los casos específicos de cada municipio son privados. Solo gestionás tenants y suscripciones.
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          style={{
            padding: '10px 20px',
            background: '#10b981',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontWeight: 'bold',
          }}
        >
          + Nuevo Tenant
        </button>
      </div>

      {error && (
        <div style={{ padding: '12px', background: '#fee2e2', color: '#991b1b', borderRadius: '8px', marginBottom: '20px' }}>
          {error}
        </div>
      )}

      {/* Estadísticas */}
      {stats && (
        <div>
          <div style={{ marginBottom: '12px', padding: '12px', background: '#fef3c7', borderRadius: '8px', border: '1px solid #fbbf24' }}>
            <p style={{ margin: 0, color: '#92400e', fontSize: '14px' }}>
              📊 <strong>Estadísticas agregadas:</strong> Solo números totales. Los casos específicos de cada municipio son privados y solo los gestiona su TENANT_ADMIN.
            </p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
            <div style={{ padding: '20px', background: '#fff', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
              <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#1f2937' }}>{stats.totalTenants || 0}</div>
              <div style={{ color: '#6b7280', marginTop: '4px' }}>Total Tenants</div>
            </div>
            <div style={{ padding: '20px', background: '#fff', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
              <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#10b981' }}>{stats.activeTenants || 0}</div>
              <div style={{ color: '#6b7280', marginTop: '4px' }}>Tenants Activos</div>
            </div>
            <div style={{ padding: '20px', background: '#fff', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
              <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#3b82f6' }}>{stats.totalMarkers || 0}</div>
              <div style={{ color: '#6b7280', marginTop: '4px' }}>Total Casos (todos los tenants)</div>
            </div>
            <div style={{ padding: '20px', background: '#fff', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
              <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#8b5cf6' }}>{stats.totalBusinesses || 0}</div>
              <div style={{ color: '#6b7280', marginTop: '4px' }}>Total Negocios (todos los tenants)</div>
            </div>
          </div>
        </div>
      )}

      {/* Tabla de Tenants */}
      <div style={{ background: '#fff', borderRadius: '8px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
              <th style={{ textAlign: 'left', padding: '12px', fontWeight: '600' }}>Nombre</th>
              <th style={{ textAlign: 'left', padding: '12px', fontWeight: '600' }}>Slug</th>
              <th style={{ textAlign: 'left', padding: '12px', fontWeight: '600' }}>Tipo</th>
              <th style={{ textAlign: 'left', padding: '12px', fontWeight: '600' }}>Plan</th>
              <th style={{ textAlign: 'left', padding: '12px', fontWeight: '600' }}>Estado</th>
              <th style={{ textAlign: 'left', padding: '12px', fontWeight: '600' }}>Email</th>
              <th style={{ textAlign: 'left', padding: '12px', fontWeight: '600' }}>Creado</th>
              <th style={{ textAlign: 'left', padding: '12px', fontWeight: '600' }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {tenants.map((tenant) => {
              const planStyle = getPlanColor(tenant.billingPlan);
              const statusStyle = getStatusColor(tenant.status);
              return (
                <tr key={tenant._id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <td style={{ padding: '12px', fontWeight: '500' }}>{tenant.name}</td>
                  <td style={{ padding: '12px', fontFamily: 'monospace', color: '#6b7280' }}>{tenant.slug}</td>
                  <td style={{ padding: '12px', textTransform: 'capitalize' }}>{tenant.type}</td>
                  <td style={{ padding: '12px' }}>
                    <span
                      style={{
                        padding: '4px 12px',
                        borderRadius: '12px',
                        background: planStyle.bg,
                        color: planStyle.color,
                        fontSize: '12px',
                        fontWeight: '600',
                        textTransform: 'uppercase',
                      }}
                    >
                      {tenant.billingPlan}
                    </span>
                  </td>
                  <td style={{ padding: '12px' }}>
                    <select
                      value={tenant.status}
                      onChange={(e) => handleUpdateTenant(tenant._id, { status: e.target.value })}
                      style={{
                        padding: '4px 8px',
                        borderRadius: '6px',
                        border: '1px solid #d1d5db',
                        background: statusStyle.bg,
                        color: statusStyle.color,
                        cursor: 'pointer',
                      }}
                    >
                      <option value="active">Activo</option>
                      <option value="inactive">Inactivo</option>
                      <option value="pending">Pendiente</option>
                    </select>
                  </td>
                  <td style={{ padding: '12px', color: '#6b7280' }}>{tenant.contactEmail || '-'}</td>
                  <td style={{ padding: '12px', color: '#6b7280', fontSize: '14px' }}>
                    {new Date(tenant.createdAt).toLocaleDateString()}
                  </td>
                  <td style={{ padding: '12px' }}>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        onClick={() => {
                          const newPlan = tenant.billingPlan === 'free' ? 'pro' : tenant.billingPlan === 'pro' ? 'enterprise' : 'free';
                          handleUpdateTenant(tenant._id, { billingPlan: newPlan });
                        }}
                        style={{
                          padding: '6px 12px',
                          border: '1px solid #3b82f6',
                          borderRadius: '6px',
                          background: '#dbeafe',
                          color: '#1e40af',
                          cursor: 'pointer',
                          fontSize: '12px',
                        }}
                      >
                        Cambiar Plan
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {tenants.length === 0 && (
              <tr>
                <td colSpan="8" style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>
                  No hay tenants registrados aún.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal de Creación */}
      {showCreateModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setShowCreateModal(false)}
        >
          <div
            style={{
              background: '#fff',
              padding: '24px',
              borderRadius: '8px',
              width: '90%',
              maxWidth: '500px',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ marginTop: 0 }}>Crear Nuevo Tenant</h2>
            <form onSubmit={handleCreateTenant}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500' }}>Nombre</label>
                <input
                  type="text"
                  value={newTenant.name}
                  onChange={(e) => setNewTenant({ ...newTenant, name: e.target.value })}
                  required
                  style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                />
              </div>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500' }}>Slug (único)</label>
                <input
                  type="text"
                  value={newTenant.slug}
                  onChange={(e) => setNewTenant({ ...newTenant, slug: e.target.value.toLowerCase().replace(/\s+/g, '-') })}
                  required
                  style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                  placeholder="ej: municipio-san-miguel"
                />
              </div>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500' }}>Tipo</label>
                <select
                  value={newTenant.type}
                  onChange={(e) => setNewTenant({ ...newTenant, type: e.target.value })}
                  style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                >
                  <option value="municipality">Municipio</option>
                  <option value="business">Negocio</option>
                  <option value="hybrid">Híbrido</option>
                </select>
              </div>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500' }}>Plan de Suscripción</label>
                <select
                  value={newTenant.billingPlan}
                  onChange={(e) => setNewTenant({ ...newTenant, billingPlan: e.target.value })}
                  style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                >
                  <option value="free">Gratis</option>
                  <option value="pro">Pro</option>
                  <option value="enterprise">Enterprise</option>
                </select>
              </div>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500' }}>Email de Contacto</label>
                <input
                  type="email"
                  value={newTenant.contactEmail}
                  onChange={(e) => setNewTenant({ ...newTenant, contactEmail: e.target.value })}
                  style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                />
              </div>
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  style={{
                    padding: '8px 16px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    background: '#fff',
                    cursor: 'pointer',
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  style={{
                    padding: '8px 16px',
                    background: '#10b981',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontWeight: 'bold',
                  }}
                >
                  Crear Tenant
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default SuperAdminPanel;

