#!/bin/bash

# Professional Node 20 Upgrade Script
# This script converts SAML private key to PKCS#8 format and deploys Node 20

set -e  # Exit on any error

APP_NAME="uingame-auth"

echo "=========================================="
echo "Node 20 Upgrade - Professional Deployment"
echo "=========================================="
echo ""
echo "This script will:"
echo "  1. Download current SAML private key from Heroku"
echo "  2. Convert from PKCS#1 to PKCS#8 format (Node 20 compatible)"
echo "  3. Upload the converted key to Heroku"
echo "  4. Deploy Node 20 code"
echo "  5. Clean up local key files"
echo ""
read -p "Continue? (y/n) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 1
fi

echo ""
echo "Step 1: Downloading current SAML private key..."
heroku config:get SAML_PRIVATE_KEY --app $APP_NAME > current_key.pem

if [ ! -s current_key.pem ]; then
    echo "ERROR: Failed to download key or key is empty"
    rm -f current_key.pem
    exit 1
fi

echo "✅ Current key downloaded"
echo ""

echo "Step 2: Converting key format (PKCS#1 → PKCS#8)..."

# Try with legacy provider first (for OpenSSL 3.x)
OPENSSL_CONF=/dev/null openssl pkcs8 -topk8 -nocrypt -in current_key.pem -out new_key.pem -provider default -provider legacy 2>/dev/null

# If that failed, try OpenSSL 1.1 via Homebrew
if [ ! -s new_key.pem ]; then
    echo "   Trying with OpenSSL 1.1..."
    if [ -f /usr/local/opt/openssl@1.1/bin/openssl ]; then
        /usr/local/opt/openssl@1.1/bin/openssl pkcs8 -topk8 -nocrypt -in current_key.pem -out new_key.pem
    elif [ -f /opt/homebrew/opt/openssl@1.1/bin/openssl ]; then
        /opt/homebrew/opt/openssl@1.1/bin/openssl pkcs8 -topk8 -nocrypt -in current_key.pem -out new_key.pem
    else
        echo "ERROR: Please install OpenSSL 1.1: brew install openssl@1.1"
        rm -f current_key.pem new_key.pem
        exit 1
    fi
fi

if [ ! -s new_key.pem ]; then
    echo "ERROR: Key conversion failed"
    rm -f current_key.pem new_key.pem
    exit 1
fi

echo "✅ Key converted successfully"
echo ""

# Verify the key format
echo "Step 3: Verifying new key format..."
KEY_HEADER=$(head -1 new_key.pem)
if [[ $KEY_HEADER == "-----BEGIN PRIVATE KEY-----" ]]; then
    echo "✅ Key format verified: PKCS#8 (Node 20 compatible)"
else
    echo "❌ ERROR: Key format is incorrect"
    echo "   Expected: -----BEGIN PRIVATE KEY-----"
    echo "   Got: $KEY_HEADER"
    rm -f current_key.pem new_key.pem
    exit 1
fi
echo ""

echo "Step 4: Uploading new key to Heroku..."
heroku config:set SAML_PRIVATE_KEY="$(cat new_key.pem)" --app $APP_NAME

if [ $? -ne 0 ]; then
    echo "❌ ERROR: Failed to upload key to Heroku"
    rm -f current_key.pem new_key.pem
    exit 1
fi

echo "✅ New key uploaded to Heroku"
echo ""

echo "Step 5: Cleaning up local key files..."
rm -f current_key.pem new_key.pem
echo "✅ Local key files deleted (security best practice)"
echo ""

echo "Step 6: Deploying Node 20 code to Heroku..."
git push heroku feature/lrs_implementation:master

if [ $? -ne 0 ]; then
    echo "❌ ERROR: Deployment failed"
    exit 1
fi

echo ""
echo "=========================================="
echo "✅ DEPLOYMENT COMPLETE!"
echo "=========================================="
echo ""
echo "Next steps:"
echo "  1. Test login: https://auth.uingame.co.il/login"
echo "  2. Check logs: heroku logs --tail --app $APP_NAME"
echo "  3. If everything works, deploy Wix frontend"
echo ""
