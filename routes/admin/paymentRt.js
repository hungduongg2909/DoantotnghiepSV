const express = require("express");
const router = express.Router();
const paymentController = require("../../controllers/paymentCtl");
const {
   validateStats,
   handleValidationErrors,
} = require("../../middlewares/validationMw");

router.get("/", paymentController.previewPaymentByUser);

router.post("/", paymentController.savePayment);

router.get("/stats", validateStats, handleValidationErrors, paymentController.getStats);

module.exports = router;