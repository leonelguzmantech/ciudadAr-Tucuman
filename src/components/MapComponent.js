import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { GoogleMap, useJsApiLoader, Marker, Circle } from '@react-google-maps/api'; // Marker + círculos para ubicación
import { useDropzone } from 'react-dropzone';
import axios from 'axios';

// const libraries = ['marker']; // Eliminado

function MapComponent({ googleMapsApiKey, currentUser }) {
  const userId = currentUser ? String(currentUser).trim().toLowerCase() : 'anonimo';
  const tenantId = process.env.REACT_APP_TENANT_ID || 'default';
  const [markers, setMarkers] = useState([]);
  const [selectedImage, setSelectedImage] = useState(null);
  const [formData, setFormData] = useState({
    lat: 0,
    lng: 0,
    image: null,
    date: '',
    time: '',
    description: '',
    urgency: 'media',
    status: 'pendiente_aprobacion',
    category: 'persona',
    resolvedAt: null,
  });
  const [showPopup, setShowPopup] = useState(false);
  const [editMode, setEditMode] = useState(null); // Estado para el modo de edición
  const [userLocation, setUserLocation] = useState(null); // Estado para la ubicación del usuario
  const [geoError, setGeoError] = useState(null); // Estado para almacenar errores de geolocalización
  const [urgencyFilter, setUrgencyFilter] = useState('todas'); // Filtro de urgencia
  const [categoryFilter, setCategoryFilter] = useState('todas'); // Filtro de categoría
  const [isImageZoomed, setIsImageZoomed] = useState(false); // Estado para zoom de la imagen
  const [canEdit, setCanEdit] = useState(true);
  const [showDeleteOnly, setShowDeleteOnly] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const statusOptions = ['pendiente_aprobacion', 'pendiente', 'en_proceso', 'resuelto'];
  const categoryOptions = [
    { value: 'familias', label: 'Familias' },
    { value: 'persona', label: 'Persona en situación de calle' },
    { value: 'perros_gatos', label: 'Perros y gatos' },
    { value: 'reparaciones', label: 'Reparaciones' },
  ];
  const [highlightedMarkerId, setHighlightedMarkerId] = useState(null);
  const [deletedMarker, setDeletedMarker] = useState(null); // Caso eliminado temporalmente para poder deshacer
  const [deleteCountdown, setDeleteCountdown] = useState(10); // Contador de segundos para eliminar
  const deleteTimeoutRef = useRef(null); // Referencia al timeout de eliminación
  const countdownIntervalRef = useRef(null); // Referencia al intervalo del contador
  const statusLabels = {
    pendiente_aprobacion: 'Pendiente de aprobación',
    pendiente: 'Pendiente',
    en_proceso: 'En proceso',
    resuelto: 'Resuelto',
  };
  const statusBadgeColors = {
    pendiente_aprobacion: '#fbbf24',
    pendiente: '#fde68a',
    en_proceso: '#bfdbfe',
    resuelto: '#bbf7d0',
  };
  const categoryLabels = useMemo(
    () => ({
      familias: 'Familias',
      persona: 'Persona en situación de calle',
      perros_gatos: 'Perros y gatos',
      reparaciones: 'Reparaciones',
    }),
    []
  );
const TEN_DAYS_MS = 10 * 24 * 60 * 60 * 1000;

const getStatusBadgeStyle = (status) => ({
  background: statusBadgeColors[status] || '#e5e7eb',
  color: '#1f2937',
  padding: '2px 8px',
  borderRadius: '12px',
  fontSize: '12px',
  textTransform: 'capitalize',
  display: 'inline-block',
});

const getDaysUntilRemoval = (dateString) => {
  if (!dateString) return null;
  const diff = TEN_DAYS_MS - (Date.now() - new Date(dateString).getTime());
  if (diff <= 0) return 0;
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
};
  const normalizeCategoryValue = useCallback(
    (value) => {
      if (!value) return 'persona';
      const normalized = String(value).trim().toLowerCase();
      if (categoryLabels[normalized]) return normalized;
      if (normalized.includes('familia')) return 'familias';
      if (normalized.includes('perro') || normalized.includes('gato')) return 'perros_gatos';
      if (normalized.includes('repar')) return 'reparaciones';
      if (normalized.includes('persona')) return 'persona';
      return 'persona';
    },
    [categoryLabels]
  );

const stopPropagation = (event) => {
  event.stopPropagation();
};

const stopTouchPropagation = (event) => {
  event.stopPropagation();
};

  const handleCategoryChange = (e) => {
        setFormData({
          ...formData,
      category: normalizeCategoryValue(e.target.value),
    });
  };

  const buildImageUrl = useCallback(
    (path) => {
      if (!path) return null;
      if (path.startsWith('data:')) return path;
      if (path.startsWith('http://') || path.startsWith('https://')) {
        if (!path.includes('tenantId=')) {
          const separator = path.includes('?') ? '&' : '?';
          return `${path}${separator}tenantId=${tenantId}`;
        }
        return path;
      }
      const separator = path.includes('?') ? '&' : '?';
      return `http://localhost:5001${path}${separator}tenantId=${tenantId}`;
    },
    [tenantId]
  );

  const handleImageError = useCallback(() => {
    setSelectedImage(null);
  }, []);

  // Obtener y seguir la geolocalización del usuario (como un punto azul en tiempo "real")
  useEffect(() => {
    if (!navigator.geolocation) {
      setGeoError('Geolocalización no soportada por el navegador.');
      return;
    }

    const handleSuccess = (position) => {
      const { latitude, longitude } = position.coords;
      const current = { lat: latitude, lng: longitude };
      setUserLocation(current);
      setFormData((prevFormData) => ({
        ...prevFormData,
        lat: latitude,
        lng: longitude,
      }));
    };

    const handleError = (error) => {
        let errorMessage = '';
        switch (error.code) {
          case error.PERMISSION_DENIED:
          errorMessage = 'Permiso de ubicación denegado. Por favor, habilítalo.';
            break;
          case error.POSITION_UNAVAILABLE:
          errorMessage = 'Ubicación no disponible. Intenta más tarde.';
            break;
          case error.TIMEOUT:
          errorMessage = 'La solicitud de ubicación expiró. Intenta de nuevo.';
            break;
          default:
          errorMessage = 'Error desconocido al obtener la ubicación.';
        }
        console.error('Error getting user location:', error);
        setGeoError(errorMessage);
    };

    navigator.geolocation.getCurrentPosition(handleSuccess, handleError, {
      enableHighAccuracy: true,
    });

    const watchId = navigator.geolocation.watchPosition(handleSuccess, handleError, {
      enableHighAccuracy: true,
    });

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, []);

  useEffect(() => {
    const fetchRole = async () => {
      if (!userId || userId === 'anonimo') {
        setIsAdmin(false);
        return;
      }
      try {
        const response = await axios.get('http://localhost:5001/api/auth/me', {
          headers: {
            'x-user-id': userId,
            'x-tenant-id': tenantId,
          },
        });
        setIsAdmin(response.data.isAdmin);
      } catch (error) {
        setIsAdmin(false);
        console.error('Error verificando rol de administrador:', error);
      }
    };

    fetchRole();
  }, [userId, tenantId]);

  // Cargar marcadores existentes al inicio
  useEffect(() => {
    const fetchMarkers = async () => {
      try {
        const response = await axios.get('http://localhost:5001/api/markers', {
          headers: {
            'x-user-id': userId,
            'x-tenant-id': tenantId,
          },
        });
        const savedMarkers = response.data.map(marker => ({
          ...marker,
          isSaved: true,
          urgency: marker.urgency || 'media',
          category: normalizeCategoryValue(marker.category),
          status: marker.status || 'pendiente',
          resolvedAt: marker.resolvedAt || null,
          caseId: marker.caseId || null,
          resolvedBy: marker.resolvedBy || null,
          resolvedByReportedAt: marker.resolvedByReportedAt || null,
          createdBy: marker.createdBy
            ? String(marker.createdBy).trim().toLowerCase()
            : 'anonimo',
        }));
        setMarkers(savedMarkers);
      } catch (error) {
        console.error('Error fetching markers:', error);
      }
    };

    if (tenantId && tenantId !== 'default') {
      fetchMarkers();
    }
  }, [normalizeCategoryValue, tenantId, userId]);

  // Verificar si el usuario tiene marcadores de "familias" y ajustar el filtro si es necesario
  useEffect(() => {
    if (!isAdmin && categoryFilter === 'familias') {
      const hasFamiliesMarkers = markers.some(marker => {
        if (marker.category === 'familias') {
          const markerOwner = marker.createdBy
            ? String(marker.createdBy).trim().toLowerCase()
            : 'anonimo';
          return markerOwner === userId;
        }
        return false;
      });
      if (!hasFamiliesMarkers) {
        setCategoryFilter('todas');
      }
    }
  }, [markers, categoryFilter, isAdmin, userId]);

  // Función para manejar la carga de imágenes y datos adicionales
  const onDrop = async (acceptedFiles) => {
    const file = acceptedFiles[0];
    const reader = new FileReader();

    reader.onload = function () {
      setSelectedImage(reader.result);
    };

    reader.readAsDataURL(file);

    setFormData({
      ...formData,
      image: file,
    });
    setIsImageZoomed(false);
  };

  // Restablecer el zoom cuando cambia la imagen seleccionada o se limpia
  useEffect(() => {
    setIsImageZoomed(false);
  }, [selectedImage]);

  // Funciones para manejar cambios en los campos de texto
  const handleDateChange = (e) => {
    setFormData({
      ...formData,
      date: e.target.value,
    });
  };

  const handleTimeChange = (e) => {
    setFormData({
      ...formData,
      time: e.target.value,
    });
  };

  const handleDescriptionChange = (e) => {
    setFormData({
      ...formData,
      description: e.target.value,
    });
  };

  const handleUrgencyChange = (e) => {
    setFormData({
      ...formData,
      urgency: e.target.value,
    });
  };

  // Configuración del Dropzone
  const { getRootProps, getInputProps, open } = useDropzone({
    onDrop,
    noClick: true,
    noKeyboard: true,
  });

  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey,
    language: 'es',
    region: 'ES',
    // libraries: libraries, // Eliminado
    // mapIds: ['7f9f71bb3b378371fcb70fd1'], // ID de mapa eliminado
  });

  const mapRef = useRef(null);
  const zoomListenerRef = useRef(null);
  
  const onMapLoad = useCallback((map) => {
    mapRef.current = map;
    
    // Agregar listener para mantener el mapa centrado en la ubicación del usuario al hacer zoom
    if (userLocation) {
      // Limpiar listener anterior si existe
      if (zoomListenerRef.current) {
        window.google.maps.event.removeListener(zoomListenerRef.current);
      }
      
      zoomListenerRef.current = map.addListener('zoom_changed', () => {
        if (userLocation && mapRef.current) {
          const currentCenter = mapRef.current.getCenter();
          if (currentCenter) {
            // Calcular distancia simple en grados (aproximación)
            const latDiff = Math.abs(currentCenter.lat() - userLocation.lat);
            const lngDiff = Math.abs(currentCenter.lng() - userLocation.lng);
            // Si el centro está muy cerca (menos de ~0.0005 grados, aproximadamente 50 metros), re-centrar
            if (latDiff < 0.0005 && lngDiff < 0.0005) {
              mapRef.current.panTo(userLocation);
            }
          }
        }
      });
    }
  }, [userLocation]);
  
  // Limpiar listener al desmontar
  useEffect(() => {
    return () => {
      if (zoomListenerRef.current) {
        window.google.maps.event.removeListener(zoomListenerRef.current);
      }
    };
  }, []);

  const onMapClick = useCallback((e) => {
    const lat = e.latLng.lat();
    const lng = e.latLng.lng();
    setFormData({
      lat,
      lng,
      image: null,
      date: '',
      time: '',
      description: '',
      urgency: 'media',
      status: 'pendiente_aprobacion',
      category: 'persona',
      resolvedAt: null,
    });
    setSelectedImage(null);
    setIsImageZoomed(false);
    setShowPopup(true);
    setEditMode(null); // Asegurar que estamos en modo de creación al hacer clic en el mapa
    setCanEdit(true);
  }, []);

  const handleMarkerClick = useCallback((marker, forceAdmin = false) => {
    setEditMode(marker._id); // Activar el modo de edición para el marcador seleccionado
    setFormData({
      lat: marker.lat,
      lng: marker.lng,
      date: marker.date,
      time: marker.time,
      description: marker.description,
      image: null, // No cargamos una nueva imagen por defecto en la edición
      urgency: marker.urgency || 'media',
      category: normalizeCategoryValue(marker.category),
      status: marker.status || 'pendiente',
      resolvedAt: marker.resolvedAt || null,
      caseId: marker.caseId || null,
      resolvedBy: marker.resolvedBy || null,
      resolvedByReportedAt: marker.resolvedByReportedAt || null,
    });
    setSelectedImage(marker.imageUrl ? buildImageUrl(marker.imageUrl) : null); // Mostrar imagen existente
    setIsImageZoomed(false);
    setShowPopup(true);
    const markerOwner = marker.createdBy
      ? String(marker.createdBy).trim().toLowerCase()
      : 'anonimo';
    setCanEdit(forceAdmin || markerOwner === userId);
    setShowDeleteOnly(forceAdmin);
    if (mapRef.current) {
      mapRef.current.panTo({ lat: marker.lat, lng: marker.lng });
      mapRef.current.setZoom(18);
    }
    setHighlightedMarkerId(marker._id);
  }, [userId, normalizeCategoryValue]);

  // Función para enviar los datos del formulario al servidor
  const handleSubmit = async (e) => {
    e.preventDefault();

    const { lat, lng, image, date, time, description, urgency, category, status } = formData;
    const formDataToSend = new FormData();
    formDataToSend.append('lat', lat);
    formDataToSend.append('lng', lng);
    formDataToSend.append('image', image);
    formDataToSend.append('date', date);
    formDataToSend.append('time', time);
    formDataToSend.append('description', description);
    formDataToSend.append('urgency', urgency);
    formDataToSend.append('category', category);
    formDataToSend.append('status', status || 'pendiente');

    try {
      const response = await axios.post('http://localhost:5001/api/markers', formDataToSend, {
        headers: {
          'Content-Type': 'multipart/form-data',
          'x-user-id': userId,
          'x-tenant-id': tenantId,
        },
      });
      const newMarker = {
        ...response.data,
        isSaved: true,
        createdBy: userId,
        category: normalizeCategoryValue(response.data.category),
        resolvedAt: response.data.resolvedAt || null,
        caseId: response.data.caseId || null,
        resolvedBy: response.data.resolvedBy || null,
        resolvedByReportedAt: response.data.resolvedByReportedAt || null,
      };
      // Agregamos el nuevo marcador guardado a la lista
      setMarkers((prevMarkers) => [...prevMarkers, newMarker]);
      
      // Mantener el popup abierto mostrando el marcador recién creado con estado "pendiente_aprobacion"
      setEditMode(newMarker._id);
      setFormData({
        lat: newMarker.lat,
        lng: newMarker.lng,
        image: null,
        date: newMarker.date || '',
        time: newMarker.time || '',
        description: newMarker.description || '',
        urgency: newMarker.urgency || 'media',
        category: normalizeCategoryValue(newMarker.category),
        status: newMarker.status || 'pendiente_aprobacion',
        resolvedAt: newMarker.resolvedAt || null,
        caseId: newMarker.caseId || null,
        resolvedBy: newMarker.resolvedBy || null,
        resolvedByReportedAt: newMarker.resolvedByReportedAt || null,
      });
      setSelectedImage(newMarker.imageUrl ? buildImageUrl(newMarker.imageUrl) : null);
      setIsImageZoomed(false);
      setCanEdit(true); // El creador puede editar su propio marcador
      setShowDeleteOnly(false);
      // El popup permanece abierto para mostrar el estado "pendiente_aprobacion"
    } catch (error) {
      console.error('Error uploading marker:', error);
    }
  };

  // Función para manejar la actualización del marcador
  // const handleUpdateMarker = (marker) => {
  //   setEditMode(marker._id); // Activar el modo de edición para el marcador seleccionado
  //   setFormData({
  //     lat: marker.lat,
  //     lng: marker.lng,
  //     date: marker.date,
  //     time: marker.time,
  //     description: marker.description,
  //     image: null, // No cargamos una nueva imagen por defecto
  //   });
  //   setPopupPosition({ lat: marker.lat, lng: marker.lng });
  //   setShowPopup(true);
  // };

  const handleSaveUpdate = async (e, markerId) => {
    e.preventDefault();
    if (!canEdit) {
      return;
    }

    const { lat, lng, image, date, time, description, urgency, category, status } = formData;
    const formDataToUpdate = new FormData();
    formDataToUpdate.append('lat', lat);
    formDataToUpdate.append('lng', lng);
    formDataToUpdate.append('image', image);
    formDataToUpdate.append('date', date);
    formDataToUpdate.append('time', time);
    formDataToUpdate.append('description', description);
    formDataToUpdate.append('urgency', urgency);
    formDataToUpdate.append('category', category);
    formDataToUpdate.append('status', status || 'pendiente');

    try {
      const response = await axios.put(`http://localhost:5001/api/markers/${markerId}`, formDataToUpdate, {
        headers: {
          'Content-Type': 'multipart/form-data',
          'x-user-id': userId,
          'x-tenant-id': tenantId,
        },
      });
      // Actualizar los marcadores en el estado local
      const updatedMarkers = markers.map(marker =>
        marker._id === markerId
          ? {
              ...response.data,
              isSaved: true,
              category: normalizeCategoryValue(response.data.category),
            }
          : marker
      );
      setMarkers(updatedMarkers);
      setEditMode(null); // Salir del modo de edición
      setShowPopup(false);
      setIsImageZoomed(false);
      setSelectedImage(null);
    } catch (error) {
      console.error('Error updating marker:', error);
    }
  };

  // Función para eliminar desde el panel de administración (con opción de deshacer)
  const handleAdminDeleteMarker = (marker) => {
    // Cancelar timeout e intervalo anteriores si existen
    if (deleteTimeoutRef.current) {
      clearTimeout(deleteTimeoutRef.current);
      deleteTimeoutRef.current = null;
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    
    // Guardar el marcador para poder deshacer
    setDeletedMarker(marker);
    setDeleteCountdown(10);
    // Eliminar del estado local
    setMarkers((prevMarkers) =>
      prevMarkers.filter((m) => m._id !== marker._id)
    );
    
    // Contador visual
    countdownIntervalRef.current = setInterval(() => {
      setDeleteCountdown((prev) => {
        if (prev <= 1) {
          if (countdownIntervalRef.current) {
            clearInterval(countdownIntervalRef.current);
            countdownIntervalRef.current = null;
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    
    // Eliminar del backend después de 10 segundos si no se deshace
    deleteTimeoutRef.current = setTimeout(async () => {
      try {
        await axios.delete(`http://localhost:5001/api/markers/${marker._id}`, {
          headers: {
            'x-user-id': userId,
            'x-tenant-id': tenantId,
          },
        });
        setDeletedMarker(null);
        setDeleteCountdown(10);
        deleteTimeoutRef.current = null;
        if (countdownIntervalRef.current) {
          clearInterval(countdownIntervalRef.current);
          countdownIntervalRef.current = null;
        }
      } catch (error) {
        console.error('Error deleting marker:', error);
      }
    }, 10000); // 10 segundos para deshacer
  };

  // Función para deshacer la eliminación
  const handleUndoDelete = () => {
    if (deletedMarker) {
      // Cancelar el timeout de eliminación
      if (deleteTimeoutRef.current) {
        clearTimeout(deleteTimeoutRef.current);
        deleteTimeoutRef.current = null;
      }
      // Cancelar el contador
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
      // Restaurar el marcador en el estado
      setMarkers((prevMarkers) => [...prevMarkers, deletedMarker]);
      setDeletedMarker(null);
      setDeleteCountdown(10);
    }
  };

  // Limpiar timeouts al desmontar
  useEffect(() => {
    return () => {
      if (deleteTimeoutRef.current) {
        clearTimeout(deleteTimeoutRef.current);
      }
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
    };
  }, []);

  // Función para manejar la eliminación del marcador (desde el popup)
  const handleDeleteMarker = async (markerId) => {
    console.log('Attempting to delete marker with ID:', markerId); // Añadido para depuración
    // Quitamos el marcador del estado aunque el backend responda 404 (ya no exista)
    setMarkers((prevMarkers) =>
      prevMarkers.filter((marker) => marker._id !== markerId)
    );
    // Cerramos el popup y salimos de modo edición
    setShowPopup(false);
    setEditMode(null);
    setHighlightedMarkerId((prev) => (prev === markerId ? null : prev));
    setShowDeleteOnly(false);
    try {
      await axios.delete(`http://localhost:5001/api/markers/${markerId}`, {
        headers: {
          'x-user-id': userId,
          'x-tenant-id': tenantId,
        },
      });
    } catch (error) {
      if (error.response && error.response.status === 404) {
        console.warn('Marker not found in backend, removed locally:', markerId);
      } else {
      console.error('Error deleting marker:', error);
      }
    }
  };

  const handleApproveMarker = async (markerId) => {
    try {
      const response = await axios.patch(
        `http://localhost:5001/api/markers/admin/${markerId}/approve`,
        {},
        {
          headers: {
            'Content-Type': 'application/json',
            'x-user-id': userId,
            'x-tenant-id': tenantId,
          },
        }
      );
      setMarkers((prevMarkers) =>
        prevMarkers.map((marker) =>
          marker._id === markerId
            ? {
                ...marker,
                status: response.data.status,
                resolvedAt: response.data.resolvedAt || null,
              }
            : marker
        )
      );
      if (editMode === markerId) {
        setFormData((prev) => ({
          ...prev,
          status: response.data.status,
          resolvedAt: response.data.resolvedAt || null,
        }));
      }
    } catch (error) {
      console.error('Error approving marker:', error);
    }
  };

  const handleAdminStatusChange = async (markerId, newStatus) => {
    try {
      const response = await axios.patch(
        `http://localhost:5001/api/markers/admin/${markerId}/status`,
        { status: newStatus },
        {
          headers: {
            'Content-Type': 'application/json',
            'x-user-id': userId,
            'x-tenant-id': tenantId,
          },
        }
      );
      setMarkers((prevMarkers) =>
        prevMarkers.map((marker) =>
          marker._id === markerId
            ? {
                ...marker,
                status: response.data.status,
                resolvedAt: response.data.resolvedAt || null,
              }
            : marker
        )
      );
      if (editMode === markerId) {
        setFormData((prev) => ({
          ...prev,
          status: response.data.status,
          resolvedAt: response.data.resolvedAt || null,
        }));
      }
    } catch (error) {
      console.error('Error actualizando estado del marcador:', error);
    }
  };

  // Función para manejar la cancelación del formulario
  const handleCancel = () => {
    setFormData({
      lat: 0,
      lng: 0,
      image: null,
      date: '',
      time: '',
      description: '',
      urgency: 'media',
      status: 'pendiente_aprobacion',
      resolvedAt: null,
    });
    setSelectedImage(null);
    setIsImageZoomed(false);
    setShowPopup(false);
    setEditMode(null); // Salir del modo de edición
    setShowDeleteOnly(false);
  };

  const handleImageClick = () => {
    // Alternar entre tamaño normal y ampliado al hacer clic en la imagen
    setIsImageZoomed((prev) => !prev);
  };

  const handleViewOnMap = () => {
    if (mapRef.current && formData.lat && formData.lng && editMode) {
      const target = { lat: formData.lat, lng: formData.lng };
      mapRef.current.panTo(target);
      mapRef.current.setZoom(18);
      setHighlightedMarkerId(editMode);
      setIsImageZoomed(false);
      setShowPopup(false);
      window.scrollTo({
        top: 0,
        behavior: 'smooth',
      });
    }
  };

  // Deshabilitar gestos del mapa cuando la imagen está en zoom para evitar que el mapa se agrande
  useEffect(() => {
    if (!mapRef.current) return;

    if (showPopup) {
      mapRef.current.setOptions({
        gestureHandling: 'none',
        zoomControl: false,
      });
    } else {
      mapRef.current.setOptions({
        gestureHandling: 'greedy',
        zoomControl: true,
      });
    }
  }, [showPopup]);

  const renderMap = () => {
    const defaultCenter = userLocation || { lat: -26.8084602, lng: -65.2175701 };
    
    // Verificar si el usuario tiene marcadores de "familias"
    const hasFamiliesMarkers = markers.some(marker => {
      if (marker.category === 'familias') {
        const markerOwner = marker.createdBy
          ? String(marker.createdBy).trim().toLowerCase()
          : 'anonimo';
        return markerOwner === userId;
      }
      return false;
    });
    
    // Filtrar opciones de categoría: "familias" solo si el usuario tiene marcadores de esa categoría o es admin
    const availableCategoryOptions = categoryOptions.filter(option => {
      if (option.value === 'familias') {
        return isAdmin || hasFamiliesMarkers;
      }
      return true; // Mostrar siempre: persona, perros_gatos, reparaciones
    });
    
    const visibleMarkers = markers.filter(marker => {
      // Filtro de aprobación: usuarios normales solo ven sus propios marcadores pendientes de aprobación
      if (!isAdmin && marker.status === 'pendiente_aprobacion') {
        const markerOwner = marker.createdBy
          ? String(marker.createdBy).trim().toLowerCase()
          : 'anonimo';
        // Solo mostrar si el usuario es el creador del marcador pendiente
        if (markerOwner !== userId) {
          return false; // Ocultar marcadores pendientes de aprobación de otros usuarios
        }
        // Si es el creador, permitir que vea su marcador pendiente en el mapa
      }
      
      // Filtro de privacidad: usuarios normales solo ven sus propios marcadores de "familias"
      if (!isAdmin && marker.category === 'familias') {
        const markerOwner = marker.createdBy
          ? String(marker.createdBy).trim().toLowerCase()
          : 'anonimo';
        if (markerOwner !== userId) {
          return false; // Ocultar marcadores de "familias" de otros usuarios
        }
      }
      
      const matchesUrgency = urgencyFilter === 'todas' || (marker.urgency || 'media') === urgencyFilter;
      const matchesCategory = categoryFilter === 'todas' || (marker.category || 'persona') === categoryFilter;
      return matchesUrgency && matchesCategory;
    });
    const currentStatus = formData.status || 'pendiente';
    const statusBadgeStyle = getStatusBadgeStyle(currentStatus);
    const statusLabel = statusLabels[currentStatus] || currentStatus;
    const renderStatusInfo = (withLabel = true) => {
      const daysLeft =
        currentStatus === 'resuelto' && formData.resolvedAt
          ? getDaysUntilRemoval(formData.resolvedAt)
          : null;
      const isPendingApproval = currentStatus === 'pendiente_aprobacion';
    return (
        <div style={{ marginTop: '4px' }}>
          {withLabel && <label>Estado:</label>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={statusBadgeStyle}>{statusLabel}</span>
              {daysLeft !== null && (
                <small style={{ color: '#2563eb' }}>
                  Se eliminará en {daysLeft} {daysLeft === 1 ? 'día' : 'días'}.
                </small>
              )}
            </div>
            {isPendingApproval && !isAdmin && (
              <small style={{ color: '#f59e0b', fontStyle: 'italic' }}>
                ⏳ Tu reporte está esperando la aprobación de un administrador. Aparecerá en el mapa una vez aprobado.
              </small>
            )}
          </div>
        </div>
      );
    };
    const userIcon =
      window.google && window.google.maps
        ? {
            url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><circle cx="16" cy="16" r="10" fill="%234285F4" stroke="%23FFFFFF" stroke-width="3"/></svg>',
            scaledSize: new window.google.maps.Size(32, 32),
            anchor: new window.google.maps.Point(16, 16), // Centrar el icono en el punto
          }
        : 'http://maps.google.com/mapfiles/ms/icons/blue-dot.png';
    const handleReportResolved = async (markerId) => {
      try {
        const response = await axios.post(
          `http://localhost:5001/api/markers/${markerId}/report-resolved`,
          {},
          {
            headers: {
              'Content-Type': 'application/json',
              'x-user-id': userId,
              'x-tenant-id': tenantId,
            },
          }
        );
        setMarkers((prevMarkers) =>
          prevMarkers.map((marker) =>
            marker._id === markerId
              ? {
                  ...marker,
                  resolvedBy: response.data.resolvedBy,
                  resolvedByReportedAt: response.data.resolvedByReportedAt,
                }
              : marker
          )
        );
        if (editMode === markerId) {
          setFormData((prev) => ({
            ...prev,
            resolvedBy: response.data.resolvedBy,
            resolvedByReportedAt: response.data.resolvedByReportedAt,
          }));
        }
        alert('✅ Has reportado que resolviste este caso. El administrador será notificado.');
      } catch (error) {
        console.error('Error reporting resolved:', error);
        alert('Error al reportar la resolución. Por favor, intenta nuevamente.');
      }
    };

    return (
      <div>
        {/* Número de WhatsApp para reportar casos resueltos */}
        <div style={{ 
          marginBottom: '12px', 
          padding: '10px', 
          background: '#25D366', 
          borderRadius: '8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '8px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ color: '#fff', fontWeight: 'bold' }}>📱 WhatsApp para reportar casos resueltos:</span>
            <a 
              href={`https://wa.me/543816865617?text=Hola,%20quiero%20reportar%20un%20caso%20resuelto.%20Por%20favor%20indica%20el%20ID%20del%20caso%20(se%20muestra%20en%20el%20popup).`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ 
                color: '#fff', 
                fontWeight: 'bold',
                textDecoration: 'none',
                fontSize: '16px'
              }}
            >
              3816865617
            </a>
          </div>
          <small style={{ color: '#fff', opacity: 0.9 }}>
            Al abrir un caso, verás su ID. Inclúyelo en tu mensaje de WhatsApp para facilitar la ubicación del caso.
          </small>
        </div>
        <div style={{ marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div>
            <label>Filtrar por urgencia: </label>
            <select
              value={urgencyFilter}
              onChange={(e) => setUrgencyFilter(e.target.value)}
            >
              <option value="todas">Todas</option>
              <option value="baja">Baja</option>
              <option value="media">Media</option>
              <option value="alta">Alta</option>
            </select>
          </div>
          <div>
            <label>Filtrar por categoría: </label>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
            >
              <option value="todas">Todas</option>
              {availableCategoryOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={() => {
              if (mapRef.current && userLocation) {
                mapRef.current.panTo(userLocation);
                mapRef.current.setZoom(18);
              }
            }}
            disabled={!userLocation}
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              border: '1px solid #4285F4',
              background: userLocation ? '#4285F4' : '#b0bcd6',
              color: '#fff',
              cursor: userLocation ? 'pointer' : 'not-allowed',
            }}
          >
            Volver a mi ubicación
          </button>
        </div>
      <GoogleMap
        mapContainerStyle={{ height: '80vh', width: '100%' }}
        center={defaultCenter}
          // Zoom más cercano cuando tenemos ubicación del usuario
          zoom={userLocation ? 18 : 15}
        onLoad={onMapLoad}
        onClick={onMapClick}
        options={{
            mapTypeId: 'roadmap',
          }}
        >
          {userLocation && (
            <>
              <Marker
                position={userLocation}
                options={{
                  icon: userIcon,
                  clickable: false,
                }}
              />
              {/* Círculo externo: halo azul translúcido */}
              <Circle
                center={userLocation}
                radius={25} // metros
                options={{
                  strokeColor: '#4285F4',
                  strokeOpacity: 0.7,
                  strokeWeight: 1,
                  fillColor: '#4285F4',
                  fillOpacity: 0.2,
                  clickable: false,
                  draggable: false,
                  editable: false,
                  visible: true,
                }}
              />
            </>
          )}
          {visibleMarkers.map((marker, index) => (
          <Marker
            key={index}
            position={{ lat: marker.lat, lng: marker.lng }}
            onClick={() => handleMarkerClick(marker)}
                options={{
                  icon:
                    highlightedMarkerId === marker._id
                      ? {
                          url: 'http://maps.google.com/mapfiles/ms/icons/blue-dot.png',
                        }
                      : undefined,
                }}
              />
            ))}

        {showPopup && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.25)',
              zIndex: 1000,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              touchAction: isImageZoomed ? 'none' : 'auto',
            }}
            onMouseDown={() => setShowPopup(false)}
          >
            <div
              style={{
                background: '#fff',
                borderRadius: '18px',
                boxShadow: '0 12px 30px rgba(0,0,0,0.35)',
                padding: '16px',
                maxWidth: isImageZoomed ? '90vw' : 'min(90vw, 500px)',
                width: isImageZoomed ? 'auto' : 'min(90vw, 500px)',
                maxHeight: '90vh',
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
              }}
              onMouseDown={stopPropagation}
              onClick={stopPropagation}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', gap: '8px', flexWrap: 'wrap' }}>
                <strong style={{ fontSize: '16px', flex: 1, minWidth: '200px' }}>
                  {editMode ? `Editar reporte${formData.caseId ? ` - Caso #${formData.caseId}` : ''}` : 'Nuevo reporte'}
                </strong>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                  {editMode && (
                    <button
                      type="button"
                      onClick={handleViewOnMap}
                      style={{
                        border: '1px solid #4285F4',
                        background: '#4285F4',
                        color: '#fff',
                        padding: '4px 8px',
                        borderRadius: '6px',
                        cursor: 'pointer',
                      }}
                    >
                      Ver en el mapa
                    </button>
                  )}
                  <button
                    onClick={() => setShowPopup(false)}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      fontSize: '20px',
                      cursor: 'pointer',
                      lineHeight: '1',
                    }}
                  >
                    ×
                  </button>
                </div>
              </div>
              {isImageZoomed ? (
                // Imagen ampliada (un poco más grande que el popup) con soporte para pellizcar
                selectedImage && (
                  <div
                    style={{
                      maxWidth: '600px',
                      maxHeight: '80vh',
                      overflow: 'auto',
                      touchAction: 'pinch-zoom',
                      margin: '0 auto',
                    }}
                    onTouchStart={stopTouchPropagation}
                    onTouchMove={stopTouchPropagation}
                    onTouchEnd={stopTouchPropagation}
                  >
                    <img
                      src={selectedImage}
                      alt="Seleccionada"
                      onClick={handleImageClick}
                      onError={handleImageError}
                      style={{
                        width: '100%',
                        minWidth: '420px',
                        height: 'auto',
                        borderRadius: '12px',
                        cursor: 'zoom-out',
                      }}
                    />
                  </div>
                )
              ) : editMode ? (
                // Formulario de edición con imagen a la izquierda y campos a la derecha
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '10px',
                    maxWidth: '100%',
                    flexWrap: 'wrap',
                  }}
                >
                  {selectedImage && (
                    <img
                      src={selectedImage}
                      alt="Seleccionada"
                      onClick={handleImageClick}
                      onError={handleImageError}
                      style={{
                        width: '160px',
                        maxWidth: '40%',
                        height: 'auto',
                        borderRadius: '8px',
                        cursor: 'pointer',
                      }}
                    />
                  )}
                  {!showDeleteOnly && canEdit ? (
                    <form
                      onSubmit={(e) => handleSaveUpdate(e, editMode)}
                      style={{
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px',
                      }}
                    >
                      {formData.caseId && (
                        <div style={{ 
                          padding: '8px', 
                          background: '#eff6ff', 
                          borderRadius: '6px',
                          marginBottom: '8px',
                          border: '2px solid #3b82f6',
                          textAlign: 'center'
                        }}>
                          <p style={{ margin: 0, fontWeight: 'bold', color: '#1e40af', fontSize: '14px' }}>
                            🆔 ID del Caso
                          </p>
                          <p style={{ margin: '2px 0', fontWeight: 'bold', color: '#1e40af', fontSize: '20px' }}>
                            #{formData.caseId}
                          </p>
                          <small style={{ color: '#6b7280', display: 'block', marginTop: '2px', fontSize: '11px' }}>
                            Incluye este ID al reportar por WhatsApp
                          </small>
                        </div>
                      )}
                      <label style={{ fontSize: '14px', marginTop: '4px' }}>Fecha:</label>
                      <input type="date" value={formData.date} onChange={handleDateChange} required style={{ fontSize: '14px', padding: '6px' }} />
                      <label style={{ fontSize: '14px', marginTop: '4px' }}>Hora:</label>
                      <input type="time" value={formData.time} onChange={handleTimeChange} required style={{ fontSize: '14px', padding: '6px' }} />
                      <label style={{ fontSize: '14px', marginTop: '4px' }}>Descripción:</label>
                      <textarea value={formData.description} onChange={handleDescriptionChange} required style={{ fontSize: '14px', padding: '6px', minHeight: '60px', resize: 'vertical' }} />
                      <label style={{ fontSize: '14px', marginTop: '4px' }}>Urgencia:</label>
                      <select value={formData.urgency} onChange={handleUrgencyChange} required style={{ fontSize: '14px', padding: '6px' }}>
                        <option value="baja">Baja</option>
                        <option value="media">Media</option>
                        <option value="alta">Alta</option>
                      </select>
                      <label style={{ fontSize: '14px', marginTop: '4px' }}>Categoría:</label>
                      <select value={formData.category} onChange={handleCategoryChange} required style={{ fontSize: '14px', padding: '6px' }}>
                        {categoryOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      {renderStatusInfo(true)}
                      <div style={{ marginTop: '6px', display: 'flex', gap: '6px' }}>
                      <button type="submit">Guardar</button>
                      <button type="button" onClick={handleCancel}>Cancelar</button>
                      <button type="button" onClick={() => handleDeleteMarker(editMode)}>Borrar</button>
                    </div>
                  </form>
                  ) : showDeleteOnly ? (
                    <div
                      style={{
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px',
                      }}
                    >
                      {formData.caseId && (
                        <div style={{ 
                          padding: '8px', 
                          background: '#eff6ff', 
                          borderRadius: '6px',
                          marginBottom: '8px',
                          border: '2px solid #3b82f6',
                          textAlign: 'center'
                        }}>
                          <p style={{ margin: 0, fontWeight: 'bold', color: '#1e40af', fontSize: '14px' }}>
                            🆔 ID del Caso
                          </p>
                          <p style={{ margin: '2px 0', fontWeight: 'bold', color: '#1e40af', fontSize: '20px' }}>
                            #{formData.caseId}
                          </p>
                          <small style={{ color: '#6b7280', display: 'block', marginTop: '2px', fontSize: '11px' }}>
                            Incluye este ID al reportar por WhatsApp
                          </small>
                        </div>
                      )}
                      <p><strong>Fecha:</strong> {formData.date || 'N/D'}</p>
                      <p><strong>Hora:</strong> {formData.time || 'N/D'}</p>
                      <p><strong>Descripción:</strong> {formData.description || 'N/D'}</p>
                      <p><strong>Urgencia:</strong> {formData.urgency}</p>
                      <p><strong>Categoría:</strong> {categoryLabels[formData.category] || formData.category}</p>
                      {renderStatusInfo(true)}
                      {/* Botón para reportar resolución - solo para casos pendientes o en proceso, y que no hayan sido reportados ya */}
                      {!isAdmin && 
                       (formData.status === 'pendiente' || formData.status === 'en_proceso') && 
                       !formData.resolvedBy && (
                        <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <button
                            type="button"
                            onClick={() => handleReportResolved(editMode)}
                            style={{
                              background: '#10b981',
                              color: '#fff',
                              border: 'none',
                              padding: '8px 16px',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              fontWeight: 'bold',
                              width: '100%',
                            }}
                          >
                            ✅ Reportar que resolví este caso
                          </button>
                          {formData.caseId && (
                            <a
                              href={`https://wa.me/543816865617?text=Hola,%20he%20resuelto%20el%20caso%20%23${formData.caseId}%20del%20mapa.%20Descripción:%20${encodeURIComponent(formData.description || 'N/A')}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                background: '#25D366',
                                color: '#fff',
                                border: 'none',
                                padding: '8px 16px',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontWeight: 'bold',
                                width: '100%',
                                textDecoration: 'none',
                                textAlign: 'center',
                                display: 'block',
                              }}
                            >
                              📱 Contactar por WhatsApp (incluye ID #{formData.caseId})
                            </a>
                          )}
                          <small style={{ display: 'block', marginTop: '4px', color: '#6b7280' }}>
                            El administrador será notificado y actualizará el estado
                          </small>
                        </div>
                      )}
                      {formData.resolvedBy && (
                        <div style={{ marginTop: '8px', padding: '8px', background: '#dcfce7', borderRadius: '6px' }}>
                          <small style={{ color: '#166534' }}>
                            ✅ Este caso ya fue reportado como resuelto por: {formData.resolvedBy}
                            {formData.resolvedByReportedAt && (
                              <span> el {new Date(formData.resolvedByReportedAt).toLocaleDateString()}</span>
                            )}
                          </small>
                        </div>
                      )}
                      <div style={{ marginTop: '6px', display: 'flex', gap: '6px' }}>
                        {!showDeleteOnly && (
                          <button type="button" onClick={() => handleDeleteMarker(editMode)}>Borrar</button>
                        )}
                        <button type="button" onClick={handleCancel}>Cerrar</button>
                      </div>
                </div>
              ) : (
                    <div
                      style={{
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px',
                      }}
                    >
                      <p style={{ color: '#c0392b' }}>
                        Esta publicación anónima solo puede ser editada por su creador.
                      </p>
                      <p><strong>Fecha:</strong> {formData.date || 'N/D'}</p>
                      <p><strong>Hora:</strong> {formData.time || 'N/D'}</p>
                      <p><strong>Descripción:</strong> {formData.description || 'N/D'}</p>
                      <p><strong>Urgencia:</strong> {formData.urgency}</p>
                      <p><strong>Categoría:</strong> {categoryLabels[formData.category] || formData.category}</p>
                      {renderStatusInfo(true)}
                      <div style={{ marginTop: '6px' }}>
                        <button type="button" onClick={handleCancel}>Cerrar</button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                // Formulario para nuevos marcadores con imagen/dropzone a la izquierda y campos a la derecha
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '10px',
                    maxWidth: '420px',
                  }}
                >
                  <div style={{ maxWidth: '40%' }}>
                    {!selectedImage && (
                      <div
                        {...getRootProps()}
                        style={{
                          border: '1px dashed gray',
                          padding: '10px',
                          textAlign: 'center',
                          marginBottom: '10px',
                          maxWidth: '200px',
                        }}
                      >
                    <input {...getInputProps()} />
                    <p>Seleccionar imagen</p>
                    <button type="button" onClick={open}>Seleccionar</button>
                  </div>
                    )}
                  {selectedImage && (
                      <img
                        src={selectedImage}
                        alt="Seleccionada"
                        onClick={handleImageClick}
                        onError={handleImageError}
                        style={{
                          width: '160px',
                          maxWidth: '100%',
                          height: 'auto',
                          borderRadius: '8px',
                          cursor: 'pointer',
                        }}
                      />
                    )}
                  </div>
                  <form
                    onSubmit={handleSubmit}
                    style={{
                      flex: 1,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                    }}
                  >
                    <label>Fecha:</label>
                    <input type="date" value={formData.date} onChange={handleDateChange} required />
                    <label>Hora:</label>
                    <input type="time" value={formData.time} onChange={handleTimeChange} required />
                    <label>Descripción:</label>
                    <textarea value={formData.description} onChange={handleDescriptionChange} required />
                    <label>Urgencia:</label>
                    <select value={formData.urgency} onChange={handleUrgencyChange} required>
                      <option value="baja">Baja</option>
                      <option value="media">Media</option>
                      <option value="alta">Alta</option>
                    </select>
                    <label>Categoría:</label>
                    <select value={formData.category} onChange={handleCategoryChange} required>
                      {categoryOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    {renderStatusInfo(true)}
                    <small style={{ color: '#6b7280' }}>
                      El estado se actualizará cuando un administrador revise el caso.
                    </small>
                    <div style={{ marginTop: '6px', display: 'flex', gap: '6px' }}>
                      <button type="submit">Subir</button>
                      <button type="button" onClick={handleCancel}>Cancelar</button>
                    </div>
                  </form>
                </div>
              )}
            </div>
          </div>
        )}

        {geoError && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              background: 'red',
              color: 'white',
              padding: '10px',
              zIndex: 1001,
            }}
          >
            Error getting location: {geoError}
          </div>
        )}
      </GoogleMap>
        {isAdmin && (
          <div style={{ marginTop: '20px', background: '#fff', padding: '16px', borderRadius: '12px', boxShadow: '0 2px 12px rgba(0,0,0,0.15)' }}>
            <h3>Panel de administración</h3>
            {/* Mensaje de deshacer eliminación */}
            {deletedMarker && (
              <div style={{
                marginBottom: '16px',
                padding: '12px',
                background: '#fef3c7',
                border: '2px solid #f59e0b',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                flexWrap: 'wrap',
              }}>
                <div style={{ flex: 1 }}>
                  <strong style={{ color: '#92400e' }}>
                    ⚠️ Caso #{deletedMarker.caseId || deletedMarker._id?.slice(-6)} eliminado
                  </strong>
                  <p style={{ margin: '4px 0 0 0', color: '#78350f', fontSize: '14px' }}>
                    El caso "{deletedMarker.description || 'Sin descripción'}" ha sido eliminado. 
                    Se eliminará permanentemente en <strong style={{ fontSize: '16px', color: '#dc2626' }}>{deleteCountdown}</strong> segundo{deleteCountdown !== 1 ? 's' : ''}.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleUndoDelete}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '6px',
                    border: 'none',
                    background: '#10b981',
                    color: '#fff',
                    cursor: 'pointer',
                    fontWeight: 'bold',
                    fontSize: '14px',
                    whiteSpace: 'nowrap',
                  }}
                >
                  ↶ Deshacer
                </button>
              </div>
            )}
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '6px' }}>ID Caso</th>
                    <th style={{ textAlign: 'left', padding: '6px' }}>Descripción</th>
                    <th style={{ textAlign: 'left', padding: '6px' }}>Urgencia</th>
                    <th style={{ textAlign: 'left', padding: '6px' }}>Estado</th>
                    <th style={{ textAlign: 'left', padding: '6px' }}>Categoría</th>
                    <th style={{ textAlign: 'left', padding: '6px' }}>Usuario</th>
                    <th style={{ textAlign: 'left', padding: '6px' }}>Creado</th>
                    <th style={{ textAlign: 'left', padding: '6px' }}>Expira</th>
                    <th style={{ textAlign: 'left', padding: '6px' }}>Reporte Resolución</th>
                    <th style={{ textAlign: 'left', padding: '6px' }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {markers.map((marker) => {
                    const daysLeft =
                      marker.status === 'resuelto' && marker.resolvedAt
                        ? getDaysUntilRemoval(marker.resolvedAt)
                        : null;
                    return (
                      <tr key={marker._id || marker.description} style={{ borderTop: '1px solid #eee' }}>
                        <td style={{ padding: '6px', fontWeight: 'bold' }}>
                          {marker.caseId ? `#${marker.caseId}` : '-'}
                        </td>
                        <td style={{ padding: '6px' }}>{marker.description || 'Sin descripción'}</td>
                        <td style={{ padding: '6px', textTransform: 'capitalize' }}>{marker.urgency}</td>
                      <td style={{ padding: '6px' }}>
                          <select
                            value={marker.status || 'pendiente'}
                            onChange={(e) => handleAdminStatusChange(marker._id, e.target.value)}
                          >
                            {statusOptions.map(status => (
                              <option key={status} value={status}>
                                {statusLabels[status] || status.replace('_', ' ')}
                              </option>
                            ))}
                          </select>
                        </td>
                      <td style={{ padding: '6px' }}>
                        {categoryLabels[marker.category] || marker.category || 'N/D'}
                      </td>
                        <td style={{ padding: '6px' }}>{marker.createdBy || 'anonimo'}</td>
                        <td style={{ padding: '6px' }}>
                          {marker.createdAt ? new Date(marker.createdAt).toLocaleString() : 'N/D'}
                        </td>
                        <td style={{ padding: '6px' }}>
                          {daysLeft !== null ? `${daysLeft} ${daysLeft === 1 ? 'día' : 'días'}` : '-'}
                        </td>
                        <td style={{ padding: '6px' }}>
                          {marker.resolvedBy ? (
                            <div style={{ 
                              padding: '4px 8px', 
                              background: '#dcfce7', 
                              borderRadius: '4px',
                              fontSize: '12px'
                            }}>
                              <strong>✅ Reportado por:</strong> {marker.resolvedBy}
                              <br />
                              <small>
                                {marker.resolvedByReportedAt 
                                  ? new Date(marker.resolvedByReportedAt).toLocaleString()
                                  : 'Fecha no disponible'}
                              </small>
                            </div>
                          ) : (
                            <span style={{ color: '#9ca3af' }}>-</span>
                          )}
                        </td>
                        <td style={{ padding: '6px' }}>
                          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                            <button 
                              type="button" 
                              onClick={() => handleMarkerClick(marker, true)}
                              style={{
                                padding: '4px 8px',
                                borderRadius: '4px',
                                border: '1px solid #4285F4',
                                background: '#4285F4',
                                color: '#fff',
                                cursor: 'pointer',
                                fontSize: '12px',
                              }}
                            >
                              Ver
                            </button>
                            <button
                              type="button"
                              onClick={() => handleAdminDeleteMarker(marker)}
                              style={{
                                padding: '4px 8px',
                                borderRadius: '4px',
                                border: '1px solid #ef4444',
                                background: '#ef4444',
                                color: '#fff',
                                cursor: 'pointer',
                                fontSize: '12px',
                              }}
                            >
                              Eliminar
                            </button>
                            {marker.status === 'pendiente_aprobacion' && (
                              <button
                                type="button"
                                onClick={() => handleApproveMarker(marker._id)}
                                style={{
                                  background: '#10b981',
                                  color: 'white',
                                  border: 'none',
                                  padding: '4px 8px',
                                  borderRadius: '4px',
                                  cursor: 'pointer',
                                  fontSize: '12px',
                                }}
                              >
                                Aprobar
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  };

  if (loadError) {
    return <div>Error al cargar Google Maps</div>;
  }

  return isLoaded ? renderMap() : <div>Cargando Mapa...</div>;
};

// const AdvancedMarker = (props) => { // Componente AdvancedMarker eliminado
//   const { map, position, onClick } = props;

//   useEffect(() => {
//     if (map && window.google.maps.marker) {
//       const newMarker = new window.google.maps.marker.AdvancedMarkerElement({
//         map,
//         position: position,
//       });

//       newMarker.addListener('click', onClick);
//       return () => {
//         newMarker.setMap(null);
//       };
//     }
//   }, [map, position, onClick]);

//   return null;
// };

export default MapComponent;
