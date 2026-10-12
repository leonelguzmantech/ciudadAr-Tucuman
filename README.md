# Sistema de Gestión de Reportes Municipales - Mapa Interactivo

## 📋 Descripción del Proyecto

Sistema web de gestión de reportes ciudadanos para municipios que permite a los ciudadanos reportar problemas en su comunidad y a las autoridades municipales gestionarlos de manera eficiente. El sistema utiliza un mapa interactivo donde los usuarios pueden marcar ubicaciones, subir imágenes y describir problemas que requieren atención.

### 🎯 Propósito

Este sistema está diseñado para facilitar la comunicación entre los ciudadanos y las autoridades municipales, permitiendo:

- **Reporte ciudadano**: Los ciudadanos pueden reportar problemas en tiempo real desde su ubicación
- **Gestión municipal**: Las autoridades pueden gestionar, priorizar y resolver los reportes
- **Colaboración comunitaria**: Los ciudadanos pueden ayudar a resolver problemas simples
- **Privacidad**: Protección de información sensible relacionada con familias en situación vulnerable

---

## 👥 Tipos de Usuarios y Roles

### 1. **Usuarios Comunes (Ciudadanos)**
Los ciudadanos pueden:
- ✅ Ver y reportar casos de:
  - **Personas en situación de calle**
  - **Perros y gatos** (abandonados, perdidos, en peligro)
  - **Reparaciones** (baches, alumbrado, infraestructura)
- ✅ Reportar que resolvieron un caso (botón en el popup o WhatsApp)
- ✅ Ver el estado de sus propios reportes
- ✅ Editar y eliminar sus propios reportes
- ❌ **NO pueden ver** reportes de "Familias" (privacidad)
- ❌ **NO pueden ver** reportes pendientes de aprobación de otros usuarios

### 2. **Administradores Municipales**
Los administradores pueden:
- ✅ Ver **todos** los reportes (incluyendo categoría "Familias")
- ✅ Aprobar reportes pendientes de aprobación
- ✅ Cambiar el estado de los casos:
  - Pendiente de aprobación → Pendiente
  - Pendiente → En proceso
  - En proceso → Resuelto
- ✅ Eliminar cualquier reporte (con opción de deshacer)
- ✅ Ver quién reportó cada caso
- ✅ Ver reportes de resolución de ciudadanos
- ✅ Gestionar casos de "Familias" (solo visibles para ellos)

### 3. **Personal Municipal Especializado**
El sistema está diseñado para que diferentes áreas municipales gestionen casos según su especialidad:

- **Asistentes Sociales**: Casos de "Familias" y "Personas en situación de calle"
- **Rescatistas/Veterinarias**: Casos de "Perros y gatos"
- **Técnicos/Trabajadores**: Casos de "Reparaciones"

---

## 🏷️ Categorías de Reportes

### 1. **Familias** 🔒 (Privacidad)
- **Visibilidad**: Solo el creador y administradores
- **Gestión**: Asistentes sociales municipales
- **Privacidad**: Protege información sensible de familias vulnerables

### 2. **Persona en situación de calle** 👤
- **Visibilidad**: Todos los usuarios
- **Gestión**: Asistentes sociales municipales
- **Colaboración**: Ciudadanos pueden ayudar

### 3. **Perros y gatos** 🐕🐱
- **Visibilidad**: Todos los usuarios
- **Gestión**: Rescatistas y veterinarias municipales
- **Colaboración**: Ciudadanos pueden rescatar animales

### 4. **Reparaciones** 🔧
- **Visibilidad**: Todos los usuarios
- **Gestión**: Técnicos y trabajadores municipales
- **Colaboración**: Ciudadanos pueden realizar reparaciones simples (ej: tapar un pozo)

---

## 🔄 Flujo de Trabajo

### Para Ciudadanos:

1. **Crear Reporte**:
   - Hacer clic en el mapa en la ubicación del problema
   - Completar formulario: fecha, hora, descripción, urgencia, categoría
   - Subir imagen (opcional pero recomendado)
   - Guardar

2. **Estado del Reporte**:
   - **Pendiente de aprobación**: El reporte aparece en el mapa solo para el creador
   - **Pendiente**: Una vez aprobado, aparece para todos los usuarios
   - **En proceso**: El municipio está trabajando en el caso
   - **Resuelto**: El caso fue resuelto (se elimina automáticamente después de 10 días)

