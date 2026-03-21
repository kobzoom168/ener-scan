import crypto from "crypto";

import { env } from "../config/env.js";

/**
 * Legacy: `x-admin-token` header, `?token=`, or `token` in urlencoded body.
 * Use with `requireAdminAuth` only when you need token-only (rare).
 */
export function requireAdminToken(req, res, next) {
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

function timingSafeEqualString(a, b) {
  const ba = Buffer.from(String(a ?? ""), "utf8");
  const bb = Buffer.from(String(b ?? ""), "utf8");
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function hasValidAdminSession(req) {
  return Boolean(
    req.session?.admin && req.session.admin.authenticated === true
  );
}

function hasLegacyAdminToken(req) {
  if (!env.ADMIN_TOKEN) return false;
  const token =
    req.headers["x-admin-token"] ||
    req.query?.token ||
    req.body?.token ||
    null;
  return token && timingSafeEqualString(token, env.ADMIN_TOKEN);
}

/**
 * Session login OR legacy ADMIN_TOKEN (backward compatible).
 * Prefers JSON 401 when client asks for JSON; otherwise redirect to /admin/login.
 */
export function requireAdminSession(req, res, next) {
  if (hasValidAdminSession(req) || hasLegacyAdminToken(req)) {
    next();
    return;
  }

  const accept = String(req.get("Accept") || "");
  const prefersJson =
    accept.includes("application/json") && !accept.includes("text/html");

  if (prefersJson) {
    res.status(401).json({ ok: false, message: "unauthorized" });
    return;
  }

  const nextPath = req.originalUrl || "/admin/payments";
  const safeNext = nextPath.startsWith("/admin") ? nextPath : "/admin/payments";
  res.redirect(302, `/admin/login?next=${encodeURIComponent(safeNext)}`);
}

/** @deprecated Use requireAdminSession */
export const requireAdmin = requireAdminSession;
