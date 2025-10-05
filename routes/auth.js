const express = require("express");
const router = express.Router();

const authProdRouter = require("./auth/authRt");

router.use("/auth", authProdRouter);

module.exports = router;