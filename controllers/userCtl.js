const Account = require("../models/Account");

exports.getAllUsers = async (req, res) => {
   try {
      const users = await Account.find({ role: 0 }).select("-password").lean();
      return res.status(200).json({
         success: true,
         message: "Get all users successfully",
         data: users,
      });
   } catch (error) {
      console.error("=== GET ALL USERS ERROR ===");
      console.error("Error:", error);
      return res.status(500).json({
         success: false,
         message: "Internal server error",
      });
   }
};
