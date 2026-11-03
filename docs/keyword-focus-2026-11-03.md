# 首页关键词聚焦调整（第二轮）

日期：2026-11-03（中国时间）。目标：回应第三方密度榜覆盖仍为 6.33/10 的反馈。

## 修改

- 功能区补全产品名，明确桌面和手机适用；将含糊的 image file / image viewer 改成 JPG file / photo viewer。
- 尺寸区介绍改为产品检查可用分辨率、用户选择 PFP 尺寸；保留放大不增加源图细节的限制。
- 复制地址、手机保存、尺寸比较这三个 FAQ 的回答使用完整主语说明操作，形成自然的 “Use YT PFP Downloader to …” 句式。
- 在输入格式说明中用 URL 指代地址，避免过多重复泛称 link；少量 image 改成具体的 PFP 或 avatar。
- 不改 Title、Description、H1、规范 URL、额度或功能行为。

## 对照结果

以下为本地诊断，不是第三方检测器复测分数。统计线上修改前 HTML 与本地生产构建：正文去 head/script/style/svg，仅在文本块内部统计英文 n-gram；单词榜过滤公开列出的常见停用词，保留 yt 和 px，同频按字母顺序排列。完整结果和停用词见 keyword-focus-2026-11-03.json。

| 项目 | 调整前 | 调整后 |
|---|---|---|
| 总词数 | 1280 | 1313 |
| 完整词组 YT PFP Downloader | 7 次 | 12 次 |
| 1 词：pfp / downloader / yt | 第 9 / 11 / 18 | 第 3 / 6 / 10 |
| 2 词：yt pfp / pfp downloader | 第 3 / 4 | 第 1 / 2 |
| 3 词：yt pfp downloader | 第 1 | 第 1 |
| 4 词：use yt pfp downloader | 未进前十 | 第 1 |
| 5 词：use yt pfp downloader to | 未进前十 | 第 1 |

完整词组 12 次约占 1313 词的 2.74%（12×3÷1313）；该数字用于说明重复规模，不代表 Google 要求的密度阈值。第三方的停用词、分词、块边界及并列排名可能不同，因此不能据此承诺分数为 10/10。

## 验证

- pnpm build 与 pnpm seo:check 通过，七个可索引页面的 meta、唯一 H1、链接、schema、robots/sitemap 正常。
- 此轮仅改文案，未新增与实现重复的测试；上一轮 58 项测试已通过。
- 发布后以正式域名 HTML 与浏览器为准，验收结果见 keyword-focus-live-2026-11-03.json。
