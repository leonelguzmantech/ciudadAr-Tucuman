const express = require('express');
const Notificacion = require('../models/notificacion');
const { getRequestUser } = require('../utils/users');

const router = express.Router();

router.use((req, res, next) => {
  req.requester = getRequestUser(req);
  if (!req.requester || req.requester === 'anonimo') {
    return res.status(401).json({ message: 'Tenés que iniciar sesión' });
  }
  next();
});

router.get('/', async (req, res) => {
  try {
    const notificaciones = await Notificacion.find({ userId: req.requester })
      .sort({ createdAt: -1 })
      .limit(40);
    const noLeidas = await Notificacion.countDocuments({ userId: req.requester, leida: false });
    res.json({ notificaciones, noLeidas });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.patch('/leer-todas', async (req, res) => {
  try {
    await Notificacion.updateMany(
      { userId: req.requester, leida: false },
      { leida: true }
    );
    res.json({ message: 'Avisos marcados como leídos' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.patch('/:id/leer', async (req, res) => {
  try {
    const notificacion = await Notificacion.findOneAndUpdate(
      { _id: req.params.id, userId: req.requester },
      { leida: true },
      { new: true }
    );
    if (!notificacion) {
      return res.status(404).json({ message: 'No se encontró el aviso' });
    }
    res.json(notificacion);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
