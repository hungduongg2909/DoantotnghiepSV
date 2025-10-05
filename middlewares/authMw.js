const requireAuth = (req, res, next) => {
   if (req.session && req.session.accId) {
      return next();
   } else {
      return res.status(401).json({
         success: false,
         message: "You need to login to access this resource",
      });
   }
};

// Middleware kiểm tra quyền admin
const requireAdmin = (req, res, next) => {
   if (req.session && req.session.accId && req.session.role === 1) {
      return next();
   } else {
      return res.status(403).json({
         success: false,
         message: "You do not have permission to access this resource",
      });
   }
};

module.exports = {
   requireAuth,
   requireAdmin,
};
