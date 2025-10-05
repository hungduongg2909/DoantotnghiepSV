const mongoose = require("mongoose");
const Order = require("../models/Order");
const Product = require("../models/Product");
const Size = require("../models/Size");

exports.getUnassignedOrders = async (req, res) => {
   try {
      const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
      const limit = Math.min(
         Math.max(parseInt(req.query.limit, 10) || 10, 1),
         100
      );
      const skip = (page - 1) * limit;

      // Lọc cơ bản (tuỳ chọn): theo po/prodCode/q
      const { po, prodCode, q } = req.query;
      const baseFilter = {};
      if (po) baseFilter.po = po;
      if (q) {
         baseFilter.$or = [{ po: { $regex: q, $options: "i" } }];
      }

      // Điều kiện “chưa giao hết”: qtyAssignTotal < qty
      const notFullyAssigned = { $expr: { $lt: ["$qtyAssignTotal", "$qty"] } };

      // Hợp nhất filter
      const filter = { ...baseFilter, ...notFullyAssigned };

      // Xác định field size theo schema (size hoặc sizeId)
      const sizePath = Order.schema.path("sizeId") ? "sizeId" : "size";

      // Query
      const [items, total] = await Promise.all([
         Order.find(filter)
            .populate("productId", "name")
            .populate("sizeId", "name")
            .sort({ deadline: 1 })
            .skip(skip)
            .limit(limit)
            .lean(),
         Order.countDocuments(filter),
      ]);

      return res.json({
         success: true,
         data: items,
         pagination: { page, limit, total },
      });
   } catch (err) {
      console.error("[getUnassignedOrders] error:", err);
      return res
         .status(500)
         .json({ success: false, message: "Internal Server Error" });
   }
};

// POST /admin/orders
exports.addOrder = async (req, res) => {
   try {
      const items = Array.isArray(req.body) ? req.body : [req.body];
      if (!items.length) {
         return res.status(400).json({
            success: false,
            message: "Invalid data",
         });
      }

      // Prefetch prodCode và sizeName
      const prodCodes = [
         ...new Set(items.map((it) => it?.prodCode).filter(Boolean)),
      ];
      const sizeNames = [
         ...new Set(
            items
               .map((it) =>
                  typeof it?.size === "string" ? it.size.trim() : ""
               )
               .filter(Boolean)
         ),
      ];

      const [products, sizes] = await Promise.all([
         prodCodes.length
            ? Product.find({ prodCode: { $in: prodCodes } })
                 .select("_id prodCode")
                 .lean()
            : [],
         sizeNames.length
            ? Size.find({ name: { $in: sizeNames } })
                 .select("_id name")
                 .lean()
            : [],
      ]);

      const prodMap = new Map(products.map((p) => [p.prodCode, p._id]));
      const sizeMap = new Map(sizes.map((s) => [s.name, s._id]));

      const docs = items.map((raw, index) => {
         const _id = new mongoose.Types.ObjectId();
         return {
            _id,
            raw,
            doc: {
               _id,
               po: raw.po,
               productId: prodMap.get(raw.prodCode),
               sizeId: raw.size ? sizeMap.get(raw.size) || null : null,
               qty: raw.qty,
               deadline: raw.deadline ? new Date(raw.deadline) : null,
               note: raw.note || "",
               qtyDeliveryTotal: raw.qtyDeliveryTotal ?? 0,
               qtyAssignTotal: raw.qtyAssignTotal ?? 0,
            },
         };
      });

      // Insert
      try {
         await Order.insertMany(
            docs.map((d) => d.doc),
            { ordered: false }
         );
      } catch (e) {
         // Ignore, vẫn query lại để biết cái nào đã insert
      }

      // Query lại các _id đã thành công
      const ids = docs.map((d) => d._id);
      const existed = await Order.find({ _id: { $in: ids } })
         .select("_id")
         .lean();
      const existedSet = new Set(existed.map((x) => String(x._id)));

      // Gom failed: cái nào không nằm trong existedSet
      const failed = docs
         .filter((d) => !existedSet.has(String(d._id)))
         .map((d) => d.raw);

      if (failed.length === items.length) {
         return res.status(400).json({
            success: false,
            message: "Invalid data",
         });
      }

      return res.json({
         success: true,
         message: `Successfully added ${items.length - failed.length}/${
            items.length
         } orders`,
         data: failed,
      });
   } catch (err) {
      console.log("===ADD ORDER ERROR===");
      console.log(err);
      return res
         .status(500)
         .json({ success: false, message: "Internal Server Error" });
   }
};
