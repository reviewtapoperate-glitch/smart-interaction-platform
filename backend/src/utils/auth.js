import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export function signToken(user) {
  return jwt.sign(
    { sub: user.id, businessId: user.businessId, role: user.role },
    env.JWT_SECRET,
    { expiresIn: "12h" }
  );
}

export function verifyToken(token) {
  return jwt.verify(token, env.JWT_SECRET);
}

export function authRequired(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    if (!header.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Authentication required" });
    }
    req.auth = verifyToken(header.slice(7));
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}
