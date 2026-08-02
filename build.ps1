# ストア提出用のzipを作る。test/ と promo/ は入れない。
$root = $PSScriptRoot
$dist = Join-Path $root 'dist'
$stage = Join-Path $dist 'pkg'
$zip = Join-Path $dist 'ultimate-web-redactor.zip'

if (Test-Path $dist) { Remove-Item $dist -Recurse -Force }
$null = New-Item -ItemType Directory -Force -Path $stage

foreach ($item in 'manifest.json', 'LICENSE', '_locales', 'icons', 'src') {
  Copy-Item (Join-Path $root $item) $stage -Recurse
}

Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $zip -Force
Remove-Item $stage -Recurse -Force

$size = [math]::Round((Get-Item $zip).Length / 1KB, 1)
Write-Output "$zip  ($size KB)"
Add-Type -AssemblyName System.IO.Compression.FileSystem
$z = [System.IO.Compression.ZipFile]::OpenRead($zip)
$z.Entries | Sort-Object FullName | ForEach-Object { Write-Output ("  " + $_.FullName) }
$z.Dispose()
