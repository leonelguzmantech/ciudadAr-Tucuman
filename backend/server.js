//server.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const markerRoutes = require('./routes/markerRoutes');
const publicRoutes = require('./routes/publicRoutes');
const { normalizeUserId, isAdminUser } = require('./utils/users');

const app = express();

app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:3001'],
  methods: ['GET', 'POST', 'DELETE', 'PUT', 'PATCH'],
  allowedHeaders: ['Content-Type', 'x-user-id', 'x-tenant-id', 'x-user-role']
}));

mongoose.connect(process.env.MONGODB_URI).then(() => {
  console.log('Connected to MongoDB');
}).catch((err) => {
  console.error('Error connecting to MongoDB', err);
});

app.use(express.json());

app.get('/api/auth/me', (req, res) => {
  const userId = normalizeUserId(req.headers['x-user-id'] || '');
  const isAdmin = isAdminUser(userId);

  res.json({
    userId,
    isAdmin,
    role: isAdmin ? 'MUNICIPAL_ADMIN' : 'PUBLIC_USER',
  });
});

app.use('/api/markers', markerRoutes);
app.use('/api/public', publicRoutes);

const PORT = process.env.PORT || 5001;

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
