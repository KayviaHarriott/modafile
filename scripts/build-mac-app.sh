#!/bin/sh
set -eu

project_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
build_dir=$(mktemp -d /private/tmp/pdf-squeeze-build.XXXXXX)
bundle_targets=${KILOFILE_BUNDLES:-app}

rsync -a \
  --exclude='._*' \
  --exclude='.tools' \
  --exclude='node_modules' \
  --exclude='dist' \
  --exclude='src-tauri/target' \
  "$project_dir/" "$build_dir/"

cd "$build_dir"
export PATH="$project_dir/.tools/node/bin:$project_dir/.tools/cargo/bin:$PATH"
export CARGO_HOME="$build_dir/cargo-home"
export RUSTUP_HOME="$project_dir/.tools/rustup"
export CARGO_TARGET_DIR="$build_dir/target"
export npm_config_cache="$build_dir/.npm-cache"

npm install
npm run tauri -- build --bundles "$bundle_targets"

mkdir -p "$project_dir/standalone"
output_app="$project_dir/standalone/Modafile.app"
if [ -d "$output_app" ]; then
  rm -rf "$output_app"
fi
ditto --norsrc "$build_dir/target/release/bundle/macos/Modafile.app" "$output_app"
find "$output_app" -name '._*' -type f -delete
codesign --force --deep --sign - "$output_app"

printf 'Built %s\n' "$output_app"

case ",$bundle_targets," in
  *,dmg,*)
    output_dmg=$(find "$build_dir/target/release/bundle/dmg" -maxdepth 1 -type f -name '*.dmg' | head -n 1)
    if [ -z "$output_dmg" ]; then
      printf '%s\n' 'DMG bundle was not created.' >&2
      exit 1
    fi
    rm -f "$project_dir/standalone/Modafile.dmg"
    cp "$output_dmg" "$project_dir/standalone/Modafile.dmg"
    printf 'Built %s\n' "$project_dir/standalone/Modafile.dmg"
    ;;
esac