3. **Reportar Resolución**:
   - Si un ciudadano resuelve un caso, puede:
     - Usar el botón "Reportar que resolví este caso" en el popup
     - Contactar por WhatsApp (3816865617) incluyendo el ID del caso
   - El administrador verá el reporte y actualizará el estado

### Para Administradores:

1. **Panel de Administración**:
   - Ver todos los reportes en una tabla
   - Ver ID del caso, descripción, urgencia, estado, categoría, usuario creador
   - Ver reportes de resolución de ciudadanos

2. **Aprobar Reportes**:
   - Los reportes nuevos aparecen con estado "Pendiente de aprobación"
   - Botón "Aprobar" cambia el estado a "Pendiente"
   - Una vez aprobado, el reporte es visible para todos

3. **Gestionar Estados**:
   - Cambiar estado desde el panel (Pendiente → En proceso → Resuelto)
   - Ver reportes de ciudadanos que resolvieron casos
   - Actualizar estado según corresponda

4. **Eliminar Casos**:
   - Botón "Eliminar" en cada fila
   - Opción de "Deshacer" durante 10 segundos
   - Después de 10 segundos, se elimina permanentemente del backend

---

## 🔐 Sistema de Privacidad y Permisos

### Privacidad de "Familias":
- Los reportes de "Familias" son **privados por defecto**
- Solo el usuario que creó el reporte puede verlo
- Los administradores pueden ver todos los reportes de "Familias"
- Los usuarios comunes **NO** pueden ver reportes de "Familias" de otros usuarios
- El filtro de categoría "Familias" solo aparece si el usuario tiene reportes propios de esa categoría

### Aprobación de Reportes:
- Todos los reportes de usuarios comunes inician como "Pendiente de aprobación"
- El creador puede ver su reporte pendiente en el mapa
- Los demás usuarios NO ven reportes pendientes de aprobación
- Solo los administradores pueden aprobar reportes

### Edición y Eliminación:
- Los usuarios solo pueden editar/eliminar sus propios reportes
- Los administradores pueden eliminar cualquier reporte
- Los administradores pueden ver todos los reportes pero solo editar los propios (a menos que sean admin)

---

## 🛠️ Tecnologías Utilizadas

### Frontend:
- **React** - Framework de JavaScript
- **Google Maps API** - Mapas interactivos
- **React Google Maps** - Componentes de mapas para React
- **Axios** - Cliente HTTP para API
- **React Dropzone** - Carga de imágenes
- **Firebase Authentication** - Autenticación de usuarios

### Backend:
- **Node.js** - Entorno de ejecución
- **Express** - Framework web
- **MongoDB** - Base de datos NoSQL
- **Mongoose** - ODM para MongoDB
- **Multer (memory storage)** - Manejo de imágenes en memoria antes de guardarlas en MongoDB
- **CORS** - Configuración de políticas de origen cruzado

---

## 📁 Estructura del Proyecto

```
Mapa-main/
├── backend/
│   ├── config/
│   │   └── admins.js              # Configuración de administradores globales
│   ├── middleware/
│   │   └── tenant.js              # Middleware multi-tenant (x-tenant-id)
│   ├── models/
│   │   ├── marker.js              # Modelo de datos de marcadores
│   │   ├── tenant.js              # Organizaciones (municipios/comercios)
│   │   ├── business.js            # Cadena/comercio dentro de un tenant
│   │   └── businessLocation.js    # Sucursales con geolocalización
│   ├── routes/
│   │   ├── markerRoutes.js        # Rutas privadas para marcadores
│   │   ├── tenantRoutes.js        # Administración global de tenants
│   │   ├── businessRoutes.js      # Panel para comercios por tenant
│   │   └── publicRoutes.js        # Endpoints públicos (mapa ciudadano)
│   ├── utils/
│   │   └── users.js               # Utilidades de usuarios y permisos
│   ├── server.js                  # Servidor Express principal
│   └── package.json
├── src/
│   ├── components/
│   │   ├── MapComponent.js    # Componente principal del mapa
│   │   ├── Home.js            # Página principal
│   │   ├── Login.js           # Autenticación
│   │   └── credenciales.js    # Configuración Firebase
│   ├── App.js
│   └── index.js
└── README.md
```

---

## 🚀 Instalación y Configuración

### Requisitos Previos:
- Node.js (v14 o superior)
- MongoDB (local o MongoDB Atlas)
- Cuenta de Google Cloud Platform con Google Maps API habilitada
- Cuenta de Firebase para autenticación

