# ChargePal（充小助）

智能新能源汽车充电管理系统。支持记录充电明细、统计能耗费用、多车管理、主题切换，以及可选的 Supabase 云端同步与 PWA 安装体验。

---

## 项目特性

- 🚗 **多车管理**：支持车辆信息维护（名称、电池容量、初始里程、车牌）。
- 🧾 **充电记录**：记录充电类型、起止 SoC、电量、费用、里程等。
- 📊 **数据分析**：仪表盘展示总能耗、总费用、平均能耗、充电趋势等。
- ☁️ **云端同步（可选）**：通过 Supabase 双向同步本地数据。
- 🌗 **主题模式**：支持浅色 / 深色 / 跟随系统。
- 📱 **PWA 支持**：可安装到主屏幕，具备基础离线访问能力。
- 🔔 **安装提示**：内置安装引导（含 iOS Safari 手动安装提示）。

---

## 技术栈

- **前端框架**：React 19 + TypeScript
- **构建工具**：Vite 6
- **图表库**：Recharts
- **图标库**：Lucide React
- **后端服务（可选）**：Supabase
- **PWA**：vite-plugin-pwa + Workbox

---

## 快速开始

### 1. 环境要求

- Node.js 18+
- npm 9+

### 2. 安装依赖

```bash
npm install
```

### 3. 启动开发环境

```bash
npm run dev
```

默认访问地址：`http://localhost:3000`

---

## 可用脚本

```bash
# 启动开发服务器
npm run dev

# 重新生成 PWA 图标
npm run pwa:icons

# 生产构建
npm run build

# 预览生产构建
npm run preview
```

---

## PWA 说明

本项目已接入 PWA，主要能力如下：

- 生成 `manifest.webmanifest` 与 `sw.js`
- 预缓存静态资源，支持基础离线访问
- 对 Supabase/API 请求采用 `NetworkOnly`，避免实时数据陈旧
- iOS Safari 头部标签已配置（`apple-mobile-web-app-*`）

### 图标资源

图标位于：`public/icons/`

- `icon-16x16.png`
- `icon-32x32.png`
- `apple-touch-icon.png`
- `icon-192x192.png`
- `icon-512x512.png`
- `icon-maskable-512x512.png`
- `source/icon.svg`（源文件）

---

## 云端同步配置（可选）

在应用“设置”中配置 Supabase：

- `projectUrl`
- `apiKey`

配置后可手动同步或开启自动同步。

> 注意：为保证云端数据唯一识别，启用同步前请确保车辆已填写车牌号。

---

## 项目结构（简要）

```text
.
├─ App.tsx                      # 应用主入口
├─ components/                  # 业务组件（仪表盘、记录、设置、安装提示）
├─ hooks/                       # 自定义 Hook（安装提示等）
├─ services/                    # 本地存储与同步逻辑
├─ public/icons/                # PWA 图标资源
├─ scripts/generate-pwa-icons.mjs
├─ vite.config.ts               # Vite + PWA 配置
└─ index.html
```

---

## 构建与发布建议

发布前建议至少执行：

```bash
npm run pwa:icons
npx tsc --noEmit
npm run build
```

如需验证 PWA 安装效果，请使用生产构建预览（`npm run preview`）并在浏览器开发者工具 Application 面板检查 Manifest 与 Service Worker。

---

## 版本

当前版本：`1.3.0`
