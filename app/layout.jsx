import "./globals.css";

export const metadata = {
  title: "词间日和 · Words in Bloom",
  description:
    "ことばの記憶 — 考研单词学习花园：沉浸学习、记忆卡片、间隔复习与记忆测试，进度保存在本地浏览器。",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

/* 主题首帧初始化：内联脚本在样式生效前写入 data-theme，避免暗色下闪白 */
const themeInitScript = `(function(){try{var s=localStorage.getItem("wordsInBloomTheme");var t=(s==="light"||s==="dark")?s:(window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");document.documentElement.setAttribute("data-theme",t);}catch(e){document.documentElement.setAttribute("data-theme","light");}})();`;

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="motion-enabled">{children}</body>
    </html>
  );
}
