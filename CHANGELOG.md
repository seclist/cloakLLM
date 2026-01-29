# Changelog

## [1.0.0] - December 2024

### 🎉 Initial Production Release

#### Features
- ✅ Automatic PII anonymization before sending to ChatGPT
- ✅ Automatic PII restoration in ChatGPT responses
- ✅ Support for 13+ PII types (Email, Phone, Credit Card, SSN, IP, API Keys, MAC, IBAN, UUID, Passport, Driver's License, Date of Birth)
- ✅ Multi-conversation support with automatic entity map tracking
- ✅ WebSocket interception for real-time anonymization
- ✅ Context-aware detection to reduce false positives
- ✅ Luhn algorithm validation for credit cards
- ✅ International phone number support
- ✅ Partial masking mode (shows last 4 digits)
- ✅ Debug mode toggle for troubleshooting
- ✅ Clean, minimal popup UI with settings
- ✅ Conversation switching support
- ✅ Memory management (auto-cleanup of old conversations)

#### Technical
- ✅ Full error handling and recovery
- ✅ Memory leak prevention
- ✅ Robust initialization with retry logic
- ✅ Graceful degradation on errors
- ✅ Performance optimizations
- ✅ No external API calls
- ✅ 100% local processing

#### UI/UX
- ✅ Modern, clean popup design
- ✅ Collapsible settings section
- ✅ Individual PII type toggles
- ✅ Debug mode toggle
- ✅ Status indicators
- ✅ Website links

#### Security & Privacy
- ✅ Zero data collection
- ✅ All processing local
- ✅ Minimal permissions (storage only)
- ✅ No network requests
- ✅ Privacy-first design

#### Documentation
- ✅ Privacy Policy
- ✅ Terms of Service
- ✅ Installation guide
- ✅ Troubleshooting guide
- ✅ Test prompts

---

**Status:** Production Ready ✅
