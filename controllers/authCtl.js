const bcrypt = require("bcryptjs");
const nodemailer = require("nodemailer");
const crypto = require("crypto");
require("dotenv").config();
const sgMail = require("@sendgrid/mail");
const axios = require("axios");

const Account = require("../models/Account");
const Token = require("../models/Token");

sgMail.setApiKey(process.env.SENDGRID_API_KEY);
console.log(
   "SENDGRID_API_KEY:",
   (process.env.SENDGRID_API_KEY || "").trim().length
);

// const createMailTransporter = () => require("../utils/mailer");

// const SMTP_HOST = process.env.SMTP_HOST || "smtp.gmail.com";
// const SMTP_PORT = Number(process.env.SMTP_PORT || 587); // 587 (STARTTLS) hoặc 465
// const is465 = SMTP_PORT === 465;

// const transporter = nodemailer.createTransport({
//    host: SMTP_HOST,
//    port: SMTP_PORT,
//    secure: is465, // 465 -> true, 587 -> false
//    auth: {
//       user: process.env.SMTP_USER, // vd: you@gmail.com
//       pass: process.env.APP_PASSWORD_GMAIL, // App Password 16 ký tự
//    },
//    connectionTimeout: 10000, // 10s
//    socketTimeout: 10000, // 10s
//    logger: true,
//    debug: true,
//    tls: { minVersion: "TLSv1.2" },
// });

// Cấu hình SMTP transporter
// const createMailTransporter = () => {
//    return nodemailer.createTransport({
//       service: "gmail",
//       auth: {
//          user: "hungduongg2909@gmail.com",
//          pass: process.env.APP_PASSWORD_GMAIL,
//       },
//    });
// };

// Hàm tạo token ngẫu nhiên
const generateToken = () => {
   return crypto.randomBytes(32).toString("hex");
};

// Hàm lấy domain linh động
const getDomain = (req) => {
   // Ưu tiên lấy từ environment variable
   // if (USER_DOMAIN) {
   //    return USER_DOMAIN;
   // }

   const origin = req.get("origin");
   if (origin) {
      return origin.replace(/\/$/, "");
   }

   const referer = req.get("referer");
   if (referer) {
      try {
         return new URL(referer).origin;
      } catch (_) {
         /* ignore */
      }
   }

   const fProto = req.get("x-forwarded-proto") || req.get("x-forwarded-scheme");
   const fHost = req.get("x-forwarded-host");
   const fPort = req.get("x-forwarded-port");
   if (fHost) {
      const hostWithPort =
         fPort && !fHost.includes(":") ? `${fHost}:${fPort}` : fHost;
      return `${(fProto || "http").trim()}://${hostWithPort}`;
   }

   // Nếu không có, tạo từ request headers
   const protocol = req.get("X-Forwarded-Proto") || req.protocol || "https";
   const host = req.get("host");
   return `${protocol}://${host}`;
};

function norm(u = "") {
   try {
      // bỏ slash cuối để so sánh chuẩn
      return new URL(u).origin.replace(/\/+$/, "");
   } catch {
      return (u || "").replace(/\/+$/, "");
   }
}

const ADMIN_DOMAIN = norm(process.env.FRONTEND_DOMAIN_ADMIN);
const USER_DOMAIN = norm(process.env.FRONTEND_DOMAIN_USER);

function detectPortal(req) {
   // ưu tiên Origin; nếu không có, fallback sang Referer (một số trình duyệt chỉ gửi Referer)
   const originHdr = req.headers.origin || "";
   const refererHdr = req.headers.referer || "";

   const origin = norm(originHdr || refererHdr);

   if (origin && origin === ADMIN_DOMAIN) return "admin";
   if (origin && origin === USER_DOMAIN) return "user";
   return "unknown"; // Postman / khác domain
}

// POST /auth/login
exports.loginCtl = async (req, res) => {
   try {
      const { loginIdentifier, password } = req.body;

      const isEmail = loginIdentifier.includes("@");
      const query = isEmail
         ? { email: loginIdentifier }
         : { username: loginIdentifier };

      const user = await Account.findOne(query);
      if (!user) {
         return res
            .status(401)
            .json({ success: false, message: "Incorrect login information" });
      }

      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
         return res
            .status(401)
            .json({ success: false, message: "Incorrect login information" });
      }

      // Chặn theo portal (dựa vào Origin/Referer)
      const portal = detectPortal(req);
      if (portal === "admin" && user.role !== 1) {
         return res.status(403).json({
            success: false,
            message: "Not allowed to access Admin",
         });
      }
      if (portal === "user" && user.role !== 0) {
         return res.status(403).json({
            success: false,
            message: "Not allowed to access User",
         });
      }
      // CHẶN tất cả domain lạ
      if (portal === "unknown")
         return res
            .status(403)
            .json({ success: false, message: "Forbidden origin" });

      // Tạo session như cũ
      req.session.accId = user._id;
      req.session.username = user.username;
      req.session.email = user.email;
      req.session.role = user.role;
      req.session.fullname = user.fullname;

      return res.status(200).json({
         success: true,
         message: "Login successful",
         data: {
            id: user._id,
            username: user.username,
            email: user.email,
            fullname: user.fullname,
            role: user.role,
            phone: user.phone,
         },
      });
   } catch (error) {
      console.error("=== LOGIN ERROR ===", error);
      return res
         .status(500)
         .json({ success: false, message: "Internal server error" });
   }
};

