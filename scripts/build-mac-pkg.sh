#!/bin/sh
set -eu

project_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)

sh "$project_dir/scripts/build-mac-app.sh"
rm -f "$project_dir/standalone/Modafile.pkg"
productbuild \
  --component "$project_dir/standalone/Modafile.app" /Applications \
  "$project_dir/standalone/Modafile.pkg"

printf 'Built %s\n' "$project_dir/standalone/Modafile.pkg"
