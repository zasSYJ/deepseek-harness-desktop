const { app, BrowserWindow, Tray, Menu, nativeImage, dialog } = require('electron');
const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { autoUpdater } = require('electron-updater');
const { GitHubProvider } = require('electron-updater/out/providers/GitHubProvider');
const { parseUpdateInfo } = require('electron-updater/out/providers/Provider');
const { newUrlFromBase, getChannelFilename } = require('electron-updater/out/util');

const DEFAULT_PORT = 3080;
const APP_NAME = 'DeepSeek Harness';
const MARKETPLACE_SRC = 'github:YELEBAI/dsh-plugin-marketplace#v0.9.2';
// 插件市场在国内直连 GitHub 常被重置，先尝试加速镜像下载
const MARKETPLACE_MIRRORS = [
  'https://ghproxy.net/https://github.com/YELEBAI/dsh-plugin-marketplace/archive/refs/tags/v0.9.2.tar.gz',
  'https://gh-proxy.com/https://github.com/YELEBAI/dsh-plugin-marketplace/archive/refs/tags/v0.9.2.tar.gz',
  'https://ghfast.top/https://github.com/YELEBAI/dsh-plugin-marketplace/archive/refs/tags/v0.9.2.tar.gz'
];
const SKILL_HUB_SRC = 'dsh-skill-hub';
const UPDATE_OWNER = 'zasSYJ';
const UPDATE_REPO = 'deepseek-harness-desktop';
// 国内加速镜像域名（按顺序尝试）
const MIRROR_HOSTS = ['ghproxy.net', 'gh-proxy.com', 'ghfast.top'];

let mainWindow = null;
let tray = null;
let serverProcess = null;
let serverUrl = null;
let quitting = false;
const isSmokeTest = process.argv.includes('--smoke');
let mirrorIndex = -1; // -1 = GitHub 官方通道，0..n = 国内镜像

function log(...args) {
  const line = `[${new Date().toLocaleString()}] ${args.join(' ')}`;
  console.log(line);
  try {
    const dir = app.getPath('userData');
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, 'desktop-log.txt'), line + '\n');
  } catch (e) { /* 日志失败不影响运行 */ }
}

// 找到打包进去的 node.exe（开发时用 DSH_NODE 环境变量或系统 node）
function findNodeExe() {
  if (app.isPackaged) {
    const bundled = path.join(process.resourcesPath, 'node.exe');
    if (fs.existsSync(bundled)) return bundled;
  }
  if (process.env.DSH_NODE && fs.existsSync(process.env.DSH_NODE)) return process.env.DSH_NODE;
  return 'node';
}

function findDshCli() {
  // asar 已关闭，打包后源码在 resources/app 下，node.exe 可以直接读取
  const pkgRoot = app.isPackaged ? path.join(process.resourcesPath, 'app') : __dirname;
  const pkgJsonPath = path.join(pkgRoot, 'node_modules', '@deepseek-ai', 'dsh', 'package.json');
  const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
  const bin = typeof pkgJson.bin === 'string' ? pkgJson.bin : (pkgJson.bin && pkgJson.bin.dsh);
  if (!bin) throw new Error('未找到 dsh 的入口文件');
  return path.join(path.dirname(pkgJsonPath), bin);
}

function waitForServer(url, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      const req = http.get(url, (res) => {
        res.resume();
        resolve(url);
      });
      req.on('error', () => {
        if (Date.now() - started > timeoutMs) {
          reject(new Error('等待 DeepSeek Harness 服务启动超时'));
        } else {
          setTimeout(tick, 500);
        }
      });
      req.setTimeout(3000, () => req.destroy());
    };
    tick();
  });
}

