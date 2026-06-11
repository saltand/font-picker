type HighlighterMessage = {
  type: 'DOM_HIGHLIGHTER_START';
};

type PlatformFont = {
  familyName: string;
  postScriptName: string;
  isCustomFont: boolean;
  glyphCount: number;
};

type RenderedFontsResponse = {
  fonts?: PlatformFont[];
  error?: string;
};

type ComputedFontInfo = {
  family: string;
  size: string;
  style: string;
  weight: string;
};

const overlayId = 'dom-hover-highlighter-overlay';
const fontPanelId = 'dom-hover-highlighter-font-panel';
const hintId = 'dom-hover-highlighter-hint';
const overlayOwnerAttribute = 'data-dom-hover-highlighter-owner';
const targetMarkerAttribute = 'data-dom-hover-highlighter-target';
const targetMarkerPrefix = 'dom-hover-highlighter-target-';
const instanceId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
const overlayStyle = {
  border: '2px solid #2f7df6',
  boxShadow: '0 0 0 1px rgba(255, 255, 255, 0.9), 0 0 0 4px rgba(47, 125, 246, 0.18)',
  boxSizing: 'border-box',
  display: 'none',
  left: '0',
  pointerEvents: 'none',
  position: 'fixed',
  top: '0',
  willChange: 'transform, width, height',
  zIndex: '2147483647',
} satisfies Partial<CSSStyleDeclaration>;
const fontPanelStyle = {
  background: 'rgba(20, 24, 31, 0.96)',
  border: '1px solid rgba(255, 255, 255, 0.16)',
  borderRadius: '6px',
  boxShadow: '0 10px 28px rgba(0, 0, 0, 0.24)',
  color: '#ffffff',
  display: 'none',
  fontFamily:
    'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
  fontSize: '12px',
  left: '0',
  lineHeight: '1.45',
  maxWidth: '360px',
  padding: '8px 10px',
  pointerEvents: 'none',
  position: 'fixed',
  top: '0',
  whiteSpace: 'normal',
  zIndex: '2147483647',
} satisfies Partial<CSSStyleDeclaration>;
const hintStyle = {
  background: 'rgba(47, 125, 246, 0.96)',
  border: '1px solid rgba(255, 255, 255, 0.35)',
  borderRadius: '6px',
  boxShadow: '0 8px 20px rgba(0, 0, 0, 0.22)',
  color: '#ffffff',
  display: 'none',
  fontFamily:
    'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  fontSize: '12px',
  fontWeight: '600',
  left: '0',
  lineHeight: '1.35',
  maxWidth: 'min(420px, calc(100vw - 16px))',
  padding: '5px 8px',
  pointerEvents: 'none',
  position: 'fixed',
  top: '0',
  whiteSpace: 'nowrap',
  zIndex: '2147483647',
} satisfies Partial<CSSStyleDeclaration>;

let active = false;
let overlay: HTMLDivElement | undefined;
let fontPanel: HTMLDivElement | undefined;
let hint: HTMLDivElement | undefined;
let lastMouseX = 0;
let lastMouseY = 0;
let candidates: Element[] = [];
let selectedIndex = 0;
let markedElement: Element | undefined;
let currentFontTarget: Element | undefined;
let currentCopyText: string | undefined;
let fontRequestId = 0;
let fontLookupTimeout: number | undefined;
let copiedFeedbackTimeout: number | undefined;

export default defineContentScript({
  matches: ['http://*/*', 'https://*/*'],
  registration: 'runtime',
  main() {
    browser.runtime.onMessage.addListener((message: HighlighterMessage) => {
      if (message.type === 'DOM_HIGHLIGHTER_START') {
        startHighlighter();
      }
    });
  },
});

