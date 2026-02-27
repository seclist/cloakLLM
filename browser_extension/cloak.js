/**
 * Cloak - Core Anonymization Logic v2
 * PII detection with obfuscation handling, context awareness, validation, and paranoid mode.
 */

// Order: more specific first so they take precedence on overlapping spans
var CLOAK_ALL_PATTERNS = [
    ["EMAIL", /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)*\.[A-Za-z]{2,13}(?=$|\s|[^\w.]|\d)/g],
    ["EMAIL_OBFUSCATED", /\b[A-Za-z0-9._%+-]+\s*(?:\[at\]|\(at\)|\[AT\]|\(AT\))\s*[A-Za-z0-9.-]+\s*(?:\[\.\]|\(\.\)|\[dot\]|\(dot\)|\.)\s*[A-Za-z]{2,13}(?=$|\s|[^\w.]|\d)/gi],
    ["API_KEY", /\b(?:sk-[A-Za-z0-9]{20,}|sk-proj-[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9]{36,}|gho_[A-Za-z0-9_]{20,}|ghu_[A-Za-z0-9_]{20,}|ghs_[A-Za-z0-9_]{20,}|ghr_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}\b|ASIA[0-9A-Z]{16}\b|xox[baprs]-[A-Za-z0-9-]{10,}|(?:sk|pk)_(?:live|test)_[A-Za-z0-9]{24,}|AIza[0-9A-Za-z\-_]{35}|VERCEL_[A-Za-z0-9_]{20,}|SUPABASE_[A-Za-z0-9_]{20,}|TWILIO_[A-Za-z0-9_]{20,})\b/g],
    ["CREDIT_CARD", /\b(?:\d[ -]*?){13,19}\b/g],
    ["CREDIT_CARD_AMEX", /\b\d{4}[- ]?\d{6}[- ]?\d{5}\b/g],
    ["IBAN", /\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]){11,30}\b/g],
    ["BANK_ROUTING", /\b(?:routing|aba)[\s:#-]*(\d{9})\b/gi],
    ["BANK_ACCOUNT_NUM", /\b(?:account|acct)[\s:#-]*(\d{4,17})\b/gi],
    ["SSN", /\b(?!44\d)\d{3}[- ]?\d{2}[- ]?\d{4}\b|\b(?!44\d)\d{3}\s+\d{2}\s+\d{4}\b/g],
    ["EIN", /\b(?!44\d)\d{2}-?\d{7}\b/g],
    ["NINO", /\b[A-Z]{2}\s?\d{2}\s?\d{2}\s?\d{2}\s?\d{2}\s?[A-D]\b/gi],
    ["PHONE", /(?<!\d)(?:\+\d{1,4}[-.\s]*\d{1,4}[-.\s]*\d{1,4}[-.\s]*\d{2,12}(?:\s*(?:x|ext\.?|extension)\s*\d{2,6})?|(?:44\d{9,11}|1\d{10}|33\d{9}|49\d{9,11}|39\d{8,10}|34\d{9}|61\d{9}|81\d{9,10}|86\d{10,11}|91\d{10}|353\d{9}|31\d{9}|46\d{8,9}|47\d{8}|45\d{8}|358\d{8,9}|48\d{9}|43\d{10}|41\d{9}|32\d{8}|352\d{9}|64\d{8,10}|27\d{9}|55\d{10,11}|52\d{10}|57\d{10}|58\d{10}|51\d{9}|54\d{9,10}|56\d{9}|593\d{8}|598\d{8})(?!\d)|\(?\d{3}\)?[-.\s]*\d{3}[-.\s]*\d{4}(?:\s*(?:x|ext\.?)\s*\d{2,6})?|0\d{9,11}|0\s*\d{3}\s*\d{3}\s*\d{4}|1[-.\s]?\d{3}[-.\s]?\d{3}[-.\s]?\d{4}|\d{3}[-.\s]\d{3}[-.\s]\d{4}|1?\d{10})(?!\d)/g],
    ["PHONE_OBFUSCATED", /(?<!\d)(?:\d{3}\s*(?:dot|\.)\s*\d{3}\s*(?:dot|\.)\s*\d{4}|\d{4}\s*(?:dot|\.)\s*\d{4}\s*(?:dot|\.)\s*\d{4}\s*(?:dot|\.)\s*\d{4})(?!\d)/gi],
    ["IP_ADDR", /\b(?:\d{1,3}\.){3}\d{1,3}\b/g],
    ["IP_ADDR_V6", /\b(?:[0-9a-fA-F]{1,4}:){2,7}[0-9a-fA-F]{1,4}\b|\b(?:[0-9a-fA-F]{1,4}:){1,7}:\b|\b::(?:[0-9a-fA-F]{1,4}:){0,6}[0-9a-fA-F]{0,4}\b/g],
    ["MAC_ADDR", /\b(?:[0-9A-Fa-f]{2}[:-]){5}(?:[0-9A-Fa-f]{2})\b|\b(?:[0-9A-Fa-f]{4}\.){2}[0-9A-Fa-f]{4}\b/g],
    ["UUID", /\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\b/g],
    ["DRIVER_LICENSE", /\b(?:DL|ID)\s*[- ]?[A-Z]{1,2}\d{6,8}\b/gi],
    ["PASSPORT", /\b(?:passport|pp(?:\s*no\.?)?)\s*[:#-]?\s*([A-Z0-9]{6,9})\b|\b[A-Z]{1,2}\d{6,8}\b/gim],
    ["DATE_OF_BIRTH", /\b(?:\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}[/-]\d{1,2}[/-]\d{1,2}|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{2,4})\b/gi],
    ["UK_POSTCODE", /\b(?:GIR\s?0AA|[A-PR-UWYZ][A-HK-Y]?\d[A-Z\d]?\s?\d[ABD-HJLNP-UW-Z]{2})\b/gi],
];

// Paranoid: broader patterns, more API prefixes, standalone 9/10 digit numbers in context
var CLOAK_PARANOID_PATTERNS = [
    ["API_KEY", /\b(?:SENDGRID_[A-Za-z0-9_]{20,}|FIREBASE_[A-Za-z0-9_]{20,}|[A-Za-z0-9_-]{24,}(?:key|secret|token|api)[A-Za-z0-9_-]*)/gi],
    ["SSN", /\b\d{9}\b/g],
    ["PHONE", /(?<!\d)(?:\d{10,11}|44\d{9,11}|1\d{10}|33\d{9}|49\d{9,11}|39\d{8,10}|34\d{9}|61\d{9}|81\d{9,10}|86\d{10,11}|91\d{10}|353\d{9})(?!\d)/g],
];

var CONTEXT_LABELS = [
    { labels: /\b(?:email|e-mail|e mail)\s*[:=]\s*/gi, type: "EMAIL" },
    { labels: /\b(?:phone|mobile|tel|telephone|cell)\s*[:=]\s*/gi, type: "PHONE" },
    { labels: /\b(?:ssn|social\s*security|ss\s*#?)\s*[:=]\s*/gi, type: "SSN" },
    { labels: /\b(?:card\s*number|credit\s*card|cc\s*#?)\s*[:=]\s*/gi, type: "CREDIT_CARD" },
    { labels: /\b(?:routing|aba)\s*[:=]\s*/gi, type: "BANK_ROUTING" },
    { labels: /\b(?:account\s*number|acct)\s*[:=]\s*/gi, type: "BANK_ACCOUNT_NUM" },
    { labels: /\b(?:api\s*key|secret|apikey)\s*[:=]\s*/gi, type: "API_KEY" },
    { labels: /\b(?:ein|tax\s*id)\s*[:=]\s*/gi, type: "EIN" },
    { labels: /\b(?:nino|national\s*insurance)\s*[:=]\s*/gi, type: "NINO" },
    { labels: /\b(?:passport|passport\s*number|pp\s*no\.?)\s*[:=]\s*/gi, type: "PASSPORT" },
    { labels: /\b(?:dob|date\s*of\s*birth|born)\s*[:=]\s*/gi, type: "DATE_OF_BIRTH" },
    { labels: /\b(?:driver'?s?\s*license|driving\s*license|dl|license\s*number)\s*[:=]\s*/gi, type: "DRIVER_LICENSE" },
    { labels: /\b(?:postcode|postal\s*code|zip)\s*[:=]\s*/gi, type: "UK_POSTCODE" },
];

function normalizeForConsistency(label, value) {
    if (!value || typeof value !== 'string') return value;
    var digits = value.replace(/\D/g, '');
    if (label === "SSN" && digits.length === 9) return digits;
    if (label === "EIN" && digits.length === 9) return digits.slice(0, 2) + '-' + digits.slice(2);
    if (label === "PHONE" && digits.length >= 10) return digits;
    if (label === "CREDIT_CARD" && digits.length >= 13) return digits;
    if (label === "BANK_ROUTING" && digits.length === 9) return digits;
    if (label === "BANK_ACCOUNT_NUM" && digits.length >= 4) return digits;
    if (label === "NINO") return value.replace(/\s/g, '').toUpperCase();
    return value;
}

function deobfuscateValue(label, value) {
    if (!value) return value;
    var s = value
        .replace(/\s*\[at\]\s*|\s*\(at\)\s*/gi, '@')
        .replace(/\s*\[\.\]\s*|\s*\(\.\)\s*|\s*\[dot\]\s*|\s*\(dot\)\s*/gi, '.')
        .replace(/\s*dot\s*/gi, '.');
    return s;
}

function parseFlexibleDate(raw) {
    if (!raw || typeof raw !== 'string') return null;
    var s = raw.trim();
    var m;
    m = s.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
    if (m) return { y: parseInt(m[1], 10), mo: parseInt(m[2], 10), d: parseInt(m[3], 10) };
    m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
    if (m) {
        var yy = parseInt(m[3], 10);
        if (yy < 100) yy += yy >= 30 ? 1900 : 2000;
        return { y: yy, mo: parseInt(m[1], 10), d: parseInt(m[2], 10) };
    }
    var monthMap = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
    m = s.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{2,4})$/);
    if (m) {
        var mon = monthMap[m[2].slice(0, 3).toLowerCase()];
        if (!mon) return null;
        var yv = parseInt(m[3], 10);
        if (yv < 100) yv += yv >= 30 ? 1900 : 2000;
        return { y: yv, mo: mon, d: parseInt(m[1], 10) };
    }
    return null;
}

class Cloak {
    constructor(ignoreList = [], detectVersions = true, enabledPatterns = null, paranoidMode = false) {
        this.ignoreList = new Set(ignoreList);
        this.detectVersions = detectVersions;
        this.paranoidMode = !!paranoidMode;
        this.enabledPatterns = enabledPatterns && typeof enabledPatterns === 'object' ? enabledPatterns : null;
        this.patterns = this._buildPatterns();
    }

    _buildPatterns() {
        var self = this;
        var labelToKey = { EMAIL_OBFUSCATED: "EMAIL", CREDIT_CARD_AMEX: "CREDIT_CARD", PHONE_OBFUSCATED: "PHONE", IP_ADDR_V6: "IP_ADDR", BANK_ROUTING: "BANK_ACCOUNT", BANK_ACCOUNT_NUM: "BANK_ACCOUNT" };
        var list = CLOAK_ALL_PATTERNS.slice();
        if (this.paranoidMode) {
            CLOAK_PARANOID_PATTERNS.forEach(function (p) {
                list.push(p);
            });
        }
        if (this.enabledPatterns) {
            list = list.filter(function (p) {
                var key = labelToKey[p[0]] || p[0];
                return self.enabledPatterns[key] !== false;
            });
        }
        return list;
    }

    updateSettings(ignoreList = null, detectVersions = null, _unused = null, enabledPatterns = null, paranoidMode = null) {
        if (ignoreList !== null) this.ignoreList = new Set(ignoreList);
        if (detectVersions !== null) this.detectVersions = detectVersions;
        if (enabledPatterns !== null) this.enabledPatterns = enabledPatterns;
        if (paranoidMode !== null) this.paranoidMode = !!paranoidMode;
        this.patterns = this._buildPatterns();
    }

    deobfuscateValue(label, value) {
        return deobfuscateValue(label, value);
    }

    isValidIP(ipStr) {
        var parts = ipStr.split('.');
        if (parts.length !== 4) return false;
        try {
            return parts.every(function (part) {
                var num = parseInt(part, 10);
                return num >= 0 && num <= 255;
            });
        } catch (e) {
            return false;
        }
    }

    isValidEIN(val) {
        var digits = val.replace(/\D/g, '');
        if (!(digits.length === 9 && /^\d{9}$/.test(digits))) return false;
        if (digits === '000000000') return false;
        var prefix = parseInt(digits.slice(0, 2), 10);
        return prefix >= 1 && prefix <= 99;
    }

    isValidNINO(val) {
        var s = val.replace(/\s/g, '').toUpperCase();
        if (!/^[A-Z]{2}\d{6}[A-D]$/.test(s)) return false;
        if (/^(BG|GB|NK|KN|TN|NT|ZZ)/.test(s.slice(0, 2))) return false;
        if (/[DFIQUV]/.test(s[0]) || /[DFIQUVO]/.test(s[1])) return false;
        return true;
    }

    isValidRouting(val) {
        var digits = val.replace(/\D/g, '');
        if (!(digits.length === 9 && /^\d{9}$/.test(digits))) return false;
        var checksum = 3 * (parseInt(digits[0], 10) + parseInt(digits[3], 10) + parseInt(digits[6], 10))
                     + 7 * (parseInt(digits[1], 10) + parseInt(digits[4], 10) + parseInt(digits[7], 10))
                     + (parseInt(digits[2], 10) + parseInt(digits[5], 10) + parseInt(digits[8], 10));
        return checksum % 10 === 0;
    }

    isValidIBAN(val) {
        var s = (val || '').toUpperCase().replace(/\s+/g, '');
        if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(s)) return false;
        var rearranged = s.slice(4) + s.slice(0, 4);
        var numeric = '';
        for (var i = 0; i < rearranged.length; i++) {
            var ch = rearranged.charCodeAt(i);
            if (ch >= 65 && ch <= 90) numeric += String(ch - 55);
            else numeric += rearranged[i];
        }
        var remainder = 0;
        for (var j = 0; j < numeric.length; j += 7) {
            remainder = parseInt(String(remainder) + numeric.slice(j, j + 7), 10) % 97;
        }
        return remainder === 1;
    }

    isValidIPv6(ip) {
        if (!ip || ip.indexOf(':') === -1) return false;
        if (ip.split('::').length > 2) return false;
        var hasIpv4Tail = /\d+\.\d+\.\d+\.\d+$/.test(ip);
        if (hasIpv4Tail) {
            var parts = ip.split(':');
            var v4 = parts.pop();
            if (!this.isValidIP(v4)) return false;
            ip = parts.join(':');
        }
        var groups = ip.split(':').filter(function (g) { return g.length > 0; });
        if (groups.length > 8) return false;
        for (var i = 0; i < groups.length; i++) {
            if (!/^[0-9a-fA-F]{1,4}$/.test(groups[i])) return false;
        }
        return true;
    }

    isValidUUID(val) {
        return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(val || '');
    }

    isValidUKPostcode(val) {
        return /^(?:GIR\s?0AA|[A-PR-UWYZ][A-HK-Y]?\d[A-Z\d]?\s?\d[ABD-HJLNP-UW-Z]{2})$/i.test((val || '').trim());
    }

    isValidDOB(val, fullText, index) {
        var parsed = parseFlexibleDate(val);
        if (!parsed) return false;
        var dt = new Date(parsed.y, parsed.mo - 1, parsed.d);
        if (dt.getFullYear() !== parsed.y || dt.getMonth() !== parsed.mo - 1 || dt.getDate() !== parsed.d) return false;
        var now = new Date();
        if (dt > now) return false;
        var minYear = now.getFullYear() - 120;
        if (parsed.y < minYear || parsed.y > now.getFullYear()) return false;
        var ctx = this.getContext(fullText, index, index + val.length, 28).toLowerCase();
        var hasDobContext = /\b(dob|birth|born|date of birth|birthday)\b/.test(ctx);
        // Keep common date formats available, but require context for very short years to reduce date noise.
        if (!hasDobContext && /\b\d{1,2}[/-]\d{1,2}[/-]\d{2}\b/.test(val)) return false;
        return true;
    }

    isLikelyPassport(val, fullText, index) {
        var s = (val || '').replace(/\s+/g, '');
        if (!/^[A-Z0-9]{6,9}$/i.test(s)) return false;
        var ctx = this.getContext(fullText, index, index + val.length, 28).toLowerCase();
        if (/\b(passport|travel\s*doc|document)\b/.test(ctx)) return true;
        // Permit alphanumeric passport-like formats without explicit context.
        return /[A-Z]/i.test(s);
    }

    isValidApiKey(val) {
        var s = (val || '').trim();
        if (s.length < 20) return false;
        if (/\s/.test(s)) return false;
        if (/^[A-Za-z0-9]{20,}$/.test(s)) return false;
        return /[_-]/.test(s) || /^(?:sk-|sk-proj-|ghp_|gho_|ghu_|ghs_|ghr_|AKIA|ASIA|xox|AIza)/.test(s);
    }

    luhnCheck(cardNumber) {
        var digits = cardNumber.replace(/[- ]/g, '').split('').map(Number);
        if (digits.length < 13 || digits.length > 19) return false;
        var checksum = 0;
        for (var i = digits.length - 1; i >= 0; i--) {
            var digit = digits[i];
            if ((digits.length - i) % 2 === 0) {
                digit *= 2;
                if (digit > 9) digit -= 9;
            }
            checksum += digit;
        }
        return checksum % 10 === 0;
    }

    getContext(text, matchStart, matchEnd, window) {
        window = window || 50;
        var start = Math.max(0, matchStart - window);
        var end = Math.min(text.length, matchEnd + window);
        return text.substring(start, end);
    }

    isLikelyVersion(ipStr, text, matchStart) {
        if (!this.detectVersions || this.paranoidMode) return false;
        var contextWindow = 30;
        var start = Math.max(0, matchStart - contextWindow);
        var end = Math.min(text.length, matchStart + ipStr.length + contextWindow);
        var context = text.substring(start, end);
        var versionKeywords = ['version', 'release', 'build', 'ver', 'rev'];
        for (var i = 0; i < versionKeywords.length; i++) {
            var re = new RegExp('\\b' + versionKeywords[i] + '\\b', 'i');
            if (re.test(context)) return true;
        }
        if (/\b[vV]\s+\d/.test(context.substring(0, matchStart - start + 10))) return true;
        return false;
    }

    isLikelyIPAddress(value, text, matchStart) {
        var context = this.getContext(text, matchStart, matchStart + value.length);
        var ipKeywords = ['ip', 'address', 'server', 'host', 'network', 'connect', 'ping'];
        var contextLower = context.toLowerCase();
        for (var i = 0; i < ipKeywords.length; i++) {
            if (contextLower.indexOf(ipKeywords[i]) !== -1) return true;
        }
        return false;
    }

    _getContextMatches(text) {
        var matches = [];
        var lineEnd = text.indexOf('\n');
        var start = 0;
        while (start < text.length) {
            var end = lineEnd === -1 ? text.length : lineEnd;
            var line = text.substring(start, end);
            for (var c = 0; c < CONTEXT_LABELS.length; c++) {
                var conf = CONTEXT_LABELS[c];
                conf.labels.lastIndex = 0;
                var m = conf.labels.exec(line);
                if (m) {
                    var valueStart = start + m.index + m[0].length;
                    var valueStr = text.substring(valueStart, end);
                    var valueMatch = valueStr.match(/^\s*([A-Za-z0-9\s\-\.\/\(\)\+@#:\[\]]{4,80})/);
                    if (valueMatch) {
                        var val = valueMatch[1].trim();
                        if (val.length >= 4) {
                            var actualStart = valueStart + valueStr.indexOf(valueMatch[1]);
                            matches.push({
                                index: actualStart,
                                value: val,
                                label: conf.type,
                                key: actualStart + '-' + (actualStart + val.length)
                            });
                        }
                    }
                }
            }
            start = end + (lineEnd === -1 ? 0 : 1);
            lineEnd = text.indexOf('\n', start);
        }
        return matches;
    }

    anonymize(text) {
        if (!text || !text.trim()) {
            return { cloakedText: text, entityMap: {} };
        }

        var entityMap = {};
        var valueToToken = {};
        var typeCounters = {};
        var self = this;
        var tokenPrefix = 'CLOAK_';

        function tokenExistsInText(candidate) {
            return text.indexOf(candidate) !== -1 || currentText.indexOf(candidate) !== -1 || Object.prototype.hasOwnProperty.call(entityMap, candidate);
        }

        this.patterns.forEach(function (p) {
            var lab = p[0];
            if (lab !== "CREDIT_CARD_AMEX" && lab !== "EMAIL_OBFUSCATED" && lab !== "PHONE_OBFUSCATED" && lab !== "IP_ADDR_V6") {
                if (!typeCounters[lab]) typeCounters[lab] = 1;
            }
        });
        typeCounters["CREDIT_CARD_AMEX"] = 1;
        typeCounters["EMAIL_OBFUSCATED"] = 1;
        typeCounters["PHONE_OBFUSCATED"] = 1;
        typeCounters["IP_ADDR_V6"] = 1;
        typeCounters["BANK_ROUTING"] = 1;
        typeCounters["BANK_ACCOUNT_NUM"] = 1;

        var allMatches = [];
        this.patterns.forEach(function (pair) {
            var label = pair[0];
            var pattern = pair[1];
            pattern.lastIndex = 0;
            var m;
            while ((m = pattern.exec(text)) !== null) {
                var val = m[0];
                var idx = m.index;
                var rawLen = m[0].length;
                if (label === "EMAIL_OBFUSCATED") {
                    val = self.deobfuscateValue("EMAIL", val);
                } else if ((label === "BANK_ROUTING" || label === "BANK_ACCOUNT_NUM" || label === "PASSPORT") && m[1] !== undefined) {
                    var pre = m[0].indexOf(m[1]);
                    idx = m.index + pre;
                    val = m[1];
                    rawLen = m[1].length;
                }
                var effectiveLabel = label === "CREDIT_CARD_AMEX" ? "CREDIT_CARD" : (label === "EMAIL_OBFUSCATED" ? "EMAIL" : (label === "PHONE_OBFUSCATED" ? "PHONE" : label));
                allMatches.push({
                    index: idx,
                    value: val,
                    label: effectiveLabel,
                    key: idx + '-' + (idx + rawLen),
                    raw: (label === "BANK_ROUTING" || label === "BANK_ACCOUNT_NUM" || label === "PASSPORT") && m[1] !== undefined ? m[1] : m[0],
                    rawLen: rawLen
                });
            }
        });

        var contextMatches = this._getContextMatches(text);
        contextMatches.forEach(function (cm) {
            var cmEnd = cm.index + cm.value.length;
            var overlap = allMatches.some(function (am) {
                var amLen = (am.raw && am.raw.length) || am.value.length;
                var amEnd = am.index + amLen;
                return (cm.index >= am.index && cm.index < amEnd) || (cmEnd > am.index && cmEnd <= amEnd) || (cm.index <= am.index && cmEnd >= amEnd);
            });
            if (!overlap) allMatches.push({ index: cm.index, value: cm.value, label: cm.label, key: cm.key, raw: cm.value, rawLen: cm.value.length });
        });

        if (allMatches.length === 0) {
            return { cloakedText: text, entityMap: {} };
        }

        allMatches.sort(function (a, b) {
            if (a.index !== b.index) return b.index - a.index;
            return (b.rawLen || 0) - (a.rawLen || 0);
        });

        var ipSkipSet = new Set();
        if (this.detectVersions && !this.paranoidMode) {
            allMatches.forEach(function (m) {
                if (m.label !== "IP_ADDR" || !self.isValidIP(m.value)) return;
                if (self.isLikelyVersion(m.value, text, m.index)) ipSkipSet.add(m.key);
                else if (!self.isLikelyIPAddress(m.value, text, m.index)) {
                    var ctx = self.getContext(text, m.index, m.index + m.value.length);
                    var hasKw = ['ip', 'address', 'server', 'host', 'network', 'connect'].some(function (kw) {
                        return ctx.toLowerCase().indexOf(kw) !== -1;
                    });
                    if (!hasKw) ipSkipSet.add(m.key);
                }
            });
        }

        var currentText = text;
        var seenSpans = new Set();

        function overlapWithSeen(start, end) {
            var keys = Array.from(seenSpans);
            for (var i = 0; i < keys.length; i++) {
                var parts = keys[i].split('-');
                var s = parseInt(parts[0], 10);
                var e = parseInt(parts[1], 10);
                if (start < e && s < end) return true;
            }
            return false;
        }

        allMatches.forEach(function (m) {
            var key = m.key;
            var rawLen = m.rawLen || (m.raw || m.value).length;
            var mEnd = m.index + rawLen;
            if (seenSpans.has(key)) return;
            if (overlapWithSeen(m.index, mEnd)) return;
            var originalValue = m.raw || m.value;
            var label = m.label;

            if (self.ignoreList.has(originalValue)) return;
            if (label === "IP_ADDR" && ipSkipSet.has(key)) return;
            if (label === "IP_ADDR" && !self.isValidIP(m.value)) return;
            if (label === "IP_ADDR_V6" && !self.isValidIPv6(m.value)) return;
            if ((label === "CREDIT_CARD" || label === "CREDIT_CARD_AMEX") && !self.luhnCheck(originalValue)) return;
            if (label === "API_KEY" && !self.isValidApiKey(originalValue)) return;
            if (label === "IBAN" && !self.isValidIBAN(m.value)) return;
            if (label === "EIN" && !self.isValidEIN(m.value)) return;
            if (label === "NINO" && !self.isValidNINO(m.value)) return;
            if (label === "BANK_ROUTING" && !self.isValidRouting(m.value)) return;
            if (label === "UUID" && !self.isValidUUID(m.value)) return;
            if (label === "UK_POSTCODE" && !self.isValidUKPostcode(m.value)) return;
            if (label === "PASSPORT" && !self.isLikelyPassport(m.value, text, m.index)) return;
            if (label === "DATE_OF_BIRTH" && !self.isValidDOB(m.value, text, m.index)) return;
            if (label === "BANK_ACCOUNT_NUM") {
                var d = (m.raw || m.value).replace(/\D/g, '');
                if (d.length < 4 || d.length > 17) return;
            }

            var normKey = normalizeForConsistency(label, m.value);
            if (normKey && valueToToken[normKey]) {
                var tok = valueToToken[normKey];
                currentText = currentText.substring(0, m.index) + tok + currentText.substring(m.index + rawLen);
                seenSpans.add(key);
                return;
            }

            var count = typeCounters[label] || 1;
            var token = '[' + tokenPrefix + label + '_' + count + ']';
            while (tokenExistsInText(token)) {
                count += 1;
                token = '[' + tokenPrefix + label + '_' + count + ']';
            }
            entityMap[token] = originalValue;
            valueToToken[normKey || originalValue] = token;
            typeCounters[label] = count + 1;
            currentText = currentText.substring(0, m.index) + token + currentText.substring(m.index + rawLen);
            seenSpans.add(key);
        });

        return { cloakedText: currentText, entityMap: entityMap };
    }

    deanonymize(text, entityMap) {
        if (!entityMap || Object.keys(entityMap).length === 0) return text;
        var restoredText = text;
        for (var token in entityMap) {
            if (!entityMap.hasOwnProperty(token)) continue;
            var originalValue = entityMap[token];
            var re = new RegExp(this.escapeRegex(token), 'g');
            restoredText = restoredText.replace(re, originalValue);
        }
        return restoredText;
    }

    escapeRegex(str) {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
}

if (typeof window !== 'undefined') {
    window.Cloak = Cloak;
}
