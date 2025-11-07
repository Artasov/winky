import React from 'react';
import ReactDOM from 'react-dom/client';
import {HashRouter} from 'react-router-dom';
import App from './App';
import './index.css';
import WinkyThemeProvider from './theme/WinkyThemeProvider';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    <React.StrictMode>
        <HashRouter>
            <WinkyThemeProvider>
                <App/>
            </WinkyThemeProvider>
        </HashRouter>
    </React.StrictMode>
);
