const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema(
   {
      po: {
         type: String,
         required: true,
         trim: true,
      },
      productId: {
         type: mongoose.Schema.Types.ObjectId,
         ref: "Product",
         required: true,
      },
      sizeId: {
         type: mongoose.Schema.Types.ObjectId,
         ref: "Size",
         default: null,
      },
      qty: {
         type: Number,
         required: true,
         min: 1,
      },
      note: {
         type: String,
         trim: true,
         default: "",
      },
      qtyDeliveryTotal: {
         type: Number,
         default: 0,
         min: 0,
      },
      deadline: {
         type: Date,
         required: true,
      },
      qtyAssignTotal: {
         type: Number,
         default: 0,
      },
   },
   {
      timestamps: true,
   }
);

orderSchema.index({ productId: 1 });

module.exports = mongoose.model("Order", orderSchema);
