const express = require("express");
const router = express.Router();

const returnProdRouter = require("./user/returnProdRt");
const paymentRouter = require("./user/paymentRt");

router.use("/returns", returnProdRouter);
router.use("/payments", paymentRouter);

module.exports = router;
