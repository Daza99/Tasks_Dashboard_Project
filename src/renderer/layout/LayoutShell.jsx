import React from 'react';
import TopBar from './TopBar';
import LeftNav from './LeftNav';
import CenterBrief from './CenterBrief';
import RightRail from './RightRail';
import { useLayout } from '../context/LayoutContext';

/**
 * Shell: Compact (3-col) vs Focus (full center view).
 * @param {{
 *   activeView: string|null,
 *   onNavigate: (id: string) => void,
 *   onEditRequest?: (type: 'task'|'reminder', id: number) => void,
 *   focusContent: React.ReactNode
 * }} props
 */
export default function LayoutShell({
  activeView,
  onNavigate,
  onEditRequest,
  focusContent,
}) {
  const { isCompact, isFocus, enterFocus } = useLayout();

  function handleEditRequest(type, id) {
    onEditRequest?.(type, id);
    enterFocus();
  }

  return (
    <div className="app-root">
      <TopBar />
      <div
        className={`layout-main layout-main--${isCompact ? 'compact' : 'focus'}`}
      >
        {isCompact && (
          <LeftNav activeView={activeView} onNavigate={onNavigate} />
        )}

        {isCompact ? (
          <CenterBrief onEditRequest={handleEditRequest} onNavigate={onNavigate} />
        ) : (
          <div className="center-panel glass-panel focus-host">{focusContent}</div>
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
