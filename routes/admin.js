const express = require("express");
const router = express.Router();

const userRouter = require("./admin/userRt");
const productRouter = require("./admin/productRt");
const ordersRouter = require("./admin/orderRt");
const assignmentsRouter = require("./admin/assignmentRt");
const returnProdRouter = require("./admin/returnProdRt");
const deliveryRouter = require("./admin/deliveryRt");
const paymentRouter = require("./admin/paymentRt");

router.use("/users", userRouter);
router.use("/products", productRouter);
router.use("/orders", ordersRouter);
router.use("/assignments", assignmentsRouter);
router.use("/returns", returnProdRouter);
router.use("/deliveries", deliveryRouter);
router.use("/payments", paymentRouter);

module.exports = router;
