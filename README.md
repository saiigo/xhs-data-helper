<div align="center">

# 小红书数据助手

**一键批量下载小红书笔记内容**

图片 • 视频 • Excel 数据表 • 完全离线运行

[![Windows](https://img.shields.io/badge/Windows-支持-0078D6?logo=windows)](https://github.com/PeanutSplash/xhs-data-helper/releases)
[![macOS](https://img.shields.io/badge/macOS-支持-000000?logo=apple)](https://github.com/PeanutSplash/xhs-data-helper/releases)
[![License](https://img.shields.io/badge/许可证-CC_BY--NC_4.0-green)](LICENSE)

[立即下载](#-下载安装) •
[使用教程](#-使用教程) •
[常见问题](#-常见问题)

</div>

---

## ✨ 核心功能

<table>
<tr>
<td width="33%" align="center">

### 🎯 指定笔记
批量下载你收藏的<br>笔记链接

</td>
<td width="33%" align="center">

### 👤 博主笔记
一键下载某个博主<br>发布的所有内容

</td>
<td width="33%" align="center">

### 🔍 搜索下载
按关键词搜索<br>批量保存结果

</td>
</tr>
</table>

### 💎 主要特色

- **📥 完整保存** - 自动下载笔记中的所有图片和视频
- **📊 数据导出** - 生成 Excel 表格,包含标题、内容、点赞数等信息
- **🔐 安全可靠** - Cookie 本地加密存储,不上传任何数据
- **⚡ 快速高效** - 支持多任务并发,断点续传
- **🌓 精美界面** - 现代化设计,支持亮色/暗色主题
- **🌐 代理支持** - 可配置 HTTP/HTTPS 代理

---

## 📦 下载安装

### Windows 用户

1. 前往 [Releases 页面](https://github.com/PeanutSplash/xhs-data-helper/releases)
2. 下载最新版 `xhs-helper-setup-win.exe`
3. 双击安装,按提示完成安装

### macOS 用户

1. 前往 [Releases 页面](https://github.com/PeanutSplash/xhs-data-helper/releases)
2. 下载 `xhs-helper-mac.dmg`
3. 拖动到应用程序文件夹

> ⚠️ macOS 用户首次打开需要在「系统偏好设置 → 安全性」中允许运行

---

## 📖 使用教程

### 第一步:获取小红书 Cookie

<details>
<summary><b>👉 点击查看详细步骤(附图文)</b></summary>

<br>

1. 打开浏览器,访问 [小红书网页版](https://www.xiaohongshu.com) 并登录
2. 按键盘 <kbd>F12</kbd> 打开开发者工具
3. 点击顶部的 **Network(网络)** 标签
4. 刷新页面 (<kbd>F5</kbd>),点击列表中的任意请求
5. 在右侧找到 **Request Headers(请求头)**
6. 找到 `Cookie:` 这一行,**复制整行内容**
7. 在软件中打开 **设置** 页面,粘贴并保存

</details>

### 第二步:配置保存路径

在软件的 **设置** 页面:

- 📁 **媒体保存路径** - 图片和视频的保存位置
- 📊 **Excel 保存路径** - 数据表格的保存位置
- 🌐 **代理设置**(可选) - 如需要代理访问可填写

### 第三步:创建下载任务

切换到 **下载** 页面,选择一种下载模式:

#### 📌 模式 1:指定笔记

适合下载你收藏或指定的笔记链接

```
https://www.xiaohongshu.com/explore/xxxxx?xsec_token=...
https://www.xiaohongshu.com/explore/yyyyy?xsec_token=...
```
> 每行一个链接,支持同时添加多个

#### 👤 模式 2:博主笔记

适合批量下载某个博主的所有笔记

```
https://www.xiaohongshu.com/user/profile/xxxxx?xsec_token=...
```
> 输入博主主页链接即可

#### 🔍 模式 3:搜索下载

适合批量下载搜索结果

| 设置项 | 说明 |
|--------|------|
| **关键词** | 搜索内容,如"咖啡店推荐" |
| **下载数量** | 最多下载多少条 |
| **排序方式** | 综合/最新/最热 |
| **笔记类型** | 图文/视频/不限 |
| **时间范围** | 最近一天/一周/一月/全部 |

### 第四步:查看下载进度

切换到 **历史** 页面:

- 📊 **实时进度条** - 显示当前下载进度
- 📝 **详细日志** - 查看每条笔记的处理状态
- ⏸️ **停止任务** - 可随时中断下载
- 📂 **打开文件夹** - 快速打开保存位置
- 💾 **导出日志** - 保存完整的操作日志

---

## ❓ 常见问题

<details>
<summary><b>Q: 下载的文件保存在哪里?</b></summary>

<br>

**查看方法**:
1. 在 **设置** 页面查看你配置的保存路径
2. 或在 **历史** 页面点击"打开文件夹"按钮

**文件结构**:
```
保存路径/
├── 笔记标题1/
│   ├── 图片1.jpg
│   ├── 图片2.jpg
│   └── 视频.mp4
├── 笔记标题2/
└── 数据汇总.xlsx
```

</details>


<details>
<summary><b>Q: macOS 提示"无法打开,因为来自身份不明的开发者"?</b></summary>

<br>

**解决步骤**:
1. 打开 **系统偏好设置** → **安全性与隐私**
2. 点击底部的 **仍要打开** 按钮
3. 或在终端执行:
```bash
sudo xattr -r -d com.apple.quarantine /Applications/xhs-helper.app
```

</details>

---

## 🎯 适用场景

- 📚 **内容创作者** - 批量保存参考素材和灵感
- 🛍️ **电商从业者** - 采集竞品分析数据
- 📊 **数据分析师** - 收集舆情和用户反馈
- 💼 **市场研究** - 获取行业趋势和热门话题

---

## 📝 许可证

本项目基于 [CC BY-NC 4.0 许可证](LICENSE) 开源

---

## 💬 反馈与支持

- 🐛 [报告问题](https://github.com/PeanutSplash/xhs-data-helper/issues)
- 💡 [功能建议](https://github.com/PeanutSplash/xhs-data-helper/discussions)
- ⭐ 如果觉得好用,请给项目一个 Star!

---

<div align="center">

### 📌 免责声明

本工具仅供个人学习和研究使用。<br>
使用本工具时请遵守相关法律法规和小红书平台规则。<br>
下载的内容版权归原作者所有,请勿用于侵权或违法用途。<br>
使用本工具产生的一切后果由使用者自行承担。

---

Made with ❤️ | [下载最新版本](https://github.com/PeanutSplash/xhs-data-helper/releases)

</div>

---

<details>
<summary><b>🔧 开发者信息</b></summary>

<br>

### 技术栈

- **前端**: React 19 + TypeScript + Tailwind CSS
- **桌面框架**: Electron 37
- **下载引擎**: [Spider_XHS](https://github.com/cv-cat/Spider_XHS)

### 本地开发

```bash
# 克隆项目
git clone --recursive https://github.com/PeanutSplash/xhs-data-helper.git

# 安装依赖
pnpm install
pip3 install -r python-engine/requirements.txt

# 启动开发
pnpm run dev
```

### 构建

```bash
pnpm run build:win    # Windows
pnpm run build:mac    # macOS
pnpm run build:linux  # Linux
```

</details>
