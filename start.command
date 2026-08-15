#!/bin/zsh
cd "${0:A:h}"
export PATH="$PWD/.tools/node/bin:$PATH"
export npm_config_cache="$PWD/.tools/npm-cache"
if [ ! -d node_modules ]; then
  npm install
fi
npm run dev
