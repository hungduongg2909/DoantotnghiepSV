const fs = require("fs");
const fsp = fs.promises;
const path = require("path");

const Product = require("../models/Product");
const Category = require("../models/Category");
const Difficulty = require("../models/Difficulty");
const Order = require("../models/Order");

// Helper: resolve đường dẫn ảnh local về absolute path
function resolveLocalPath(imageRef) {
   if (!imageRef || typeof imageRef !== "string") return null;
   // Nếu đã là absolute thì giữ nguyên, còn lại thì resolve từ project root
   return path.isAbsolute(imageRef)
      ? imageRef
      : path.resolve(process.cwd(), imageRef.replace(/^\//, ""));
}

// Get all Category
exports.getAllCategoryCtl = async (req, res) => {
   try {
      const categories = await Category.find();

      return res.status(200).json({
         success: true,
         message: "Get the list product successfully",
         data: categories,
      });
   } catch (error) {
      console.error("=== GET CATEGORY ERROR ===");
      console.error("Error:", error);
      return res.status(500).json({
         success: false,
         message: "Internal server error",
      });
   }
};

// Get all Difficulty
exports.getAllDifficultyCtl = async (req, res) => {
   try {
      const difficulties = await Difficulty.find();

      return res.status(200).json({
         success: true,
         message: "Get the difficulty successfully",
         data: difficulties,
      });
   } catch (error) {
      console.error("=== GET DIFFICULTY ERROR ===");
      console.error("Error:", error);
      return res.status(500).json({
         success: false,
         message: "Internal server error",
      });
   }
};

exports.getProductsPagination = async (req, res) => {
   try {
      // --- Parse & sanitize query ---
      const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
      const limit = Math.min(
         Math.max(parseInt(req.query.limit, 10) || 10, 1),
         100
      );
      const skip = (page - 1) * limit;

      // (Optional) filters: có thể sau dùng
      const { categoryId, difficultyId, q } = req.query;

      const query = {};
      if (categoryId) query.categoryId = categoryId;
      if (difficultyId) query.difficultyId = difficultyId;
      if (q) {
         query.$or = [
            { name: { $regex: q, $options: "i" } },
            { prodCode: { $regex: q, $options: "i" } },
         ];
      }

      // sort theo createdAt DESC (mới nhất lên đầu)
      const sort = { createdAt: -1 };

      // --- Query DB song song ---
      const [items, total] = await Promise.all([
         Product.find(query)
            .populate("categoryId", "name")
            .populate("difficultyId", "name")
            .sort(sort)
            .skip(skip)
            .limit(limit)
            .lean(),
         Product.countDocuments(query),
      ]);

      return res.json({
         success: true,
         data: items,
         pagination: { page, limit, total },
      });
   } catch (err) {
      console.error("=== GET PRODUCTs ERROR ===");
      console.error("Error:", err);
      return res.status(500).json({
         success: false,
         message: "Internal Server Error",
      });
   }
};

// Get product by ID
exports.getProductByIdCtl = async (req, res) => {
   try {
      const { id } = req.params;
      const product = await Product.findById(id)
         .populate("categoryId", "name")
         .populate("difficultyId", "name")
         .lean();
      if (!product) {
         return res.status(404).json({
            success: false,
            message: "No product found in the system",
         });
      }
      return res.status(200).json({
         success: true,
         message: "Get product successfully",
         data: product,
      });
   } catch (error) {
      console.error("=== GET PRODUCT BY ID ERROR ===");
      console.error("Error:", error);
      return res.status(500).json({
         success: false,
         message: "Internal server error",
      });
   }
};

// POST /admin/products
// Add new product
exports.addProductCtl = async (req, res) => {
   try {
      const { name, categoryId, difficultyId, prodCode } = req.body;

      // Check file
      if (!req.file) {
         return res.status(400).json({
            success: false,
            message: "Please upload PDF file",
         });
      }

      // Check if product code already exists
      const existingProduct = await Product.findOne({ prodCode });
      if (existingProduct) {
         return res.status(400).json({
            success: false,
            message: "Product code already exists",
         });
      }

      // Create new product
      const newProduct = new Product({
         name: name.trim(),
         categoryId,
         difficultyId,
         prodCode: prodCode.trim(),
         image: "/images/" + req.file.filename,
      });

      // Save to database
      await newProduct.save();

      return res.status(201).json({
         success: true,
         message: "Product added successfully",
      });
   } catch (error) {
      console.error("=== ADD PRODUCT ERROR ===");
      console.error("Error:", error);

      return res.status(500).json({
         success: false,
         message: "Internal server error",
      });
   }
};

// Update product
// PATCH /admin/products/:id
exports.updateProductCtl = async (req, res) => {
   try {
      const { id } = req.params;
      // Kiểm tra có tồn tại không
      const existed = await Product.findById(id).lean();
      if (!existed) {
         return res.status(404).json({
            success: false,
            message: "No product found in the system",
         });
      }

      const { name, prodCode, categoryId, difficultyId } = req.body;

      const update = {};
      update.name = name;
      update.prodCode = prodCode;
      update.categoryId = categoryId;
      update.difficultyId = difficultyId;

      // File PDF: nếu có → cập nhật image
      if (req.file) {
         update.image = `/images/${req.file.filename}`;

         if (existed.image) {
            const oldPath = path.join(
               process.cwd(),
               "public",
               existed.image.replace(/^\/+/, "") // bỏ dấu "/" ở đầu
            );

            // Xóa file cũ an toàn (không crash nếu không có file)
            fs.unlink(oldPath, (err) => {
               if (err) {
                  console.warn("Cannot delete old file:", oldPath, err.message);
               }
            });
         }
      }

      // Update
      await Product.findByIdAndUpdate(id, update, {
         new: true,
         runValidators: true,
      });

      return res.json({
         success: true,
         message: "Product updated successfully",
      });
   } catch (err) {
      console.error("[updateProduct] error:");
      console.error(err);
      return res.status(500).json({
         success: false,
         message: "Internal Server Error",
      });
   }
};

// Delete product
// DELETE /admin/products/:id
exports.deleteProductCtl = async (req, res) => {
   try {
      const { id } = req.params;
      const product = await Product.findById(id);
      if (!product) {
         return res.status(404).json({
            success: false,
            message: "No product found in the system",
         });
      }

      // Kiểm tra ràng buộc: có Order nào đang dùng productId này không?
      const linkedCount = await Order.countDocuments({ productId: id });
      if (linkedCount > 0) {
         return res.status(400).json({
            success: false,
            message: "Cannot delete: Product is being used in an order.",
         });
      }

      try {
         if (product.image) {
            const oldPath = path.join(
               process.cwd(),
               "public",
               product.image.replace(/^\/+/, "") // bỏ dấu "/" đầu nếu có
            );
            // console.log("[deleteProduct] unlink:", oldPath);
            await fsp.unlink(oldPath).catch((err) => {
               if (err.code === "ENOENT") return; // file không tồn tại: bỏ qua
               throw err; // lỗi khác: fail
            });
         }
      } catch (imgErr) {
         console.error("Delete local image failed:", imgErr);
         return res.status(500).json({
            success: false,
            message: "Failed to delete product image",
         });
      }

      // Delete product
      await Product.findByIdAndDelete(id);

      return res.status(200).json({
         success: true,
         message: "Product deleted successfully",
      });
   } catch (error) {
      console.error("=== DELETE PRODUCT ERROR ===");
      console.error("Error:", error);
      return res.status(500).json({
         success: false,
         message: "Internal server error",
      });
   }
};
