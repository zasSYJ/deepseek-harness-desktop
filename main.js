const { app, BrowserWindow, Tray, Menu, nativeImage } = require('electron');
const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');

const DEFAULT_PORT = 3080;
const APP_NAME = 'DeepSeek Harness';

let mainWindow = null;
let tray = null;
let serverProcess = null;
let serverUrl = null;
let quitting = false;
const isSmokeTest = process.argv.includes('--smoke');

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

async function startServer() {
  const nodeExe = findNodeExe();
  const cli = findDshCli();
  const userDataDir = app.getPath('userData');
  fs.mkdirSync(userDataDir, { recursive: true });
  log('启动 dsh 服务: node =', nodeExe, 'cli =', cli);
  serverProcess = spawn(nodeExe, [cli, 'web'], {
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

function createTray() {
  let iconPath = path.join(__dirname, 'build', 'icon.ico');
  if (!fs.existsSync(iconPath)) iconPath = nativeImage.createEmpty();
  tray = new Tray(iconPath);
  tray.setToolTip(APP_NAME);
  const menu = Menu.buildFromTemplate([
    { label: '打开主界面', click: () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } } },
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
    } catch (err) {
      log('启动失败:', err.message, err.stack || '');
      dialogError(err.message);
      app.quit();
    }
  });
}

function dialogError(message) {
  const { dialog } = require('electron');
  dialog.showErrorBox('启动失败', message);
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
