#!/bin/sh
# Builds the macOS desktop app branded Buildr, which runs beside the official
# Paseo. It has its own bundle ID and state directory, and starts its daemon on
# the first free port from PASEO_FORK_LISTEN upward. See
# packages/desktop/src/desktop-variant.ts.
#
# With no arguments, it builds an unsigned .app for local use. Extra arguments
# replace those defaults and go to electron-builder, which is how
# scripts/release-buildr-mac.sh builds the signed release.
#
# The bundle, executable, and helper apps are all named after the display
# name, so Electron finds its helpers through CFBundleName and the macOS menu
# bar shows the display name. Code that locates the helper derives its name
# from the main executable (see bin/paseo and daemon/runtime-paths.ts).
#
# PASEO_FORK_NAME is internal: it names the userData directory and the keychain
# item that encrypts browser cookies. Change it and the app starts empty.
# PASEO_FORK_DISPLAY_NAME is what the user sees.
#
# The icon comes from packages/desktop/assets. Regenerate it with
# `node scripts/generate-buildr-icon.ts`.
set -eu

FORK_NAME="${PASEO_FORK_NAME:-Buildr}"
FORK_DISPLAY_NAME="${PASEO_FORK_DISPLAY_NAME:-Buildr}"
FORK_APP_ID="${PASEO_FORK_APP_ID:-se.ribban.buildr}"
FORK_HOME="${PASEO_FORK_HOME:-~/.buildr}"
FORK_LISTEN="${PASEO_FORK_LISTEN:-127.0.0.1:6777}"
FORK_AUTHOR="Andreas Enemyr <andreas@enemyr.com>"

if [ "$#" -eq 0 ]; then
  set -- --mac dir --arm64 -c.mac.notarize=false -c.mac.identity=null
fi

npm run build:desktop -- "$@" \
  -c.appId="$FORK_APP_ID" \
  -c.productName="$FORK_DISPLAY_NAME" \
  -c.executableName="$FORK_DISPLAY_NAME" \
  -c.copyright="Copyright © $(date +%Y) Andreas Enemyr" \
  -c.mac.artifactName='${productName}-${version}-${arch}.${ext}' \
  -c.mac.extendInfo.CFBundleDisplayName="$FORK_DISPLAY_NAME" \
  -c.publish.owner=enemyrr \
  -c.publish.repo=buildr \
  -c.publish.tagNamePrefix=buildr-v \
  -c.extraMetadata.author="$FORK_AUTHOR" \
  -c.extraMetadata.homepage=https://github.com/enemyrr/buildr \
  -c.extraMetadata.paseoVariant.name="$FORK_NAME" \
  -c.extraMetadata.paseoVariant.displayName="$FORK_DISPLAY_NAME" \
  -c.extraMetadata.paseoVariant.home="$FORK_HOME" \
  -c.extraMetadata.paseoVariant.listen="$FORK_LISTEN"

echo "Built $FORK_DISPLAY_NAME in packages/desktop/release."