function startHighlighter() {
  if (active) return;

  removeExistingChrome();
  active = true;
  overlay = createOverlay();
  fontPanel = createFontPanel();
  hint = createHint();
  document.documentElement.append(overlay);
  document.documentElement.append(fontPanel);
  document.documentElement.append(hint);

  window.addEventListener('mousemove', onMouseMove, true);
  window.addEventListener('pointerdown', onPointerDown, true);
  window.addEventListener('pointerup', onPointerFollowup, true);
  window.addEventListener('mousedown', onMouseDown, true);
  window.addEventListener('mouseup', onMouseFollowup, true);
  window.addEventListener('click', onMouseFollowup, true);
  window.addEventListener('dblclick', onMouseFollowup, true);
  window.addEventListener('auxclick', onMouseFollowup, true);
  window.addEventListener('contextmenu', onContextMenu, true);
  window.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('scroll', refreshHighlight, true);
  window.addEventListener('resize', refreshHighlight, true);
}

function stopHighlighter() {
  if (!active) return;

  active = false;
  candidates = [];
  selectedIndex = 0;
  currentFontTarget = undefined;
  currentCopyText = undefined;
  clearFontLookupTimeout();
  clearCopiedFeedbackTimeout();
  clearMarkedElement();

  window.removeEventListener('mousemove', onMouseMove, true);
  window.removeEventListener('pointerdown', onPointerDown, true);
  window.removeEventListener('pointerup', onPointerFollowup, true);
  window.removeEventListener('mousedown', onMouseDown, true);
  window.removeEventListener('mouseup', onMouseFollowup, true);
  window.removeEventListener('click', onMouseFollowup, true);
  window.removeEventListener('dblclick', onMouseFollowup, true);
  window.removeEventListener('auxclick', onMouseFollowup, true);
  window.removeEventListener('contextmenu', onContextMenu, true);
  window.removeEventListener('keydown', onKeyDown, true);
  window.removeEventListener('scroll', refreshHighlight, true);
  window.removeEventListener('resize', refreshHighlight, true);

  overlay?.remove();
  fontPanel?.remove();
  hint?.remove();
  overlay = undefined;
  fontPanel = undefined;
  hint = undefined;

  browser.runtime.sendMessage({ type: 'DOM_HIGHLIGHTER_STOP' }).catch(() => undefined);
}

function createOverlay() {
  const element = document.createElement('div');
  element.id = overlayId;
  element.setAttribute(overlayOwnerAttribute, instanceId);
  element.setAttribute('aria-hidden', 'true');
  Object.assign(element.style, overlayStyle);
  element.style.transition = getOverlayTransition();
  return element;
}

function createFontPanel() {
  const element = document.createElement('div');
  element.id = fontPanelId;
  element.setAttribute(overlayOwnerAttribute, instanceId);
  element.setAttribute('aria-hidden', 'true');
  Object.assign(element.style, fontPanelStyle);
  element.style.transition = getPanelTransition();
  return element;
}

function createHint() {
  const element = document.createElement('div');
  element.id = hintId;
  element.setAttribute(overlayOwnerAttribute, instanceId);
  element.setAttribute('aria-hidden', 'true');
  element.textContent = getMessage('highlighterHint');
  Object.assign(element.style, hintStyle);
  element.style.transition = getPanelTransition();
  return element;
}

function removeExistingChrome() {
  document.querySelectorAll(`#${overlayId}, #${fontPanelId}, #${hintId}`).forEach((element) => {
    element.remove();
  });
}

function getOverlayTransition() {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion) return 'none';

  return 'transform 120ms cubic-bezier(0.455, 0.03, 0.515, 0.955), width 120ms cubic-bezier(0.455, 0.03, 0.515, 0.955), height 120ms cubic-bezier(0.455, 0.03, 0.515, 0.955)';
}

function getPanelTransition() {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion) return 'none';

  return 'transform 120ms cubic-bezier(0.455, 0.03, 0.515, 0.955), opacity 120ms ease';
}

function onMouseMove(event: MouseEvent) {
  lastMouseX = event.clientX;
  lastMouseY = event.clientY;

  const nextCandidates = getCandidates(lastMouseX, lastMouseY);
  if (!isSameCandidateStack(candidates, nextCandidates)) {
    selectedIndex = 0;
  }

  candidates = nextCandidates;
  renderHighlight();
}

