#!/usr/bin/env bash
# Collect allure-results from every workspace into ./allure-results at the
# repo root, so one `allure generate` covers all suites. Result files are
# UUID-named, so a flat copy cannot collide.
set -euo pipefail
cd "$(dirname "$0")/.."

mkdir -p allure-results
find services tests -path '*/node_modules' -prune -o -type d -name allure-results -print |
  while read -r dir; do
    cp -R "$dir"/. allure-results/
  done

echo "Collected $(ls allure-results | wc -l | tr -d ' ') result files into ./allure-results"
