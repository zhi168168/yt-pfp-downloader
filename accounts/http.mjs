import { toNodeHandler } from "better-auth/node";
import express from "express";

export const capabilities = (config) => ({
  configured: Boolean(config),
  google: Boolean(config?.google),
  emailRegistration: Boolean(config?.email),
  passwordReset: Boolean(config?.email),
  accountDeletion: Boolean(config?.email),
  ...(config?.local ? { localMailbox: true } : {}),
});

export function mountAccounts(app, config, service, { vercel = false } = {}) {
  app.use("/api/auth", (req, res, next) => {
    res.set("Cache-Control", "no-store");
    res.set("X-Content-Type-Options", "nosniff");
    if (req.headers.origin && req.headers.origin !== config?.origin)
      return res.status(403).json({ message: "Origin is not allowed" });
    if (!["GET", "POST"].includes(req.method))
      return res.status(405).json({ message: "Method not allowed" });
    next();
  });
  app.get("/api/auth/config", (req, res) => res.json(capabilities(config)));
  app.use("/api/auth", express.json({ limit: "16kb" }));
  const handler = service && toNodeHandler(service.auth);
  app.all(/^\/api\/auth(?:\/.*)?$/, async (req, res) => {
    if (!handler)
      return res
        .status(503)
        .json({ message: "Accounts are not configured yet" });
    if (
      req.method === "POST" &&
      !/^application\/json(?:\s*;|$)/i.test(req.headers["content-type"] || "")
    )
      return res.status(415).json({ message: "JSON required" });
    if (Number(req.headers["content-length"] || 0) > 16384)
      return res.status(413).json({ message: "Request too large" });
    if (req.body && Buffer.byteLength(JSON.stringify(req.body)) > 16384)
      return res.status(413).json({ message: "Request too large" });
    if (
      !config.email &&
      /^\/api\/auth\/(sign-up\/email|request-password-reset|send-verification-email|delete-user)$/.test(
        req.path,
      )
    )
      return res
        .status(503)
        .json({ message: "Email delivery is not configured" });
    const site = new URL(config.origin);
    req.headers.host = site.host;
    req.headers["x-forwarded-host"] = site.host;
    req.headers["x-forwarded-proto"] = site.protocol.slice(0, -1);
    req.headers["x-ytpfp-client-ip"] =
      (vercel
        ? String(req.headers["x-vercel-forwarded-for"] || "")
            .split(",")[0]
            .trim()
        : req.socket.remoteAddress) || "127.0.0.1";
    try {
      await handler(req, res);
    } catch {
      if (!res.headersSent)
        res
          .status(503)
          .json({ message: "Account service is temporarily unavailable" });
      else res.end();
    }
  });
  app.use("/api/auth", (error, req, res, next) => {
    if (res.headersSent) return next(error);
    res
      .status(error.type === "entity.too.large" ? 413 : 400)
      .json({ message: "Invalid account request" });
  });
  if (config?.local)
    app.get("/api/dev/mailbox", (req, res) => {
      if (
        !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(
          req.socket.remoteAddress,
        ) ||
        (req.headers.origin && req.headers.origin !== config.origin)
      )
        return res.sendStatus(403);
      res
        .set("Cache-Control", "no-store")
        .set("X-Robots-Tag", "noindex")
        .json(service.messages());
    });
}
