#!/bin/bash
# Run this in a real macOS Terminal (not the sandbox) from the folder
# containing AppIcon.iconset/
set -e
iconutil -c icns AppIcon.iconset -o AppIcon.icns
echo "Built AppIcon.icns"
