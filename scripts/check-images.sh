#!/bin/sh
# Builds the three production images the way a Dokploy server does (one
# BuildKit builder, backend first) and checks what a deploy relies on:
#   - each Dockerfile's own smoke test passes (env schema + --smoke-test boot
#     for the backend, `nginx -t` on the rendered config for both nginx images);
#   - the second and third builds reuse the shared install (no second install);
#   - the backend image carries .build-sha and no .env, and runs the Node
#     major its Dockerfile's NODE_VERSION names;
#   - the frontend nginx sends the backend exactly one client address, sends
#     its security headers, and serves /healthz and robots.txt;
#   - the console's nginx answers 404 for the user app's API.
# Needs Docker with BuildKit and python3. Run from the repository root (CI's
# images job runs it).
set -eu

log_dir="${RUNNER_TEMP:-/tmp}/image-builds"
mkdir -p "$log_dir"
fail() { echo "check-images: $*" >&2; exit 1; }

for app in backend frontend superadmin; do
	echo "── building $app"
	docker build --progress=plain -f "apps/$app/Dockerfile" -t "cr-$app" . >"$log_dir/$app.log" 2>&1 \
		|| { tail -n 80 "$log_dir/$app.log"; fail "$app image did not build"; }
done

grep -q "Smoke test passed" "$log_dir/backend.log" || fail "backend smoke test did not run"
grep -q "test is successful" "$log_dir/frontend.log" || fail "frontend nginx -t did not run"
grep -q "test is successful" "$log_dir/superadmin.log" || fail "superadmin nginx -t did not run"

# The shared install ran once: the later builds find it cached.
for app in frontend superadmin; do
	step="$(grep -- "--production=false --network-timeout 600000" "$log_dir/$app.log" | head -n 1 | sed -n 's/^#\([0-9]*\) .*/\1/p')"
	if [ -z "$step" ] || ! grep -q "^#$step CACHED" "$log_dir/$app.log"; then
		fail "$app installed its dependencies again (the shared stages differ?)"
	fi
done

docker run --rm --entrypoint sh cr-backend -c 'test -s .build-sha && test ! -e .env' \
	|| fail "backend image: .build-sha missing or a .env present"

node_major="$(sed -n 's/^ARG NODE_VERSION=//p' apps/backend/Dockerfile)"
node_seen="$(docker run --rm --entrypoint node cr-backend -v)"
echo "backend image runs Node $node_seen"
case "$node_seen" in "v$node_major".*) ;; *) fail "backend image runs $node_seen, not Node $node_major" ;; esac

# A stand-in backend that echoes the headers it receives.
cat >"$log_dir/echo.py" <<'PY'
import http.server, json
class H(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        body = json.dumps({"xff": self.headers.get_all("x-forwarded-for"), "xri": self.headers.get("x-real-ip")}).encode()
        self.send_response(200)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
    def log_message(self, *args):
        pass
http.server.ThreadingHTTPServer(("0.0.0.0", 3999), H).serve_forever()
PY
python3 -I "$log_dir/echo.py" &
echo_pid=$!
cleanup() {
	kill "$echo_pid" 2>/dev/null || true
	docker rm -f cr-frontend-check cr-superadmin-check >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker run -d --name cr-frontend-check --add-host=host.docker.internal:host-gateway \
	-e BACKEND_UPSTREAM=host.docker.internal:3999 -p 8081:80 cr-frontend >/dev/null
docker run -d --name cr-superadmin-check --add-host=host.docker.internal:host-gateway \
	-e BACKEND_UPSTREAM=host.docker.internal:3999 -p 8082:80 cr-superadmin >/dev/null
sleep 3

[ "$(curl -fsS http://localhost:8081/healthz)" = "ok" ] || fail "frontend /healthz"
[ "$(curl -fsS http://localhost:8082/healthz)" = "ok" ] || fail "superadmin /healthz"

# The host reaches the container from the Docker gateway, a private address,
# so it plays Traefik: nginx takes the right-most untrusted entry (1.2.3.4) and
# sends only that, never the client-written 9.9.9.9.
echoed="$(curl -fsS -H 'X-Forwarded-For: 9.9.9.9, 1.2.3.4' -H 'X-Real-IP: 9.9.9.9' http://localhost:8081/api/x)"
echo "frontend → backend: $echoed"
[ "$echoed" = '{"xff": ["1.2.3.4"], "xri": "1.2.3.4"}' ] || fail "frontend forwarded headers"

headers="$(curl -fsSI http://localhost:8081/)"
echo "$headers" | grep -qi "^content-security-policy: frame-ancestors 'none'" || fail "frontend enforced CSP"
echo "$headers" | grep -qi "^content-security-policy-report-only: default-src" || fail "frontend report-only CSP"
echo "$headers" | grep -qi "^x-frame-options: DENY" || fail "frontend X-Frame-Options"
curl -fsS http://localhost:8081/robots.txt | grep -q "Disallow: /api/" || fail "frontend robots.txt"

[ "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:8082/api/user-app/x)" = "404" ] \
	|| fail "superadmin must not proxy the user app's API"
curl -fsS http://localhost:8082/api/super-admin/x | grep -q '"xff"' || fail "superadmin router proxy"

echo "check-images: all three images build, share one install and pass their checks."
