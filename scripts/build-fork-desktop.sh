#!/bin/sh
# Builds an unsigned macOS desktop app that runs beside the official Paseo.
# It has its own name, bundle ID, and state directory, starts its daemon on the
# first free port from PASEO_FORK_LISTEN upward, and never installs official
# updates. See packages/desktop/src/desktop-variant.ts.
#
# The bundle keeps productName "Paseo" so the executable, helper apps, and CLI
# shim keep the names the runtime looks up. A renamed helper makes the daemon
# and terminal workers fall back to the main executable, and each one appears
# in the Dock. Electron finds its helper through CFBundleName, so only
# CFBundleDisplayName carries the fork name.
set -eu

FORK_NAME="${PASEO_FORK_NAME:-Paseo Fork}"
FORK_APP_ID="${PASEO_FORK_APP_ID:-sh.paseo.desktop.fork}"
FORK_HOME="${PASEO_FORK_HOME:-~/.paseo-fork}"
FORK_LISTEN="${PASEO_FORK_LISTEN:-127.0.0.1:6777}"

npm run build:desktop -- --mac dir --arm64 \
  -c.mac.notarize=false \
  -c.mac.identity=null \
  -c.appId="$FORK_APP_ID" \
  -c.mac.extendInfo.CFBundleDisplayName="$FORK_NAME" \
  -c.extraMetadata.paseoVariant.name="$FORK_NAME" \
  -c.extraMetadata.paseoVariant.home="$FORK_HOME" \
  -c.extraMetadata.paseoVariant.listen="$FORK_LISTEN"

echo "Built packages/desktop/release/mac-arm64/Paseo.app. Install it as /Applications/$FORK_NAME.app."
