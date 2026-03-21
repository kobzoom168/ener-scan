import { env } from "../config/env.js";

/**
 * Admin auth: `x-admin-token` header, `?token=`, or `token` in urlencoded body.
 */
export function requireAdmin(req, res, next) {
  const token =
    req.headers["x-admin-token"] ||
    req.query?.token ||
    req.body?.token ||
    null;

  if (!env.ADMIN_TOKEN) {
    res.status(500).send("ADMIN_TOKEN not configured");
    return;
  }

  if (!token || String(token) !== String(env.ADMIN_TOKEN)) {
    res.status(401).send("unauthorized");
    return;
  }

  next();
}
