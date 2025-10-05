// models/Payment.js
const mongoose = require("mongoose");

const PaymentSchema = new mongoose.Schema(
   {
      username: {
         type: String,
         required: true,
         trim: true,
      },
      products: [
         {
            category: { type: String, required: true },
            qty: { type: Number, required: true, min: 0 },
            total: { type: Number, required: true, min: 0 },
            size: [
               {
                  name: { type: String, default: "" },
                  qty: { type: Number, required: true, min: 0 },
                  total: { type: Number, required: true, min: 0 },
               },
            ],
            difficult: [
               {
                  name: { type: String, default: "" },
                  qty: { type: Number, required: true, min: 0 },
                  total: { type: Number, required: true, min: 0 },
               },
            ]
         },
      ],
      grandTotal: {
         type: Number,
         required: true,
         min: 0,
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

module.exports = mongoose.model("Payment", PaymentSchema);
