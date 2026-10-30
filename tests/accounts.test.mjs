import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import express from "express";
import { once } from "node:events";
import { accountConfig } from "../accounts/config.mjs";
import { createAccounts } from "../accounts/auth.mjs";
import { mountAccounts } from "../accounts/http.mjs";
import { createApp } from "../server.mjs";
import { fromNodeHeaders } from "better-auth/node";
import { tokenCodec } from "../lib/tokens.mjs";
import sharp from "sharp";

const origin = "http://127.0.0.1:3000";
const config = accountConfig({
  AUTH_DEV_MODE: "true",
  ACCOUNT_ORIGIN: origin,
  BETTER_AUTH_SECRET: "test-secret-with-at-least-thirty-two-characters",
});
const cookies = (response) =>
  response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
const emailURL = (mail) => mail.text.match(/https?:\/\/[^\s]+/)[0];
async function fixture(t) {
  const directory = await mkdtemp(path.join(tmpdir(), "ytpfp-accounts-"));
  const messages = [];
  const options = {
    directory,
    mailer: { sendMail: async (message) => messages.push(message) },
  };
  const service = await createAccounts(config, options);
  const call = (route, data, cookie) =>
    service.auth.handler(
      new Request(`${origin}/api/auth/${route}`, {
        method: data === undefined ? "GET" : "POST",
        headers: {
          origin,
          ...(data === undefined ? {} : { "content-type": "application/json" }),
          ...(cookie ? { cookie } : {}),
        },
        body: data === undefined ? undefined : JSON.stringify(data),
      }),
    );
  t.after(async () => {
    await service.close();
    await rm(directory, { recursive: true, force: true });
  });
  return { service, call, messages, directory, options };
}

