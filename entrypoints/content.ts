type HighlighterMessage = {
  type: 'DOM_HIGHLIGHTER_START';
};

const overlayId = 'dom-hover-highlighter-overlay';
const overlayStyle = {
  border: '2px solid #2f7df6',
  boxShadow: '0 0 0 1px rgba(255, 255, 255, 0.9), 0 0 0 4px rgba(47, 125, 246, 0.18)',
  boxSizing: 'border-box',
  display: 'none',
  left: '0',
  pointerEvents: 'none',
  position: 'fixed',
  top: '0',
  zIndex: '2147483647',
} satisfies Partial<CSSStyleDeclaration>;

let active = false;
let overlay: HTMLDivElement | undefined;
let lastMouseX = 0;
let lastMouseY = 0;
let candidates: Element[] = [];
let selectedIndex = 0;

export default defineContentScript({
  matches: ['http://*/*', 'https://*/*'],
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

  active = true;
  overlay = createOverlay();
  document.documentElement.append(overlay);

  window.addEventListener('mousemove', onMouseMove, true);
  window.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('scroll', refreshHighlight, true);
  window.addEventListener('resize', refreshHighlight, true);
}

function stopHighlighter() {
  if (!active) return;

  active = false;
  candidates = [];
  selectedIndex = 0;

  window.removeEventListener('mousemove', onMouseMove, true);
  window.removeEventListener('keydown', onKeyDown, true);
  window.removeEventListener('scroll', refreshHighlight, true);
  window.removeEventListener('resize', refreshHighlight, true);

  overlay?.remove();
  overlay = undefined;
}

function createOverlay() {
  const element = document.createElement('div');
  element.id = overlayId;
  element.setAttribute('aria-hidden', 'true');
  Object.assign(element.style, overlayStyle);
  return element;
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

  if (event.key === 'Shift') {
    event.preventDefault();
    event.stopPropagation();
    selectedIndex = Math.max(0, selectedIndex - 1);
    renderHighlight();
    return;
  }

  if (event.key === 'Control') {
    event.preventDefault();
    event.stopPropagation();
    selectedIndex = Math.min(Math.max(0, candidates.length - 1), selectedIndex + 1);
    renderHighlight();
  }
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
  if (!overlay) return;

  const target = candidates[selectedIndex];
  if (!target) {
    overlay.style.display = 'none';
    return;
  }

  const rect = target.getBoundingClientRect();
  overlay.style.display = 'block';
  overlay.style.transform = `translate(${Math.round(rect.left)}px, ${Math.round(rect.top)}px)`;
  overlay.style.width = `${Math.round(rect.width)}px`;
  overlay.style.height = `${Math.round(rect.height)}px`;
}
