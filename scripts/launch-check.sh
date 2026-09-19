#!/bin/sh
# Go-live check against a running store (Phase 9 step 6): the checkable items of
# docs/testing/go-live-checklist.md that an HTTP client can prove, one line each,
# exit code = number of failures. Read-only: GET requests plus one POST without a
# secret, which the job route refuses.
#
#   scripts/launch-check.sh https://nasmeh.si            # production expectations
#   scripts/launch-check.sh https://staging.nasmeh.si --staging   # maintenance on, index off
#
# Needs curl. Every FAIL names the gate that still has to be passed (D2, D4, G4 …).
set -u
ORIGIN="${1:-}"
MODE="${2:-}"
if [ -z "$ORIGIN" ]; then echo "usage: $0 <origin> [--staging]" >&2; exit 2; fi
ORIGIN="${ORIGIN%/}"
BODY="$(mktemp)"; HDR="$(mktemp)"
trap 'rm -f "$BODY" "$HDR"' EXIT
fails=0; oks=0
ok() { echo "ok   $1: $2"; oks=$((oks + 1)); }
fail() { echo "FAIL $1: $2"; fails=$((fails + 1)); }
check() { if [ "$2" = "1" ]; then ok "$1" "$3"; else fail "$1" "$3"; fi; }
# req [curl args] URL -> $code; body in $BODY, headers in $HDR
req() { code=$(curl -sS -o "$BODY" -D "$HDR" -w '%{http_code}' "$@" 2>/dev/null || echo 000); }
hdr() { tr -d '\r' < "$HDR" | grep -i "^$1:" | head -1 | cut -c1-140; }
has() { grep -q "$1" "$BODY"; }

echo "=== launch check: $ORIGIN ${MODE:+($MODE)} ==="

req "$ORIGIN/api/health"
check "health" "$([ "$code" = 200 ] && has '"db":"up"' && echo 1)" "$code $(cut -c1-80 < "$BODY")"

req -L "$ORIGIN/"   # -L: a locked store redirects to the maintenance gate at /vzdrzevanje
case "$ORIGIN" in
  https://*) check "HSTS at the proxy" "$(hdr strict-transport-security | grep -q max-age && echo 1)" "$(hdr strict-transport-security)";;
  *) echo "skip HSTS (plain http origin)";;
esac
if hdr content-security-policy | grep -q "nonce-"; then ok "CSP enforced" "Content-Security-Policy with the request nonce"
elif hdr content-security-policy-report-only | grep -q "nonce-"; then ok "CSP present (report-only)" "switch CSP_ENFORCE=true once the host logs no [csp] lines"
else fail "CSP header" "neither Content-Security-Policy nor -Report-Only"; fi
check "security headers" "$(hdr x-content-type-options | grep -qi nosniff && hdr referrer-policy | grep -q . && hdr x-frame-options | grep -q . && echo 1)" "$(hdr x-content-type-options) | $(hdr referrer-policy) | $(hdr x-frame-options)"
canonical=$(grep -o 'rel="canonical" href="[^"]*"' "$BODY" | head -1)
if [ "$MODE" = "--staging" ]; then
  check "staging: maintenance page or noindex" "$( { has "Trgovina se pripravlja" || grep -qi 'name="robots" content="noindex' "$BODY"; } && echo 1)" "$code"
else
  check "home serves the store (maintenance off)" "$([ "$code" = 200 ] && ! has "Trgovina se pripravlja" && echo 1)" "$code"
  check "home is indexable (index switch on)" "$(! grep -qi 'name="robots" content="noindex' "$BODY" && echo 1)" ""
  check "canonical on the public origin" "$(echo "$canonical" | grep -q "\"$ORIGIN" && echo 1)" "$canonical"
  check "G4 company data (no seed placeholders in the footer)" "$(! has "Trg nasmeha 1" && ! has "SI00000000" && ! has "0000000000" && echo 1)" ""
fi

req "$ORIGIN/robots.txt"
if [ "$MODE" = "--staging" ]; then
  check "staging robots disallows everything" "$(has "Disallow: /" && ! has "Allow: /" && echo 1)" "$(tr '\n' ' ' < "$BODY" | cut -c1-80)"
else
  check "robots allows and names the sitemap" "$(has "Allow: /" && has "Sitemap: $ORIGIN/sitemap.xml" && echo 1)" "$(tr '\n' ' ' < "$BODY" | cut -c1-100)"
fi

req "$ORIGIN/sitemap.xml"
locs=$(grep -o "<loc>[^<]*</loc>" "$BODY" | wc -l | tr -d ' ')
foreign=$(grep -o "<loc>[^<]*</loc>" "$BODY" | grep -vc "<loc>$ORIGIN" | tr -d ' ')
products=$(grep -c "<loc>$ORIGIN/izdelek/" "$BODY" | tr -d ' ')
check "sitemap on the public origin" "$([ "$code" = 200 ] && [ "$locs" -gt 0 ] && [ "$foreign" = 0 ] && echo 1)" "$locs urls, $foreign on another origin"
if [ "$MODE" = "--staging" ]; then
  # A8: canonicals and sitemap URLs come from the container's own NEXT_PUBLIC_SITE_URL,
  # i.e. from the file `env_file: ${ENV_FILE:-.env}` names. A staging project started
  # without ENV_FILE=.env.staging loads production's .env and names production here —
  # with production's secrets and live payment keys behind it (docs/RUNBOOK.md, Staging).
  check "A8 staging serves its own origin (ENV_FILE=.env.staging loaded)" "$([ "$foreign" = 0 ] && [ -n "$canonical" ] && echo "$canonical" | grep -q "\"$ORIGIN" && echo 1)" "$foreign foreign sitemap urls | $canonical"
else
  check "D2 catalogue published (product pages in the sitemap)" "$([ "$products" -gt 0 ] && echo 1)" "$products product urls"
fi

for p in /pogoji-poslovanja /politika-zasebnosti /politika-piskotkov /odstop-od-pogodbe /reklamacije /garancija-vracila-denarja; do
  req -L "$ORIGIN$p"   # -L: the gate redirect while the store is locked
  if [ "$MODE" = "--staging" ] && has "Trgovina se pripravlja"; then ok "legal page $p" "behind the maintenance gate"; continue; fi
  check "legal page $p served" "$([ "$code" = 200 ] && echo 1)" "$code"
  check "D4 legal page $p reviewed (no draft notice)" "$(! has "Osnutek dokumenta" && echo 1)" ""
done

req "$ORIGIN/odstop-od-pogodbe/obrazec.pdf"
check "G4 model withdrawal form PDF (needs the company Setting)" "$([ "$code" = 200 ] && head -c 4 "$BODY" | grep -q PDF && echo 1)" "$code $(hdr content-type)"

req "$ORIGIN/admin"
check "admin gate" "$([ "$code" = 307 ] && hdr location | grep -q "/prijava?callbackUrl=" && echo 1)" "$code $(hdr location)"

req -X POST "$ORIGIN/api/jobs/daily"
check "daily job refuses without the secret" "$([ "$code" = 401 ] && echo 1)" "$code"

echo "LAUNCH CHECK: $oks ok, $fails fail"
exit $fails
