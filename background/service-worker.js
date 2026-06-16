// Auto Dashboard AI — Service Worker
'use strict';

// Open config page on first install
chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') {
    chrome.tabs.create({
      url: chrome.runtime.getURL('config/config.html'),
    });
  }
});

// Handle messages from other extension pages (future use)
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'OPEN_CONFIG') {
    const tab = msg.tab || 'settings';
    chrome.tabs.create({
      url: chrome.runtime.getURL(`config/config.html${tab === 'dashboards' ? '?tab=dashboards' : ''}`),
    });
    sendResponse({ ok: true });
  }
  return true;
});
