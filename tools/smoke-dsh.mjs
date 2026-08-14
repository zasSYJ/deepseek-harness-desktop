import { spawn } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const nodeExe = process.argv[2] || 'node';
const cli = path.join(root, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js');

console.log('node:', nodeExe);
console.log('cli :', cli);

const child = spawn(nodeExe, [cli, 'web'], {
  cwd: root,
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true
});

let got = '';
child.stdout.on('data', (d) => {
  got += d.toString();
  process.stdout.write('[dsh] ' + d.toString().replace(/\n/g, '\n[dsh] '));
});
child.stderr.on('data', (d) => process.stdout.write('[err] ' + d.toString()));

const started = Date.now();
const timer = setInterval(() => {
  const req = http.get('http://127.0.0.1:3080', (res) => {
    res.resume();
    console.log('\nHTTP 状态码:', res.statusCode, '=> dsh Web 启动成功');
    clearInterval(timer);
    child.kill();
    setTimeout(() => process.exit(0), 1500);
  });
  req.on('error', () => {
    if (Date.now() - started > 45000) {
      console.error('\n等待 45 秒仍未启动，超时退出');
      clearInterval(timer);
      child.kill();
      process.exit(1);
    }
  });
  req.setTimeout(2000, () => req.destroy());
}, 800);

child.on('exit', (code) => console.log('dsh 进程退出, code =', code));
