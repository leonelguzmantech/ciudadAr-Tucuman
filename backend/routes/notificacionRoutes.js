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
    const tiposPerdidas = ['reclamo', 'chat', 'cerca'];
    const [noLeidas, perdidasNoLeidas] = await Promise.all([
      Notificacion.countDocuments({
        userId: req.requester,
        leida: false,
        tipo: { $nin: tiposPerdidas },
      }),
      Notificacion.countDocuments({
        userId: req.requester,
        leida: false,
        tipo: { $in: tiposPerdidas },
      }),
    ]);
    res.json({ notificaciones, noLeidas, perdidasNoLeidas });
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

// Marca como leídos avisos del Radar (reclamo / chat / cerca)
router.patch('/perdidas/leer', async (req, res) => {
  try {
    const tiposPerdidas = ['reclamo', 'chat', 'cerca'];
    const tiposPedidos = Array.isArray(req.body?.tipos)
      ? req.body.tipos.filter((t) => tiposPerdidas.includes(t))
      : [];
    const filtro = {
      userId: req.requester,
      leida: false,
      tipo: { $in: tiposPedidos.length ? tiposPedidos : tiposPerdidas },
    };
    const markerId = req.body?.markerId || req.query?.markerId;
    if (markerId) filtro.markerId = markerId;
    const result = await Notificacion.updateMany(filtro, { leida: true });
    const perdidasNoLeidas = await Notificacion.countDocuments({
      userId: req.requester,
      leida: false,
      tipo: { $in: tiposPerdidas },
    });
    res.json({
      message: 'Avisos de cosas perdidas marcados como leídos',
      modificados: result.modifiedCount || 0,
      perdidasNoLeidas,
    });
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
