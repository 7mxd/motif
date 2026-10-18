#!/bin/sh
# Installs Motif's skill for OpenCode, or for any agent that reads ~/.agents/skills.
#   curl -fsSL https://raw.githubusercontent.com/7mxd/motif/main/install.sh | sh
#   curl -fsSL https://raw.githubusercontent.com/7mxd/motif/main/install.sh | sh -s -- --uninstall
# It downloads only from GitHub, checks the download against the release's SHA256SUMS, and replaces or removes only
# Motif's own files. Running it again updates Motif.
set -eu

REPO="${MOTIF_REPO:-7mxd/motif}"
RAW="${MOTIF_RAW_BASE:-https://raw.githubusercontent.com/$REPO/plugins}"
AGENT=""
VERSION=""
UNINSTALL=0
MARK="Installed by Motif's install script"

say() { printf 'Motif: %s\n' "$*"; }
fail() { printf 'Motif: %s\n' "$*" >&2; exit 2; }
usage() {
  cat <<'EOF'
Usage: install.sh [--agent opencode|agents] [--version X.Y.Z] [--uninstall]
  --agent opencode   install for OpenCode, with its /motif command (the default when OpenCode is installed)
  --agent agents     install in ~/.agents/skills, which Codex, Gemini CLI, Copilot, Cursor, Amp and others read
  --version X.Y.Z    install that version instead of the latest
  --uninstall        remove Motif's skill (and OpenCode's /motif command)
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --agent) [ $# -ge 2 ] || fail "--agent needs opencode or agents."; AGENT="$2"; shift 2 ;;
    --agent=*) AGENT="${1#--agent=}"; shift ;;
    --version) [ $# -ge 2 ] || fail "--version needs a version, such as 0.2.0."; VERSION="$2"; shift 2 ;;
    --version=*) VERSION="${1#--version=}"; shift ;;
    --uninstall) UNINSTALL=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) fail "unknown option \"$1\". Use --agent opencode|agents, --version X.Y.Z or --uninstall." ;;
  esac
done
VERSION="${VERSION#v}"

OPENCODE_CONFIG="${XDG_CONFIG_HOME:-$HOME/.config}/opencode"
if [ -z "$AGENT" ]; then
  if command -v opencode >/dev/null 2>&1 || [ -d "$OPENCODE_CONFIG" ]; then AGENT=opencode; else AGENT=agents; fi
fi
case "$AGENT" in
  opencode) SKILLS="$OPENCODE_CONFIG/skills"; COMMANDS="$OPENCODE_CONFIG/commands"; WHO="OpenCode" ;;
  agents) SKILLS="$HOME/.agents/skills"; COMMANDS=""; WHO="agents that read ~/.agents/skills (Codex, Gemini CLI, GitHub Copilot, Cursor, Amp and others)" ;;
  *) fail "--agent must be opencode or agents, not \"$AGENT\"." ;;
esac
TARGET="$SKILLS/motif"
COMMAND_FILE=""
if [ -n "$COMMANDS" ]; then COMMAND_FILE="$COMMANDS/motif.md"; fi

is_motif() { [ -f "$1/SKILL.md" ] && [ -f "$1/bin/motif" ] && grep -q '^name: motif[[:space:]]*$' "$1/SKILL.md"; }
is_motif_command() { [ -f "$1" ] && grep -q "$MARK" "$1"; }

if [ -e "$TARGET" ] && ! is_motif "$TARGET"; then
  fail "$TARGET is there and isn't Motif, so nothing was changed. Move it somewhere else and run this again."
fi
if [ -n "$COMMAND_FILE" ] && [ -e "$COMMAND_FILE" ] && ! is_motif_command "$COMMAND_FILE"; then
  fail "$COMMAND_FILE is there and isn't Motif's, so nothing was changed. Move it somewhere else and run this again."
fi

