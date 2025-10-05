const express = require("express");
const router = express.Router();
const prodController = require("../../controllers/productCtl");
const upload = require("../../middlewares/uploadMw");
const {
   validateNewProduct,
   handleValidationErrors,
} = require("../../middlewares/validationMw");

// Route to get all categories
router.get("/category", prodController.getAllCategoryCtl);
// Route to get all difficulties
router.get("/difficulty", prodController.getAllDifficultyCtl);
// Route to get products with pagination and optional filters
router.get("/", prodController.getProductsPagination);
// Route to get a single product by ID
router.get("/:id", prodController.getProductByIdCtl);
// Route to update a product by ID
router.patch(
   "/:id",
   upload.single("image"),
   validateNewProduct,
   handleValidationErrors,
   prodController.updateProductCtl
);
// Route to delete a product by ID
router.delete("/:id", prodController.deleteProductCtl);

// Route to add new product with file upload
router.post(
   "/",
   upload.single("image"),
   validateNewProduct,
   handleValidationErrors,
   prodController.addProductCtl
);

module.exports = router;