function onKeyDown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    stopHighlighter();
    return;
  }

  if (event.key === 'ArrowDown') {
    event.preventDefault();
    event.stopPropagation();
    selectedIndex = Math.max(0, selectedIndex - 1);
    renderHighlight();
    return;
  }

  if (event.key === 'ArrowUp') {
    event.preventDefault();
    event.stopPropagation();
    selectedIndex = Math.min(Math.max(0, candidates.length - 1), selectedIndex + 1);
    renderHighlight();
  }
}

function onMouseDown(event: MouseEvent) {
  blockEvent(event);
}

function onPointerDown(event: PointerEvent) {
  blockEvent(event);
}

function onMouseFollowup(event: MouseEvent) {
  blockEvent(event);
}

function onPointerFollowup(event: PointerEvent) {
  blockEvent(event);
}

function onContextMenu(event: MouseEvent) {
  blockEvent(event);
  copySelectedFontInfo().catch(() => {
    showCopyFeedback(getMessage('copyFailed'));
  });
}

function blockEvent(event: Event) {
  event.preventDefault();
  event.stopImmediatePropagation();
  event.stopPropagation();
}

function refreshHighlight() {
  if (!active) return;

  candidates = getCandidates(lastMouseX, lastMouseY);
  selectedIndex = Math.min(selectedIndex, Math.max(0, candidates.length - 1));
  renderHighlight();
}

function getCandidates(clientX: number, clientY: number) {
  return document
    .elementsFromPoint(clientX, clientY)
    .filter((element) => element.id !== overlayId)
    .filter((element) => element.id !== fontPanelId)
    .filter(isHighlightableElement);
}

function isSameCandidateStack(current: Element[], next: Element[]) {
  return current.length === next.length && current.every((element, index) => element === next[index]);
}

function isHighlightableElement(element: Element) {
  if (element === document.documentElement || element === document.body) {
    return false;
  }

  if (!(element instanceof HTMLElement || element instanceof SVGElement)) {
    return false;
  }

  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return false;
  }

  const computedStyle = window.getComputedStyle(element);
  return computedStyle.visibility !== 'hidden' && computedStyle.display !== 'none';
}

function renderHighlight() {
  if (!overlay || !fontPanel || !ownsChrome()) return;

  const target = candidates[selectedIndex];
  if (!target) {
    overlay.style.display = 'none';
    hideHint();
    hideFontPanel();
    currentFontTarget = undefined;
    currentCopyText = undefined;
    clearFontLookupTimeout();
    clearMarkedElement();
    return;
  }

  const rect = target.getBoundingClientRect();
  overlay.style.display = 'block';
  overlay.style.transform = `translate(${Math.round(rect.left)}px, ${Math.round(rect.top)}px)`;
  overlay.style.width = `${Math.round(rect.width)}px`;
  overlay.style.height = `${Math.round(rect.height)}px`;

  positionHint(rect);
  positionFontPanel(rect);
  queueRenderedFontLookup(target);
}

function positionHint(rect: DOMRect) {
  if (!hint || !ownsChrome()) return;

  hint.style.display = 'block';
  const hintWidth = hint.offsetWidth || 260;
  const hintHeight = hint.offsetHeight || 28;
  const left = Math.min(Math.max(8, rect.left), Math.max(8, window.innerWidth - hintWidth - 8));
  const top = Math.max(8, rect.top - hintHeight - 8);

  hint.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
}

function positionFontPanel(rect: DOMRect) {
  if (!fontPanel || !ownsChrome()) return;

  const panelWidth = Math.min(360, window.innerWidth - 16);
  const panelHeight = fontPanel.offsetHeight || 72;
  const left = Math.min(Math.max(8, rect.left), Math.max(8, window.innerWidth - panelWidth - 8));
  const belowTop = rect.bottom + 8;
  const top = belowTop + panelHeight <= window.innerHeight - 8 ? belowTop : Math.max(8, rect.top - panelHeight - 8);

  fontPanel.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
}

function hideHint() {
  if (!hint || !ownsChrome()) return;

  hint.style.display = 'none';
}

function hideFontPanel() {
  if (!fontPanel || !ownsChrome()) return;

  fontPanel.style.display = 'none';
  fontPanel.textContent = '';
}

