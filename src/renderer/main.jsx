import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import NotePopoutApp from './notes-view/NotePopoutApp';
import { flushPendingDocs } from './lists-view/docFlush';
import './styles/theme-variables.css';
import './styles/base.css';
import './styles/glass.css';
import './styles/components.css';
import './styles/today.css';

const popoutId = Number(new URLSearchParams(window.location.search).get('notePopout'));
const isNotePopout = Number.isFinite(popoutId) && popoutId > 0;

if (!isNotePopout) {
  window.api.onFlush(flushPendingDocs);
}

const root = createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    {isNotePopout ? <NotePopoutApp id={popoutId} /> : <App />}
  </React.StrictMode>
);
