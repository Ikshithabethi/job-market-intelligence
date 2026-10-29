/**
 * Knowledge graph routes.
 */
const express = require('express');
const graphController = require('../controllers/graphController');

const router = express.Router();

router.get('/', graphController.getGraph);
router.get('/stats', graphController.getStats);
router.get('/neighbours', graphController.getNeighbours);

module.exports = router;
