# Copies a Node.js runtime into resources/ so the desktop app can bundle it.
# Usage: powershell -ExecutionPolicy Bypass -File tools\prepare-node.ps1
$ErrorActionPreference = 'Stop'
$nodeSrc = (Get-Command node.exe -ErrorAction Stop).Source
$dstDir = Join-Path $PSScriptRoot '..\resources'
New-Item -ItemType Directory -Force -Path $dstDir | Out-Null
$dst = Join-Path $dstDir 'node.exe'
Copy-Item -LiteralPath $nodeSrc -Destination $dst -Force
Write-Output ("node.exe copied: {0} -> {1}" -f $nodeSrc, $dst)
