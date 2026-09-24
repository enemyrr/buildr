#!/bin/sh
# Cuts a Buildr release. It bumps the workspace version, builds a signed and
# notarized Apple silicon dmg and zip, and publishes them as a GitHub release on
# enemyrr/buildr. Installed copies update themselves from that release.
#
# Every workspace moves to the same version. The desktop app restarts a daemon
# whose version differs from its own, so a desktop-only bump would restart the
# daemon, and stop its agents, on every launch.
#
# Tags are named buildr-v<version> because the upstream workflows trigger on
# v* tags.
#
# The build packages whatever is in the working tree, so run it from a checkout
# no agent edits, such as a dedicated worktree at origin/main:
#   git worktree add --detach ../buildr-release origin/main
#
# Usage: scripts/release-buildr-mac.sh [patch|minor|major]
#
# Store the notarization credentials once before the first release:
#   xcrun notarytool store-credentials buildr --apple-id APPLE_ID --team-id 6ECNB95892
set -eu

MODE="${1:-patch}"
REPO=enemyrr/buildr
IDENTITY="RIBBAN AB (6ECNB95892)"
OUT=packages/desktop/release

cd "$(dirname "$0")/.."

fail() {
  echo "$1" >&2
  exit 1
}

[ -z "$(git status --porcelain)" ] || fail "Commit or stash your changes first."
git fetch -q origin main
[ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] || fail "Check out origin/main first."
xcrun notarytool history --keychain-profile buildr >/dev/null ||
  fail "Store the buildr notarytool profile first. See the header of this script."

VERSION=$(node scripts/set-release-version.mjs --mode "$MODE" --print)
TAG="buildr-v$VERSION"
if gh release view "$TAG" -R "$REPO" >/dev/null 2>&1; then
  fail "Release $TAG already exists."
fi

npm pkg set version="$VERSION"
npm run version:sync-internal
npm run release:prepare

rm -rf "$OUT"
APPLE_KEYCHAIN_PROFILE=buildr scripts/build-fork-desktop.sh \
  --mac dmg zip --arm64 --publish never \
  -c.mac.identity="$IDENTITY" \
  -c.extraMetadata.paseoVariant.updates=true

for file in "Buildr-$VERSION-arm64.dmg" "Buildr-$VERSION-arm64.zip" latest-mac.yml; do
  [ -f "$OUT/$file" ] || fail "Missing $OUT/$file."
done
# The dmg itself stays unsigned, like upstream's. Gatekeeper checks the app.
spctl --assess --type exec "$OUT/mac-arm64/Buildr.app" || fail "Gatekeeper rejects Buildr.app."
xcrun stapler validate "$OUT/mac-arm64/Buildr.app" || fail "Buildr.app has no notarization ticket."

git add -- package-lock.json $(git ls-files '*package.json')
git commit -m "chore(release): Buildr $VERSION"
git push origin HEAD:main

gh release create "$TAG" -R "$REPO" --target main --title "Buildr $VERSION" --generate-notes \
  "$OUT/Buildr-$VERSION-arm64."* "$OUT/latest-mac.yml"

echo "Published https://github.com/$REPO/releases/tag/$TAG"
