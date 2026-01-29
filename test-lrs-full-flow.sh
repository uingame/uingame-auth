#!/bin/bash

# Complete LRS test - Connect + Logout flow
# This tests the full user session lifecycle

echo "=========================================="
echo "LRS Full Flow Test"
echo "Connect → Logout with LRS tracking"
echo "=========================================="
echo ""

# Generate a unique test token
TEST_TOKEN="test-lrs-$(date +%s)"

echo "Step 1: Setup - Creating test token"
echo "=========================================="
echo "Token: $TEST_TOKEN"
echo ""

# Create test user object (matches SAML user structure)
TEST_USER='{
  "displayName": "Test User",
  "id": "123456789",
  "mosad": "12345",
  "isStudent": false,
  "kita": null
}'

# Create token in Redis
echo "Creating token in Redis..."
redis-cli SET "TOKEN:$TEST_TOKEN" "$TEST_USER" > /dev/null 2>&1
redis-cli EXPIRE "TOKEN:$TEST_TOKEN" 300 > /dev/null 2>&1

if [ $? -ne 0 ]; then
  echo "❌ Redis connection failed. Please ensure Redis is running."
  exit 1
fi

echo "✅ Token created successfully"
echo ""

# Wait a moment for Redis to sync
sleep 1

echo "Step 2: Call /lrs/connect (Enter event)"
echo "=========================================="
echo ""

# Make the connect request
CONNECT_RESPONSE=$(curl -s -X POST http://localhost:8080/lrs/connect \
  -H "Content-Type: application/json" \
  -H "Origin: https://www.uingame.co.il" \
  -c cookies.txt \
  -w "\nHTTP_STATUS:%{http_code}" \
  -d "{
    \"token\": \"$TEST_TOKEN\",
    \"pageUrl\": \"https://www.uingame.co.il/test\",
    \"clientTs\": $(date +%s)000
  }")

HTTP_STATUS=$(echo "$CONNECT_RESPONSE" | grep "HTTP_STATUS:" | cut -d: -f2)
RESPONSE_BODY=$(echo "$CONNECT_RESPONSE" | grep -v "HTTP_STATUS:")

echo "Response: $RESPONSE_BODY"
echo "HTTP Status: $HTTP_STATUS"
echo ""

# Check if session cookie was created
if grep -q "lrs_session" cookies.txt; then
  echo "✅ Session cookie created:"
  grep "lrs_session" cookies.txt | head -1
else
  echo "⚠️  Warning: No lrs_session cookie found in cookies.txt"
  echo "   LRS might be disabled or not configured properly"
  echo ""
  echo "Cookies.txt content:"
  cat cookies.txt
fi

echo ""
echo "=========================================="
echo "Step 3: Wait 3 seconds (simulate user activity)"
echo "=========================================="
sleep 3
echo "✅ Wait complete"
echo ""

echo "Step 4: Call /logout (Exit event)"
echo "=========================================="
echo ""

# Make the logout request with the session cookie
LOGOUT_RESPONSE=$(curl -s -X GET http://localhost:8080/logout \
  -H "Origin: https://www.uingame.co.il" \
  -b cookies.txt \
  -c cookies.txt \
  -L \
  -w "\nHTTP_STATUS:%{http_code}")

LOGOUT_HTTP_STATUS=$(echo "$LOGOUT_RESPONSE" | grep "HTTP_STATUS:" | cut -d: -f2)

echo "HTTP Status: $LOGOUT_HTTP_STATUS"
echo ""

echo "=========================================="
echo "Step 5: Check Server Logs"
echo "=========================================="
echo ""
echo "Expected logs for CONNECT:"
echo "  - [LRS Connect] Calling emitConnect for user: 123456789"
echo "  - [LRS] emitConnect called, enabled: true"
echo "  - [LRS] Built enter statement: ..."
echo "  - [LRS] ✅ REQUEST TO LRS PASSED SUCCESSFULLY"
echo "  - [LRS]   Verb: .../enter"
echo ""
echo "Expected logs for LOGOUT:"
echo "  - [Logout] Logout request received"
echo "  - [LRS Logout] Session cookie found, parsing..."
echo "  - [LRS Logout] Calling emitDisconnect for actor: 123456789"
echo "  - [LRS] emitDisconnect called, enabled: true"
echo "  - [LRS] Disconnect details - actorId: 123456789 sessionId: ... duration: 3 s"
echo "  - [LRS] Built exit statement: ..."
echo "  - [LRS] ✅ REQUEST TO LRS PASSED SUCCESSFULLY"
echo "  - [LRS]   Verb: .../exit"
echo "  - [LRS] Cleared dedupe key for actor: 123456789"
echo "  - [LRS] ✅ Disconnect completed successfully"
echo ""
echo "=========================================="
echo "Cleanup"
echo "=========================================="
redis-cli DEL "TOKEN:$TEST_TOKEN" > /dev/null 2>&1
echo "✅ Redis token cleaned up"
echo ""
echo "Test complete! Check your server logs above."
echo ""
