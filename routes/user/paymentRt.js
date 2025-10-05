const express = require("express");
const router = express.Router();
const paymentController = require("../../controllers/paymentCtl");

router.get("/user", paymentController.previewPaymentByUser);

module.exports = router;