function queueRenderedFontLookup(target: Element) {
  if (!fontPanel || !ownsChrome() || currentFontTarget === target) return;

  currentFontTarget = target;
  currentCopyText = undefined;
  clearFontLookupTimeout();
  showFontPanelMessage(getMessage('renderedFontsLoading'));

  fontLookupTimeout = window.setTimeout(() => {
    requestRenderedFonts(target).catch(() => {
      showFontPanelMessage(getMessage('renderedFontsUnavailable'));
    });
  }, 80);
}

async function requestRenderedFonts(target: Element) {
  const requestId = ++fontRequestId;
  const probeTarget = findFontProbeElement(target) ?? target;
  const computedFont = getComputedFontInfo(probeTarget);
  const markerValue = `${targetMarkerPrefix}${Date.now().toString(36)}-${requestId.toString(36)}-${Math.random()
    .toString(36)
    .slice(2)}`;
  markTargetElement(probeTarget, markerValue);

  const response = (await browser.runtime.sendMessage({
    type: 'DOM_HIGHLIGHTER_GET_RENDERED_FONTS',
    markerAttribute: targetMarkerAttribute,
    markerValue,
  })) as RenderedFontsResponse | undefined;

  if (requestId !== fontRequestId || currentFontTarget !== target) return;

  if (response?.error) {
    showFontPanelMessage(getMessage('renderedFontsUnavailableWithError', response.error));
    positionFontPanel(target.getBoundingClientRect());
    return;
  }

  renderFontPanel(response?.fonts ?? [], computedFont);
  positionFontPanel(target.getBoundingClientRect());
}

function markTargetElement(target: Element, markerValue: string) {
  clearMarkedElement();
  target.setAttribute(targetMarkerAttribute, markerValue);
  markedElement = target;
}

function clearMarkedElement() {
  markedElement?.removeAttribute(targetMarkerAttribute);
  markedElement = undefined;
}

function clearFontLookupTimeout() {
  if (fontLookupTimeout === undefined) return;

  window.clearTimeout(fontLookupTimeout);
  fontLookupTimeout = undefined;
}

function clearCopiedFeedbackTimeout() {
  if (copiedFeedbackTimeout === undefined) return;

  window.clearTimeout(copiedFeedbackTimeout);
  copiedFeedbackTimeout = undefined;
}

function showFontPanelMessage(message: string) {
  if (!fontPanel || !ownsChrome()) return;

  fontPanel.style.display = 'block';
  fontPanel.textContent = message;
}

function showCopyFeedback(message: string) {
  if (!hint || !ownsChrome()) return;

  clearCopiedFeedbackTimeout();
  const originalMessage = getMessage('highlighterHint');
  hint.textContent = message;
  copiedFeedbackTimeout = window.setTimeout(() => {
    if (hint && ownsChrome()) {
      hint.textContent = originalMessage;
      positionHint(candidates[selectedIndex]?.getBoundingClientRect() ?? new DOMRect());
    }
    copiedFeedbackTimeout = undefined;
  }, 1100);
}

async function copySelectedFontInfo() {
  const target = candidates[selectedIndex];
  if (!target) return;

  const text = getCopyText(target);
  await writeClipboard(text);
  showCopyFeedback(getMessage('copied'));
}

function getCopyText(target: Element) {
  if (currentFontTarget === target && currentCopyText) {
    return currentCopyText;
  }

  const probeTarget = findFontProbeElement(target) ?? target;
  const computedFont = getComputedFontInfo(probeTarget);
  return formatComputedFontInfo(computedFont);
}

async function writeClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', 'true');
  textarea.style.left = '-9999px';
  textarea.style.position = 'fixed';
  textarea.style.top = '0';
  document.documentElement.append(textarea);
  textarea.select();

  try {
    if (!document.execCommand('copy')) {
      throw new Error('Copy command failed.');
    }
  } finally {
    textarea.remove();
  }
}

