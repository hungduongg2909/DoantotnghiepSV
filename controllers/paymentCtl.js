// controllers/payment.controller.js
const mongoose = require("mongoose");
const ReturnProd = require("../models/ReturnProd");
const Assignment = require("../models/Assignment");
const Account = require("../models/Account");
const Payment = require("../models/Payment");
const Delivery = require("../models/Delivery");
const Difficulty = require("../models/Difficulty");
const Category = require("../models/Category");
const Size = require("../models/Size");
const Order = require("../models/Order");
const Product = require("../models/Product");

// USER: GET /payments/user?page=1&limit=10
// ADMIN: GET /payments?userId=xxx&page=1&limit=10
exports.previewPaymentByUser = async (req, res) => {
   try {
      // ---- Parse pagination ----
      const pageRaw = parseInt(req.query.page, 10);
      const limitRaw = parseInt(req.query.limit, 10);
      const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
      const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : 10;
      const skip = (page - 1) * limit;

      // ---- Lấy userObjId từ session/role ----
      let userObjId;

      if (!req.session || !req.session.accId) {
         return res.status(401).json({
            success: false,
            message: "Unauthorized",
         });
      }

      if (req.session.role === 1) {
         const { userId } = req.query || {};
         if (!mongoose.Types.ObjectId.isValid(userId)) {
            return res
               .status(400)
               .json({ success: false, message: "userId không hợp lệ" });
         }
         userObjId = new mongoose.Types.ObjectId(userId);
      } else {
         const userId = req.session.accId;
         if (!mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({
               success: false,
               message: "Session userId không hợp lệ",
            });
         }
         userObjId = new mongoose.Types.ObjectId(userId);
      }

      // ---- Tên collection thực tế ----
      const ASSIGNMENTS = Assignment.collection.name;
      const ORDERS = Order.collection.name;
      const PRODUCTS = Product.collection.name;
      const CATEGORIES = Category.collection.name;
      const SIZES = Size.collection.name;
      const DIFFICULTIES = Difficulty.collection.name;

      const pipeline = [
         // 1) ReturnProd chưa thanh toán & đã confirm
         { $match: { isPayment: false, isConfirm: true } },

         // 2) Join Assignment và lọc theo user
         {
            $lookup: {
               from: ASSIGNMENTS,
               localField: "assignId",
               foreignField: "_id",
               as: "assignment",
            },
         },
         { $unwind: "$assignment" },
         { $match: { "assignment.userId": userObjId } },

         // 3) Join Order
         {
            $lookup: {
               from: ORDERS,
               localField: "assignment.ordId",
               foreignField: "_id",
               as: "order",
            },
         },
         { $unwind: "$order" },

         // 4) Join Product
         {
            $lookup: {
               from: PRODUCTS,
               localField: "order.productId",
               foreignField: "_id",
               as: "product",
            },
         },
         { $unwind: "$product" },

         // 5) Join Category
         {
            $lookup: {
               from: CATEGORIES,
               localField: "product.categoryId",
               foreignField: "_id",
               as: "category",
            },
         },
         { $unwind: "$category" },

         // 6) Join Size (có thể null)
         {
            $lookup: {
               from: SIZES,
               localField: "order.sizeId",
               foreignField: "_id",
               as: "size",
            },
         },
         { $unwind: { path: "$size", preserveNullAndEmptyArrays: true } },

         // 7) Join Difficulty (có thể null)
         {
            $lookup: {
               from: DIFFICULTIES,
               localField: "product.difficultyId",
               foreignField: "_id",
               as: "difficulty",
            },
         },
         { $unwind: { path: "$difficulty", preserveNullAndEmptyArrays: true } },

         // 8) $facet: data (có paginate), total (đếm), và các phần preview
         {
            $facet: {
               // ----- DATA cho bảng (phân trang ở đây) -----
               data: [
                  {
                     $project: {
                        _id: 0,
                        id: "$_id",
                        productName: "$product.name",
                        sizeName: { $ifNull: ["$size.name", null] },
                        qty: "$qty",
                        updatedAt: "$updatedAt",
                     },
                  },
                  { $sort: { updatedAt: -1 } },
                  { $skip: skip },
                  { $limit: limit },
               ],

               // ----- TOTAL cho data (đếm sau cùng các filter ở trên) -----
               dataTotal: [{ $count: "total" }],

               // ----- Tổng theo CATEGORY -----
               categoriesTotal: [
                  {
                     $group: {
                        _id: "$category._id",
                        category: { $first: "$category.name" },
                        categoryType: { $first: "$category.type" },
                        basePrice: { $first: "$category.basePrice" },
                        qty: { $sum: "$qty" },
                     },
                  },
                  {
                     $project: {
                        _id: 0,
                        categoryId: "$_id",
                        category: 1,
                        categoryType: 1,
                        basePrice: 1,
                        qty: 1,
                     },
                  },
                  { $sort: { category: 1 } },
               ],

               // ----- SIZE[] theo CATEGORY -----
               sizesByCategory: [
                  { $match: { size: { $ne: null } } },
                  {
                     $group: {
                        _id: {
                           categoryId: "$category._id",
                           sizeId: "$size._id",
                        },
                        name: { $first: "$size.name" },
                        bonusAmount: { $first: "$size.bonusAmount" },
                        qty: { $sum: "$qty" },
                     },
                  },
                  { $sort: { name: 1 } },
                  {
                     $group: {
                        _id: "$_id.categoryId",
                        items: {
                           $push: {
                              name: "$name",
                              qty: "$qty",
                              bonusAmount: "$bonusAmount",
                           },
                        },
                     },
                  },
                  { $project: { _id: 0, categoryId: "$_id", items: 1 } },
               ],

               // ----- DIFFICULT[] theo CATEGORY -----
               difficultiesByCategory: [
                  { $match: { difficulty: { $ne: null } } },
                  {
                     $addFields: {
                        diffBonusForType: {
                           $let: {
                              vars: {
                                 t: "$category.type",
                                 b: "$difficulty.bonusAmount",
                              },
                              in: {
                                 $ifNull: [
                                    {
                                       $getField: {
                                          input: "$$b",
                                          field: "$$t",
                                       },
                                    },
                                    0,
                                 ],
                              },
                           },
                        },
                     },
                  },
                  {
                     $group: {
                        _id: {
                           categoryId: "$category._id",
                           difficultyId: "$difficulty._id",
                        },
                        name: { $first: "$difficulty.name" },
                        qty: { $sum: "$qty" },
                        bonusAmount: { $first: "$diffBonusForType" },
                     },
                  },
                  { $sort: { name: 1 } },
                  {
                     $group: {
                        _id: "$_id.categoryId",
                        items: {
                           $push: {
                              name: "$name",
                              qty: "$qty",
                              bonusAmount: "$bonusAmount",
                           },
                        },
                     },
                  },
                  { $project: { _id: 0, categoryId: "$_id", items: 1 } },
               ],
            },
         },

         // 9) Lắp ráp preview đúng format yêu cầu; giữ lại cả data & dataTotal để đọc total ở ngoài
         {
            $project: {
               data: 1,
               dataTotal: 1,
               preview: {
                  $map: {
                     input: "$categoriesTotal",
                     as: "c",
                     in: {
                        category: "$$c.category",
                        qty: "$$c.qty",
                        basePrice: "$$c.basePrice",

                        size: {
                           $let: {
                              vars: {
                                 s: {
                                    $first: {
                                       $filter: {
                                          input: "$sizesByCategory",
                                          as: "s",
                                          cond: {
                                             $eq: [
                                                "$$s.categoryId",
                                                "$$c.categoryId",
                                             ],
                                          },
                                       },
                                    },
                                 },
                              },
                              in: { $ifNull: ["$$s.items", []] },
                           },
                        },

                        difficult: {
                           $let: {
                              vars: {
                                 d: {
                                    $first: {
                                       $filter: {
                                          input: "$difficultiesByCategory",
                                          as: "d",
                                          cond: {
                                             $eq: [
                                                "$$d.categoryId",
                                                "$$c.categoryId",
                                             ],
                                          },
                                       },
                                    },
                                 },
                              },
                              in: { $ifNull: ["$$d.items", []] },
                           },
                        },
                     },
                  },
               },
            },
         },
      ];

      const [result] = await ReturnProd.aggregate(pipeline);

      const total =
         (result &&
            Array.isArray(result.dataTotal) &&
            result.dataTotal[0]?.total) ||
         0;

      return res.status(200).json({
         success: true,
         message: "Lấy dữ liệu preview thanh toán thành công",
         preview: result?.preview ?? [],
         data: result?.data ?? [],
         pagination: { page, limit, total },
      });
   } catch (err) {
      console.error("getPaymentPreview error:", err);
      return res.status(500).json({
         success: false,
         message: "Lỗi máy chủ khi lấy dữ liệu preview thanh toán",
      });
   }
};

