#!/usr/bin/env bash
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
exec bash "$ROOT/scripts/verify-all.sh"
