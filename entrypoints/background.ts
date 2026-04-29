type HighlighterMessage =
  | {
      type: 'DOM_HIGHLIGHTER_START';
    }
  | {
      type: 'DOM_HIGHLIGHTER_STOP';
    }
  | {
      type: 'DOM_HIGHLIGHTER_GET_RENDERED_FONTS';
      markerAttribute: string;
      markerValue: string;
    };

type Debuggee = {
  tabId: number;
};

type CdpNode = {
  nodeId: number;
};

type GetDocumentResult = {
  root: CdpNode;
};

type QuerySelectorResult = {
  nodeId: number;
};

type PlatformFont = {
  familyName: string;
  postScriptName: string;
  isCustomFont: boolean;
  glyphCount: number;
};

type GetPlatformFontsResult = {
  fonts: PlatformFont[];
};

const attachedDebuggeeTabIds = new Set<number>();

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

  browser.runtime.onMessage.addListener((message: HighlighterMessage, sender, sendResponse) => {
    if (message.type === 'DOM_HIGHLIGHTER_STOP') {
      if (sender.tab?.id) {
        detachDebuggerForTab(sender.tab.id).catch(() => undefined);
      }

      return;
    }

    if (message.type !== 'DOM_HIGHLIGHTER_GET_RENDERED_FONTS') return;
    if (!sender.tab?.id) {
      sendResponse({ fonts: [], error: 'No active tab was available.' });
      return;
    }

    getRenderedFontsForMarkedElement(sender.tab.id, message.markerAttribute, message.markerValue)
      .then(sendResponse)
      .catch((error) => {
        sendResponse({
          fonts: [],
          error: error instanceof Error ? error.message : 'Rendered fonts could not be read.',
        });
      });

    return true;
  });

  browser.tabs.onRemoved.addListener((tabId) => {
    attachedDebuggeeTabIds.delete(tabId);
  });
});

async function sendStartMessage(tabId: number) {
  return browser.tabs
    .sendMessage(tabId, { type: 'DOM_HIGHLIGHTER_START' })
    .then(() => true)
    .catch(() => false);
}

async function getRenderedFontsForMarkedElement(tabId: number, markerAttribute: string, markerValue: string) {
  const debuggee = { tabId };

  try {
    await ensureDebuggerAttached(debuggee);
    await sendDebuggerCommand(debuggee, 'DOM.enable');
    await sendDebuggerCommand(debuggee, 'CSS.enable');
    const documentResult = await sendDebuggerCommand<GetDocumentResult>(debuggee, 'DOM.getDocument', {
      depth: -1,
      pierce: false,
    });
    const selectorResult = await sendDebuggerCommand<QuerySelectorResult>(debuggee, 'DOM.querySelector', {
      nodeId: documentResult.root.nodeId,
      selector: `[${markerAttribute}="${markerValue}"]`,
    });

    if (!selectorResult.nodeId) {
      return { fonts: [], error: 'The selected element was not found.' };
    }

    const fontResult = await sendDebuggerCommand<GetPlatformFontsResult>(
      debuggee,
      'CSS.getPlatformFontsForNode',
      {
        nodeId: selectorResult.nodeId,
      },
    );

    return { fonts: fontResult.fonts ?? [] };
  } catch (error) {
    return { fonts: [], error: error instanceof Error ? error.message : 'Rendered fonts could not be read.' };
  }
}

async function ensureDebuggerAttached(debuggee: Debuggee) {
  if (attachedDebuggeeTabIds.has(debuggee.tabId)) return;

  await attachDebugger(debuggee);
  attachedDebuggeeTabIds.add(debuggee.tabId);
}

async function detachDebuggerForTab(tabId: number) {
  if (!attachedDebuggeeTabIds.has(tabId)) return;

  await detachDebugger({ tabId });
  attachedDebuggeeTabIds.delete(tabId);
}

function attachDebugger(debuggee: Debuggee) {
  return new Promise<void>((resolve, reject) => {
    chrome.debugger.attach(debuggee, '1.3', () => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }

      resolve();
    });
  });
}

function detachDebugger(debuggee: Debuggee) {
  return new Promise<void>((resolve, reject) => {
    chrome.debugger.detach(debuggee, () => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }

      resolve();
    });
  });
}

function sendDebuggerCommand<T = unknown>(debuggee: Debuggee, method: string, commandParams?: object) {
  return new Promise<T>((resolve, reject) => {
    chrome.debugger.sendCommand(debuggee, method, commandParams, (result) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }

      resolve(result as T);
    });
  });
}
