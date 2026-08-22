# DeepSeek Harness 桌面版（Windows）

> 非官方社区封装。把 DeepSeek AI 开源的 [DeepSeek Harness (dsh)](https://github.com/deepseek-ai/deepseek-harness) 打包成 Windows 桌面应用，双击即用。

## 特性

- 双击即用：无需安装 Node.js，无需命令行
- 内置 Node 运行时与官方 DeepSeek Harness 本体（与 `npx @deepseek-ai/dsh web` 完全相同的官方界面）
- 独立桌面窗口 + 系统托盘：点关闭按钮最小化到托盘，后台任务不中断
- 单实例：重复打开时聚焦已有窗口
- 自动启动 / 停止服务，运行日志可查
- **自动更新（含国内加速）**：启动时自动检查新版本，优先走 GitHub，卡顿或连不上时自动切换国内镜像；下载完成后重启即可更新，无需卸载重装。后续版本均为增量更新，只下载变化的部分
- **内置插件市场**：首次启动自动安装 [dsh-plugin-marketplace](https://github.com/YELEBAI/dsh-plugin-marketplace)，在「设置 → 插件 → 插件市场」浏览、搜索、一键安装社区插件；市场与插件均可自动更新
- **内置技能库**：首次启动自动安装 [dsh-skill-hub](https://github.com/cheshireez/dsh-skill-hub)，聚合全网技能目录，可在「技能」页面浏览、安装最新技能
- **精简优化**：安装包已剔除用不到的开发文件（源码地图、说明文档、测试文件等），体积更小、安装更快，功能一个不少

## 下载

到 [Releases](../../releases) 页面下载最新版本：

- `DeepSeek-Harness-Setup-x.x.x.exe`：安装版（推荐），支持自动更新
- `DeepSeek-Harness-桌面版-x.x.x.exe`：免安装版（不支持自动更新）

> Windows 首次运行会提示"Windows 已保护你的电脑"。程序未签名，点击「更多信息 → 仍要运行」即可。

## 老用户升级说明

如果已安装过旧版本（v1.0.0）：直接下载并运行新版安装包即可，**不需要卸载、不会丢失任何数据**（插件、主题、聊天记录、模型设置都保存在用户目录 `~/.dsh`，不受安装影响）。本次手动升级一次后，以后版本都会自动更新。

## 使用

1. 双击程序，稍候片刻（首次约 30 秒）出现 DeepSeek Harness 界面
2. 点右上角关闭按钮不会退出，而是最小化到托盘；需要彻底退出时右键托盘图标选择「退出」
3. 首次启动会自动安装插件市场与技能库，安装完成后重启一次应用即出现「插件市场」「技能库」入口
4. 运行日志：`%APPDATA%\deepseek-harness-desktop\desktop-log.txt`

## 自动更新说明

- 检查更新时优先使用 GitHub 官方源；如果网络不通或下载失败，会自动依次尝试国内加速镜像，全程无需配置代理
- 老用户（v1.0.0）需要手动下载安装一次 v1.1.0，之后所有升级全自动
- 每周自动检查官方 deepseek-harness 是否发布新版本，发现新版会在本仓库创建 issue 提醒跟进

## 从源码构建

前置要求：Node.js 18+、[pnpm](https://pnpm.io/)

```powershell
pnpm install
powershell -ExecutionPolicy Bypass -File tools\prepare-node.ps1
pnpm run dist            # 免安装版
pnpm run dist:installer  # 安装版
```

构建产物在 `dist\` 目录。打 `v*` 标签并推送后，GitHub Actions 会自动构建并发布到 Releases。

## 免责声明

本项目与 DeepSeek AI 无隶属关系，属非官方社区项目。DeepSeek Harness 版权归 DeepSeek AI 所有，遵循 MIT 协议。Harness 目前处于开发者预览阶段，可能包含破坏兼容性的变更。

## 许可证

- 本仓库代码：MIT，见 [LICENSE](LICENSE)
- 第三方组件：见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)

## 致谢

- [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)
- [YELEBAI/dsh-plugin-marketplace](https://github.com/YELEBAI/dsh-plugin-marketplace)
- [cheshireez/dsh-skill-hub](https://github.com/cheshireez/dsh-skill-hub)
- [Electron](https://www.electronjs.org/)
