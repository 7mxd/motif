# Installs Motif's skill for OpenCode, or for any agent that reads ~/.agents/skills.
#   irm https://raw.githubusercontent.com/7mxd/motif/main/install.ps1 | iex
#   & ([scriptblock]::Create((irm https://raw.githubusercontent.com/7mxd/motif/main/install.ps1))) -Uninstall
# Options: -Agent opencode|agents, -Version X.Y.Z, -Uninstall ($env:MOTIF_AGENT and $env:MOTIF_VERSION work too).
# It downloads only from GitHub, checks the download against the release's SHA256SUMS, and replaces or removes only
# Motif's own files. Running it again updates Motif.
param([string]$Agent = $env:MOTIF_AGENT, [string]$Version = $env:MOTIF_VERSION, [switch]$Uninstall)

function Invoke-MotifInstall([string]$Agent, [string]$Version, [bool]$Uninstall) {
  $ErrorActionPreference = 'Stop'
  $ProgressPreference = 'SilentlyContinue'
  if ($Version) { $Version = $Version -replace '^v', '' }
  $Repo = if ($env:MOTIF_REPO) { $env:MOTIF_REPO } else { '7mxd/motif' }
  $Raw = if ($env:MOTIF_RAW_BASE) { $env:MOTIF_RAW_BASE } else { "https://raw.githubusercontent.com/$Repo/plugins" }
  $Mark = "Installed by Motif's install script"
  function Say([string]$Text) { Write-Host "Motif: $Text" }
  function Fail([string]$Text) { [Console]::Error.WriteLine("Motif: $Text"); return 2 }
  function Test-Motif([string]$Dir) {
    $skill = Join-Path $Dir 'SKILL.md'
    if (-not (Test-Path -LiteralPath $skill) -or -not (Test-Path -LiteralPath (Join-Path (Join-Path $Dir 'bin') 'motif'))) { return $false }
    return [regex]::IsMatch([IO.File]::ReadAllText($skill), '(?m)^name: motif\s*$')
  }

  $UserHome = if ($env:USERPROFILE) { $env:USERPROFILE } else { $HOME }
  $ConfigRoot = if ($env:XDG_CONFIG_HOME) { $env:XDG_CONFIG_HOME } else { Join-Path $UserHome '.config' }
  $OpenCodeConfig = Join-Path $ConfigRoot 'opencode'
  if (-not $Agent) {
    if ((Get-Command opencode -ErrorAction SilentlyContinue) -or (Test-Path -LiteralPath $OpenCodeConfig)) { $Agent = 'opencode' } else { $Agent = 'agents' }
  }
  if ($Agent -eq 'opencode') {
    $Skills = Join-Path $OpenCodeConfig 'skills'; $Commands = Join-Path $OpenCodeConfig 'commands'; $Who = 'OpenCode'
  } elseif ($Agent -eq 'agents') {
    $Skills = Join-Path (Join-Path $UserHome '.agents') 'skills'; $Commands = $null
    $Who = 'agents that read ~/.agents/skills (Codex, Gemini CLI, GitHub Copilot, Cursor, Amp and others)'
  } else {
    return (Fail "-Agent must be opencode or agents, not ""$Agent"".")
  }
  $Target = Join-Path $Skills 'motif'
  $CommandFile = if ($Commands) { Join-Path $Commands 'motif.md' } else { $null }

  if ((Test-Path -LiteralPath $Target) -and -not (Test-Motif $Target)) {
    return (Fail "$Target is there and isn't Motif, so nothing was changed. Move it somewhere else and run this again.")
  }
  if ($CommandFile -and (Test-Path -LiteralPath $CommandFile) -and -not ([IO.File]::ReadAllText($CommandFile).Contains($Mark))) {
    return (Fail "$CommandFile is there and isn't Motif's, so nothing was changed. Move it somewhere else and run this again.")
  }

  if ($Uninstall) {
    if (-not (Test-Path -LiteralPath $Target) -and -not ($CommandFile -and (Test-Path -LiteralPath $CommandFile))) {
      Say "Motif isn't installed in $Skills, so there was nothing to remove."
      return 0
    }
    if (Test-Path -LiteralPath $Target) { Remove-Item -LiteralPath $Target -Recurse -Force }
    if ($CommandFile -and (Test-Path -LiteralPath $CommandFile)) { Remove-Item -LiteralPath $CommandFile -Force }
    Say "removed Motif from $Skills."
    return 0
  }

  $Tmp = Join-Path ([IO.Path]::GetTempPath()) ('motif-install-' + [Guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $Tmp | Out-Null
  try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
    if (-not $Version) {
      # To a file, then read as text: Windows PowerShell returns bytes, not text, when a server labels the file as binary.
      $VersionFile = Join-Path $Tmp 'VERSION'
      try { Invoke-WebRequest -UseBasicParsing -Uri "$Raw/skills/motif/VERSION" -OutFile $VersionFile }
      catch { return (Fail "couldn't find Motif's latest version. Check your internet connection and try again.") }
      $Version = [IO.File]::ReadAllText($VersionFile).Trim()
    }
    if ($Version -notmatch '^[0-9A-Za-z.-]+$') { return (Fail """$Version"" isn't a Motif version.") }
    $Base = if ($env:MOTIF_DOWNLOAD_BASE) { $env:MOTIF_DOWNLOAD_BASE } else { "https://github.com/$Repo/releases/download/v$Version" }
    $Asset = 'motif-skill.zip'
    $Zip = Join-Path $Tmp $Asset
    Say "downloading Motif v$Version..."
    try {
      Invoke-WebRequest -UseBasicParsing -Uri "$Base/$Asset" -OutFile $Zip
      Invoke-WebRequest -UseBasicParsing -Uri "$Base/SHA256SUMS" -OutFile (Join-Path $Tmp 'SHA256SUMS')
    } catch {
      return (Fail "couldn't download Motif v$Version. Check your internet connection and try again.")
    }
    $Expected = $null
    foreach ($line in [IO.File]::ReadAllLines((Join-Path $Tmp 'SHA256SUMS'))) {
      $parts = $line.Trim() -split '\s+'
      if ($parts.Count -ge 2 -and $parts[1].TrimStart('*') -eq $Asset) { $Expected = $parts[0].ToLower() }
    }
    $Sha = [Security.Cryptography.SHA256]::Create()
    $Stream = [IO.File]::OpenRead($Zip)
    try { $Actual = ([BitConverter]::ToString($Sha.ComputeHash($Stream)) -replace '-', '').ToLower() } finally { $Stream.Dispose(); $Sha.Dispose() }
    if (-not $Expected -or $Expected -ne $Actual) {
      return (Fail "the download failed its safety check, so nothing was installed. Please try again later, or report this at https://github.com/$Repo/issues")
    }
    $Unpacked = Join-Path $Tmp 'unpacked'
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [IO.Compression.ZipFile]::ExtractToDirectory($Zip, $Unpacked)
    if (-not (Test-Motif (Join-Path $Unpacked 'motif'))) { return (Fail "the download didn't hold Motif's skill, so nothing was installed.") }

    New-Item -ItemType Directory -Force -Path $Skills | Out-Null
    # Copy next to the installed one first, so a failed copy leaves it as it was.
    $New = Join-Path $Skills '.motif-new'
    if (Test-Path -LiteralPath $New) { Remove-Item -LiteralPath $New -Recurse -Force }
    Copy-Item -LiteralPath (Join-Path $Unpacked 'motif') -Destination $New -Recurse
    if (Test-Path -LiteralPath $Target) { Remove-Item -LiteralPath $Target -Recurse -Force }
    Move-Item -LiteralPath $New -Destination $Target
    if ($CommandFile) {
      New-Item -ItemType Directory -Force -Path $Commands | Out-Null
      Copy-Item -LiteralPath (Join-Path (Join-Path (Join-Path $Unpacked 'opencode') 'commands') 'motif.md') -Destination $CommandFile -Force
    }
  } catch {
    return (Fail "couldn't install Motif: $($_.Exception.Message)")
  } finally {
    Remove-Item -LiteralPath $Tmp -Recurse -Force -ErrorAction SilentlyContinue
  }
  Say "installed Motif v$Version in $Target, for $Who."
  if ($CommandFile) { Say 'start it in OpenCode with /motif.' } else { Say 'start it the way your agent starts a skill (for example /motif).' }
  $Shared = Join-Path (Join-Path (Join-Path $UserHome '.agents') 'skills') 'motif'
  if ($Agent -eq 'opencode' -and (Test-Motif $Shared)) {
    Say "OpenCode also reads ~/.agents/skills, which has an earlier Motif. To remove that one: & ([scriptblock]::Create((irm https://raw.githubusercontent.com/$Repo/main/install.ps1))) -Agent agents -Uninstall"
  }
  return 0
}

$code = Invoke-MotifInstall $Agent $Version $Uninstall.IsPresent
# Run as a file: exit with the code. Run as irm | iex: exit would close the window, so only set it.
if ($PSCommandPath) { exit $code } else { $global:LASTEXITCODE = $code }
