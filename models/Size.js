const mongoose = require("mongoose");

const sizeSchema = new mongoose.Schema(
   {
      name: {
         type: String,
         required: true,
         trim: true,
      },
      bonusAmount: {
         type: Number,
         default: 0,
         min: 0,
      },
   },
   {
      timestamps: true,
   }
);

module.exports = mongoose.model("Size", sizeSchema);
