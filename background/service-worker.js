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

// Open the dashboard on browser startup when the user has opted in.
chrome.runtime.onStartup.addListener(async () => {
  const { settings, defaultDashboardId, dashboards } =
    await chrome.storage.local.get(['settings', 'defaultDashboardId', 'dashboards']);
  if (!settings || settings.openOnStartup !== true) return;
  const id = defaultDashboardId || (dashboards && dashboards[0] && dashboards[0].id);
  const url = chrome.runtime.getURL('newtab/newtab.html' + (id ? `?dash=${id}` : ''));
  chrome.tabs.create({ url });
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
