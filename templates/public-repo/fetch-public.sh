#!/usr/bin/env bash
set -euo pipefail
repo=craigh-na-dun/site
api="https://api.github.com/repos/$repo/releases/assets"
assets="https://github.com/$repo/releases/download/pages-assets-v1"
origin=https://retrogamesphotogallery.pro
get() {
  curl --silent --show-error --fail --location --proto '=https' --proto-redir '=https' \
    --max-time 25 --max-redirs 4 --max-filesize "$1" "${@:2}"
}
asset() {
  local id=$1 name=$2 limit=$3 url
  [[ "$id" =~ ^[1-9][0-9]{0,15}$ ]] || return 1
  url=$(get 16384 "$api/$id" | jq -er '.browser_download_url')
  [[ "$url" == "$assets/"* && "${url##*/}" =~ ^[1-9][0-9]*- && "${url##*/}" == *"-$name" ]] || return 1
  get "$limit" -H 'Accept: application/octet-stream' "$api/$id" -o "input/$name"
}
[[ "$GITHUB_REPOSITORY:$GITHUB_REF" == "$repo:refs/heads/master" ]]
[[ "$DIGEST" =~ ^[a-f0-9]{64}$ ]]
mkdir input
asset "$MANIFEST" manifest.json 4096
[[ $(sha256sum input/manifest.json | cut -d' ' -f1) == "$DIGEST" ]]
asset "$SIGNATURE" manifest.asc 4096
asset "$BUNDLE" bundle.zip 67584
bash templates/public-repo/owner-signature.sh manifest input/manifest.asc < input/manifest.json
seq=$(jq -er '.sequence | select(type == "number")' input/manifest.json)
[[ "$seq" =~ ^[1-9][0-9]{0,14}$ ]]
get 4096 "$assets/receipt-$((seq-1)).json" -o input/previous.json
if [[ "$seq" == 1 ]]; then
  cmp input/previous.json genesis.json
  status=$(curl --silent --show-error --proto '=https' --max-time 20 --max-filesize 65536 \
    --output /dev/null --write-out '%{http_code}' "$origin/publication.json?verify=$GITHUB_RUN_ID")
  [[ "$status" == 404 ]]
else
  get 4096 -H 'Cache-Control: no-cache' "$origin/publication.json?verify=$GITHUB_RUN_ID" -o input/served.json
  cmp input/served.json input/previous.json
fi
rollback=$(jq -r '.rollback' input/manifest.json)
if [[ "$rollback" != null ]]; then
  [[ "$rollback" =~ ^[1-9][0-9]{0,14}$ ]]
  get 4096 "$assets/receipt-$rollback.json" -o input/rollback.json
fi
node --experimental-strip-types tools/bin/verify-public.ts
echo "sequence=$seq" >> "$GITHUB_OUTPUT"
