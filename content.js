/**
 * Cloak Content Script v1.0
 * Automatically anonymizes messages before sending to ChatGPT and restores PII in responses
 */

(function() {
    'use strict';

    // ========================================
    // DEBUG MODE - MUST BE FIRST!
    // ========================================
    
    let debugMode = false;
    
    // Debug logging function (defined early, before any calls)
    function debugLog(...args) {
        if (debugMode) {
            console.log('[Cloak]', ...args);
        }
    }
    
    // Load debug mode from storage (async, but function is defined)
    try {
        chrome.storage.sync.get(['debugMode'], function(result) {
            if (!chrome.runtime.lastError) {
                debugMode = result.debugMode === true;
            }
        });
    } catch (e) {
        // Chrome storage might not be available yet
    }

    // ========================================
    // WEBSOCKET INTERCEPTION - MUST BE SECOND!
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
    // INITIALIZATION
    // ========================================
    
    if (typeof Cloak === 'undefined') {
        console.error('[Cloak] Cloak class not found. Check manifest.json.');
        return;
    }
    
    // ========================================
    // ERROR HANDLING & RECOVERY
    // ========================================
    
    function safeExecute(fn, errorMsg, fallback = null) {
        try {
            return fn();
        } catch (error) {
            console.error('[Cloak]', errorMsg, error);
            if (fallback !== null) return fallback;
            return null;
        }
    }
    
    function updateStatistics(count) {
        if (!count || count === 0) return;
        
        chrome.storage.local.get(['cloakStats'], function(result) {
            const stats = result.cloakStats || { today: 0, total: 0, lastReset: null };
            const today = new Date().toDateString();
            
            if (stats.lastReset !== today) {
                stats.today = 0;
                stats.lastReset = today;
            }
            
            stats.today += count;
            stats.total += count;
            
            chrome.storage.local.set({ cloakStats: stats }, function() {
                if (chrome.runtime.lastError) {
                    console.error('[Cloak] Failed to update statistics:', chrome.runtime.lastError);
                }
            });
        });
    }
    
    function showNotification(message, type = 'info') {
        if (!document.body) {
            debugLog(message);
            return;
        }
        
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${type === 'error' ? '#fee2e2' : type === 'success' ? '#d1fae5' : '#f3f4f6'};
            color: ${type === 'error' ? '#dc2626' : type === 'success' ? '#059669' : '#1a1a1a'};
            padding: 12px 16px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 10000;
            font-size: 13px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            max-width: 300px;
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
    }
    
    // ========================================
    // INITIALIZATION WITH SETTINGS
    // ========================================
    
    let cloak = null;
    let cloakSettings = {};
    
    function initializeCloak() {
        try {
            // Initialize with default settings first
            cloak = new Cloak([], true, 'full', {});
            
            // Then load user settings asynchronously
            chrome.storage.sync.get(['cloakSettings'], function(result) {
                if (chrome.runtime.lastError) {
                    console.error('[Cloak] Failed to load settings:', chrome.runtime.lastError);
                    return;
                }
                
                cloakSettings = result.cloakSettings || {};
                if (cloak) {
                    cloak.updateSettings(null, null, null, cloakSettings);
                }
            });
            
            return cloak;
        } catch (e) {
            console.error('[Cloak] Failed to initialize Cloak:', e);
            return new Cloak();
        }
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

    // Load initial state from storage
    chrome.storage.sync.get(['cloakEnabled'], function(result) {
        enabled = result.cloakEnabled !== false; // Default to true if not set
        debugLog('Extension', enabled ? 'enabled' : 'disabled');
    });
    
    // Initialize conversation tracking
    updateConversation();
    
    // Watch for URL changes (conversation switches) - cleanup old conversations periodically
    let lastUrl = window.location.href;
    const urlCheckInterval = setInterval(function() {
        if (window.location.href !== lastUrl) {
            lastUrl = window.location.href;
            updateConversation();
        }
        
        // Cleanup old conversations (keep last 10)
        if (conversationEntityMaps.size > 10) {
            const conversations = Array.from(conversationEntityMaps.keys());
            const toRemove = conversations.slice(0, conversations.length - 10);
            toRemove.forEach(id => {
                if (id !== currentConversationId) {
                    conversationEntityMaps.delete(id);
                }
            });
        }
    }, 500);

    // Listen for messages from popup
    chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
        if (request.action === 'toggle') {
            enabled = request.enabled;
            debugLog('Extension', enabled ? 'enabled' : 'disabled');
            showNotification(enabled ? 'Cloak protection enabled' : 'Cloak protection disabled', 'success');
            sendResponse({ success: true });
        } else if (request.action === 'settingsUpdated') {
            cloakSettings = request.settings || {};
            if (cloak) {
                cloak.updateSettings(null, null, null, cloakSettings);
                debugLog('Settings updated');
                showNotification('Settings updated', 'success');
            }
            sendResponse({ success: true });
        } else if (request.action === 'debugModeUpdated') {
            debugMode = request.enabled === true;
            debugLog('Debug mode', debugMode ? 'enabled' : 'disabled');
            sendResponse({ success: true });
        }
        return true;
    });

    // Listen for storage changes (in case user changes in another tab)
    chrome.storage.onChanged.addListener(function(changes, areaName) {
        if (areaName === 'sync') {
            if (changes.cloakEnabled) {
                enabled = changes.cloakEnabled.newValue !== false;
                debugLog('Extension', enabled ? 'enabled' : 'disabled', '(from storage change)');
            }
            if (changes.cloakSettings) {
                cloakSettings = changes.cloakSettings.newValue || {};
                if (cloak) {
                    cloak.updateSettings(null, null, null, cloakSettings);
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
    // TEXTAREA INTERCEPTION
    // ========================================
    
    function findTextarea() {
        return document.querySelector('div[contenteditable="true"]') || 
               document.querySelector('textarea');
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
    // ANONYMIZATION
    // ========================================
    
    function anonymizeText(text) {
        if (!text || !text.trim() || !cloak) return null;
        
        return safeExecute(() => {
            if (typeof cloak.anonymize !== 'function') {
                console.error('[Cloak] Cloak.anonymize is not a function');
                return null;
            }
            
            const result = cloak.anonymize(text);
            if (!result || !result.entityMap || Object.keys(result.entityMap).length === 0) {
                return null;
            }
            
            // Update statistics
            const count = Object.keys(result.entityMap).length;
            updateStatistics(count);
            
            return result;
        }, 'Error during anonymization', null);
    }

    // ========================================
    // MESSAGE INTERCEPTION
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
        debugLog('Anonymized:', result.cloakedText);
        debugLog('Conversation:', currentConversationId, 'Total tokens:', Object.keys(currentEntityMap).length);
        
        // Show user feedback
        if (tokenCount > 0) {
            showNotification(`${tokenCount} PII item${tokenCount > 1 ? 's' : ''} anonymized`, 'success');
        }
        
        return true;
    }

    // ========================================
    // WEBSOCKET INTERCEPTION LOGIC
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
                    
                    // Try to replace the full text first
                    if (dataStr.includes(textToCheck)) {
                        let modifiedData = dataStr.replace(textToCheck, result.cloakedText);
                        debugLog('WebSocket: Replaced full text');
                        debugLog('Original:', textToCheck.substring(0, 100));
                        debugLog('Anonymized:', result.cloakedText.substring(0, 100));
                        
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
                    
                    Object.keys(result.entityMap).forEach(token => {
                        const originalValue = result.entityMap[token];
                        if (dataStr.includes(originalValue)) {
                            modifiedData = modifiedData.split(originalValue).join(token);
                            hasChanges = true;
                            debugLog('WebSocket: Replaced', originalValue, 'with', token);
                        }
                    });
                    
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
                
                let modifiedData = dataStr;
                Object.keys(dataResult.entityMap).forEach(token => {
                    const originalValue = dataResult.entityMap[token];
                    modifiedData = modifiedData.split(originalValue).join(token);
                });
                
                debugLog('WebSocket: Found and anonymized PII directly in data');
                
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
    const OriginalWebSocketRef = window._Cloak_OriginalWebSocket;
    
    function CloakWebSocketWithRestore(url, protocols) {
        const ws = new OriginalWebSocketRef(url, protocols);
        ws._cloakUrl = url;
        
        // Intercept incoming messages for PII restoration
        ws.addEventListener('message', function(event) {
            // Update conversation tracking
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
                                debugLog('WebSocket: Restored PII in message for conversation:', currentConversationId);
                            } catch (e) {
                                // Can't modify event.data, that's okay - will restore via DOM scanning
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
    // EVENT HANDLERS
    // ========================================
    
    function handleEnterKey(e) {
        if (e.key !== 'Enter' || e.shiftKey) return;
        if (!enabled) return; // Don't intercept if disabled
        
        const textarea = findTextarea();
        if (!textarea) return;
        
        // Get text immediately before preventing default
        const currentText = getTextareaValue(textarea);
        if (!currentText || !currentText.trim()) return;
        
        // Update lastKnownText immediately
        lastKnownText = currentText;
        debugLog('Enter pressed, text:', currentText.substring(0, 50) + '...');
        
        // Prevent default to stop ChatGPT from reading original text
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        
        // Anonymize before ChatGPT reads it
        if (interceptMessage(textarea)) {
            // Manually trigger send after a short delay
            setTimeout(() => {
                const sendButton = document.querySelector('button[data-testid="send-button"]') ||
                                 document.querySelector('button[aria-label*="Send"]') ||
                                 textarea.parentElement?.querySelector('button');
                
                if (sendButton) {
                    sendButton.click();
                } else {
                    // Fallback: dispatch Enter event
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
        } else {
            // No PII found, but still update lastKnownText for WebSocket
            debugLog('No PII found, but tracking text for WebSocket');
        }
    }

    function handleSendButton(e) {
        if (!enabled) return; // Don't intercept if disabled
        
        const textarea = findTextarea();
        if (!textarea) return;
        
        interceptMessage(textarea);
    }

    // ========================================
    // RESPONSE RESTORATION
    // ========================================
    
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

    function scanForResponses() {
        if (!enabled || !currentEntityMap || Object.keys(currentEntityMap).length === 0 || !cloak) {
            return;
        }
        
        if (!document.body) {
            return;
        }
        
        // Find all message containers (ChatGPT uses various selectors)
        const selectors = [
            '[data-message-author-role="assistant"]',
            '.markdown',
            'div[class*="message"]',
            'div[class*="Message"]',
            'div[class*="response"]',
            'div[class*="Response"]'
        ];
        
        let restoredCount = 0;
        
        selectors.forEach(selector => {
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
        });
        
        // Also scan all text nodes in the document (for streaming responses)
        if (restoredCount === 0) {
            const allTextWalker = document.createTreeWalker(
                document.body,
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
            debugLog('Restored PII in', restoredCount, 'text node(s)');
        }
    }

    function observeResponses() {
        // Use MutationObserver for immediate updates
        const observer = new MutationObserver(function(mutations) {
            let shouldScan = false;
            
            mutations.forEach(function(mutation) {
                if (mutation.addedNodes.length > 0) {
                    shouldScan = true;
                }
                
                // Also check for text changes (streaming responses)
                if (mutation.type === 'characterData' || mutation.type === 'childList') {
                    shouldScan = true;
                }
            });
            
            if (shouldScan) {
                setTimeout(scanForResponses, 100);
            }
        });
        
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            characterData: true
        });
        
        // Also periodically scan for responses (catches streaming updates)
        const scanInterval = setInterval(scanForResponses, 500);
        
        // Store interval IDs for potential cleanup (though they'll be cleared on page unload)
        window._Cloak_Intervals = window._Cloak_Intervals || [];
        window._Cloak_Intervals.push(scanInterval);
        
        debugLog('Response restoration active');
    }

    // ========================================
    // INITIALIZATION
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
            if (button && (button.getAttribute('data-testid') === 'send-button' || 
                          button.getAttribute('aria-label')?.includes('Send'))) {
                handleSendButton(e);
            }
        }, true);
        
        // Track textarea changes and conversation switches (debounced for performance)
        const debouncedTrack = debounce(function() {
            updateConversation();
            
            const textarea = findTextarea();
            if (textarea) {
                const currentText = getTextareaValue(textarea);
                if (currentText && currentText.trim() && currentText !== lastKnownText) {
                    lastKnownText = currentText;
                }
            }
        }, 200);
        
        const trackInterval = setInterval(debouncedTrack, 200);
        window._Cloak_Intervals = window._Cloak_Intervals || [];
        window._Cloak_Intervals.push(trackInterval);
        
        // Start observing responses
        observeResponses();
        
        debugLog('Extension ready');
    }

    // Start when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
