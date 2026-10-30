export function accountConfig(env) {
  const local = env.AUTH_DEV_MODE === "true";
  const origin = env.ACCOUNT_ORIGIN || "";
  if (!origin) return null;
  const url = new URL(origin);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    url.username ||
    url.password
  )
    throw new Error("ACCOUNT_ORIGIN must be an HTTP(S) origin");
  if (local && !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname))
    throw new Error("AUTH_DEV_MODE requires a loopback account origin");
  if (!local && url.protocol !== "https:")
    throw new Error("Public accounts require HTTPS");
  if (
    !local &&
    (!env.DATABASE_URL ||
      !env.BETTER_AUTH_SECRET ||
      env.BETTER_AUTH_SECRET.length < 32)
  )
    throw new Error(
      "Public accounts require DATABASE_URL and BETTER_AUTH_SECRET (32+ characters)",
    );
  if (!local && !/^postgres(?:ql)?:\/\//.test(env.DATABASE_URL))
    throw new Error("Public accounts require PostgreSQL");
  if (
    !local &&
    !["require", "verify-ca", "verify-full"].includes(
      new URL(env.DATABASE_URL).searchParams.get("sslmode"),
    )
  )
    throw new Error("Public account database requires TLS");
  for (const [a, b] of [
    ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
    ["SMTP_HOST", "SMTP_FROM"],
    ["SMTP_USER", "SMTP_PASS"],
  ])
    if (Boolean(env[a]) !== Boolean(env[b]))
      throw new Error(`Configure both ${a} and ${b}`);
  return {
    ...env,
    origin: url.origin,
    local,
    email: local || Boolean(env.SMTP_HOST && env.SMTP_FROM),
    google: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
  };
}
