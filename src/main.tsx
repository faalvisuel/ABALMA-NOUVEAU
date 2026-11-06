import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import './styles.css'
import './market-v2.css'
import './jiji.css'
import './shell.css'
import { AuthProvider, useAuth } from './auth'
import { configured } from './lib/supabase'
import { ErrorBox, Spinner } from './components/ui'
import { supabase, errMsg } from './lib/supabase'
import { TERMS_VERSION } from './pages/AuthPage'
import Home from './pages/Home'
import ListingPage from './pages/ListingPage'
import Reserve from './pages/Reserve'
import AuthPage from './pages/AuthPage'
import Bookings from './pages/Bookings'
import BookingDetail from './pages/BookingDetail'
import Publish from './pages/Publish'
import MyListings from './pages/MyListings'
import Earnings from './pages/Earnings'
import Score from './pages/Score'
import Profile from './pages/Profile'
import Admin from './pages/Admin'
import Legal from './pages/Legal'
import Espace from './pages/Espace'

function Private({ children }: { children: JSX.Element }) {
  const { user, profile, loading, signOut } = useAuth()
  const loc = useLocation()
  const nav = useNavigate()
  if (loading) return <Spinner />
  if (!user) return <Navigate to={`/connexion?suite=${encodeURIComponent(loc.pathname + loc.search)}`} replace />
  if (profile?.suspended) return <main className="page no-nav"><h1 className="display h1">Compte temporairement suspendu</h1><p className="soft">Contactez l’équipe ABALMA pour obtenir des informations ou contester cette mesure : [contact à compléter].</p><button className="btn ghost" onClick={async () => { await signOut(); nav('/accueil', { replace: true }) }}>Se déconnecter</button></main>
  return <TermsGate>{children}</TermsGate>
}

function TermsGate({ children }: { children: JSX.Element }) {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [accepted, setAccepted] = useState(false)
  const [checked, setChecked] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    supabase.from('terms_acceptances').select('id').eq('user_id', user.id).eq('terms_version', TERMS_VERSION).maybeSingle()
      .then(({ data, error: e }) => { if (active) { if (e) setError(errMsg(e)); setAccepted(Boolean(data)); setLoading(false) } })
    return () => { active = false }
  }, [user.id])
  if (loading) return <Spinner />
  if (accepted) return children
  async function accept() {
    setBusy(true); setError(null)
    const { error: e } = await supabase.rpc('accept_current_terms')
    setBusy(false)
    if (e) {
      const code = 'code' in e ? String(e.code) : ''
      if (code === 'PGRST202' || code === 'PGRST205') {
        return setError('La base ABALMA n’a pas encore reçu la migration de pré-lancement. Dans Supabase, ouvrez SQL Editor et exécutez supabase/prelaunch-migration.sql, puis rechargez cette page.')
      }
      return setError(errMsg(e))
    }
    setAccepted(true)
  }
  return <main className="page no-nav"><h1 className="display h1">Mise à jour des conditions</h1>
    <p className="soft">Pour continuer à utiliser ABALMA, consultez et acceptez les conditions d’utilisation et la politique de confidentialité en vigueur.</p>
    <div className="row wrap"><a href={`${import.meta.env.BASE_URL}cgu`} target="_blank" rel="noreferrer">Lire les CGU</a><a href={`${import.meta.env.BASE_URL}confidentialite`} target="_blank" rel="noreferrer">Lire la politique de confidentialité</a></div>
    <label className="consent-row"><input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)} /><span>J’accepte la version {TERMS_VERSION} des conditions d’utilisation et de la politique de confidentialité.</span></label>
    <ErrorBox msg={error} /><button className="btn" disabled={!checked || busy} onClick={accept}>{busy ? 'Enregistrement…' : 'Accepter et continuer'}</button>
  </main>
}

function Landing() {
  const { user, loading } = useAuth()
  if (loading) return <Spinner />
  return user ? <Navigate to="/espace" replace /> : <Home />
}

function App() {
  return <div className="app">
    {!configured && <div className="setup-notice" role="status">Aperçu hors ligne : ajoutez <b>VITE_SUPABASE_URL</b> et <b>VITE_SUPABASE_ANON_KEY</b> pour activer les annonces, les comptes et les réservations.</div>}
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/accueil" element={<Home />} />
      <Route path="/espace" element={<Private><Espace /></Private>} />
      <Route path="/annonce/:id" element={<ListingPage />} />
      <Route path="/connexion" element={<AuthPage />} />
      <Route path="/cgu" element={<Legal page="cgu" />} />
      <Route path="/mentions-legales" element={<Legal page="mentions" />} />
      <Route path="/confidentialite" element={<Legal page="privacy" />} />
      <Route path="/cookies" element={<Legal page="cookies" />} />
      <Route path="/reserver/:id" element={<Private><Reserve /></Private>} />
      <Route path="/reservations" element={<Private><Bookings /></Private>} />
      <Route path="/reservation/:id" element={<Private><BookingDetail /></Private>} />
      <Route path="/publier" element={<Private><Publish /></Private>} />
      <Route path="/mes-annonces" element={<Private><MyListings /></Private>} />
      <Route path="/revenus" element={<Private><Earnings /></Private>} />
      <Route path="/score" element={<Private><Score /></Private>} />
      <Route path="/profil" element={<Private><Profile /></Private>} />
      <Route path="/admin" element={<Private><Admin /></Private>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  </div>
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode><BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '') || '/'}><AuthProvider><App /></AuthProvider></BrowserRouter></React.StrictMode>
)

