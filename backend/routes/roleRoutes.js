/**
 * Job role routes, including comparison.
 */
const express = require('express');
const roleController = require('../controllers/roleController');

const router = express.Router();

router.get('/', roleController.listRoles);
router.get('/families', roleController.getFamilies);
router.get('/compare', roleController.compareRoles);
router.get('/:id', roleController.getRoleById);

module.exports = router;
