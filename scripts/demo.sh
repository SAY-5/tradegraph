#!/usr/bin/env bash
# make demo: start Fuseki, build and load the sample, start the API, run scripted
# lineage and exposure queries and print a summary with real numbers.
set -euo pipefail
cd "$(dirname "$0")/.."

FUSEKI_URL="${FUSEKI_URL:-http://localhost:3030/ds}"
API_URL="${API_URL:-http://localhost:8080}"
COMPOSE="${COMPOSE:-docker compose}"
export JAVA_HOME="${JAVA_HOME:-$(/usr/libexec/java_home -v 21 2>/dev/null || echo "${JAVA_HOME:-}")}"
OUT=demo-output
mkdir -p "$OUT"
API_PID=""

cleanup() {
    if [[ -n "$API_PID" ]] && kill -0 "$API_PID" 2>/dev/null; then
        kill "$API_PID" 2>/dev/null || true
        wait "$API_PID" 2>/dev/null || true
    fi
    if [[ "${KEEP_FUSEKI:-0}" != "1" ]]; then
        $COMPOSE -f deploy/docker-compose.yml stop fuseki >/dev/null 2>&1 || true
    fi
}
trap cleanup EXIT

step() { printf '\n==> %s\n' "$*"; }

step "Starting Fuseki (deploy/docker-compose.yml)"
$COMPOSE -f deploy/docker-compose.yml up -d fuseki >/dev/null
scripts/wait-for.sh "${FUSEKI_URL%/*}/\$/ping" 90
scripts/wait-for.sh "$FUSEKI_URL/sparql?query=ASK%7B%7D" 30

step "Building the sample with the ETL"
(cd etl && uv run tradegraph-etl build --sample --out build) > "$OUT/etl-build.json"
python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); print("entities=%s positions=%s triples=%s seconds=%s" % (d["entities"], d["positions"], d["triples"], d["seconds"]))' "$OUT/etl-build.json"

step "Loading into Fuseki over the Graph Store Protocol"
(cd etl && uv run tradegraph-etl load --endpoint "$FUSEKI_URL" --store fuseki --build-dir build) | tee "$OUT/etl-load.txt" | tail -1

step "Checking the data against the SHACL shapes"
(cd etl && uv run tradegraph-etl validate --sample --out build) > "$OUT/quality.json"
python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); print("conforms=%s dangling=%s cycles=%s missingIdentifiers=%s shaclViolations=%s" % (d["conforms"], d["danglingReferences"], d["subsidiaryCycles"], d["missingIdentifiers"], d["shaclViolations"]))' "$OUT/quality.json"

step "Starting the API (profile fuseki)"
API_VERSION=$(python3 -c 'import re; print(re.search(r"</parent>.*?<version>([^<]+)</version>", open("api/pom.xml").read(), re.S).group(1))')
API_JAR="api/target/tradegraph-api-$API_VERSION.jar"
[[ -f "$API_JAR" ]] || (cd api && mvn -B -q -DskipTests -Dcheckstyle.skip package)
java -jar "$API_JAR" --spring.profiles.active=fuseki \
    --tradegraph.store.query-url="$FUSEKI_URL/sparql" \
    --tradegraph.quality.report-path=etl/build/quality.json > "$OUT/api.log" 2>&1 &
API_PID=$!
scripts/wait-for.sh "$API_URL/actuator/health" 90

step "Running scripted queries"
python3 scripts/demo_queries.py "$API_URL" --summary web/src/data/demo-summary.json \
    | tee "$OUT/summary.txt"
