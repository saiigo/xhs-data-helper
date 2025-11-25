# 小红书数据助手

🚀 轻松保存你喜欢的小红书笔记 - 基于 Electron + React 的现代化桌面应用

<br />

![Electron](https://img.shields.io/badge/v37.3.1-Electron-blue) &nbsp;
![React](https://img.shields.io/badge/v19.1.1-React-blue) &nbsp;
![TypeScript](https://img.shields.io/badge/v5.9.2-TypeScript-blue) &nbsp;
![Shadcn](https://img.shields.io/badge/Shadcn-UI-blue) &nbsp;
![Python](https://img.shields.io/badge/v3.x-Python-blue)

<br />

## 简介

小红书数据助手是一款帮助你保存小红书内容的桌面软件,提供简单友好的界面来下载笔记中的图片和视频。

### 核心功能

- 🎯 **三种下载模式**: 指定笔记、博主笔记、搜索结果
- 🔐 **Cookie 管理**: AES-256-CBC 加密存储,自动验证有效性
- 📊 **实时进度**: 进度条、日志流、状态显示
- 💾 **灵活保存**: 支持 Excel、媒体文件(图片/视频)多种导出方式
- 🌓 **主题切换**: 亮色/暗色模式自由切换
- 🔧 **代理支持**: 可选 HTTP/HTTPS 代理配置

<br />

## 技术栈

- **前端**: React 18 + TypeScript + Shadcn UI + Tailwind CSS
- **后端**: Electron (Main Process)
- **下载引擎**: [Spider_XHS](https://github.com/cv-cat/Spider_XHS) (Python)
- **构建工具**: electron-vite
- **通信协议**: JSON Lines (Python ↔ Electron)
- **IPC 层**: Conveyor (类型安全的进程间通信)

<br />

## 快速开始

### 1. 克隆项目

```bash
git clone <your-repository-url>
cd xhs-helper

# 初始化 git submodule (重要!)
git submodule update --init --recursive
```

### 2. 安装依赖

```bash
# 安装 Node.js 依赖
pnpm install

# 安装 Python 依赖
cd python-engine
pip3 install -r requirements.txt
cd ..
```

### 3. 运行开发环境

```bash
pnpm run dev
```

应用将自动启动,访问 http://localhost:5173/

<br />

## 使用指南

### 第一步: 配置 Cookie

1. 访问 [小红书网页版](https://www.xiaohongshu.com) 并登录
2. 按 `F12` 打开开发者工具,切换到 **Network** 标签
3. 刷新页面,找到任意请求
4. 在请求头中找到 `Cookie`,复制完整的值
5. 在软件的「设置」页面粘贴并保存

### 第二步: 配置保存路径

在「设置」页面配置:

- 媒体文件保存路径 (图片、视频)
- Excel 文件保存路径

### 第三步: 选择要下载的内容

在「下载」页面:

#### 模式 1: 指定笔记

```
输入笔记 URL (每行一个):
https://www.xiaohongshu.com/explore/xxxxx?xsec_token=...
https://www.xiaohongshu.com/explore/yyyyy?xsec_token=...
```

#### 模式 2: 博主笔记

```
输入博主主页链接:
https://www.xiaohongshu.com/user/profile/xxxxx?xsec_token=...
```

#### 模式 3: 搜索结果

```
关键词: 榴莲
下载数量: 50
排序方式: 最新
笔记类型: 不限
时间范围: 一周内
```

### 第四步: 查看进度

切换到「进度」页面:

- 查看实时日志 (INFO/WARNING/ERROR 分级显示)
- 跟踪进度条
- 随时停止任务
- 导出日志
- 打开结果文件夹

<br />

## 项目结构

```
xhs-helper/
├── app/                           # React 前端 (Renderer Process)
│   ├── pages/
│   │   ├── SettingsPage.tsx       # Cookie、路径、代理配置
│   │   ├── TaskConfigPage.tsx     # 下载任务创建
│   │   └── MonitorPage.tsx        # 实时进度监控
│   ├── components/ui/             # Shadcn UI 组件
│   └── app.tsx                    # 主应用 + 导航
│
├── lib/
│   ├── main/                      # Electron Main Process
│   │   └── spider/
│   │       ├── python-bridge.ts   # Python 子进程管理
│   │       └── config-manager.ts  # 配置持久化 + 加密
│   │
│   └── conveyor/                  # IPC 通信层
│       ├── api/                   # Renderer 侧 API
│       ├── handlers/              # Main Process 处理器
│       └── schemas/               # Zod 类型验证
│
└── python-engine/                 # Spider_XHS (Git Submodule)
    ├── cli.py                     # Electron 调用的 CLI 入口
    ├── main.py                    # 原始下载主程序
    └── xhs_utils/                 # 下载工具库
```

<br />

## Python 集成说明

### 通信协议

应用通过 JSON Lines 协议与 Python 通信:

**输入** (Electron → Python):

```json
{
  "cookie": "webId=xxx; a1=xxx;...",
  "taskType": "search",
  "params": {
    "query": "榴莲",
    "requireNum": 50,
    "sortType": 0
  },
  "saveOptions": {
    "mode": "all",
    "excelName": "榴莲搜索",
    "mediaTypes": ["video", "image"]
  },
  "paths": {
    "media": "/path/to/media",
    "excel": "/path/to/excel"
  }
}
```

**输出** (Python → Electron):

```json
{"type": "log", "level": "INFO", "message": "开始下载..."}
{"type": "progress", "current": 10, "total": 50, "message": "正在处理第10条"}
{"type": "done", "success": true, "count": 50}
{"type": "error", "code": "COOKIE_INVALID", "message": "Cookie已失效"}
```

### Submodule 管理

```bash
# 更新 python-engine 到最新版本
git submodule update --remote python-engine

# 检查 submodule 状态
git submodule status
```

<br />

## 安全性

### Cookie 加密

- 算法: AES-256-CBC
- 密钥: SHA-256(机器 ID)
- IV: 每次加密随机生成
- 存储: `~/.xhs-helper-config.json`

### 数据验证

- Zod schemas 进行运行时类型检查
- 文件路径验证
- Cookie 过期验证

<br />

## 开发调试

### 日志位置

- **Renderer 日志**: Chrome DevTools (Cmd+Option+I)
- **Main Process 日志**: Terminal 输出
- **Python 日志**: Electron 终端 stderr

### 常见问题

**Q: Python 进程无法启动?**

```bash
# 检查 Python 路径
which python3

# 检查依赖
cd python-engine && pip3 list | grep execjs
```

**Q: Cookie 总是显示无效?**

- 确保复制完整的 Cookie 字符串 (包括所有键值对)
- 检查 Cookie 是否包含 `webId`, `a1`, `webBuild` 等关键字段

**Q: 爬取失败?**

- 检查代理设置是否正确
- 查看「进度」页面的详细错误日志
- 尝试手动运行: `cd python-engine && python3 cli.py '{...}'`

<br />

## 构建生产版本

```bash
# macOS
pnpm run build:mac

# Windows
pnpm run build:win

# Linux
pnpm run build:linux
```

打包产物位于 `dist/` 目录。

⚠️ **注意**: 生产环境需要将 Python 运行时一起打包 (使用 PyInstaller 或 Nuitka)

<br />

## 开发路线图

- [ ] Python 运行时打包 (独立运行,无需系统 Python)
- [ ] 跨平台路径处理优化
- [ ] 任务队列 (支持多任务并行)
- [ ] 结果预览 (在软件内查看下载结果)
- [ ] 定时任务
- [ ] 登录集成 (二维码登录)

<br />

## 许可证

MIT License

<br />

## 致谢

- [Spider_XHS](https://github.com/cv-cat/Spider_XHS) - 核心下载引擎
- [Shadcn UI](https://ui.shadcn.com) - UI 组件库

---

**Version**: 1.0.0
**Last Updated**: 2025-11-23
**Status**: ✅ 核心功能完成,可用于日常使用
