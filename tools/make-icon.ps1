Add-Type -AssemblyName System.Drawing

$outDir = Join-Path $PSScriptRoot '..\build'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

function New-WhaleBitmap([int]$size) {
  $bmp = New-Object System.Drawing.Bitmap($size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb))
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.Clear([System.Drawing.Color]::Transparent)

  # rounded rect background
  $d = [int]($size * 0.22)
  $rect = New-Object System.Drawing.Rectangle(0, 0, $size, $size)
  $bgPath = New-Object System.Drawing.Drawing2D.GraphicsPath
  $bgPath.AddArc(0, 0, $d, $d, 180, 90)
  $bgPath.AddArc($size - $d, 0, $d, $d, 270, 90)
  $bgPath.AddArc($size - $d, $size - $d, $d, $d, 0, 90)
  $bgPath.AddArc(0, $size - $d, $d, $d, 90, 90)
  $bgPath.CloseFigure()

  $bgBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    $rect,
    [System.Drawing.Color]::FromArgb(255, 92, 122, 255),
    [System.Drawing.Color]::FromArgb(255, 37, 62, 160),
    90)
  $g.FillPath($bgBrush, $bgPath)

  # white whale silhouette (normalized coords)
  $s = [float]$size
  $pt = {
    param($x, $y)
    [System.Drawing.PointF]::new($x * $s, $y * $s)
  }
  $whale = New-Object System.Drawing.Drawing2D.GraphicsPath
  $whale.StartFigure()
  $whale.AddBezier((& $pt 0.09 0.50), (& $pt 0.17 0.24), (& $pt 0.33 0.17), (& $pt 0.50 0.24))
  $whale.AddBezier((& $pt 0.62 0.29), (& $pt 0.70 0.36), (& $pt 0.78 0.45), (& $pt 0.78 0.45))
  $whale.AddBezier((& $pt 0.85 0.35), (& $pt 0.90 0.31), (& $pt 0.94 0.35), (& $pt 0.94 0.35))
  $whale.AddBezier((& $pt 0.97 0.38), (& $pt 0.97 0.46), (& $pt 0.96 0.50), (& $pt 0.96 0.50))
  $whale.AddBezier((& $pt 0.96 0.54), (& $pt 0.96 0.62), (& $pt 0.94 0.65), (& $pt 0.94 0.65))
  $whale.AddBezier((& $pt 0.90 0.69), (& $pt 0.84 0.66), (& $pt 0.78 0.55), (& $pt 0.78 0.55))
  $whale.AddBezier((& $pt 0.71 0.66), (& $pt 0.63 0.77), (& $pt 0.48 0.78), (& $pt 0.48 0.78))
  $whale.AddBezier((& $pt 0.34 0.80), (& $pt 0.18 0.72), (& $pt 0.09 0.50), (& $pt 0.09 0.50))
  $whale.CloseFigure()

  $white = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 240, 246, 255))
  $g.FillPath($white, $whale)

  # eye
  $eye = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(230, 24, 42, 110))
  $eyeR = $s * 0.028
  $g.FillEllipse($eye, $s * 0.33 - $eyeR, $s * 0.40 - $eyeR, $eyeR * 2, $eyeR * 2)

  $g.Dispose()
  return $bmp
}

function Save-Png([System.Drawing.Bitmap]$bmp, [string]$file) {
  $bmp.Save($file, [System.Drawing.Imaging.ImageFormat]::Png)
}

$sizes = 16, 24, 32, 48, 64, 128, 256
$pngFiles = @()
foreach ($sz in $sizes) {
  $bmp = New-WhaleBitmap $sz
  $file = Join-Path $outDir "icon-$sz.png"
  Save-Png $bmp $file
  $pngFiles += $file
  $bmp.Dispose()
}

# compose multi-size .ico (Vista+ supports PNG-compressed entries)
$ico = Join-Path $outDir 'icon.ico'
$count = $pngFiles.Count
$headerSize = 6 + 16 * $count
$offset = $headerSize
$entries = @()
$blobs = @()
foreach ($file in $pngFiles) {
  $data = [System.IO.File]::ReadAllBytes($file)
  $size = [int]$data.Length
  $dim = [int](([System.IO.Path]::GetFileNameWithoutExtension($file)) -replace 'icon-', '')
  $w = 0
  if ($dim -lt 256) { $w = $dim }
  $entry = New-Object byte[] 16
  $entry[0] = $w; $entry[1] = $w; $entry[2] = 0; $entry[3] = 0
  $entry[4] = 1; $entry[5] = 0
  $entry[6] = 32; $entry[7] = 0
  [System.BitConverter]::GetBytes([int]$size).CopyTo($entry, 8)
  [System.BitConverter]::GetBytes([int]$offset).CopyTo($entry, 12)
  $entries += , $entry
  $blobs += , $data
  $offset += $size
}

$ms = New-Object System.IO.MemoryStream
$bw = New-Object System.IO.BinaryWriter($ms)
$bw.Write([uint16]0)
$bw.Write([uint16]1)
$bw.Write([uint16]$count)
foreach ($e in $entries) { $bw.Write($e) }
foreach ($b in $blobs) { $bw.Write($b) }
$bw.Flush()
[System.IO.File]::WriteAllBytes($ico, $ms.ToArray())
$bw.Dispose(); $ms.Dispose()

Write-Output "icon generated: $ico ($((Get-Item $ico).Length) bytes)"
