import React, { useEffect, useState } from 'react';
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
import BillsView from './views/Bills';
import CalendarView from './views/Calendar';
import SpendingView from './views/Spending';
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
  transaction: 'spending',
  list: 'lists',
};

function AppInner() {
  const { ready, error } = useDatabase();
  const { enterFocus } = useLayout();
  const [activeView, setActiveView] = useState('today');
  const [editRequest, setEditRequest] = useState(null); // { type, id }

  // Every launch: Focus Today once. Do not depend on enterFocus — its
  // identity changes when layout_mode flips and would yank Compact back.
  useEffect(() => {
    if (!ready) return;
    enterFocus();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- boot once on ready
  }, [ready]);

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

  /** Brief Edit → Focus on module with item open for edit. */
  function requestEdit(type, id) {
    setEditRequest({ type, id });
    setActiveView(EDIT_VIEW[type] || type);
  }

  let focusContent = <StubView viewId={activeView || 'module'} />;
  if (activeView === 'today') {
    focusContent = (
      <TodayView onEditRequest={requestEdit} onNavigate={setActiveView} />
    );
  } else if (activeView === 'settings') focusContent = <SettingsView />;
  else if (activeView === 'tasks') {
    focusContent = (
      <TasksView
        editId={editRequest?.type === 'task' ? editRequest.id : null}
        onEditConsumed={clearEditRequest}
      />
    );
  } else if (activeView === 'reminders') {
    focusContent = (
      <RemindersView
        editId={editRequest?.type === 'reminder' ? editRequest.id : null}
        onEditConsumed={clearEditRequest}
      />
    );
  } else if (activeView === 'habits') {
    focusContent = (
      <HabitsView
        editId={editRequest?.type === 'habit' ? editRequest.id : null}
        onEditConsumed={clearEditRequest}
      />
    );
  } else if (activeView === 'bills') {
    focusContent = (
      <BillsView
        editId={editRequest?.type === 'bill' ? editRequest.id : null}
        onEditConsumed={clearEditRequest}
      />
    );
  } else if (activeView === 'calendar') {
    focusContent = (
      <CalendarView
        editId={editRequest?.type === 'event' ? editRequest.id : null}
        onEditConsumed={clearEditRequest}
        onEditRequest={requestEdit}
      />
    );
  } else if (activeView === 'spending') {
    focusContent = <SpendingView />;
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
