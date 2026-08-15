#!/bin/sh
set -eu

project_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
build_dir=$(mktemp -d /private/tmp/pdf-squeeze-build.XXXXXX)

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
npm run tauri -- build --bundles app

mkdir -p "$project_dir/standalone"
output_app="$project_dir/standalone/KiloFile.app"
if [ -d "$output_app" ]; then
  backup_app="$project_dir/standalone/KiloFile.$(date +%Y%m%d-%H%M%S).previous.app"
  mv "$output_app" "$backup_app"
fi
ditto --norsrc "$build_dir/target/release/bundle/macos/KiloFile.app" "$output_app"
find "$output_app" -name '._*' -type f -delete
codesign --force --deep --sign - "$output_app"

printf 'Built %s\n' "$output_app"
