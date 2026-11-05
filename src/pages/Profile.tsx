import { FormEvent, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase, errMsg } from '../lib/supabase'
import { useAuth } from '../auth'
import { borrowerLevel, initials, ownerLevel } from '../lib/util'
import { ErrorBox, Header, Icon, Page } from '../components/ui'

export default function Profile() {
  const { user, profile, refresh, signOut } = useAuth()
  const nav = useNavigate()
  const [f, setF] = useState({ first_name: profile?.first_name || '', last_name: profile?.last_name || '', quartier: profile?.quartier || '', job: profile?.job || '' })
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState(false)
  const [idFiles, setIdFiles] = useState<{ front: File | null; back: File | null }>({ front: null, back: null })
  const [idError, setIdError] = useState<string | null>(null)
  const [idInfo, setIdInfo] = useState<string | null>(null)
  const [idBusy, setIdBusy] = useState(false)
  const [identityNoticeAccepted, setIdentityNoticeAccepted] = useState(false)
  const set = (k: string) => (e: any) => { setF({ ...f, [k]: e.target.value }); setOk(false) }

  async function save(e: FormEvent) {
    e.preventDefault(); setErr(null)
    const { error } = await supabase.from('profiles').update(f).eq('id', user.id)
    if (error) return setErr(errMsg(error))
    await refresh(); setOk(true)
  }
  async function submitIdentity() {
    setIdError(null); setIdInfo(null)
    if (!identityNoticeAccepted) return setIdError('Confirmez la notice de traitement avant d’envoyer vos documents.')
    if (!idFiles.front || !idFiles.back) return setIdError('Ajoutez le recto et le verso de votre pièce d’identité.')
    if ([idFiles.front, idFiles.back].some(file => file.size > 8 * 1024 * 1024)) return setIdError('Chaque fichier doit faire 8 Mo maximum.')
    if ([idFiles.front, idFiles.back].some(file => !['image/jpeg', 'image/png', 'application/pdf'].includes(file.type))) return setIdError('Formats acceptés : JPG, PNG ou PDF.')
    setIdBusy(true)
    const uploaded: string[] = []
    try {
      const { data: oldDocs } = await supabase.from('identity_documents').select('storage_path').eq('user_id', user.id)
      const oldPaths = (oldDocs || []).map(d => d.storage_path)
      if (oldPaths.length) await supabase.storage.from('identity-documents').remove(oldPaths)
      await supabase.from('identity_documents').delete().eq('user_id', user.id)
      const rows = []
      for (const side of ['front', 'back'] as const) {
        const file = idFiles[side]!
        const ext = file.type === 'application/pdf' ? 'pdf' : file.type === 'image/png' ? 'png' : 'jpg'
        const path = `${user.id}/${side}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
        const { error: uploadError } = await supabase.storage.from('identity-documents').upload(path, file, { contentType: file.type, upsert: false })
        if (uploadError) throw uploadError
        uploaded.push(path)
        rows.push({ user_id: user.id, side, storage_path: path })
      }
      const { error: rowError } = await supabase.from('identity_documents').upsert(rows, { onConflict: 'user_id,side' })
      if (rowError) throw rowError
      const { error: submitError } = await supabase.rpc('submit_identity_documents')
      if (submitError) throw submitError
      await refresh()
      setIdFiles({ front: null, back: null })
      setIdentityNoticeAccepted(false)
      setIdInfo('Documents envoyés. L’équipe ABALMA examinera votre demande; vous pourrez utiliser toutes les fonctions après vérification.')
    } catch (error) {
      if (uploaded.length) await supabase.storage.from('identity-documents').remove(uploaded)
      setIdError(errMsg(error))
    } finally { setIdBusy(false) }
  }
  const link = (to: string, t: string, d: string) => <Link to={to} className="card row" style={{ padding: '12px 14px', color: 'inherit' }}>
    <div className="stack s2 grow"><div className="bold">{t}</div><div className="small soft">{d}</div></div><Icon name="right" size={18} /></Link>

  return <Page>
    <Header title="Mon profil" back="/" />
    <div className="card row"><div className="avatar lg">{initials(profile?.first_name, profile?.last_name)}</div>
      <div className="stack s2 grow"><div className="bold" style={{ fontSize: 17 }}>{profile?.first_name} {profile?.last_name}</div><div className="small muted">{user.email}</div>
        <div className="row wrap" style={{ gap: 6, marginTop: 4 }}>
          <span className={'pill' + (profile?.identity_status === 'verified' ? '' : ' warn')}>{profile?.identity_status === 'verified' ? 'Identité vérifiée' : profile?.identity_status === 'pending' ? 'Vérification en cours' : profile?.identity_status === 'rejected' ? 'Documents à corriger' : 'Identité à vérifier'}</span>
          <span className="pill">Emprunteur {borrowerLevel(profile?.score ?? 400).name.toLowerCase()}</span>
          <span className="pill">Loueur {ownerLevel(profile).name.toLowerCase()}</span>
        </div></div></div>
    {link('/score', 'Score de confiance', `${profile?.score ?? 400} points · vos réductions et avantages`)}
    {link('/mes-annonces', 'Mes annonces', 'Gérer mon matériel et voir mon niveau de loueur')}
    {profile?.is_admin && link('/admin', 'Administration', 'Utilisateurs, annonces, réservations et litiges')}
    <section id="identite" className="card stack s16">
      <h2 className="h3">Vérifier mon identité</h2>
      {profile?.identity_status === 'verified' ? <div className="notice">Votre identité a été vérifiée manuellement par l’équipe ABALMA. Vous pouvez demander une location et publier du matériel.</div>
        : profile?.identity_status === 'pending' ? <div className="notice">Votre dossier est en cours d’examen. Vous pourrez louer ou publier dès que la vérification sera terminée.</div>
        : <>
          <p className="small soft">Pour louer ou proposer du matériel, envoyez une photo ou un scan lisible du recto et du verso de votre carte d’identité. Ces documents sont stockés dans un espace privé et accessibles uniquement à vous et à l’équipe de vérification ABALMA. Ils seront supprimés après la décision de vérification.</p>
          <div className="field"><label htmlFor="id-front">Recto — JPG, PNG ou PDF (8 Mo max.)</label><input id="id-front" type="file" accept="image/jpeg,image/png,application/pdf" capture="environment" onChange={e => setIdFiles({ ...idFiles, front: e.target.files?.[0] || null })} /></div>
          <div className="field"><label htmlFor="id-back">Verso — JPG, PNG ou PDF (8 Mo max.)</label><input id="id-back" type="file" accept="image/jpeg,image/png,application/pdf" capture="environment" onChange={e => setIdFiles({ ...idFiles, back: e.target.files?.[0] || null })} /></div>
          <label className="consent-row"><input type="checkbox" checked={identityNoticeAccepted} onChange={e => setIdentityNoticeAccepted(e.target.checked)} /><span>J’accepte d’envoyer ces copies à l’équipe ABALMA pour la vérification manuelle de mon compte. Elles ne sont pas publiques et seront supprimées après décision.</span></label>
          <p className="tiny muted">ABALMA ne procède pas à une vérification officielle auprès d’une autorité. Les modalités de traitement et les transferts de données doivent être validés avant le lancement.</p>
          <ErrorBox msg={idError} />{idInfo && <div className="notice" role="status">{idInfo}</div>}
          <button type="button" className="btn" disabled={idBusy} onClick={submitIdentity}>{idBusy ? 'Envoi sécurisé…' : 'Envoyer mes documents'}</button>
        </>}
    </section>
    <form className="card stack s16" onSubmit={save}>
      <h2 className="h3">Mes informations</h2>
      <div className="grid2">
        <div className="field"><label htmlFor="fn">Prénom</label><input id="fn" required value={f.first_name} onChange={set('first_name')} /></div>
        <div className="field"><label htmlFor="ln">Nom</label><input id="ln" required value={f.last_name} onChange={set('last_name')} /></div>
      </div>
      <div className="field"><label htmlFor="qt">Quartier</label><input id="qt" value={f.quartier} onChange={set('quartier')} /></div>
      <div className="field"><label htmlFor="jb">Activité</label><input id="jb" placeholder="Ex. Vidéaste" value={f.job} onChange={set('job')} /></div>
      <ErrorBox msg={err} />
      {ok && <div className="notice" role="status">Informations enregistrées.</div>}
      <button className="btn sm">Enregistrer</button>
    </form>
    <button className="btn ghost sm" onClick={async () => { await signOut(); nav('/accueil', { replace: true }) }}>Se déconnecter</button>
  </Page>
}

