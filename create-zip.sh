#!/bin/bash
# Script to create a clean ZIP file for Chrome Web Store submission
# Run this from the browser_extension directory

# Remove old ZIP if exists
rm -f cloak-v1.0.0.zip

# Create ZIP with only necessary files
zip -r cloak-v1.0.0.zip . \
    -x "*.md" \
    -x "*.txt" \
    -x "*.DS_Store" \
    -x "*/.DS_Store" \
    -x "__pycache__/*" \
    -x "*.pyc" \
    -x "*.py" \
    -x "test*" \
    -x "DEBUG*" \
    -x "TROUBLESHOOTING*" \
    -x "INSTALL*" \
    -x "QUICK_START*" \
    -x "EXTENSION_SUMMARY*" \
    -x "PRE_V1*" \
    -x "V1_RELEASE*" \
    -x "CHROME_WEB_STORE*" \
    -x "create-zip.sh"

echo "✅ ZIP file created: cloak-v1.0.0.zip"
echo ""
echo "Files included:"
unzip -l cloak-v1.0.0.zip | grep -E "\.(js|html|json|png)$"
