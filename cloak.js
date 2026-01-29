/**
 * Cloak - Core Anonymization Logic (JavaScript Port) v1.0
 * This is a JavaScript port of the Python Cloak functionality
 */

class Cloak {
    constructor(ignoreList = [], detectVersions = true, maskingMode = "full", enabledPatterns = null) {
        this.ignoreList = new Set(ignoreList);
        this.detectVersions = detectVersions;
        this.maskingMode = maskingMode;
        
        // All available patterns
        const allPatterns = [
            ["API_KEY", /\b(?:sk|ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{20,}(?=\s|$|[^\w_])|\bAKIA[0-9A-Z]{16}\b/g],
            ["MAC_ADDR", /\b(?:[0-9A-Fa-f]{2}[:-]){5}(?:[0-9A-Fa-f]{2})\b/g],
            ["IBAN", /\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/g],
            ["UUID", /\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/g],
            ["EMAIL", /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g],
            ["IP_ADDR", /\b(?:\d{1,3}\.){3}\d{1,3}\b/g],
            ["SSN", /\b\d{3}-\d{2}-\d{4}\b/g],
            ["CREDIT_CARD", /\b(?:\d{4}[- ]?){3}\d{4}\b/g],
            ["DRIVER_LICENSE", /\b(?:DL|ID)[- ]?[A-Z]{1,2}\d{6,8}\b/g],
            ["PHONE", /(?<!\d)(?:\+\d{1,4}[-.\s]?|0\d{1,3}[-.\s]?|\(\d{1,4}\)[-.\s]?)(?:\d{1,4}[-.\s]?){2,6}\d{1,4}(?!\d)|(?<!\d)(?:\d{3}[-.\s]?){2}\d{4}(?!\d)/g],
            ["PASSPORT", /\b(?:[A-Z]{1,2}\d{6,9}|\d{9})\b/g],
            ["DATE_OF_BIRTH", /\b(?:\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}[/-]\d{1,2}[/-]\d{1,2})\b/g],
        ];
        
        // Filter patterns based on enabledPatterns (if provided)
        if (enabledPatterns && typeof enabledPatterns === 'object') {
            this.patterns = allPatterns.filter(([label]) => enabledPatterns[label] !== false);
        } else {
            this.patterns = allPatterns;
        }
    }
    
    updateSettings(ignoreList = null, detectVersions = null, maskingMode = null, enabledPatterns = null) {
        if (ignoreList !== null) this.ignoreList = new Set(ignoreList);
        if (detectVersions !== null) this.detectVersions = detectVersions;
        if (maskingMode !== null) this.maskingMode = maskingMode;
        if (enabledPatterns !== null) {
            const allPatterns = [
                ["API_KEY", /\b(?:sk|ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{20,}(?=\s|$|[^\w_])|\bAKIA[0-9A-Z]{16}\b/g],
                ["MAC_ADDR", /\b(?:[0-9A-Fa-f]{2}[:-]){5}(?:[0-9A-Fa-f]{2})\b/g],
                ["IBAN", /\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/g],
                ["UUID", /\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/g],
                ["EMAIL", /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g],
                ["IP_ADDR", /\b(?:\d{1,3}\.){3}\d{1,3}\b/g],
                ["SSN", /\b\d{3}-\d{2}-\d{4}\b/g],
                ["CREDIT_CARD", /\b(?:\d{4}[- ]?){3}\d{4}\b/g],
                ["DRIVER_LICENSE", /\b(?:DL|ID)[- ]?[A-Z]{1,2}\d{6,8}\b/g],
                ["PHONE", /(?<!\d)(?:\+\d{1,4}[-.\s]?|0\d{1,3}[-.\s]?|\(\d{1,4}\)[-.\s]?)(?:\d{1,4}[-.\s]?){2,6}\d{1,4}(?!\d)|(?<!\d)(?:\d{3}[-.\s]?){2}\d{4}(?!\d)/g],
                ["PASSPORT", /\b(?:[A-Z]{1,2}\d{6,9}|\d{9})\b/g],
                ["DATE_OF_BIRTH", /\b(?:\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}[/-]\d{1,2}[/-]\d{1,2})\b/g],
            ];
            this.patterns = allPatterns.filter(([label]) => enabledPatterns[label] !== false);
        }
    }
    
