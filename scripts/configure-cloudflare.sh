#!/usr/bin/env bash
# Configure Cloudflare Tunnel ingress routing for brzl.ca on rv415

set -euo pipefail

CF_TOKEN_FILE="${HOME}/dev/.cf_api_token"
if [ ! -f "${CF_TOKEN_FILE}" ]; then
  echo "[ERROR] Cloudflare token file not found at ${CF_TOKEN_FILE}"
  exit 1
fi

CF_TOKEN=$(cat "${CF_TOKEN_FILE}")
CF_ACCOUNT="84daa65220b2a288eac66af5aaa18039"
TUNNEL_ID="8315d281-8528-4dcf-95f7-285c7256c74c"

echo "[CLOUDFLARE] Fetching current tunnel configuration for rv415 (${TUNNEL_ID})..."
CURRENT_JSON=$(curl -s "https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT}/cfd_tunnel/${TUNNEL_ID}/configurations" \
  -H "Authorization: Bearer ${CF_TOKEN}")

echo "[CLOUDFLARE] Preparing updated ingress rules with brzl.ca -> http://127.0.0.1:3005..."
PATCH_PAYLOAD=$(python3 -c "
import sys, json

data = json.loads('''${CURRENT_JSON}''')
ingress = data['result']['config']['ingress']

# Remove any existing brzl.ca rules to prevent duplicates
ingress = [r for r in ingress if r.get('hostname') not in ('brzl.ca', 'www.brzl.ca')]

# Insert new rules before the final catch-all rule
catch_all = ingress[-1] if ingress else {'service': 'http_status:404'}
remaining = ingress[:-1] if ingress else []

new_rules = [
    {
        'hostname': 'brzl.ca',
        'service': 'http://127.0.0.1:3005'
    },
    {
        'hostname': 'www.brzl.ca',
        'service': 'http://127.0.0.1:3005'
    }
]

updated_ingress = remaining + new_rules + [catch_all]
print(json.dumps({'config': {'ingress': updated_ingress}}))
")

echo "[CLOUDFLARE] Pushing configuration to Cloudflare API..."
RESPONSE=$(curl -s -X PUT "https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT}/cfd_tunnel/${TUNNEL_ID}/configurations" \
  -H "Authorization: Bearer ${CF_TOKEN}" \
  -H "Content-Type: application/json" \
  --data "${PATCH_PAYLOAD}")

SUCCESS=$(echo "${RESPONSE}" | jq -r '.success')
if [ "${SUCCESS}" = "true" ]; then
  echo "✅ Cloudflare Tunnel ingress configuration updated successfully!"
  echo "${RESPONSE}" | jq '.result.config.ingress'
else
  echo "❌ Cloudflare API update failed:"
  echo "${RESPONSE}" | jq .
  exit 1
fi