// ADMIN: POST /payments
exports.savePayment = async (req, res) => {
   const session = await mongoose.startSession();
   try {
      const { username, grandTotal, note, products, listIdReturn } =
         req.body || {};

      // console.log(req.body)

      // 1) Check user exists
      const user = await Account.findOne({ username: username })
         .select("_id username fullname")
         .lean();
      if (!user) {
         return res.status(400).json({
            success: false,
            message: "User not found by username",
         });
      }

      // 2) Validate products 
      if (!Array.isArray(products) || products.length === 0) {
         return res.status(400).json({
            success: false,
            message: "Products is empty or invalid",
         });
      }
      const prodErrors = [];
      const cleanProducts = products.map((p, i) => {
         const category =
            typeof p.category === "string" ? p.category.trim() : "";
         const qty = Number(p.qty);
         const total = Number(p.total);
         if (!category) prodErrors.push(`products[${i}].category is required`);
         if (!Number.isFinite(qty) || qty < 0)
            prodErrors.push(`products[${i}].qty must be a non-negative number`);
         if (!Number.isFinite(total) || total < 0)
            prodErrors.push(
               `products[${i}].total must be a non-negative number`
            );

         const sizeArr = Array.isArray(p.size) ? p.size : [];
         const cleanSize = sizeArr.map((s, j) => {
            const name = typeof s.name === "string" ? s.name.trim() : "";
            const sQty = Number(s.qty);
            const sTotal = Number(s.total);
            if (!Number.isFinite(sQty) || sQty < 0)
               prodErrors.push(
                  `products[${i}].size[${j}].qty must be a non-negative number`
               );
            if (!Number.isFinite(sTotal) || sTotal < 0)
               prodErrors.push(
                  `products[${i}].size[${j}].total must be a non-negative number`
               );
            return { name, qty: sQty, total: sTotal };
         });

         const diffArr = Array.isArray(p.difficult) ? p.difficult : [];
         const cleanDiff = diffArr.map((d, j) => {
            const name = typeof d.name === "string" ? d.name.trim() : "";
            const dQty = Number(d.qty);
            const dTotal = Number(d.total);
            if (!Number.isFinite(dQty) || dQty < 0)
               prodErrors.push(
                  `products[${i}].difficult[${j}].qty must be a non-negative number`
               );
            if (!Number.isFinite(dTotal) || dTotal < 0)
               prodErrors.push(
                  `products[${i}].difficult[${j}].total must be a non-negative number`
               );
            return { name, qty: dQty, total: dTotal };
         });

         return { category, qty, total, size: cleanSize, difficult: cleanDiff };
      });
      if (prodErrors.length) {
         return res.status(400).json({
            success: false,
            message: "Invalid products payload",
            errors: prodErrors,
         });
      }

      // 3) Validate listIdReturn
      if (!Array.isArray(listIdReturn) || listIdReturn.length === 0) {
         return res.status(400).json({
            success: false,
            message: "listIdReturn is empty or invalid",
         });
      }
      const ids = [...new Set(listIdReturn.map(String))];
      const invalidIds = ids.filter(
         (id) => !mongoose.Types.ObjectId.isValid(id)
      );
      if (invalidIds.length) {
         return res.status(400).json({
            success: false,
            message: "Invalid id exists in listIdReturn",
            data: invalidIds,
         });
      }

      // 4) Pre-check ReturnProd thuộc user + đã confirm + chưa payment
      const rpDocs = await ReturnProd.aggregate([
         {
            $match: {
               _id: { $in: ids.map((x) => new mongoose.Types.ObjectId(x)) },
            },
         },
         {
            $lookup: {
               from: Assignment.collection.name, // "assignments"
               localField: "assignId",
               foreignField: "_id",
               as: "assign",
            },
         },
         { $unwind: { path: "$assign", preserveNullAndEmptyArrays: false } },
         {
            $match: {
               isConfirm: true,
               isPayment: false,
               "assign.userId": user._id,
            },
         },
         { $project: { _id: 1 } },
      ]);

      if (rpDocs.length !== ids.length) {
         const okIds = new Set(rpDocs.map((d) => String(d._id)));
         const missed = ids.filter((id) => !okIds.has(id));
         return res.status(400).json({
            success: false,
            message:
               "Some ids do not belong to the user or have not been confirmed/paid",
            data: missed,
         });
      }

      // 5) Transaction: update ReturnProd + create Payment
      let savedPayment = null;
      await session.withTransaction(async () => {
         const upd = await ReturnProd.updateMany(
            {
               _id: { $in: ids.map((x) => new mongoose.Types.ObjectId(x)) },
               isConfirm: true,
               isPayment: false,
            },
            { $set: { isPayment: true } },
            { session }
         );
         const modified = upd?.modifiedCount ?? upd?.nModified ?? 0;
         if (modified !== ids.length) {
            // Có sự thay đổi race-condition -> abort
            throw new Error(
               "Some ReturnProd records changed during processing. Please try again."
            );
         }

         const created = await Payment.create(
            [
               {
                  username: username,
                  products: cleanProducts,
                  grandTotal: Number(grandTotal), // đã có middleware validate
                  note: typeof note === "string" ? note.trim() : "",
               },
            ],
            { session }
         );
         savedPayment = created?.[0] || null;
         if (!savedPayment) {
            throw new Error("Failed to create Payment document");
         }
      });

      return res.status(201).json({
         success: true,
         message: `Payment saved for user ${user.fullname || user.username}`,
         paymentId: savedPayment._id,
         updatedCount: ids.length,
         grandTotal: Number(grandTotal),
      });
   } catch (err) {
      console.error("[savePayment] error:", err);
      return res.status(500).json({
         success: false,
         message: "Internal Server Error",
      });
   } finally {
      session.endSession();
   }
};