test("Avatar downloads reject guests and revoked sessions; previews cannot expose full size", async (t) => {
  const { service, call, messages } = await fixture(t);
  await call("sign-up/email", { name:"Downloader", email:"download@example.test", password:"DownloadPass123!" });
  await service.auth.handler(new Request(emailURL(messages[0])));
  const cookie = cookies(await call("sign-in/email", { email:"download@example.test", password:"DownloadPass123!" }));
  const server = createApp({ secret:'test', key:'test',
    sessionReader:req=>service.auth.api.getSession({headers:fromNodeHeaders(req.headers)}),
    fetcher:async url=>new Response(await sharp({create:{width:Number(url.match(/=s(\d+)/)[1]),height:Number(url.match(/=s(\d+)/)[1]),channels:3,background:'#ccc'}}).jpeg().toBuffer(),{headers:{'content-type':'image/jpeg'}})
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  t.after(()=>new Promise(r=>server.close(r)));
  const token = tokenCodec('test').encode({source:'https://yt3.ggpht.com/test=s800-c',name:'Test',id:'test'});
  const url = `http://127.0.0.1:${server.address().port}/api/image?token=${token}&size=1280`;
  assert.equal((await fetch(url)).status,401);
  assert.equal((await fetch(url+'&inline=2')).status,401);
  const preview = await fetch(url+'&inline=1');
  assert.equal(preview.status,200);
  assert.equal((await sharp(Buffer.from(await preview.arrayBuffer())).metadata()).width,400);
  const image = await fetch(url,{headers:{cookie}});
  assert.equal(image.status,200);
  assert.equal(image.headers.get('cache-control'),'no-store');
  assert.equal((await sharp(Buffer.from(await image.arrayBuffer())).metadata()).width,1280);
  await call('sign-out',{},cookie);
  assert.equal((await fetch(url,{headers:{cookie}})).status,401);
});

test("Account configuration isolates localhost and rejects partial or unsafe public credentials", () => {
  assert.equal(accountConfig({}), null);
  assert.throws(
    () =>
      accountConfig({
        AUTH_DEV_MODE: "true",
        ACCOUNT_ORIGIN: "https://ytpfp.com",
      }),
    /loopback/,
  );
  assert.throws(() => accountConfig({ ACCOUNT_ORIGIN: origin }), /HTTPS/);
  assert.throws(
    () =>
      accountConfig({
        AUTH_DEV_MODE: "true",
        ACCOUNT_ORIGIN: origin,
        GOOGLE_CLIENT_ID: "partial",
      }),
    /both/,
  );
  assert.throws(
    () =>
      accountConfig({
        ACCOUNT_ORIGIN: "https://ytpfp.com",
        BETTER_AUTH_SECRET: "long-secret-with-thirty-two-characters",
        DATABASE_URL: "postgresql://host/db",
      }),
    /TLS/,
  );
});

test("Real persistent account lifecycle: verify, sign in, edit profile, change/reset password and revoke sessions", async (t) => {
  const { service, call, messages, directory, options } = await fixture(t);
  const identity = {
    name: "Test Creator",
    email: "creator@example.test",
    password: "InitialPass123!",
  };
  assert.equal(
    (
      await call("sign-up/email", {
        ...identity,
        callbackURL: `${origin}/account?verified=1`,
      })
    ).status,
    200,
  );
  assert.equal((await call("sign-in/email", identity)).status, 403);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].subject, "Verify your YT PFP email");
  assert.ok(
    [200, 302].includes(
      (await service.auth.handler(new Request(emailURL(messages[0])))).status,
    ),
  );
  const signedIn = await call("sign-in/email", identity);
  assert.equal(signedIn.status, 200);
  const cookie = cookies(signedIn);
  assert.equal(
    (await (await call("get-session", undefined, cookie)).json()).user.email,
    identity.email,
  );
  assert.equal(
    (await call("update-user", { name: "Updated Creator" }, cookie)).status,
    200,
  );
  assert.equal(
    (
      await call(
        "change-password",
        {
          currentPassword: identity.password,
          newPassword: "ChangedPass123!",
          revokeOtherSessions: true,
        },
        cookie,
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await call("request-password-reset", {
        email: identity.email,
        redirectTo: `${origin}/account?view=reset`,
      })
    ).status,
    200,
  );
  const token = new URL(emailURL(messages.at(-1))).pathname.split("/").pop();
  assert.equal(
    (await call("reset-password", { token, newPassword: "ResetPass123!" }))
      .status,
    200,
  );
  assert.equal(
    await (await call("get-session", undefined, cookie)).json(),
    null,
  );
  assert.equal(
    (await call("reset-password", { token, newPassword: "ReuseToken123!" }))
      .status,
    400,
  );
  assert.equal((await call("sign-in/email", identity)).status, 401);
  const newLogin = await call("sign-in/email", {
    ...identity,
    password: "ResetPass123!",
  });
  assert.equal(newLogin.status, 200);
  const newCookie = cookies(newLogin);
  const secondService = await createAccounts(config, options);
  try {
    const persisted = await secondService.auth.handler(
      new Request(`${origin}/api/auth/get-session`, {
        headers: { cookie: newCookie },
      }),
    );
    assert.equal((await persisted.json()).user.name, "Updated Creator");
  } finally {
    await secondService.close();
  }
  assert.equal((await call("sign-out", {}, newCookie)).status, 200);
  assert.equal(
    await (await call("get-session", undefined, newCookie)).json(),
    null,
  );
});

test("Deletion needs the email token and signed-in browser; it removes the account and sessions", async (t) => {
  const { service, call, messages } = await fixture(t);
  const identity = {
    name: "Delete Test",
    email: "delete@example.test",
    password: "DeletePass123!",
  };
  await call("sign-up/email", identity);
  await service.auth.handler(new Request(emailURL(messages[0])));
  const cookie = cookies(await call("sign-in/email", identity));
  assert.equal(
    (
      await call(
        "delete-user",
        { callbackURL: `${origin}/account?deleted=1` },
        cookie,
      )
    ).status,
    200,
  );
  const url = emailURL(messages.at(-1));
  assert.equal((await service.auth.handler(new Request(url))).status, 404);
  const withSession = await service.auth.handler(
    new Request(url, { headers: { cookie } }),
  );
  assert.ok([200, 302].includes(withSession.status));
  assert.equal(
    await (await call("get-session", undefined, cookie)).json(),
    null,
  );
  assert.equal((await call("sign-in/email", identity)).status, 401);
});

test("HTTP accounts reject cross-origin requests, oversized input and unsafe callbacks", async (t) => {
  const { service, call } = await fixture(t);
  const app = express();
  mountAccounts(app, config, service);
  app.use((error, req, res, next) =>
    res.status(error.status || 500).json({ message: "Request rejected" }),
  );
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (route, data, requestOrigin = origin) =>
    fetch(`${base}/api/auth/${route}`, {
      method: "POST",
      headers: { origin: requestOrigin, "content-type": "application/json" },
      body: JSON.stringify(data),
    });
  assert.equal((await fetch(`${base}/api/auth/config`)).status, 200);
  assert.equal(
    (await request("sign-in/email", {}, "https://evil.example")).status,
    403,
  );
  assert.equal(
    (await request("sign-in/email", { payload: "x".repeat(17000) })).status,
    413,
  );
  assert.equal(
    (
      await request("sign-up/email", {
        name: "HTTP Creator",
        email: "http@example.test",
        password: "HttpPass123!",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await call("sign-in/social", {
        provider: "google",
        callbackURL: "https://evil.example",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request("sign-in/email", {
        email: "http@example.test",
        password: "HttpPass123!",
      })
    ).status,
    403,
  );
});