if [ "$UNINSTALL" = 1 ]; then
  if [ ! -e "$TARGET" ] && { [ -z "$COMMAND_FILE" ] || [ ! -e "$COMMAND_FILE" ]; }; then
    say "Motif isn't installed in $SKILLS, so there was nothing to remove."
    exit 0
  fi
  rm -rf "$TARGET"
  if [ -n "$COMMAND_FILE" ]; then rm -f "$COMMAND_FILE"; fi
  say "removed Motif from $SKILLS."
  exit 0
fi

fetch() {
  # A connection that stalls (under 1 KB/s for a minute) gives up instead of hanging an agent's tool call.
  if command -v curl >/dev/null 2>&1; then curl -fsSL --connect-timeout 20 --speed-limit 1024 --speed-time 60 "$1" -o "$2"
  elif command -v wget >/dev/null 2>&1; then wget -q --timeout=60 --tries=2 "$1" -O "$2"
  else return 1
  fi
}
sha256() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | cut -d ' ' -f 1
  else shasum -a 256 "$1" | cut -d ' ' -f 1
  fi
}
command -v tar >/dev/null 2>&1 || fail "tar is needed to unpack Motif. Install it, then run this again."

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
if [ -z "$VERSION" ]; then
  fetch "$RAW/skills/motif/VERSION" "$TMP/VERSION" || fail "couldn't find Motif's latest version. Check your internet connection and try again."
  VERSION=$(tr -d ' \r\n' < "$TMP/VERSION")
fi
case "$VERSION" in
  ""|*[!0-9A-Za-z.-]*) fail "\"$VERSION\" isn't a Motif version." ;;
esac

BASE="${MOTIF_DOWNLOAD_BASE:-https://github.com/$REPO/releases/download/v$VERSION}"
ASSET=motif-skill.tar.gz
say "downloading Motif v$VERSION..."
if ! fetch "$BASE/$ASSET" "$TMP/$ASSET" || ! fetch "$BASE/SHA256SUMS" "$TMP/SHA256SUMS"; then
  fail "couldn't download Motif v$VERSION. Check your internet connection and try again."
fi
# "hash  name" or, from sha256sum --binary, "hash *name".
EXPECTED=$(awk -v a="$ASSET" '{ n = $2; sub(/^\*/, "", n); if (n == a) print tolower($1) }' "$TMP/SHA256SUMS")
if [ -z "$EXPECTED" ] || [ "$EXPECTED" != "$(sha256 "$TMP/$ASSET")" ]; then
  fail "the download failed its safety check, so nothing was installed. Please try again later, or report this at https://github.com/$REPO/issues"
fi

mkdir "$TMP/unpacked"
tar -xzf "$TMP/$ASSET" -C "$TMP/unpacked" || fail "couldn't unpack the download."
is_motif "$TMP/unpacked/motif" || fail "the download didn't hold Motif's skill, so nothing was installed."

mkdir -p "$SKILLS" || fail "couldn't create $SKILLS."
# Copy next to the installed one first, so a failed copy leaves it as it was.
NEW="$SKILLS/.motif-new"
rm -rf "$NEW"
if ! cp -R "$TMP/unpacked/motif" "$NEW"; then
  rm -rf "$NEW"
  fail "couldn't write to $SKILLS."
fi
rm -rf "$TARGET"
mv "$NEW" "$TARGET" || fail "couldn't finish installing in $TARGET."
if [ -n "$COMMAND_FILE" ]; then
  mkdir -p "$COMMANDS" || fail "couldn't create $COMMANDS."
  cp "$TMP/unpacked/opencode/commands/motif.md" "$COMMAND_FILE" || fail "couldn't write $COMMAND_FILE."
fi

say "installed Motif v$VERSION in $TARGET, for $WHO."
if [ -n "$COMMAND_FILE" ]; then say "start it in OpenCode with /motif."; else say "start it the way your agent starts a skill (for example /motif)."; fi
if [ "$AGENT" = opencode ] && is_motif "$HOME/.agents/skills/motif"; then
  say "OpenCode also reads ~/.agents/skills, which has an earlier Motif. To remove that one: curl -fsSL https://raw.githubusercontent.com/$REPO/main/install.sh | sh -s -- --agent agents --uninstall"
fi
