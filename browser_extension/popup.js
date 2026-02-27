document.addEventListener('DOMContentLoaded', function() {
    const toggleSwitch = document.getElementById('toggle');
    const toggleContainer = document.getElementById('toggleContainer');
    const statusText = document.getElementById('statusText');
    const piiListContainer = document.getElementById('piiListContainer');
    const settingsHeader = document.getElementById('settingsHeader');
    const errorMessage = document.getElementById('errorMessage');
    const successMessage = document.getElementById('successMessage');
    const debugToggle = document.getElementById('debugToggle');
    const contextWarning = document.getElementById('contextWarning');
    const settingsMeta = document.getElementById('settingsMeta');
    const PII_TYPES = (typeof window !== 'undefined' && window.PII_TYPES) || [];
    const DEFAULT_SETTINGS = {
        notificationLevel: 'all',
        notificationStyle: 'default',
        showPageIndicator: true,
        paranoidMode: false,
        auditLogEnabled: true,
        skipCodeBlocks: false
    };
    
    function showMessage(element, text, duration = 3000) {
        element.textContent = text;
        element.classList.add('show');
        setTimeout(() => {
            element.classList.remove('show');
        }, duration);
    }
    
    function showError(text) {
        showMessage(errorMessage, text);
    }
    
    function showSuccess(text) {
        showMessage(successMessage, text);
    }
    
    function setSettingsMeta(text) {
        if (settingsMeta) settingsMeta.textContent = text || 'Last updated: —';
    }
    
    function markSettingsUpdatedNow() {
        const now = new Date();
        setSettingsMeta('Last updated: ' + now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    }
    
    function showContextWarningIfNeeded() {
        if (!contextWarning) return;
        chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
            const tab = tabs && tabs[0];
            if (!tab || !tab.id) {
                contextWarning.classList.remove('show');
                return;
            }
            if (tab.url && !/^https:\/\/(chatgpt\.com|chat\.openai\.com)\//.test(tab.url)) {
                contextWarning.classList.remove('show');
                return;
            }
            chrome.tabs.sendMessage(tab.id, { action: 'ping' }, function(response) {
                if (chrome.runtime.lastError || !response || response.success !== true) {
                    contextWarning.classList.add('show');
                } else {
                    contextWarning.classList.remove('show');
                }
            });
        });
    }
    
    function bindToggleKeyboard(el) {
        if (!el) return;
        if (el.dataset && el.dataset.keyboardBound === '1') return;
        if (el.dataset) el.dataset.keyboardBound = '1';
        el.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                el.click();
            }
        });
    }
    
    function loadDebugToggle() {
        if (!debugToggle) {
            console.error('Debug toggle element not found');
            return;
        }
        bindToggleKeyboard(debugToggle);
        
        // Load debug mode state
        chrome.storage.sync.get(['debugMode'], function(result) {
            if (chrome.runtime.lastError) {
                console.error('Failed to load debug mode:', chrome.runtime.lastError);
                return;
            }
            
            const debugEnabled = result.debugMode === true;
            if (debugEnabled) {
                debugToggle.classList.add('enabled');
            } else {
                debugToggle.classList.remove('enabled');
            }
        });
        
        // Add click handler
        debugToggle.addEventListener('click', function(e) {
            e.stopPropagation();
            const newState = !debugToggle.classList.contains('enabled');
            debugToggle.classList.toggle('enabled', newState);
            
            chrome.storage.sync.set({ debugMode: newState }, function() {
                if (chrome.runtime.lastError) {
                    console.error('Failed to save debug mode:', chrome.runtime.lastError);
                    debugToggle.classList.toggle('enabled', !newState);
                    return;
                }
                
                chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
                    if (tabs[0]) {
                        chrome.tabs.sendMessage(tabs[0].id, {
                            action: 'debugModeUpdated',
                            enabled: newState
                        }).catch(() => {});
                    }
                });
            });
        });
    }
    
    function loadSettings() {
        chrome.storage.sync.get(['cloakSettings'], function(result) {
            if (chrome.runtime.lastError) {
                console.error('Failed to load settings:', chrome.runtime.lastError);
                return;
            }
            
            let settings = result.cloakSettings || {};
            setSettingsMeta('Last updated: loaded');
            
            function notifySettingsUpdated(nextSettings) {
                chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
                    if (tabs[0]) {
                        chrome.tabs.sendMessage(tabs[0].id, {
                            action: 'settingsUpdated',
                            settings: nextSettings
                        }).catch(() => {});
                    }
                });
            }
            
            function renderPiiList(settings) {
                if (!piiListContainer) return;
                piiListContainer.innerHTML = '';
                const qEl = document.getElementById('piiSearch');
                const query = ((qEl && qEl.value) || '').trim().toLowerCase();
                const categoryOrder = ['Contact', 'Financial', 'Identifiers', 'Other'];
                const byCategory = {};
                PII_TYPES.forEach(p => {
                    if (query && p.label.toLowerCase().indexOf(query) === -1 && p.key.toLowerCase().indexOf(query) === -1) return;
                    const cat = p.category || 'Other';
                    if (!byCategory[cat]) byCategory[cat] = [];
                    byCategory[cat].push(p);
                });
                categoryOrder.forEach(cat => {
                    const items = byCategory[cat];
                    if (!items || items.length === 0) return;
                    const section = document.createElement('div');
                    section.className = 'pii-category';
                    section.setAttribute('role', 'group');
                    section.setAttribute('aria-label', cat);
                    const title = document.createElement('div');
                    title.className = 'pii-category-title';
                    title.textContent = cat;
                    section.appendChild(title);
                    items.forEach(piiType => {
                        const enabled = settings[piiType.key] !== false;
                        const row = document.createElement('div');
                        row.className = 'pii-item';
                        row.setAttribute('role', 'listitem');
                        const label = document.createElement('span');
                        label.className = 'setting-label';
                        label.textContent = piiType.label;
                        const toggle = document.createElement('div');
                        toggle.className = 'setting-toggle' + (enabled ? ' enabled' : '');
                        toggle.dataset.type = piiType.key;
                        toggle.setAttribute('tabindex', '0');
                        toggle.setAttribute('role', 'switch');
                        toggle.setAttribute('aria-checked', enabled ? 'true' : 'false');
                        toggle.setAttribute('aria-label', piiType.label);
                        function applyToggle(e) {
                            e.stopPropagation();
                            const newState = !toggle.classList.contains('enabled');
                            toggle.classList.toggle('enabled', newState);
                            toggle.setAttribute('aria-checked', newState ? 'true' : 'false');
                            chrome.storage.sync.get(['cloakSettings'], function(res) {
                                if (chrome.runtime.lastError) {
                                    toggle.classList.toggle('enabled', !newState);
                                    toggle.setAttribute('aria-checked', (!newState).toString());
                                    return;
                                }
                                const next = res.cloakSettings || {};
                                next[piiType.key] = newState;
                                chrome.storage.sync.set({ cloakSettings: next }, function() {
                                    if (chrome.runtime.lastError) {
                                        toggle.classList.toggle('enabled', !newState);
                                        toggle.setAttribute('aria-checked', (!newState).toString());
                                        return;
                                    }
                                    settings = next;
                                    markSettingsUpdatedNow();
                                    notifySettingsUpdated(next);
                                });
                            });
                        }
                        toggle.addEventListener('click', applyToggle);
                        toggle.addEventListener('keydown', function(e) {
                            if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                applyToggle(e);
                            }
                        });
                        row.addEventListener('click', function(e) {
                            if (e.target !== toggle) {
                                applyToggle(e);
                            }
                        });
                        row.appendChild(label);
                        row.appendChild(toggle);
                        section.appendChild(row);
                    });
                    piiListContainer.appendChild(section);
                });
            }
            
            renderPiiList(settings);
            const piiSearch = document.getElementById('piiSearch');
            if (piiSearch) {
                piiSearch.oninput = function() { renderPiiList(settings); };
            }
            
            const piiAllOn = document.getElementById('piiAllOn');
            const piiAllOff = document.getElementById('piiAllOff');
            if (piiAllOn) {
                piiAllOn.onclick = function() {
                    const next = { ...settings };
                    PII_TYPES.forEach(p => { next[p.key] = true; });
                    chrome.storage.sync.set({ cloakSettings: next }, function() {
                        if (chrome.runtime.lastError) return;
                        settings = next;
                        renderPiiList(next);
                        markSettingsUpdatedNow();
                        notifySettingsUpdated(next);
                    });
                };
            }
            if (piiAllOff) {
                piiAllOff.onclick = function() {
                    const next = { ...settings };
                    PII_TYPES.forEach(p => { next[p.key] = false; });
                    chrome.storage.sync.set({ cloakSettings: next }, function() {
                        if (chrome.runtime.lastError) return;
                        settings = next;
                        renderPiiList(next);
                        markSettingsUpdatedNow();
                        notifySettingsUpdated(next);
                    });
                };
            }
            
            const notificationLevelSelect = document.getElementById('notificationLevel');
            if (notificationLevelSelect) {
                notificationLevelSelect.value = settings.notificationLevel || 'all';
                notificationLevelSelect.onchange = function() {
                    const level = notificationLevelSelect.value;
                    const nextSettings = { ...settings, notificationLevel: level };
                    chrome.storage.sync.set({ cloakSettings: nextSettings }, function() {
                        if (chrome.runtime.lastError) return;
                        settings = nextSettings;
                        markSettingsUpdatedNow();
                        notifySettingsUpdated(nextSettings);
                    });
                };
            }
            const notificationStyleSelect = document.getElementById('notificationStyle');
            if (notificationStyleSelect) {
                notificationStyleSelect.value = settings.notificationStyle || 'default';
                notificationStyleSelect.onchange = function() {
                    const style = notificationStyleSelect.value;
                    const nextSettings = { ...settings, notificationStyle: style };
                    chrome.storage.sync.set({ cloakSettings: nextSettings }, function() {
                        if (chrome.runtime.lastError) return;
                        settings = nextSettings;
                        markSettingsUpdatedNow();
                        notifySettingsUpdated(nextSettings);
                    });
                };
            }
            const pageIndicatorToggle = document.getElementById('pageIndicatorToggle');
            if (pageIndicatorToggle) {
                bindToggleKeyboard(pageIndicatorToggle);
                pageIndicatorToggle.classList.toggle('enabled', settings.showPageIndicator !== false);
                pageIndicatorToggle.onclick = function(e) {
                    e.stopPropagation();
                    const next = !pageIndicatorToggle.classList.contains('enabled');
                    pageIndicatorToggle.classList.toggle('enabled', next);
                    const nextSettings = { ...settings, showPageIndicator: next };
                    chrome.storage.sync.set({ cloakSettings: nextSettings }, function() {
                        if (chrome.runtime.lastError) {
                            pageIndicatorToggle.classList.toggle('enabled', !next);
                            return;
                        }
                        settings = nextSettings;
                        markSettingsUpdatedNow();
                        notifySettingsUpdated(nextSettings);
                    });
                };
            }
            const paranoidToggle = document.getElementById('paranoidToggle');
            const paranoidIndicator = document.getElementById('paranoidIndicator');
            if (paranoidToggle) {
                bindToggleKeyboard(paranoidToggle);
                const paranoidOn = settings.paranoidMode === true;
                paranoidToggle.classList.toggle('enabled', paranoidOn);
                if (paranoidIndicator) paranoidIndicator.classList.toggle('visible', paranoidOn);
                paranoidToggle.onclick = function(e) {
                    e.stopPropagation();
                    const next = !paranoidToggle.classList.contains('enabled');
                    paranoidToggle.classList.toggle('enabled', next);
                    if (paranoidIndicator) paranoidIndicator.classList.toggle('visible', next);
                    const nextSettings = { ...settings, paranoidMode: next };
                    chrome.storage.sync.set({ cloakSettings: nextSettings }, function() {
                        if (chrome.runtime.lastError) {
                            paranoidToggle.classList.toggle('enabled', !next);
                            if (paranoidIndicator) paranoidIndicator.classList.toggle('visible', !next);
                            return;
                        }
                        settings = nextSettings;
                        markSettingsUpdatedNow();
                        notifySettingsUpdated(nextSettings);
                    });
                };
            }
            const auditLogToggle = document.getElementById('auditLogToggle');
            if (auditLogToggle) {
                bindToggleKeyboard(auditLogToggle);
                auditLogToggle.classList.toggle('enabled', settings.auditLogEnabled !== false);
                auditLogToggle.onclick = function(e) {
                    e.stopPropagation();
                    const next = !auditLogToggle.classList.contains('enabled');
                    auditLogToggle.classList.toggle('enabled', next);
                    const nextSettings = { ...settings, auditLogEnabled: next };
                    chrome.storage.sync.set({ cloakSettings: nextSettings }, function() {
                        if (chrome.runtime.lastError) {
                            auditLogToggle.classList.toggle('enabled', !next);
                            return;
                        }
                        settings = nextSettings;
                        markSettingsUpdatedNow();
                        notifySettingsUpdated(nextSettings);
                    });
                };
            }
            const skipCodeBlocksToggle = document.getElementById('skipCodeBlocksToggle');
            if (skipCodeBlocksToggle) {
                bindToggleKeyboard(skipCodeBlocksToggle);
                skipCodeBlocksToggle.classList.toggle('enabled', settings.skipCodeBlocks === true);
                skipCodeBlocksToggle.onclick = function(e) {
                    e.stopPropagation();
                    const next = !skipCodeBlocksToggle.classList.contains('enabled');
                    skipCodeBlocksToggle.classList.toggle('enabled', next);
                    const nextSettings = { ...settings, skipCodeBlocks: next };
                    chrome.storage.sync.set({ cloakSettings: nextSettings }, function() {
                        if (chrome.runtime.lastError) {
                            skipCodeBlocksToggle.classList.toggle('enabled', !next);
                            return;
                        }
                        settings = nextSettings;
                        markSettingsUpdatedNow();
                        notifySettingsUpdated(nextSettings);
                    });
                };
            }
        });
    }
    
    function loadSavedState() {
        chrome.storage.sync.get(['cloakEnabled'], function(result) {
            if (chrome.runtime.lastError) {
                console.error('Failed to load state:', chrome.runtime.lastError);
                updateUI(true); // Default to enabled on error
                return;
            }
            
            const enabled = result.cloakEnabled !== false;
            updateUI(enabled);
        });
    }
    
    function updateUI(enabled) {
        const statusPill = document.getElementById('statusPill');
        if (enabled) {
            toggleSwitch.classList.add('enabled');
            statusText.textContent = 'Protection is active';
            statusText.classList.remove('disabled');
            if (toggleContainer) toggleContainer.classList.add('enabled');
            if (statusPill) {
                statusPill.textContent = 'Active';
                statusPill.classList.remove('disabled');
            }
        } else {
            toggleSwitch.classList.remove('enabled');
            statusText.textContent = 'Protection is disabled';
            statusText.classList.add('disabled');
            if (toggleContainer) toggleContainer.classList.remove('enabled');
            if (statusPill) {
                statusPill.textContent = 'Off';
                statusPill.classList.add('disabled');
            }
        }
        if (toggleContainer) {
            toggleContainer.setAttribute('aria-checked', enabled ? 'true' : 'false');
            toggleContainer.setAttribute('aria-label', enabled ? 'Protection enabled' : 'Protection disabled');
        }
    }
    
    toggleContainer.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggleContainer.click();
        }
    });
    
    toggleContainer.addEventListener('click', function() {
        chrome.storage.sync.get(['cloakEnabled'], function(result) {
            if (chrome.runtime.lastError) {
                console.error('Failed to get state:', chrome.runtime.lastError);
                return;
            }
            
            const currentState = result.cloakEnabled !== false;
            const newState = !currentState;
            
            chrome.storage.sync.set({ cloakEnabled: newState }, function() {
                if (chrome.runtime.lastError) {
                    console.error('Failed to save state:', chrome.runtime.lastError);
                    showError('Failed to save settings');
                    return;
                }
                
                updateUI(newState);
                
                chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
                    if (tabs[0]) {
                        chrome.tabs.sendMessage(tabs[0].id, {
                            action: 'toggle',
                            enabled: newState
                        }).catch(function(error) {
                            // Content script might not be loaded, that's okay
                            console.log('Could not send message to content script:', error);
                        });
                    }
                });
            });
        });
    });
    
    // Settings collapse/expand
    let settingsCollapsed = true;
    
    function updateSettingsHeaderA11y() {
        if (settingsHeader) {
            settingsHeader.setAttribute('aria-expanded', !settingsCollapsed);
        }
    }
    
    chrome.storage.local.get(['settingsCollapsed'], function(result) {
        settingsCollapsed = result.settingsCollapsed !== false;
        if (settingsCollapsed) {
            settingsHeader.classList.add('collapsed');
        }
        updateSettingsHeaderA11y();
    });
    
    settingsHeader.addEventListener('click', function() {
        settingsCollapsed = !settingsCollapsed;
        settingsHeader.classList.toggle('collapsed', settingsCollapsed);
        updateSettingsHeaderA11y();
        chrome.storage.local.set({ settingsCollapsed: settingsCollapsed });
    });
    
    settingsHeader.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            settingsHeader.click();
        }
    });
    
    function loadActivityStatus() {
        const el = document.getElementById('statsText');
        if (!el) return;
        chrome.storage.sync.get(['cloakSettings'], function(syncResult) {
            if (chrome.runtime.lastError) return;
            const settings = syncResult.cloakSettings || {};
            const auditEnabled = settings.auditLogEnabled !== false;
            if (!auditEnabled) {
                el.textContent = 'Activity tracking off (enable Audit log in Settings)';
                return;
            }
            chrome.storage.local.get(['cloakAuditLog'], function(result) {
                if (chrome.runtime.lastError) return;
                const log = Array.isArray(result.cloakAuditLog) ? result.cloakAuditLog : [];
                if (log.length === 0) {
                    el.textContent = 'No anonymization activity yet';
                    return;
                }
                const last = log[log.length - 1] || {};
                const ago = formatTimeAgo(last.ts);
                el.textContent = ago ? ('Last anonymization: ' + ago) : 'Anonymization activity available';
            });
        });
    }
    
    function setupExportButtons() {
        const exportConversationBtn = document.getElementById('exportConversationBtn');
        if (exportConversationBtn) {
            exportConversationBtn.addEventListener('click', function() {
                exportConversationBtn.disabled = true;
                chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
                    if (!tabs[0]) {
                        showError('No active tab.');
                        exportConversationBtn.disabled = false;
                        return;
                    }
                    chrome.tabs.sendMessage(tabs[0].id, { action: 'exportConversation', format: 'json' }, function(response) {
                        exportConversationBtn.disabled = false;
                        if (chrome.runtime.lastError) {
                            showError('Open a ChatGPT conversation first.');
                            return;
                        }
                        if (response && response.success) {
                            showSuccess('Export started');
                        } else {
                            showError((response && response.error) || 'Export failed.');
                        }
                    });
                });
            });
        }
        function runAuditExport(format, range) {
            const rangeEl = document.getElementById('auditLogRange');
            const r = (rangeEl && rangeEl.value) || range || 'all';
            const jsonBtn = document.getElementById('exportAuditLogJsonBtn');
            const csvBtn = document.getElementById('exportAuditLogCsvBtn');
            if (jsonBtn) jsonBtn.disabled = true;
            if (csvBtn) csvBtn.disabled = true;
            chrome.runtime.sendMessage({ action: 'downloadAuditLog', format: format, range: r }, function(response) {
                if (jsonBtn) jsonBtn.disabled = false;
                if (csvBtn) csvBtn.disabled = false;
                if (chrome.runtime.lastError) {
                    showError('Export failed. Try reloading the extension.');
                    return;
                }
                if (response && response.success) {
                    showSuccess('Audit log exported');
                } else {
                    showError((response && response.error) || 'Export failed.');
                }
            });
        }
        const exportAuditLogJsonBtn = document.getElementById('exportAuditLogJsonBtn');
        const exportAuditLogCsvBtn = document.getElementById('exportAuditLogCsvBtn');
        if (exportAuditLogJsonBtn) {
            exportAuditLogJsonBtn.addEventListener('click', function() {
                chrome.storage.local.get(['cloakAuditLog'], function(result) {
                    const log = Array.isArray(result.cloakAuditLog) ? result.cloakAuditLog : [];
                    if (log.length === 0) {
                        showError('Audit log is empty. Send a message with PII on ChatGPT to record entries.');
                        return;
                    }
                    runAuditExport('json');
                });
            });
        }
        if (exportAuditLogCsvBtn) {
            exportAuditLogCsvBtn.addEventListener('click', function() {
                chrome.storage.local.get(['cloakAuditLog'], function(result) {
                    const log = Array.isArray(result.cloakAuditLog) ? result.cloakAuditLog : [];
                    if (log.length === 0) {
                        showError('Audit log is empty. Send a message with PII on ChatGPT to record entries.');
                        return;
                    }
                    runAuditExport('csv');
                });
            });
        }
        const clearAuditLogBtn = document.getElementById('clearAuditLogBtn');
        if (clearAuditLogBtn) {
            clearAuditLogBtn.addEventListener('click', function() {
                if (!confirm('Clear all audit log entries? This cannot be undone.')) return;
                chrome.runtime.sendMessage({ action: 'clearAuditLog' }, function(response) {
                    if (chrome.runtime.lastError) {
                        showError('Failed to clear audit log.');
                        return;
                    }
                    if (response && response.success) {
                        showSuccess('Audit log cleared');
                        loadAuditSummary();
                    } else {
                        showError((response && response.error) || 'Failed to clear audit log.');
                    }
                });
            });
        }
    }
    
    function setupQolButtons() {
        const resetSettingsBtn = document.getElementById('resetSettingsBtn');
        if (resetSettingsBtn) {
            resetSettingsBtn.addEventListener('click', function() {
                if (!confirm('Reset Cloak settings to defaults?')) return;
                chrome.storage.sync.set({ cloakSettings: { ...DEFAULT_SETTINGS } }, function() {
                    if (chrome.runtime.lastError) {
                        showError('Failed to reset settings.');
                        return;
                    }
                    markSettingsUpdatedNow();
                    loadSettings();
                    showSuccess('Settings reset');
                    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
                        if (tabs[0]) {
                            chrome.tabs.sendMessage(tabs[0].id, { action: 'settingsUpdated', settings: { ...DEFAULT_SETTINGS } }).catch(() => {});
                        }
                    });
                });
            });
        }
        
        const runSelfTestBtn = document.getElementById('runSelfTestBtn');
        if (runSelfTestBtn) {
            runSelfTestBtn.addEventListener('click', function() {
                try {
                    if (typeof Cloak === 'undefined') {
                        showError('Self-test unavailable.');
                        return;
                    }
                    const tester = new Cloak([], true, {}, false);
                    const sample = 'Email me at qa@example.com and call 555-123-4567';
                    const result = tester.anonymize(sample);
                    const count = result && result.entityMap ? Object.keys(result.entityMap).length : 0;
                    if (count >= 2) {
                        showSuccess('Self-test passed (' + count + ' items detected)');
                    } else {
                        showError('Self-test failed. Check settings.');
                    }
                } catch (_) {
                    showError('Self-test failed.');
                }
            });
        }
    }
    
    function updateExportAvailability() {
        const exportConversationBtn = document.getElementById('exportConversationBtn');
        if (!exportConversationBtn) return;
        chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
            const tab = tabs && tabs[0];
            if (!tab || !tab.id) {
                exportConversationBtn.disabled = true;
                exportConversationBtn.title = 'Open ChatGPT to enable conversation export';
                return;
            }
            if (tab.url && !/^https:\/\/(chatgpt\.com|chat\.openai\.com)\//.test(tab.url)) {
                exportConversationBtn.disabled = true;
                exportConversationBtn.title = 'Open ChatGPT to enable conversation export';
                return;
            }
            chrome.tabs.sendMessage(tab.id, { action: 'ping' }, function(response) {
                const ok = !!(response && response.success === true && !chrome.runtime.lastError);
                exportConversationBtn.disabled = !ok;
                exportConversationBtn.title = ok ? 'Export current conversation with PII redacted' : 'Open ChatGPT to enable conversation export';
            });
        });
    }
    
    function loadAuditSummary() {
        const el = document.getElementById('auditLogSummary');
        if (!el) return;
        chrome.runtime.sendMessage({ action: 'getAuditLogSummary' }, function(response) {
            if (chrome.runtime.lastError || !response || response.success === false) {
                el.textContent = 'Unable to load summary.';
                return;
            }
            const count = (response && response.count) || 0;
            const last24h = (response && response.last24h) || 0;
            const lastTs = response && response.lastTs;
            const lastTotal = response && response.lastTotal;
            let text = count === 0
                ? 'No entries yet. Send a message with PII on ChatGPT to record.'
                : count + ' entr' + (count === 1 ? 'y' : 'ies') + ' (last 24h: ' + last24h + ')';
            if (lastTs && lastTotal != null) {
                const ago = formatTimeAgo(lastTs);
                text += '. Last: ' + ago + ' — ' + lastTotal + ' item' + (lastTotal !== 1 ? 's' : '') + '.';
            }
            el.textContent = text;
        });
    }
    
    function formatTimeAgo(iso) {
        try {
            const d = new Date(iso);
            const now = new Date();
            const s = Math.floor((now - d) / 1000);
            if (s < 60) return 'just now';
            if (s < 3600) return Math.floor(s / 60) + ' min ago';
            if (s < 86400) return Math.floor(s / 3600) + ' h ago';
            if (s < 604800) return Math.floor(s / 86400) + ' day' + (s >= 172800 ? 's' : '') + ' ago';
            return d.toLocaleDateString();
        } catch (_) {
            return '';
        }
    }
    
    chrome.storage.onChanged.addListener(function(changes, areaName) {
        if (areaName === 'local' && changes.cloakAuditLog) {
            loadActivityStatus();
        }
        if (areaName === 'sync' && (changes.cloakSettings || changes.cloakEnabled)) {
            loadSettings();
            loadSavedState();
            loadActivityStatus();
        }
    });
    
    loadSettings();
    loadSavedState();
    loadDebugToggle();
    loadActivityStatus();
    loadAuditSummary();
    setupExportButtons();
    setupQolButtons();
    updateExportAvailability();
    showContextWarningIfNeeded();
    document.addEventListener('visibilitychange', function() {
        if (!document.hidden) {
            updateExportAvailability();
            showContextWarningIfNeeded();
        }
    });
});
