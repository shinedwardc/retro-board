#!/bin/sh
# Deploys one image tag on the server: ./scripts/deploy.sh [latest | sha-<commit>]
#
# CI runs it over SSH as the forced command of the deploy key (see docs/self-hosting.md),
# so the tag CI asks for arrives in SSH_ORIGINAL_COMMAND instead of $1. Anything that
# isn't a tag is refused, so the key can only ever redeploy.
set -eu

# Everything runs from main(), so the `git pull` below can rewrite this file safely
main() {
	tag="${1:-${SSH_ORIGINAL_COMMAND:-latest}}"
	# A case pattern matches the whole string, so newlines or extra words can't sneak through
	case "$tag" in
	latest | sha-[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]) ;;
	*)
		echo "deploy: refusing tag '$tag' (want latest or sha-<7-char commit>)" >&2
		exit 1
		;;
	esac

	cd "$(dirname "$0")/.."

	# Compose file and docs changes ride along with the code
	git pull --ff-only --quiet

	echo "deploy: pulling $tag"
	IMAGE_TAG="$tag" docker compose pull --quiet web server

	# Record the tag in .env so a later plain `docker compose up -d` keeps running it
	if grep -q '^IMAGE_TAG=' .env; then
		sed -i "s/^IMAGE_TAG=.*/IMAGE_TAG=$tag/" .env
	else
		[ -z "$(tail -c1 .env)" ] || echo >>.env
		echo "IMAGE_TAG=$tag" >>.env
	fi

	docker compose up -d --remove-orphans

	# Old images pile up on a small disk; any of them can be pulled again for a rollback
	docker image prune --all --force >/dev/null

	docker compose ps --format '{{.Service}}	{{.Image}}	{{.Status}}'
}

main "$@"
exit
