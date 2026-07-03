#!/bin/bash
set -e

# `test:e2e:with-build` (via turbo) rebuilds the frontend in test mode
# and then runs playwright. We use the explicit `:with-build` variant
# here because this script is invoked without any assumption about
# the current dist/ state; `:no-build` is the counterpart when a
# warm test-mode dist/ is already in place.
echo "🧪 Running e2e with fresh test-mode build..."
yarn test:e2e:with-build
