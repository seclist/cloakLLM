/**
 * Cloak background script – handles file downloads for export and audit log.
 */
'use strict';

function normalizeAuditEntry(e) {
    return {
        ts: e.ts || '',
        total: e.total != null ? e.total : 0,
        counts: e.counts && typeof e.counts === 'object' ? e.counts : {},
        conversationId: e.cid != null ? e.cid : e.conversationId || null,
        source: e.src || 'send'
    };
}

function filterLogByRange(log, range) {
    if (!range || range === 'all') return log;
    var now = Date.now();
    var ms = range === '7d' ? 7 * 24 * 60 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000;
    var cutoff = now - ms;
    return log.filter(function(e) {
        var t = e.ts ? new Date(e.ts).getTime() : 0;
        return t >= cutoff;
    });
}

function csvEscape(s) {
    if (s == null) return '';
    var str = String(s);
    if (/[,"\n]/.test(str)) return '"' + str.replace(/"/g, '""') + '"';
    return str;
}

function auditLogToCSV(log) {
    var normalized = log.map(normalizeAuditEntry);
    var types = new Set();
    normalized.forEach(function(e) {
        Object.keys(e.counts || {}).forEach(function(k) { types.add(k); });
    });
    var headers = ['Date', 'Total', 'Source', 'ConversationId'].concat(Array.from(types).sort());
    var rows = [headers.map(csvEscape).join(',')];
    normalized.forEach(function(e) {
        var row = [e.ts || '', e.total, e.source, e.conversationId || ''];
        headers.slice(4).forEach(function(h) {
            row.push((e.counts && e.counts[h]) || 0);
        });
        rows.push(row.map(csvEscape).join(','));
    });
    return rows.join('\n');
}

chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    if (request.action === 'downloadRedactedExport') {
        const conversation = request.conversation || [];
        const format = (request.format || 'json').toLowerCase();
        const timestamp = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
        let content, filename, mimeType;
        if (format === 'md' || format === 'markdown') {
            let md = '';
            conversation.forEach(function(item) {
                const role = (item.role || 'unknown').toLowerCase();
                const title = role === 'user' ? 'User' : role === 'assistant' ? 'Assistant' : role;
                md += '## ' + title + '\n\n' + (item.content || '').trim() + '\n\n';
            });
            content = md.trim();
            filename = 'cloak-export-' + timestamp + '.md';
            mimeType = 'text/markdown;charset=utf-8';
        } else {
            content = JSON.stringify(conversation, null, 2);
            filename = 'cloak-export-' + timestamp + '.json';
            mimeType = 'application/json;charset=utf-8';
        }
        const dataUrl = 'data:' + mimeType + ',' + encodeURIComponent(content);
        chrome.downloads.download({
            url: dataUrl,
            filename: filename,
            saveAs: true
        }, function() {
            if (chrome.runtime.lastError) {
                sendResponse({ success: false, error: chrome.runtime.lastError.message });
            } else {
                sendResponse({ success: true });
            }
        });
        return true; // keep channel open for sendResponse
    }
    if (request.action === 'getAuditLogSummary') {
        chrome.storage.local.get(['cloakAuditLog'], function(result) {
            if (chrome.runtime.lastError) {
                sendResponse({ success: false, error: chrome.runtime.lastError.message });
                return;
            }
            var log = Array.isArray(result.cloakAuditLog) ? result.cloakAuditLog : [];
            var last = log.length ? log[log.length - 1] : null;
            var lastTs = last ? (last.ts || '') : null;
            var lastTotal = last && last.total != null ? last.total : 0;
            var lastCounts = last && last.counts ? last.counts : {};
            var cutoff24 = Date.now() - (24 * 60 * 60 * 1000);
            var last24h = log.filter(function(e) {
                var t = e.ts ? new Date(e.ts).getTime() : 0;
                return t >= cutoff24;
            }).length;
            sendResponse({
                success: true,
                count: log.length,
                lastTs: lastTs,
                lastTotal: lastTotal,
                lastCounts: lastCounts,
                last24h: last24h
            });
        });
        return true;
    }
    if (request.action === 'downloadAuditLog') {
        var format = (request.format || 'json').toLowerCase();
        var range = (request.range || 'all').toLowerCase();
        chrome.storage.local.get(['cloakAuditLog'], function(result) {
            if (chrome.runtime.lastError) {
                sendResponse({ success: false, error: chrome.runtime.lastError.message });
                return;
            }
            var log = Array.isArray(result.cloakAuditLog) ? result.cloakAuditLog : [];
            var filtered = filterLogByRange(log, range);
            var timestamp = new Date().toISOString().slice(0, 10);
            var content, filename, mimeType;
            var rangeSuffix = range && range !== 'all' ? ('-' + range) : '-all';
            if (format === 'csv') {
                content = auditLogToCSV(filtered);
                filename = 'cloak-audit-log' + rangeSuffix + '-' + timestamp + '.csv';
                mimeType = 'text/csv;charset=utf-8';
            } else {
                var exportLog = filtered.map(normalizeAuditEntry);
                content = JSON.stringify(exportLog, null, 2);
                filename = 'cloak-audit-log' + rangeSuffix + '-' + timestamp + '.json';
                mimeType = 'application/json;charset=utf-8';
            }
            var dataUrl = 'data:' + mimeType + ',' + encodeURIComponent(content);
            try {
                chrome.downloads.download({
                    url: dataUrl,
                    filename: filename,
                    saveAs: true
                }, function() {
                    if (chrome.runtime.lastError) {
                        console.warn('[Cloak] Audit log download failed:', chrome.runtime.lastError.message);
                        sendResponse({ success: false, error: chrome.runtime.lastError.message });
                    } else {
                        sendResponse({ success: true });
                    }
                });
            } catch (e) {
                sendResponse({ success: false, error: (e && e.message) || 'Download failed' });
                return;
            }
        });
        return true;
    }
    if (request.action === 'clearAuditLog') {
        chrome.storage.local.set({ cloakAuditLog: [] }, function() {
            if (chrome.runtime.lastError) {
                sendResponse({ success: false, error: chrome.runtime.lastError.message });
                return;
            }
            sendResponse({ success: true });
        });
        return true;
    }
});
