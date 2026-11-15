#!/bin/sh
# Refreshes the sensor lab (public/lab/) from branch modules-en of this repository.
# Usage, from the repository root:  sh scripts/update_lab.sh
# License: MIT. Written with AI assistance (Claude, Anthropic).
set -e
git fetch origin modules-en
rm -rf public/lab/tools public/lab/src public/lab/data public/lab/vendor
mkdir -p public/lab
git archive origin/modules-en tools/demo.html src data vendor | tar -x -C public/lab
rm -f public/lab/data/horizons_reference.json
echo "public/lab now holds modules-en at $(git rev-parse --short origin/modules-en)"
