#!/bin/bash

# Test script to trigger LRS connect endpoint
# This will create a test token and make a request to /lrs/connect

echo "=========================================="
echo "LRS Connect Test - Trigger Background Request"
echo "=========================================="
echo ""

# Generate a unique test token
TEST_TOKEN="test-lrs-$(date +%s)"
echo "Step 1: Creating test token: $TEST_TOKEN"
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
  echo "❌ Redis connection failed. Please ensure Redis is running:"
  echo "   redis-server"
  echo ""
  echo "Or run manually:"
  echo "   redis-cli SET \"TOKEN:$TEST_TOKEN\" '$TEST_USER'"
  echo "   redis-cli EXPIRE \"TOKEN:$TEST_TOKEN\" 300"
  exit 1
fi

echo "✅ Token created successfully"
echo ""
echo "Step 2: Making request to /lrs/connect"
echo "=========================================="
echo ""

# Make the request
curl -X POST http://localhost:8080/lrs/connect \
  -H "Content-Type: application/json" \
  -H "Origin: https://www.uingame.co.il" \
  -c cookies.txt \
  -w "\n\nHTTP Status: %{http_code}\n" \
  -d "{
    \"token\": \"$TEST_TOKEN\",
    \"pageUrl\": \"https://www.uingame.co.il/test\",
    \"clientTs\": $(date +%s)000
  }"

echo ""
echo ""
echo "=========================================="
echo "Step 3: Check your server logs for:"
echo "=========================================="
echo "  Look for these log messages:"
echo "  - [LRS Connect] Calling emitConnect for user: ..."
echo "  - [LRS] emitConnect called, enabled: true, baseUrl: ..."
echo "  - [LRS] Built enter statement: ..."
echo "  - [LRS] ✅ OAuth token fetched successfully, expires in ... s"
echo "  - [LRS] Sending statement to: ..."
echo "  - [LRS] ✅ REQUEST TO LRS PASSED SUCCESSFULLY"
echo ""
echo "Token: $TEST_TOKEN"
echo "Clean up: redis-cli DEL TOKEN:$TEST_TOKEN"
