#!/usr/bin/env bash
# Publishes docker/dockerhub-*.md as the Overview of each Docker Hub repository.
# Needs a Docker Hub access token with Read, Write, Delete scope:
#   DOCKERHUB_TOKEN=dckr_pat_... ./docker/push-readme.sh
set -euo pipefail

NAMESPACE="${DOCKERHUB_USER:-jpainam}"
: "${DOCKERHUB_TOKEN:?set DOCKERHUB_TOKEN to a Docker Hub access token}"
cd "$(dirname "$0")"

jwt=$(curl -fsS https://hub.docker.com/v2/users/login/ \
  -H "Content-Type: application/json" \
  -d "$(jq -n --arg u "$NAMESPACE" --arg p "$DOCKERHUB_TOKEN" '{username: $u, password: $p}')" |
  jq -r .token)

push() {
  local repo="$1" file="$2" short="$3"
  # Docker Hub rejects an Overview above 25,000 bytes.
  if [ "$(wc -c <"$file")" -gt 25000 ]; then
    echo "$file is over the 25,000 byte limit" >&2
    exit 1
  fi
  curl -fsS -X PATCH "https://hub.docker.com/v2/repositories/$NAMESPACE/$repo/" \
    -H "Authorization: JWT $jwt" \
    -H "Content-Type: application/json" \
    -d "$(jq -n --rawfile full "$file" --arg short "$short" '{full_description: $full, description: $short}')" \
    >/dev/null
  echo "updated $NAMESPACE/$repo"
}

push onirix-web dockerhub-web.md "Onirix: a private AI workspace for organizational knowledge. Web application."
push onirix-worker dockerhub-worker.md "Onirix background worker: indexing, connector syncs, migrations."
