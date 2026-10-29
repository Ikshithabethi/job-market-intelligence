/**
 * Skill catalogue, demand and trend routes.
 * Literal paths are declared before "/:id" so they are not captured as ids.
 */
const express = require('express');
const skillController = require('../controllers/skillController');

const router = express.Router();

router.get('/', skillController.listSkills);
router.get('/categories', skillController.getCategories);
router.get('/trending', skillController.getTrending);
router.get('/demand', skillController.getDemand);
router.get('/:id', skillController.getSkillById);

module.exports = router;
