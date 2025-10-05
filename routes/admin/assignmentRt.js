const express = require("express");
const router = express.Router();
const assignmentController = require("../../controllers/assignmentCtl");

router.get("/available", assignmentController.getAvailableForDelivery);
router.get("/pending", assignmentController.getPendingAssignments);
router.post("/", assignmentController.bulkAssign);

module.exports = router;