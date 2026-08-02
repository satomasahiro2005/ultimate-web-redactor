# 宣材スクリーンショットを撮る。
# 事前に test/server.js を http://localhost:5599 で動かしておくこと。
param([string]$Chrome = "$env:ProgramFiles\Google\Chrome\Application\chrome.exe")

$out = Join-Path $PSScriptRoot 'shots'
$null = New-Item -ItemType Directory -Force -Path $out
$profile = Join-Path $env:TEMP 'uwr-shoot-profile'

$jobs = @()
foreach ($n in 1..4) { $jobs += @{ file = "screenshot-$n.png"; url = "promo/demo.html?shot=$n"; w = 1280; h = 800 } }
$jobs += @{ file = 'promo-tile-440x280.png'; url = 'promo/tile.html'; w = 440; h = 280 }

foreach ($j in $jobs) {
  $file = Join-Path $out $j.file
  if (Test-Path $file) { Remove-Item $file }
  & $Chrome --headless=new --disable-gpu --hide-scrollbars `
    --user-data-dir=$profile --force-device-scale-factor=1 `
    --window-size="$($j.w),$($j.h)" --virtual-time-budget=3000 `
    --screenshot=$file "http://localhost:5599/$($j.url)" 2>$null | Out-Null
  if (Test-Path $file) {
    Add-Type -AssemblyName System.Drawing
    $img = [System.Drawing.Image]::FromFile($file)
    Write-Output ("{0}  {1}x{2}" -f $j.file, $img.Width, $img.Height)
    $img.Dispose()
  } else {
    Write-Output ("{0}  FAILED" -f $j.file)
  }
}
