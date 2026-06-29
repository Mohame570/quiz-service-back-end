#!/usr/bin/env bash
# scripts/populate-demo-data.sh
#
# Populates the local Docker stack with comprehensive demo data
# for the Sprint 4 notification/integrity handover demo.
#
# Prerequisites:
#   - Backend running (docker compose up -d)
#   - curl and python3 available
#
# Usage:
#   chmod +x scripts/populate-demo-data.sh
#   ./scripts/populate-demo-data.sh
#
# Owner: L7 (Mohamed Waleed) — Sprint 4

set -euo pipefail

API="http://localhost:3002/api"

# ── Credentials ────────────────────────────────────────────────
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@live-test.example}"
ADMIN_PASS="${ADMIN_PASS:-Password123!}"
STUDENT_EMAIL="${STUDENT_EMAIL:-student@live-test.example}"
STUDENT_PASS="${STUDENT_PASS:-Password123!}"

echo "=== PitIQ Demo Data Population (Sprint 4) ==="

# ── Authenticate ───────────────────────────────────────────────
admin_token() {
  curl -s -X POST "$API/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASS\"}" \
    | python3 -c "import sys,json; print(json.load(sys.stdin)['tokens']['accessToken'])"
}

student_token() {
  curl -s -X POST "$API/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$STUDENT_EMAIL\",\"password\":\"$STUDENT_PASS\"}" \
    | python3 -c "import sys,json; print(json.load(sys.stdin)['tokens']['accessToken'])"
}

AT=$(admin_token)
ST=$(student_token)

echo "✓ Authenticated as admin & student"

# ── Quizzes ────────────────────────────────────────────────────
echo ""
echo "─── Creating demo quizzes ───"

# Get existing quizzes
EXISTING=$(curl -s "$API/admin/quizzes" -H "Authorization: Bearer $AT")
QUIZ1=$(echo "$EXISTING" | python3 -c "import sys,json; qs=[q for q in json.load(sys.stdin) if q['status']=='PUBLISHED']; print(qs[0]['id'] if qs else '')" 2>/dev/null)

if [ -z "$QUIZ1" ]; then
  QUIZ1=$(curl -s -X POST "$API/admin/quizzes" \
    -H "Authorization: Bearer $AT" \
    -H "Content-Type: application/json" \
    -d '{"title":"Demo: Sprint 4 Integration Quiz","description":"Full integration demo quiz for Sprint 4 handover","durationMinutes":30,"passingScore":60}' \
    | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
  echo "✓ Created quiz: $QUIZ1"
else
  echo "✓ Using existing quiz: $QUIZ1"
fi

# ── Attempts with cheating events ──────────────────────────────
echo ""
echo "─── Creating demo attempts with cheating events ───"

create_attempt_with_events() {
  local quiz_id="$1"
  local label="$2"
  local event_count="$3"

  ATTEMPT_ID=$(curl -s -X POST "$API/attempts" \
    -H "Authorization: Bearer $ST" \
    -H "Content-Type: application/json" \
    -d "{\"quizId\":\"$quiz_id\"}" \
    | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")

  # Mix of event types for realism
  EVENTS=("TAB_HIDDEN" "WINDOW_BLUR" "FULLSCREEN_EXIT" "COPY_PASTE" "WINDOW_FOCUS")
  for i in $(seq 1 "$event_count"); do
    ET=${EVENTS[$((RANDOM % ${#EVENTS[@]}))]}
    curl -s -X POST "$API/integrity/events" \
      -H "Authorization: Bearer $ST" \
      -H "Content-Type: application/json" \
      -d "{\"attemptId\":\"$ATTEMPT_ID\",\"eventType\":\"$ET\",\"description\":\"$label event #$i\"}" > /dev/null
  done
  echo "  ✓ $label: $event_count cheating events (attempt $ATTEMPT_ID)"
}

create_attempt_with_events "$QUIZ1" "High-severity" 14
create_attempt_with_events "$QUIZ1" "Medium-severity" 7
create_attempt_with_events "$QUIZ1" "Low-severity" 4
create_attempt_with_events "$QUIZ1" "Minimal" 1

# ── Email delivery logs ───────────────────────────────────────
echo ""
echo "─── Email delivery logs populated ───"
DELIVERY=$(curl -s "$API/admin/notifications/delivery-summary" \
  -H "Authorization: Bearer $AT")
echo "$DELIVERY" | python3 -c "
import sys, json
d = json.load(sys.stdin)
o = d['overall']
print(f'  Total: {o[\"total\"]} | Sent: {o[\"sent\"]} | Failed: {o[\"failed\"]} | Pending: {o[\"pending\"]}')
"

# ── Summary ────────────────────────────────────────────────────
echo ""
echo "─── Integrity check ───"
curl -s "$API/admin/integrity/suspicious?threshold=3" \
  -H "Authorization: Bearer $AT" | python3 -c "
import sys, json
data = json.load(sys.stdin)
print(f'  Flagged attempts (threshold=3): {len(data)}')
for a in data:
    sev = '🔴' if a['eventCount'] >= 10 else ('🟠' if a['eventCount'] >= 5 else '🟡')
    print(f'    {sev} {a[\"studentName\"]}: {a[\"eventCount\"]} events on \"{a[\"quizTitle\"]}\"')
"

echo ""
echo "=== Demo data population complete ==="
echo "Frontend URLs:"
echo "  Integrity:  http://localhost:3000/admin/dashboard/integrity"
echo "  Notifications: http://localhost:3000/admin/dashboard/notifications"
