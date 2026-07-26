import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/baloo-2'
import '@fontsource/poppins'
import '@fontsource/poppins/500.css'
import '@fontsource/poppins/600.css'
import { App } from './ui/App'
import './ui/theme.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
