# ストアは 24bit PNG(アルファなし) を要求するので変換する
Add-Type -AssemblyName System.Drawing
$dir = Join-Path $PSScriptRoot 'shots'
foreach ($f in Get-ChildItem $dir -Filter *.png) {
  $img = [System.Drawing.Image]::FromFile($f.FullName)
  $before = $img.PixelFormat
  $bmp = New-Object System.Drawing.Bitmap($img.Width, $img.Height, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.Clear([System.Drawing.Color]::White)
  $g.DrawImage($img, 0, 0, $img.Width, $img.Height)
  $g.Dispose()
  $img.Dispose()
  $bmp.Save($f.FullName, [System.Drawing.Imaging.ImageFormat]::Png)
  Write-Output ("{0}  {1}x{2}  {3} -> {4}" -f $f.Name, $bmp.Width, $bmp.Height, $before, $bmp.PixelFormat)
  $bmp.Dispose()
}
