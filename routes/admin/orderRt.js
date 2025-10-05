const express = require("express");
const router = express.Router();
const orderController = require("../../controllers/orderCtl");

// Get unassigned orders route
router.get("/unassigned", orderController.getUnassignedOrders);

// Add order route
router.post("/", orderController.addOrder);

module.exports = router;
