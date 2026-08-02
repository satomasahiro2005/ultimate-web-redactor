# アイコン生成
# 16x16 のドット絵を1枚だけ定義し、48/128 は整数倍(3倍/8倍)でそのまま拡大する。
# 縮小もアンチエイリアスも通さないので、どのサイズでも同じ絵が潰れずに出る。
Add-Type -AssemblyName System.Drawing

$C = @{
  'R' = '#FFFF2D2D'   # 赤枠
  'K' = '#FF20242B'   # 枠の内側の余白
  '1' = '#FFDCE7F4'
  '2' = '#FF9DB3CE'
  '3' = '#FF62799A'
  '4' = '#FF3A4D66'
}

# 0行目 = 赤枠 / 1行目 = 余白 / 2..13 = 3x3 のモザイクブロック 4x4 個
$rows = @(
  'RRRRRRRRRRRRRRRR'
  'RKKKKKKKKKKKKKKR'
  'RK111222333222KR'
  'RK111222333222KR'
  'RK111222333222KR'
  'RK333444111444KR'
  'RK333444111444KR'
  'RK333444111444KR'
  'RK222111444333KR'
  'RK222111444333KR'
  'RK222111444333KR'
  'RK444333222111KR'
  'RK444333222111KR'
  'RK444333222111KR'
  'RKKKKKKKKKKKKKKR'
  'RRRRRRRRRRRRRRRR'
)

$outDir = Join-Path $PSScriptRoot '..\icons'
$null = New-Item -ItemType Directory -Force -Path $outDir

function Convert-Color([string]$argb) {
  $a = [Convert]::ToInt32($argb.Substring(1,2),16)
  $r = [Convert]::ToInt32($argb.Substring(3,2),16)
  $g = [Convert]::ToInt32($argb.Substring(5,2),16)
  $b = [Convert]::ToInt32($argb.Substring(7,2),16)
  [System.Drawing.Color]::FromArgb($a,$r,$g,$b)
}

function New-Icon([int]$scale, [string]$path) {
  $size = 16 * $scale
  $bmp = New-Object System.Drawing.Bitmap($size, $size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::None
  $g.Clear([System.Drawing.Color]::Transparent)
  for ($y = 0; $y -lt 16; $y++) {
    $line = $rows[$y]
    for ($x = 0; $x -lt 16; $x++) {
      $key = $line[$x].ToString()
      $brush = New-Object System.Drawing.SolidBrush (Convert-Color $C[$key])
      $g.FillRectangle($brush, ($x * $scale), ($y * $scale), $scale, $scale)
      $brush.Dispose()
    }
  }
  $g.Dispose()
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
}

foreach ($s in @(1, 3, 8)) {
  $px = 16 * $s
  New-Icon $s (Join-Path $outDir "icon$px.png")
  Write-Output "icon$px.png ($($s)x)"
}
