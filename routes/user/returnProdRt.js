const express = require("express");
const router = express.Router();
const returnProdController = require("../../controllers/returnProdCtl");

const {
   validateCreateReturnProds,
   validateEditReturnProds,
   validateDeleteIdParam,
   handleValidationErrors,
} = require("../../middlewares/validationMw");

// Get shortage return products for a specific user
router.get("/shortage", returnProdController.getShortage);
// Get unconfirmed return products for a specific user with pagination
router.get("/unconfirmuser", returnProdController.getUnConfirm);
// Create return products
router.post(
   "/",
   validateCreateReturnProds,
   handleValidationErrors,
   returnProdController.createReturnProds
);
// Edit return products
router.patch(
   "/unconfirm",
   validateEditReturnProds,
   handleValidationErrors,
   returnProdController.editReturnProds
);
// Delete a return product by ID
router.delete(
   "/:id",
   validateDeleteIdParam("id"),
   handleValidationErrors,
   returnProdController.deleteReturnProd
);

module.exports = router;
