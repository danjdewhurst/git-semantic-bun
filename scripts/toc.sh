#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOCAL_BIN_DIR="${ROOT_DIR}/.tools/bin"
LOCAL_BIN="${LOCAL_BIN_DIR}/go-toc"

resolve_asset() {
  local os arch
  os="$(uname -s | tr '[:upper:]' '[:lower:]')"
  arch="$(uname -m)"

  case "${os}_${arch}" in
    linux_x86_64) echo "go-toc_linux_amd64.tar.gz" ;;
    linux_aarch64|linux_arm64) echo "go-toc_linux_arm64.tar.gz" ;;
    darwin_x86_64) echo "go-toc_darwin_amd64.tar.gz" ;;
    darwin_arm64) echo "go-toc_darwin_arm64.tar.gz" ;;
    *)
      echo "Unsupported platform: ${os}_${arch}. Install go-toc manually: https://github.com/danjdewhurst/go-toc" >&2
      exit 1
      ;;
  esac
}

ensure_go_toc() {
  if command -v go-toc >/dev/null 2>&1; then
    command -v go-toc
    return
  fi

  if [[ -x "${LOCAL_BIN}" ]]; then
    echo "${LOCAL_BIN}"
    return
  fi

  mkdir -p "${LOCAL_BIN_DIR}"

  local asset url tmp_dir
  asset="$(resolve_asset)"
  url="https://github.com/danjdewhurst/go-toc/releases/latest/download/${asset}"
  tmp_dir="$(mktemp -d)"

  echo "Downloading go-toc (${asset})..." >&2
  curl -fsSL "${url}" | tar xz -C "${tmp_dir}"

  if [[ ! -f "${tmp_dir}/go-toc" ]]; then
    echo "Failed to download go-toc binary from ${url}" >&2
    exit 1
  fi

  mv "${tmp_dir}/go-toc" "${LOCAL_BIN}"
  chmod +x "${LOCAL_BIN}"
  rm -rf "${tmp_dir}"
  echo "${LOCAL_BIN}"
}

GO_TOC_BIN="$(ensure_go_toc)"

"${GO_TOC_BIN}" . \
  --gitignore \
  --summary \
  --summary-chars 120 \
  --max-depth 4 \
  --title "Repository Contents" \
  --output TOC.md

echo "Generated TOC.md"
