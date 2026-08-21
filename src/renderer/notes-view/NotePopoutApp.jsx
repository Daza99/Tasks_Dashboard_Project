import React, { useEffect, useState } from 'react';
import NotePad from './NotePad';
import { flushPendingDocs } from '../lists-view/docFlush';

/**
 * Standalone framed window for one note. Minimize/close flushes then destroys.
 * @param {{ id: number }} props
 */
export default function NotePopoutApp({ id }) {
  const [note, setNote] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const row = await window.api.getNote(id);
        if (!cancelled) setNote(row);
      } catch (err) {
        if (!cancelled) setError(err?.message || String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    return window.api.onNotePopoutFlushClose(flushPendingDocs);
  }, []);

  if (error) {
    return (
      <div className="note-popout">
        <p>{error}</p>
      </div>
    );
  }
  if (!note) {
    return (
      <div className="note-popout">
        <p>Loading…</p>
      </div>
    );
  }

  return (
    <div className="note-popout">
      <h1>{note.title}</h1>
      <NotePad note={note} onSaved={setNote} popout />
    </div>
  );
}
