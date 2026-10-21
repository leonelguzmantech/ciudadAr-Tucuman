# 🧪 Guía de Prueba del Sistema de Reportes Municipales

## ✅ Configuración
- **Super administrador**: `leonelguzman.tech@gmail.com` (definido en `backend/.env` → `ADMIN_USERS`)
- **Jurisdicciones**: provincia de Tucumán, 19 municipios y 93 comunas (cargados con `npm run import` en `backend/`)
- **Backend**: Puerto 5001
- **MongoDB**: MongoDB Atlas (si el cluster está pausado, reanudarlo desde el panel de Atlas)

---

## 📋 Pasos para Probar

### **Paso 1: Iniciar Servidores**

**Terminal 1 - Backend:**
```bash
cd backend
npm start
```
✅ Deberías ver: `Server is running on port 5001` y `Connected to MongoDB`

**Terminal 2 - Frontend:**
```bash
npm start
```
✅ Deberías ver: `Compiled successfully!` y abrirse `http://localhost:3000`

> Si la base no tiene las jurisdicciones cargadas, correr `cd backend && npm run import`.

---

### **Paso 2: Crear un caso (como ciudadano)**

1. Iniciar sesión con una cuenta que **no** sea administradora
2. Hacer clic en el mapa
3. Llenar el formulario (imagen, descripción, categoría, urgencia)
4. Hacer clic en "Subir"
5. ✅ El caso aparece en el mapa con estado "pendiente_aprobacion"
6. ✅ Otros usuarios comunes **no** deberían verlo todavía

---

### **Paso 3: Aprobar y gestionar el caso (como administrador)**

1. Cerrar sesión e iniciar con `leonelguzman.tech@gmail.com`
2. Abrir el panel de administración en el mapa
3. Hacer clic en **"Aprobar"** → el caso pasa a "pendiente" y lo ven todos
4. Cambiar el estado a "en proceso" y luego a "resuelto"
5. Probar **"Eliminar"** y luego **"Deshacer"** dentro de los 10 segundos

---

### **Paso 4: Reportar resolución (como ciudadano)**

1. Con una cuenta común, abrir el popup de un caso aprobado
2. Hacer clic en **"Reportar que resolví este caso"**
3. ✅ Como administrador, el reporte de resolución aparece en el panel

---

### **Paso 5: Detección automática de municipio**

1. Asignar un admin a cada municipio (desde `backend/`):
   ```bash
   npm run admins -- add yerba-buena cuenta1@gmail.com
   npm run admins -- add san-miguel-de-tucuman cuenta2@gmail.com
   ```
2. Con una cuenta común, crear un caso en Yerba Buena y otro en San Miguel de Tucumán
3. ✅ El popup de cada caso muestra "📍 Yerba Buena" o "📍 San Miguel de Tucumán"
4. Iniciar sesión con `cuenta1@gmail.com`
5. ✅ El panel dice "Administrás: Yerba Buena" y solo lista el caso de Yerba Buena
6. Iniciar sesión con `cuenta2@gmail.com`
7. ✅ Solo ve y puede aprobar el caso de San Miguel de Tucumán

---

## 🔍 Checklist

### ✅ Administrador:
- [ ] Ver todos los reportes (incluida la categoría "Familias")
- [ ] Aprobar casos pendientes
- [ ] Cambiar estados de casos
- [ ] Eliminar casos (con opción de deshacer)
- [ ] Ver reportes de resolución de ciudadanos

### ✅ Ciudadano:
- [ ] Ver mapa
- [ ] Crear reporte/caso
- [ ] Ver su propio caso (aunque esté pendiente)
- [ ] Editar y eliminar sus propios casos
- [ ] No ver casos de "Familias" de otros usuarios
- [ ] Reportar que resolvió un caso

---

## 🐛 Solución de Problemas

### **`Error connecting to MongoDB ... ENOTFOUND`**
- El cluster de MongoDB Atlas probablemente está pausado: reanudarlo desde el panel de Atlas
- Reiniciar el backend

### **No veo el panel de administración**
- Super admin: verificar que tu correo esté en `backend/.env` → `ADMIN_USERS=tu_correo@gmail.com` y reiniciar el backend
- Admin de municipio: verificar con `npm run admins -- list` que tu correo esté asignado
- Verificar en DevTools → Network que `/api/auth/me` devuelva `isAdmin: true`

### **Un caso dice "Fuera de las jurisdicciones registradas"**
- El punto está fuera de Tucumán (por ahora solo está cargada esa provincia)

### **Los casos no aparecen**
- Revisar los filtros aplicados en el mapa
- Los casos pendientes de aprobación solo los ven su creador y los admins de esa jurisdicción
