# Quick Start - CloakLLM Browser Extension

## Installation (2 minutes)

1. **Open Chrome Extensions**
   - Go to `chrome://extensions/`
   - Or: Menu → More Tools → Extensions

2. **Enable Developer Mode**
   - Toggle the switch in the top-right corner

3. **Load the Extension**
   - Click "Load unpacked"
   - Navigate to and select this folder (the extension folder)
   - Extension should appear in your list

4. **Done!** ✅

## How to Use

1. **Go to ChatGPT**
   - Visit https://chat.openai.com or https://chatgpt.com

2. **Type Your Message Normally**
   - Example: `"Email: user@example.com, Phone: 555-123-4567"`

3. **Send It**
   - Click send or press Enter
   - **Extension automatically anonymizes before sending!**

4. **See the Magic**
   - Your sent message shows: `"Email: [EMAIL_1], Phone: [PHONE_1]`
   - ChatGPT only sees tokens (no real PII!)
   - ChatGPT's response automatically has PII restored!

## What Gets Anonymized?

✅ Email addresses  
✅ Phone numbers (US & international)  
✅ Credit cards  
✅ Social Security Numbers  
✅ IP addresses  
✅ API keys  
✅ MAC addresses  
✅ IBAN (bank accounts)  
✅ UUIDs  
✅ Passport numbers  
✅ Driver's license  
✅ Dates of birth  

## Verify It's Working

1. Type: `"My email is test@example.com"`
2. Send it
3. Check your sent message - should show `[EMAIL_1]` instead
4. ChatGPT's response will automatically show `test@example.com` again

## Troubleshooting

**Not working?**
- Make sure extension is enabled (click the icon)
- Refresh the ChatGPT page
- Check browser console (F12) for errors

**PII not being detected?**
- Make sure it matches the patterns (see supported types above)
- Check browser console for debug logs

**Response not restoring?**
- Wait a moment (extension checks every 500ms)
- Try refreshing the page
- Check that you sent a message with PII first

## Enable Debug Mode

1. Open browser console (F12)
2. Look for messages starting with `[CloakLLM]`
3. To see more logs, edit `content.js` and set `config.debug = true`

## Privacy

- ✅ All processing happens **locally** in your browser
- ✅ No data sent to external servers
- ✅ Extension only runs on ChatGPT domains
- ✅ Entity maps stored only in browser memory
