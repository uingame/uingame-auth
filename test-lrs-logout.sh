#!/bin/bash

# Test script to trigger LRS logout endpoint
# This will simulate a logout request with an LRS session cookie

echo "=========================================="
echo "LRS Logout Test - Trigger Disconnect Event"
echo "=========================================="
echo ""


echo "Step 1: Validating session cookie"
echo "=========================================="
echo ""

# Check if cookies.txt exists and contains lrs_session
if [ ! -f cookies.txt ]; then
  echo "❌ cookies.txt not found!"
  echo "   You must run ./test-lrs-request.sh first to create a session."
  exit 1
fi

# Check if lrs_session cookie exists
if ! grep -q "lrs_session" cookies.txt; then
  echo "❌ No lrs_session cookie found in cookies.txt!"
  echo "   You must run ./test-lrs-request.sh first to create a session."
  echo ""
  echo "Current cookies.txt content:"
  cat cookies.txt
  exit 1
fi

echo "✅ Session cookie found:"
grep "lrs_session" cookies.txt | head -1
echo ""

echo "Step 2: Making request to /logout"
echo "=========================================="
echo ""

# Make the logout request with the session cookie
curl -X GET http://localhost:8080/logout \
  -H "Origin: https://www.uingame.co.il" \
  -b cookies.txt \
  -c cookies.txt \
  -L \
  -w "\n\nHTTP Status: %{http_code}\n"

echo ""
echo ""
echo "=========================================="
echo "Step 3: Check your server logs for:"
echo "=========================================="
echo "  Look for these log messages:"
echo "  - [LRS] emitDisconnect called, enabled: true, baseUrl: ..."
echo "  - [LRS] Disconnect details - actorId: ... sessionId: ... duration: ... s"
echo "  - [LRS] Built exit statement: ..."
echo "  - [LRS] Sending statement to: ..."
echo "  - [LRS] ✅ REQUEST TO LRS PASSED SUCCESSFULLY"
echo "  - [LRS]   Statement ID: ..."
echo "  - [LRS]   Verb: .../exit"
echo "  - [LRS]   HTTP Status: ..."
echo "  - [LRS]   LRS Response: ..."
echo "  - [LRS] Cleared dedupe key for actor: ..."
echo "  - [LRS] ✅ Disconnect completed successfully"
echo ""
echo "Cookie comparison:"
echo "Before logout (should have lrs_session):"
grep "lrs_session" cookies.txt 2>/dev/null | head -1 || echo "  ❌ (no session cookie - this shouldn't happen!)"
echo ""
