#!/usr/bin/env bash
# Calcule le tag de la prerelease nightly du commit courant.
#
# À sourcer, pas à exécuter. Expose NIGHTLY_TAG, NIGHTLY_DATE et NIGHTLY_SHA7.
#
# La date vient du commit et non du run : android-build.yml et desktop-build.yml
# publient sur la même release, et un build lancé à cheval sur minuit UTC
# calculerait sinon deux tags différents.

NIGHTLY_SHA7="$(git rev-parse --short=7 "${GITHUB_SHA}")"
NIGHTLY_DATE="$(git show -s --format=%cd --date=format:%Y%m%d "${GITHUB_SHA}")"
NIGHTLY_TAG="nightly-${NIGHTLY_DATE}-${NIGHTLY_SHA7}"

export NIGHTLY_SHA7 NIGHTLY_DATE NIGHTLY_TAG

echo "Nightly tag: ${NIGHTLY_TAG}"
