//server.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const markerRoutes = require('./routes/markerRoutes');
const publicRoutes = require('./routes/publicRoutes');
const usuarioRoutes = require('./routes/usuarioRoutes');
const notificacionRoutes = require('./routes/notificacionRoutes');
const geocodeRoutes = require('./routes/geocodeRoutes');
const rutasRoutes = require('./routes/rutasRoutes');
const superRoutes = require('./routes/superRoutes');
const { normalizeUserId } = require('./utils/users');
const { getAdminScope, isScopeAdmin, isScopeOperario } = require('./utils/jurisdictions');

const app = express();

app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:3001'],
  methods: ['GET', 'POST', 'DELETE', 'PUT', 'PATCH'],
  allowedHeaders: ['Content-Type', 'x-user-id']
}));

mongoose.connect(process.env.MONGODB_URI).then(() => {
  console.log('Connected to MongoDB');
}).catch((err) => {
  console.error('Error connecting to MongoDB', err);
});

app.use(express.json());

app.get('/api/auth/me', async (req, res) => {
  try {
    const userId = normalizeUserId(req.headers['x-user-id'] || '');
    const scope = await getAdminScope(userId);
    const isAdmin = isScopeAdmin(scope);
    const isOperario = isScopeOperario(scope);

    let role = 'PUBLIC_USER';
    if (scope.isSuperAdmin) role = 'SUPER_ADMIN';
    else if (isAdmin) role = 'JURISDICTION_ADMIN';
    else if (isOperario) role = 'OPERARIO';

    res.json({
      userId,
      isAdmin: isAdmin || isOperario,
      isOperario,
      role,
      jurisdictions: isOperario ? scope.operarioJurisdictions : scope.jurisdictions,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.use('/api/markers', markerRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/usuarios', usuarioRoutes);
app.use('/api/notificaciones', notificacionRoutes);
app.use('/api/geocode', geocodeRoutes);
app.use('/api/rutas', rutasRoutes);
app.use('/api/super', superRoutes);

const PORT = process.env.PORT || 5001;

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
