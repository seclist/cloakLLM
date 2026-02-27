# Cloak Browser Extension

Auto-anonymize sensitive data before it reaches ChatGPT, then restore original values in the model response.  
All anonymization/deanonymization is performed locally in the browser.

**Version:** `2.0.0`  
**Status:** Release-ready

## What It Does

- Detects and replaces PII in prompts with deterministic Cloak tokens (for example, `[CLOAK_EMAIL_1]`).
- Preserves context so AI responses remain useful while sensitive values stay hidden.
- Restores original values in responses in-session.
- Supports export of redacted conversation and audit logs.

## Supported Browsers

- Chrome (Manifest V3)
- Firefox (via `browser_specific_settings.gecko`)

## Supported Sites

- `https://chat.openai.com/*`
- `https://chatgpt.com/*`

## PII Coverage (v2)

- Email addresses
- Phone numbers (US + international)
- Credit cards (with validation)
- SSN
- IBAN
- Bank routing numbers
- IP (IPv4 + IPv6)
- MAC addresses
- UUID
- API keys/tokens (common provider formats)
- Passport numbers
- Driver license numbers
- Date of birth
- UK NINO
- UK postcodes

## Project Structure

- `browser_extension/manifest.json` - extension manifest and permissions
- `browser_extension/cloak.js` - PII detection, validation, anonymization logic
- `browser_extension/content.js` - ChatGPT page integration and restore logic
- `browser_extension/popup.html` - popup UI
- `browser_extension/popup.js` - popup state/settings/actions
- `browser_extension/background.js` - downloads/export and background handlers

## Local Development

### Chrome

1. Open `chrome://extensions/`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `browser_extension/` folder

### Firefox

1. Open `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on**
3. Select `browser_extension/manifest.json`

## Privacy

- No external anonymization service is used.
- No raw PII is sent to Cloak servers.
- Processing happens locally in the extension runtime.

## Notes

- The `site/` folder is the marketing website and is not required to run the extension.
- For packaging, use files under `browser_extension/` only.
