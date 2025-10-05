require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const cors = require("cors");
const path = require("path");

const authRoutes = require("./routes/auth");
const adminRoutes = require("./routes/admin");
const userRoutes = require("./routes/user");

const { requireAuth, requireAdmin } = require("./middlewares/authMw");

const app = express();

const MONGO_URI = `mongodb+srv://${process.env.MONGO_USER}:${process.env.MONGO_PASSWORD}@clusterfunix.togdz.mongodb.net/${process.env.MONGO_DB}?retryWrites=true&w=majority&appName=ClusterFunix`;
const allowedOrigins = process.env.ALLOWED_ORIGINS.split(",");

app.use(
   cors({
      origin: function (origin, callback) {
         if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
         } else {
            callback(new Error("Not allowed by CORS"));
         }
      },
      credentials: true,
   })
);

// Middleware
app.use(express.json());
app.use("/images", express.static(path.join(__dirname, "public/images")));

// Kết nối MongoDB
mongoose
   .connect(MONGO_URI)
   .then(() => console.log("MongoDB connected"))
   .catch((err) => console.error("MongoDB connection error:", err));

// Session config
app.set("trust proxy", 1);
app.use(
   session({
      secret: process.env.SECRET,
      resave: false,
      saveUninitialized: false,
      rolling: true,
      store: MongoStore.create({
         mongoUrl: MONGO_URI,
         collectionName: "sessions",
         ttl: 24 * 60 * 60, // 24h (giây)
      }),
      cookie: {
         maxAge: 24 * 60 * 60 * 1000, // 24h (ms)
         httpOnly: true,
         secure: process.env.NODE_ENV === "production",
         sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      },
   })
);

// Routes
app.use("/", authRoutes);
app.use("/admin", requireAuth, requireAdmin, adminRoutes);
app.use("/user", requireAuth, userRoutes);
// app.use("/admin", adminRoutes);
// app.use("/user", userRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
   console.error("=== GLOBAL ERROR HANDLER ===");
   console.error("Error:", err);

   res.status(err.status || 500).json({
      success: false,
      message: err.message || "Lỗi server nội bộ",
      error:
         process.env.NODE_ENV === "development"
            ? err.stack
            : "Internal server error",
   });
});

// Handle 404
app.use((req, res) => {
   res.status(404).json({
      success: false,
      message: "Endpoint không tồn tại",
   });
});

// Lắng nghe cổng
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
   console.log(`Server running on port ${PORT}`);
});
