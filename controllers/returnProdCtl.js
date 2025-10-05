// controllers/returnProd.controller.js
const mongoose = require("mongoose");
const ReturnProd = require("../models/ReturnProd");
const Assignment = require("../models/Assignment");

/**
 * GET /returns/shortage?userId=...
 * Trả về các assignment của user còn thiếu hàng trả:
 * - assignId, productName, sizeName, image, updatedAt, qty, qtyReturnTotal, qtyShortage
 * Sửa lấy userId từ session sau này
 */
exports.getShortage = async (req, res) => {
   try {
      // Lấy userId từ session
      const userId = req.session?.accId;
      if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
         return res.status(401).json({
            success: false,
            message: "Unauthorized or invalid session",
         });
      }
      const userObjId = new mongoose.Types.ObjectId(userId);

      // Pagination
      const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
      const limit = Math.min(
         Math.max(parseInt(req.query.limit, 10) || 10, 1),
         100
      );
      const skip = (page - 1) * limit;

      // Pipeline chung phần tính thiếu
      const shortageCompute = [
         { $match: { userId: userObjId } },
         {
            $addFields: {
               qty: { $ifNull: ["$qty", 0] },
               qtyReturnTotal: { $ifNull: ["$qtyReturnTotal", 0] },
               qtyShortage: {
                  $subtract: [
                     { $ifNull: ["$qty", 0] },
                     { $ifNull: ["$qtyReturnTotal", 0] },
                  ],
               },
            },
         },
         { $match: { qtyShortage: { $gt: 0 } } },
      ];

      // Pipeline lấy items (có join & phân trang)
      const itemsPipeline = [
         ...shortageCompute,

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

         // Join Product để lấy name & image
         {
            $lookup: {
               from: "products",
               localField: "order.productId",
               foreignField: "_id",
               as: "product",
            },
         },
         { $unwind: { path: "$product", preserveNullAndEmptyArrays: true } },

         // Join Size để lấy size name
         {
            $lookup: {
               from: "sizes",
               localField: "order.sizeId",
               foreignField: "_id",
               as: "sizeDoc",
            },
         },
         { $unwind: { path: "$sizeDoc", preserveNullAndEmptyArrays: true } },

         // Project các field FE cần
         {
            $project: {
               _id: 0,
               assignId: "$_id",
               productName: "$product.name",
               sizeName: "$sizeDoc.name",
               image: "$product.image",
               updatedAt: 1,
               qty: 1,
               qtyReturnTotal: 1,
               qtyShortage: 1,
            },
         },

         // Sắp xếp: mới cập nhật trước
         { $sort: { updatedAt: -1, assignId: 1 } },

         // Phân trang
         { $skip: skip },
         { $limit: limit },
      ];

      // Pipeline đếm tổng (không join)
      const countPipeline = [...shortageCompute, { $count: "total" }];

      const [items, totalArr] = await Promise.all([
         Assignment.aggregate(itemsPipeline),
         Assignment.aggregate(countPipeline),
      ]);

      const total = totalArr?.[0]?.total || 0;

      return res.json({
         success: true,
         message: "Fetched shortage products",
         data: items,
         pagination: { page, limit, total },
      });
   } catch (err) {
      console.error("[getShortage] error:", err);
      return res
         .status(500)
         .json({ success: false, message: "Internal Server Error" });
   }
};

