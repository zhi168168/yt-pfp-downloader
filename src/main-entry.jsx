import React from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { Downloader } from './main.jsx';
import { AccountLink } from './Account.jsx';
const root = document.getElementById('downloader');
if (root.hasChildNodes()) hydrateRoot(root, <Downloader/>);
else createRoot(root).render(<Downloader/>);
createRoot(document.getElementById('session-root')).render(<AccountLink/>);
