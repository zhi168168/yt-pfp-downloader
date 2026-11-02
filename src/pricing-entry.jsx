import React from 'react';
import {createRoot,hydrateRoot} from 'react-dom/client';
import {Pricing} from './Billing.jsx';
import {AccountLink} from './Account.jsx';
const root = document.getElementById('pricing-root');
if (root.hasChildNodes()) hydrateRoot(root,<Pricing/>);
else createRoot(root).render(<Pricing/>);
createRoot(document.getElementById('session-root')).render(<AccountLink returnTo="/pricing.html"/>);