// GET /returns/unconfirm?userId=<optional>
// For admin
exports.getUnconfirmedByUser = async (req, res) => {
   try {
      const { userId } = req.query;

      const matchStage = { isConfirm: false };

      // Lọc theo user nếu có
      if (userId && mongoose.Types.ObjectId.isValid(userId)) {
         matchStage.assignId = { $exists: true }; // placeholder để có $lookup rồi filter sau
      }

      const pipeline = [
         { $match: matchStage },

         // Join Assignment
         {
            $lookup: {
               from: "assignments",
               localField: "assignId",
               foreignField: "_id",
               as: "assign",
            },
         },
         { $unwind: { path: "$assign", preserveNullAndEmptyArrays: false } },

         // Nếu có userId, lọc sau khi đã join
         ...(userId && mongoose.Types.ObjectId.isValid(userId)
            ? [
                 {
                    $match: {
                       "assign.userId": new mongoose.Types.ObjectId(userId),
                    },
                 },
              ]
            : []),

         // Join Account để lấy fullname
         {
            $lookup: {
               from: "accounts",
               localField: "assign.userId",
               foreignField: "_id",
               as: "user",
            },
         },
         { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },

         // Join Order
         {
            $lookup: {
               from: "orders",
               localField: "assign.ordId",
               foreignField: "_id",
               as: "order",
            },
         },
         { $unwind: { path: "$order", preserveNullAndEmptyArrays: true } },

         // Join Product
         {
            $lookup: {
               from: "products",
               localField: "order.productId",
               foreignField: "_id",
               as: "product",
            },
         },
         { $unwind: { path: "$product", preserveNullAndEmptyArrays: true } },

         // Chỉ lấy field cần cho FE
         {
            $project: {
               // khoá nhóm user
               userKey: { $ifNull: ["$user.fullname", "(No Name)"] },
               // item fields
               returnId: "$_id",
               productName: "$product.name",
               qtyAssign: "$assign.qty",
               qtyReturnTotal: "$assign.qtyReturnTotal",
               qty: "$qty",
               updatedAt: 1,
            },
         },

         // Sort để listReturn sau khi $group vẫn giữ đúng thứ tự (oldest first)
         { $sort: { userKey: 1, updatedAt: 1 } },

         // Group theo user
         {
            $group: {
               _id: "$userKey",
               listReturn: {
                  $push: {
                     returnId: "$returnId",
                     productName: "$productName",
                     qtyAssign: "$qtyAssign",
                     qtyReturnTotal: "$qtyReturnTotal",
                     qty: "$qty",
                     updatedAt: "$updatedAt",
                  },
               },
            },
         },

         // Shape output
         {
            $project: {
               _id: 0,
               user: "$_id",
               listReturn: 1,
            },
         },

         // Sort nhóm user theo tên
         { $sort: { user: 1 } },
      ];

      const data = await ReturnProd.aggregate(pipeline);

      return res.json({
         success: true,
         data: data,
      });
   } catch (err) {
      console.error("[getUnconfirmedByUser] error:", err);
      return res
         .status(500)
         .json({ success: false, message: "Internal Server Error" });
   }
};

/**
 * GET /returns/unconfirmuser?userId=<id>&page=1&limit=10
 * - Lấy các return chưa confirm của 1 user
 * - Trả về: [{ productName, sizeName, image, updatedAt, qty }, ...]
 * - Sắp xếp: updatedAt desc (mới nhất lên đầu)
 * - Có phân trang qua page/limit (mặc định page=1, limit=10)
 * - For User
 */
exports.getUnConfirm = async (req, res) => {
   try {
      // Lấy userId từ session
      const userId = req.session?.accId;
      if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
         return res.status(401).json({
            success: false,
            message: "Unauthorized or invalid session",
         });
      }

      // Phân trang (đặt mặc định cho tiện test)
      const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
      const limit = Math.min(
         Math.max(parseInt(req.query.limit, 10) || 10, 1),
         100
      );
      const skip = (page - 1) * limit;

      // Base: chỉ lấy return chưa confirm
      const pipeline = [
         { $match: { isConfirm: false } },

         // Join Assignment để biết user
         {
            $lookup: {
               from: "assignments",
               localField: "assignId",
               foreignField: "_id",
               as: "assign",
            },
         },
         { $unwind: { path: "$assign", preserveNullAndEmptyArrays: false } },
      ];

      // Nếu có userId thì lọc theo user sau khi đã join
      if (userId && mongoose.Types.ObjectId.isValid(userId)) {
         pipeline.push({
            $match: { "assign.userId": new mongoose.Types.ObjectId(userId) },
         });
      }

      // Join Order
      pipeline.push(
         {
            $lookup: {
               from: "orders",
               localField: "assign.ordId",
               foreignField: "_id",
               as: "order",
            },
         },
         { $unwind: { path: "$order", preserveNullAndEmptyArrays: true } }
      );

      // Join Product (lấy name, image)
      pipeline.push(
         {
            $lookup: {
               from: "products",
               localField: "order.productId",
               foreignField: "_id",
               as: "product",
            },
         },
         { $unwind: { path: "$product", preserveNullAndEmptyArrays: true } }
      );

      // Join Size (lấy size name nếu có)
      pipeline.push(
         {
            $lookup: {
               from: "sizes",
               localField: "order.sizeId",
               foreignField: "_id",
               as: "sizeDoc",
            },
         },
         { $unwind: { path: "$sizeDoc", preserveNullAndEmptyArrays: true } }
      );

      // Chỉ giữ field cần thiết
      pipeline.push({
         $project: {
            productName: "$product.name",
            sizeName: "$sizeDoc.name",
            image: "$product.image",
            updatedAt: 1,
            qty: 1,
         },
      });

      // Sắp xếp mới nhất trước
      pipeline.push({ $sort: { updatedAt: -1 } });

      // Pipeline cho dữ liệu + đếm tổng
      const dataPipeline = [...pipeline, { $skip: skip }, { $limit: limit }];
      const countPipeline = [...pipeline, { $count: "total" }];

      const [items, totalArr] = await Promise.all([
         ReturnProd.aggregate(dataPipeline),
         ReturnProd.aggregate(countPipeline),
      ]);

      const total = totalArr?.[0]?.total || 0;

      return res.json({
         success: true,
         message: "Fetched unconfirmed return products",
         data: items,
         pagination: { page, limit, total },
      });
   } catch (err) {
      console.error("[getUnConfirm] error:", err);
      return res
         .status(500)
         .json({ success: false, message: "Internal Server Error" });
   }
};

