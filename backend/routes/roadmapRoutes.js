/**
 * Saved roadmap routes. Every route requires a valid token.
 */
const express = require('express');
const roadmapController = require('../controllers/roadmapController');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);

router.get('/', roadmapController.listRoadmaps);
router.post('/', roadmapController.saveRoadmap);
router.get('/:id', roadmapController.getRoadmap);
router.delete('/:id', roadmapController.deleteRoadmap);

module.exports = router;
