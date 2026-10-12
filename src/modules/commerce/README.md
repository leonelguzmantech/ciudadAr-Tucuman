# Módulo de Comercios (desactivado)

Este módulo contiene el directorio de comercios, multi-tenant avanzado y panel super admin.
Está **separado del producto municipal** para el proyecto final.

## Contenido

- `BusinessPanel.js` — Panel de gestión de negocios
- `SuperAdminPanel.js` — Panel de administración global de tenants

## Reactivar (opcional)

1. En `backend/server.js`, volver a registrar:
   - `/api/tenants` → `modules/commerce/routes/tenantRoutes`
   - `/api/businesses` → `modules/commerce/routes/businessRoutes`
2. Restaurar endpoints de comercios en `backend/routes/publicRoutes.js`
3. Importar los paneles desde `Home.js`

El producto principal municipal funciona sin este módulo.
