#!/bin/sh
set -e

echo "=== Running database migrations ==="
node dist/apps/api/src/infrastructure/database/run-migrations.js

echo "=== Running database seed ==="
node dist/apps/api/src/infrastructure/database/seed.js

echo "=== Starting FlowEngine API ==="
exec node dist/apps/api/src/main.js
