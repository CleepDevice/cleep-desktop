#!/usr/bin/env bash
# Package official Raspberry Pi Imager builds into flat zips for cleep-desktop release assets.
#
# Versions come from src/flash-tool/rpi-imager-versions.json (single source of truth).
# Override per platform if needed:
#   RPI_IMAGER_LINUX_VERSION=2.0.11 \
#   RPI_IMAGER_MACOS_VERSION=2.0.11.1 \
#   RPI_IMAGER_WINDOWS_VERSION=2.0.11.1 \
#   RPI_IMAGER_BUNDLE_VERSION=2.0.11.1 \
#   scripts/package-rpi-imager.sh
#
# Output:
#   dist/rpi-imager-linux-x64.zip
#   dist/rpi-imager-macos.zip
#   dist/rpi-imager-windows-x64.zip
#
# Upload example (bundle tag on cleep-desktop):
#   gh release create "rpi-imager-v${BUNDLE_VERSION}" \
#     dist/rpi-imager-linux-x64.zip \
#     dist/rpi-imager-macos.zip \
#     dist/rpi-imager-windows-x64.zip \
#     --repo CleepDevice/cleep-desktop \
#     --title "Raspberry Pi Imager ${BUNDLE_VERSION}" \
#     --notes "Packaged rpi-imager for CleepDesktop (per-platform source versions in release body)"

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
VERSIONS_FILE="${ROOT_DIR}/src/flash-tool/rpi-imager-versions.json"
WORK_DIR="${ROOT_DIR}/.rpi-imager-build"
DIST_DIR="${ROOT_DIR}/dist"

if [ ! -f "${VERSIONS_FILE}" ]; then
  echo "Missing ${VERSIONS_FILE}" >&2
  exit 1
fi

read_version() {
  local key="$1"
  python3 -c "import json; d=json.load(open('${VERSIONS_FILE}')); print(d${key})"
}

BUNDLE_VERSION="${RPI_IMAGER_BUNDLE_VERSION:-${RPI_IMAGER_VERSION:-$(read_version "['bundle']")}}"
LINUX_VERSION="${RPI_IMAGER_LINUX_VERSION:-$(read_version "['sources']['linux']")}"
MACOS_VERSION="${RPI_IMAGER_MACOS_VERSION:-$(read_version "['sources']['macos']")}"
WINDOWS_VERSION="${RPI_IMAGER_WINDOWS_VERSION:-$(read_version "['sources']['windows']")}"

github_base() {
  echo "https://github.com/raspberrypi/rpi-imager/releases/download/v$1"
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required command: $1" >&2
    exit 1
  }
}

need_cmd curl
need_cmd 7z
need_cmd zip
need_cmd python3

download() {
  local url="$1"
  local out="$2"
  echo "Downloading ${url}"
  if ! curl -fL --retry 3 -o "${out}" "${url}"; then
    return 1
  fi
}

echo "Bundle tag      : rpi-imager-v${BUNDLE_VERSION}"
echo "Linux source    : v${LINUX_VERSION}"
echo "macOS source    : v${MACOS_VERSION}"
echo "Windows source  : v${WINDOWS_VERSION}"
echo

rm -rf "${WORK_DIR}"
mkdir -p "${WORK_DIR}" "${DIST_DIR}"

# --- Linux (cli AppImage) ---
echo "==> Linux cli AppImage (v${LINUX_VERSION})"
LINUX_ASSET="Raspberry_Pi_Imager-v${LINUX_VERSION}-cli-x86_64.AppImage"
LINUX_SRC="${WORK_DIR}/${LINUX_ASSET}"
LINUX_BASE="$(github_base "${LINUX_VERSION}")"
download "${LINUX_BASE}/${LINUX_ASSET}" "${LINUX_SRC}" || {
  echo "Failed to download ${LINUX_ASSET} from GitHub; trying downloads.raspberrypi.com"
  download "https://downloads.raspberrypi.com/imager/${LINUX_ASSET}" "${LINUX_SRC}"
}
mkdir -p "${WORK_DIR}/linux"
7z x -o"${WORK_DIR}/linux" "${LINUX_SRC}" >/dev/null
(
  cd "${WORK_DIR}/linux"
  if [ -x usr/bin/rpi-imager-cli ]; then
    ln -sf usr/bin/rpi-imager-cli rpi-imager
  elif [ -x usr/bin/rpi-imager ]; then
    ln -sf usr/bin/rpi-imager rpi-imager
  elif [ -x AppRun ]; then
    ln -sf AppRun rpi-imager
  else
    echo "Could not locate rpi-imager binary in Linux AppImage extract" >&2
    find . -maxdepth 3 -type f -name 'rpi-imager*' -o -name 'AppRun' >&2 || true
    exit 1
  fi
  printf '%s\n' "${LINUX_VERSION}" > .rpi-imager-source-version
  zip -q -9 -r "${DIST_DIR}/rpi-imager-linux-x64.zip" .
)

