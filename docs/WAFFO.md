# YT PFP 套餐与 Waffo 配置

## 已实现的规则

| 套餐 | 月费 USD | 每账户每日频道数 |
|---|---:|---:|
| Free | 0 | 1 |
| Starter | 3.88 | 100 |
| Pro | 9.88 | 1,000 |

一次指一个唯一频道：成功查询即解锁当天该频道的信息、预览和全部可用头像尺寸。重复查询、换尺寸、重复下载、使用同一频道的视频链接都不重复扣次数。查询失败不扣。每日 00:00 UTC 重置，不结转；跨日再次使用该频道会占新一天额度。所有操作需要登录，计数在独立 Neon 数据库中持久化，并发请求不会超额。

月付自动续费、无试用。取消续费后使用至已付费周期结束；到期或续费失败恢复 Free。退款撤销对应付费权限，当天已使用的频道数不重置。暂不支持立即升降级或按比例补差价，现有订阅结束后再购买其他套餐，避免重复订阅。

## 1. 在 Waffo Pancake 创建店铺及商品

使用 [Waffo](https://waffo.ai/) 的 Pancake 商户后台。可以使用自己的商户，但为 **YT PFP 单独创建店铺和商品**，不要填写 Typeflow 的商品 ID 或复用其用户数据库。

店铺网站：`https://www.ytpfp.com`。按后台要求提交真实经营主体、网站、客服、条款、隐私和退款政策资料，完成正式收款审核。审核条件以商户后台为准。

创建并发布两个订阅商品：

- **YT PFP Starter**：Subscription / Monthly，USD **3.88**，无试用。
- **YT PFP Pro**：Subscription / Monthly，USD **9.88**，无试用。

商品描述写明每日频道数、同频道所有尺寸共用一次、00:00 UTC 重置、自动续费及取消方式。保存 Store ID（`STO_…`）和两个独立 Product ID（`PROD_…`）。店铺必须启用生产模式，商品必须为 active。服务端会验证商品币种、月付周期及价格，防止配置错误。

## 2. Vercel → Settings → Environment Variables

填入这个网站自己的配置，先选择 **Production**：

| 变量 | 内容 |
|---|---|
| `WAFFO_ENVIRONMENT` | `prod` |
| `WAFFO_MERCHANT_ID` | 你的 Merchant ID（`MER_…`） |
| `WAFFO_PRIVATE_KEY` | 商户 RSA 私钥；支持 PEM、带字面量 `\n` 的 PEM 或 PKCS8 DER base64 |
| `WAFFO_STORE_ID` | YT PFP 店铺 ID |
| `WAFFO_STARTER_PRODUCT_ID` | Starter 商品 ID |
| `WAFFO_PRO_PRODUCT_ID` | Pro 商品 ID |

保留现有账号、SMTP、YouTube 和签名环境变量。`ACCOUNT_ORIGIN` 和 `PUBLIC_ORIGIN` 均为 `https://www.ytpfp.com`。不要添加 `VITE_` 前缀，不要把私钥发到聊天、截图或提交到仓库。环境变量保存后需要重新部署。

未填写 Waffo 凭证时 Free 正常可用，购买按钮明确提示暂未开放。要一次填全五项凭证；部分配置会使支付和额度接口报错。测试环境使用 `WAFFO_ENVIRONMENT=test`，测试与生产订单、额度隔离。

## 3. 数据库与 webhook

首次启用前执行（不自动读取开发 `.env`）：

```powershell
node --env-file=.env.accounts billing/migrate.mjs
```

输出成功后再部署代码。这个项目在 2026-11-02 已完成当前 Neon 表迁移，重复执行也安全。

在 Waffo 配置 webhook：

`https://www.ytpfp.com/api/billing/webhook`

订阅订单、订阅激活、支付成功、取消中、撤销取消、已取消、逾期和退款成功相关事件都应启用（包括 `order.completed`、`subscription.activated`、`subscription.payment_succeeded`、`subscription.canceling`、`subscription.uncanceled`、`subscription.canceled`、`subscription.past_due`、`refund.succeeded`；具体事件名以后台可选项为准）。服务端使用官方 SDK 验证原始请求签名、时间及店铺/环境，持久化并去重；处理失败返回 503，等待重试。

支付成功返回地址由服务器生成到套餐页；返回页面本身不授予权限。后端重新向 Waffo 验证订单归属、商品、已付费周期、币种、退款和环境后才开通。普通请求约每 60 秒刷新订阅状态；有效 webhook 或手动刷新可立即触发验证。账户页提供管理订阅及取消入口，有效或待完成订阅需先处理后才能删号。

## 4. 正式验收

1. 套餐页登录后勾选续费授权，检查结账页商品、币种、月费和税费。
2. 完成授权的真实购买，检查 webhook 返回 200、套餐生效及当天已用次数保留。
3. 同频道不同尺寸不加次数，新频道加一次；上限为 Starter 100 / Pro 1,000。
4. 验证取消续费、周期结束和退款后的权限；伪造成功返回 URL 不应升级。

**当前状态（2026-11-02）：Waffo 审核通过，独立正式店铺、两个商品、Production 环境变量和 RAW webhook 已配置，Vercel 正式部署已 Ready。正式域名健康检查正常，无签名回调返回 401；这只能确认配置初始化及签名校验已启用。真实购买、Waffo 签名回调到账、付费额度开通及取消/退款尚未完成正式验收。用户应从网站登录后的套餐页购买，避免直接使用不能绑定本站账户的公开商品链接。**

本次配置与部署凭证见 [waffo-production-setup.md](waffo-production-setup.md)。

官方参考：[SDK](https://docs.waffo.ai/integrate/sdks)、[订单查询](https://docs.waffo.ai/api-reference/endpoints/graphql/orders-and-payments)、[webhook](https://docs.waffo.ai/api-reference/webhooks)。
