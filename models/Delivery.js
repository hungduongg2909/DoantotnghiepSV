// models/Delivery.js
const mongoose = require("mongoose");

const DeliverySchema = new mongoose.Schema(
   {
      products: [
         {
            prodName: {
               type: String,
               required: true,
            },
            qty: {
               type: Number,
               required: true,
            },
            size: {
               type: String,
            },
         },
      ],
      note: {
         type: String,
         default: "",
      },
      orderPO: {
         type: String,
         required: true,
      },
   },
   {
      timestamps: true, // tự động có createdAt, updatedAt
   }
);

DeliverySchema.index({ orderPO: 1, createdAt: -1 });

module.exports = mongoose.model("Delivery", DeliverySchema);
