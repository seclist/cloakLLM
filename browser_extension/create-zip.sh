#!/bin/bash
# Create a clean ZIP for Chrome Web Store submission.
# Run from the browser_extension directory: ./create-zip.sh

set -e
ZIP_NAME="cloak-v2.0.0.zip"
rm -f "$ZIP_NAME"

zip -r "$ZIP_NAME" . \
  -x "*.git*" \
  -x "*.DS_Store" \
  -x "*.zip" \
  -x "*.md" \
  -x "*.sh" \
  -x "*.txt" \
  -x "node_modules/*"

echo "Created: $ZIP_NAME"
unzip -l "$ZIP_NAME" | head -30
