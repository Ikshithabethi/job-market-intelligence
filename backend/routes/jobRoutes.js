/**
 * Job market intelligence routes.
 */
const express = require('express');
const jobController = require('../controllers/jobController');

const router = express.Router();

router.get('/', jobController.listJobs);
router.get('/filters', jobController.getFilterOptions);
router.get('/:id', jobController.getJobById);

module.exports = router;
