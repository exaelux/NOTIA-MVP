#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIN_PATH="${SCRIPT_DIR}/target/release/identity-server"

if [[ -f "${SCRIPT_DIR}/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "${SCRIPT_DIR}/.env"
  set +a
fi

if [[ ! -x "${BIN_PATH}" ]]; then
  cargo build --release --manifest-path "${SCRIPT_DIR}/Cargo.toml"
fi

exec "${BIN_PATH}"