// ADMIN: GET /admin/payments/stats?year=2025&month=1
exports.getStats = async (req, res) => {
   try {
      // --- Validate query ---
      const year = parseInt(req.query.year, 10);
      const month =
         req.query.month != null ? parseInt(req.query.month, 10) : null;

      // --- Tính mốc thời gian ---
      // Nếu có month: [YYYY-MM-01, YYYY-(MM+1)-01); nếu không: [YYYY-01-01, (YYYY+1)-01-01)
      const start = month
         ? new Date(year, month - 1, 1, 0, 0, 0, 0)
         : new Date(year, 0, 1, 0, 0, 0, 0);
      const end = month
         ? new Date(year, month, 1, 0, 0, 0, 0)
         : new Date(year + 1, 0, 1, 0, 0, 0, 0);

      // --- Aggregation: Payment (tổng grandTotal theo updatedAt) ---
      const paymentAgg = await Payment.aggregate([
         { $match: { updatedAt: { $gte: start, $lt: end } } },
         {
            $group: {
               _id: null,
               totalPaid: { $sum: { $ifNull: ["$grandTotal", 0] } },
            },
         },
      ]);
      const totalPaid = paymentAgg?.[0]?.totalPaid || 0;

      // --- Aggregation: Delivery (tổng qty đã xuất theo updatedAt) ---
      const deliveryAgg = await Delivery.aggregate([
         { $match: { updatedAt: { $gte: start, $lt: end } } },
         { $unwind: "$products" },
         {
            $group: {
               _id: null,
               totalShippedQty: { $sum: { $ifNull: ["$products.qty", 0] } },
            },
         },
      ]);
      const totalShippedQty = deliveryAgg?.[0]?.totalShippedQty || 0;

      return res.json({
         success: true,
         period: {
            year,
            ...(month ? { month } : {}),
            from: start,
            to: end,
         },
         data: {
            totalPaid, // Tổng tiền đã thanh toán (Payment)
            totalShippedQty, // Tổng số lượng hàng đã xuất (Delivery)
         },
      });
   } catch (err) {
      console.error("[getTotalsByPeriod] error:", err);
      return res
         .status(500)
         .json({ success: false, message: "Internal Server Error" });
   }
};
