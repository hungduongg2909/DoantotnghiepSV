const { body, query, param, validationResult } = require("express-validator");
const mongoose = require("mongoose");

exports.validateLogin = [
   body("loginIdentifier")
      .notEmpty()
      .withMessage("Email or username cannot be blank")
      .custom((value) => {
         if (value.includes("@")) {
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
               throw new Error("Email is not in correct format");
            }
         } else {
            if (!/^[a-zA-Z0-9]+$/.test(value)) {
               throw new Error(
                  "Username must contain only letters and numbers"
               );
            }
         }
         return true;
      }),

   body("password").notEmpty().withMessage("Password cannot be blank"),
];

exports.validateRegister = [
   body("username")
      .notEmpty()
      .withMessage("Username cannot be blank")
      .isAlphanumeric()
      .withMessage("Username must contain only letters and numbers"),

   body("email")
      .notEmpty()
      .withMessage("Email cannot be blank")
      .isEmail()
      .withMessage("Email is not in correct format"),

   body("password")
      .notEmpty()
      .withMessage("Password cannot be blank")
      .isLength({ min: 6 })
      .withMessage("Password must be at least 6 characters"),

   body("fullname").notEmpty().withMessage("Full name cannot be left blank"),

   body("phone")
      .notEmpty()
      .withMessage("Phone number cannot be blank")
      .isNumeric()
      .withMessage("Phone numbers can only contain numbers"),
];

exports.validateForgotPassword = [
   body("email")
      .notEmpty()
      .withMessage("Email cannot be blank")
      .isEmail()
      .withMessage("Email is not in correct format"),
];

exports.validateResetPassword = [
   body("token").notEmpty().withMessage("Token cannot be blank"),
   body("password")
      .notEmpty()
      .withMessage("Password cannot be blank")
      .isLength({ min: 6 })
      .withMessage("Password must be at least 6 characters"),
];

exports.validateChangePassword = [
   body("oldPassword")
      .notEmpty()
      .withMessage("Password cannot be blank"),
   body("newPassword")
      .notEmpty()
      .withMessage("Password cannot be blank")
      .isLength({ min: 6 })
      .withMessage("Password must be at least 6 characters"),
];

exports.validateNewProduct = [
   body("name").notEmpty().withMessage("Product name cannot be blank"),

   body("prodCode").notEmpty().withMessage("Product code cannot be blank"),
];

exports.validateStats = [
   query("year")
      .notEmpty()
      .withMessage("Year is required")
      .isInt({ min: 2025 })
      .withMessage("Year must be >= 2025"),

   query("month")
      .optional()
      .isInt({ min: 1, max: 12 })
      .withMessage("Month must be between 1 and 12"),
];

exports.validateCreateReturnProds = [
   body().custom((value) => {
      if (!Array.isArray(value) || value.length === 0) {
         throw new Error("Body must be a non-empty array");
      }

      value.forEach((it, idx) => {
         if (typeof it !== "object" || it === null) {
            throw new Error(`Item at index ${idx} must be an object`);
         }

         // assignId
         if (!("assignId" in it)) {
            throw new Error(`Missing assignId at index ${idx}`);
         }
         if (!mongoose.Types.ObjectId.isValid(String(it.assignId))) {
            throw new Error(`Invalid assignId at index ${idx}`);
         }

         // qty: strictly number, integer, > 0
         if (!("qty" in it)) {
            throw new Error(`Missing qty at index ${idx}`);
         }
         if (typeof it.qty !== "number" || !Number.isFinite(it.qty)) {
            throw new Error(`qty at index ${idx} must be a number`);
         }
         if (!Number.isInteger(it.qty) || it.qty <= 0) {
            throw new Error(`qty at index ${idx} must be an integer > 0`);
         }
      });

      return true;
   }),
];

exports.validateEditReturnProds = [
   body().custom((value) => {
      if (!Array.isArray(value) || value.length === 0) {
         throw new Error("Body must be a non-empty array");
      }

      value.forEach((it, idx) => {
         if (typeof it !== "object" || it === null) {
            throw new Error(`Item at index ${idx} must be an object`);
         }

         // returnId
         if (!("returnId" in it)) {
            throw new Error(`Missing returnId at index ${idx}`);
         }
         const idStr = String(it.returnId);
         if (!mongoose.Types.ObjectId.isValid(idStr)) {
            throw new Error(`Invalid returnId at index ${idx}`);
         }

         // qty: strictly number, integer, >= 0
         if (!("qty" in it)) {
            throw new Error(`Missing qty at index ${idx}`);
         }
         if (typeof it.qty !== "number" || !Number.isFinite(it.qty)) {
            throw new Error(`qty at index ${idx} must be a number`);
         }
         if (!Number.isInteger(it.qty) || it.qty < 0) {
            throw new Error(`qty at index ${idx} must be an integer >= 0`);
         }
      });

      return true;
   }),
];

exports.validateDeleteIdParam = (paramName = "id") => [
   param(paramName)
      .isMongoId()
      .withMessage(`${paramName} is not a valid ObjectId`),
];

exports.handleValidationErrors = (req, res, next) => {
   const errors = validationResult(req);

   if (!errors.isEmpty()) {
      return res.status(400).json({
         success: false,
         message: "Invalid data",
         errors: errors.array().map((error) => error.msg),
      });
   }

   next();
};
