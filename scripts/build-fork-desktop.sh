#!/bin/sh
# Builds an unsigned macOS desktop app, branded Buildr, that runs beside the
# official Paseo. It has its own bundle ID and state directory, starts its
# daemon on the first free port from PASEO_FORK_LISTEN upward, and never
# installs official updates. See packages/desktop/src/desktop-variant.ts.
#
# The bundle keeps productName "Paseo" so the executable, helper apps, and CLI
# shim keep the names the runtime looks up. A renamed helper makes the daemon
# and terminal workers fall back to the main executable, and each one appears
# in the Dock. Electron finds its helper through CFBundleName, so only
# CFBundleDisplayName carries the display name.
#
# PASEO_FORK_NAME is internal: it names the userData directory and the keychain
# item that encrypts browser cookies. Change it and the app starts empty.
# PASEO_FORK_DISPLAY_NAME is what the user sees.
#
# The icon comes from packages/desktop/assets. Regenerate it with
# `node scripts/generate-buildr-icon.ts`.
set -eu

FORK_NAME="${PASEO_FORK_NAME:-Paseo Fork}"
FORK_DISPLAY_NAME="${PASEO_FORK_DISPLAY_NAME:-Buildr}"
FORK_APP_ID="${PASEO_FORK_APP_ID:-sh.paseo.desktop.fork}"
FORK_HOME="${PASEO_FORK_HOME:-~/.paseo-fork}"
FORK_LISTEN="${PASEO_FORK_LISTEN:-127.0.0.1:6777}"

npm run build:desktop -- --mac dir --arm64 \
  -c.mac.notarize=false \
  -c.mac.identity=null \
  -c.appId="$FORK_APP_ID" \
  -c.mac.extendInfo.CFBundleDisplayName="$FORK_DISPLAY_NAME" \
  -c.extraMetadata.paseoVariant.name="$FORK_NAME" \
  -c.extraMetadata.paseoVariant.displayName="$FORK_DISPLAY_NAME" \
  -c.extraMetadata.paseoVariant.home="$FORK_HOME" \
  -c.extraMetadata.paseoVariant.listen="$FORK_LISTEN"

echo "Built packages/desktop/release/mac-arm64/Paseo.app. Install it as /Applications/$FORK_DISPLAY_NAME.app."
