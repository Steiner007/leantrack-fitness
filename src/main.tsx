import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, MemoryRouter } from 'react-router-dom'
import App from './App'
import { ARTIFACT } from './lib/claudeBackend'
import './index.css'

// The hosted (Claude artifact) build has no service worker and no URL routing.
if (!ARTIFACT) void import('virtual:pwa-register').then(m => m.registerSW({ immediate: true }))
// A "#/path" hash is only ever present in automated tests of the hosted build.
const start = decodeURIComponent(window.location.hash.slice(1))

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {ARTIFACT ? <MemoryRouter initialEntries={[start.startsWith('/') ? start : '/']}><App /></MemoryRouter> : <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}><App /></BrowserRouter>}
  </React.StrictMode>,
)