// POST /admin/returns/confirm
exports.confirmReturns = async (req, res) => {
   const session = await mongoose.startSession();
   try {
      const { ids } = req.body || {};

      // 1) Validate input cơ bản
      if (!Array.isArray(ids) || ids.length === 0) {
         return res
            .status(400)
            .json({ success: false, message: "Invalid return product list" });
      }

      // Gom theo id, qty có thể = 0 (ý nghĩa: xóa record ReturnProd này)
      const reqMap = new Map(); // id -> totalQtyAccepted
      for (const it of ids) {
         const id = String(it?.id || "").trim();
         const q = Number(it?.qty);
         if (
            !mongoose.Types.ObjectId.isValid(id) ||
            !Number.isFinite(q) ||
            q < 0
         ) {
            return res.status(400).json({
               success: false,
               message: "Invalid id/quantity exists (quantity must be >= 0)",
            });
         }
         reqMap.set(id, (reqMap.get(id) || 0) + q);
      }

      const idList = [...reqMap.keys()];
      const zeroIds = idList.filter((id) => (reqMap.get(id) || 0) === 0); // sẽ xóa
      const posIds = idList.filter((id) => (reqMap.get(id) || 0) > 0); // sẽ confirm

      // 2) Lấy các record tương ứng
      const docs = await ReturnProd.find(
         { _id: { $in: idList } },
         { _id: 1, assignId: 1, isConfirm: 1 }
      ).lean();

      // Thiếu bản ghi?
      if (docs.length !== idList.length) {
         const found = new Set(docs.map((d) => String(d._id)));
         const notFound = idList.filter((id) => !found.has(id));
         return res.status(400).json({
            success: false,
            message: "Some ids do not exist",
            data: notFound,
         });
      }

      // Không cho đụng vào bản ghi đã confirm (dù qty = 0 hay > 0)
      const alreadyConfirmed = docs
         .filter((d) => d.isConfirm)
         .map((d) => String(d._id));
      if (alreadyConfirmed.length) {
         return res.status(400).json({
            success: false,
            message: "Some records have been confirmed previously",
            data: alreadyConfirmed,
         });
      }

      // Tách docs theo zero/pos
      const zeroDocs = docs.filter((d) => zeroIds.includes(String(d._id)));
      const posDocs = docs.filter((d) => posIds.includes(String(d._id)));

      // 3) Chuẩn bị cộng dồn vào Assignment theo qty được DUYỆT (chỉ với posDocs)
      const incByAssign = new Map(); // assignId -> totalAcceptedQty
      for (const d of posDocs) {
         const accepted = reqMap.get(String(d._id)) || 0;
         const key = String(d.assignId);
         incByAssign.set(key, (incByAssign.get(key) || 0) + accepted);
      }

      // 4) Transaction
      await session.withTransaction(async () => {
         // 4a) Confirm các posDocs: set qty = acceptedQty, isConfirm = true
         if (posDocs.length > 0) {
            const rpOps = posDocs.map((d) => ({
               updateOne: {
                  filter: { _id: d._id, isConfirm: false }, // chặn race-condition
                  update: {
                     $set: { qty: reqMap.get(String(d._id)), isConfirm: true },
                  },
               },
            }));
            const rpRes = await ReturnProd.bulkWrite(rpOps, {
               session,
               ordered: false,
            });
            const modified =
               rpRes?.modifiedCount ?? rpRes?.result?.nModified ?? 0;
            if (modified !== posDocs.length) {
               throw new Error(
                  "Inconsistent confirmation (some records have changed status)"
               );
            }
         }

         // 4b) Xóa các zeroDocs (qty=0) nếu chưa confirm
         if (zeroDocs.length > 0) {
            const delRes = await ReturnProd.deleteMany(
               { _id: { $in: zeroDocs.map((d) => d._id) }, isConfirm: false },
               { session }
            );
            const deleted = delRes?.deletedCount ?? 0;
            if (deleted !== zeroDocs.length) {
               throw new Error(
                  "Inconsistent deletion (some records are no longer in unconfirmed state)"
               );
            }
         }

         // 4c) Cộng dồn Assignment.qtyReturnTotal theo acceptedQty (chỉ posDocs)
         if (incByAssign.size > 0) {
            const asgOps = [];
            for (const [assignId, totalQty] of incByAssign.entries()) {
               asgOps.push({
                  updateOne: {
                     filter: { _id: new mongoose.Types.ObjectId(assignId) },
                     update: { $inc: { qtyReturnTotal: totalQty } },
                  },
               });
            }
            await Assignment.bulkWrite(asgOps, { session, ordered: false });
         }
      });

      return res.json({
         success: true,
         message: `Confirmed ${posDocs.length} record and deleted ${zeroDocs.length} record.`,
      });
   } catch (err) {
      console.error("[confirmReturns] error:", err);
      return res
         .status(500)
         .json({ success: false, message: "Internal Server Error" });
   } finally {
      session.endSession();
   }
};

