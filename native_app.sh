#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec $(which python3) "$SCRIPT_DIR/native_app.py"