### 1. Instalación del Backend:

```bash
cd backend
npm install
```

### 2. Configuración del Backend:

Crear archivo `.env` en la carpeta `backend/`:

```env
MONGODB_URI=mongodb+srv://usuario:password@cluster.mongodb.net/?retryWrites=true&w=majority
ADMIN_USERS=admin1@municipio.gov.ar,admin2@municipio.gov.ar
DEFAULT_TENANT_SLUG=municipalidad-san-miguel
PORT=5001
```

**Variables de entorno:**
- `MONGODB_URI`: URL de conexión a MongoDB
- `ADMIN_USERS`: Lista de emails de administradores globales separados por comas
- `DEFAULT_TENANT_SLUG`: *Slug* del tenant que se usará por defecto cuando el frontend no envía `x-tenant-id`
- `PORT`: Puerto del servidor (por defecto 5001)

> **Importante:** crea al menos un tenant cuyo `slug` coincida con `DEFAULT_TENANT_SLUG` (vía `POST /api/tenants`) antes de usar el mapa, para que todos los reportes queden asociados correctamente.

### 3. Instalación del Frontend:

```bash
# Desde la raíz del proyecto
npm install
```

### 4. Configuración del Frontend:

En `src/components/Home.js`, actualizar la clave de Google Maps:

```javascript
const GOOGLE_MAPS_API_KEY = "TU_CLAVE_DE_GOOGLE_MAPS";
```

Crear (o actualizar) el archivo `.env` en la raíz para indicar el tenant que consumirá el frontend:

```env
REACT_APP_TENANT_ID=municipalidad-san-miguel
```

### 5. Ejecutar el Proyecto:

**Terminal 1 - Backend:**
```bash
cd backend
node server.js
```

**Terminal 2 - Frontend:**
```bash
npm start
```

El frontend estará disponible en `http://localhost:3000`  
El backend estará disponible en `http://localhost:5001`

---

## 📊 Modelo de Datos

### Marcador (Marker):

```javascript
{
  _id: ObjectId,                    // ID único de MongoDB
  caseId: Number,                    // ID único del caso (#1, #2, #3...)
  tenant: ObjectId,                 // Referencia al tenant dueño del caso
  lat: Number,                       // Latitud
  lng: Number,                       // Longitud
  imageUrl: String,                 // Ruta del endpoint `/api/markers/:id/image`
  image: {                          // Binario almacenado dentro de MongoDB
    data: Buffer,
    contentType: String
  },
  date: String,                     // Fecha del reporte
  time: String,                     // Hora del reporte
  description: String,              // Descripción del problema
  urgency: String,                  // 'baja', 'media', 'alta'
  category: String,                 // 'familias', 'persona', 'perros_gatos', 'reparaciones'
  status: String,                   // 'pendiente_aprobacion', 'pendiente', 'en_proceso', 'resuelto'
  visibility: String,               // 'public', 'tenant_only', 'private'
  createdBy: String,                // Email del usuario creador
  resolvedAt: Date,                 // Fecha de resolución (para casos resueltos)
  resolvedBy: String,               // Usuario que reportó la resolución
  resolvedByReportedAt: Date,       // Fecha del reporte de resolución
  createdAt: Date,                  // Fecha de creación
  updatedAt: Date                   // Fecha de última actualización
}
```

### Tenant:

```javascript
{
  _id: ObjectId,
  name: String,                     // Nombre comercial (Municipio, cadena, etc.)
  slug: String,                     // Identificador único en minúsculas (usado en x-tenant-id)
  type: 'municipality' | 'business' | 'hybrid',
  status: 'active' | 'inactive' | 'pending',
  billingPlan: 'free' | 'pro' | 'enterprise',
  contactEmail: String,
  settings: Object,                 // Configuraciones específicas (features activados)
  metadata: Object,                 // Campos personalizados
  createdAt / updatedAt
}
```

### Business:

```javascript
{
  _id: ObjectId,
  tenant: ObjectId,                 // Tenant al que pertenece
  name: String,
  description: String,
  category: 'pharmacy' | 'drugstore' | 'store24' | 'health' | 'other',
  status: 'active' | 'inactive',
  contact: { phone, whatsapp, email, website },
  settings: Object,
  metadata: Object,
  createdBy: String,
  createdAt / updatedAt
}
```

### BusinessLocation:

