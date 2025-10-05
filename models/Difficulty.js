const mongoose = require("mongoose");

const difficultySchema = new mongoose.Schema(
   {
      level: {
         type: Number,
         required: true,
         min: 0,
      },
      name: {
         type: String,
         required: true,
         trim: true,
      },
      bonusAmount: {
         type: Map,
         of: Number,
         default: {},
      },
   },
   { timestamps: false }
);

module.exports = mongoose.model("Difficulty", difficultySchema);
