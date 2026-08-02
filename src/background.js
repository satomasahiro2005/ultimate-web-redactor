/* Web Mosaic Next - service worker */

const MENU = {
  ROOT: 'uwr-root',
  HIDE_SEL: 'uwr-hide-selection',
  FRAME_SEL: 'uwr-frame-selection',
  HIDE_MEDIA: 'uwr-hide-media',
  FRAME_MEDIA: 'uwr-frame-media',
  REVEAL: 'uwr-reveal'
};

const t = (key) => chrome.i18n.getMessage(key) || key;

function buildMenus() {
  chrome.contextMenus.removeAll(() => {
    const add = (o) => chrome.contextMenus.create(o);
    add({ id: MENU.ROOT, title: t('appName'), contexts: ['all'] });
    add({ id: MENU.HIDE_SEL, parentId: MENU.ROOT, title: t('menuHideSel'), contexts: ['selection'] });
    add({ id: MENU.FRAME_SEL, parentId: MENU.ROOT, title: t('menuFrameSel'), contexts: ['selection'] });
    add({ id: MENU.HIDE_MEDIA, parentId: MENU.ROOT, title: t('menuHideMedia'), contexts: ['image', 'video'] });
    add({ id: MENU.FRAME_MEDIA, parentId: MENU.ROOT, title: t('menuFrameMedia'), contexts: ['image', 'video'] });
    add({ id: MENU.REVEAL, parentId: MENU.ROOT, title: t('menuReveal'), contexts: ['all'] });
  });
}

chrome.runtime.onInstalled.addListener(buildMenus);
chrome.runtime.onStartup.addListener(buildMenus);

async function inject(tabId, frameId) {
  const target = frameId == null
    ? { tabId, allFrames: true }
    : { tabId, frameIds: [frameId] };
  await chrome.scripting.executeScript({ target, files: ['src/content.js'] });
}

async function send(tabId, frameId, msg) {
  // 画面上のUIは全フレームで起動すると案内が重なるので最上位だけにする
  if (frameId == null && (msg.type === 'pick' || msg.type === 'rect')) frameId = 0;
  try {
    await inject(tabId, frameId);
  } catch (e) {
    console.warn('inject failed', e);
    return;
  }
  const opts = frameId == null ? undefined : { frameId };
  try {
    await chrome.tabs.sendMessage(tabId, msg, opts);
  } catch (_) {
    // 応答しないフレームがあっても無視
  }
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab || tab.id == null) return;
  const frameId = info.frameId ?? 0;
  switch (info.menuItemId) {
    case MENU.HIDE_SEL:
      return send(tab.id, frameId, { type: 'apply-selection', mode: 'hide' });
    case MENU.FRAME_SEL:
      return send(tab.id, frameId, { type: 'apply-selection', mode: 'frame' });
    case MENU.HIDE_MEDIA:
      return send(tab.id, frameId, { type: 'apply-src', srcUrl: info.srcUrl, mode: 'hide' });
    case MENU.FRAME_MEDIA:
      return send(tab.id, frameId, { type: 'apply-src', srcUrl: info.srcUrl, mode: 'frame' });
    case MENU.REVEAL:
      return send(tab.id, null, { type: 'reveal-all' });
  }
});

chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || tab.id == null) return;
  const msg = {
    'hide-selection': { type: 'apply-selection', mode: 'hide' },
    'frame-selection': { type: 'apply-selection', mode: 'frame' },
    'rect-mode': { type: 'rect' },
    'pick-element': { type: 'pick' },
    'reveal-all': { type: 'reveal-all' }
  }[command];
  if (msg) send(tab.id, null, msg);
});

// popup からの依頼
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.type !== 'relay') return;
  chrome.tabs.query({ active: true, currentWindow: true }).then(async ([tab]) => {
    if (tab && tab.id != null) await send(tab.id, null, msg.payload);
    sendResponse({ ok: true });
  });
  return true;
});
