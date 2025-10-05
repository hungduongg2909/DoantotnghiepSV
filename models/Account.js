const mongoose = require("mongoose");

const accountSchema = new mongoose.Schema(
   {
      username: { type: String, required: true, unique: true },
      email: { type: String, required: true, unique: true },
      password: { type: String, required: true },
      fullname: { type: String, required: true },
      phone: { type: String },
      // 0 = user, 1 = admin
      role: { type: Number, enum: [0, 1], default: 0 },
   },
   { timestamps: true }
);

module.exports = mongoose.model("Account", accountSchema);
