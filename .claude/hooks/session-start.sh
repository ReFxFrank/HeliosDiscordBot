#!/bin/bash
set -euo pipefail

# Only needed in Claude Code on the web — local checkouts manage their own deps.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# Install workspace dependencies (pnpm monorepo). Plain `install` (not a frozen
# ci install) so the cached container state is reused on subsequent sessions.
# postinstall runs `prisma generate`, which needs engine downloads from
# binaries.prisma.sh — blocked under restrictive network policies — so a
# failure here is tolerated and the fallback below still produces the client.
pnpm install ||
  echo "session-start: pnpm install reported failures (likely blocked engine downloads); continuing"

# Prisma client: try the full generate first (works when binaries.prisma.sh is
# reachable or engines are already cached). Fall back to a types-only generate
# that skips engine downloads entirely — the generated .d.ts client is what
# makes `pnpm typecheck` and the unit tests accurate, and no engine is needed
# for those. (The stub paths satisfy the CLI's engines-exist precheck; codegen
# itself runs in WASM.)
if ! pnpm --filter @refx/database exec prisma generate; then
  echo "session-start: full prisma generate failed; generating types-only client"
  PRISMA_SCHEMA_ENGINE_BINARY=/bin/true \
    PRISMA_QUERY_ENGINE_LIBRARY=/bin/true \
    CHECKPOINT_DISABLE=1 \
    pnpm --filter @refx/database exec prisma generate --no-engine
fi

echo "session-start: dependencies installed and Prisma client generated"
