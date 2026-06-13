#!/bin/sh
# Expose NXS OS to your phone via a Cloudflare quick tunnel.
# Prints a public https URL; open it on your phone and unlock with
# the NXS_ACCESS_TOKEN from the repo-root .env.
#
# Note: quick-tunnel URLs change on every run. For a permanent setup,
# install Tailscale on the Mac + phone instead and use http://<mac-name>:22706.
set -e
echo "Tunnelling http://localhost:8080 ..."
exec cloudflared tunnel --url http://localhost:8080
