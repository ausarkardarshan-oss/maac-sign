'use strict';
const { Router } = require('express');
const { requireAuth } = require('../middleware/auth');
const { listTemplates, createTemplate, listForms, createForm } = require('../services/templateService');

const router = Router();

router.use(requireAuth);

// GET /api/templates
router.get('/templates', async (req, res, next) => {
  try {
    const list = await listTemplates(req.user.id);
    res.json(list);
  } catch (err) {
    next(err);
  }
});

// POST /api/templates
router.post('/templates', async (req, res, next) => {
  try {
    const result = await createTemplate(req.user.id, req.body);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

// GET /api/forms
router.get('/forms', async (req, res, next) => {
  try {
    const list = await listForms(req.user.id);
    res.json(list);
  } catch (err) {
    next(err);
  }
});

// POST /api/forms
router.post('/forms', async (req, res, next) => {
  try {
    const result = await createForm(req.user.id, req.body);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
