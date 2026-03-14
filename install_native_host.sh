#!/bin/bash
# ============================================================
# Native Messaging Host Installer
# Supports: Chrome, Chromium, Brave, Edge (Linux & macOS)
#
# Usage:
#   ./install_native_host.sh                  (prompted for extension ID)
#   ./install_native_host.sh <EXTENSION_ID>   (pass ID directly)
# ============================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOST_NAME="com.storagemanager.app"
PY_HOST="$SCRIPT_DIR/native_app.py"
WRAPPER="$SCRIPT_DIR/native_app.sh"

# ---- sanity checks ----------------------------------------

if [ ! -f "$PY_HOST" ]; then
    echo "ERROR: native_app.py not found in $SCRIPT_DIR"
    exit 1
fi

if ! command -v python3 &>/dev/null; then
    echo "ERROR: python3 not found. Please install Python 3."
    exit 1
fi

# ---- get extension ID -------------------------------------

EXTENSION_ID="$1"
if [ -z "$EXTENSION_ID" ]; then
    echo "Enter your Chrome extension ID (found at chrome://extensions):"
    read -r EXTENSION_ID
fi

if [ -z "$EXTENSION_ID" ]; then
    echo "ERROR: Extension ID is required."
    exit 1
fi

# Basic format check (32 lowercase letters)
if ! echo "$EXTENSION_ID" | grep -qE '^[a-z]{32}$'; then
    echo "WARNING: '$EXTENSION_ID' doesn't look like a valid extension ID."
    echo "Expected 32 lowercase letters. Continuing anyway..."
fi

# ---- create wrapper script --------------------------------
# The wrapper ensures the correct python3 and script path are
# used regardless of where Chrome launches the host from.

PYTHON3_PATH="$(which python3)"

cat > "$WRAPPER" <<EOF
#!/bin/bash
exec "$PYTHON3_PATH" "$PY_HOST"
EOF

chmod +x "$WRAPPER"
echo "✓ Created launcher: $WRAPPER"

# ---- generate manifest ------------------------------------

MANIFEST_CONTENT=$(cat <<EOF
{
  "name": "$HOST_NAME",
  "description": "Storage Manager Native Host",
  "path": "$WRAPPER",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://$EXTENSION_ID/"
  ]
}
EOF
)

# ---- install to all detected browsers ---------------------

install_manifest() {
    local DIR="$1"
    local BROWSER="$2"
    # Only install if the parent browser config directory exists
    if [ -d "$(dirname "$DIR")" ]; then
        mkdir -p "$DIR"
        echo "$MANIFEST_CONTENT" > "$DIR/$HOST_NAME.json"
        echo "✓ Installed for $BROWSER: $DIR/$HOST_NAME.json"
    fi
}

echo ""
echo "Installing native messaging host for extension: $EXTENSION_ID"
echo ""

# Linux paths
install_manifest "$HOME/.config/google-chrome/NativeMessagingHosts"          "Chrome (Linux)"
install_manifest "$HOME/.config/chromium/NativeMessagingHosts"                "Chromium (Linux)"
install_manifest "$HOME/snap/chromium/common/.config/chromium/NativeMessagingHosts" "Chromium (Snap)"
install_manifest "$HOME/.config/BraveSoftware/Brave-Browser/NativeMessagingHosts"   "Brave (Linux)"
install_manifest "$HOME/.config/microsoft-edge/NativeMessagingHosts"          "Edge (Linux)"

# macOS paths
install_manifest "$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"          "Chrome (macOS)"
install_manifest "$HOME/Library/Application Support/Chromium/NativeMessagingHosts"               "Chromium (macOS)"
install_manifest "$HOME/Library/Application Support/BraveSoftware/Brave-Browser/NativeMessagingHosts" "Brave (macOS)"
install_manifest "$HOME/Library/Application Support/Microsoft Edge/NativeMessagingHosts"         "Edge (macOS)"

echo ""
echo "Done! Restart your browser for changes to take effect."
echo ""
echo "NOTE: If you use multiple browsers, run this script once per"
echo "      browser using that browser's specific extension ID."
echo ""
echo "Debug pages:"
echo "  Chrome:  chrome://extensions-internals"
echo "  Brave:   brave://extensions-internals"
echo "  Edge:    edge://extensions-internals"
