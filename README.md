---

> # 🔒 Looking for the browser version? Use ChatGPT safely with the Cloak Chrome Extension. [Download Here](https://getcloak.org)
>
> ---

---

# Cloak Browser Extension v1.0

Automatically anonymizes PII before sending to ChatGPT and restores it in responses.

**Version:** 1.0.0  
**Status:** Production Ready

## Installation

1. Open Chrome: `chrome://extensions/`
2. Enable "Developer mode" (top right)
3. Click "Load unpacked"
4. Select this folder (the extension folder)

## How It Works

1. **Before Sending**: Intercepts your message, finds PII, replaces with tokens
   - `user@example.com` → `[EMAIL_1]`
   - `555-123-4567` → `[PHONE_1]`

2. **ChatGPT Sees**: Only tokens, never real PII

3. **After Response**: Automatically restores original PII
   - `[EMAIL_1]` → `user@example.com`

## Files

- `manifest.json` - Extension configuration
- `cloak.js` - Core anonymization logic
- `content.js` - Intercepts messages and responses
- `popup.html/js` - Extension popup UI

## Supported PII Types

- Email addresses
- Phone numbers (US and international)
- Credit cards (with Luhn validation)
- Social Security Numbers (SSN)
- IP addresses
- API keys (Stripe, AWS, GitHub)
- MAC addresses
- IBAN (bank account numbers)
- UUIDs
- Passport numbers
- Driver's license numbers
- Dates of birth

## Privacy

- All processing happens **locally** in your browser
- No data is sent to external servers
- Entity maps are stored only in browser memory
- Extension only runs on ChatGPT domains