/**
 * POST /returns
 * Body: [{ assignId, qty, note? }, ...]
 *
 * - Không validate chi tiết (qty > 0…): middleware lo
 * - BẮT BUỘC kiểm tra assignId tồn tại
 * - Nếu bất kỳ lỗi nào: trả lỗi và KHÔNG lưu gì cả
 */
exports.createReturnProds = async (req, res) => {
   const session = await mongoose.startSession();
   try {
      const items = req.body;
      if (!items.length) {
         return res.status(400).json({ success: false, message: "Empty data" });
      }

      // Gom & kiểm tra assignId tồn tại
      const assignIds = [
         ...new Set(
            items
               .map((it) =>
                  it && it.assignId ? String(it.assignId).trim() : ""
               )
               .filter(Boolean)
         ),
      ];

      if (!assignIds.length) {
         return res
            .status(400)
            .json({ success: false, message: "Assignment id error" });
      }

      // Tồn tại trong Assignment?
      const assigns = await Assignment.find(
         { _id: { $in: assignIds } },
         { _id: 1 }
      ).lean();
      const foundSet = new Set(assigns.map((a) => String(a._id)));
      const notFound = assignIds.filter((id) => !foundSet.has(id));

      if (notFound.length) {
         return res.status(400).json({
            success: false,
            message: "Some Assignment Id does not exist",
            data: notFound,
         });
      }

      // Chuẩn bị docs để insert
      const docs = items.map((it) => ({
         assignId: it.assignId,
         qty: it.qty,
         note: it.note || "",
         // isConfirm & isPayment dùng default của schema (false)
      }));

      // Transaction để đảm bảo all-or-nothing
      let inserted;
      await session.withTransaction(async () => {
         inserted = await ReturnProd.insertMany(docs, {
            ordered: true,
            session,
         });
      });

      return res.json({
         success: true,
         message: `${inserted.length} return record(s) successfully sent`,
      });
   } catch (err) {
      console.error("[createReturnProds] error:", err);
      return res
         .status(500)
         .json({ success: false, message: "Internal Server Error" });
   } finally {
      session.endSession();
   }
};

