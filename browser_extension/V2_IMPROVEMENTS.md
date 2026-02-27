# Cloak v2.0 – Improvement Ideas

## Product & features
- **Ignore list UI** – Let users add specific values (e.g. emails, domains) to never anonymize; already supported in core, needs popup controls.
- **Keyboard shortcut** – Manifest `commands` to toggle protection without opening the popup.
- **“Active on this tab”** – Show in popup whether current tab is ChatGPT and if Cloak is active there.
- **Export / import settings** – Backup and restore PII toggles and options (e.g. JSON).
- **Presets** – “Strict”, “Balanced”, “Minimal” that set which PII types are on/off and paranoid mode.
- **Per-site allowlist** – (Future) Support other chat UIs (e.g. Claude, Gemini) with optional enable/disable per origin.

## Reliability & robustness
- **ChatGPT DOM resilience** – Keep extending selectors and fallbacks as the UI changes; consider a simple “compatibility mode” if layout changes.
- **Fetch/XHR fallback** – If OpenAI ever moves off WebSockets, add interception for `fetch` or XHR for the same domains.
- **Recovery from errors** – If anonymization or restore throws, log and optionally retry or show a single “Something went wrong” state in the popup (e.g. “Check console” link when debug is on).

## Performance
- **Lazy PII list** – Render the long “What to anonymize” list in a virtual or paginated way so the popup opens faster with many types.
- **Debounce storage writes** – Batch rapid toggle flips into one `chrome.storage.sync.set` to avoid quota and flicker.
- **Pattern tuning** – Profile which patterns are slow on long messages and optimize or split work (e.g. run in chunks).

## PII detection
- **More international** – Additional phone/ID formats (e.g. AU TFN, more EU IDs), and optional “Region” setting to bias patterns.
- **Custom regex** – Let advanced users add one or two custom patterns (with a strong warning about safety).
- **Confidence display** – In debug mode, log or show which pattern matched (e.g. “Matched as SSN”) to help tune.

## UX (popup & in-page)
- **Popup** – See “Popup UX” section below; already improved in this pass.
- **In-page** – Optional “last anonymized” tooltip or small log when clicking the page indicator (when debug or a “recent activity” setting is on).
- **Onboarding** – First-run tooltip or short message: “Cloak is on. Paste as usual on ChatGPT; PII is replaced before sending.”

## Code & quality
- **Unit tests** – Jest or similar for `cloak.js` (anonymize/deanonymize, validation, consistency).
- **E2E or smoke tests** – Optional: Puppeteer/Playwright to open ChatGPT, type, and assert tokens in the request.
- **Single source for pattern keys** – `pii-types.js` already drives the list; ensure any new pattern type has a corresponding key/label and that cloak only uses those keys for filtering.

## Documentation & release
- **Changelog** – Maintain CHANGELOG.md for each release (user-facing).
- **Privacy & permissions** – Keep store listing and in-app copy in sync with actual data use (local only, no telemetry).
- **Version in popup** – Show “v2.0” or build date in the popup footer so users can confirm they’re on the latest.

---

## Stand-out features (differentiators)

Feature ideas that make Cloak uniquely valuable beyond “mask PII” – things competitors typically don’t offer.

### Safety & control
- **Pre-send review** – Before the message is sent, show a brief summary: “We found 2 emails, 1 SSN. Send anyway? [Send] [Edit] [Add to allowlist].” Lets users confirm or back out.
- **One-time reveal** – Click a placeholder in the response to reveal the real value once (e.g. to verify), then it masks again. Optional, off by default.
- **Compliance labels** – Placeholders show type only, e.g. `[EMAIL_1]` or `[SSN]`, so auditors see what was redacted without ever seeing the value. Toggle in settings.
- **Session / TTL for mappings** – Auto-clear the entity map when the conversation is closed or after N hours, so tokens can’t be reused across sessions.
- **Encrypted token store (optional)** – Encrypt the in-memory map so even local inspection can’t easily recover PII. For high-sensitivity users.