// 运行一段 dsh CLI 命令（如插件安装），返回 stdout
function runCli(args, timeoutMs = 180000) {
  return new Promise((resolve, reject) => {
    const nodeExe = findNodeExe();
    const child = spawn(nodeExe, args, {
      cwd: app.getPath('userData'),
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    });
    let out = '';
    child.stdout.on('data', (d) => { out += d.toString(); });
    child.stderr.on('data', (d) => { out += d.toString(); });
    child.on('error', (e) => reject(e));
    child.on('exit', (code) => {
      if (code === 0) resolve(out);
      else reject(new Error(out.slice(-600) || `exit code ${code}`));
    });
    setTimeout(() => {
      try { execSync(`taskkill /pid ${child.pid} /T /F`, { stdio: 'ignore' }); } catch (e) { /* 已退出 */ }
      reject(new Error('命令执行超时'));
    }, timeoutMs);
  });
}

async function startServer() {
  const nodeExe = findNodeExe();
  const cli = findDshCli();
  const userDataDir = app.getPath('userData');
  fs.mkdirSync(userDataDir, { recursive: true });
  log('启动 dsh 服务: node =', nodeExe, 'cli =', cli);
  serverProcess = spawn(nodeExe, [cli, 'web', '--no-open'], {
    cwd: userDataDir,
    env: { ...process.env },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  });

  serverProcess.stdout.on('data', (d) => {
    const text = d.toString();
    log('[dsh]', text.trim());
    const m = text.match(/https?:\/\/127\.0\.0\.1:(\d+)/);
    if (m && !serverUrl) {
      serverUrl = `http://127.0.0.1:${m[1]}`;
    }
  });
  serverProcess.stderr.on('data', (d) => log('[dsh-err]', d.toString().trim()));
  serverProcess.on('exit', (code) => {
    log('[dsh] 服务退出, code =', code);
    if (!quitting) {
      // 服务意外退出时关掉应用
      app.quit();
    }
  });

  const url = serverUrl || `http://127.0.0.1:${DEFAULT_PORT}`;
  try {
    await waitForServer(url);
  } catch (e) {
    if (serverUrl) {
      await waitForServer(serverUrl);
    } else {
      throw e;
    }
  }
  return serverUrl || url;
}

// 镜像版更新源：让 electron-updater 的 GitHub 源整体走国内加速镜像
class MirrorGitHubProvider extends GitHubProvider {
  constructor(options, updater, runtimeOptions) {
    super({ ...options, host: options.mirrorHost }, updater, runtimeOptions);
  }
  // 国内镜像的路径格式：镜像域名/https://github.com/仓库/...
  get basePath() {
    return `/https://github.com/${this.options.owner}/${this.options.repo}/releases`;
  }
  // 镜像模式下官方会走 /api/v3 找最新 tag，这里改为直接访问镜像上的 releases/latest
  async getLatestTagName(cancellationToken) {
    const url = newUrlFromBase(`${this.basePath}/latest`, this.baseUrl);
    try {
      const rawData = await this.httpRequest(url, { Accept: 'application/json' }, cancellationToken);
      if (rawData == null) return null;
      const releaseInfo = JSON.parse(rawData);
      return releaseInfo.tag_name;
    } catch (e) {
      throw new Error(`无法从镜像获取最新版本 (${url.href}): ${e.message || e}`);
    }
  }
  // 多数国内镜像不支持 atom 源，这里跳过 atom，直接读 releases/latest + latest.yml
  async getLatestVersion() {
    const tag = await this.getLatestTagName();
    if (tag == null) {
      throw new Error('镜像上没有找到任何发布版本');
    }
    const channelFile = getChannelFilename(this.channel);
    const channelFileUrl = newUrlFromBase(`${this.basePath}/download/${tag}/${channelFile}`, this.baseUrl);
    const rawData = await this.httpRequest(channelFileUrl);
    const result = parseUpdateInfo(rawData, channelFile, channelFileUrl);
    return { tag, ...result };
  }
}

function updaterFeedOptions() {
  if (mirrorIndex < 0) {
    return { provider: 'github', owner: UPDATE_OWNER, repo: UPDATE_REPO };
  }
  return {
    provider: 'custom',
    updateProvider: MirrorGitHubProvider,
    owner: UPDATE_OWNER,
    repo: UPDATE_REPO,
    mirrorHost: MIRROR_HOSTS[mirrorIndex]
  };
}

