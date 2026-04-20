#!/usr/bin/env bash
# Start both the Next.js web server and the flight checker worker in a single process.
# Used by Render to co-locate both processes on one service so they share the same
# policies.json on the mounted disk.

set -euo pipefail

echo "[START] Launching FlightGuard web server..."
npm run start &
WEB_PID=$!

echo "[START] Launching FlightGuard checker..."
npm run checker &
CHECKER_PID=$!

echo "[START] Both processes running. Web PID=$WEB_PID  Checker PID=$CHECKER_PID"

# Forward SIGTERM to both children for graceful shutdown
cleanup() {
  echo "[START] Shutting down..."
  kill "$WEB_PID" "$CHECKER_PID" 2>/dev/null || true
  wait "$WEB_PID" "$CHECKER_PID" 2>/dev/null || true
  echo "[START] Done."
}
trap cleanup SIGTERM SIGINT

# Block until either process exits (unexpected exit = restart the container)
wait -n "$WEB_PID" "$CHECKER_PID"
EXIT_CODE=$?
echo "[START] A child process exited with code $EXIT_CODE — triggering container restart"
cleanup
exit "$EXIT_CODE"
