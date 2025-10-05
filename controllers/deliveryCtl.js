// controllers/delivery.controller.js
const mongoose = require("mongoose");
const Assignment = require("../models/Assignment");
const Order = require("../models/Order");
const Product = require("../models/Product");
const Size = require("../models/Size");
const Delivery = require("../models/Delivery");

// POST /admin/deliveries
exports.bulkDeliver = async (req, res) => {
   const session = await mongoose.startSession();
   try {
      const { items } = req.body || {};
      if (!Array.isArray(items) || items.length === 0) {
         return res
            .status(400)
            .json({ success: false, message: "List of invalid items" });
      }

      // Gộp assignmentId trùng
      const reqMap = new Map();
      for (const it of items) {
         const id = String(it?.id || "").trim();
         const qty = Number(it?.qty);
         const note = (it?.note || "").trim();

         if (
            !mongoose.Types.ObjectId.isValid(id) ||
            !Number.isInteger(qty) ||
            qty <= 0
         ) {
            return res
               .status(400)
               .json({ success: false, message: "Invalid id/qty" });
         }
         const cur = reqMap.get(id) || { qty: 0, notes: [] };
         cur.qty += qty;
         if (note) cur.notes.push(note);
         reqMap.set(id, cur);
      }
      const assignIds = [...reqMap.keys()].map(
         (x) => new mongoose.Types.ObjectId(x)
      );

      // Lấy assignments + join Order
      const assignments = await Assignment.find(
         { _id: { $in: assignIds } },
         { _id: 1, ordId: 1, qtyReturnTotal: 1, qtyDelivery: 1 }
      )
         .populate({
            path: "ordId",
            select: "_id po productId sizeId qty deadline qtyDeliveryTotal",
            populate: [
               { path: "productId", select: "name" },
               { path: "sizeId", select: "name" },
            ],
         })
         .lean();

      if (assignments.length !== assignIds.length) {
         const found = new Set(assignments.map((a) => String(a._id)));
         const notFound = assignIds.map(String).filter((id) => !found.has(id));
         return res.status(400).json({
            success: false,
            message: "Some assignments do not exist.",
            data: notFound,
         });
      }

      // Validate và chuẩn bị group
      const byPO = new Map();
      const incAssign = new Map();
      const incOrder = new Map();

      const invalid = [];
      for (const a of assignments) {
         const reqQty = reqMap.get(String(a._id)).qty;
         const returned = a.qtyReturnTotal || 0;
         const delivered = a.qtyDelivery || 0;
         const available = returned - delivered;

         if (reqQty > available) {
            invalid.push({
               assignmentId: String(a._id),
               need: reqQty,
               available,
            });
            continue;
         }

         const ord = a.ordId;
         const orderPO = ord?.po || "";
         const prodName = ord?.productId?.name || "";
         const sizeName = ord?.sizeId?.name || "";

         if (!byPO.has(orderPO)) byPO.set(orderPO, []);
         byPO.get(orderPO).push({
            assignId: a._id,
            orderId: ord?._id,
            prodName,
            size: sizeName || "",
            qty: reqQty,
            notes: reqMap.get(String(a._id)).notes || [],
         });

         incAssign.set(
            String(a._id),
            (incAssign.get(String(a._id)) || 0) + reqQty
         );
         incOrder.set(
            String(ord?._id),
            (incOrder.get(String(ord?._id)) || 0) + reqQty
         );
      }

      if (invalid.length) {
         return res.status(400).json({
            success: false,
            message: "Some items exceed the available stock for export.",
            data: invalid,
         });
      }

      const now = new Date();
      const start = new Date(
         Date.UTC(
            now.getUTCFullYear(),
            now.getUTCMonth(),
            now.getUTCDate(),
            0,
            0,
            0,
            0
         )
      );
      const end = new Date(
         Date.UTC(
            now.getUTCFullYear(),
            now.getUTCMonth(),
            now.getUTCDate(),
            23,
            59,
            59,
            999
         )
      );

      await session.withTransaction(async () => {
         // Lưu Delivery
         for (const [orderPO, lines] of byPO.entries()) {
            const merged = new Map();
            for (const ln of lines) {
               const key = `${ln.prodName}__${ln.size}`;
               if (!merged.has(key))
                  merged.set(key, {
                     prodName: ln.prodName,
                     size: ln.size,
                     qty: 0,
                  });
               merged.get(key).qty += ln.qty;
            }
            const mergedProducts = [...merged.values()];

            const existing = await Delivery.findOne({
               orderPO,
               createdAt: { $gte: start, $lte: end },
            }).session(session);

            if (!existing) {
               await Delivery.create(
                  [
                     {
                        orderPO,
                        note: lines.flatMap((l) => l.notes).join(" | "),
                        products: mergedProducts,
                     },
                  ],
                  { session }
               );
            } else {
               const cur = existing.products || [];
               for (const m of mergedProducts) {
                  const idx = cur.findIndex(
                     (x) =>
                        x.prodName === m.prodName &&
                        (x.size || "") === (m.size || "")
                  );
                  if (idx >= 0) {
                     cur[idx].qty += m.qty;
                  } else {
                     cur.push({
                        prodName: m.prodName,
                        size: m.size,
                        qty: m.qty,
                     });
                  }
               }
               const moreNote = lines.flatMap((l) => l.notes).join(" | ");
               if (moreNote) {
                  existing.note = existing.note
                     ? `${existing.note} | ${moreNote}`
                     : moreNote;
               }
               existing.products = cur;
               await existing.save({ session });
            }
         }
         
         // Cập nhật qtyDelivery cho Assignment + Order
         if (incAssign.size) {
            const ops = [];
            for (const [assignId, q] of incAssign.entries()) {
               ops.push({
                  updateOne: {
                     filter: { _id: new mongoose.Types.ObjectId(assignId) },
                     update: { $inc: { qtyDelivery: q } },
                  },
               });
            }
            await Assignment.bulkWrite(ops, { session, ordered: false });
         }

         if (incOrder.size) {
            const ops = [];
            for (const [orderId, q] of incOrder.entries()) {
               ops.push({
                  updateOne: {
                     filter: { _id: new mongoose.Types.ObjectId(orderId) },
                     update: { $inc: { qtyDeliveryTotal: q } },
                  },
               });
            }
            await Order.bulkWrite(ops, { session, ordered: false });
         }
      });

      return res.json({
         success: true,
         message: `Shipment for ${reqMap.size} assignment.`,
      });
   } catch (err) {
      console.error("[bulkDeliver] error:", err);
      return res
         .status(500)
         .json({ success: false, message: "Internal Server Error" });
   } finally {
      session.endSession();
   }
};
