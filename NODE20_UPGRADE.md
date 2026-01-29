# Node 20 Upgrade - Professional Approach

## Why This Is Necessary

Node.js 17+ uses OpenSSL 3.x, which requires private keys in **PKCS#8 format** instead of the older **PKCS#1 format**.

Your current key format:
```
-----BEGIN RSA PRIVATE KEY-----  ← PKCS#1 (old format)
```

Required format for Node 20:
```
-----BEGIN PRIVATE KEY-----      ← PKCS#8 (modern format)
```

## Benefits of Node 20

✅ **Latest LTS** - Supported until April 2026  
✅ **Security updates** - Critical fixes for production  
✅ **Better performance** - V8 engine improvements  
✅ **Modern features** - Native `fetch` API, improved async  
✅ **Industry standard** - What modern apps use  

## The Professional Solution

### Option 1: Automated Script (Recommended)

Run the deployment script:

```bash
./deploy-node20-upgrade.sh
```

This handles everything automatically:
1. Downloads current key
2. Converts to PKCS#8
3. Uploads to Heroku
4. Deploys Node 20
5. Cleans up local files

### Option 2: Manual Steps

If you prefer to do it manually:

```bash
# 1. Get current key
heroku config:get SAML_PRIVATE_KEY --app uingame-auth > current_key.pem

# 2. Convert format (PKCS#1 → PKCS#8)
openssl pkcs8 -topk8 -nocrypt -in current_key.pem -out new_key.pem

# 3. Verify conversion
head -1 new_key.pem
# Should show: -----BEGIN PRIVATE KEY-----

# 4. Upload new key
heroku config:set SAML_PRIVATE_KEY="$(cat new_key.pem)" --app uingame-auth

# 5. Deploy code
git push heroku feature/lrs_implementation:master

# 6. Clean up (IMPORTANT - don't leave keys on disk!)
rm current_key.pem new_key.pem
```

## Safety Notes

✅ **Reversible** - You can convert back if needed  
✅ **Non-destructive** - Old key format is preserved in Heroku config history  
✅ **Tested conversion** - OpenSSL pkcs8 is industry standard  
✅ **No downtime** - Heroku handles rolling deploys  

## What Gets Changed

**On Heroku:**
- `SAML_PRIVATE_KEY` environment variable (key format)
- Node.js version (9.11.1 → 20.x)

**In Code:**
- `package.json` engines field only

**NOT Changed:**
- Certificate (`SAML_CERT`) - stays the same
- Any other environment variables
- Application logic

## Verification Steps

After deployment:

```bash
# 1. Check app is running
heroku ps --app uingame-auth

# 2. Test login flow
open https://auth.uingame.co.il/login

# 3. Monitor logs
heroku logs --tail --app uingame-auth

# 4. Verify no errors
# Should see: "Auth server listening on port..."
```

## Rollback Plan

If something goes wrong:

```bash
# Revert to Node 9 (temporary)
git revert HEAD
git push heroku feature/lrs_implementation:master

# Or convert key back to PKCS#1 (not recommended)
openssl rsa -in new_key.pem -out old_key.pem
heroku config:set SAML_PRIVATE_KEY="$(cat old_key.pem)" --app uingame-auth
```

## Why Not Use Node 9/16?

| Version | Status | Issue |
|---------|--------|-------|
| Node 9 | EOL 2018 | Security vulnerabilities, no modern features |
| Node 16 | EOL Sept 2024 | No `fetch` API (breaks LRS code), no updates |
| **Node 20** | **LTS until 2026** | **✅ Modern, secure, supported** |

## Questions?

- **Q: Will this break existing users?**  
  A: No. The key format change is transparent to users. SAML authentication works identically.

- **Q: Can I test this in staging first?**  
  A: Yes! If you have a staging app, deploy there first.

- **Q: What if the conversion fails?**  
  A: The script checks at each step and exits if there's an error. Your current key remains unchanged.

- **Q: Is the key secure during conversion?**  
  A: Yes. It stays on your local machine briefly, then is deleted. Use the script on a secure machine.

---

**Ready to upgrade?** Run `./deploy-node20-upgrade.sh`
