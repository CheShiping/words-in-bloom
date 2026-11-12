# 词间日和 · Words in Bloom

一个面向考研英语词汇的纯静态单词学习应用。提供单词浏览、沉浸学习、记忆卡片、测验和收藏等功能；学习进度保存在当前浏览器中，无需后端服务。

## 功能

- **首页**：查看学习概况与学习进度。
- **词典库**：按课程、类别和学习状态浏览、筛选单词。
- **沉浸学习**：逐词学习，并记录掌握状态。
- **记忆卡片**：通过卡片复习词汇。
- **记忆测试**：练习并检查单词记忆。
- **收藏夹**：集中查看收藏的单词。
- **本地进度**：学习状态、收藏和复习数据保存在浏览器 `localStorage` 中。
- **静态部署**：Next.js 导出静态文件到 `out/`，可部署到 GitHub Pages、Vercel 或其他静态托管服务。

## 技术栈

- Next.js 15
- React 19
- GSAP
- 单词目录：`public/data/catalog.json`

## 本地运行

### 环境要求

- Node.js 18.18 或更高版本
- npm

### 安装依赖并启动开发服务器

```bash
npm install
npm run dev
```

在浏览器打开 [http://localhost:3000](http://localhost:3000)。

### 构建和预览

```bash
npm run build
npm run start
```

构建完成后，静态站点文件位于 `out/`。`npm run start` 会通过 `npx serve out` 在本地预览构建结果。

## 部署

运行 `npm run build`，然后将 `out/` 目录发布到静态托管平台。

如果部署在域名根路径以外的子路径，需要在构建前设置 `NEXT_PUBLIC_BASE_PATH`，使页面和静态资源使用相同的基础路径。例如，Windows PowerShell：

```powershell
$env:NEXT_PUBLIC_BASE_PATH = "/words-in-bloom"
npm run build
```

## 更新单词目录

单词数据由 `public/data/catalog.json` 提供。项目包含 Excel 转换脚本 `scripts/build_catalog.py`；如需从工作簿重新生成目录，请确保已安装 Python 和 `openpyxl`，并准备脚本默认位置 `../考研单词-5920.xlsx` 的工作簿：

```bash
python -m pip install openpyxl
npm run catalog
```

也可以直接调用脚本并指定输入、输出路径：

```bash
python scripts/build_catalog.py <工作簿路径.xlsx> <输出路径.json>
```
