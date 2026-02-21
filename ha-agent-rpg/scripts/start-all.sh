#!/usr/bin/env bash
set -e

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# --- Check for processes already using our ports ---
PORTS=(3001 5173)
STALE_PIDS=()

for port in "${PORTS[@]}"; do
  # Find listening PIDs on this port (exclude Chrome helpers, etc.)
  pids=$(lsof -ti :"$port" -sTCP:LISTEN 2>/dev/null || true)
  for pid in $pids; do
    STALE_PIDS+=("$pid")
  done
done

# Also check for leftover agent.py processes from a previous run
agent_pids=$(pgrep -f "python3.*agent\.py" 2>/dev/null || true)
for pid in $agent_pids; do
  STALE_PIDS+=("$pid")
done

# Deduplicate
if [ ${#STALE_PIDS[@]} -gt 0 ]; then
  UNIQUE_PIDS=($(printf '%s\n' "${STALE_PIDS[@]}" | sort -u))

  echo "⚠  Found existing processes that may conflict:"
  echo ""
  printf "  %-8s %s\n" "PID" "COMMAND"
  for pid in "${UNIQUE_PIDS[@]}"; do
    cmd=$(ps -p "$pid" -o command= 2>/dev/null || echo "(unknown)")
    printf "  %-8s %s\n" "$pid" "$cmd"
  done
  echo ""
  read -r -p "Kill these processes and continue? [Y/n] " answer
  case "$answer" in
    [nN]*)
      echo "Aborting. Stop the conflicting processes and try again."
      exit 1
      ;;
    *)
      for pid in "${UNIQUE_PIDS[@]}"; do
        kill "$pid" 2>/dev/null && echo "  Killed PID $pid" || true
      done
      sleep 1
      echo ""
      ;;
  esac
fi

echo "=== Installing Node dependencies ==="
cd "$PROJECT_DIR" && npm install

# --- Redis ---
echo ""
echo "=== Starting Redis (port 6379) ==="
REDIS_PID=""
if command -v redis-server &>/dev/null; then
  # Check if Redis is already running
  if redis-cli ping &>/dev/null 2>&1; then
    echo "  Redis already running — skipping start"
  else
    redis-server --daemonize yes --logfile /tmp/redis-agent-rpg.log
    sleep 1
    if redis-cli ping &>/dev/null 2>&1; then
      REDIS_PID=$(redis-cli info server 2>/dev/null | grep "^process_id:" | tr -d '[:space:]' | cut -d: -f2)
      echo "  Redis started (PID $REDIS_PID)"
    else
      echo "  Warning: Redis failed to start — server will fall back to JSON persistence"
    fi
  fi
  export STORAGE_BACKEND=redis
  echo "  STORAGE_BACKEND=redis"
else
  echo "  redis-server not found — install with: brew install redis"
  echo "  Falling back to JSON persistence (STORAGE_BACKEND=json)"
  export STORAGE_BACKEND=json
fi

echo ""
echo "=== Starting Bridge Server (port 3001) ==="
cd "$PROJECT_DIR" && npm run dev:server &
SERVER_PID=$!
sleep 2

echo ""
echo "=== Starting Phaser Client (port 5173) ==="
cd "$PROJECT_DIR" && npm run dev:client &
CLIENT_PID=$!
sleep 3

echo ""
echo "=== Setting up Python virtual environment ==="
if [ ! -d "$PROJECT_DIR/agent/.venv" ]; then
  python3 -m venv "$PROJECT_DIR/agent/.venv"
fi
"$PROJECT_DIR/agent/.venv/bin/pip" install -q -r "$PROJECT_DIR/agent/requirements.txt"

PYTHON="$PROJECT_DIR/agent/.venv/bin/python3"

echo ""
echo "=== Starting Agent 1 (Hero) ==="
cd "$PROJECT_DIR/agent" && "$PYTHON" agent.py agent_1 Hero ff3300 &
AGENT1_PID=$!
sleep 1

echo ""
echo "=== Starting Agent 2 (Mage) ==="
cd "$PROJECT_DIR/agent" && "$PYTHON" agent.py agent_2 Mage 3366ff &
AGENT2_PID=$!

echo ""
echo "============================================"
echo "  All components running!"
echo "  Redis          : localhost:6379 (${STORAGE_BACKEND} mode)"
echo "  Bridge Server  : ws://localhost:3001  (PID $SERVER_PID)"
echo "  Phaser Client  : http://localhost:5173 (PID $CLIENT_PID)"
echo "  Agent 1 (Hero) : PID $AGENT1_PID"
echo "  Agent 2 (Mage) : PID $AGENT2_PID"
echo "============================================"
echo "  Press Ctrl+C to stop all."
echo ""

trap "kill $SERVER_PID $CLIENT_PID $AGENT1_PID $AGENT2_PID 2>/dev/null; redis-cli shutdown nosave 2>/dev/null || true; exit" INT TERM
wait
