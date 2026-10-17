# Motif bootstrap (Windows): runs the Motif tool that matches this skill's VERSION,
# downloading and verifying it once if it isn't cached yet.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

# Started from a PowerShell 7 terminal? Drop its module folders so Windows PowerShell
# finds its own built-in commands (otherwise e.g. Get-FileHash goes missing).
if ($PSVersionTable.PSEdition -ne 'Core' -and $env:PSModulePath) {
  $env:PSModulePath = (($env:PSModulePath -split ';') | Where-Object { $_ -and $_ -notmatch '\\PowerShell\\(7|Modules)' }) -join ';'
}

$SkillDir = Split-Path -Parent $PSScriptRoot
$Version = (Get-Content -Raw -Path (Join-Path $SkillDir 'VERSION')).Trim()

if ($env:MOTIF_BIN) {
  & $env:MOTIF_BIN @args
  exit $LASTEXITCODE
}

$Repo = if ($env:MOTIF_REPO) { $env:MOTIF_REPO } else { '7mxd/motif' }
$Asset = 'motif-windows-x64.exe'
$MotifHome = if ($env:MOTIF_HOME) { $env:MOTIF_HOME } else { Join-Path $env:USERPROFILE '.motif' }
$CacheDir = Join-Path (Join-Path $MotifHome 'bin') $Version
$Bin = Join-Path $CacheDir 'motif.exe'

if (-not (Test-Path -LiteralPath $Bin)) {
  $Base = if ($env:MOTIF_DOWNLOAD_BASE) { $env:MOTIF_DOWNLOAD_BASE } else { "https://github.com/$Repo/releases/download/v$Version" }
  $Tmp = Join-Path ([System.IO.Path]::GetTempPath()) ('motif-' + [System.Guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $Tmp | Out-Null
  try {
    [Console]::Error.WriteLine("Motif: downloading the Motif tool v$Version (one time only)...")
    try {
      [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
      Invoke-WebRequest -UseBasicParsing -Uri "$Base/$Asset" -OutFile (Join-Path $Tmp $Asset)
      Invoke-WebRequest -UseBasicParsing -Uri "$Base/SHA256SUMS" -OutFile (Join-Path $Tmp 'SHA256SUMS')
    } catch {
      [Console]::Error.WriteLine("Motif: couldn't download the Motif tool. Check your internet connection and try again.")
      exit 2
    }
    $Expected = $null
    foreach ($line in Get-Content -Path (Join-Path $Tmp 'SHA256SUMS')) {
      $parts = $line.Trim() -split '\s+'
      if ($parts.Count -ge 2 -and $parts[1].TrimStart('*') -eq $Asset) { $Expected = $parts[0].ToLower() }
    }
    # .NET directly rather than Get-FileHash, which lives in a module that can fail to load.
    $Sha = [System.Security.Cryptography.SHA256]::Create()
    $Stream = [System.IO.File]::OpenRead((Join-Path $Tmp $Asset))
    try {
      $Actual = ([System.BitConverter]::ToString($Sha.ComputeHash($Stream)) -replace '-', '').ToLower()
    } finally {
      $Stream.Dispose()
      $Sha.Dispose()
    }
    if (-not $Expected -or $Expected -ne $Actual) {
      [Console]::Error.WriteLine("Motif: the downloaded tool failed its safety check, so it wasn't used. Please try again later, or report this at https://github.com/$Repo/issues")
      exit 2
    }
    # A unique name per process: agents often run several tool calls at once, so first runs can overlap.
    $Partial = Join-Path $CacheDir ('.motif-' + [System.Guid]::NewGuid().ToString('N') + '.partial')
    try {
      New-Item -ItemType Directory -Force -Path $CacheDir | Out-Null
      Move-Item -LiteralPath (Join-Path $Tmp $Asset) -Destination $Partial
      # If another run finished first (or its binary is in use), keep that one.
      if (-not (Test-Path -LiteralPath $Bin)) { Move-Item -LiteralPath $Partial -Destination $Bin }
    } catch {
      if (-not (Test-Path -LiteralPath $Bin)) {
        [Console]::Error.WriteLine("Motif: couldn't set up the Motif tool in $CacheDir. Check that this folder is writable and try again.")
        exit 2
      }
    } finally {
      Remove-Item -Force -LiteralPath $Partial -ErrorAction SilentlyContinue
    }
  } finally {
    Remove-Item -Recurse -Force -LiteralPath $Tmp -ErrorAction SilentlyContinue
  }
}

& $Bin @args
exit $LASTEXITCODE