// Logout controller
// POST /auth/logout
exports.logoutCtl = async (req, res) => {
   try {
      req.session.destroy((err) => {
         if (err) {
            console.error("Session destroy error:", err);
            return res.status(500).json({
               success: false,
               message: "Error when logging out",
            });
         }

         res.clearCookie("connect.sid"); // Clear session cookie

         return res.status(200).json({
            success: true,
            message: "Log out successfully",
         });
      });
   } catch (error) {
      console.error("=== LOGOUT ERROR ===");
      console.error("Error:", error);

      return res.status(500).json({
         success: false,
         message: "Internal server error",
      });
   }
};

// POST /auth/register
exports.registerCtl = async (req, res) => {
   try {
      const { username, email, password, fullname, phone } = req.body;

      // Kiểm tra username đã tồn tại
      const existingUsername = await Account.findOne({ username });
      if (existingUsername) {
         return res.status(400).json({
            success: false,
            message: "Username already exists",
         });
      }

      // Kiểm tra email đã tồn tại
      const existingEmail = await Account.findOne({ email });
      if (existingEmail) {
         return res.status(400).json({
            success: false,
            message: "Email already exists",
         });
      }

      // Băm mật khẩu
      const hashedPassword = await bcrypt.hash(
         password,
         Number(process.env.BCRYPT_SALT_ROUNDS || 10)
      );

      // Tạo account mới với role mặc định là 0 (user)
      const newAccount = new Account({
         username,
         email,
         password: hashedPassword,
         fullname,
         phone,
         role: 0, // Mặc định là user
      });

      await newAccount.save();

      res.status(201).json({
         success: true,
         message: "Registration successful",
      });
   } catch (error) {
      console.error("=== REGISTER ERROR ===");
      console.error("Error:", error);

      return res.status(500).json({
         success: false,
         message: "Internal server error",
      });
   }
};

// POST /auth/forgot-password
exports.forgotPasswordCtl = async (req, res) => {
   try {
      const { email } = req.body;

      // Lấy account theo email
      const user = await Account.findOne({ email: email });
      if (!user) {
         return res.status(400).json({
            success: false,
            message: "Account not found email",
         });
      }

      const MIN_INTERVAL_MS = 2 * 60 * 1000;

      // Tìm token gần nhất của email
      const existing = await Token.findOne({ email }).lean();

      if (existing?.createdAt) {
         const elapsed = Date.now() - new Date(existing.createdAt).getTime();
         if (elapsed < MIN_INTERVAL_MS) {
            const waitMs = MIN_INTERVAL_MS - elapsed;
            const waitSec = Math.ceil(waitMs / 1000);
            return res.status(429).json({
               success: false,
               message: `Your request was recently made. Please try again in ${waitSec} seconds.`,
            });
         }
      }

      // Tạo reset token
      const token = generateToken();

      // Lưu token vào database
      await Token.findOneAndUpdate(
         { email: email },
         { $set: { token: token, createdAt: new Date() } },
         { upsert: true }
      );

      // Tạo reset URL
      const domain = getDomain(req);
      const resetPasswordUrl = `${domain}/reset-password?token=${token}`;

      // Cấu hình email
      const fromName = process.env.FROM_NAME || "Embroidery";
      const fromAddress =
         process.env.FROM_ADDRESS || "hungduongg2909@gmail.com";

      // HTML giữ nguyên như bạn đang có
      const mailHtml = `
                        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                           <h2 style="color: #333; text-align: center;">Đặt lại mật khẩu</h2>
                           <p>Xin chào,</p>
                           <p>Bạn đã yêu cầu đặt lại mật khẩu cho tài khoản Embroidery của mình.</p>
                           <p>Vui lòng nhấp vào link bên dưới để đặt lại mật khẩu:</p>
                           <div style="text-align: center; margin: 20px 0;">
                              <a href="${resetPasswordUrl}"
                                 style="background-color: #007bff; color: white; padding: 12px 24px;
                                       text-decoration: none; border-radius: 5px; display: inline-block;">
                              Đặt lại mật khẩu
                              </a>
                           </div>
                           <p><strong>Lưu ý:</strong> Link này chỉ có hiệu lực trong 15 phút.</p>
                           <p>Nếu bạn không yêu cầu đặt lại mật khẩu, vui lòng bỏ qua email này.</p>
                           <hr style="margin: 20px 0;">
                           <p style="font-size: 12px; color: #666; text-align: center;">
                              Email này được gửi tự động, vui lòng không trả lời.
                           </p>
                        </div>
                        `;

      const brevoPayload = {
         sender: { name: fromName, email: fromAddress },
         to: [{ email }],
         subject: "Đặt lại mật khẩu - Embroidery",
         htmlContent: mailHtml,
      };

      // Gửi email
      try {
         const apiKey = (process.env.BREVO_API_KEY || "").trim();
         if (!apiKey) {
            console.error("[Brevo] Missing BREVO_API_KEY env");
            return res.status(500).json({
               success: false,
               message: "Email service is not configured",
            });
         }

         await axios.post("https://api.brevo.com/v3/smtp/email", brevoPayload, {
            headers: {
               "api-key": apiKey,
               "Content-Type": "application/json",
               Accept: "application/json",
            },
            timeout: 10000,
         });
      } catch (e) {
         // log chi tiết để biết vì sao fail (invalid sender, key sai...)
         const data = e?.response?.data;
         console.error(
            "[Brevo] send error:",
            e?.response?.status,
            data || e.message
         );
         return res.status(500).json({
            success: false,
            message: "Email service unavailable",
         });
      }

      res.status(200).json({
         success: true,
         message: "Password reset link has been sent to your email",
      });
   } catch (error) {
      console.error("=== FORGOT PASSWORD ERROR ===");
      console.error("Error:", error);

      return res.status(500).json({
         success: false,
         message: "Internal server error",
      });
   }
};

