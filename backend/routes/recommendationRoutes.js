/**
 * Skill recommendation routes.
 */
const express = require('express');
const recommendationController = require('../controllers/recommendationController');
const { optionalAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/popular-skills', recommendationController.popularSkills);
router.post('/skills', optionalAuth, recommendationController.recommendSkills);
router.post('/roles', optionalAuth, recommendationController.recommendRoles);

module.exports = router;
