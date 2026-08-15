#!/bin/sh
set -eu

project_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)

sh "$project_dir/scripts/build-mac-app.sh"
rm -f "$project_dir/standalone/KiloFile.pkg"
productbuild \
  --component "$project_dir/standalone/KiloFile.app" /Applications \
  "$project_dir/standalone/KiloFile.pkg"

printf 'Built %s\n' "$project_dir/standalone/KiloFile.pkg"