function switchUpdateFeed() {
  autoUpdater.setFeedURL(updaterFeedOptions());
  log('更新源:', mirrorIndex < 0 ? 'GitHub 官方' : `国内镜像 ${MIRROR_HOSTS[mirrorIndex]}`);
}

// 首次启动自动安装插件市场 + 技能库（失败自动跳过，下次启动重试）
async function ensureFirstRunPlugins() {
  const plugins = [
    { name: '插件市场', flag: 'marketplace-installed.flag', srcs: [...MARKETPLACE_MIRRORS, MARKETPLACE_SRC] },
    { name: '技能库', flag: 'skillhub-installed.flag', srcs: [SKILL_HUB_SRC] }
  ];
  let installedAny = false;
  for (const item of plugins) {
    try {
      const flag = path.join(app.getPath('userData'), item.flag);
      if (fs.existsSync(flag)) continue;
      let ok = false;
      for (const src of item.srcs) {
        try {
          log(`正在安装${item.name}...`);
          const cli = findDshCli();
          await runCli([cli, 'plugin', '--profile', 'web', 'add', src], 240000);
          fs.writeFileSync(flag, new Date().toISOString());
          log(`${item.name}安装成功`);
          ok = true;
          break;
        } catch (e) {
          log(`${item.name}安装失败（${src}）:`, e.message);
        }
      }
      if (ok) installedAny = true;
    } catch (e) {
      log(`${item.name}安装跳过:`, e.message);
    }
  }
  if (installedAny && tray && tray.displayBalloon) {
    tray.displayBalloon({ title: APP_NAME, content: '插件市场与技能库已就绪，重启应用后生效' });
  }
}

function createWindow(url) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    title: APP_NAME,
    icon: path.join(__dirname, 'build', 'icon.ico'),
    autoHideMenuBar: true,
    backgroundColor: '#0f1115',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadURL(url);
  log('窗口已打开:', url);
  mainWindow.on('close', (e) => {
    // 关闭窗口时最小化到托盘，避免后台任务被误杀
    if (!quitting && tray) {
      e.preventDefault();
      mainWindow.hide();
      if (tray.displayBalloon) {
        tray.displayBalloon({ title: APP_NAME, content: '仍在后台运行，右键托盘图标可退出' });
      }
    }
  });
  mainWindow.on('closed', () => { mainWindow = null; });

  if (isSmokeTest) {
    mainWindow.webContents.once('did-finish-load', async () => {
      await new Promise((r) => setTimeout(r, 4000));
      try {
        const image = await mainWindow.webContents.capturePage();
        const out = process.env.SMOKE_OUT || path.join(app.getPath('userData'), 'smoke.png');
        fs.writeFileSync(out, image.toPNG());
        log('[smoke] 截图已保存:', out);
      } catch (e) {
        log('[smoke] 截图失败:', e.message);
      }
      quitting = true;
      try {
        execSync(`taskkill /pid ${serverProcess.pid} /T /F`, { stdio: 'ignore' });
      } catch (e) { /* 已退出 */ }
      app.exit(0);
    });
  }
}

// 带镜像回退的更新下载
async function downloadUpdateWithFallback() {
  try {
    await autoUpdater.downloadUpdate();
    return true;
  } catch (e) {
    log('下载失败，切换国内镜像重试:', e.message);
    for (let attempt = 0; attempt < MIRROR_HOSTS.length; attempt++) {
      mirrorIndex = attempt;
      switchUpdateFeed();
      try {
        await autoUpdater.checkForUpdates();
        await autoUpdater.downloadUpdate();
        return true;
      } catch (e2) {
        log('镜像', MIRROR_HOSTS[attempt], '失败:', e2.message);
      }
    }
    log('所有镜像下载均失败，请稍后再试或检查网络');
    return false;
  }
}

