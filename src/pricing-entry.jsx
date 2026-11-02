import React from 'react';
import {createRoot} from 'react-dom/client';
import {Pricing} from './Billing.jsx';
import {AccountLink} from './Account.jsx';
createRoot(document.getElementById('pricing-root')).render(<Pricing/>);
createRoot(document.getElementById('session-root')).render(<AccountLink returnTo="/pricing.html"/>);
