// models/Assignment.js
const mongoose = require("mongoose");

const AssignmentSchema = new mongoose.Schema(
   {
      ordId: {
         type: mongoose.Schema.Types.ObjectId,
         ref: "Order",
         required: true,
      },
      userId: {
         type: mongoose.Schema.Types.ObjectId,
         ref: "Account",
         required: true,
      },
      qty: {
         type: Number,
         required: true,
      },
      qtyReturnTotal: {
         type: Number,
         default: 0,
      },
      qtyDelivery: {
         type: Number,
         default: 0,
      },
   },
   {
      timestamps: true,
   }
);

AssignmentSchema.index({ ordId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model("Assignment", AssignmentSchema);
