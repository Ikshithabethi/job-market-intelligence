/**
 * Profile and saved skill routes. Every route requires a valid token.
 *
 * "/skill-catalogue" is the read-only list of every skill in the dataset, while
 * "/skills" manages the skills saved on the user's own profile.
 */
const express = require('express');
const userController = require('../controllers/userController');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);

router.get('/profile', userController.getProfile);
router.put('/profile', userController.updateProfile);

router.get('/skill-catalogue', userController.skillCatalogue);

router.get('/skills', userController.listSkills);
router.post('/skills', userController.addSkill);
router.put('/skills', userController.replaceSkills);
router.put('/skills/:id', userController.updateSkill);
router.delete('/skills/:id', userController.deleteSkill);

module.exports = router;
