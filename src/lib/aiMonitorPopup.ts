const PENDING_NAME = 'ai-monitor-pending';
const POPUP_FEATURES = 'popup=yes,width=1100,height=800,resizable=yes,scrollbars=yes';

interface PendingPopup {
  token: string;
  window: Window;
}

let pendingPopup: PendingPopup | null = null;
const roomPopups = new Map<string, Window>();

function normalizeRoomId(roomId: unknown): string | null {
  if (typeof roomId !== 'string') return null;
  const normalized = roomId.trim();
  return normalized ? normalized : null;
}

function roomWindowName(roomId: string): string | null {
  const normalized = normalizeRoomId(roomId);
  if (!normalized) return null;
  try { return `ai-monitor-${encodeURIComponent(normalized)}`; } catch { return null; }
}

function monitorUrl(roomId: string): string | null {
  const normalized = normalizeRoomId(roomId);
  if (!normalized) return null;
  try {
    return new URL(`/game/${encodeURIComponent(normalized)}/ai-monitor`, window.location.origin).toString();
  } catch {
    return null;
  }
}

function isOpen(popup: Window | null | undefined): popup is Window {
  try {
    return Boolean(popup && !popup.closed);
  } catch {
    return false;
  }
}

function closeWindow(popup: Window): void {
  try { popup.close(); } catch { /* the browser may already have closed it */ }
}

function preparePlaceholder(popup: Window): void {
  try {
    popup.document.title = 'AI Monitor 준비 중';
    popup.document.body.textContent = 'AI Monitor 연결을 준비하는 중입니다.';
  } catch {
    // A browser may expose the reference before the document is writable.
  }
}

function moveToMonitor(popup: Window, url: string): boolean {
  let currentUrl = '';
  try { currentUrl = popup.location.href; } catch { /* try the setter below */ }
  if (currentUrl === url) return true;
  try {
    popup.location.href = url;
    return true;
  } catch {
    return false;
  }
}

export function prepareAiMonitorPopup(token: string): boolean {
  if (isOpen(pendingPopup?.window)) {
    pendingPopup = { token, window: pendingPopup.window };
    return true;
  }
  pendingPopup = null;

  const popup = (() => {
    try { return window.open('', PENDING_NAME, POPUP_FEATURES); } catch { return null; }
  })();
  if (!isOpen(popup)) return false;

  preparePlaceholder(popup);
  pendingPopup = { token, window: popup };
  return true;
}

export function promoteAiMonitorPopup(token: string, roomId: string): Window | null {
  const url = monitorUrl(roomId);
  const name = roomWindowName(roomId);
  if (!url || !name || !pendingPopup || pendingPopup.token !== token || !isOpen(pendingPopup.window)) {
    if (pendingPopup?.token === token) closePendingAiMonitorPopup(token);
    return null;
  }

  const popup = pendingPopup.window;
  pendingPopup = null;

  try { popup.name = name; } catch { /* keep the pending browsing context name */ }
  if (!moveToMonitor(popup, url)) {
    if (isOpen(popup)) closeWindow(popup);
    return null;
  }
  roomPopups.set(normalizeRoomId(roomId)!, popup);
  try { popup.opener = null; } catch { /* retain opener when the browser disallows this */ }
  return popup;
}

export function closePendingAiMonitorPopup(token: string): void {
  if (!pendingPopup || pendingPopup.token !== token) return;
  const popup = pendingPopup.window;
  pendingPopup = null;
  if (isOpen(popup)) closeWindow(popup);
}

export function openAiMonitor(roomId: string): boolean {
  const normalized = normalizeRoomId(roomId);
  const url = normalized ? monitorUrl(normalized) : null;
  const name = normalized ? roomWindowName(normalized) : null;
  if (!normalized || !url || !name) return false;

  const current = roomPopups.get(normalized);
  if (isOpen(current)) {
    if (moveToMonitor(current, url)) {
      try { current.focus(); } catch { /* focus is optional */ }
      return true;
    }
    roomPopups.delete(normalized);
    closeWindow(current);
  }
  if (current) roomPopups.delete(normalized);

  const popup = (() => {
    try { return window.open(url, name, POPUP_FEATURES); } catch { return null; }
  })();
  if (!isOpen(popup)) return false;
  roomPopups.set(normalized, popup);
  return true;
}
