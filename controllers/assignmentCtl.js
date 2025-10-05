const mongoose = require("mongoose");
const Assignment = require("../models/Assignment");
const Order = require("../models/Order");
const Account = require("../models/Account");

// escape regex an toàn cho tìm kiếm
function escapeRegex(str = "") {
   return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

exports.getAvailableForDelivery = async (req, res) => {
   try {
      // Phân trang
      const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
      const limit = Math.min(
         Math.max(parseInt(req.query.limit, 10) || 10, 1),
         100
      );
      const skip = (page - 1) * limit;

      // Từ khóa search (tìm theo tên sản phẩm)
      const rawSearch = (req.query.search || "").trim();
      const hasSearch = rawSearch.length > 0;
      const searchRegex = hasSearch
         ? new RegExp(escapeRegex(rawSearch), "i")
         : null;

      // Tính available = qtyReturnTotal - qtyDelivery (coi null = 0)
      const computeAvailableStage = {
         $addFields: {
            qtyReturnTotal: { $ifNull: ["$qtyReturnTotal", 0] },
            qtyDelivery: { $ifNull: ["$qtyDelivery", 0] },
            available: {
               $subtract: [
                  { $ifNull: ["$qtyReturnTotal", 0] },
                  { $ifNull: ["$qtyDelivery", 0] },
               ],
            },
         },
      };

      const matchStage = { $match: { available: { $gt: 0 } } };

      // Base pipeline cho data
      const pipeline = [
         computeAvailableStage,
         matchStage,

         // Join Order
         {
            $lookup: {
               from: "orders",
               localField: "ordId",
               foreignField: "_id",
               as: "order",
            },
         },
         { $unwind: { path: "$order", preserveNullAndEmptyArrays: false } },

         // Join User (Account) để lấy fullname
         {
            $lookup: {
               from: "accounts",
               localField: "userId",
               foreignField: "_id",
               as: "user",
            },
         },
         { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },

         // Join Product để lấy name
         {
            $lookup: {
               from: "products",
               localField: "order.productId",
               foreignField: "_id",
               as: "product",
            },
         },
         { $unwind: { path: "$product", preserveNullAndEmptyArrays: true } },

         // Join Size để lấy size name từ order.sizeId
         {
            $lookup: {
               from: "sizes",
               localField: "order.sizeId",
               foreignField: "_id",
               as: "sizeDoc",
            },
         },
         { $unwind: { path: "$sizeDoc", preserveNullAndEmptyArrays: true } },
      ];

      // Thêm lọc theo product.name nếu có search
      if (hasSearch) {
         pipeline.push({ $match: { "product.name": searchRegex } });
      }

      // Project các field cần cho FE
      pipeline.push(
         {
            $project: {
               //id: "$_id"
               fullname: "$user.fullname",
               productName: "$product.name",
               size: "$sizeDoc.name",
               qtyOrder: "$order.qty",
               qtyAssign: "$qty",
               qtyDelivery: 1,
               available: 1,
               deadline: "$order.deadline",
            },
         },
         // Sắp xếp theo deadline (gần hạn lên trước)
         { $sort: { deadline: 1 } },
         { $skip: skip },
         { $limit: limit }
      );

      // Pipeline đếm tổng
      const countPipeline = [
         computeAvailableStage,
         matchStage,

         // cần join product để lọc theo tên khi search
         {
            $lookup: {
               from: "orders",
               localField: "ordId",
               foreignField: "_id",
               as: "order",
            },
         },
         { $unwind: { path: "$order", preserveNullAndEmptyArrays: false } },
         {
            $lookup: {
               from: "products",
               localField: "order.productId",
               foreignField: "_id",
               as: "product",
            },
         },
         { $unwind: { path: "$product", preserveNullAndEmptyArrays: true } },
      ];

      if (hasSearch) {
         countPipeline.push({ $match: { "product.name": searchRegex } });
      }

      countPipeline.push({ $count: "total" });

      const [items, totalArr] = await Promise.all([
         Assignment.aggregate(pipeline),
         Assignment.aggregate(countPipeline),
      ]);

      const total = totalArr?.[0]?.total || 0;

      return res.json({
         success: true,
         data: items,
         pagination: { page, limit, total },
      });
   } catch (err) {
      console.error("[getAvailableForDelivery] error:", err);
      return res
         .status(500)
         .json({ success: false, message: "Internal Server Error" });
   }
};

// GET /admin/assignments/pending?page=1&limit=10&userId=<optional>&po=<optional>&q=<optional>
exports.getPendingAssignments = async (req, res) => {
   try {
      const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
      const limit = Math.min(
         Math.max(parseInt(req.query.limit, 10) || 10, 1),
         100
      );

      const skip = (page - 1) * limit;

      const { userId, po, q } = req.query;

      const matchStage = {
         $expr: { $lt: ["$qtyReturnTotal", "$qty"] },
      };

      if (userId && mongoose.Types.ObjectId.isValid(userId)) {
         matchStage.userId = new mongoose.Types.ObjectId(userId);
      }

      const pipeline = [
         { $match: matchStage },
         {
            $lookup: {
               from: "orders",
               localField: "ordId",
               foreignField: "_id",
               as: "order",
            },
         },
         { $unwind: "$order" },

         ...(po ? [{ $match: { "order.po": po } }] : []),
         ...(q
            ? [{ $match: { "order.po": { $regex: q, $options: "i" } } }]
            : []),

         {
            $lookup: {
               from: "accounts",
               localField: "userId",
               foreignField: "_id",
               as: "user",
            },
         },
         { $unwind: "$user" },

         {
            $lookup: {
               from: "products",
               localField: "order.productId",
               foreignField: "_id",
               as: "product",
            },
         },
         { $unwind: "$product" },

         {
            $lookup: {
               from: "sizes",
               localField: "order.sizeId",
               foreignField: "_id",
               as: "size",
            },
         },
         { $unwind: { path: "$size", preserveNullAndEmptyArrays: true } },

         {
            $project: {
               _id: 1,
               fullname: "$user.fullname",
               productName: "$product.name",
               sizeName: "$size.name",
               qty: 1,
               qtyReturnTotal: 1,
               deadline: "$order.deadline",
            },
         },

         { $sort: { deadline: 1, _id: 1 } },
         {
            $facet: {
               items: [{ $skip: skip }, { $limit: limit }],
               totalRows: [{ $count: "count" }],
            },
         },
         {
            $project: {
               items: 1,
               total: {
                  $ifNull: [{ $arrayElemAt: ["$totalRows.count", 0] }, 0],
               },
            },
         },
      ];

      const [result] = await Assignment.aggregate(pipeline);
      return res.json({
         success: true,
         data: result?.items || [],
         pagination: {
            page,
            limit,
            total: result?.total || 0,
         },
      });
   } catch (err) {
      console.error("[getPendingAssignments] error:", err);
      return res
         .status(500)
         .json({ success: false, message: "Internal Server Error" });
   }
};

// POST /assignments
exports.bulkAssign = async (req, res) => {
   try {
      const { userId, items } = req.body || {};

      if (
         !mongoose.Types.ObjectId.isValid(userId) ||
         !Array.isArray(items) ||
         items.length === 0
      ) {
         return res.status(400).json({
            success: false,
            message: "There is an unknown error with the assign list or user.",
         });
      }

      const user = await Account.findById(userId).select("fullname").lean();
      if (!user || !user.fullname) {
         return res.status(400).json({
            success: false,
            message: "User not found",
         });
      }

      // Tiền kiểm tất cả item
      for (const it of items) {
         if (
            !it ||
            !mongoose.isValidObjectId(it.ordId) ||
            !Number.isFinite(Number(it.qty)) ||
            Number(it.qty) <= 0
         ) {
            return res.status(400).json({
               success: false,
               message: "Invalid Item Quantity / User",
            });
         }
      }

      // Chuẩn bị bulk ops
      const assignmentOps = [];
      const orderOps = [];

      for (const it of items) {
         const qty = Number(it.qty);

         // Upsert Assignment
         assignmentOps.push({
            updateOne: {
               filter: { ordId: it.ordId, userId },
               update: { $inc: { qty } },
               upsert: true,
            },
         });

         // Cập nhật Order.qtyAssignTotal (cộng thêm qty)
         orderOps.push({
            updateOne: {
               filter: { _id: it.ordId },
               update: { $inc: { qtyAssignTotal: qty } },
            },
         });
      }

      // Thực thi song song
      await Promise.all([
         Assignment.bulkWrite(assignmentOps, { ordered: false }),
         Order.bulkWrite(orderOps, { ordered: false }),
      ]);

      return res.json({
         success: true,
         message: `Assign ${items.length} Order to ${user.fullname}`,
      });
   } catch (err) {
      console.error("[bulkAssign] error:", err);
      return res
         .status(500)
         .json({ success: false, message: "Internal Server Error" });
   }
};
