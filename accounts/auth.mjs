import { betterAuth } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import pg from "pg";
import nodemailer from "nodemailer";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomBytes, randomUUID } from "node:crypto";
import path from "node:path";

export function accountEmail(kind, url) {
  const copy = {
    verify: [
      "Verify your YT PFP email",
      "Confirm your email address to finish creating your YT PFP account.",
    ],
    reset: [
      "Reset your YT PFP password",
      "Use the link below to choose a new password. If you did not request this, ignore this email.",
    ],
    delete: [
      "Confirm deletion of your YT PFP account",
      "This permanently deletes your profile, linked sign-ins and sessions. Your lookup on this device is kept. Open the link within one hour, in the same browser while signed in. If you did not request this, ignore this email.",
    ],
  }[kind];
  return { subject: copy[0], text: `${copy[1]}\n\n${url}` };
}

export async function createAccounts(config, options = {}) {
  const directory = options.directory || path.resolve("work/accounts");
  if (config.local) await mkdir(directory, { recursive: true });
  const DatabaseSync = config.local
    ? (await import("node:sqlite")).DatabaseSync
    : null;
  let secret = config.BETTER_AUTH_SECRET;
  if (config.local && !secret) {
    const file = path.join(directory, "secret");
    secret = await readFile(file, "utf8").catch(() => null);
    if (!secret) {
      secret = randomBytes(48).toString("base64url");
      await writeFile(file, secret, { mode: 0o600, flag: "wx" });
    }
  }
  const database =
    options.database ||
    (config.local
      ? new DatabaseSync(path.join(directory, "accounts.sqlite"))
      : new pg.Pool({
          connectionString: config.DATABASE_URL,
          max: 3,
          connectionTimeoutMillis: 15000,
          idleTimeoutMillis: 10000,
          allowExitOnIdle: true,
        }));
  if (config.local)
    database.exec("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;");
  else
    database.on("error", () =>
      console.error("Account database connection failed"),
    );
  const mailboxPath = path.join(directory, "mailbox.json");
  let messages = config.local
    ? JSON.parse(await readFile(mailboxPath, "utf8").catch(() => "[]"))
    : [];
  const mailer =
    options.mailer ||
    (config.local
      ? {
          sendMail: async (message) => {
            messages = [
              { id: randomUUID(), date: new Date().toISOString(), ...message },
              ...messages,
            ].slice(0, 100);
            await writeFile(mailboxPath, JSON.stringify(messages), {
              mode: 0o600,
            });
          },
        }
      : config.email
        ? nodemailer.createTransport({
            host: config.SMTP_HOST,
            port: Number(config.SMTP_PORT || 587),
            secure: Number(config.SMTP_PORT || 587) === 465,
            requireTLS: Number(config.SMTP_PORT || 587) !== 465,
            ...(config.SMTP_USER
              ? { auth: { user: config.SMTP_USER, pass: config.SMTP_PASS } }
              : {}),
            connectionTimeout: 10000,
            socketTimeout: 15000,
          })
        : null);
  const send = async (email, kind, url) => {
    if (!mailer) throw new Error("Email delivery is unavailable");
    await mailer.sendMail({
      from: config.SMTP_FROM || "YT PFP <accounts@localhost>",
      to: email,
      ...accountEmail(kind, url),
    });
  };
  const auth = betterAuth({
    appName: "YT PFP",
    baseURL: config.origin,
    basePath: "/api/auth",
    secret,
    database,
    trustedOrigins: [config.origin],
    telemetry: { enabled: false },
    advanced: {
      cookiePrefix: "ytpfp",
      useSecureCookies: !config.local,
      trustedProxyHeaders: false,
      database: { validateSchema: false },
      ipAddress: { ipAddressHeaders: ["x-ytpfp-client-ip"] },
    },
    emailAndPassword: {
      enabled: true,
      disableSignUp: !config.email,
      requireEmailVerification: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      revokeSessionsOnPasswordReset: true,
      ...(config.email
        ? {
            sendResetPassword: async ({ user, url }) =>
              send(user.email, "reset", url),
          }
        : {}),
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: false,
      sendVerificationEmail: async ({ user, url }) =>
        send(user.email, "verify", url),
    },
    socialProviders: config.google
      ? {
          google: {
            clientId: config.GOOGLE_CLIENT_ID,
            clientSecret: config.GOOGLE_CLIENT_SECRET,
          },
        }
      : {},
    account: { accountLinking: { enabled: false } },
    session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
    user: {
      deleteUser: {
        enabled: config.email,
        deleteTokenExpiresIn: 3600,
        sendDeleteAccountVerification: async ({ user, url }) =>
          send(user.email, "delete", url),
      },
    },
    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 40,
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
        "/sign-up/email": { window: 60, max: 3 },
        "/request-password-reset": { window: 60, max: 3 },
        "/send-verification-email": { window: 60, max: 3 },
        "/delete-user": { window: 60, max: 3 },
      },
    },
    logger: { disabled: true },
  });
  if (config.local || options.migrate) {
    const { runMigrations } = await getMigrations(auth.options);
    await runMigrations();
  }
  return {
    auth,
    database,
    messages: () => messages,
    close: async () => (config.local ? database.close() : database.end()),
  };
}
