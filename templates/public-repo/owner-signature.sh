#!/usr/bin/env bash
set -euo pipefail
base=$(cd "$(dirname "$0")" && pwd)
GNUPGHOME=$(mktemp -d)
export GNUPGHOME
trap 'rm -rf "$GNUPGHOME"' EXIT
owner=98731EBDE30A9026B7CE8973E9190AF6097908CD
gpg --quiet --batch --import "$base/owner.asc"
case "$1" in
manifest)
  # GnuPG accepts trailing text. Only a single ASCII-armored signature may
  # cross the private-to-public boundary, including the bytes outside its packet.
  python3 - "$2" <<'PYTHON'
import base64
from pathlib import Path
import re
import sys
armor = Path(sys.argv[1]).read_bytes()
match = re.fullmatch(rb"-----BEGIN PGP SIGNATURE-----\n\n((?:[A-Za-z0-9+/=]+\n)+)-----END PGP SIGNATURE-----\n?", armor)
if not match:
    raise SystemExit("unexpected detached signature armor")
lines = match[1].splitlines()
if lines[-1].startswith(b"="):
    if not re.fullmatch(rb"=[A-Za-z0-9+/]{4}", lines.pop()):
        raise SystemExit("invalid armor checksum")
base64.b64decode(b"".join(lines), validate=True)
PYTHON
  packets=$(gpg --batch --list-packets "$2")
  [[ $(grep -c '^:' <<< "$packets") == 1 && "$packets" == *':signature packet:'* ]]
  status=$(gpg --batch --no-auto-key-retrieve --status-fd 1 --verify "$2" -)
  awk -v owner="$owner" '$1 == "[GNUPG:]" && $2 == "VALIDSIG" && ($3 == owner || $NF == owner) {valid++} END {exit valid != 1}' <<< "$status"
  ;;
commit)
  sha=$(git rev-parse HEAD)
  [[ ${GITHUB_REPOSITORY:-} == craigh-na-dun/site && ${GITHUB_SHA:-} == "$sha" ]]
  gh api --hostname github.com "repos/craigh-na-dun/site/commits/$sha" | jq -e --arg sha "$sha" '
    .sha==$sha and .author.id==361226772 and .author.login=="craigh-na-dun-infra[bot]" and
    .author.type=="Bot" and .committer.login=="web-flow" and
    .commit.verification.verified==true and .commit.verification.reason=="valid"' >/dev/null
  ;;
*) exit 2 ;;
esac
