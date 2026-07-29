#!/usr/bin/env bash
# Supprime les prereleases nightly-* au-delà des KEEP plus récentes.
#
# Les releases nightly ne sont pas décomptées du quota de stockage Actions,
# mais un build complet pèse plusieurs centaines de Mo : sans purge, le dépôt
# grossit indéfiniment.
#
# Ne doit tourner que dans un seul workflow, pour éviter que deux exécutions
# concurrentes tentent de supprimer la même release.
set -euo pipefail

keep="${KEEP:-3}"

mapfile -t tags < <(
  gh release list --limit 200 --json tagName,createdAt \
    -q '[.[] | select(.tagName | startswith("nightly-"))]
        | sort_by(.createdAt) | reverse | .[].tagName'
)

echo "${#tags[@]} nightly trouvées, conservation des ${keep} plus récentes."

if [ "${#tags[@]}" -le "$keep" ]; then
  echo "Rien à purger."
  exit 0
fi

for tag in "${tags[@]:$keep}"; do
  echo "Suppression de $tag"
  gh release delete "$tag" --yes --cleanup-tag
done
