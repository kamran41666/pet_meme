$ErrorActionPreference = 'Stop'
$appRoot = Split-Path -Parent $PSScriptRoot
$buildDir = Join-Path $appRoot 'build'
$distDir = Join-Path $appRoot 'dist'
$nodeExe = (Get-Command node).Source
$targetExe = Join-Path $distDir 'PetMemeStudio.exe'
$blob = Join-Path $buildDir 'pet-meme-studio.blob'

New-Item -ItemType Directory -Force -Path $buildDir, $distDir | Out-Null
Push-Location $appRoot
try {
    & $nodeExe --experimental-sea-config sea-config.json
    if ($LASTEXITCODE -ne 0) { throw 'Failed to generate SEA blob.' }
    Copy-Item -LiteralPath $nodeExe -Destination $targetExe -Force
    & (Join-Path $appRoot 'node_modules\.bin\postject.cmd') $targetExe NODE_SEA_BLOB $blob --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2
    if ($LASTEXITCODE -ne 0) { throw 'Failed to inject SEA resource.' }
    Write-Host "Built: $targetExe"
} finally {
    Pop-Location
}
