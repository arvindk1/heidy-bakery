#!/bin/bash
set -euo pipefail
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
iconutil -c icns "$PROJECT_DIR/assets/brand/AppIcon.iconset" -o "$PROJECT_DIR/HeidyBakery/Resources/AppIcon.icns"
