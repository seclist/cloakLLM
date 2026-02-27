# Browser Extension Guide for ChatGPT Website

## Current Limitation

The `AutoCloak` wrapper works with **API calls** (like `openai.ChatCompletion.create()`), not with the ChatGPT website interface.

## Solutions for ChatGPT Website

### Option 1: Browser Extension (Recommended)

You would need a browser extension that:
1. Intercepts text before you send it to ChatGPT
2. Anonymizes it automatically
3. Sends anonymized version
4. Intercepts response
5. Restores original PII

**This requires:**
- Chrome/Firefox extension development
- Content scripts to modify the page
- Message passing between extension and page

### Option 2: Use ChatGPT API Instead

Instead of the website, use the API with AutoCloak:

```python
from cloak_wrapper import AutoCloak
import openai

auto_cloak = AutoCloak()

@auto_cloak.auto_cloak
def chat_with_gpt(messages):
    return openai.ChatCompletion.create(
        model="gpt-4",
        messages=messages
    )

# This works automatically!
messages = [{"role": "user", "content": "Email: user@example.com"}]
response = chat_with_gpt(messages)
```

### Option 3: Copy-Paste Helper Script

A simple Python script that anonymizes text before you paste it:

```python
from cloak_wrapper import AutoCloak
import pyperclip  # pip install pyperclip

auto_cloak = AutoCloak()

# Copy your text with PII
text = "Email: user@example.com, Phone: 555-123-4567"

# Anonymize and copy to clipboard
result = auto_cloak.anonymize(text)
pyperclip.copy(result.cloaked_text)

# Paste into ChatGPT, get response, then restore:
response_from_chatgpt = "[EMAIL_1] is a valid email"
restored = auto_cloak.deanonymize(response_from_chatgpt, result.entity_map)
print(restored)
```