// patch /returns/unconfirm
// Body: [{ returnId, qty }, ...]
// - qty = 0 nghĩa là xoá record đó
// - Không cho sửa record đã confirm
// - Nếu có lỗi gì thì không sửa/xoá gì cả
exports.editReturnProds = async (req, res) => {
   const session = await mongoose.startSession();
   try {
      const items = Array.isArray(req.body) ? req.body : [];
      if (items.length === 0) {
         return res.status(400).json({ success: false, message: "Empty data" });
      }

      // Gom theo returnId (nếu trùng id thì lấy giá trị cuối)
      const map = new Map(); // returnId -> qty
      for (const it of items) {
         const id = String(it?.returnId || "").trim();
         const qty = Number(it?.qty);
         if (!mongoose.Types.ObjectId.isValid(id)) {
            return res
               .status(400)
               .json({ success: false, message: "Invalid returnId format" });
         }
         if (!Number.isFinite(qty) || qty < 0) {
            return res
               .status(400)
               .json({ success: false, message: "Invalid qty" });
         }
         map.set(id, qty);
      }

      const ids = [...map.keys()].map((id) => new mongoose.Types.ObjectId(id));

      // Lấy các doc để kiểm tra tồn tại + trạng thái isConfirm
      const docs = await ReturnProd.find({ _id: { $in: ids } })
         .select("_id isConfirm")
         .lean();

      // Thiếu bản ghi?
      const foundSet = new Set(docs.map((d) => String(d._id)));
      const notFound = ids.map(String).filter((id) => !foundSet.has(id));
      if (notFound.length) {
         return res.status(400).json({
            success: false,
            message: "Some returnIds do not exist",
         });
      }

      // Có bản ghi đã confirm?
      const confirmed = docs
         .filter((d) => d.isConfirm)
         .map((d) => String(d._id));
      if (confirmed.length) {
         return res.status(400).json({
            success: false,
            message:
               "Some return records are already confirmed and cannot be edited",
         });
      }

      // Chuẩn bị bulk ops:
      // - qty === 0  => delete (chỉ xóa khi isConfirm=false để tránh race)
      // - qty > 0    => update qty (chỉ update khi isConfirm=false để tránh race)
      const ops = [];
      for (const [idStr, qty] of map.entries()) {
         const _id = new mongoose.Types.ObjectId(idStr);
         if (qty === 0) {
            ops.push({ deleteOne: { filter: { _id, isConfirm: false } } });
         } else {
            ops.push({
               updateOne: {
                  filter: { _id, isConfirm: false },
                  update: { $set: { qty } },
               },
            });
         }
      }

      // All-or-nothing qua transaction
      await session.withTransaction(async () => {
         const result = await ReturnProd.bulkWrite(ops, {
            session,
            ordered: true,
         });

         const expectedDeletes = ops.filter((o) => o.deleteOne).length;
         const expectedUpdates = ops.filter((o) => o.updateOne).length;

         const deleted = result?.deletedCount ?? 0;
         const matched = result?.matchedCount ?? 0;

         // Nếu có race-condition (ai đó vừa confirm), matched/deleted có thể thiếu -> rollback
         if (deleted !== expectedDeletes || matched !== expectedUpdates) {
            throw new Error(
               "Partial apply detected (some records changed state), rolling back"
            );
         }
      });

      return res.json({
         success: true,
         message: "Return products updated successfully",
      });
   } catch (err) {
      console.error("[editReturnProds] error:", err);
      return res
         .status(500)
         .json({ success: false, message: "Internal Server Error" });
   } finally {
      session.endSession();
   }
};

/**
 * DELETE /returns/:id
 * - Xóa 1 bản ghi ReturnProd nếu tồn tại và isConfirm = false
 */
exports.deleteReturnProd = async (req, res) => {
   try {
      const { id } = req.params;

      // 1. Kiểm tra bản ghi tồn tại
      const record = await ReturnProd.findById(id).lean();
      if (!record) {
         return res
            .status(404)
            .json({ success: false, message: "Return record not found" });
      }

      // 2. Chỉ xóa khi chưa confirm
      if (record.isConfirm) {
         return res.status(400).json({
            success: false,
            message: "Confirmed return cannot be deleted",
         });
      }

      // 3. Xóa
      await ReturnProd.deleteOne({ _id: id });

      return res.json({
         success: true,
         message: `Return record ${id} deleted successfully`,
      });
   } catch (err) {
      console.error("[deleteReturnProd] error:", err);
      return res
         .status(500)
         .json({ success: false, message: "Internal Server Error" });
   }
};
