# YT PFP 登录注册配置

复用 Typeflow 的 Better Auth 流程，独立账号数据，不接支付。游客可以查询和预览（最多 400px）；登录后可以下载所选原尺寸。邮箱注册必须先验证邮件。支持 Google、找回密码、修改姓名/密码、退出登录、邮件确认删除账号。下载前暂存频道和尺寸，返回后重新查询以获取有效链接。

## 1. 独立 PostgreSQL 数据库

在 [Neon](https://console.neon.tech/) 新建 `ytpfp` 项目，不要填写 Typeflow 的数据库连接串。

- `DATABASE_URL`：Neon 的 pooled connection string，保留 `sslmode=require`。
- `DIRECT_DATABASE_URL`：同一个数据库的 direct connection string，供建表使用。
- `ACCOUNT_ORIGIN=https://ytpfp.com`
- `PUBLIC_ORIGIN=https://ytpfp.com`
- `BETTER_AUTH_SECRET`：独立生成并长期保存的随机密钥，至少 32 字符，与下载签名密钥不同。

生成密钥（在自己终端运行，将输出直接填入 Vercel，勿提交到 GitHub）：

```powershell
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

## 2. Google 登录

1. 打开 [Google Cloud Console](https://console.cloud.google.com/)，可使用之前启用 YouTube API 的项目。
2. Google Auth Platform → Branding：应用名称 `YT PFP`，设置支持邮箱和开发者邮箱；网站 `https://ytpfp.com`，隐私政策 `https://ytpfp.com/privacy.html`，服务条款 `https://ytpfp.com/terms.html`，授权域名 `ytpfp.com`。
3. Audience 选择 External。测试阶段把自己的 Google 邮箱加到 Test users；正式开放前选择 Publish app / In production。
4. Data Access 只使用登录必需的 `openid`、基本个人资料和邮箱，不申请 YouTube 管理权限。
5. Clients → Create client → Web application，名称 `YT PFP Web`。
6. Authorized JavaScript origins：`https://ytpfp.com`。
7. Authorized redirect URIs：**`https://ytpfp.com/api/auth/callback/google`**，必须完全一致。
8. 将 Client ID / Client secret 填入 Vercel 的 `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`，两项必须同时配置。YouTube API key 不能代替它们。

不复用 typing-animation.com 的客户端密钥。`www` 如有使用，建议重定向到裸域名，统一登录来源。Google 如要求验证域名，按控制台提示通过 Search Console 完成。这里只使用基本登录权限；以控制台实际审核要求为准。

## 3. 注册和找回密码邮件

例如用 [Resend](https://resend.com/)：添加并验证 `ytpfp.com` 发信域名，按其控制台添加 DNS 记录，再创建发送邮件用的 API key。

| Vercel 变量 | 填写内容 |
|---|---|
| `SMTP_HOST` | `smtp.resend.com` |
| `SMTP_PORT` | `465` |
| `SMTP_USER` | `resend` |
| `SMTP_PASS` | Resend API key |
| `SMTP_FROM` | `YT PFP <accounts@ytpfp.com>`，必须来自已验证的域名 |

也支持其他提供 TLS SMTP 的邮件服务，以供应商参数为准。未配置邮件时邮箱注册、找回密码和自助删除不可用；Google 配好后可单独使用。Google-only 用户的密码修改表单仅适用于已设置邮箱密码的账号。

## 4. 建表、部署

Vercel 项目 Node.js 选 **24.x**。保留现有 `YOUTUBE_API_KEY` 和 `DOWNLOAD_SIGNING_SECRET`，新增上述账号变量，均不加 `VITE_` 前缀。正式环境不要设置 `AUTH_DEV_MODE=true`。

首次部署前，在本机项目根目录创建 **被 Git 忽略的** `.env.accounts`，填写正式 `ACCOUNT_ORIGIN`、`DATABASE_URL`、`DIRECT_DATABASE_URL` 和 `BETTER_AUTH_SECRET`，并显式设置 `AUTH_DEV_MODE=false`。运行：

```powershell
node --env-file=.env.accounts accounts/migrate.mjs
```

看到 `YT PFP account schema is up to date.` 后在 Vercel Redeploy。建表是独立步骤，不在每个请求或构建时自动改生产数据库。迁移脚本优先读取 direct URL。本机 `.env` 中的开发配置不会覆盖上面命令显式设置的环境变量；如系统已设置 `AUTH_DEV_MODE`，请先移除。

## 5. 验收

1. 打开 `https://ytpfp.com/api/auth/config`，检查 configured / google / emailRegistration 是否为 true。
2. 无痕模式查询频道，下载应跳转登录，登录后返回并恢复所选尺寸。
3. 测试 Google 登录、邮箱注册 → 收信验证 → 登录、找回密码 → 重置 → 重新登录。
4. 退出后原尺寸下载应再次要求登录；账号页可改姓名和密码。
5. 测试账号可申请删除，在仍登录的同一浏览器打开确认邮件；旧会话应立即失效。

正式 Google 和真实邮件需要配置后在真实域名验证，本地测试邮箱不代表真实投递成功。

## 本地开发

本机 `.env` 使用 `ACCOUNT_ORIGIN=http://127.0.0.1:8788`、`AUTH_DEV_MODE=true`，运行 `pnpm dev`。独立 SQLite 和测试邮件保存在被 Git 和 Vercel 忽略的 `work/accounts/`。账号页下方的 Local test inbox 仅本机开发启用，不向真实邮箱发信。开发模式只允许回环域名，禁止部署到公网。

账号测试：`pnpm test`；构建：`pnpm build`。本地真实 API 下载验证可通过 `TEST_ACCOUNT_COOKIE` 提供测试账号的 cookie；不要将 cookie 写入仓库或公开日志。
