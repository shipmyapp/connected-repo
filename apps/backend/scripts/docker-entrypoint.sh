#!/bin/sh
set -e

# 1. Run database migrations
echo "Running database migrations..."
node dist/db/db_script.js up

# 2. Start the server via 'exec' to ensure Node is PID 1
echo "Starting server..."
exec "$@"
