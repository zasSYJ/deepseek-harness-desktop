# DeepSeek Harness 桌面版（Windows）

> 非官方社区封装。把 DeepSeek AI 开源的 [DeepSeek Harness (dsh)](https://github.com/deepseek-ai/deepseek-harness) 打包成 Windows 桌面应用，双击即用。

## 特性

- 双击即用：无需安装 Node.js，无需命令行
- 内置 Node 运行时与官方 DeepSeek Harness 本体（与 `npx @deepseek-ai/dsh web` 完全相同的官方界面）
- 独立桌面窗口 + 系统托盘：点关闭按钮最小化到托盘，后台任务不中断
- 单实例：重复打开时聚焦已有窗口
- 自动启动 / 停止服务，运行日志可查

## 下载

到 [Releases](../../releases) 页面下载最新版本：

- `DeepSeek-Harness-Setup-x.x.x.exe`：安装版，会创建桌面与开始菜单快捷方式
- `DeepSeek-Harness-桌面版-x.x.x.exe`：免安装版，放到任意位置双击即用

> Windows 首次运行会提示"Windows 已保护你的电脑"。程序未签名，点击「更多信息 → 仍要运行」即可。

## 使用

1. 双击程序，稍候片刻（首次约 30 秒）出现 DeepSeek Harness 界面
2. 点右上角关闭按钮不会退出，而是最小化到托盘；需要彻底退出时右键托盘图标选择「退出」
3. 运行日志：`%APPDATA%\deepseek-harness-desktop\desktop-log.txt`

## 从源码构建

前置要求：Node.js 18+、[pnpm](https://pnpm.io/)

```powershell
pnpm install
powershell -ExecutionPolicy Bypass -File tools\prepare-node.ps1
pnpm run dist            # 免安装版
pnpm run dist:installer  # 安装版
```

构建产物在 `dist\` 目录。

## 免责声明

本项目与 DeepSeek AI 无隶属关系，属非官方社区项目。DeepSeek Harness 版权归 DeepSeek AI 所有，遵循 MIT 协议。Harness 目前处于开发者预览阶段，可能包含破坏兼容性的变更。

## 许可证

- 本仓库代码：MIT，见 [LICENSE](LICENSE)
- 第三方组件：见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)

## 致谢

- [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)
- [Electron](https://www.electronjs.org/)
