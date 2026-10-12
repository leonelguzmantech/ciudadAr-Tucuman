# 🧪 Guía de Prueba del Sistema Multi-Tenant

## ✅ Configuración Verificada
- **SUPER_ADMIN**: `leonelguzman.tech@gmail.com`
- **Backend**: Puerto 5001
- **MongoDB**: Conectado

---

## 📋 Pasos para Probar

### **Paso 1: Iniciar Servidores**

**Terminal 1 - Backend:**
```bash
cd backend
npm start
```
✅ Deberías ver: `Server is running on port 5001`

**Terminal 2 - Frontend:**
```bash
npm start
```
✅ Deberías ver: `Compiled successfully!` y abrirse `http://localhost:3000`

---

### **Paso 2: Probar como SUPER_ADMIN**

1. **Iniciar sesión** con `leonelguzman.tech@gmail.com` en Firebase
2. **Verificar que aparezca**:
   - Botón "Panel Super Admin" (verde)
   - Botón "Ver Mapa" (azul)
3. **Hacer clic en "Panel Super Admin"**:
   - Deberías ver estadísticas (Total Tenants, Activos, Casos, Negocios)
   - Tabla de tenants (probablemente vacía al inicio)
   - Botón "+ Nuevo Tenant"

---

### **Paso 3: Crear un Tenant (Municipio)**

1. En el **Panel Super Admin**, hacer clic en **"+ Nuevo Tenant"**
2. Llenar el formulario:
   - **Nombre**: `Municipio de Prueba`
   - **Slug**: `municipio-prueba` (sin espacios, minúsculas)
   - **Tipo**: `Municipio`
   - **Plan**: `Pro` (o el que quieras)
   - **Email**: `admin@municipio.com`
3. Hacer clic en **"Crear Tenant"**
4. ✅ Deberías ver el nuevo tenant en la tabla

---

### **Paso 4: Probar Panel de Comercios (como TENANT_ADMIN)**

**Opción A: Desde el navegador (temporal)**
1. Abrir **DevTools** (F12) → **Console**
2. Ejecutar:
   ```javascript
   localStorage.setItem('userRole', 'TENANT_ADMIN');
   ```
3. Recargar la página
4. Deberías ver los botones: "Panel de Comercios", "Panel de Casos", "Ver Mapa"

**Opción B: Crear variable de entorno (recomendado)**
1. En la raíz del proyecto, crear/editar `.env`:
   ```bash
   REACT_APP_DEFAULT_USER_ROLE=TENANT_ADMIN
   REACT_APP_TENANT_ID=municipio-prueba
   ```
2. Reiniciar el frontend (`npm start`)

---

### **Paso 5: Crear un Negocio (desde Panel de Comercios)**

1. Ir a **"Panel de Comercios"**
2. Hacer clic en **"+ Nuevo negocio"** (por ahora solo muestra en consola)
3. O probar desde **Postman**:
   ```bash
   POST http://localhost:5001/api/businesses
   Headers:
     x-user-id: leonelguzman.tech@gmail.com
     x-tenant-id: municipio-prueba
     x-user-role: TENANT_ADMIN
   Body (JSON):
   {
     "name": "Farmacia 24/7",
     "category": "pharmacy",
     "contact": {
       "phone": "+54 381 1234567",
       "email": "contacto@farmacia.com"
     }
   }
   ```
4. Volver al panel y deberías ver el negocio en la tabla

---

### **Paso 6: Probar el Mapa**

1. Hacer clic en **"Ver Mapa"**
2. **Crear un caso**:
   - Hacer clic en el mapa
   - Llenar el formulario (imagen, descripción, categoría, urgencia)
   - Hacer clic en "Subir"
3. ✅ El caso debería aparecer en el mapa con estado "pendiente_aprobacion"
4. **Aprobar el caso** (si sos admin):
   - Abrir el panel de admin en el mapa
   - Cambiar el estado a "pendiente"

---

### **Paso 7: Probar "Locales Abiertos"**

1. En el mapa, activar **"Mostrar locales abiertos"**
2. Si creaste un negocio con ubicación, deberías ver:
   - Marcadores verdes con animación
   - Al hacer clic, popup con información del negocio
3. Los casos municipales deberían ocultarse cuando está activo

---

## 🔍 Verificar Funcionalidades

### ✅ Checklist SUPER_ADMIN:
- [ ] Ver Panel Super Admin
- [ ] Crear nuevo tenant
- [ ] Cambiar plan de suscripción (Free → Pro → Enterprise)
- [ ] Activar/Desactivar tenant
- [ ] Ver estadísticas globales

### ✅ Checklist TENANT_ADMIN:
- [ ] Ver Panel de Comercios
- [ ] Ver Panel de Casos
- [ ] Crear negocio (desde Postman o panel)
- [ ] Aprobar casos pendientes
- [ ] Cambiar estados de casos

### ✅ Checklist PUBLIC_USER:
- [ ] Ver mapa
- [ ] Crear reporte/caso
- [ ] Ver su propio caso (aunque esté pendiente)
- [ ] Ver locales abiertos (si hay)

---

## 🐛 Solución de Problemas

### **No veo el botón "Panel Super Admin"**
- Verificar que tu correo esté en `backend/.env` → `ADMIN_USERS=tu_correo@gmail.com`
- Reiniciar el backend
- Verificar en DevTools → Network que `/api/auth/me` devuelva `isAdmin: true`

### **Error 404 al crear tenant**
- Verificar que el backend esté corriendo en puerto 5001
- Verificar headers en Network tab

### **No puedo crear negocios**
- Verificar que el `tenantId` coincida con el slug del tenant creado
- Verificar que el header `x-user-role: TENANT_ADMIN` esté presente

### **No veo estadísticas**
- Verificar que haya datos en MongoDB (tenants, markers, businesses)
- Revisar consola del backend por errores

---

## 📝 Notas

- **Roles**: Por ahora, el rol se determina por:
  - `ADMIN_USERS` → SUPER_ADMIN (automático)
  - `x-user-role` header → TENANT_ADMIN/TENANT_STAFF (manual)
  - Por defecto → PUBLIC_USER

- **Tenant ID**: Se lee de `REACT_APP_TENANT_ID` o usa `demo-municipio` por defecto

- **Próximos pasos**: Integrar Firebase Custom Claims para roles más robustos









