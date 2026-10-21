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
Cada administrador está asignado a un municipio, comuna o provincia, y solo gestiona los reportes de su territorio. Los super administradores (`ADMIN_USERS`) gestionan todos.

Los administradores pueden:
- ✅ Ver **todos** los reportes de su jurisdicción (incluyendo categoría "Familias")
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
│   ├── data/
│   │   └── tucuman.geojson        # Límites oficiales de Tucumán, sus municipios y comunas
│   ├── models/
│   │   ├── marker.js              # Modelo de datos de marcadores
│   │   └── tenant.js              # Jurisdicciones (provincias, municipios, comunas)
│   ├── routes/
│   │   ├── markerRoutes.js        # Rutas privadas para marcadores
│   │   └── publicRoutes.js        # Endpoints públicos (mapa ciudadano)
│   ├── scripts/
│   │   ├── importJurisdictions.js # Importa jurisdicciones y reasigna reportes
│   │   └── manageAdmins.js        # Asigna administradores a cada jurisdicción
│   ├── utils/
│   │   ├── jurisdictions.js       # Detección de jurisdicción por ubicación y permisos
│   │   └── users.js               # Utilidades de usuarios
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
PORT=5001
```

**Variables de entorno:**
- `MONGODB_URI`: URL de conexión a MongoDB
- `ADMIN_USERS`: Super administradores, separados por comas (ven y gestionan los casos de todas las jurisdicciones)
- `PORT`: Puerto del servidor (por defecto 5001)

### 3. Cargar las jurisdicciones:

```bash
cd backend
npm run import
```

Importa la provincia de Tucumán con sus 19 municipios y 93 comunas rurales (límites oficiales del IGN y nombres de la API Georef) y asigna cada reporte existente a la jurisdicción donde está. Se puede volver a correr sin duplicar datos.

Para asignar administradores a un municipio, comuna o provincia:

```bash
npm run admins -- find "yerba"                          # buscar el slug
npm run admins -- add yerba-buena admin@yerbabuena.gob.ar
npm run admins -- remove yerba-buena admin@yerbabuena.gob.ar
npm run admins -- list                                  # ver quién administra qué
```

### 4. Instalación del Frontend:

```bash
# Desde la raíz del proyecto
npm install
```

### 5. Configuración del Frontend:

En `src/components/Home.js`, actualizar la clave de Google Maps:

```javascript
const GOOGLE_MAPS_API_KEY = "TU_CLAVE_DE_GOOGLE_MAPS";
```

### 6. Ejecutar el Proyecto:

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
  tenant: ObjectId,                 // Municipio o comuna donde está el caso (o la provincia si no cae en ninguno)
  province: ObjectId,               // Provincia donde está el caso
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

### Tenant (Jurisdicción):

```javascript
{
  _id: ObjectId,
  name: String,                     // Nombre (ej: 'Yerba Buena')
  slug: String,                     // Identificador único en minúsculas (ej: 'yerba-buena')
  code: String,                     // Código oficial INDEC/IGN (ej: '900133')
  type: 'province' | 'municipality' | 'commune',
  parent: ObjectId,                 // Provincia a la que pertenece
  boundary: GeoJSON,                // Límite geográfico (Polygon o MultiPolygon, índice 2dsphere)
  admins: [String],                 // Emails de quienes administran sus reportes
  status: 'active' | 'inactive' | 'pending',
  createdAt / updatedAt
}
```

---

## 🔌 API Endpoints

### Requerimientos comunes
- `x-user-id`: email del usuario autenticado (normalizado a minúsculas)

### Marcadores (panel municipal)
- `GET /api/markers` – Lista los marcadores visibles para el usuario (aplica filtros de privacidad, estado y jurisdicción)
- `POST /api/markers` – Crea un nuevo marcador y lo asigna a la jurisdicción según su ubicación (las imágenes se guardan en MongoDB)
- `GET /api/markers/:id/image` – Devuelve la imagen asociada
- `POST /api/markers/:id/report-resolved` – El ciudadano reporta que resolvió un caso
- `PUT /api/markers/:id` – Actualiza un marcador (solo su creador)
- `DELETE /api/markers/:id` – Elimina un marcador (creador o admin de su jurisdicción)
- `GET /api/markers/admin` – Casos de las jurisdicciones que administra el usuario
- `PATCH /api/markers/admin/:id/status` – Cambiar estado (pendiente, en_proceso, etc.)
- `PATCH /api/markers/admin/:id/approve` – Aprobar marcadores nuevos

### Autenticación
- `GET /api/auth/me` – Indica si el usuario es administrador (según `ADMIN_USERS`)

### Endpoints públicos (sin headers)
- `GET /api/public/markers` – Casos visibles por tenant/estado/categoría

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

### 7. **Detección Automática de Jurisdicción**
- Una sola app y un solo mapa para todos los ciudadanos
- Cada reporte se asigna automáticamente al municipio o comuna donde está, usando sus límites oficiales (consulta geoespacial `$geoIntersects` de MongoDB)
- Jerarquía provincia → municipio/comuna: el admin de un municipio gestiona sus casos; el admin de una provincia, todos los de la provincia
- Sumar una jurisdicción nueva es cargar sus límites y asignar sus admins, sin publicar otra app

---

## 🔒 Seguridad y Privacidad

### Autenticación:
- Firebase Authentication para login de usuarios
- Identificación por email del usuario

### Autorización:
- Verificación de permisos en backend
- Header `x-user-id` para identificar al usuario
- Super administradores en variable de entorno; administradores de cada jurisdicción en la base de datos

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
