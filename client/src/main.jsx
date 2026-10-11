import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ClerkProvider } from '@clerk/react'
import './index.css'
import App from './App.jsx'
import AuthenticatedApp from './AuthenticatedApp.jsx'

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY
const application = publishableKey ? (
  <ClerkProvider publishableKey={publishableKey}>
    <AuthenticatedApp />
  </ClerkProvider>
) : (
  <App />
)

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {application}
  </StrictMode>,
)