# --- macOS (DMG) ---
echo "==> macOS DMG (v${MACOS_VERSION})"
MACOS_ASSET="rpi-imager-v${MACOS_VERSION}.dmg"
MACOS_ASSET_ALT="Raspberry_Pi_Imager-${MACOS_VERSION}.dmg"
MACOS_SRC="${WORK_DIR}/macos.dmg"
MACOS_BASE="$(github_base "${MACOS_VERSION}")"
if ! download "${MACOS_BASE}/${MACOS_ASSET}" "${MACOS_SRC}"; then
  if ! download "${MACOS_BASE}/${MACOS_ASSET_ALT}" "${MACOS_SRC}"; then
    download "https://downloads.raspberrypi.com/imager/rpi-imager-${MACOS_VERSION}.dmg" "${MACOS_SRC}" || \
      download "https://downloads.raspberrypi.com/imager/imager_${MACOS_VERSION}.dmg" "${MACOS_SRC}"
  fi
fi
mkdir -p "${WORK_DIR}/macos"
7z x -o"${WORK_DIR}/macos" -snld "${MACOS_SRC}" >/dev/null
(
  cd "${WORK_DIR}/macos"
  if [ -d Contents ]; then
    cd Contents
  elif [ -d "Raspberry Pi Imager.app/Contents" ]; then
    cd "Raspberry Pi Imager.app/Contents"
  else
    APP_CONTENTS=$(find . -type d -path '*/Contents/MacOS' | head -n1 | sed 's|/MacOS||')
    if [ -z "${APP_CONTENTS}" ]; then
      echo "Could not locate macOS Contents directory" >&2
      find . -maxdepth 4 -type d >&2 || true
      exit 1
    fi
    cd "${APP_CONTENTS}"
  fi
  ln -sf MacOS/rpi-imager rpi-imager 2>/dev/null || ln -sf "MacOS/Raspberry Pi Imager" rpi-imager
  printf '%s\n' "${MACOS_VERSION}" > .rpi-imager-source-version
  zip -q -9 -r "${DIST_DIR}/rpi-imager-macos.zip" .
)

# --- Windows (EXE installer extract via innoextract; 7z cannot unpack modern Inno Setup) ---
echo "==> Windows EXE (v${WINDOWS_VERSION})"
WINDOWS_ASSET="imager-v${WINDOWS_VERSION}.exe"
WINDOWS_ASSET_ALT="imager-${WINDOWS_VERSION}.exe"
WINDOWS_SRC="${WORK_DIR}/windows.exe"
WINDOWS_BASE="$(github_base "${WINDOWS_VERSION}")"
if ! download "${WINDOWS_BASE}/${WINDOWS_ASSET}" "${WINDOWS_SRC}"; then
  if ! download "${WINDOWS_BASE}/${WINDOWS_ASSET_ALT}" "${WINDOWS_SRC}"; then
    download "https://downloads.raspberrypi.com/imager/${WINDOWS_ASSET}" "${WINDOWS_SRC}" || \
      download "https://downloads.raspberrypi.com/imager/imager_${WINDOWS_VERSION}.exe" "${WINDOWS_SRC}"
  fi
fi
mkdir -p "${WORK_DIR}/windows"
if command -v innoextract >/dev/null 2>&1; then
  (
    cd "${WORK_DIR}/windows"
    innoextract -d . "${WINDOWS_SRC}" >/dev/null
  )
else
  # Fallback: older Inno Setup installers sometimes unpack with 7z
  7z x -o"${WORK_DIR}/windows" "${WINDOWS_SRC}" >/dev/null || true
fi
(
  cd "${WORK_DIR}/windows"
  # innoextract often places files under app/
  if [ -d app ] && [ ! -f rpi-imager.exe ]; then
    cd app
  fi
  if [ ! -f rpi-imager.exe ]; then
    FOUND=$(find . -iname 'rpi-imager.exe' | head -n1 || true)
    if [ -n "${FOUND}" ]; then
      cp "${FOUND}" ./rpi-imager.exe
    else
      echo "Could not locate rpi-imager.exe in Windows extract" >&2
      echo "Install innoextract (supports recent Inno Setup) and re-run." >&2
      find . -maxdepth 3 -type f -iname '*.exe' >&2 || true
      exit 1
    fi
  fi
  printf '%s\n' "${WINDOWS_VERSION}" > .rpi-imager-source-version
  zip -q -9 -r "${DIST_DIR}/rpi-imager-windows-x64.zip" .
)

echo
echo "Packaged Raspberry Pi Imager bundle ${BUNDLE_VERSION}:"
echo "  linux   <- official v${LINUX_VERSION}"
echo "  macos   <- official v${MACOS_VERSION}"
echo "  windows <- official v${WINDOWS_VERSION}"
ls -lh "${DIST_DIR}"/rpi-imager-*.zip
echo
echo "Publish with:"
echo "  gh release create \"rpi-imager-v${BUNDLE_VERSION}\" \\"
echo "    dist/rpi-imager-linux-x64.zip \\"
echo "    dist/rpi-imager-macos.zip \\"
echo "    dist/rpi-imager-windows-x64.zip \\"
echo "    --repo CleepDevice/cleep-desktop \\"
echo "    --title \"Raspberry Pi Imager ${BUNDLE_VERSION}\" \\"
echo "    --notes \"linux ${LINUX_VERSION} / macos ${MACOS_VERSION} / windows ${WINDOWS_VERSION}\""

rm -rf "${WORK_DIR}"
