# Cloak – Browser Extension

Auto-anonymize PII before sending to ChatGPT and restore it in responses. All processing is local; nothing is sent to external servers.

**Version:** 2.0.0

## Install (development)

1. Open `chrome://extensions/`
2. Enable **Developer mode**
3. Click **Load unpacked** and select this folder

## Required assets

- `invisible.png` – extension icons (16, 48, 128 px or one image used for all)
- `icon.png` – popup header icon (optional; can switch popup to use `invisible.png`)

## Structure

| File           | Role |
|----------------|------|
| `manifest.json`| Extension config, permissions, content scripts |
| `cloak.js`     | PII detection, anonymization, deanonymization |
| `content.js`   | ChatGPT page: WebSocket intercept, tracking, restore |
| `popup.html`   | Popup UI |
| `popup.js`     | Popup logic, settings, storage |

## Supported PII

Email, phone (US/international), credit cards, SSN, IP, API keys (Stripe/AWS/GitHub), MAC, IBAN, UUID, passport, driver’s license, dates of birth.

## Compatibility

Tested with **ChatGPT** (chat.openai.com / chatgpt.com). If OpenAI changes the page structure or wire format, the extension may need updates. Check the repo or getcloak.org for the latest compatibility note.

## Site

Marketing site lives in `../site/` (getcloak.org). Keep that folder for the website; the extension is standalone.
