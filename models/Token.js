const mongoose = require("mongoose");

const token = new mongoose.Schema(
   {
      email: {
         type: String,
         required: true,
      },
      token: {
         type: String,
         required: true,
         unique: true,
      },
      createdAt: {
         type: Date,
         default: Date.now,
         expires: 900, // 15 phút tự động xóa
      },
   },
   { timestamps: false }
);

module.exports = mongoose.model("Token", token);
