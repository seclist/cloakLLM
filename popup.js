document.addEventListener('DOMContentLoaded', function() {
    const toggleSwitch = document.getElementById('toggle');
    const toggleContainer = document.getElementById('toggleContainer');
    const statusText = document.getElementById('statusText');
    const settingsList = document.getElementById('settingsList');
    const settingsHeader = document.getElementById('settingsHeader');
    const errorMessage = document.getElementById('errorMessage');
    const successMessage = document.getElementById('successMessage');
    const debugToggle = document.getElementById('debugToggle');
    
    const PII_TYPES = [
        { key: 'EMAIL', label: 'Email Addresses' },
        { key: 'PHONE', label: 'Phone Numbers' },
        { key: 'CREDIT_CARD', label: 'Credit Cards' },
        { key: 'SSN', label: 'Social Security Numbers' },
        { key: 'IP_ADDR', label: 'IP Addresses' },
        { key: 'API_KEY', label: 'API Keys' },
        { key: 'MAC_ADDR', label: 'MAC Addresses' },
        { key: 'IBAN', label: 'IBAN (Bank Accounts)' },
        { key: 'UUID', label: 'UUIDs' },
        { key: 'PASSPORT', label: 'Passport Numbers' },
        { key: 'DRIVER_LICENSE', label: 'Driver\'s License' },
        { key: 'DATE_OF_BIRTH', label: 'Date of Birth' }
    ];
    
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
    
    function loadDebugToggle() {
        if (!debugToggle) {
            console.error('Debug toggle element not found');
            return;
        }
        
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
            
            const settings = result.cloakSettings || {};
            
            settingsList.innerHTML = '';
            
            PII_TYPES.forEach(piiType => {
                const enabled = settings[piiType.key] !== false;
                
                const li = document.createElement('li');
                li.className = 'setting-item';
                
                const label = document.createElement('span');
                label.className = 'setting-label';
                label.textContent = piiType.label;
                
                const toggle = document.createElement('div');
                toggle.className = 'setting-toggle' + (enabled ? ' enabled' : '');
                toggle.dataset.type = piiType.key;
                
                toggle.addEventListener('click', function(e) {
                    e.stopPropagation();
                    const newState = !toggle.classList.contains('enabled');
                    toggle.classList.toggle('enabled', newState);
                    
                    chrome.storage.sync.get(['cloakSettings'], function(result) {
                        if (chrome.runtime.lastError) {
                            console.error('Failed to load settings:', chrome.runtime.lastError);
                            toggle.classList.toggle('enabled', !newState); // Revert on error
                            return;
                        }
                        
                        const settings = result.cloakSettings || {};
                        settings[piiType.key] = newState;
                        chrome.storage.sync.set({ cloakSettings: settings }, function() {
                            if (chrome.runtime.lastError) {
                                console.error('Failed to save settings:', chrome.runtime.lastError);
                                toggle.classList.toggle('enabled', !newState); // Revert on error
                                return;
                            }
                            
                            chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
                                if (tabs[0]) {
                                    chrome.tabs.sendMessage(tabs[0].id, {
                                        action: 'settingsUpdated',
                                        settings: settings
                                    }).catch(() => {
                                        // Content script might not be loaded, that's okay
                                    });
                                }
                            });
                        });
                    });
                });
                
                li.appendChild(label);
                li.appendChild(toggle);
                settingsList.appendChild(li);
            });
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
        if (enabled) {
            toggleSwitch.classList.add('enabled');
            statusText.textContent = 'Protection is active';
            statusText.classList.remove('disabled');
        } else {
            toggleSwitch.classList.remove('enabled');
            statusText.textContent = 'Protection is disabled';
            statusText.classList.add('disabled');
        }
    }
    
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
    
    chrome.storage.local.get(['settingsCollapsed'], function(result) {
        settingsCollapsed = result.settingsCollapsed !== false;
        if (settingsCollapsed) {
            settingsHeader.classList.add('collapsed');
        }
    });
    
    settingsHeader.addEventListener('click', function() {
        settingsCollapsed = !settingsCollapsed;
        settingsHeader.classList.toggle('collapsed', settingsCollapsed);
        chrome.storage.local.set({ settingsCollapsed: settingsCollapsed });
    });
    
    loadSettings();
    loadSavedState();
    loadDebugToggle();
});
