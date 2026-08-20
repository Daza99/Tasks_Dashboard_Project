import React, { useCallback, useEffect, useState } from 'react';
import { DatabaseProvider, useDatabase } from './context/DatabaseContext';
import { ThemeProvider } from './context/ThemeContext';
import { LayoutProvider, useLayout } from './context/LayoutContext';
import { BriefProvider } from './context/BriefContext';
import LayoutShell from './layout/LayoutShell';
import SettingsView from './views/Settings';
import TodayView from './views/Today';
import TasksView from './views/Tasks';
import RemindersView from './views/Reminders';
import HabitsView from './views/Habits';
import TrackersView from './views/Trackers';
import BillsView from './views/Bills';
import CalendarView from './views/Calendar';
import SpendingView from './views/Spending';
import TagsView from './views/Tags';
import StubView from './views/StubView';
import Expired7Plus from './containers/Expired7Plus';
import CompletedView from './containers/Completed';
import ArchiveView from './containers/Archive';
import ListsPanel from './lists-view/ListsPanel';

const EDIT_VIEW = {
  task: 'tasks',
  reminder: 'reminders',
  bill: 'bills',
  event: 'calendar',
  habit: 'habits',
  tracker: 'trackers',
  transaction: 'spending',
  list: 'lists',
};

function AppInner() {
  const { ready, error } = useDatabase();
  const { enterFocus } = useLayout();
  const [activeView, setActiveView] = useState('today');
  const [editRequest, setEditRequest] = useState(null); // { type, id }
  const [createSeed, setCreateSeed] = useState(null); // { type, date } yyyy-MM-dd

  /** Brief Edit / notif VIEW → Focus on module with item open for edit. */
  const requestEdit = useCallback((type, id) => {
    setCreateSeed(null);
    setEditRequest({ type, id });
    setActiveView(EDIT_VIEW[type] || type);
  }, []);

  // Every launch: Focus Today once. Do not depend on enterFocus — its
  // identity changes when layout_mode flips and would yank Compact back.
  useEffect(() => {
    if (!ready) return;
    enterFocus();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- boot once on ready
  }, [ready]);

  // Notification VIEW button → restore dashboard to the entity editor
  useEffect(() => {
    if (!window.api?.onOpenItem) return undefined;
    return window.api.onOpenItem((payload) => {
      const type = payload?.type;
      const id = payload?.id;
      if (type && id != null) requestEdit(type, id);
      enterFocus();
    });
  }, [requestEdit, enterFocus]);

  if (error) {
    return (
      <div className="app-root" style={{ padding: 24 }}>
        <h1>Failed to load settings</h1>
        <p style={{ color: 'var(--danger)' }}>{error}</p>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="app-root" style={{ padding: 24, color: 'var(--text-secondary)' }}>
        Loading…
      </div>
    );
  }

  function clearEditRequest() {
    setEditRequest(null);
  }

  function clearCreateSeed() {
    setCreateSeed(null);
  }

  /** Calendar RMB → Focus create form with date prefilled. */
  function requestCreate(type, date) {
    setEditRequest(null);
    setCreateSeed({ type, date });
    setActiveView(EDIT_VIEW[type] || type);
  }

  let focusContent = <StubView viewId={activeView || 'module'} />;
  if (activeView === 'today') {
    focusContent = (
      <TodayView onEditRequest={requestEdit} />
    );
  } else if (activeView === 'settings') focusContent = <SettingsView />;
  else if (activeView === 'tasks') {
    focusContent = (
      <TasksView
        editId={editRequest?.type === 'task' ? editRequest.id : null}
        onEditConsumed={clearEditRequest}
        seedDate={createSeed?.type === 'task' ? createSeed.date : null}
        onSeedConsumed={clearCreateSeed}
      />
    );
  } else if (activeView === 'reminders') {
    focusContent = (
      <RemindersView
        editId={editRequest?.type === 'reminder' ? editRequest.id : null}
        onEditConsumed={clearEditRequest}
        seedDate={createSeed?.type === 'reminder' ? createSeed.date : null}
        onSeedConsumed={clearCreateSeed}
      />
    );
  } else if (activeView === 'habits') {
    focusContent = (
      <HabitsView
        editId={editRequest?.type === 'habit' ? editRequest.id : null}
        onEditConsumed={clearEditRequest}
      />
    );
  } else if (activeView === 'trackers') {
    focusContent = (
      <TrackersView
        editId={editRequest?.type === 'tracker' ? editRequest.id : null}
        onEditConsumed={clearEditRequest}
      />
    );
  } else if (activeView === 'bills') {
    focusContent = (
      <BillsView
        editId={editRequest?.type === 'bill' ? editRequest.id : null}
        onEditConsumed={clearEditRequest}
        seedDate={createSeed?.type === 'bill' ? createSeed.date : null}
        onSeedConsumed={clearCreateSeed}
      />
    );
  } else if (activeView === 'calendar') {
    focusContent = (
      <CalendarView
        editId={editRequest?.type === 'event' ? editRequest.id : null}
        onEditConsumed={clearEditRequest}
        onEditRequest={requestEdit}
        onCreateRequest={requestCreate}
      />
    );
  } else if (activeView === 'spending') {
    focusContent = (
      <SpendingView
        editId={editRequest?.type === 'transaction' ? editRequest.id : null}
        onEditConsumed={clearEditRequest}
      />
    );
  } else if (activeView === 'tags') {
    focusContent = <TagsView onEditRequest={requestEdit} />;
  } else if (activeView === 'lists') {
    focusContent = <ListsPanel />;
  } else if (activeView === 'expired') {
    focusContent = <Expired7Plus />;
  } else if (activeView === 'completed') {
    focusContent = <CompletedView />;
  } else if (activeView === 'archive') {
    focusContent = <ArchiveView />;
  } else if (activeView) {
    focusContent = <StubView viewId={activeView} />;
  }

  return (
    <BriefProvider>
      <LayoutShell
        activeView={activeView}
        onNavigate={setActiveView}
        onEditRequest={requestEdit}
        focusContent={focusContent}
      />
    </BriefProvider>
  );
}

export default function App() {
  return (
    <DatabaseProvider>
      <ThemeProvider>
        <LayoutProvider>
          <AppInner />
        </LayoutProvider>
      </ThemeProvider>
    </DatabaseProvider>
  );
}
