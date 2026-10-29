/**
 * Dashboard / market analytics routes.
 */
const express = require('express');
const analyticsController = require('../controllers/analyticsController');

const router = express.Router();

router.get('/dashboard', analyticsController.getDashboard);
router.get('/overview', analyticsController.getOverview);
router.get('/salary', analyticsController.getSalaryInsights);
router.get('/demand', analyticsController.getDemandStatistics);
router.get('/roles', analyticsController.getPopularRoles);
router.get('/companies', analyticsController.getTopCompanies);

module.exports = router;
