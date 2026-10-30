# 登录功能验证（2026-10-30）

基于 D:\tools\typeflow 的 Better Auth 实现迁移，未复制其数据库、用户或密钥，无支付代码。

- `pnpm test`：42 项通过。包含真实 SQLite 账号生命周期、邮箱验证、姓名/密码修改、密码找回、重置后会话撤销、退出、重新打开数据库后持久化、同浏览器邮件确认删除、跨站/超大请求拒绝、非法 OAuth 回调拒绝。
- 下载接口使用真实会话验证：游客 401、退出后旧 cookie 401、登录用户得到 1280px JPG。公开预览上限 400px，inline=2 原图也要求登录，受保护图片响应 no-store。
- `pnpm build` 通过；增加 account.html，Vercel auth rewrite、数据库迁移脚本和 Node 24 配置。
- 浏览器本地实测：注册测试账号 → 本地测试邮箱验证 → 游客查询 @YouTube 并选择 240px → 下载跳转登录 → 登录返回恢复频道及 240px → 成功下载 → 账号页退出。
- 手机视口 390×844：页面宽度与滚动宽度均 390，无横向溢出；桌面和手机截图在 screenshots/account-desktop.png / account-mobile.png。
- 正式 PostgreSQL、Google OAuth 和真实 SMTP 尚未配置或实测；本地邮件不会发送到真实邮箱。部署步骤见 accounts.md。
