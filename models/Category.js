const mongoose = require("mongoose");

const categorySchema = new mongoose.Schema(
   {
      name: {
         type: String,
         required: true,
         trim: true,
      },
      basePrice: {
         type: Number,
         required: true,
         default: 0,
         min: 0,
      },
      type: {
         type: String,
         required: true,
         unique: true,
         trim: true,
      },
   },
   { timestamps: false }
);

module.exports = mongoose.model("Category", categorySchema);
