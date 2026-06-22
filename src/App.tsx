import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthListener } from './hooks/useAuth'
import { useNotifications } from './hooks/useNotifications'
import { useAuthStore } from './stores/authStore'
import { ToastContainer } from './components/ui/Toast'
import InstallPrompt from './components/pwa/InstallPrompt'
import ProtectedRoute from './pages/auth/ProtectedRoute'
import PublicFormRoute from './pages/auth/PublicFormRoute'
import LoginPage from './pages/auth/LoginPage'
import DashboardPage from './pages/dashboard/DashboardPage'
import FormsListPage from './pages/dashboard/FormsListPage'
import BuilderPage from './pages/builder/BuilderPage'
import ResponsesPage from './pages/responses/ResponsesPage'
import EventsPage from './pages/events/EventsPage'
import EventDetailPage from './pages/events/EventDetailPage'
import SettingsPage from './pages/settings/SettingsPage'
import FormPreviewPage from './pages/public/FormPreviewPage'
import PublicEventPage from './pages/public/PublicEventPage'
import MyPortalPage from './pages/my/MyPortalPage'
import UsersPage from './pages/users/UsersPage'
import CheckInPage from './pages/admin/CheckInPage'
import AdminNewRegistrationPage from './pages/admin/AdminNewRegistrationPage'
import PublicTicketPage from './pages/public/PublicTicketPage'
import AccountingPage from './pages/accounting/AccountingPage'

function AppWithAuth() {
  useAuthListener()
  const { user } = useAuthStore()
  useNotifications(user?.uid ?? null)
  return (
    <Routes>
      {/* Auth — Google SSO only */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<LoginPage />} />

      {/* Public form — requires login */}
      <Route path="/f/:formId" element={<PublicFormRoute><FormPreviewPage /></PublicFormRoute>} />
      <Route path="/preview/:formId" element={<PublicFormRoute><FormPreviewPage /></PublicFormRoute>} />

      {/* Public event page — no auth required */}
      <Route path="/e/:eventId" element={<PublicEventPage />} />

      {/* Public ticket page — no auth required */}
      <Route path="/ticket/:responseId" element={<PublicTicketPage />} />

      {/* User portal */}
      <Route path="/my" element={<PublicFormRoute><MyPortalPage /></PublicFormRoute>} />

      {/* Admin routes */}
      <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
      <Route path="/forms" element={<ProtectedRoute><FormsListPage /></ProtectedRoute>} />
      <Route path="/builder/:formId" element={<ProtectedRoute><BuilderPage /></ProtectedRoute>} />
      <Route path="/responses" element={<ProtectedRoute><ResponsesPage /></ProtectedRoute>} />
      <Route path="/responses/:formId" element={<ProtectedRoute><ResponsesPage /></ProtectedRoute>} />
      <Route path="/events" element={<ProtectedRoute><EventsPage /></ProtectedRoute>} />
      <Route path="/events/:eventId" element={<ProtectedRoute><EventDetailPage /></ProtectedRoute>} />
      <Route path="/events/:eventId/new-registration" element={<ProtectedRoute><AdminNewRegistrationPage /></ProtectedRoute>} />
      <Route path="/accounting" element={<ProtectedRoute><AccountingPage /></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
      <Route path="/users" element={<ProtectedRoute><UsersPage /></ProtectedRoute>} />
      <Route path="/admin/checkin" element={<ProtectedRoute><CheckInPage /></ProtectedRoute>} />
      <Route path="/admin/checkin/:formId" element={<ProtectedRoute><CheckInPage /></ProtectedRoute>} />

      {/* Fallback */}
      <Route path="/" element={<Navigate to="/my" replace />} />
      <Route path="*" element={<Navigate to="/my" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppWithAuth />
      <ToastContainer />
      <InstallPrompt />
    </BrowserRouter>
  )
}
