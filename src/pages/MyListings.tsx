import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, errMsg } from '../lib/supabase'
import { useAuth } from '../auth'
import { fcfa, ownerLevel } from '../lib/util'
import { ErrorBox, Header, Note, Page, Spinner, Star, Thumb } from '../components/ui'

export default function MyListings() {
  const { user, profile } = useAuth()
  const [rows, setRows] = useState<any[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<string | null>(null)

  const load = useCallback(() => {
    supabase.from('listings').select('*').eq('owner_id', user.id).order('created_at', { ascending: false })
      .then(({ data, error }) => { if (error) setErr(errMsg(error)); setRows(data || []) })
  }, [user.id])
  useEffect(load, [load])

  async function setStatus(id: string, status: string) {
    const { error } = await supabase.from('listings').update({ status }).eq('id', id)
    if (error) setErr(errMsg(error)); load()
  }
  async function remove(id: string) {
    const { error } = await supabase.from('listings').delete().eq('id', id)
    if (error) setErr(errMsg(error)); setConfirm(null); load()
  }

  const lvl = ownerLevel(profile)
  const n = profile?.owner_rentals || 0
  const target = lvl.rank === 0 ? 5 : 15
  const nextName = lvl.rank === 0 ? 'Loueur confirmé' : 'Loueur vedette'

  return <Page>
    <Header title="Mes annonces" back="/revenus" />
    <div className="card dark stack">
      <div className="row between">
        <div className="stack s2"><div className="small muted">Votre niveau</div><div className="display" style={{ fontSize: 24 }}>Loueur {lvl.name === 'Nouveau' ? 'nouveau' : lvl.name.toLowerCase()}</div></div>
        <div className="row bold" style={{ gap: 6, background: '#1C5140', borderRadius: 14, padding: '8px 12px' }}><Star />{profile?.owner_rating ? String(profile.owner_rating).replace('.', ',') : '–'}</div>
      </div>
      <div className="grid2">
        <div className="stack s2"><div className="display" style={{ fontSize: 20 }}>{n}</div><div className="tiny muted">location{n > 1 ? 's' : ''} terminée{n > 1 ? 's' : ''}</div></div>
        <div className="stack s2"><div className="display" style={{ fontSize: 20 }}>{profile?.owner_reviews || 0}</div><div className="tiny muted">avis reçu{(profile?.owner_reviews || 0) > 1 ? 's' : ''}</div></div>
      </div>
      {lvl.rank < 2 ? <>
        <div className="row between small"><span className="muted">Vers {nextName}</span><span className="bold accent num">{Math.min(n, target)} / {target} locations</span></div>
        <div className="progress"><i style={{ width: `${Math.min(100, (n / target) * 100)}%` }} /></div>
      </> : <div className="small muted">Vos annonces apparaissent en tête des résultats.</div>}
    </div>
    <ErrorBox msg={err} />
    {rows === null ? <Spinner /> : rows.length === 0 ? <div className="card stack">
      <div className="bold">Vous n'avez pas encore d'annonce</div>
      <div className="soft small">Publiez votre premier matériel : photos, prix, et c'est en ligne.</div>
    </div> : <div className="stack"><h2 className="h3">{rows.length} annonce{rows.length > 1 ? 's' : ''}</h2>
      {rows.map(l => <div key={l.id} className="card stack" style={{ padding: 12 }}>
        <Link to={`/annonce/${l.id}`} className="row" style={{ color: 'inherit' }}><Thumb src={l.photos?.[0]} small />
          <div className="stack s2 grow"><div className="bold">{l.title}</div><div className="small muted num">{fcfa(l.price)} / jour · caution {fcfa(l.deposit)}</div></div>
          <span className={'pill' + (l.status === 'online' ? '' : ' warn')}>{l.status === 'online' ? 'En ligne' : l.status === 'paused' ? 'En pause' : 'Masquée par ABALMA'}</span></Link>
        {l.status !== 'hidden' && (confirm === l.id
          ? <div className="grid2"><button className="btn ghost sm" onClick={() => setConfirm(null)}>Garder</button><button className="btn danger sm" onClick={() => remove(l.id)}>Supprimer définitivement</button></div>
          : <div className="grid2"><button className="btn ghost sm" onClick={() => setStatus(l.id, l.status === 'online' ? 'paused' : 'online')}>{l.status === 'online' ? 'Mettre en pause' : 'Remettre en ligne'}</button><button className="btn danger sm" onClick={() => setConfirm(l.id)}>Supprimer</button></div>)}
      </div>)}</div>}
    <div className="card stack"><h2 className="h3">Les niveaux de loueur</h2>
      <Note icon="check">Nouveau : annonce visible normalement, avec un coup de pouce les 14 premiers jours.</Note>
      <Note icon="check">Confirmé, dès 5 locations et 4,5 de note : badge sur vos annonces.</Note>
      <Note icon="check">Vedette, dès 15 locations et 4,7 de note : en tête des résultats.</Note></div>
    <Link to="/publier" className="btn">Publier un nouveau matériel</Link>
  </Page>
}