function findFontProbeElement(target: Element) {
  if (hasOwnVisibleText(target)) {
    return target;
  }

  const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.textContent?.trim()) {
        return NodeFilter.FILTER_REJECT;
      }

      const parent = node.parentElement;
      if (!parent || !isHighlightableElement(parent)) {
        return NodeFilter.FILTER_REJECT;
      }

      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const textNode = walker.nextNode();
  return textNode?.parentElement;
}

function hasOwnVisibleText(element: Element) {
  return Array.from(element.childNodes).some(
    (node) => node.nodeType === Node.TEXT_NODE && Boolean(node.textContent?.trim()),
  );
}

function getComputedFontInfo(target: Element): ComputedFontInfo {
  const style = window.getComputedStyle(target);

  return {
    family: style.fontFamily,
    size: style.fontSize,
    style: style.fontStyle,
    weight: style.fontWeight,
  };
}

function renderFontPanel(fonts: PlatformFont[], computedFont: ComputedFontInfo) {
  if (!fontPanel || !ownsChrome()) return;

  fontPanel.style.display = 'block';

  if (fonts.length === 0) {
    currentCopyText = [
      `${getMessage('renderedFonts')}: ${getMessage('noneReported')}`,
      formatComputedFontInfo(computedFont),
    ].join('\n');
    fontPanel.replaceChildren(
      createFontRow(getMessage('renderedFonts'), getMessage('noneReported')),
      createFontRow(getMessage('computedFamily'), computedFont.family),
      createFontRow(getMessage('computedSize'), computedFont.size),
      createFontRow(getMessage('computedStyle'), `${computedFont.style} ${computedFont.weight}`),
    );
    return;
  }

  currentCopyText = fonts.map(formatPlatformFont).join('\n\n');
  fontPanel.replaceChildren(...fonts.flatMap((font, index) => createFontRows(font, index)));
}

function formatComputedFontInfo(computedFont: ComputedFontInfo) {
  return [
    `${getMessage('computedFamily')}: ${computedFont.family}`,
    `${getMessage('computedSize')}: ${computedFont.size}`,
    `${getMessage('computedStyle')}: ${computedFont.style} ${computedFont.weight}`,
  ].join('\n');
}

function formatPlatformFont(font: PlatformFont) {
  return [
    `${getMessage('familyName')}: ${font.familyName}`,
    `${getMessage('postScriptName')}: ${font.postScriptName || getMessage('unavailable')}`,
    `${getMessage('fontOrigin')}: ${font.isCustomFont ? getMessage('webFont') : getMessage('localFile')} (${
      font.glyphCount
    } ${getMessage('glyphs')})`,
  ].join('\n');
}

function createFontRows(font: PlatformFont, index: number) {
  const rows: HTMLElement[] = [];

  if (index > 0) {
    const separator = document.createElement('div');
    separator.style.borderTop = '1px solid rgba(255, 255, 255, 0.14)';
    separator.style.margin = '6px 0';
    rows.push(separator);
  }

  rows.push(createFontRow(getMessage('familyName'), font.familyName));
  rows.push(createFontRow(getMessage('postScriptName'), font.postScriptName || getMessage('unavailable')));
  rows.push(
    createFontRow(
      getMessage('fontOrigin'),
      `${font.isCustomFont ? getMessage('webFont') : getMessage('localFile')} (${font.glyphCount} ${getMessage(
        'glyphs',
      )})`,
    ),
  );

  return rows;
}

function createFontRow(label: string, value: string) {
  const row = document.createElement('div');
  row.textContent = `${label}: ${value}`;
  return row;
}

function getMessage(key: string, substitutions?: string | string[]) {
  const getExtensionMessage = browser.i18n.getMessage as (
    messageName: string,
    substitutions?: string | string[],
  ) => string;

  return getExtensionMessage(key, substitutions) || key;
}

function ownsChrome() {
  return (
    overlay?.isConnected === true &&
    fontPanel?.isConnected === true &&
    hint?.isConnected === true &&
    overlay.getAttribute(overlayOwnerAttribute) === instanceId &&
    fontPanel.getAttribute(overlayOwnerAttribute) === instanceId &&
    hint.getAttribute(overlayOwnerAttribute) === instanceId
  );
}
