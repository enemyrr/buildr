export interface NavigationHistoryEntry {
  pathname: string;
  /** Focused tab of a workspace route; null off workspace routes or before a tab is focused. */
  tabId: string | null;
}

export interface NavigationHistoryState {
  entries: NavigationHistoryEntry[];
  index: number;
  /** Index a back/forward step is travelling to; its arrival moves the cursor, not a push. */
  pendingIndex: number | null;
}

export const EMPTY_NAVIGATION_HISTORY: NavigationHistoryState = {
  entries: [],
  index: -1,
  pendingIndex: null,
};

const MAX_NAVIGATION_HISTORY_ENTRIES = 100;

// Startup and agent URLs redirect on mount. Recording them would make Back bounce forward again.
const REDIRECT_PATHNAME_PATTERNS = [/^\/?$/, /^\/h\/[^/]+\/?$/, /^\/h\/[^/]+\/agent\//];

export function isNavigationHistoryPathname(pathname: string): boolean {
  return !REDIRECT_PATHNAME_PATTERNS.some((pattern) => pattern.test(pathname));
}

function replaceEntryAt(
  state: NavigationHistoryState,
  index: number,
  entry: NavigationHistoryEntry,
): NavigationHistoryState {
  const entries = state.entries.slice();
  entries[index] = entry;
  return { entries, index, pendingIndex: null };
}

function pushEntry(
  state: NavigationHistoryState,
  entry: NavigationHistoryEntry,
): NavigationHistoryState {
  const entries = [...state.entries.slice(0, state.index + 1), entry].slice(
    -MAX_NAVIGATION_HISTORY_ENTRIES,
  );
  return { entries, index: entries.length - 1, pendingIndex: null };
}

export function recordNavigationHistoryEntry(
  state: NavigationHistoryState,
  entry: NavigationHistoryEntry,
): NavigationHistoryState {
  if (state.pendingIndex !== null) {
    const pending = state.entries[state.pendingIndex];
    if (pending?.pathname === entry.pathname) {
      return replaceEntryAt(state, state.pendingIndex, entry);
    }
  }

  const current = state.entries[state.index];
  if (current?.pathname !== entry.pathname) {
    return pushEntry(state, entry);
  }
  // A workspace briefly drops pane focus (menus, unread marking); that is not a new location.
  if (entry.tabId === null || entry.tabId === current.tabId) {
    return state.pendingIndex === null ? state : { ...state, pendingIndex: null };
  }
  if (current.tabId === null) {
    return replaceEntryAt(state, state.index, entry);
  }
  return pushEntry(state, entry);
}

export function stepNavigationHistory(
  state: NavigationHistoryState,
  delta: 1 | -1,
): { state: NavigationHistoryState; entry: NavigationHistoryEntry } | null {
  const index = state.index + delta;
  const entry = state.entries[index];
  if (!entry) {
    return null;
  }
  return { state: { ...state, index, pendingIndex: index }, entry };
}

export function canStepNavigationHistory(state: NavigationHistoryState, delta: 1 | -1): boolean {
  return state.entries[state.index + delta] !== undefined;
}
