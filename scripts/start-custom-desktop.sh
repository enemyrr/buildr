#!/bin/sh
set -eu
PASEO_CHECKOUT_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
PASEO_CUSTOM_APP="$PASEO_CHECKOUT_ROOT/packages/desktop/release/mac-arm64/Paseo.app/Contents/MacOS/Paseo"
if [ ! -x "$PASEO_CUSTOM_APP" ]; then
  echo "Build the desktop app before running this launcher." >&2
  exit 1
fi
export PASEO_HOME="$PASEO_CHECKOUT_ROOT/.dev/paseo-home"
export PASEO_LISTEN=127.0.0.1:6768
export PASEO_ELECTRON_USER_DATA_DIR="$PASEO_CHECKOUT_ROOT/.dev/electron-user-data"
exec "$PASEO_CUSTOM_APP" --open-project "$PASEO_CHECKOUT_ROOT" "$@"