// 带镜像回退的更新检查（showPrompt=true 时发现新版本先询问用户）
async function checkForUpdatesWithFallback(showPrompt) {
  if (!app.isPackaged) return;
  mirrorIndex = -1;
  switchUpdateFeed();
  let info = null;
  for (let attempt = 0; attempt <= MIRROR_HOSTS.length; attempt++) {
    try {
      const result = await autoUpdater.checkForUpdates();
      if (result && result.isUpdateAvailable) {
        info = result.updateInfo;
        log('发现新版本:', info && info.version);
        break;
      }
      log('当前已是最新版本');
      return;
    } catch (e) {
      log('更新检查失败（通道', attempt + 1, '）:', e.message);
      if (attempt < MIRROR_HOSTS.length) {
        mirrorIndex = attempt;
        switchUpdateFeed();
      }
    }
  }
  if (!info) {
    log('所有更新通道均不可用');
    return;
  }
  if (showPrompt) {
    const r = dialog.showMessageBoxSync(mainWindow, {
      type: 'info',
      title: '发现新版本',
      message: `发现新版本 ${info.version}`,
      detail: '是否现在下载？下载完成后重启即可更新（插件和数据不受影响）。',
      buttons: ['下载', '稍后'],
      defaultId: 0,
      cancelId: 1
    });
    if (r !== 0) return;
  }
  await downloadUpdateWithFallback();
}

function setupAutoUpdater() {
  if (!app.isPackaged) return;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('checking-for-update', () => log('正在检查更新...'));
  autoUpdater.on('update-available', (info) => log('发现新版本事件:', info && info.version));
  autoUpdater.on('update-not-available', () => {});
  autoUpdater.on('error', (err) => log('更新出错:', err && err.message));
  autoUpdater.on('update-downloaded', (info) => {
    log('新版本已下载:', info && info.version);
    const r = dialog.showMessageBoxSync(mainWindow, {
      type: 'info',
      title: '更新就绪',
      message: `新版本 ${info.version} 已下载`,
      detail: '重启应用即可完成更新。',
      buttons: ['立即重启', '稍后'],
      defaultId: 0,
      cancelId: 1
    });
    if (r === 0) {
      quitting = true;
      autoUpdater.quitAndInstall();
    }
  });
  checkForUpdatesWithFallback(true).catch((e) => log('更新检查失败:', e.message));
}

function checkForUpdatesNow() {
  if (!app.isPackaged) {
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: '检查更新',
      message: '当前是开发版本，请使用正式安装版体验自动更新。'
    });
    return;
  }
  checkForUpdatesWithFallback(true).catch((e) => log('更新检查失败:', e.message));
}

function createTray() {
  let iconPath = path.join(__dirname, 'build', 'icon.ico');
  if (!fs.existsSync(iconPath)) iconPath = nativeImage.createEmpty();
  tray = new Tray(iconPath);
  tray.setToolTip(APP_NAME);
  const menu = Menu.buildFromTemplate([
    { label: '打开主界面', click: () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } } },
    { label: '检查更新', click: () => checkForUpdatesNow() },
    { type: 'separator' },
    { label: '退出', click: () => { quitting = true; app.quit(); } }
  ]);
  tray.setContextMenu(menu);
  tray.on('click', () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } });
}

// 单实例：重复打开时聚焦已有窗口
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
  });

  app.whenReady().then(async () => {
    try {
      const url = await startServer();
      createWindow(url);
      createTray();
      setupAutoUpdater();
      ensureFirstRunPlugins();
    } catch (err) {
      log('启动失败:', err.message, err.stack || '');
      dialog.showErrorBox('启动失败', err.message);
      app.quit();
    }
  });
}

app.on('window-all-closed', () => {
  // 托盘模式下不退出
});

app.on('before-quit', () => {
  quitting = true;
  if (serverProcess && !serverProcess.killed) {
    try {
      execSync(`taskkill /pid ${serverProcess.pid} /T /F`, { stdio: 'ignore' });
    } catch (e) {
      serverProcess.kill();
    }
  }
});
