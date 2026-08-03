import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/theme-variables.css';
import './styles/base.css';
import './styles/glass.css';
import './styles/components.css';

const root = createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