// POST /auth/reset-pasword
exports.resetPasswordCtl = async (req, res) => {
   try {
      const { token, password } = req.body || {};

      // 1) Tìm token
      const tokenDoc = await Token.findOne({ token }).lean();
      if (!tokenDoc) {
         return res.status(400).json({
            success: false,
            message: "Invalid or expired token",
         });
      }

      // 2) Kiểm tra hết hạn (15 phút)
      const EXPIRE_MS = 15 * 60 * 1000;
      const createdAtMs = new Date(tokenDoc.createdAt).getTime();
      if (Date.now() - createdAtMs > EXPIRE_MS) {
         // token hết hạn -> xoá luôn cho sạch
         await Token.deleteOne({ token });
         return res.status(400).json({
            success: false,
            message: "Token has expired",
         });
      }

      // 3) Lấy account theo email trong token
      const user = await Account.findOne({ email: tokenDoc.email });
      if (!user) {
         // token “mồ côi” -> xoá token
         await Token.deleteOne({ token });
         return res.status(400).json({
            success: false,
            message: "Account not found for this token",
         });
      }

      // 4) Hash & update mật khẩu
      const saltRounds = Number(process.env.BCRYPT_SALT_ROUNDS || 10);
      const hashed = await bcrypt.hash(password, saltRounds);
      await Account.updateOne(
         { _id: user._id },
         { $set: { password: hashed } }
      );

      // 5) Vô hiệu hoá token (xoá)
      await Token.deleteMany({ email: tokenDoc.email });

      return res.status(200).json({
         success: true,
         message: "Password has been reset successfully",
      });
   } catch (err) {
      console.error("=== RESET PASSWORD ERROR ===", err);
      return res
         .status(500)
         .json({ success: false, message: "Internal server error" });
   }
};

// POST /auth/change-password
exports.changePassword = async (req, res) => {
   try {
      // Lấy user từ session
      if (!req.session || !req.session.accId) {
         return res
            .status(401)
            .json({ success: false, message: "Unauthorized" });
      }

      // oldPassword & newPassword đã được middleware validate rồi
      const { oldPassword, newPassword } = req.body;

      // Lấy hash hiện tại
      const acc = await Account.findById(req.session.accId).select(
         "password username"
      );
      if (!acc) {
         return res
            .status(404)
            .json({ success: false, message: "Account not found" });
      }

      // So sánh mật khẩu cũ
      const isMatch = await bcrypt.compare(String(oldPassword), acc.password);
      if (!isMatch) {
         return res
            .status(400)
            .json({ success: false, message: "Old password incorrect" });
      }

      // Hash mật khẩu mới
      const saltRounds = Number(process.env.BCRYPT_SALT_ROUNDS || 10);
      const newHash = await bcrypt.hash(String(newPassword), saltRounds);

      // Cập nhật
      acc.password = newHash;
      await acc.save();

      // (Optional) Nếu muốn bắt user đăng nhập lại các nơi khác, có thể regenerate session ở đây
      // req.session.regenerate(() => {})

      return res.status(200).json({
         success: true,
         message: "Đổi mật khẩu thành công",
      });
   } catch (err) {
      console.error("[changePassword] error:", err);
      return res
         .status(500)
         .json({ success: false, message: "Internal Server Error" });
   }
};