```javascript
{
  _id: ObjectId,
  business: ObjectId,
  tenant: ObjectId,
  name: String,
  status: 'open' | 'closed' | 'on_call' | 'twenty_four',
  visibility: 'public' | 'tenant_only' | 'private',
  lat: Number,
  lng: Number,
  location: { type: 'Point', coordinates: [lng, lat] },  // Índice 2dsphere
  address: String,
  city: String,
  province: String,
  contactPhone: String,
  notes: String,
  hours: [{ day: 'mon', ranges: [{ open: '08:00', close: '13:00' }] }],
  metadata: Object,
  createdBy: String,
  createdAt / updatedAt
}
```

---

## 🔌 API Endpoints

### Requerimientos comunes
- `x-tenant-id`: slug u ObjectId del tenant destino (si no se envía, el backend usa `DEFAULT_TENANT_SLUG`)
- `x-user-id`: email del usuario autenticado (normalizado a minúsculas)
- `x-user-role` (opcional): `TENANT_ADMIN`, `TENANT_STAFF`, etc. para paneles comerciales

### Marcadores (panel municipal)
- `GET /api/markers` – Lista los marcadores del tenant (aplica filtros de privacidad y estado)
- `POST /api/markers` – Crea un nuevo marcador (las imágenes se guardan en MongoDB)
- `GET /api/markers/:id/image` – Devuelve la imagen asociada
- `POST /api/markers/:id/report-resolved` – El ciudadano reporta que resolvió un caso
- `PUT /api/markers/:id` – Actualiza un marcador (solo su creador)
- `DELETE /api/markers/:id` – Elimina un marcador (creador o admin)
- `GET /api/markers/admin` – Panel administrativo del tenant
- `PATCH /api/markers/admin/:id/status` – Cambiar estado (pendiente, en_proceso, etc.)
- `PATCH /api/markers/admin/:id/approve` – Aprobar marcadores nuevos

### Administración global de tenants (solo `ADMIN_USERS`)
- `POST /api/tenants` – Crea un nuevo tenant (municipio/cadena)
- `GET /api/tenants` – Lista / filtra tenants existentes
- `GET /api/tenants/:tenantId` – Obtiene detalle por ID o slug
- `PATCH /api/tenants/:tenantId` – Actualiza datos, plan y settings

### Comercios por tenant (`requireTenant`)
- `POST /api/businesses` – Crea un negocio para el tenant actual
- `GET /api/businesses` – Lista negocios del tenant (filtros por categoría/estado)
- `GET /api/businesses/:businessId` – Obtiene un negocio específico
- `PATCH /api/businesses/:businessId` – Edita datos (solo `TENANT_ADMIN`)
- `DELETE /api/businesses/:businessId` – Elimina negocio + sucursales
- `POST /api/businesses/:businessId/locations` – Agrega sucursal (lat/lng, horarios, notas)
- `GET /api/businesses/:businessId/locations` – Lista sucursales del negocio
- `PATCH /api/businesses/locations/:locationId` – Actualiza estado/horarios de una sucursal
- `DELETE /api/businesses/locations/:locationId` – Elimina una sucursal

### Endpoints públicos (sin headers)
- `GET /api/public/markers` – Casos visibles por tenant/estado/categoría
- `GET /api/public/businesses` – Busca locales abiertos (por tenant, categoría o cercanía)
- `GET /api/public/businesses/:businessId` – Perfil básico de un negocio + sucursales públicas
- `GET /api/public/locations/:locationId` – Detalle de una sucursal para compartir en enlaces/QR

---

## 🎨 Características Principales

### 1. **Mapa Interactivo**
- Vista de mapa con Google Maps
- Marcadores para cada reporte
- Ubicación del usuario en tiempo real
- Zoom y navegación
- Filtros por urgencia y categoría

### 2. **Gestión de Reportes**
- Crear reportes con imagen, descripción, fecha, hora
- Las imágenes se guardan directamente en MongoDB y se sirven bajo `/api/markers/:id/image`
- Editar reportes propios
- Eliminar reportes propios
- Ver estado de los reportes

### 3. **Panel de Administración**
- Tabla con todos los reportes
- Aprobar reportes pendientes
- Cambiar estados de casos
- Ver reportes de resolución
- Eliminar casos con opción de deshacer

### 4. **Sistema de Aprobación**
- Reportes nuevos requieren aprobación
- Solo administradores pueden aprobar
- Reportes aprobados son visibles para todos

