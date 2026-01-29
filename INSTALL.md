# Installing CloakLLM Browser Extension

## Step 1: Prepare the Extension

1. Make sure all files are in the `browser_extension/` folder:
   - `manifest.json`
   - `cloak.js`
   - `content.js`
   - `popup.html`
   - `popup.js`
   - Icon files (optional)

## Step 2: Create Icon Files (Optional)

You can create simple icon files or use placeholder images:
- `icon16.png` (16x16 pixels)
- `icon48.png` (48x48 pixels)
- `icon128.png` (128x128 pixels)

Or skip this step - the extension will work without icons.

## Step 3: Load Extension in Chrome

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the `browser_extension/` folder
5. The extension should now appear in your extensions list

## Step 4: Test It

1. Go to https://chat.openai.com or https://chatgpt.com
2. Type a message with PII: `Email: test@example.com, Phone: 555-123-4567`
3. Send the message
4. Check the message you sent - it should show tokens like `[EMAIL_1]`, `[PHONE_1]`
5. When ChatGPT responds, the response should automatically have the original PII restored

## Step 5: Configure (Optional)

Click the extension icon to:
- Enable/disable auto-anonymization
- View status

## Troubleshooting

**Extension not working?**
- Make sure you're on chat.openai.com or chatgpt.com
- Check browser console (F12) for errors
- Reload the ChatGPT page after installing extension

**PII not being anonymized?**
- Check that extension is enabled (click icon)
- Open browser console and look for `[CloakLLM]` logs
- Make sure your text matches the detection patterns

**Responses not being restored?**
- The extension watches for new messages - wait a moment
- Check browser console for errors
- Try refreshing the page

## Development Mode

To see debug logs:
1. Open browser console (F12)
2. Look for messages starting with `[CloakLLM]`
3. You can modify `content.js` and set `config.debug = true` for more logs
