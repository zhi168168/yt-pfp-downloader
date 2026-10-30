# Vercel 部署方法

GitHub 仓库：https://github.com/zhi168168/yt-pfp-downloader

## 导入

1. 打开 Vercel → Add New → Project。
2. 导入 `zhi168168/yt-pfp-downloader`，分支选 `main`。
3. Framework Preset 选 **Vite**，Root Directory 保持仓库根目录。
4. 配置文件已指定：Install `pnpm install --frozen-lockfile`，Build `pnpm build`，Output `dist`。
5. Node.js 使用 **24.x**。

## 首次 Deploy 前填写环境变量

**登录版还需先完成 [账号、Google 和邮件配置](accounts.md)，包括独立数据库建表。仅填写下方两项无法启用下载所需的登录功能。**

| 名称 | 填写内容 | 范围 |
|---|---|---|
| `YOUTUBE_API_KEY` | 已申请的 YouTube Data API 密钥 | Production、Preview |
| `DOWNLOAD_SIGNING_SECRET` | 至少 32 字符的随机字符串，所有环境中保持稳定 | Production、Preview |

这两项可以从本机项目根目录的 `.env` 中复制。`.env` 不会提交到 GitHub。
不要给变量名添加 `VITE_` 前缀，不要把密钥写进客户端代码。
如果要自行生成下载签名密钥，可在本机执行：

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

可选变量 `PUBLIC_ORIGIN`：绑定正式域名后填写 `https://你的域名`，不带路径。
未填时构建会优先用 Vercel 提供的 `VERCEL_PROJECT_PRODUCTION_URL` 生成
canonical、robots sitemap 链接和 sitemap.xml。

**不要复制本机的 `HTTP_PROXY`、`HTTPS_PROXY`、`NO_PROXY`、`HOST`、`PORT` 到 Vercel。**

## 部署后检查

1. 首页输入 `@YouTube`，应看到频道和九档可用图片尺寸。
2. 选一个尺寸，点击 Download JPG，确认下载成功。
3. 输入 `https://youtu.be/jNQXAC9IVRw`，应识别 jawed 频道。
4. 打开 `/api/health`，应返回 `{"ok":true,"configured":true}`。
5. 查看 `/robots.txt`、`/sitemap.xml` 和 About/Privacy/Terms/Contact。

如果出现 `NOT_CONFIGURED`，检查两个必填变量，并在修改环境变量后重新部署。
如果出现 `API_CONFIGURATION`，检查 YouTube Data API v3 是否启用、API 密钥
是否仅限制到正确 API，以及是否设置了不适用于 Vercel 的本机固定 IP 限制。

## 实现说明

- Vite 产物由 Vercel 静态托管；三个 `api/*.mjs` 是 Node Functions。
- 本地仍可使用 `pnpm dev` / `pnpm start`，不影响现有本地工作流。
- Functions 不需要监听端口；接口支持 Vercel 已解析的 JSON 请求体。
- 图片下载签名使用统一环境密钥，可跨函数实例、冷启动验证。
- 内存缓存和每 IP 限流仅在当前函数实例生效，不是跨实例全局限流；
  公开推广后若需要统一流量控制，应配置 Vercel Firewall 或共享存储。
- 本次只准备并测试部署适配，没有创建 Vercel 项目或执行公网部署。