### 5. **Sistema de Resolución**
- Ciudadanos pueden reportar que resolvieron un caso
- Integración con WhatsApp para reportes
- ID único de caso para facilitar comunicación

### 6. **Limpieza Automática**
- Casos resueltos se eliminan automáticamente después de 10 días
- Mantiene la base de datos limpia

### 7. **Plataforma Multi-tenant**
- Middleware `x-tenant-id` para aislar municipios o cadenas comerciales
- Super administradores (definidos en `ADMIN_USERS`) pueden crear/editar tenants sin tocar la base
- Cada tenant posee sus propios reportes, configuraciones y paneles

### 8. **Directorio de Comercios Abiertos**
- Modelo de negocios + sucursales con índices geoespaciales
- Panel por tenant para cargar farmacias, drugstores, etc.
- API pública `/api/public/businesses` para mostrar locales abiertos al ciudadano (filtros por categoría, radio y estado)

---

## 🔒 Seguridad y Privacidad

### Autenticación:
- Firebase Authentication para login de usuarios
- Identificación por email del usuario

### Autorización:
- Verificación de permisos en backend
- Headers `x-user-id` y `x-tenant-id` para identificar usuario + tenant
- Lista de administradores en variable de entorno

### Privacidad:
- Reportes de "Familias" solo visibles para creador y administradores
- Filtrado de datos según rol de usuario
- Normalización de datos para evitar duplicados

---

## 📱 Integración WhatsApp

El sistema incluye integración con WhatsApp para reportar casos resueltos:

- **Número**: 3816865617
- **Formato**: Los usuarios pueden contactar incluyendo el ID del caso
- **Botón en popup**: Genera mensaje prellenado con ID y descripción

---

## 🐛 Solución de Problemas

### Error 404 al eliminar marcadores:
- Verificar que el backend esté corriendo
- Verificar que la ruta DELETE esté configurada correctamente

### CORS Error:
- Verificar que el origen del frontend esté en la lista de CORS del backend
- Verificar headers permitidos (`x-user-id`)

### Marcadores no aparecen:
- Verificar conexión a MongoDB
- Verificar permisos de usuario
- Verificar filtros aplicados

### Imágenes no se cargan:
- Verificar que el endpoint `GET /api/markers/:id/image` responda (para casos nuevos)
- Confirmar en MongoDB que el documento tenga datos en `image.data`
- Para reportes antiguos (modo legacy), comprobar que la carpeta `backend/uploads/` exista y tenga permisos

---

## 📝 Notas de Desarrollo

### Estados de Casos:
- `pendiente_aprobacion`: Recién creado, esperando aprobación
- `pendiente`: Aprobado, esperando ser atendido
- `en_proceso`: El municipio está trabajando en el caso
- `resuelto`: Caso resuelto (se elimina después de 10 días)

### Categorías:
- `familias`: Privada, solo creador y admins
- `persona`: Pública, todos pueden ver
- `perros_gatos`: Pública, todos pueden ver
- `reparaciones`: Pública, todos pueden ver

### Niveles de Urgencia:
- `baja`: Problema menor
- `media`: Problema moderado
- `alta`: Problema urgente

---

## 👨‍💻 Desarrollo Futuro

Posibles mejoras:
- Notificaciones push cuando se aprueba un reporte
- Dashboard con estadísticas para administradores
- Sistema de comentarios en reportes
- Historial de cambios de estado
- Exportación de reportes a PDF/Excel
- Integración con sistemas municipales existentes
- App móvil nativa

---

## 📄 Licencia

Este proyecto fue desarrollado para uso municipal. Todos los derechos reservados.

---

## 👤 Contacto y Soporte

Para soporte técnico o consultas sobre el sistema, contactar al equipo de desarrollo.

**WhatsApp de Reportes**: 3816865617

---

## 🎯 Resumen Ejecutivo

Este sistema permite a los ciudadanos reportar problemas en su comunidad de manera sencilla y eficiente, mientras que las autoridades municipales pueden gestionar, priorizar y resolver estos reportes de manera organizada. El sistema protege la privacidad de casos sensibles (familias) mientras fomenta la colaboración ciudadana en problemas públicos (animales, reparaciones, personas en situación de calle).

El flujo de trabajo garantiza que todos los reportes sean revisados por administradores antes de ser públicos, y permite que los ciudadanos contribuyan activamente a la resolución de problemas en su comunidad.
