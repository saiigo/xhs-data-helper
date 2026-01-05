<div align="center">

# 小红书数据助手

**批量采集小红书博主笔记数据并同步到飞书表格的桌面工具**

<img src="docs/assets/preview.png" alt="软件界面预览" width="800">

飞书集成 • 批量采集 • Excel 导出 • 本地运行

[开发指南](#开发指南) • [使用说明](#使用说明) 

</div>

---

## 功能特性

### 核心工作流程

| 步骤 | 操作 | 说明 |
|------|------|------|
| 1 | 配置飞书 API | 在设置页面填写 App ID 和 App Secret |
| 2 | 读取博主数据 | 从飞书多维表格读取博主 ID 和主页链接 |
| 3 | 批量采集 | 自动采集每个博主的笔记列表和详情信息 |
| 4 | 数据输出 | 生成 Excel 表格并同步回飞书表格 |

### 主要特点

- 从飞书表格批量读取博主信息
- 自动采集博主笔记列表和详情数据
- 生成带有多 Sheet 的 Excel 文件（每个博主一个 Sheet）
- 支持增量写入飞书多维表格
- 支持本地 Cookie 认证和代理配置
- 可配置 API 请求间隔，避免触发反爬机制
- 支持亮色/暗色主题切换

### 数据存储模式

| 模式 | 说明 |
|------|------|
| **飞书模式** | 数据读取和写入均通过飞书 API |
| **下载模式** | 数据保存到本地文件系统 |

---

---

## 技术栈

- **前端**: React 19 + TypeScript + Tailwind CSS
- **UI 组件**: Radix UI + Lucide 图标
- **桌面框架**: Electron 37
- **爬虫引擎**: Python 3
- **状态管理**: React Hooks + Context
- **动画**: Framer Motion

---

## 开发指南

### 环境要求

- Node.js 18+
- pnpm 9+
- Python 3.8+
- macOS / Windows / Linux

### 本地开发

```bash
# 克隆项目
git clone https://github.com/saiigo/xhs-data-helper.git
cd xhs-data-helper

# 安装依赖
pnpm install

# 安装 Python 依赖
pip3 install -r python-engine/requirements.txt

# 启动开发服务器
pnpm run dev
```

### 构建发布包

```bash
# 构建 Windows 版本
pnpm run build:win

# 构建 macOS 版本
pnpm run build:mac
```

---


## 使用说明

### 1. 配置飞书 API

<details>
<summary>点击查看步骤</summary>

1. 访问 [飞书开放平台](https://open.feishu.cn),登录你的飞书账号
2. 创建企业自建应用,获取 **App ID** 和 **App Secret**
3. 为应用添加以下权限:
   - 文档阅读
   - 多维表格读取
   - 多维表格写入
4. 在软件的设置页面填写 App ID 和 App Secret

</details>

### 2. 配置小红书 Cookie

<details>
<summary>点击查看步骤</summary>

**方式一: 浏览器一键登录**

1. 在设置页面点击「一键登录」
2. 在弹出的浏览器窗口中登录小红书
3. 登录成功后自动获取并保存 Cookie

**方式二: 手动获取 Cookie**

1. 用浏览器打开 [小红书网页版](https://www.xiaohongshu.com),登录你的账号
2. 按 <kbd>F12</kbd> 打开开发者工具
3. 点击 **Network** (网络) 标签
4. 刷新页面,点击任意一个请求
5. 在右侧找到 **Request Headers**,复制 `Cookie:` 那一整行
6. 在软件的设置页面粘贴保存

</details>

### 3. 准备飞书表格

创建飞书多维表格,包含以下两列:

| 列名 | 说明 |
|------|------|
| 博主 ID | 小红书博主 ID |
| 博主主页链接 | 博主主页的分享链接 |

### 4. 开始采集

1. 在飞书集成页面填写飞书表格链接
2. 点击「读取数据」,确认读取到博主列表
3. 点击「开始工作」,系统将:
   - 依次读取每个博主的笔记列表
   - 获取笔记详情信息
   - 生成 Excel 文件
   - 可选写入飞书多维表格

---

## 高级配置

### API 请求间隔

为避免触发小红书的反爬机制,可配置请求间隔:

- **最小间隔**: 1-60 秒
- **最大间隔**: 1-60 秒

系统会在每次请求时随机选择间隔时间。

### 代理配置

如需使用代理,可在设置页面配置:

- 启用/禁用代理
- 填写代理地址 (支持 HTTP/HTTPS)

---

## 项目结构

```
xhs-data-helper/
├── app/                    # Electron 主进程和渲染进程代码
│   ├── components/         # UI 组件
│   ├── pages/             # 页面组件
│   │   ├── DownloadPage.tsx
│   │   ├── FeishuPage.tsx
│   │   ├── HistoryPage.tsx
│   │   └── SettingsPage.tsx
│   └── styles/            # 样式文件
├── lib/                    # 业务逻辑层
│   ├── conveyor/          # 进程通信层
│   ├── main/              # 主进程逻辑
│   │   ├── feishu/        # 飞书 API 处理
│   │   └── spider/        # 爬虫逻辑
│   └── preload/           # 预加载脚本
├── python-engine/         # Spider_XHS 爬虫引擎
```



## TODO
- [ ] 同步bug修复

## 许可证

本项目基于 [MIT License](LICENSE) 开源

---

## 免责声明

本工具仅供学习研究使用,请遵守相关法律法规和平台规则。采集内容的版权归原作者所有,使用后果自负。

</div>
