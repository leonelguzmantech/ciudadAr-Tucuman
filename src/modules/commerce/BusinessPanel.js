import React, { useEffect, useState } from 'react';
import axios from 'axios';

const BusinessPanel = ({ userId, tenantId, userRole = 'TENANT_ADMIN' }) => {
  const [businesses, setBusinesses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingBusiness, setEditingBusiness] = useState(null);
  const [editForm, setEditForm] = useState({
    name: '',
    description: '',
    category: 'other',
    status: 'inactive',
    contact: {
      phone: '',
      whatsapp: '',
      email: '',
      website: '',
    },
  });
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newBusiness, setNewBusiness] = useState({
    name: '',
    description: '',
    category: 'other',
    status: 'inactive',
    contact: {
      phone: '',
      whatsapp: '',
      email: '',
      website: '',
    },
  });

  const canEditBusiness = userRole === 'TENANT_ADMIN';

  const fetchBusinesses = async () => {
    try {
      setLoading(true);
      const response = await axios.get('http://localhost:5001/api/businesses', {
        headers: {
          'x-user-id': userId,
          'x-tenant-id': tenantId,
          'x-user-role': userRole,
        },
      });
      setBusinesses(response.data || []);
      setError('');
    } catch (err) {
      console.error('Error fetching businesses:', err);
      setError('No se pudieron cargar los negocios.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (userId && tenantId) {
      fetchBusinesses();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, tenantId]);

  const openEditModal = (business) => {
    setEditingBusiness(business);
    setEditForm({
      name: business.name || '',
      description: business.description || '',
      category: business.category || 'other',
      status: business.status || 'inactive',
      contact: {
        phone: business.contact?.phone || '',
        whatsapp: business.contact?.whatsapp || '',
        email: business.contact?.email || '',
        website: business.contact?.website || '',
      },
    });
    setShowEditModal(true);
  };

  const handleUpdateBusiness = async (e) => {
    e.preventDefault();
    if (!canEditBusiness) {
      alert('Solo un TENANT_ADMIN puede editar negocios.');
      return;
    }
    try {
      const response = await axios.patch(
        `http://localhost:5001/api/businesses/${editingBusiness._id}`,
        editForm,
        {
          headers: {
            'x-user-id': userId,
            'x-tenant-id': tenantId,
            'x-user-role': userRole,
          },
        }
      );
      setBusinesses(
        businesses.map((business) =>
          business._id === editingBusiness._id ? response.data : business
        )
      );
      setShowEditModal(false);
      setEditingBusiness(null);
    } catch (err) {
      console.error('Error updating business:', err);
      alert('Error al actualizar negocio: ' + (err.response?.data?.message || err.message));
    }
  };

  const handleToggleStatus = async (business) => {
    if (!canEditBusiness) {
      alert('Solo un TENANT_ADMIN puede cambiar el estado.');
      return;
    }
    const nextStatus = business.status === 'active' ? 'inactive' : 'active';
    try {
      const response = await axios.patch(
        `http://localhost:5001/api/businesses/${business._id}`,
        { status: nextStatus },
        {
          headers: {
            'x-user-id': userId,
            'x-tenant-id': tenantId,
            'x-user-role': userRole,
          },
        }
      );
      setBusinesses(
        businesses.map((item) =>
          item._id === business._id ? response.data : item
        )
      );
    } catch (err) {
      console.error('Error toggling business status:', err);
      alert('Error al cambiar estado: ' + (err.response?.data?.message || err.message));
    }
  };

  const handleCreateBusiness = async (e) => {
    e.preventDefault();
    try {
      const response = await axios.post('http://localhost:5001/api/businesses', newBusiness, {
        headers: {
          'x-user-id': userId,
          'x-tenant-id': tenantId,
          'x-user-role': userRole,
        },
      });
      setBusinesses([response.data, ...businesses]);
      setShowCreateModal(false);
      setNewBusiness({
        name: '',
        description: '',
        category: 'other',
        status: 'inactive',
        contact: {
          phone: '',
          whatsapp: '',
          email: '',
          website: '',
        },
      });
    } catch (err) {
      console.error('Error creating business:', err);
      alert('Error al crear negocio: ' + (err.response?.data?.message || err.message));
    }
  };

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
        <div>
          <h2 style={{ margin: 0 }}>Panel de Comercios</h2>
          <p style={{ margin: 0, color: '#6b7280' }}>
            Gestioná tus negocios y sucursales dentro del municipio.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreateModal(true)}
          style={{
            padding: '8px 16px',
            borderRadius: '8px',
            background: '#10b981',
            color: '#fff',
            border: 'none',
            cursor: 'pointer',
            fontWeight: 'bold',
          }}
        >
          + Nuevo negocio
        </button>
      </div>

      {loading && <p>Cargando negocios...</p>}
      {error && <p style={{ color: '#dc2626' }}>{error}</p>}

      {!loading && !error && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff' }}>
            <thead>
              <tr style={{ background: '#f1f5f9' }}>
                <th style={{ textAlign: 'left', padding: '10px' }}>Nombre</th>
                <th style={{ textAlign: 'left', padding: '10px' }}>Categoría</th>
                <th style={{ textAlign: 'left', padding: '10px' }}>Estado</th>
                <th style={{ textAlign: 'left', padding: '10px' }}>Contacto</th>
                <th style={{ textAlign: 'left', padding: '10px' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {businesses.map((business) => (
                <tr key={business._id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <td style={{ padding: '10px', fontWeight: 'bold' }}>{business.name}</td>
                  <td style={{ padding: '10px', textTransform: 'capitalize' }}>
                    {business.category || 'N/D'}
                  </td>
                  <td style={{ padding: '10px' }}>
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: '12px',
                        background: business.status === 'active' ? '#dcfce7' : '#fee2e2',
                        color: business.status === 'active' ? '#15803d' : '#b91c1c',
                      }}
                    >
                      {business.status || 'inactive'}
                    </span>
                  </td>
                  <td style={{ padding: '10px', color: '#475569' }}>
                    {business.contact?.phone || business.contact?.whatsapp || 'Sin datos'}
                  </td>
                  <td style={{ padding: '10px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => openEditModal(business)}
                      style={{
                        padding: '6px 10px',
                        border: '1px solid #0ea5e9',
                        borderRadius: '6px',
                        background: '#e0f2fe',
                        color: '#0369a1',
                        cursor: 'pointer',
                      }}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      style={{
                        padding: '6px 10px',
                        border: '1px solid #10b981',
                        borderRadius: '6px',
                        background: '#d1fae5',
                        color: '#047857',
                        cursor: 'pointer',
                      }}
                    >
                      Ver sucursales
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleStatus(business)}
                      style={{
                        padding: '6px 10px',
                        border: '1px solid #f97316',
                        borderRadius: '6px',
                        background: '#ffedd5',
                        color: '#c2410c',
                        cursor: 'pointer',
                      }}
                    >
                      {business.status === 'active' ? 'Pasar a inactivo' : 'Pasar a activo'}
                    </button>
                  </td>
                </tr>
              ))}
              {businesses.length === 0 && (
                <tr>
                  <td colSpan="5" style={{ padding: '20px', textAlign: 'center', color: '#6b7280' }}>
                    No hay negocios registrados aún.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

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
              maxWidth: '540px',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginTop: 0 }}>Crear nuevo negocio</h3>
            <form onSubmit={handleCreateBusiness}>
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500' }}>Nombre</label>
                <input
                  type="text"
                  value={newBusiness.name}
                  onChange={(e) => setNewBusiness({ ...newBusiness, name: e.target.value })}
                  required
                  style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                />
              </div>
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500' }}>Descripción</label>
                <textarea
                  value={newBusiness.description}
                  onChange={(e) => setNewBusiness({ ...newBusiness, description: e.target.value })}
                  rows="3"
                  style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500' }}>Categoría</label>
                  <select
                    value={newBusiness.category}
                    onChange={(e) => setNewBusiness({ ...newBusiness, category: e.target.value })}
                    style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                  >
                    <option value="pharmacy">Farmacia</option>
                    <option value="drugstore">Droguería</option>
                    <option value="store24">24 hs</option>
                    <option value="health">Salud</option>
                    <option value="other">Otro</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500' }}>Estado</label>
                  <select
                    value={newBusiness.status}
                    onChange={(e) => setNewBusiness({ ...newBusiness, status: e.target.value })}
                    style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                  >
                    <option value="active">Activo</option>
                    <option value="inactive">Inactivo</option>
                  </select>
                </div>
              </div>
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500' }}>Teléfono</label>
                <input
                  type="text"
                  value={newBusiness.contact.phone}
                  onChange={(e) =>
                    setNewBusiness({
                      ...newBusiness,
                      contact: { ...newBusiness.contact, phone: e.target.value },
                    })
                  }
                  style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                />
              </div>
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500' }}>WhatsApp</label>
                <input
                  type="text"
                  value={newBusiness.contact.whatsapp}
                  onChange={(e) =>
                    setNewBusiness({
                      ...newBusiness,
                      contact: { ...newBusiness.contact, whatsapp: e.target.value },
                    })
                  }
                  style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500' }}>Email</label>
                  <input
                    type="email"
                    value={newBusiness.contact.email}
                    onChange={(e) =>
                      setNewBusiness({
                        ...newBusiness,
                        contact: { ...newBusiness.contact, email: e.target.value },
                      })
                    }
                    style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                  />
                </div>
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500' }}>Web</label>
                  <input
                    type="text"
                    value={newBusiness.contact.website}
                    onChange={(e) =>
                      setNewBusiness({
                        ...newBusiness,
                        contact: { ...newBusiness.contact, website: e.target.value },
                      })
                    }
                    style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                  />
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: '1px solid #d1d5db',
                    background: '#fff',
                    cursor: 'pointer',
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  style={{
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: 'none',
                    background: '#10b981',
                    color: '#fff',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                  }}
                >
                  Guardar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showEditModal && editingBusiness && (
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
          onClick={() => setShowEditModal(false)}
        >
          <div
            style={{
              background: '#fff',
              padding: '24px',
              borderRadius: '8px',
              width: '90%',
              maxWidth: '540px',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginTop: 0 }}>Editar negocio</h3>
            <form onSubmit={handleUpdateBusiness}>
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500' }}>Nombre</label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  required
                  style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                />
              </div>
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500' }}>Descripción</label>
                <textarea
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  rows="3"
                  style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500' }}>Categoría</label>
                  <select
                    value={editForm.category}
                    onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                    style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                  >
                    <option value="pharmacy">Farmacia</option>
                    <option value="drugstore">Droguería</option>
                    <option value="store24">24 hs</option>
                    <option value="health">Salud</option>
                    <option value="other">Otro</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500' }}>Estado</label>
                  <select
                    value={editForm.status}
                    onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                    style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                  >
                    <option value="active">Activo</option>
                    <option value="inactive">Inactivo</option>
                  </select>
                </div>
              </div>
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500' }}>Teléfono</label>
                <input
                  type="text"
                  value={editForm.contact.phone}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      contact: { ...editForm.contact, phone: e.target.value },
                    })
                  }
                  style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                />
              </div>
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500' }}>WhatsApp</label>
                <input
                  type="text"
                  value={editForm.contact.whatsapp}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      contact: { ...editForm.contact, whatsapp: e.target.value },
                    })
                  }
                  style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500' }}>Email</label>
                  <input
                    type="email"
                    value={editForm.contact.email}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        contact: { ...editForm.contact, email: e.target.value },
                      })
                    }
                    style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                  />
                </div>
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500' }}>Web</label>
                  <input
                    type="text"
                    value={editForm.contact.website}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        contact: { ...editForm.contact, website: e.target.value },
                      })
                    }
                    style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                  />
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: '1px solid #d1d5db',
                    background: '#fff',
                    cursor: 'pointer',
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  style={{
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: 'none',
                    background: '#0ea5e9',
                    color: '#fff',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                  }}
                >
                  Guardar cambios
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default BusinessPanel;






