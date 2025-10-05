const express = require("express");
const router = express.Router();
const authController = require("../../controllers/authCtl");
const {
   validateLogin,
   validateRegister,
   validateForgotPassword,
   validateResetPassword,
   validateChangePassword,
   handleValidationErrors,
} = require("../../middlewares/validationMw");

// Login route
router.post(
   "/login",
   validateLogin,
   handleValidationErrors,
   authController.loginCtl
);

// Logout route
router.post("/logout", authController.logoutCtl);

router.post(
   "/register",
   validateRegister,
   handleValidationErrors,
   authController.registerCtl
);

// Forgot password route
router.post(
   "/forgot-password",
   validateForgotPassword,
   handleValidationErrors,
   authController.forgotPasswordCtl
);

// Reset password
router.post(
   "/reset-password",
   validateResetPassword,
   handleValidationErrors,
   authController.resetPasswordCtl
);

// Change password
router.post(
   "/change-password",
   validateChangePassword,
   handleValidationErrors,
   authController.changePassword
);

module.exports = router;
