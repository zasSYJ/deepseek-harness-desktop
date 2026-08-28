# 构建前准备：把插件市场与技能库（含依赖）内置进安装包
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$out = Join-Path $root 'resources\bundled-plugins'
$tmp = Join-Path $env:TEMP ('dsh-bundle-' + [guid]::NewGuid().ToString('N'))
$profileDir = Join-Path $tmp 'profile'

New-Item -ItemType Directory -Force -Path $profileDir | Out-Null
[System.IO.File]::WriteAllText(
  (Join-Path $profileDir 'pnpm-workspace.yaml'),
  "packages:`n  - .`n`nnodeLinker: hoisted`nautoInstallPeers: false`n",
  (New-Object System.Text.UTF8Encoding($false))
)
$pkg = @{
  name         = 'dsh-bundle-tmp'
  private      = $true
  dependencies = @{
    'dsh-skill-hub'          = '^0.2.2'
    'dsh-plugin-marketplace' = 'github:YELEBAI/dsh-plugin-marketplace#v0.9.2'
  }
} | ConvertTo-Json -Depth 5
[System.IO.File]::WriteAllText(
  (Join-Path $profileDir 'package.json'),
  $pkg,
  (New-Object System.Text.UTF8Encoding($false))
)

Push-Location $profileDir
try {
  pnpm install --prod --ignore-scripts
} finally {
  Pop-Location
}

if (Test-Path $out) { Remove-Item -LiteralPath $out -Recurse -Force }
New-Item -ItemType Directory -Force -Path $out | Out-Null
Get-ChildItem (Join-Path $profileDir 'node_modules') -Force -Directory |
  Where-Object { $_.Name -notin @('.bin', '.pnpm') } |
  ForEach-Object {
    Copy-Item $_.FullName (Join-Path $out $_.Name) -Recurse -Force
  }

$sz = (Get-ChildItem $out -Recurse -File | Measure-Object Length -Sum).Sum
Write-Output ("已生成内置插件包目录: " + $out + "（" + [math]::Round($sz/1MB,1) + " MB）")
Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
