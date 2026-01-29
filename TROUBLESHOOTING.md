# Troubleshooting - Extension Not Working

## Quick Fixes

### 1. Reload Extension
1. Go to `chrome://extensions/`
2. Find "CloakLLM"
3. Click the **refresh icon** (circular arrow)
4. Go back to chatgpt.com and refresh the page

### 2. Check Console (IMPORTANT!)

1. Go to https://chatgpt.com
2. Press **F12** to open Developer Tools
3. Click the **Console** tab
4. Look for messages starting with `[CloakLLM]`

**What you should see:**
```
[CloakLLM] CloakLLM content script loaded
[CloakLLM] Current URL: https://chatgpt.com/...
[CloakLLM] Document ready state: complete
[CloakLLM] Initializing CloakLLM...
[CloakLLM] Found textarea with selector: textarea
[CloakLLM] ✅ Textarea found and ready
[CloakLLM] CloakLLM initialized successfully
```

**If you DON'T see these messages:**
- Extension might not be loaded
- Check `chrome://extensions/` for errors
- Make sure extension is enabled

### 3. Manual Test in Console

Copy and paste this into the browser console:

```javascript
// Test if Cloak works
const cloak = new Cloak();
const result = cloak.anonymize("Email: test@example.com");
console.log("Result:", result.cloakedText);
// Should output: "Email: [EMAIL_1]"
```

**If this works:** The core logic is fine, issue is with interception  
**If this doesn't work:** Extension files might not be loaded correctly

### 4. Test Interception

1. Type in ChatGPT textarea: `test@example.com`
2. **Before clicking send**, check console
3. You should see: `[CloakLLM] Textarea value changed to: test@example.com`
4. Click send button
5. You should see: `[CloakLLM] Button clicked, textarea has value, anonymizing...`
6. Check your sent message - should show `[EMAIL_1]`

### 5. Common Issues

**Issue: No console messages at all**
- Extension not loaded
- Go to `chrome://extensions/` and check for errors
- Try reloading extension

**Issue: "Textarea not found"**
- ChatGPT UI might have changed
- Try refreshing the page
- Check if you're on chatgpt.com (not chat.openai.com)

**Issue: "No PII found"**
- Make sure text matches patterns
- Try: `Email: test@example.com` (with "Email:" prefix)
- Check console for what text was detected

**Issue: Text not being replaced**
- Check console for "Intercepting message" log
- Check if "Text replaced successfully" appears
- Try typing the text, then wait a moment before sending

### 6. Force Test

Run this in console to manually anonymize:

```javascript
// Find textarea
const textarea = document.querySelector('textarea') || document.querySelector('div[contenteditable="true"]');
if (textarea) {
    const cloak = new Cloak();
    const original = textarea.value || textarea.textContent || '';
    const result = cloak.anonymize(original);
    
    if (textarea.contentEditable === 'true') {
        textarea.textContent = result.cloakedText;
    } else {
        textarea.value = result.cloakedText;
    }
    
    console.log('Manually anonymized:', result.cloakedText);
} else {
    console.log('No textarea found!');
}
```

### 7. Still Not Working?

1. **Check extension permissions:**
   - Go to `chrome://extensions/`
   - Click "Details" on CloakLLM
   - Make sure it has access to chatgpt.com

2. **Check for JavaScript errors:**
   - Look in console for red error messages
   - These will tell you what's wrong

3. **Try different text:**
   - `Email: user@example.com` (with label)
   - `Phone: 555-123-4567` (with label)
   - Just `test@example.com` (might not work without context)

4. **Check ChatGPT UI:**
   - Are you on the new or old ChatGPT interface?
   - Try both chatgpt.com and chat.openai.com

## Report Back

If still not working, tell me:
1. What console messages you see (copy them)
2. Does the manual test work?
3. What happens when you type and send a message?
