/**
 * Cloak Content Script v2.0
 * Automatically anonymizes messages before sending to ChatGPT and restores PII in responses.
 *
 * Structure:
 *   1. Debug mode (early)
 *   2. WebSocket patch (document_start, before page scripts)
 *   3. Init & settings (loadInitialSettings, cloak, state)
 *   4. Helpers (safeExecute, showNotification)
 *   5. DOM (findTextarea, getSendButton, isSendButton)
 *   6. Anonymization (anonymizeText, interceptMessage)
 *   7. WebSocket send/message logic (replace send, CloakWebSocketWithRestore)
 *   8. Events (handleEnterKey, handleSendButton, triggerSendAfterIntercept)
 *   9. Response restoration (restoreTextNode, scanForResponses, observeResponses)
 *  10. Init (init, DOMContentLoaded)
 */
(function() {
    'use strict';

    /** Set when extension is reloaded/updated; chrome.* APIs will throw. Declared early for debug callback. */
    var extensionContextInvalidated = false;

    // ========================================
    // 1. DEBUG MODE - MUST BE FIRST
    // ========================================
    
    let debugMode = false;
    
    // Debug logging (defined early, before any calls)
    function debugLog(...args) {
        if (debugMode) console.log('[Cloak]', ...args);
    }
    function debugSummary(action, detail) {
        if (debugMode) console.log('[Cloak]', action, detail || '');
    }
    
    // Load debug mode from storage (async, but function is defined)
    try {
        chrome.storage.sync.get(['debugMode'], function(result) {
            try {
                if (!chrome.runtime.lastError) {
                    debugMode = result.debugMode === true;
                }
            } catch (e) {
                if (e && e.message && e.message.indexOf('Extension context invalidated') !== -1) {
                    extensionContextInvalidated = true;
                }
            }
        });
    } catch (e) {
        // Chrome storage might not be available yet / context invalidated
        if (e && e.message && e.message.indexOf('Extension context invalidated') !== -1) {
            extensionContextInvalidated = true;
        }
    }

    // ========================================
    // 2. WEBSOCKET PATCH (must run before page scripts)
    // ========================================
    // Patch WebSocket BEFORE any page scripts can create one
    // This must happen immediately, even before Cloak is loaded
    
    const OriginalWebSocket = window.WebSocket;
    const originalWebSocketSend = WebSocket.prototype.send;
    
    // Store references for later use
    window._Cloak_OriginalWebSocket = OriginalWebSocket;
    window._Cloak_OriginalWebSocketSend = originalWebSocketSend;
    
    // Override constructor FIRST - catches all new WebSocket creations
    function CloakWebSocket(url, protocols) {
        try {
            const ws = new OriginalWebSocket(url, protocols);
            ws._cloakUrl = url;
            return ws;
        } catch (e) {
            // If constructor fails, rethrow
            throw e;
        }
    }
    
    // Copy all WebSocket properties and prototype
    CloakWebSocket.prototype = OriginalWebSocket.prototype;
    
    // Copy static properties safely
    if (typeof OriginalWebSocket.CONNECTING !== 'undefined') {
        CloakWebSocket.CONNECTING = OriginalWebSocket.CONNECTING;
    }
    if (typeof OriginalWebSocket.OPEN !== 'undefined') {
        CloakWebSocket.OPEN = OriginalWebSocket.OPEN;
    }
    if (typeof OriginalWebSocket.CLOSING !== 'undefined') {
        CloakWebSocket.CLOSING = OriginalWebSocket.CLOSING;
    }
    if (typeof OriginalWebSocket.CLOSED !== 'undefined') {
        CloakWebSocket.CLOSED = OriginalWebSocket.CLOSED;
    }
    
    // Replace window.WebSocket
    window.WebSocket = CloakWebSocket;
    
    // Patch prototype.send - catches ALL WebSocket.send() calls
    WebSocket.prototype.send = function(data) {
        // Store reference to original for later
        if (!this._cloakOriginalSend) {
            this._cloakOriginalSend = originalWebSocketSend;
        }
        
        // Will be handled by the main interception logic below
        return this._cloakOriginalSend.call(this, data);
    };
    
    debugLog('WebSocket patched at document_start');

    // ========================================
    // 3. CLOAK DEPENDENCY CHECK
    // ========================================
    
    if (typeof Cloak === 'undefined') {
        console.error('[Cloak] Cloak class not found. Check manifest.json.');
        return;
    }
    
    // ========================================
    // 4. ERROR HANDLING & HELPERS
    // ========================================
    
    function safeExecute(fn, errorMsg, fallback = null) {
        try {
            return fn();
        } catch (error) {
            if (error && (error.message === 'Extension context invalidated' || error.message === 'chrome.runtime.lastError while running extension')) {
                extensionContextInvalidated = true;
                console.warn('[Cloak] Extension was reloaded. Refresh this page to use Cloak again.');
            } else {
                console.error('[Cloak]', errorMsg, error);
            }
            if (fallback !== null) return fallback;
            return null;
        }
    }
    
    function isExtensionContextValid() {
        if (extensionContextInvalidated) return false;
        try {
            if (typeof chrome === 'undefined' || !chrome.runtime) return false;
            var id = chrome.runtime.id;
            return typeof id === 'string' && id.length > 0;
        } catch (e) {
            if (e && e.message && (e.message.indexOf('Extension context invalidated') !== -1 || e.message.indexOf('chrome.runtime.lastError') !== -1)) {
                extensionContextInvalidated = true;
            }
            return false;
        }
    }
    
    const REVIEW_PROMPT_THRESHOLD = 8;
    const CHROME_WEB_STORE_REVIEW_URL = 'https://chromewebstore.google.com/detail/cnemamhbfgaapjiafemkciccgkgibfgf';
    
    function maybeShowReviewPrompt(eventTotal) {
        if (eventTotal < REVIEW_PROMPT_THRESHOLD) return;
        if (!isExtensionContextValid()) return;
        chrome.storage.local.get(['reviewPromptShown'], function(result) {
            if (result.reviewPromptShown) return;
            if (!document.body) return;
            showReviewPrompt();
        });
    }

    // Track anonymization progress independently from audit log settings.
    function recordAnonymizationProgress(addCount) {
        if (!isExtensionContextValid()) return;
        var add = Math.max(0, parseInt(addCount, 10) || 0);
        if (add === 0) return;
        chrome.storage.local.get(['cloakReviewProgress'], function(result) {
            if (!isExtensionContextValid()) return;
            var current = Math.max(0, parseInt(result.cloakReviewProgress, 10) || 0);
            var next = current + add;
            chrome.storage.local.set({ cloakReviewProgress: next }, function() {
                if (!isExtensionContextValid()) return;
                if (chrome.runtime.lastError) return;
                maybeShowReviewPrompt(next);
            });
        });
    }
    
    function showReviewPrompt() {
        if (document.getElementById('cloak-review-prompt')) return;
        const box = document.createElement('div');
        box.id = 'cloak-review-prompt';
        box.setAttribute('aria-live', 'polite');
        box.style.cssText = [
            'position:fixed;bottom:24px;right:24px;z-index:10001;',
            'max-width:320px;padding:14px 16px;border-radius:10px;',
            'background:#fff;color:#1a1a1a;font-size:13px;line-height:1.4;',
            'font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,sans-serif;',
            'box-shadow:0 4px 20px rgba(0,0,0,0.15);border:1px solid #e5e7eb;'
        ].join('');
        box.innerHTML = [
            '<p style="margin:0 0 12px 0;font-weight:500;">Enjoying Cloak? We\'d love a quick review.</p>',
            '<div style="display:flex;gap:8px;flex-wrap:wrap;">',
            '<a href="' + CHROME_WEB_STORE_REVIEW_URL + '" target="_blank" rel="noopener" id="cloak-review-btn" style="padding:6px 12px;background:#0d9488;color:#fff;border-radius:6px;text-decoration:none;font-weight:500;font-size:12px;">Leave a review</a>',
            '<button type="button" id="cloak-review-dismiss" style="padding:6px 12px;background:transparent;border:1px solid #d1d5db;border-radius:6px;font-size:12px;cursor:pointer;color:#64748b;">Maybe later</button>',
            '</div>'
        ].join('');
        document.body.appendChild(box);
        box.querySelector('#cloak-review-btn').addEventListener('click', function() {
            chrome.storage.local.set({ reviewPromptShown: true });
            box.remove();
        });
        box.querySelector('#cloak-review-dismiss').addEventListener('click', function() {
            chrome.storage.local.set({ reviewPromptShown: true });
            box.remove();
        });
    }
    
    /** Derive PII type counts from entity map (tokens like [EMAIL_1], [SSN_2]). */
    function getCountsByType(entityMap) {
        const counts = {};
        if (!entityMap || typeof entityMap !== 'object') return counts;
        for (const token of Object.keys(entityMap)) {
            const match = token.match(/^\[([A-Z_]+)_\d+\]$/);
            const rawType = match ? match[1] : 'PII';
            const type = rawType.indexOf('CLOAK_') === 0 ? rawType.slice(6) : rawType;
            counts[type] = (counts[type] || 0) + 1;
        }
        return counts;
    }
    
    /** Append one entry to the local audit log (no PII values, only counts and types). */
    const AUDIT_LOG_MAX = 500;
    const AUDIT_LOG_VERSION = 1;
    function appendAuditLog(entityMap, conversationId, source) {
        const total = Object.keys(entityMap || {}).length;
        if (total === 0) return;
        if (!isExtensionContextValid()) return;
        const counts = getCountsByType(entityMap);
        const entry = {
            v: AUDIT_LOG_VERSION,
            ts: new Date().toISOString(),
            counts: counts,
            total: total,
            cid: conversationId || null,
            src: source || 'send'
        };
        chrome.storage.sync.get(['cloakSettings'], function(syncResult) {
            if (!isExtensionContextValid()) return;
            const settings = (syncResult && syncResult.cloakSettings) || {};
            if (settings.auditLogEnabled === false) return;
            chrome.storage.local.get(['cloakAuditLog'], function(result) {
                if (!isExtensionContextValid()) return;
                const log = Array.isArray(result.cloakAuditLog) ? result.cloakAuditLog : [];
                log.push(entry);
                var cutoff = Date.now() - (30 * 24 * 60 * 60 * 1000);
                var filtered = log.filter(function(e) {
                    var t = e.ts ? new Date(e.ts).getTime() : 0;
                    return t >= cutoff;
                });
                if (filtered.length > AUDIT_LOG_MAX) {
                    filtered = filtered.slice(-AUDIT_LOG_MAX);
                }
                chrome.storage.local.set({ cloakAuditLog: filtered }, function() {
                    if (!isExtensionContextValid()) return;
                    if (chrome.runtime.lastError) {
                        if (chrome.runtime.lastError.message && chrome.runtime.lastError.message.indexOf('Extension context invalidated') !== -1) {
                            extensionContextInvalidated = true;
                        }
                        console.warn('[Cloak] Audit log write failed:', chrome.runtime.lastError.message);
                    } else {
                        debugLog('Audit log appended', total, 'item(s)');
                    }
                });
            });
        });
    }
    
    function showNotification(message, type = 'info') {
        if (notificationLevel === 'none') return false;
        if (notificationLevel === 'errors' && type !== 'error') return false;
        if (!document.body) {
            debugLog(message);
            return false;
        }
        const compact = cloakSettings && cloakSettings.notificationStyle === 'compact';
        
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: ${compact ? '12px' : '20px'};
            right: 20px;
            background: ${type === 'error' ? '#fee2e2' : type === 'success' ? '#d1fae5' : '#f3f4f6'};
            color: ${type === 'error' ? '#dc2626' : type === 'success' ? '#059669' : '#1a1a1a'};
            padding: ${compact ? '8px 10px' : '12px 16px'};
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 10000;
            font-size: ${compact ? '12px' : '13px'};
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            max-width: ${compact ? '240px' : '300px'};
            transform: translateX(400px);
            transition: transform 0.3s ease;
        `;
        notification.textContent = message;
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.transform = 'translateX(0)';
        }, 10);
        
        setTimeout(() => {
            notification.style.transform = 'translateX(400px)';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
        
        return true;
    }
    
    // ========================================
    // 5. STATE & SETTINGS LOAD
    // ========================================
    
    let cloak = null;
    let cloakSettings = {};
    let notificationLevel = 'all'; // 'all' | 'errors' | 'none'
    
    function initializeCloak() {
        try {
            cloak = new Cloak([], true, {}, false);
            return cloak;
        } catch (e) {
            console.error('[Cloak] Failed to initialize Cloak:', e);
            return new Cloak();
        }
    }
    
    /** Load settings once at startup; sets settingsReady so first send uses user preferences. */
    function loadInitialSettings() {
        if (!isExtensionContextValid()) {
            settingsReady = true;
            return;
        }
        chrome.storage.sync.get(['cloakEnabled', 'cloakSettings'], function(result) {
            if (!isExtensionContextValid()) return;
            if (chrome.runtime.lastError) {
                if (chrome.runtime.lastError.message && chrome.runtime.lastError.message.indexOf('Extension context invalidated') !== -1) {
                    extensionContextInvalidated = true;
                }
                console.error('[Cloak] Failed to load initial settings:', chrome.runtime.lastError);
                settingsReady = true;
                return;
            }
            enabled = result.cloakEnabled !== false;
            cloakSettings = result.cloakSettings || {};
            notificationLevel = (cloakSettings.notificationLevel || 'all');
            if (cloak) {
                cloak.updateSettings(null, null, null, cloakSettings, !!cloakSettings.paranoidMode);
            }
            settingsReady = true;
            if (document.body) updatePageIndicator();
            debugLog('Settings loaded, ready:', settingsReady);
        });
    }
    
    cloak = initializeCloak();
    
    if (!cloak) {
        console.error('[Cloak] Critical: Failed to initialize Cloak class');
    }
    
    const entityMaps = new Map(); // Global map: messageId -> entityMap
    const conversationEntityMaps = new Map(); // Per conversation: conversationId -> entityMap
    let currentEntityMap = {};
    let lastKnownText = '';
    let enabled = true; // Default to enabled
    let settingsReady = false; // Block first send until settings loaded (reliability)
    let currentConversationId = null;
    
    // Debounce function for performance
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    // Get conversation ID from URL
    function getConversationId() {
        const url = window.location.href;
        // ChatGPT URLs: https://chatgpt.com/c/{conversation-id}/...
        const match = url.match(/\/c\/([a-f0-9-]+)/);
        return match ? match[1] : 'default';
    }

    // Update conversation ID and load its entity map
    function updateConversation() {
        const newConversationId = getConversationId();
        if (newConversationId !== currentConversationId) {
            debugLog('Switched conversation:', currentConversationId, '->', newConversationId);
            currentConversationId = newConversationId;
            
            // Load entity map for this conversation
            if (conversationEntityMaps.has(newConversationId)) {
                currentEntityMap = conversationEntityMaps.get(newConversationId);
                debugLog('Loaded entity map for conversation:', Object.keys(currentEntityMap).length, 'tokens');
            } else {
                currentEntityMap = {};
                debugLog('New conversation, starting fresh entity map');
            }
        }
    }

    function pruneConversationMaps() {
        if (conversationEntityMaps.size <= 10) return;
        const conversations = Array.from(conversationEntityMaps.keys());
        const toRemove = conversations.slice(0, conversations.length - 10);
        toRemove.forEach(id => {
            if (id !== currentConversationId) {
                conversationEntityMaps.delete(id);
            }
        });
    }

    loadInitialSettings();
    
    // Initialize conversation tracking
    updateConversation();
    pruneConversationMaps();

    // Watch for SPA route changes without polling.
    (function attachRouteListeners() {
        var originalPushState = history.pushState;
        var originalReplaceState = history.replaceState;
        var onRouteChange = function() {
            updateConversation();
            pruneConversationMaps();
        };
        history.pushState = function() {
            var ret = originalPushState.apply(this, arguments);
            onRouteChange();
            return ret;
        };
        history.replaceState = function() {
            var ret = originalReplaceState.apply(this, arguments);
            onRouteChange();
            return ret;
        };
        window.addEventListener('popstate', onRouteChange);
        window.addEventListener('hashchange', onRouteChange);
    })();

    /** Get current conversation from DOM (user + assistant messages in order). */
    const CONVERSATION_SELECTORS = [
        '[data-message-author-role="user"], [data-message-author-role="assistant"]',
        '[data-role="user"], [data-role="assistant"]',
        'div[class*="ConversationItem"]',
        'div[class*="message"]',
        'article[class*="message"]'
    ];
    function getConversationFromDOM() {
        const out = [];
        let nodes = [];
        for (const sel of CONVERSATION_SELECTORS) {
            try {
                const el = document.querySelectorAll(sel);
                if (el && el.length > 0) {
                    nodes = Array.from(el);
                    break;
                }
            } catch (_) {}
        }
        if (nodes.length === 0) {
            const main = document.querySelector('main') || document.querySelector('[role="main"]') || document.body;
            if (main) {
                const items = main.querySelectorAll('[class*="message"], [class*="Message"], [class*="turn"]');
                nodes = Array.from(items || []);
            }
        }
        nodes.forEach(function(node) {
            const role = (node.getAttribute && (node.getAttribute('data-message-author-role') || node.getAttribute('data-role'))) || '';
            const text = (node.innerText || node.textContent || '').trim();
            if (!text) return;
            const r = role.toLowerCase() === 'assistant' ? 'assistant' : 'user';
            out.push({ role: r, content: text });
        });
        return out;
    }

    /** Redact conversation: run each message through anonymization (placeholders only, no PII). */
    function redactConversation(conversation) {
        if (!cloak || !Array.isArray(conversation)) return conversation;
        return conversation.map(function(item) {
            const result = cloak.anonymize(item.content || '');
            const content = (result && result.cloakedText) ? result.cloakedText : (item.content || '');
            return { role: item.role || 'user', content: content };
        });
    }

    // Listen for messages from popup
    chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
        if (!isExtensionContextValid()) return true;
        if (request.action === 'ping') {
            sendResponse({ success: true });
        } else if (request.action === 'toggle') {
            enabled = request.enabled;
            updatePageIndicator();
            debugLog('Extension', enabled ? 'enabled' : 'disabled');
            showNotification(enabled ? 'Cloak protection enabled' : 'Cloak protection disabled', 'success');
            sendResponse({ success: true });
        } else if (request.action === 'settingsUpdated') {
            cloakSettings = request.settings || {};
            notificationLevel = (cloakSettings.notificationLevel || 'all');
            updatePageIndicator();
            if (cloak) {
                cloak.updateSettings(null, null, null, cloakSettings, !!cloakSettings.paranoidMode);
                debugLog('Settings updated');
                showNotification('Settings updated', 'success');
            }
            sendResponse({ success: true });
        } else if (request.action === 'debugModeUpdated') {
            debugMode = request.enabled === true;
            debugLog('Debug mode', debugMode ? 'enabled' : 'disabled');
            sendResponse({ success: true });
        } else if (request.action === 'exportConversation') {
            if (!isExtensionContextValid()) {
                sendResponse({ success: false, error: 'Extension was reloaded. Please refresh this page.' });
                return true;
            }
            const format = (request.format || 'json').toLowerCase();
            const conversation = getConversationFromDOM();
            if (!conversation || conversation.length === 0) {
                sendResponse({ success: false, error: 'No conversation found on this page.' });
                return true;
            }
            const redacted = redactConversation(conversation);
            chrome.runtime.sendMessage({
                action: 'downloadRedactedExport',
                conversation: redacted,
                format: format
            }, function(response) {
                if (chrome.runtime.lastError) {
                    sendResponse({ success: false, error: chrome.runtime.lastError.message });
                } else {
                    sendResponse(response || { success: true });
                }
            });
            return true;
        }
        return true;
    });

    // Listen for storage changes (in case user changes in another tab)
    chrome.storage.onChanged.addListener(function(changes, areaName) {
        if (!isExtensionContextValid()) return;
        if (areaName === 'sync') {
            if (changes.cloakEnabled) {
                enabled = changes.cloakEnabled.newValue !== false;
                updatePageIndicator();
                debugLog('Extension', enabled ? 'enabled' : 'disabled', '(from storage change)');
            }
            if (changes.cloakSettings) {
                cloakSettings = changes.cloakSettings.newValue || {};
                notificationLevel = (cloakSettings.notificationLevel || 'all');
                updatePageIndicator();
                if (cloak) {
                    cloak.updateSettings(null, null, null, cloakSettings, !!cloakSettings.paranoidMode);
                    debugLog('Settings updated from storage');
                }
            }
            if (changes.debugMode) {
                debugMode = changes.debugMode.newValue === true;
                debugLog('Debug mode', debugMode ? 'enabled' : 'disabled', '(from storage change)');
            }
        }
    });

    debugLog('Extension initialized');

    // ========================================
    // 5b. IN-PAGE INDICATOR (optional badge when Cloak is active)
    // ========================================
    let pageIndicatorEl = null;
    function updatePageIndicator() {
        const show = enabled && (cloakSettings.showPageIndicator !== false);
        if (!document.body) return;
        if (!pageIndicatorEl) {
            pageIndicatorEl = document.createElement('div');
            pageIndicatorEl.id = 'cloak-page-indicator';
            pageIndicatorEl.setAttribute('aria-hidden', 'true');
            pageIndicatorEl.style.cssText = [
                'position:fixed;bottom:16px;right:16px;',
                'z-index:9999;font-size:11px;font-family:-apple-system,BlinkMacSystemFont,sans-serif;',
                'color:#666;background:#f3f4f6;padding:4px 8px;border-radius:6px;',
                'box-shadow:0 1px 3px rgba(0,0,0,0.1);pointer-events:none;'
            ].join('');
            pageIndicatorEl.textContent = 'Cloak';
            document.body.appendChild(pageIndicatorEl);
        }
        pageIndicatorEl.style.display = show ? 'block' : 'none';
    }

    // ========================================
    // 6. DOM (textarea, send button)
    // ========================================
    
    const TEXTAREA_SELECTORS = [
        'div[contenteditable="true"]',
        '[contenteditable="true"]',
        '[role="textbox"]',
        'textarea',
        'form textarea',
        'main [contenteditable="true"]'
    ];
    
    function findTextarea() {
        for (const sel of TEXTAREA_SELECTORS) {
            try {
                const el = document.querySelector(sel);
                if (el && (el.offsetParent !== null || sel === 'textarea')) {
                    return el;
                }
            } catch (_) { /* invalid selector */ }
        }
        return null;
    }
    
    /** Tries multiple known selectors for the send button; resilient to UI changes. */
    function getSendButton() {
        const candidates = [
            () => document.querySelector('button[data-testid="send-button"]'),
            () => document.querySelector('button[aria-label*="Send"]'),
            () => document.querySelector('button[aria-label*="send"]'),
            () => Array.from(document.querySelectorAll('button')).find(b => /send|submit|message/i.test(b.getAttribute('aria-label') || b.textContent || '')),
            () => document.querySelector('form button[type="submit"]'),
            () => {
                const textarea = findTextarea();
                if (textarea) {
                    const form = textarea.closest('form');
                    if (form) return form.querySelector('button');
                    const parent = textarea.closest('div[role="presentation"]') || textarea.parentElement;
                    if (parent) return parent.querySelector('button');
                }
                return null;
            }
        ];
        for (const fn of candidates) {
            try {
                const btn = fn();
                if (btn && typeof btn.click === 'function') return btn;
            } catch (_) { /* ignore */ }
        }
        return null;
    }
    
    function isSendButton(button) {
        if (!button || button.tagName !== 'BUTTON') return false;
        const testId = button.getAttribute('data-testid');
        if (testId === 'send-button') return true;
        const aria = (button.getAttribute('aria-label') || '').toLowerCase();
        if (aria.includes('send') || aria.includes('submit')) return true;
        const current = getSendButton();
        return current === button;
    }

    function getTextareaValue(textarea) {
        const isContentEditable = textarea.contentEditable === 'true' || 
                                 textarea.getAttribute('contenteditable') === 'true';
        return isContentEditable ? 
            (textarea.textContent || textarea.innerText || '') : 
            (textarea.value || '');
    }

    function setTextareaValue(textarea, value) {
        const isContentEditable = textarea.contentEditable === 'true' || 
                                 textarea.getAttribute('contenteditable') === 'true';
        if (isContentEditable) {
            textarea.textContent = value;
            textarea.innerText = value;
        } else {
            textarea.value = value;
        }
    }

    // ========================================
    // 7. ANONYMIZATION
    // ========================================
    
    function anonymizeText(text) {
        if (!text || !text.trim() || !cloak) return null;
        
        // Keep sync path free of any chrome.* use so "Extension context invalidated" never throws here
        const result = safeExecute(() => {
            if (typeof cloak.anonymize !== 'function') {
                console.error('[Cloak] Cloak.anonymize is not a function');
                return null;
            }
            // Optional safety mode: preserve fenced code blocks exactly as typed.
            if (cloakSettings && cloakSettings.skipCodeBlocks === true) {
                const blocks = [];
                const masked = text.replace(/```[\s\S]*?```/g, function(block) {
                    const marker = '__CLOAK_CODE_BLOCK_' + blocks.length + '__';
                    blocks.push(block);
                    return marker;
                });
                const maskedResult = cloak.anonymize(masked);
                if (!maskedResult || !maskedResult.entityMap || Object.keys(maskedResult.entityMap).length === 0) return null;
                let restoredText = maskedResult.cloakedText;
                blocks.forEach(function(block, i) {
                    restoredText = restoredText.split('__CLOAK_CODE_BLOCK_' + i + '__').join(block);
                });
                return { cloakedText: restoredText, entityMap: maskedResult.entityMap };
            }
            const r = cloak.anonymize(text);
            if (!r || !r.entityMap || Object.keys(r.entityMap).length === 0) return null;
            return r;
        }, 'Error during anonymization', null);
        
        return result;
    }

    // ========================================
    // 8. MESSAGE INTERCEPTION
    // ========================================
    
    function interceptMessage(textarea) {
        if (!enabled || !cloak) return false;
        
        if (!textarea) return false;
        
        // Update conversation tracking
        updateConversation();
        
        const originalText = getTextareaValue(textarea);
        
        if (!originalText || !originalText.trim()) return false;
        
        lastKnownText = originalText;
        
        const result = anonymizeText(originalText);
        if (!result || !result.cloakedText || !result.entityMap) return false;
        
        // Merge with existing entity map for this conversation
        currentEntityMap = { ...currentEntityMap, ...result.entityMap };
        
        // Store entity map per conversation
        conversationEntityMaps.set(currentConversationId, currentEntityMap);
        
        // Also store per message (for backwards compatibility)
        const messageId = Date.now();
        entityMaps.set(messageId, result.entityMap);
        textarea.setAttribute('data-cloak-id', messageId);
        textarea.setAttribute('data-cloak-conversation', currentConversationId);
        
        // Replace textarea content with anonymized version
        setTextareaValue(textarea, result.cloakedText);
        
        const tokenCount = Object.keys(result.entityMap).length;
        debugSummary('Anonymized', tokenCount + ' item(s) | conversation ' + currentConversationId + ' | total tokens ' + Object.keys(currentEntityMap).length);
        if (debugMode && result.cloakedText) debugLog('Preview:', result.cloakedText.substring(0, 80) + (result.cloakedText.length > 80 ? '…' : ''));
        
        if (tokenCount > 0) {
            recordAnonymizationProgress(tokenCount);
            appendAuditLog(result.entityMap, currentConversationId, 'send');
            const didShow = showNotification(`${tokenCount} PII item${tokenCount > 1 ? 's' : ''} anonymized`, 'success');
            if (didShow) debugLog('Anonymized', tokenCount, 'item(s)');
        }
        
        return true;
    }

    // ========================================
    // 9. WEBSOCKET SEND & RESTORE LOGIC
    // ========================================
    // WebSocket is already patched at the top, now add anonymization logic
    
    const originalSendRef = window._Cloak_OriginalWebSocketSend;
    
    // Replace the placeholder send function with full logic
    WebSocket.prototype.send = function(data) {
        const url = this.url || this._cloakUrl || '';
        const isChatGPTWS = url && (url.includes('chatgpt') || url.includes('openai') || 
                                    url.includes('backend-api') || url.includes('backend'));
        
        if (enabled && isChatGPTWS) {
            // Update conversation tracking
            updateConversation();
            
            const dataStr = typeof data === 'string' ? data : 
                          (data instanceof ArrayBuffer ? new TextDecoder().decode(data) : 
                          String(data));
            
            // Get current textarea value as fallback
            const textarea = findTextarea();
            let textToCheck = lastKnownText;
            
            if (textarea) {
                const currentText = getTextareaValue(textarea);
                if (currentText && currentText.trim()) {
                    textToCheck = currentText;
                    lastKnownText = currentText; // Update last known text
                }
            }
            
            // Strategy 1: Anonymize the tracked text if it appears in data
            if (textToCheck && textToCheck.trim()) {
                const result = anonymizeText(textToCheck);
                if (result && Object.keys(result.entityMap).length > 0) {
                    // Merge with existing entity map for this conversation
                    currentEntityMap = { ...currentEntityMap, ...result.entityMap };
                    conversationEntityMaps.set(currentConversationId, currentEntityMap);
                    appendAuditLog(result.entityMap, currentConversationId, 'ws');
                    
                    // Try to replace the full text first
                    if (dataStr.includes(textToCheck)) {
                        let modifiedData = dataStr.replace(textToCheck, result.cloakedText);
                        debugSummary('WebSocket send', 'replaced full text, ' + Object.keys(result.entityMap).length + ' item(s)');
                        
                        if (typeof data === 'string') {
                            return originalSendRef.call(this, modifiedData);
                        } else if (data instanceof ArrayBuffer) {
                            const encoder = new TextEncoder();
                            return originalSendRef.call(this, encoder.encode(modifiedData).buffer);
                        }
                    }
                    
                    // Strategy 2: Replace individual PII items in the data
                    let modifiedData = dataStr;
                    let hasChanges = false;
                    
                    let replaceCount = 0;
                    Object.keys(result.entityMap).forEach(token => {
                        const originalValue = result.entityMap[token];
                        if (dataStr.includes(originalValue)) {
                            modifiedData = modifiedData.split(originalValue).join(token);
                            hasChanges = true;
                            replaceCount++;
                        }
                    });
                    if (hasChanges) debugSummary('WebSocket send', 'replaced ' + replaceCount + ' PII item(s) in payload');
                    
                    if (hasChanges) {
                        if (typeof data === 'string') {
                            return originalSendRef.call(this, modifiedData);
                        } else if (data instanceof ArrayBuffer) {
                            const encoder = new TextEncoder();
                            return originalSendRef.call(this, encoder.encode(modifiedData).buffer);
                        }
                    }
                }
            }
            
            // Strategy 3: Scan the data itself for PII (fallback)
            const dataResult = anonymizeText(dataStr);
            if (dataResult && Object.keys(dataResult.entityMap).length > 0) {
                // Merge with existing entity map for this conversation
                currentEntityMap = { ...currentEntityMap, ...dataResult.entityMap };
                conversationEntityMaps.set(currentConversationId, currentEntityMap);
                appendAuditLog(dataResult.entityMap, currentConversationId, 'ws');
                
                let modifiedData = dataStr;
                Object.keys(dataResult.entityMap).forEach(token => {
                    const originalValue = dataResult.entityMap[token];
                    modifiedData = modifiedData.split(originalValue).join(token);
                });
                
                debugSummary('WebSocket send', 'scanned payload, anonymized ' + Object.keys(dataResult.entityMap).length + ' item(s)');
                
                if (typeof data === 'string') {
                    return originalSendRef.call(this, modifiedData);
                } else if (data instanceof ArrayBuffer) {
                    const encoder = new TextEncoder();
                    return originalSendRef.call(this, encoder.encode(modifiedData).buffer);
                }
            }
        }
        
        return originalSendRef.call(this, data);
    };
    
    // Update constructor to handle message restoration
    // NOTE: Primary restoration is via DOM scanning (MutationObserver + scanForResponses).
    // Modifying event.data below is best-effort only; it may not work in all browsers/envs.
    const OriginalWebSocketRef = window._Cloak_OriginalWebSocket;
    
    function CloakWebSocketWithRestore(url, protocols) {
        const ws = new OriginalWebSocketRef(url, protocols);
        ws._cloakUrl = url;
        
        // Best-effort: try to restore PII in the WebSocket message. If this fails or is unsupported,
        // DOM restoration (scanForResponses) remains the primary and reliable path.
        ws.addEventListener('message', function(event) {
            updateConversation();
            
            if (currentEntityMap && Object.keys(currentEntityMap).length > 0 && cloak) {
                let messageData = event.data;
                if (typeof messageData === 'string' && typeof cloak.deanonymize === 'function') {
                    return safeExecute(() => {
                        const restored = cloak.deanonymize(messageData, currentEntityMap);
                        if (restored !== messageData && restored) {
                            try {
                                Object.defineProperty(event, 'data', {
                                    value: restored,
                                    writable: false,
                                    configurable: true
                                });
                                debugSummary('WebSocket message', 'restored PII for conversation ' + currentConversationId);
                            } catch (e) {
                                // event.data is read-only in many environments; DOM restoration handles it.
                            }
                        }
                    }, 'Error restoring WebSocket message', null);
                }
            }
        });
        
        return ws;
    }
    
    // Copy WebSocket properties safely
    CloakWebSocketWithRestore.prototype = OriginalWebSocketRef.prototype;
    if (typeof OriginalWebSocketRef.CONNECTING !== 'undefined') {
        CloakWebSocketWithRestore.CONNECTING = OriginalWebSocketRef.CONNECTING;
    }
    if (typeof OriginalWebSocketRef.OPEN !== 'undefined') {
        CloakWebSocketWithRestore.OPEN = OriginalWebSocketRef.OPEN;
    }
    if (typeof OriginalWebSocketRef.CLOSING !== 'undefined') {
        CloakWebSocketWithRestore.CLOSING = OriginalWebSocketRef.CLOSING;
    }
    if (typeof OriginalWebSocketRef.CLOSED !== 'undefined') {
        CloakWebSocketWithRestore.CLOSED = OriginalWebSocketRef.CLOSED;
    }
    
    // Replace window.WebSocket
    window.WebSocket = CloakWebSocketWithRestore;
    
    debugLog('WebSocket interception logic attached');

    // ========================================
    // 10. EVENT HANDLERS (Enter, Send button)
    // ========================================
    
    function triggerSendAfterIntercept(textarea) {
        setTimeout(() => {
            const sendButton = getSendButton();
            if (sendButton) {
                sendButton.click();
            } else {
                const newEvent = new KeyboardEvent('keydown', {
                    key: 'Enter',
                    code: 'Enter',
                    keyCode: 13,
                    bubbles: true,
                    cancelable: true
                });
                textarea.dispatchEvent(newEvent);
            }
        }, 10);
    }
    
    function handleEnterKey(e) {
        if (e.key !== 'Enter' || e.shiftKey) return;
        if (!enabled) return;
        
        const textarea = findTextarea();
        if (!textarea) return;
        
        const currentText = getTextareaValue(textarea);
        if (!currentText || !currentText.trim()) return;
        
        lastKnownText = currentText;
        debugLog('Enter pressed, text:', currentText.substring(0, 50) + '...');
        
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        
        function doInterceptAndSend() {
            const didIntercept = interceptMessage(textarea);
            triggerSendAfterIntercept(textarea);
            if (!didIntercept) debugLog('No PII found, but tracking text for WebSocket');
        }
        
        if (!settingsReady) {
            if (!isExtensionContextValid()) return;
            chrome.storage.sync.get(['cloakEnabled', 'cloakSettings'], function(result) {
                if (!isExtensionContextValid()) return;
                if (!chrome.runtime.lastError) {
                    enabled = result.cloakEnabled !== false;
                    cloakSettings = result.cloakSettings || {};
                    if (cloak) cloak.updateSettings(null, null, null, cloakSettings, !!cloakSettings.paranoidMode);
                    settingsReady = true;
                }
                doInterceptAndSend();
            });
            return;
        }
        
        doInterceptAndSend();
    }

    function handleSendButton(e) {
        if (!enabled) return; // Don't intercept if disabled
        
        const textarea = findTextarea();
        if (!textarea) return;
        
        interceptMessage(textarea);
    }

    // ========================================
    // 11. RESPONSE RESTORATION (primary path for PII)
    // ========================================
    // We restore tokens to original PII in the DOM via MutationObserver + scanForResponses.
    // This is the main mechanism; WebSocket event.data modification is best-effort only.
    
    function restoreTextNode(textNode) {
        if (!textNode || !currentEntityMap || Object.keys(currentEntityMap).length === 0 || !cloak) {
            return false;
        }
        
        if (typeof cloak.deanonymize !== 'function') {
            return false;
        }
        
        const originalText = textNode.textContent;
        if (!originalText || originalText.length < 3) return false;
        
        // Check if text contains any tokens
        const hasToken = Object.keys(currentEntityMap).some(token => originalText.includes(token));
        if (!hasToken) return false;
        
        return safeExecute(() => {
            const restored = cloak.deanonymize(originalText, currentEntityMap);
            if (restored !== originalText && restored) {
                textNode.textContent = restored;
                return true;
            }
            return false;
        }, 'Error restoring text node', false);
    }

    const RESPONSE_SELECTORS = [
        '[data-message-author-role="assistant"]',
        '[data-role="assistant"]',
        '.markdown',
        '.prose',
        'div[class*="message"]',
        'div[class*="Message"]',
        'div[class*="response"]',
        'div[class*="Response"]',
        'article[class*="message"]',
        'main [class*="markdown"]'
    ];
    
    function isInResponseArea(node) {
        const el = node && node.nodeType === 1 ? node : (node && node.parentElement) || null;
        if (!el || !el.closest) return false;
        for (const sel of RESPONSE_SELECTORS) {
            try {
                if (el.matches && el.matches(sel)) return true;
                if (el.closest(sel)) return true;
            } catch (_) { /* invalid selector */ }
        }
        return false;
    }
    
    function scanForResponses() {
        if (!enabled || !currentEntityMap || Object.keys(currentEntityMap).length === 0 || !cloak) {
            return;
        }
        
        if (!document.body) {
            return;
        }
        
        let restoredCount = 0;
        
        for (const selector of RESPONSE_SELECTORS) {
            try {
                const elements = document.querySelectorAll(selector);
                elements.forEach(element => {
                    // Use TreeWalker to find and restore only text nodes (preserves formatting)
                    const walker = document.createTreeWalker(
                        element,
                        NodeFilter.SHOW_TEXT,
                        {
                            acceptNode: function(node) {
                                // Skip if parent is script, style, or already processed
                                const parent = node.parentElement;
                                if (!parent) return NodeFilter.FILTER_REJECT;
                                
                                const tagName = parent.tagName;
                                if (tagName === 'SCRIPT' || tagName === 'STYLE' || 
                                    tagName === 'NOSCRIPT' || parent.hasAttribute('data-cloak-skip')) {
                                    return NodeFilter.FILTER_REJECT;
                                }
                                
                                return NodeFilter.FILTER_ACCEPT;
                            }
                        },
                        false
                    );
                    
                    let textNode;
                    while (textNode = walker.nextNode()) {
                        if (restoreTextNode(textNode)) {
                            restoredCount++;
                        }
                    }
                });
            } catch (e) {
                // Ignore selector errors
            }
        }
        
        // Fallback: scan main/chat container only (narrower than full body)
        if (restoredCount === 0) {
            const fallbackRoot = document.querySelector('main') ||
                document.querySelector('[role="main"]') ||
                document.querySelector('[data-testid="conversation-panel"]') ||
                document.body;
            const allTextWalker = document.createTreeWalker(
                fallbackRoot,
                NodeFilter.SHOW_TEXT,
                {
                    acceptNode: function(node) {
                        const parent = node.parentElement;
                        if (!parent) return NodeFilter.FILTER_REJECT;
                        
                        const tagName = parent.tagName;
                        if (tagName === 'SCRIPT' || tagName === 'STYLE' || 
                            tagName === 'NOSCRIPT' || parent.hasAttribute('data-cloak-skip')) {
                            return NodeFilter.FILTER_REJECT;
                        }
                        
                        // Only process text nodes that are likely to be message content
                        // Skip very short text nodes (likely formatting/spacing)
                        if (node.textContent && node.textContent.trim().length < 3) {
                            return NodeFilter.FILTER_REJECT;
                        }
                        
                        return NodeFilter.FILTER_ACCEPT;
                    }
                },
                false
            );
            
            let textNode;
            while (textNode = allTextWalker.nextNode()) {
                if (restoreTextNode(textNode)) {
                    restoredCount++;
                }
            }
        }
        
        if (restoredCount > 0) {
            debugSummary('DOM restore', restoredCount + ' text node(s)');
        }
    }

    const debouncedScanForResponses = debounce(scanForResponses, 150);
    
    function observeResponses() {
        const observer = new MutationObserver(function(mutations) {
            let shouldScan = false;
            for (let i = 0; i < mutations.length; i++) {
                const m = mutations[i];
                if (m.type === 'characterData') {
                    if (isInResponseArea(m.target)) shouldScan = true;
                } else if (m.addedNodes && m.addedNodes.length > 0) {
                    for (let j = 0; j < m.addedNodes.length; j++) {
                        if (isInResponseArea(m.addedNodes[j]) || isInResponseArea(m.target)) {
                            shouldScan = true;
                            break;
                        }
                    }
                }
                if (shouldScan) break;
            }
            if (shouldScan) {
                debouncedScanForResponses();
            }
        });
        
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            characterData: true
        });
        
        const scanInterval = setInterval(scanForResponses, 1500);
        
        // Store interval IDs for potential cleanup (though they'll be cleared on page unload)
        window._Cloak_Intervals = window._Cloak_Intervals || [];
        window._Cloak_Intervals.push(scanInterval);
        window.addEventListener('beforeunload', function() {
            if (!window._Cloak_Intervals) return;
            window._Cloak_Intervals.forEach(function(id) {
                clearInterval(id);
            });
            window._Cloak_Intervals = [];
        }, { once: true });
        
        debugLog('Response restoration active');
    }

    // ========================================
    // 12. INIT (DOM ready, listeners, observeResponses)
    // ========================================
    
    let initAttempts = 0;
    const MAX_INIT_ATTEMPTS = 20; // 10 seconds max wait
    
    function init() {
        if (!cloak) {
            console.error('[Cloak] Cannot initialize: Cloak class not available');
            return;
        }
        
        const textarea = findTextarea();
        if (!textarea) {
            initAttempts++;
            if (initAttempts < MAX_INIT_ATTEMPTS) {
                setTimeout(init, 500);
            } else {
                console.warn('[Cloak] Textarea not found after', MAX_INIT_ATTEMPTS, 'attempts');
            }
            return;
        }
        
        // Set up event listeners
        document.addEventListener('keydown', handleEnterKey, true);
        document.addEventListener('click', function(e) {
            const button = e.target.closest('button');
            if (button && isSendButton(button)) {
                handleSendButton(e);
            }
        }, true);
        
        // Track typed text via events instead of a hot polling loop.
        const debouncedTrackText = debounce(function() {
            const active = document.activeElement;
            const target = active && (active.matches && (active.matches('textarea') || active.matches('[contenteditable="true"], [role="textbox"]')))
                ? active
                : findTextarea();
            if (target) {
                const currentText = getTextareaValue(target);
                if (currentText && currentText.trim() && currentText !== lastKnownText) {
                    lastKnownText = currentText;
                }
            }
        }, 120);
        document.addEventListener('input', debouncedTrackText, true);
        document.addEventListener('keyup', debouncedTrackText, true);
        
        // Start observing responses
        observeResponses();
        
        updatePageIndicator();
        debugLog('Extension ready');
    }

    // Start when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
