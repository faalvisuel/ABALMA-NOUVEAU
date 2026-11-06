import { FormEvent, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase, errMsg } from '../lib/supabase'
import { useAuth } from '../auth'
import { ErrorBox, Logo, Page, Spinner } from '../components/ui'

export const TERMS_VERSION = '2026-10-19-v1'

export default function AuthPage() {
  const { user, loading: authLoading } = useAuth()
  const nav = useNavigate()
  const [sp] = useSearchParams()
  const next = sp.get('suite') || '/'
  const [mode, setMode] = useState<'in' | 'up' | 'reset'>(sp.get('mode') === 'signup' ? 'up' : 'in')
  const [f, setF] = useState({ email: '', password: '', first_name: '', last_name: '', quartier: '', job: '' })
  const [err, setErr] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const recovery = window.location.hash.includes('type=recovery')
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value })

  useEffect(() => {
    if (!user || recovery) return
    nav(next, { replace: true })
  }, [user?.id, recovery, next, nav])

  async function withTimeout<T>(operation: Promise<T>): Promise<T> {
    return Promise.race([
      operation,
      new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error('La demande prend trop de temps. Vérifiez votre connexion et réessayez.')), 20000)),
    ])
  }

  async function finishPassword(e: FormEvent) {
    e.preventDefault(); setErr(null); setBusy(true)
    try {
      const { error } = await withTimeout(supabase.auth.updateUser({ password: newPassword }))
      if (error) throw error
      window.history.replaceState({}, document.title, `${window.location.pathname}${window.location.search}`)
      nav(next, { replace: true })
    } catch (error) { setErr(errMsg(error)) } finally { setBusy(false) }
  }

  if (recovery && authLoading) return <Page nav={false}><Spinner /></Page>
  if (user && recovery) return <Page nav={false}><Logo /><h1 className="display h1">Choisir un nouveau mot de passe</h1>
    <form className="stack s16" onSubmit={finishPassword}><div className="field"><label htmlFor="newpw">Nouveau mot de passe</label><input id="newpw" type="password" required minLength={6} autoComplete="new-password" value={newPassword} onChange={e => setNewPassword(e.target.value)} /></div><ErrorBox msg={err} /><button className="btn" disabled={busy}>{busy ? 'Enregistrement…' : 'Enregistrer le mot de passe'}</button></form>
  </Page>
  if (user) return <Page nav={false}><Logo /><p className="soft">Connexion en cours…</p><Spinner /></Page>

  async function submit(e: FormEvent) {
    e.preventDefault(); setErr(null); setInfo(null); setBusy(true)
    try {
      if (mode === 'reset') {
        const { error } = await withTimeout(supabase.auth.resetPasswordForEmail(f.email.trim(), { redirectTo: `${window.location.origin}${import.meta.env.BASE_URL}connexion` }))
        if (error) throw error
        setInfo('Si cette adresse correspond à un compte, un lien de réinitialisation va être envoyé.')
      } else if (mode === 'in') {
        const { error } = await withTimeout(supabase.auth.signInWithPassword({ email: f.email.trim(), password: f.password }))
        if (error) throw error
        nav(next, { replace: true })
      } else {
        if (!acceptedTerms) throw new Error('Vous devez accepter les conditions d’utilisation et la politique de confidentialité.')
        const acceptedAt = new Date().toISOString()
        const created = await withTimeout(supabase.functions.invoke('signup', {
          body: {
            email: f.email.trim(), password: f.password,
            first_name: f.first_name.trim(), last_name: f.last_name.trim(), quartier: f.quartier.trim(), job: f.job.trim(),
            terms_accepted_version: TERMS_VERSION, terms_accepted_at: acceptedAt,
          },
        }))
        if (created.error) {
          let msg = ''
          try { msg = (await (created.error as any).context?.json?.())?.error || '' } catch { /* réponse non lisible */ }
          throw new Error(msg || 'Impossible de créer le compte. Réessayez.')
        }
        const { error } = await withTimeout(supabase.auth.signInWithPassword({ email: f.email.trim(), password: f.password }))
        if (error) throw error
        nav(next, { replace: true })
      }
    } catch (error) { setErr(errMsg(error)) } finally { setBusy(false) }
  }

  return <Page nav={false} narrow>
    <Logo />
    <h1 className="display h1">{mode === 'in' ? 'Connexion' : mode === 'reset' ? 'Réinitialiser mon mot de passe' : 'Créer un compte'}</h1>
    <p className="soft">{mode === 'in' ? 'Retrouvez vos réservations et vos annonces.' : mode === 'reset' ? 'Recevez un lien par e-mail pour choisir un nouveau mot de passe.' : 'Un seul compte pour emprunter et pour louer votre matériel.'}</p>
    <form className="stack s16" onSubmit={submit}>
      {mode === 'up' && <>
        <div className="grid2">
          <div className="field"><label htmlFor="fn">Prénom</label><input id="fn" required autoComplete="given-name" value={f.first_name} onChange={set('first_name')} /></div>
          <div className="field"><label htmlFor="ln">Nom</label><input id="ln" required autoComplete="family-name" value={f.last_name} onChange={set('last_name')} /></div>
        </div>
        <div className="grid2">
          <div className="field"><label htmlFor="qt">Quartier</label><input id="qt" required placeholder="Ex. Mermoz" value={f.quartier} onChange={set('quartier')} /></div>
          <div className="field"><label htmlFor="jb">Activité (facultatif)</label><input id="jb" placeholder="Ex. Vidéaste" value={f.job} onChange={set('job')} /></div>
        </div>
      </>}
      <div className="field"><label htmlFor="em">E-mail</label><input id="em" type="email" required autoComplete="email" value={f.email} onChange={set('email')} /></div>
      {mode !== 'reset' && <div className="field"><label htmlFor="pw">Mot de passe</label><input id="pw" type="password" required minLength={6} autoComplete={mode === 'in' ? 'current-password' : 'new-password'} value={f.password} onChange={set('password')} />
        {mode === 'up' && <div className="hint">6 caractères au minimum.</div>}</div>}
    {mode === 'up' && <label className="consent-row"><input type="checkbox" required checked={acceptedTerms} onChange={e => { setAcceptedTerms(e.target.checked); if (e.target.checked) setErr(null) }} /><span>J’accepte les <a href={`${import.meta.env.BASE_URL}cgu`} target="_blank" rel="noreferrer">conditions d’utilisation</a> et reconnais avoir lu la <a href={`${import.meta.env.BASE_URL}confidentialite`} target="_blank" rel="noreferrer">politique de confidentialité</a>. Cette acceptation est nécessaire pour créer mon compte.</span></label>}
      <ErrorBox msg={err} />
      {info && <div className="notice" role="status">{info}</div>}
      <button className="btn" disabled={busy}>{busy ? 'Un instant…' : mode === 'in' ? 'Se connecter' : mode === 'reset' ? 'Envoyer le lien' : 'Créer mon compte'}</button>
    </form>
    {mode === 'in' && <button className="link-btn" onClick={() => { setMode('reset'); setErr(null); setInfo(null) }}>Mot de passe oublié ?</button>}
    <div className="auth-legal-links"><a href={`${import.meta.env.BASE_URL}mentions-legales`}>Mentions légales</a><a href={`${import.meta.env.BASE_URL}cookies`}>Cookies</a></div>
    <button className="link-btn" onClick={() => { setMode(mode === 'up' ? 'in' : 'up'); setAcceptedTerms(false); setErr(null); setInfo(null) }}>
      {mode === 'up' ? 'Déjà un compte ? Se connecter' : 'Pas encore de compte ? Créer un compte'}
    </button>
  </Page>
}