    isValidIP(ipStr) {
        const parts = ipStr.split('.');
        if (parts.length !== 4) return false;
        try {
            return parts.every(part => {
                const num = parseInt(part, 10);
                return num >= 0 && num <= 255;
            });
        } catch {
            return false;
        }
    }
    
    luhnCheck(cardNumber) {
        const digits = cardNumber.replace(/[- ]/g, '').split('').map(Number);
        if (digits.length < 13 || digits.length > 19) return false;
        
        let checksum = 0;
        for (let i = digits.length - 1; i >= 0; i--) {
            let digit = digits[i];
            if ((digits.length - i) % 2 === 0) {
                digit *= 2;
                if (digit > 9) digit -= 9;
            }
            checksum += digit;
        }
        return checksum % 10 === 0;
    }
    
    partialMask(value, label) {
        if (label === "CREDIT_CARD") {
            const digits = value.replace(/[- ]/g, '');
            if (digits.length >= 4) {
                return '****-****-****-' + digits.slice(-4);
            }
            return '****';
        } else if (label === "SSN") {
            const parts = value.split('-');
            if (parts.length === 3) {
                return '***-**-' + parts[2];
            }
            return '***-**-****';
        } else if (label === "PHONE") {
            const digits = value.replace(/\D/g, '');
            if (digits.length >= 4) {
                return '***-***-' + digits.slice(-4);
            }
            return '***-***-****';
        }
        return '****';
    }
    
    getContext(text, matchStart, matchEnd, window = 50) {
        const start = Math.max(0, matchStart - window);
        const end = Math.min(text.length, matchEnd + window);
        return text.substring(start, end);
    }
    
    isLikelyVersion(ipStr, text, matchStart) {
        if (!this.detectVersions) return false;
        
        const versionKeywords = ['version', 'release', 'build', 'ver', 'rev'];
        const contextWindow = 30;
        const start = Math.max(0, matchStart - contextWindow);
        const end = Math.min(text.length, matchStart + ipStr.length + contextWindow);
        const context = text.substring(start, end);
        
        for (const keyword of versionKeywords) {
            const regex = new RegExp(`\\b${keyword}\\b`, 'i');
            const match = context.match(regex);
            if (match) {
                const keywordPos = start + match.index;
                if (Math.abs(keywordPos - matchStart) <= contextWindow) {
                    return true;
                }
            }
        }
        
        if (/\b[vV]\s+\d/.test(context.substring(0, matchStart - start + 10))) {
            return true;
        }
        
        return false;
    }
    
    isLikelyIPAddress(value, text, matchStart) {
        const context = this.getContext(text, matchStart, matchStart + value.length);
        const ipKeywords = ['ip', 'address', 'server', 'host', 'network', 'connect', 'ping'];
        const contextLower = context.toLowerCase();
        return ipKeywords.some(keyword => contextLower.includes(keyword));
    }
    
