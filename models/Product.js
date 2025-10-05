const mongoose = require("mongoose");

const productSchema = new mongoose.Schema(
   {
      name: {
         type: String,
         required: true,
         trim: true,
      },
      categoryId: {
         type: mongoose.Schema.Types.ObjectId,
         ref: "Category",
         required: true,
      },
      difficultyId: {
         type: mongoose.Schema.Types.ObjectId,
         ref: "Difficulty",
         default: null,
      },
      image: {
         type: String,
         default: "",
      },
      prodCode: {
         type: String,
         required: true,
         unique: true,
         trim: true,
      },
   },
   { timestamps: true }
);

productSchema.index({ createdAt: -1 });

module.exports = mongoose.models.Product || mongoose.model("Product", productSchema);
