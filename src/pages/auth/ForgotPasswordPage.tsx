import { Link } from 'react-router-dom'

export default function ForgotPasswordPage() {
  return (
    <div className="min-h-screen bg-[#faf8ff] flex items-center justify-center p-8">
      <div className="w-full max-w-md text-center">
        <h1 className="text-3xl font-black text-[#002068] mb-4">Solidando</h1>
        <p className="text-[#444653] mb-6">Il recupero password non è disponibile.<br />Accedi con Google SSO.</p>
        <Link to="/login" className="text-[#002068] font-semibold hover:underline">← Torna al login</Link>
      </div>
    </div>
  )
}