    anonymize(text) {
        if (!text || !text.trim()) {
            return { cloakedText: text, entityMap: {} };
        }
        
        let currentText = text;
        const entityMap = {};
        const valueToToken = {};
        const typeCounters = {};
        
        // Initialize counters
        this.patterns.forEach(([label]) => {
            typeCounters[label] = 1;
        });
        
        // Quick check for matches
        let hasMatches = false;
        for (const [label, pattern] of this.patterns) {
            if (pattern.test(text)) {
                hasMatches = true;
                break;
            }
        }
        
        if (!hasMatches) {
            return { cloakedText: text, entityMap: {} };
        }
        
        // Process each pattern
        for (const [label, pattern] of this.patterns) {
            const matchesToSkip = new Set();
            
            // Reset regex (global flag requires reset)
            pattern.lastIndex = 0;
            
            // Context-aware filtering for IP addresses
            if (label === "IP_ADDR" && this.detectVersions) {
                const matches = [...text.matchAll(pattern)];
                for (const match of matches) {
                    const originalValue = match[0];
                    if (this.isValidIP(originalValue)) {
                        if (this.isLikelyVersion(originalValue, currentText, match.index)) {
                            matchesToSkip.add(`${match.index}-${match.index + originalValue.length}`);
                        } else if (!this.isLikelyIPAddress(originalValue, currentText, match.index)) {
                            const context = this.getContext(currentText, match.index, match.index + originalValue.length);
                            const hasIPKeywords = ['ip', 'address', 'server', 'host', 'network', 'connect']
                                .some(keyword => context.toLowerCase().includes(keyword));
                            if (!hasIPKeywords) {
                                matchesToSkip.add(`${match.index}-${match.index + originalValue.length}`);
                            }
                        }
                    }
                }
            }
            
            // Replace matches - collect all matches first to avoid offset issues
            pattern.lastIndex = 0;
            const allMatches = [];
            let match;
            while ((match = pattern.exec(currentText)) !== null) {
                allMatches.push({
                    value: match[0],
                    index: match.index,
                    key: `${match.index}-${match.index + match[0].length}`
                });
            }
            
            // Process matches in reverse order to maintain correct indices
            for (let i = allMatches.length - 1; i >= 0; i--) {
                const match = allMatches[i];
                const originalValue = match.value;
                
                // Check ignore list
                if (this.ignoreList.has(originalValue)) {
                    continue;
                }
                
                // Check skip list
                if (matchesToSkip.has(match.key)) {
                    continue;
                }
                
                // Validation checks
                if (label === "IP_ADDR") {
                    if (!this.isValidIP(originalValue)) {
                        continue;
                    }
                }
                
                if (label === "CREDIT_CARD") {
                    if (!this.luhnCheck(originalValue)) {
                        continue;
                    }
                }
                
                // Consistency check
                if (valueToToken[originalValue]) {
                    const token = valueToToken[originalValue];
                    currentText = currentText.substring(0, match.index) + token + currentText.substring(match.index + originalValue.length);
                    continue;
                }
                
                // Generate token
                const count = typeCounters[label] || 1;
                let token;
                
                if (this.maskingMode === "partial" && ["CREDIT_CARD", "SSN", "PHONE"].includes(label)) {
                    const maskedValue = this.partialMask(originalValue, label);
                    token = `[${label}_${count}:${maskedValue}]`;
                } else {
                    token = `[${label}_${count}]`;
                }
                
                entityMap[token] = originalValue;
                valueToToken[originalValue] = token;
                typeCounters[label] = (typeCounters[label] || 1) + 1;
                
                // Replace in reverse order to maintain indices
                currentText = currentText.substring(0, match.index) + token + currentText.substring(match.index + originalValue.length);
            }
        }
        
        return { cloakedText: currentText, entityMap };
    }
    
    deanonymize(text, entityMap) {
        if (!entityMap || Object.keys(entityMap).length === 0) {
            return text;
        }
        
        let restoredText = text;
        
        // Replace tokens with original values
        for (const [token, originalValue] of Object.entries(entityMap)) {
            restoredText = restoredText.replace(new RegExp(this.escapeRegex(token), 'g'), originalValue);
            
            // Handle partial masking tokens
            if (token.includes(':')) {
                const baseToken = token.split(':')[0] + ':';
                const partialRegex = new RegExp(this.escapeRegex(baseToken) + '[^\\]]+', 'g');
                restoredText = restoredText.replace(partialRegex, originalValue);
            }
        }
        
        return restoredText;
    }
    
    escapeRegex(str) {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
}

// Make Cloak available globally for content script
if (typeof window !== 'undefined') {
    window.Cloak = Cloak;
}
// Also make it available in the current scope
// (content scripts run in isolated world, so we need it in global scope)