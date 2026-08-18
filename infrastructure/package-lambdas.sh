#!/usr/bin/env bash
# ============================================================================
# Prepares deployable zip artifacts for the three Lambda functions.
# Each function is packaged independently with its own node_modules so
# Terraform can deploy them as separate, small-cold-start functions.
# ============================================================================
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LAMBDA_SRC="${ROOT_DIR}/src/lambda"
BUILD_DIR="${ROOT_DIR}/infrastructure/terraform/build"

mkdir -p "${BUILD_DIR}"

for fn in write search sync; do
  echo "==> Packaging ${fn}"
  STAGE_DIR="${BUILD_DIR}/${fn}"
  rm -rf "${STAGE_DIR}"
  mkdir -p "${STAGE_DIR}"

  cp "${LAMBDA_SRC}/${fn}/index.js" "${STAGE_DIR}/index.js"
  cp "${LAMBDA_SRC}/${fn}/package.json" "${STAGE_DIR}/package.json"
  cp "${LAMBDA_SRC}/db.js" "${STAGE_DIR}/db.js"

  (cd "${STAGE_DIR}" && npm install --omit=dev --silent)

  (cd "${STAGE_DIR}" && zip -qr "../${fn}.zip" .)
  echo "    -> ${BUILD_DIR}/${fn}.zip"
done

echo "==> Done. Zips are in ${BUILD_DIR}/"
