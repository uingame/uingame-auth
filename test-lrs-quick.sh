#!/bin/bash

# Quick test - just the CURL command with a hardcoded token
# First run: redis-cli SET "TOKEN:test123" '{"displayName":"Test User","id":"123456789","mosad":"12345","isStudent":false}'
# Then run this script

TOKEN="${1:-test123}"

echo "Testing LRS connect with token: $TOKEN"
echo ""

curl -X POST http://localhost:8080/lrs/connect \
  -H "Content-Type: application/json" \
  -H "Origin: https://www.uingame.co.il" \
  -c cookies.txt \
  -v \
  -d "{
    \"token\": \"$TOKEN\",
    \"pageUrl\": \"https://www.uingame.co.il/test\",
    \"clientTs\": $(date +%s)000
  }"

echo ""
echo ""
echo "✅ Request sent! Check server logs for LRS activity."
