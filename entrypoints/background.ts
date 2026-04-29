export default defineBackground(() => {
  browser.action.onClicked.addListener(async (tab) => {
    const tabId = tab.id;
    if (!tabId) return;

    const started = await sendStartMessage(tabId);
    if (started) return;

    await browser.scripting
      .executeScript({
        target: { tabId },
        files: ['/content-scripts/content.js'],
      })
      .then(() => sendStartMessage(tabId))
      .catch(() => {
        // Content scripts cannot run on protected browser pages.
      });
  });
});

async function sendStartMessage(tabId: number) {
  return browser.tabs
    .sendMessage(tabId, { type: 'DOM_HIGHLIGHTER_START' })
    .then(() => true)
    .catch(() => false);
}