### Share & export without leaking
- **“Safe to share” copy** – One-click copy of the last response (or whole thread) with PII replaced by placeholders, so you can paste into Slack, tickets, or docs safely.
- **Export conversation (redacted)** – Download the current chat as JSON or Markdown with placeholders instead of real PII, for safe storage or compliance.
- **Bulk anonymizer** – In options, paste a block of text and get a redacted version to copy (useful for sharing docs or tickets outside the chat).

### Smarter allowlisting
- **Domain allowlist** – “Never mask *@mycompany.com” (or a list of domains) so internal addresses stay visible while personal ones are masked.
- **Per-conversation allowlist** – “In this chat only, don’t mask these 3 emails” (e.g. the user’s own). Stored with the conversation, cleared when the chat is left.
- **Allowlist from pre-send** – From the pre-send review, “Don’t mask this value again” adds it to the global or conversation allowlist in one click.

### Transparency & trust
- **Session summary** – After a session (or on demand): “This session we replaced 12 emails, 2 SSNs, 3 phones.” Stored locally, optional. Shows value without leaking data.
- **Paranoid report** – Optional list of “Possible PII we didn’t mask (low confidence)” for user review, so they can add to allowlist or tighten patterns.
- **Placeholder style** – Let users choose: `[REDACTED]`, `[EMAIL_1]`, or generic `[PII]` so output matches their policy or preference.

### Beyond ChatGPT
- **Multi-LLM support** – Same protection on Claude (Anthropic), Gemini, Copilot, or other chat UIs. One extension for all LLM chats.
- **Per-origin toggle** – Enable/disable Cloak per site (e.g. on for ChatGPT, off for Claude) with a simple list in options.

### Power users & integrations
- **Local API** – Optional messaging API so other extensions or scripts can send “anonymize this string” / “deanonymize this token” (e.g. for custom workflows or integrations). All local.
- **Custom regex (advanced)** – One or two user-defined patterns with a label (e.g. “Internal ID”) and a strong warning. For org-specific PII.
- **Regex playground** – In options, paste sample text and test a custom pattern (or built-in type) and see matches. For tuning without sending real data.

### Pro / enterprise angle
- **Audit log (local)** – Optional log of “at 14:32 we masked 2 SSNs in a send” (no values, just counts and types). Stored locally for compliance or review.
- **Reset on new conversation** – Option to clear the entity map when the user starts a new chat, so no cross-conversation token reuse.
- **“Strict send” mode** – Block send until the user explicitly confirms when high-risk types (e.g. SSN, credit card) are detected.

---

## More improvements for v2

### Security & privacy
- **No external requests** – Audit that the extension never loads remote scripts or sends data off-device; document in privacy policy.
- **Content Security Policy** – Tighten manifest CSP if needed so only required sources are allowed.
- **Storage scope** – Document what is stored in `sync` vs `local` and that nothing is sent to a backend.
- **Optional “stealth” mode** – When on, avoid writing any stats (today/total) so there’s no local trace of usage.

### In-page experience
- **Page indicator click action** – When user clicks the Cloak badge on ChatGPT, show a small tooltip (e.g. “Protection on” / “X items anonymized this session”) or open popup.
- **Inline “just anonymized” hint** – Brief, non-intrusive cue near the input (e.g. “3 items replaced”) when a send is anonymized; respect notification level.
- **Restore failure feedback** – If deanonymization fails for a response, show a small “Restore issue” hint or icon so the user knows to check.

### PII & detection
- **Whitelist / ignore list** – Allow specific values or patterns (e.g. “don’t mask @mycompany.com”) with a simple list in options.
- **Pattern sensitivity slider** – Optional “Strict / Normal / Relaxed” that adjusts how aggressive patterns are (e.g. fewer false positives in Relaxed).
- **Per-type confidence** – In debug, show which pattern matched each replacement (e.g. “SSN”, “EMAIL_OBFUSCATED”) for tuning.
- **Copy-paste safety** – When user pastes into the input, optionally run anonymization on paste and show a small “Cleaned” badge.

