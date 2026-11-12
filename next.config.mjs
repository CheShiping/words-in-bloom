/** @type {import('next').NextConfig} */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

const nextConfig = {
  // 纯静态导出：构建产物在 out/，可直接部署到 GitHub Pages / Vercel / 任意静态托管。
  output: "export",
  basePath,
  assetPrefix: basePath || undefined,
  images: { unoptimized: true },
  trailingSlash: true,
  // 关闭开发模式的角标（Next Logo / 构建指示器），保持界面干净。
  devIndicators: false,
};

export default nextConfig;
