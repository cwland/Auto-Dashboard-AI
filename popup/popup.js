// Auto Dashboard AI — Popup
'use strict';

function openConfig(tab = 'settings') {
  const url = chrome.runtime.getURL(`config/config.html${tab === 'dashboards' ? '?tab=dashboards' : ''}`);
  chrome.tabs.create({ url });
  window.close();
}

async function init() {
  // Button handlers
  document.getElementById('btn-create').addEventListener('click', () => openConfig('dashboards'));
  document.getElementById('btn-settings').addEventListener('click', () => openConfig('settings'));
  document.getElementById('btn-newtab').addEventListener('click', () => {
    // Open the dashboard via dashboard.html (NOT the new-tab override page),
    // so the browser's new-tab takeover bar never appears.
    chrome.tabs.create({ url: chrome.runtime.getURL('newtab/dashboard.html') });
    window.close();
  });

  // Status
  const stored = await new Promise((r) => chrome.storage.local.get(['settings', 'dashboards'], r));
  const hasKey = !!stored.settings?.apiKey;
  const dashCount = stored.dashboards?.length || 0;

  const dot = document.getElementById('status-dot');
  const statusText = document.getElementById('status-text');
  const dashCountEl = document.getElementById('dash-count');

  if (hasKey) {
    dot.classList.add('connected');
    statusText.textContent = 'API key set';
  } else {
    statusText.textContent = 'No API key';
  }

  dashCountEl.textContent = dashCount > 0
    ? `${dashCount} dashboard${dashCount !== 1 ? 's' : ''}`
    : 'No dashboards';
}

document.addEventListener('DOMContentLoaded', init);
