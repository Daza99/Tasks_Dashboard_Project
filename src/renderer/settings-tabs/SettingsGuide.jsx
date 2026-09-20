import React from 'react';
import { USER_GUIDE_SECTIONS } from '../guide/user-guide-content';

/**
 * Scroll the Focus host to a guide heading. Avoids hash routing in Electron.
 * @param {React.MouseEvent} e
 * @param {string} id
 */
function scrollToSection(e, id) {
  e.preventDefault();
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/** In-app instructional document with a contents TOC that jumps to sections. */
export default function SettingsGuide() {
  return (
    <div className="user-guide">
      <nav className="user-guide__toc" aria-label="Guide contents">
        <h2 className="user-guide__toc-title">Contents</h2>
        <ol className="user-guide__toc-list">
          {USER_GUIDE_SECTIONS.map((section) => (
            <li key={section.id}>
              <a
                href={`#${section.id}`}
                className="user-guide__toc-link"
                onClick={(e) => scrollToSection(e, section.id)}
              >
                {section.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      {USER_GUIDE_SECTIONS.map((section) => (
        <section key={section.id} className="user-guide__section" aria-labelledby={section.id}>
          <h2 id={section.id} className="user-guide__heading">
            {section.title}
          </h2>
          <ul className="user-guide__bullets">
            {section.bullets.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
