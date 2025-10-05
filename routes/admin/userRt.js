const express = require("express");
const router = express.Router();
const userController = require("../../controllers/userCtl");

// Get all users (role: 0)
router.get("/", userController.getAllUsers);

module.exports = router;