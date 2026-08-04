import React, { useState } from 'react';
import { DatabaseProvider, useDatabase } from './context/DatabaseContext';
import { ThemeProvider } from './context/ThemeContext';
import { LayoutProvider } from './context/LayoutContext';
import { BriefProvider } from './context/BriefContext';
import LayoutShell from './layout/LayoutShell';
import SettingsView from './views/Settings';
import TasksView from './views/Tasks';
import RemindersView from './views/Reminders';
import HabitsView from './views/Habits';
import BillsView from './views/Bills';
import CalendarView from './views/Calendar';
import SpendingView from './views/Spending';
import StubView from './views/StubView';

const EDIT_VIEW = {
  task: 'tasks',
  reminder: 'reminders',
  bill: 'bills',
  event: 'calendar',
};

function AppInner() {
  const { ready, error } = useDatabase();
  // null on Compact landing so Tasks tab is not falsely "selected"
  const [activeView, setActiveView] = useState(null);
  const [editRequest, setEditRequest] = useState(null); // { type, id }

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

  let focusContent = <StubView viewId={activeView || 'today'} />;
  if (activeView === 'settings') focusContent = <SettingsView />;
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
    focusContent = <HabitsView />;
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
      />
    );
  } else if (activeView === 'spending') {
    focusContent = <SpendingView />;
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
