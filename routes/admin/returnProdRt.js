const express = require("express");
const router = express.Router();
const returnProdController = require("../../controllers/returnProdCtl");

// Get unconfirmed return products, optionally filtered by userId
router.get("/unconfirm", returnProdController.getUnconfirmedByUser);
// Confirm return products
router.post("/confirm", returnProdController.confirmReturns);

module.exports = router;
