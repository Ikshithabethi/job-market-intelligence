/**
 * Career path analytics routes.
 *
 * optionalAuth lets a logged-in user omit currentSkills (their saved profile
 * skills are used) while still allowing anonymous use of the same endpoint.
 */
const express = require('express');
const careerController = require('../controllers/careerController');
const { optionalAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/options', careerController.getOptions);
router.get('/map', careerController.getCareerMap);
router.post('/path', optionalAuth, careerController.findPath);

module.exports = router;
