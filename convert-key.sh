#!/bin/bash
# Heroku key conversion script - runs on Heroku dyno with OpenSSL 1.1.x

set -e

echo "Converting SAML_PRIVATE_KEY from PKCS#1 to PKCS#8..."

# Save current key to temp file
echo "$SAML_PRIVATE_KEY" > /tmp/current_key.pem

# Convert using Heroku's OpenSSL (should be 1.1.x on older stack)
openssl pkcs8 -topk8 -nocrypt -in /tmp/current_key.pem -out /tmp/new_key.pem

# Output the new key
cat /tmp/new_key.pem

# Clean up
rm -f /tmp/current_key.pem /tmp/new_key.pem

echo ""
echo "Conversion complete. Copy the key above (including BEGIN/END lines)"
