// models/ReturnProd.js
const mongoose = require("mongoose");

const ReturnProdSchema = new mongoose.Schema(
   {
      assignId: {
         type: mongoose.Schema.Types.ObjectId,
         ref: "Assignment",
         required: true,
      },
      isConfirm: {
         type: Boolean,
         default: false,
      },
      qty: {
         type: Number,
         required: true,
         min: 1,
      },
      isPayment: {
         type: Boolean,
         default: false,
      },
      note: {
         type: String,
         trim: true,
         default: "",
      },
   },
   {
      timestamps: true,
   }
);

module.exports = mongoose.model("ReturnProd", ReturnProdSchema);