### Settings & configuration
- **Search/filter PII list** – In “What to anonymize”, add a search box to quickly find a type (e.g. “credit” → Credit card).
- **Reset to defaults** – One-click “Reset all settings” with confirmation.
- **Sync across devices** – Rely on `chrome.storage.sync` so toggles and options follow the user’s Chrome profile (already in use; document it).
- **Import/export** – Export settings as JSON and import from file for backup or sharing a config.

### Compatibility & platforms
- **Firefox (WebExtensions)** – Port to Firefox; replace `chrome.*` with `browser.*` or use a compatibility layer; test on chat.openai.com.
- **Edge** – Verify and document that the extension works in Edge (usually Chrome-compatible).
- **ChatGPT UI changes** – Maintain a short “last tested with” note (e.g. “ChatGPT UI as of Jan 2025”) and a way for users to report breakage (e.g. GitHub issues or help page).

### Developer & maintainability
- **Structured logging** – In debug mode, use a small logger with levels (info/warn/error) and consistent prefixes (e.g. `[Cloak]`) for easier filtering.
- **Feature flags** – Optional local flags to turn experimental features on/off without a full release.
- **Error reporting (opt-in)** – If you add a backend later, allow users to opt in to sending anonymized error reports (stack trace, no PII).
- **Single entry for patterns** – All regexes and labels live in one module; popup and content script only reference keys.

### Store & distribution
- **Chrome Web Store listing** – Clear description, screenshots of popup and in-page indicator, short video/GIF of flow; highlight “no data leaves your device”.
- **Privacy policy URL** – Ensure getcloak.org/privacy.html is linked in manifest and store listing.
- **Update strategy** – Document how often you plan to bump version (e.g. when OpenAI changes the page or when new PII types are added).

### Edge cases & robustness
- **Very long messages** – If the message is huge, consider chunking anonymization or showing “Processing…” so the UI doesn’t feel stuck.
- **Rapid send** – If the user sends multiple messages quickly, ensure conversation ID and entity map stay correct and no race conditions.
- **Multiple tabs** – Clarify behavior when multiple ChatGPT tabs are open (e.g. each tab has its own conversation map; document it).
- **Offline / slow** – If the page is slow to load, ensure the content script doesn’t block; defer non-critical work.

### UX polish
- **Tooltips on PII toggles** – Short description on hover/focus for each “What to anonymize” row (e.g. “Emails, including obfuscated forms”).
- **Empty state** – If “What to anonymize” is filtered and nothing matches, show “No types match your search”.
- **Confirmation for destructive actions** – e.g. “Reset settings” or “Clear ignore list” with a clear Confirm/Cancel.
- **Version and “What’s new”** – In popup or options, link to a short “What’s new in v2” (changelog or blog post).

### Accessibility (further)
- **High contrast** – Ensure status pill and toggles meet contrast ratios (WCAG AA) and consider a “High contrast” option if needed.
- **Reduced motion** – Already respect `prefers-reduced-motion`; extend to any future animations (e.g. tooltips, badges).
- **Focus order** – Tab order in popup follows visual order (Protection → Settings → Debug → Footer links).
- **Labels for icons** – Any icon-only button has an accessible name (aria-label or sr-only text).

---

## Popup UX (applied in this pass)
- Clearer visual hierarchy and spacing.
- Card-style layout with subtle shadows and hover states.
- Paranoid mode and “Page indicator” with short tooltips or hints.
- “What to anonymize” as a scannable list with consistent toggles.
- Footer with version and links (Website, Help, Privacy).
- Keyboard and screen-reader friendly (focus, aria, Enter/Space on main toggle).
