import LoginPage from './LoginPage'

// Registration is Google SSO only — reuse LoginPage
export default function RegisterPage() {
  // Just render LoginPage; Google SSO handles both sign-in and sign-up
  return <LoginPage />
}
