const multer = require("multer");
const path = require("path");

const storage = multer.diskStorage({
   destination: (req, file, cb) => {
      cb(null, "public/images");
   },
   filename: (req, file, cb) => {
      cb(null, file.originalname);
   },
});

// Chỉ cho phép file PDF
const fileFilter = (req, file, cb) => {
   if (file.mimetype === "application/pdf") {
      cb(null, true);
   } else {
      cb(null, false);
   }
};

const upload = multer({
   storage,
   fileFilter,
});

module.exports = upload;
