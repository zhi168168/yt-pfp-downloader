import React, { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Eye,
  EyeOff,
  Loader2,
  Check,
  LogOut,
} from "lucide-react";
import "./account.css";


export async function accountAPI(path, data) {
  const response = await fetch(`/api/auth/${path}`, {
    method: data === undefined ? "GET" : "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: data === undefined ? {} : { "Content-Type": "application/json" },
    body: data === undefined ? undefined : JSON.stringify(data),
    signal: AbortSignal.timeout(20000),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(
      response.status === 429
        ? "Too many attempts. Please wait a minute and try again."
        : response.status >= 500
          ? "Account service is temporarily unavailable. Please try again."
          : "Please check your details and try again.",
    );
    error.code =
      result?.code ||
      (result?.message === "Origin is not allowed"
        ? "INVALID_ORIGIN"
        : undefined);
    error.status = response.status;
    throw error;
  }
  return result;
}

export function AccountLink({ returnTo = "/" }) {
  const [user, setUser] = useState(null);
  useEffect(() => {
    let active = true;
    accountAPI("config")
      .then((config) => (config.configured ? accountAPI("get-session") : null))
      .then((session) => {
        if (active) setUser(session?.user || null);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  return (
    <a
      className="account-nav-link"
      href={`/account?returnTo=${encodeURIComponent(returnTo)}`}
    >
      {user && (
        <span className="account-avatar" aria-hidden="true">
          {(user.name || user.email)[0].toUpperCase()}
        </span>
      )}
      <span>{user ? "My account" : "Sign in"}</span>
    </a>
  );
}

function PasswordField({
  label = "Password",
  name = "password",
  autoComplete = "current-password",
  required = true,
}) {
  const [visible, setVisible] = useState(false);
  return (
    <label className="account-field">
      <span>{label}</span>
      <div className="account-password">
        <input
          aria-label={label}
          name={name}
          type={visible ? "text" : "password"}
          required={required}
          minLength={8}
          maxLength={128}
          autoComplete={autoComplete}
        />
        <button
          type="button"
          aria-label={`${visible ? "Hide" : "Show"} ${label.toLowerCase()}`}
          onClick={() => setVisible((value) => !value)}
        >
          {visible ? <EyeOff size={17} /> : <Eye size={17} />}
        </button>
      </div>
    </label>
  );
}

const views = {
  login: ["Welcome back.", "Sign in to your YT PFP account."],
  register: [
    "Make yourself at home.",
    "Create your account. Start with your email.",
  ],
  forgot: [
    "Forgot your password?",
    "We will send you a link to choose a new one.",
  ],
  reset: ["A fresh start.", "Choose a new password for your account."],
  verify: [
    "Check your inbox.",
    "Confirm your email address before signing in.",
  ],
  account: ["Your account.", "A little space for your details."],
  delete: [
    "Delete your account?",
    "Please read the details before continuing.",
  ],
  mailbox: [
    "Local test inbox.",
    "Preview emails generated on this computer. No email is sent to a real inbox.",
  ],
};

export function AccountPage() {
  const query = new URLSearchParams(window.location.search);
  const requestedView = query.get("view");
  const [view, setView] = useState(
    Object.hasOwn(views, requestedView) ? requestedView : "login",
  );
  const [config, setConfig] = useState(null),
    [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(""),
    [error, setError] = useState(""),
    [mail, setMail] = useState([]);
  const returnTo = ["/"].includes(query.get("returnTo"))
    ? query.get("returnTo")
    : "/";
  const accountURL = (extra = {}) => {
    const url = new URL("/account", window.location.origin);
    url.searchParams.set("returnTo", returnTo);
    for (const [key, value] of Object.entries(extra))
      url.searchParams.set(key, value);
    return url.href;
  };
  function navigate(next) {
    setView(next);
    setError("");
    setNotice("");
    const url = new URL(accountURL({ view: next }));
    history.replaceState({}, "", `${url.pathname}${url.search}`);
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const settings = await accountAPI("config");
        if (!active) return;
        setConfig(settings);
        if (!settings.configured) {
          setError(
            "Sign-in is currently unavailable. You can keep looking up and previewing avatars; downloads require sign-in.",
          );
          return;
        }
        const session = await accountAPI("get-session");
        if (!active) return;
        setUser(session?.user || null);
        if (!session?.user && ["account", "delete"].includes(requestedView))
          setView("login");
        if (
          session?.user &&
          !["reset", "delete", "mailbox"].includes(requestedView)
        )
          setView("account");
        if (query.has("download"))
          setNotice(
            "Sign in to download for free. Your channel and selected size are saved on this device.",
          );
        if (query.has("verified"))
          setNotice("Email verified. You can now sign in.");
        if (query.has("deleted"))
          setNotice(
            "Your account has been deleted.",
          );
        if (query.has("error"))
          setError(
            "This link is invalid, expired, or sign-in could not be completed. Please try again.",
          );
      } catch {
        if (active)
          setError(
            "We could not connect to the account service. Reload the page to try again.",
          );
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);
  async function action(task) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await task();
    } catch (failure) {
      const messages = {
        INVALID_ORIGIN:
          "Sign-in could not start because this website address does not match its account configuration.",
        INVALID_CALLBACK_URL:
          "Sign-in could not start because the return address is not allowed.",
        INVALID_ERROR_CALLBACK_URL:
          "Sign-in could not start because the return address is not allowed.",
        INVALID_EMAIL_OR_PASSWORD: "Email or password is incorrect.",
        EMAIL_NOT_VERIFIED:
          "Please verify your email first. You can request a new verification link below.",
        INVALID_PASSWORD: "Your current password is incorrect.",
        INVALID_TOKEN: "This link is invalid or expired. Request a new one.",
        TOKEN_EXPIRED: "This link has expired. Request a new one.",
        PASSWORD_TOO_SHORT: "Use at least 8 characters for your password.",
      };
      setError(
        messages[failure.code] ||
          failure.message ||
          "Unable to complete this request. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function submit(event) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    if (
      ["register", "reset"].includes(view) &&
      data.password !== data.confirmPassword
    ) {
      setError("Passwords do not match.");
      return;
    }
    await action(async () => {
      if (view === "login") {
        await accountAPI("sign-in/email", {
          email: data.email,
          password: data.password,
        });
        const session = await accountAPI("get-session");
        if (!session?.user)
          throw new Error("Sign-in could not be completed. Please try again.");
        window.location.assign(returnTo);
      } else if (view === "register") {
        await accountAPI("sign-up/email", {
          name: data.name.trim(),
          email: data.email,
          password: data.password,
          callbackURL: accountURL({ verified: "1" }),
        });
        navigate("verify");
        setNotice(
          "If this address can be registered, a verification email will arrive shortly. Check your inbox and spam folder.",
        );
      } else if (view === "forgot") {
        await accountAPI("request-password-reset", {
          email: data.email,
          redirectTo: accountURL({ view: "reset" }),
        });
        setNotice(
          "If an eligible account exists, a password reset email will arrive shortly.",
        );
      } else if (view === "verify") {
        await accountAPI("send-verification-email", {
          email: data.email,
          callbackURL: accountURL({ verified: "1" }),
        });
        setNotice(
          "If verification is needed, a new email will arrive shortly.",
        );
      } else if (view === "reset") {
        const token = new URLSearchParams(window.location.search).get("token");
        if (!token)
          throw new Error(
            "This reset link is incomplete. Request a new password reset link.",
          );
        await accountAPI("reset-password", {
          token,
          newPassword: data.password,
        });
        navigate("login");
        setNotice("Password updated. Sign in with your new password.");
      } else if (view === "delete") {
        if (data.confirmation !== "DELETE")
          throw new Error("Type DELETE exactly to continue.");
        await accountAPI("delete-user", {
          callbackURL: accountURL({ deleted: "1" }),
        });
        setNotice(
          "A confirmation link has been sent. Open it within one hour in this browser while signed in. Nothing is deleted until you confirm.",
        );
      }
    });
  }
  const disabled = loading || busy || !config?.configured;
  const [title, description] = views[view];
  const emailAllowed = Boolean(config?.emailRegistration);
  return (
    <div className="account-layout">
      <nav className="account-topbar" aria-label="Account navigation">
        <a className="site-wordmark" href="/">
          <img
            className="brand-logo"
            src="/favicon.svg"
            width="32"
            height="32"
            alt=""
          />
          YT PFP
        </a>
        <a className="account-back" href={returnTo}>
          <ArrowLeft size={16} /> Back to{" "}
          home
        </a>
      </nav>
      <main
        className={`account-content${view === "account" ? " is-profile" : ""}`}
      >
        <div className="account-heading">
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        {loading && (
          <p className="account-loading" role="status">
            <Loader2 size={17} className="spin" /> Loading your account…
          </p>
        )}
        {error && (
          <p className="account-message is-error" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="account-message" role="status">
            <Check size={17} />
            {notice}
          </p>
        )}
        {!loading && view === "account" && user ? (
          <>
            <div className="account-identity">
              <span className="account-avatar">
                {(user.name || user.email)[0].toUpperCase()}
              </span>
              <div>
                <strong>{user.name}</strong>
                <span>{user.email}</span>
                <small>
                  {user.emailVerified ? "Email verified" : "Email not verified"}
                </small>
              </div>
            </div>
            <section className="account-section">
              <h2>Profile</h2>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  const data = new FormData(event.currentTarget);
                  action(async () => {
                    await accountAPI("update-user", {
                      name: String(data.get("name")).trim(),
                    });
                    const session = await accountAPI("get-session");
                    setUser(session.user);
                    setNotice("Your profile has been updated.");
                  });
                }}
              >
                <fieldset disabled={busy}>
                  <label className="account-field">
                    <span>Name</span>
                    <input
                      name="name"
                      defaultValue={user.name}
                      required
                      maxLength={100}
                      autoComplete="name"
                    />
                  </label>
                  <button className="account-secondary" type="submit">
                    Save changes
                  </button>
                </fieldset>
              </form>
            </section>
            <section className="account-section">
              <h2>Change password</h2>
              <p>For accounts that use email and password.</p>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  const form = event.currentTarget;
                  const data = new FormData(form);
                  if (data.get("newPassword") !== data.get("confirmPassword")) {
                    setError("Passwords do not match.");
                    return;
                  }
                  action(async () => {
                    await accountAPI("change-password", {
                      currentPassword: data.get("currentPassword"),
                      newPassword: data.get("newPassword"),
                      revokeOtherSessions: true,
                    });
                    form.reset();
                    setNotice(
                      "Password updated. Other sessions have been signed out.",
                    );
                  });
                }}
              >
                <fieldset disabled={busy}>
                  <PasswordField
                    label="Current password"
                    name="currentPassword"
                  />
                  <PasswordField
                    label="New password"
                    name="newPassword"
                    autoComplete="new-password"
                  />
                  <PasswordField
                    label="Confirm new password"
                    name="confirmPassword"
                    autoComplete="new-password"
                  />
                  <button className="account-secondary" type="submit">
                    Update password
                  </button>
                </fieldset>
              </form>
            </section>

            <div className="account-profile-actions">
              <button
                className="account-secondary"
                disabled={busy}
                onClick={() =>
                  action(async () => {
                    await accountAPI("sign-out", {});
                    setUser(null);
                    navigate("login");
                    setNotice("You have signed out.");
                  })
                }
              >
                <LogOut size={16} /> Sign out
              </button>
              <button
                className="account-danger-link"
                disabled={!config.accountDeletion || busy}
                onClick={() => navigate("delete")}
              >
                Delete account
              </button>
            </div>
            <a className="account-primary" href={returnTo}>
              Back to downloader <ArrowRight size={16} />
            </a>
          </>
        ) : !loading && view === "mailbox" ? (
          <>
            <button
              className="account-secondary"
              disabled={busy}
              onClick={() =>
                action(async () => {
                  const response = await fetch("/api/dev/mailbox", {
                    cache: "no-store",
                  });
                  if (!response.ok)
                    throw new Error("Local test inbox is unavailable.");
                  setMail(await response.json());
                })
              }
            >
              Refresh inbox
            </button>
            {mail.map((message) => (
              <article className="account-mail" key={message.id}>
                <small>
                  {message.to} · {new Date(message.date).toLocaleString()}
                </small>
                <h2>{message.subject}</h2>
                <p>{message.text.split("\n\n")[0]}</p>
                {message.text.match(/https?:\/\/[^\s]+/g)?.map((url) =>
                  new URL(url).origin === window.location.origin ? (
                    <a className="account-secondary" href={url} key={url}>
                      Open email link <ArrowRight size={15} />
                    </a>
                  ) : null,
                )}
              </article>
            ))}
          </>
        ) : (
          !loading && (
            <>
              {["login", "register"].includes(view) && (
                <>
                  <button
                    className="account-google"
                    disabled={disabled || !config?.google}
                    onClick={() =>
                      action(async () => {
                        const result = await accountAPI("sign-in/social", {
                          provider: "google",
                          callbackURL: new URL(returnTo, location.origin).href,
                          errorCallbackURL: accountURL({ error: "1" }),
                        });
                        const destination = new URL(result.url);
                        if (
                          destination.protocol !== "https:" ||
                          destination.hostname !== "accounts.google.com"
                        )
                          throw new Error(
                            "Google sign-in is temporarily unavailable.",
                          );
                        location.assign(destination.href);
                      })
                    }
                  >
                    <svg
                      className="google-icon"
                      aria-hidden="true"
                      viewBox="0 0 24 24"
                      width="20"
                      height="20"
                    >
                      <path
                        fill="#4285F4"
                        d="M21.6 12.227c0-.709-.064-1.391-.182-2.045H12v3.868h5.382a4.6 4.6 0 0 1-1.996 3.018v2.509h3.233c1.891-1.741 2.981-4.305 2.981-7.35Z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 22c2.7 0 4.964-.895 6.619-2.423l-3.233-2.509c-.895.6-2.041.955-3.386.955-2.605 0-4.81-1.76-5.596-4.123H3.062v2.591A10 10 0 0 0 12 22Z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M6.404 13.9A6 6 0 0 1 6.09 12c0-.659.114-1.3.314-1.9V7.509H3.062A10 10 0 0 0 2 12c0 1.614.386 3.141 1.062 4.491L6.404 13.9Z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 5.977c1.468 0 2.786.505 3.823 1.496l2.868-2.868C16.959 2.991 14.695 2 12 2a10 10 0 0 0-8.938 5.509L6.404 10.1C7.19 7.736 9.395 5.977 12 5.977Z"
                      />
                    </svg>{" "}
                    Continue with Google
                  </button>
                  {!config?.google && (
                    <p className="account-provider-note">
                      Google sign-in is not available yet.
                    </p>
                  )}
                  <div className="account-divider">
                    <span>or continue with email</span>
                  </div>
                </>
              )}
              {view === "delete" && (
                <p className="account-delete-copy">
                  Deleting your account permanently removes your profile, linked
                  sign-ins and active sessions. Your Google account and
                  channel lookup on this device are kept. We will email a
                  confirmation link before deleting anything.
                </p>
              )}
              <form key={view} onSubmit={submit}>
                <fieldset disabled={disabled}>
                  {view === "register" && (
                    <label className="account-field">
                      <span>Name</span>
                      <input
                        name="name"
                        autoComplete="name"
                        required
                        maxLength={100}
                      />
                    </label>
                  )}
                  {["login", "register", "forgot", "verify"].includes(view) && (
                    <label className="account-field">
                      <span>Email address</span>
                      <input
                        type="email"
                        name="email"
                        autoComplete="email"
                        required
                        maxLength={254}
                      />
                    </label>
                  )}
                  {["login", "register", "reset"].includes(view) && (
                    <PasswordField
                      autoComplete={
                        view === "login" ? "current-password" : "new-password"
                      }
                    />
                  )}
                  {["register", "reset"].includes(view) && (
                    <>
                      <p className="account-password-hint">
                        Use at least 8 characters.
                      </p>
                      <PasswordField
                        label="Confirm password"
                        name="confirmPassword"
                        autoComplete="new-password"
                      />
                    </>
                  )}
                  {view === "delete" && (
                    <label className="account-field">
                      <span>Type DELETE to continue</span>
                      <input
                        name="confirmation"
                        required
                        pattern="DELETE"
                        autoComplete="off"
                      />
                    </label>
                  )}
                  {view === "reset" && !query.get("token") && (
                    <p className="account-message is-error">
                      This link is incomplete. Request a new reset link.
                    </p>
                  )}
                  <button
                    className="account-primary"
                    type="submit"
                    disabled={
                      disabled ||
                      (view !== "login" && !emailAllowed) ||
                      (view === "reset" && !query.get("token"))
                    }
                  >
                    {busy && <Loader2 size={16} className="spin" />}
                    {
                      {
                        login: "Sign in",
                        register: "Create account",
                        forgot: "Send reset link",
                        reset: "Update password",
                        verify: "Resend verification email",
                        delete: "Send deletion confirmation",
                      }[view]
                    }
                  </button>
                </fieldset>
              </form>
              {!emailAllowed && config?.configured && view !== "login" && (
                <p className="account-provider-note">
                  Email registration and recovery are not available yet.
                </p>
              )}
              <div className="account-form-links">
                {view === "login" ? (
                  <>
                    <button onClick={() => navigate("forgot")}>
                      Forgot password?
                    </button>
                    <button onClick={() => navigate("verify")}>
                      Resend verification email
                    </button>
                    <p>
                      New to YT PFP?{" "}
                      <button onClick={() => navigate("register")}>
                        Create an account
                      </button>
                    </p>
                  </>
                ) : (
                  <button onClick={() => navigate(user ? "account" : "login")}>
                    {user ? "Cancel and return to account" : "Back to sign in"}
                  </button>
                )}
              </div>
            </>
          )
        )}
        <p className="account-footnote">
          Look up and preview for free. Sign in to download.{" "}
          <a href="/about.html">About</a> · <a href="/contact.html">Contact</a>{" "}
          · <a href="/privacy.html">Privacy</a> ·{" "}
          <a href="/terms.html">Terms</a>
          <br />Customer support: <a href="mailto:zhihaosong168@gmail.com">zhihaosong168@gmail.com</a>
        </p>
        {config?.localMailbox && view !== "mailbox" && (
          <a
            className="account-local-note"
            href={accountURL({ view: "mailbox" })}
          >
            Local preview: open the test inbox
          </a>
        )}
      </main>
    </div>
  );
}
