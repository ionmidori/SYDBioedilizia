#!/usr/bin/env bash
# Vercel "Ignored Build Step" (wired via vercel.json `ignoreCommand`).
# Runs with cwd = web_client/ (the project's Root Directory).
# Exit 0 = SKIP the build, exit 1 = BUILD. When unsure, build.

case "${VERCEL_GIT_COMMIT_REF:-}" in
  dependabot/*)
    echo "Dependabot branch: skipping (CI on GitHub already builds it)."
    exit 0 ;;
esac

# Compare with the last commit deployed on this branch, not just HEAD^:
# a push can carry several commits and only the last one may be non-frontend.
BASE="${VERCEL_GIT_PREVIOUS_SHA:-}"
if [ -z "$BASE" ] || ! git cat-file -e "${BASE}^{commit}" 2>/dev/null; then
  echo "No usable previous deployment SHA: building."
  exit 1
fi

# Frontend output depends on web_client/ and on the root npm workspace manifests.
if git diff --quiet "$BASE" HEAD -- . ../package.json ../package-lock.json ../.npmrc; then
  echo "No frontend changes since ${BASE:0:7}: skipping."
  exit 0
fi

echo "Frontend changes since ${BASE:0:7}: building."
exit 1
