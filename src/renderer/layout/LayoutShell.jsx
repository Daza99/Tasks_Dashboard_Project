import React, { useEffect, useMemo } from 'react';
import TopBar from './TopBar';
import LeftNav from './LeftNav';
import CenterBrief from './CenterBrief';
import RightRail from './RightRail';
import { useLayout } from '../context/LayoutContext';
import { useDatabase } from '../context/DatabaseContext';
import {
  HOTKEY_ACTIONS,
  eventMatchesCombo,
  parseHotkeys,
} from '../../utils/hotkeys.js';

/** True when Home should stay with the field (caret-to-start). */
function isTypingTarget(el) {
  if (!el || typeof el !== 'object') return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return Boolean(el.isContentEditable);
}

/**
 * Shell: Compact (3-col) vs Focus (full center view).
 * @param {{
 *   activeView: string|null,
 *   onNavigate: (id: string) => void,
 *   onEditRequest?: (type: string, id: number) => void,
 *   focusContent: React.ReactNode
 * }} props
 */
export default function LayoutShell({
  activeView,
  onNavigate,
  onEditRequest,
  focusContent,
}) {
  const { isCompact, isFocus, enterFocus, enterCompact } = useLayout();
  const { settings } = useDatabase();
  const hotkeys = useMemo(() => parseHotkeys(settings?.hotkeys), [settings?.hotkeys]);

  function handleEditRequest(type, id) {
    onEditRequest?.(type, id);
    enterFocus();
  }

  // Home → Compact; Ctrl+letter nav — skip while typing in a field
  useEffect(() => {
    function onKey(e) {
      if (isTypingTarget(e.target)) return;
      if (e.key === 'Home') {
        if (isCompact) return;
        e.preventDefault();
        enterCompact();
        return;
      }
      for (const action of HOTKEY_ACTIONS) {
        if (eventMatchesCombo(e, hotkeys[action.id])) {
          e.preventDefault();
          onNavigate(action.view);
          enterFocus();
          return;
        }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isCompact, enterCompact, enterFocus, hotkeys, onNavigate]);

  return (
    <div className="app-root">
      <TopBar
        activeView={activeView}
        onEditRequest={handleEditRequest}
        onNavigate={onNavigate}
        calendarHotkey={hotkeys.calendar}
      />
      <div
        className={`layout-main layout-main--${isCompact ? 'compact' : 'focus'}`}
      >
        {isCompact && (
          <LeftNav activeView={activeView} onNavigate={onNavigate} />
        )}

        {isCompact ? (
          <CenterBrief onEditRequest={handleEditRequest} onNavigate={onNavigate} />
        ) : (
          <div className="center-panel glass-panel focus-host">
            <button
              type="button"
              className="btn-focus-back"
              onClick={enterCompact}
              aria-label="Back to Compact"
              title="Compact (Home)"
            >
              ←
            </button>
            {focusContent}
          </div>
        )}

        {isCompact && <RightRail onNavigate={onNavigate} />}
      </div>

      <footer className="status-bar">
        <span>
          Connection: <strong>OFFLINE</strong>
        </span>
        <span>Sync: N/A</span>
        <span>Mode: {isFocus ? 'Focus' : 'Compact'}</span>
      </footer>
    </div>
  );
}
