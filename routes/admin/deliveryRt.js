const express = require("express");
const router = express.Router();
const deliveryController = require("../../controllers/deliveryCtl");

// Bulk deliver route
router.post("/", deliveryController.bulkDeliver);

module.exports = router;