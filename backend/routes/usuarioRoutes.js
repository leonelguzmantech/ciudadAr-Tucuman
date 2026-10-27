const express = require('express');
const Usuario = require('../models/usuario');
const { normalizeUserId } = require('../utils/users');

const router = express.Router();

const telefonoValido = (valor) => {
  const digitos = String(valor || '').replace(/\D/g, '');
  return digitos.length >= 8 && digitos.length <= 15;
};

const datosPublicos = (usuario) => ({
  email: usuario.email,
  nombre: usuario.nombre || '',
  telefono: usuario.telefono || '',
  proveedor: usuario.proveedor,
});

router.get('/me', async (req, res) => {
  try {
    const email = normalizeUserId(req.headers['x-user-id'] || '');
    if (!email || email === 'anonimo') {
      return res.status(401).json({ message: 'Falta el correo de la cuenta' });
    }
    const usuario = await Usuario.findOne({ email });
    if (!usuario) {
      return res.status(404).json({ message: 'No hay una cuenta registrada con ese correo.' });
    }
    res.json(datosPublicos(usuario));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/correo/:email', async (req, res) => {
  try {
    const email = normalizeUserId(req.params.email);
    const usuario = await Usuario.findOne({ email }).select('email proveedor');
    if (!usuario) {
      return res.status(404).json({ message: 'No hay una cuenta registrada con ese correo.' });
    }
    res.json({ email: usuario.email, proveedor: usuario.proveedor });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const email = normalizeUserId(req.body.email);
    if (!email || email === 'anonimo' || !email.includes('@')) {
      return res.status(400).json({ message: 'El correo no es válido' });
    }
    const telefono = String(req.body.telefono || '').trim();
    if (telefono && !telefonoValido(telefono)) {
      return res.status(400).json({ message: 'El celular no es válido' });
    }
    const proveedor = req.body.proveedor === 'google' ? 'google' : 'correo';
    const nombre = String(req.body.nombre || '').trim();
    const existente = await Usuario.findOne({ email });
    if (!existente && proveedor === 'correo' && !telefono) {
      return res.status(400).json({ message: 'El celular es obligatorio' });
    }

    const cambios = {};
    if (nombre) cambios.nombre = nombre;
    if (telefono) cambios.telefono = telefono;
    const actualizacion = { $setOnInsert: { email, proveedor } };
    if (Object.keys(cambios).length) actualizacion.$set = cambios;
    const usuario = await Usuario.findOneAndUpdate(
      { email },
      actualizacion,
      { new: true, upsert: true, runValidators: true }
    );
    res.status(existente ? 200 : 201).json(datosPublicos(usuario));
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.patch('/me', async (req, res) => {
  try {
    const email = normalizeUserId(req.headers['x-user-id'] || '');
    if (!email || email === 'anonimo') {
      return res.status(401).json({ message: 'Falta el correo de la cuenta' });
    }

    const nombre = String(req.body.nombre || '').trim();
    const telefono = String(req.body.telefono || '').trim();
    if (!nombre) {
      return res.status(400).json({ message: 'Escribí tu nombre.' });
    }
    if (!telefonoValido(telefono)) {
      return res.status(400).json({ message: 'Escribí un celular válido.' });
    }

    const usuario = await Usuario.findOneAndUpdate(
      { email },
      { $set: { nombre, telefono } },
      { new: true, runValidators: true }
    );
    if (!usuario) {
      return res.status(404).json({ message: 'No hay una cuenta registrada con ese correo.' });
    }
    res.json(datosPublicos(usuario));
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

module.exports = router;
