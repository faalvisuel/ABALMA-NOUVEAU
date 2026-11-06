import { useCallback, useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase, errMsg } from '../lib/supabase'
import { useAuth } from '../auth'
import { fcfa, isReadyForPublic, STATUS_LABEL } from '../lib/util'
import { Avatar, ErrorBox, Header, Page, Spinner } from '../components/ui'

type AdminTab = 'verif' | 'overview' | 'users' | 'listings' | 'bookings'

export default function Admin() {
  const { profile, loading } = useAuth()
  const [tab, setTab] = useState<AdminTab>('verif')
  const [users, setUsers] = useState<any[]>([])
  const [listings, setListings] = useState<any[]>([])
  const [bookings, setBookings] = useState<any[]>([])
  const [identityDocs, setIdentityDocs] = useState<any[]>([])
  const [docLinks, setDocLinks] = useState<Record<string, string>>({})
  const [err, setErr] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [search, setSearch] = useState('')
  const [userFilter, setUserFilter] = useState('all')
  const [listingFilter, setListingFilter] = useState('all')
  const [bookingFilter, setBookingFilter] = useState('all')
  const [selId, setSelId] = useState<string | null>(null)
  const [verifFilter, setVerifFilter] = useState<'pending' | 'done'>('pending')
  const [busy, setBusy] = useState(false)
  const [checks, setChecks] = useState<Record<string, boolean>>({})
  const [openUser, setOpenUser] = useState<string | null>(null)
  const [meta, setMeta] = useState<Record<string, { email: string; last: string | null }>>({})

  const load = useCallback(async () => {
    const [u, l, b, d] = await Promise.all([
      supabase.from('profiles').select('*').order('created_at', { ascending: false }),
      supabase.from('listings').select('*, owner:profiles(first_name,last_name)').order('created_at', { ascending: false }),
      supabase.from('bookings').select('*, listing:listings(title), borrower:profiles!bookings_borrower_id_fkey(first_name,last_name), owner:profiles!bookings_owner_id_fkey(first_name,last_name)').order('created_at', { ascending: false }),
      supabase.from('identity_documents').select('*').order('created_at', { ascending: true }),
    ])
    const m = await supabase.rpc('admin_users_overview')
    if (!m.error && m.data) setMeta(Object.fromEntries((m.data as any[]).map(r => [r.user_id, { email: r.email, last: r.last_sign_in_at }])))
    const firstError = u.error || l.error || b.error || d.error
    setErr(firstError ? errMsg(firstError) : null)
    setUsers(u.data || []); setListings(l.data || []); setBookings(b.data || []); setIdentityDocs(d.data || []); setReady(true)
  }, [])
  useEffect(() => { if (profile?.is_admin) load() }, [profile?.is_admin, load])

  useEffect(() => {
    if (!selId) return
    identityDocs.filter(d => d.user_id === selId && !docLinks[d.storage_path]).forEach(async d => {
      const { data } = await supabase.storage.from('identity-documents').createSignedUrl(d.storage_path, 600)
      if (data) setDocLinks(cur => ({ ...cur, [d.storage_path]: data.signedUrl }))
    })
  }, [selId, identityDocs])

  if (loading) return <Page wide><Spinner /></Page>
  if (!profile?.is_admin) return <Navigate to="/" replace />

  async function run(fn: string, args: any) {
    const { error } = await supabase.rpc(fn, args)
    if (error) setErr(errMsg(error)); else setErr(null)
    await load()
  }
  async function removeListing(id: string) {
    const { error } = await supabase.from('listings').delete().eq('id', id)
    if (error) setErr(errMsg(error)); else setErr(null)
    await load()
  }
  async function showIdentityDocument(path: string) {
    const { data, error } = await supabase.storage.from('identity-documents').createSignedUrl(path, 600)
    if (error) return setErr(errMsg(error))
    setDocLinks(current => ({ ...current, [path]: data.signedUrl }))
  }
  async function decideIdentity(userId: string, status: 'verified' | 'rejected') {
    const { error } = await supabase.rpc('admin_set_identity_status', { p_user: userId, p_status: status })
    if (error) return setErr(errMsg(error))
    const docs = identityDocs.filter(d => d.user_id === userId)
    const paths = docs.map(d => d.storage_path)
    if (paths.length) {
      const { error: storageError } = await supabase.storage.from('identity-documents').remove(paths)
      if (storageError) { setErr(`Décision enregistrée, mais suppression des copies impossible : ${errMsg(storageError)}`); await load(); return }
      const { error: rowError } = await supabase.from('identity_documents').delete().eq('user_id', userId)
      if (rowError) { setErr(`Décision enregistrée, mais nettoyage du dossier impossible : ${errMsg(rowError)}`); await load(); return }
    }
    setErr(null); await load()
  }
  async function decideSelected(userId: string, status: 'verified' | 'rejected') {
    setBusy(true); await decideIdentity(userId, status); setBusy(false); setChecks({})
    setSelId(null)
  }

  const n = (p: any) => p ? `${p.first_name || ''} ${p.last_name || ''}`.trim() || '—' : '—'
  const disputes = bookings.filter(b => b.status === 'dispute')
  const pendingIdentities = users.filter(u => u.identity_status === 'pending')
  const onlineListings = listings.filter(l => l.status === 'online' && isReadyForPublic(l))
  const incompleteListings = listings.filter(l => !l.is_demo && !isReadyForPublic(l))
  const newUsers = users.filter(u => u.created_at && Date.now() - new Date(u.created_at).getTime() < 30 * 86400000)
  const requestedBookings = bookings.filter(b => b.status === 'requested')
  const query = search.trim().toLocaleLowerCase('fr')
  const matches = (...parts: unknown[]) => !query || parts.some(part => String(part || '').toLocaleLowerCase('fr').includes(query))
  const fdate = (d?: string | null) => d ? new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
  const ago = (d?: string | null) => { if (!d) return 'jamais'; const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000); return m < 2 ? 'à l’instant' : m < 60 ? `il y a ${m} min` : m < 1440 ? `il y a ${Math.floor(m / 60)} h` : `il y a ${Math.floor(m / 1440)} j` }
  const feed = [
    ...users.map(u => ({ at: u.created_at, who: n(u), text: 'a créé son compte' })),
    ...users.filter(u => u.identity_submitted_at).map(u => ({ at: u.identity_submitted_at, who: n(u), text: 'a envoyé sa pièce d’identité' })),
    ...listings.filter(l => !l.is_demo).map(l => ({ at: l.created_at, who: n(l.owner), text: `a publié « ${l.title} »` })),
    ...bookings.map(b => ({ at: b.created_at, who: n(b.borrower), text: `a demandé « ${b.listing?.title || 'une annonce'} » à ${n(b.owner)} · ${STATUS_LABEL[b.status] || b.status}` })),
  ].filter(e => e.at).sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0, 15)
  const filteredUsers = users.filter(u => {
    const statusMatch = userFilter === 'all' || (userFilter === 'suspended' ? u.suspended : u.identity_status === userFilter)
    return statusMatch && matches(n(u), u.quartier, u.id, meta[u.id]?.email)
  })
  const filteredListings = listings.filter(l => {
    const statusMatch = listingFilter === 'all' || (listingFilter === 'incomplete' ? !l.is_demo && !isReadyForPublic(l)
      : listingFilter === 'demo' ? l.is_demo : listingFilter === 'public' ? isReadyForPublic(l) : l.status === listingFilter)
    return statusMatch && matches(l.title, l.category, l.quartier, n(l.owner), l.demo_owner)
  })
  const filteredBookings = bookings.filter(b => (bookingFilter === 'all' || b.status === bookingFilter)
    && matches(b.listing?.title, n(b.borrower), n(b.owner), STATUS_LABEL[b.status], b.id))

  return <Page wide>
    <Header title="Administration" back="/profil" />
    <div className="grid2 admin-metrics">
      <div className="card stack s2"><div className="display" style={{ fontSize: 24 }}>{users.length}</div><div className="tiny muted">comptes inscrits</div></div>
      <div className="card stack s2"><div className="display" style={{ fontSize: 24 }}>{newUsers.length}</div><div className="tiny muted">nouveaux comptes · 30 jours</div></div>
      <div className="card stack s2"><div className="display" style={{ fontSize: 24 }}>{onlineListings.length}</div><div className="tiny muted">annonces complètes en ligne</div></div>
      <div className="card stack s2"><div className="display" style={{ fontSize: 24 }}>{pendingIdentities.length + incompleteListings.length + requestedBookings.length}</div><div className="tiny muted">éléments à examiner</div></div>
    </div>
    <ErrorBox msg={err} />
    {disputes.length > 0 && <div className="card stack"><h2 className="h3">{disputes.length} litige{disputes.length > 1 ? 's' : ''} à trancher</h2>
      {disputes.map(b => <div key={b.id} className="stack s8" style={{ borderTop: '1px solid var(--line)', paddingTop: 10 }}>
        <div className="bold">{b.listing?.title}</div>
        <div className="small soft">Loueur : {n(b.owner)} · Emprunteur : {n(b.borrower)}</div>
        <div className="small">« {b.problem} »</div>
        <div className="grid2"><button className="btn ghost sm" onClick={() => run('admin_resolve_dispute', { p_id: b.id, p_borrower_fault: false })}>Emprunteur non fautif</button>
          <button className="btn danger sm" onClick={() => run('admin_resolve_dispute', { p_id: b.id, p_borrower_fault: true })}>Emprunteur en tort (−150)</button></div>
      </div>)}</div>}

    <div className="chips" role="tablist" aria-label="Sections du tableau de bord">
      {([['verif', `Vérifications${pendingIdentities.length ? ` (${pendingIdentities.length})` : ''}`], ['overview', 'Vue d’ensemble'], ['users', 'Comptes'], ['listings', 'Annonces'], ['bookings', 'Réservations']] as const).map(([key, label]) =>
        <button key={key} role="tab" aria-selected={tab === key} className={'chip' + (tab === key ? ' on' : '')} onClick={() => { setTab(key); setSearch('') }}>{label}</button>)}
    </div>
    {!ready ? <Spinner /> : tab === 'verif' ? (() => {
      const queue = users.filter(u => verifFilter === 'pending' ? u.identity_status === 'pending' : ['rejected'].includes(u.identity_status))
        .sort((a, b) => new Date(a.identity_submitted_at || a.created_at).getTime() - new Date(b.identity_submitted_at || b.created_at).getTime())
      const sel = users.find(u => u.id === selId) || null
      const docs = sel ? identityDocs.filter(d => d.user_id === sel.id) : []
      const ageDays = (d?: string) => d ? Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / 86400000)) : 0
      const allChecked = ['name', 'selfie', 'face', 'legible', 'valid'].every(k => checks[k])
      return <div className="adm-verif">
        <aside className="adm-queue">
          <div className="adm-seg" role="tablist"><button role="tab" aria-selected={verifFilter === 'pending'} className={verifFilter === 'pending' ? 'on' : ''} onClick={() => { setVerifFilter('pending'); setSelId(null) }}>À examiner ({pendingIdentities.length})</button>
            <button role="tab" aria-selected={verifFilter === 'done'} className={verifFilter === 'done' ? 'on' : ''} onClick={() => { setVerifFilter('done'); setSelId(null) }}>À corriger ({users.filter(u => u.identity_status === 'rejected').length})</button></div>
          {queue.length === 0 ? <div className="adm-empty"><b>{verifFilter === 'pending' ? 'Aucun dossier en attente' : 'Rien à corriger'}</b><span>{verifFilter === 'pending' ? 'Les nouvelles demandes apparaîtront ici dès qu’un utilisateur enverra sa pièce d’identité.' : 'Les dossiers refusés apparaissent ici jusqu’à un nouvel envoi.'}</span></div>
            : queue.map(u => <button key={u.id} className={'adm-item' + (selId === u.id ? ' on' : '')} onClick={() => { setSelId(u.id); setChecks({}) }}>
              <Avatar url={u.avatar_url} name={u.first_name} size={38} />
              <span className="adm-item-text"><b>{n(u)}</b><small>{u.quartier || 'Quartier non renseigné'}</small></span>
              <small className="adm-age">{ageDays(u.identity_submitted_at || u.created_at) === 0 ? 'Aujourd’hui' : `${ageDays(u.identity_submitted_at || u.created_at)} j`}</small></button>)}
        </aside>
        <section className="adm-detail">
          {!sel ? <div className="adm-empty lg"><b>Sélectionnez un dossier</b><span>Choisissez une personne dans la liste pour voir sa pièce d’identité et décider.</span></div> : <>
            <header className="adm-head"><div style={{ display: 'flex', gap: 14, alignItems: 'center' }}><Avatar url={sel.avatar_url} name={sel.first_name} size={64} /><div><h2>{n(sel)}</h2><p>Inscrit le {sel.created_at ? new Date(sel.created_at).toLocaleDateString('fr-FR') : '—'} · {sel.quartier || 'Quartier non renseigné'}{sel.job ? ` · ${sel.job}` : ''}</p></div></div>
              <span className={'pill' + (sel.identity_status === 'verified' ? '' : ' warn')}>{sel.identity_status === 'pending' ? 'À examiner' : sel.identity_status === 'rejected' ? 'À corriger' : sel.identity_status === 'verified' ? 'Vérifiée' : 'Non vérifiée'}</span></header>
            <div className="adm-docs">{docs.length === 0 ? <div className="adm-empty"><b>Aucun document</b><span>Cette personne n’a pas (ou plus) de pièce enregistrée.</span></div>
              : docs.map(d => <figure key={d.side} className="adm-doc"><figcaption>{d.side === 'front' ? 'Recto' : 'Verso'}</figcaption>
                {!docLinks[d.storage_path] ? <div className="adm-doc-load">Chargement…</div>
                  : /\.pdf($|\?)/i.test(d.storage_path) ? <a className="btn ghost sm" href={docLinks[d.storage_path]} target="_blank" rel="noreferrer">Ouvrir le PDF</a>
                  : <a href={docLinks[d.storage_path]} target="_blank" rel="noreferrer" title="Ouvrir en grand"><img src={docLinks[d.storage_path]} alt={`Pièce d’identité, ${d.side === 'front' ? 'recto' : 'verso'}`} /></a>}</figure>)}</div>
            {sel.identity_review_note && <div className="notice warn"><b>Pourquoi ce dossier est en revue manuelle :</b> {sel.identity_review_note}</div>}
            <p className="adm-note">Accès privé : les liens expirent au bout de 10 minutes. Les copies sont supprimées dès votre décision.</p>
            {sel.identity_status === 'pending' && <>
              <fieldset className="adm-checks"><legend>Avant de valider</legend>
                {([['name', 'Le nom sur la pièce correspond au compte'], ['selfie', 'La photo de profil ressemble à la photo de la pièce'], ['face', 'Recto et verso sont de la même pièce'], ['legible', 'La pièce est lisible, sans retouche visible'], ['valid', 'La pièce n’est pas expirée']] as const).map(([k, label]) =>
                  <label key={k}><input type="checkbox" checked={!!checks[k]} onChange={e => setChecks(c => ({ ...c, [k]: e.target.checked }))} />{label}</label>)}</fieldset>
              <div className="adm-actions"><button className="btn" disabled={!allChecked || busy || docs.length !== 2} onClick={() => decideSelected(sel.id, 'verified')}>Vérifier l’identité</button>
                <button className="btn danger" disabled={busy} onClick={() => decideSelected(sel.id, 'rejected')}>Demander de nouveaux documents</button></div>
              {docs.length !== 2 && <p className="adm-note">Il faut les deux faces de la pièce pour valider.</p>}</>}
          </>}
        </section>
      </div>
    })() : tab === 'overview' ? <div className="stack">
      <div className="card stack"><h2 className="h3">À traiter</h2>
        <button className="admin-queue-row" onClick={() => setTab('verif')}><span>Identités à vérifier</span><span className="pill warn">{pendingIdentities.length}</span></button>
        <button className="admin-queue-row" onClick={() => { setTab('listings'); setListingFilter('incomplete') }}><span>Annonces incomplètes masquées</span><span className="pill warn">{incompleteListings.length}</span></button>
        <button className="admin-queue-row" onClick={() => { setTab('bookings'); setBookingFilter('requested') }}><span>Demandes de réservation en attente</span><span className="pill warn">{requestedBookings.length}</span></button>
        {disputes.length > 0 && <button className="admin-queue-row" onClick={() => setTab('bookings')}><span>Litiges à examiner</span><span className="pill warn">{disputes.length}</span></button>}
      </div>
      <div className="card stack"><h2 className="h3">Activité récente</h2>
        {feed.length ? feed.map((e, i) => <div key={i} className="adm-feed"><span><b>{e.who}</b> {e.text}</span><small>{ago(e.at)}</small></div>) : <p className="small muted">Aucune activité pour le moment.</p>}</div>
      <div className="card stack"><h2 className="h3">Inscriptions · 8 dernières semaines</h2>
        {(() => {
          const weeks = Array.from({ length: 8 }, (_, i) => { const end = Date.now() - (7 - i) * 7 * 86400000; const start = end - 7 * 86400000; return { label: new Date(end).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }), n: users.filter(u => u.created_at && new Date(u.created_at).getTime() > start && new Date(u.created_at).getTime() <= end).length } })
          const max = Math.max(1, ...weeks.map(w => w.n))
          return <div className="adm-bars">{weeks.map(w => <div key={w.label}><span style={{ height: `${Math.max(4, (w.n / max) * 100)}%` }} title={`${w.n} inscription(s)`} /><b>{w.n}</b><small>{w.label}</small></div>)}</div>
        })()}</div>
      <div className="card stack"><h2 className="h3">Vérification d’identité</h2>
        {([['unverified', 'Non vérifiés'], ['pending', 'À examiner'], ['verified', 'Vérifiés'], ['rejected', 'À corriger']] as const).map(([k, label]) => { const c = users.filter(u => u.identity_status === k).length; return <div key={k} className="adm-meter"><span>{label}</span><div><i style={{ width: `${users.length ? (c / users.length) * 100 : 0}%` }} /></div><b>{c}</b></div> })}</div>
      <div className="card stack"><h2 className="h3">État de la plateforme</h2>
        <div className="row between"><span className="soft">Annonces de démonstration conservées en base</span><span className="bold">{listings.filter(l => l.is_demo).length}</span></div>
        <div className="row between"><span className="soft">Réservations enregistrées</span><span className="bold">{bookings.length}</span></div>
        <p className="small muted">Les annonces vides, de test ou de démonstration restent dans l’espace admin, mais ne sont pas proposées aux visiteurs. Les paiements ne sont pas intégrés.</p>
      </div>
    </div> : tab === 'users' ? <div className="stack">
      <div className="grid2 admin-filters">
        <div className="field"><label htmlFor="admin-search-users">Rechercher un compte</label><input id="admin-search-users" type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Nom, quartier…" /></div>
        <div className="field"><label htmlFor="admin-user-filter">Filtrer</label><select id="admin-user-filter" value={userFilter} onChange={e => setUserFilter(e.target.value)}><option value="all">Tous les comptes</option><option value="pending">Identité à examiner</option><option value="verified">Identité vérifiée</option><option value="unverified">Identité non vérifiée</option><option value="rejected">Documents à corriger</option><option value="suspended">Comptes suspendus</option></select></div>
      </div>
      <div className="small muted">{filteredUsers.length} compte{filteredUsers.length > 1 ? 's' : ''}</div>
      {filteredUsers.map(u => {
        const docs = identityDocs.filter(d => d.user_id === u.id)
        return <div key={u.id} className="card stack" style={{ padding: 14 }}>
          <div className="row top"><Avatar url={u.avatar_url} name={u.first_name} size={44} /><div className="stack s2 grow"><div className="bold">{n(u)}{u.is_admin ? ' · admin' : ''}</div>
            <div className="small muted">Inscription : {u.created_at ? new Date(u.created_at).toLocaleDateString('fr-FR') : '—'} · {u.quartier || 'Quartier non renseigné'} · score {u.score} · {u.rentals_done} empr. · {u.owner_rentals} loc.</div>
            <span className={'pill' + (u.identity_status === 'verified' ? '' : ' warn')}>Identité : {u.identity_status === 'verified' ? 'vérifiée' : u.identity_status === 'pending' ? 'à examiner' : u.identity_status === 'rejected' ? 'à corriger' : 'non vérifiée'}</span>
            {u.suspended && <span className="pill warn">Compte suspendu</span>}
            <div className="small muted">{meta[u.id]?.email || '—'} · dernière connexion : {ago(meta[u.id]?.last)}</div></div>
            <div className="stack s2 admin-user-actions"><button className="btn ghost sm" onClick={() => setOpenUser(openUser === u.id ? null : u.id)}>{openUser === u.id ? 'Masquer l’activité' : 'Voir l’activité'}</button><button className="btn danger sm" onClick={() => run('admin_set_suspended', { p_user: u.id, p_value: !u.suspended })}>{u.suspended ? 'Réactiver' : 'Suspendre'}</button></div></div>
          {openUser === u.id && (() => {
            const mine = listings.filter(l => l.owner_id === u.id)
            const asBorrower = bookings.filter(b => b.borrower_id === u.id)
            const asOwner = bookings.filter(b => b.owner_id === u.id)
            return <div className="adm-activity">
              <div className="adm-kpis"><div><b>{mine.length}</b><span>annonces</span></div><div><b>{asBorrower.length}</b><span>demandes envoyées</span></div><div><b>{asOwner.length}</b><span>demandes reçues</span></div><div><b>{u.score}</b><span>score</span></div></div>
              <div className="adm-act-cols">
                <div><h4>Annonces</h4>{mine.length ? mine.map(l => <div key={l.id} className="adm-act-row"><span>{l.title}</span><small>{l.status === 'online' ? 'En ligne' : l.status === 'paused' ? 'En pause' : 'Masquée'} · {fdate(l.created_at)}</small></div>) : <p className="small muted">Aucune annonce.</p>}</div>
                <div><h4>Réservations</h4>{asBorrower.length + asOwner.length ? [...asBorrower.map(b => ({ b, role: 'Emprunteur' })), ...asOwner.map(b => ({ b, role: 'Loueur' }))].sort((x, y) => new Date(y.b.created_at).getTime() - new Date(x.b.created_at).getTime()).map(({ b, role }) => <div key={b.id + role} className="adm-act-row"><span>{b.listing?.title || 'Annonce'}</span><small>{role} · {STATUS_LABEL[b.status] || b.status} · {fdate(b.created_at)}</small></div>) : <p className="small muted">Aucune réservation.</p>}</div>
              </div></div>
          })()}
          {docs.length > 0 && <div className="stack s8 identity-review">
            <div className="small bold">Pièce d’identité · accès privé, liens expirant sous 10 minutes</div>
            <div className="row wrap">{docs.map(d => docLinks[d.storage_path]
              ? <a key={d.side} className="btn ghost sm" href={docLinks[d.storage_path]} target="_blank" rel="noreferrer">Ouvrir {d.side === 'front' ? 'le recto' : 'le verso'}</a>
              : <button key={d.side} type="button" className="btn ghost sm" onClick={() => showIdentityDocument(d.storage_path)}>Afficher {d.side === 'front' ? 'le recto' : 'le verso'}</button>)}</div>
            {u.identity_status === 'pending' && <div className="grid2"><button className="btn sm" onClick={() => decideIdentity(u.id, 'verified')}>Vérifier l’identité</button><button className="btn danger sm" onClick={() => decideIdentity(u.id, 'rejected')}>Demander de nouveaux documents</button></div>}
          </div>}
        </div>
      })}
      {filteredUsers.length === 0 && <div className="card soft">Aucun compte ne correspond à cette recherche.</div>}
    </div> : tab === 'listings' ? <div className="stack">
      <div className="grid2 admin-filters">
        <div className="field"><label htmlFor="admin-search-listings">Rechercher une annonce</label><input id="admin-search-listings" type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Matériel, catégorie, quartier…" /></div>
        <div className="field"><label htmlFor="admin-listing-filter">Afficher</label><select id="admin-listing-filter" value={listingFilter} onChange={e => setListingFilter(e.target.value)}><option value="all">Toutes</option><option value="public">Complètes et publiables</option><option value="incomplete">Incomplètes</option><option value="online">En ligne</option><option value="paused">En pause</option><option value="hidden">Masquées</option><option value="demo">Exemples de démonstration</option></select></div>
      </div>
      <div className="small muted">{filteredListings.length} annonce{filteredListings.length > 1 ? 's' : ''}</div>
      {filteredListings.map(l => <div key={l.id} className="card stack s8" style={{ padding: 12 }}>
        <div className="row"><div className="stack s2 grow"><div className="bold">{l.title}</div><div className="small muted">{l.is_demo ? `Exemple · ${l.demo_owner}` : n(l.owner)} · {l.quartier} · {fcfa(l.price)} / jour</div></div>
          <span className={'pill' + (l.status === 'online' && isReadyForPublic(l) ? '' : ' warn')}>{l.status === 'online' && isReadyForPublic(l) ? 'Visible' : l.status === 'paused' ? 'En pause' : l.status === 'hidden' ? 'Masquée' : 'Incomplète · non affichée'}</span></div>
        <div className="small soft">{(l.description || '').trim().length < 30 ? 'Description à compléter' : 'Description renseignée'} · {Array.isArray(l.photos) ? l.photos.filter(Boolean).length : 0} photo(s)</div>
        <div className="grid2">
          <button className="btn ghost sm" onClick={() => run('admin_set_listing_status', { p_listing: l.id, p_status: l.status === 'hidden' ? 'online' : 'hidden' })}>{l.status === 'hidden' ? 'Remettre en ligne' : 'Masquer'}</button>
          {l.is_demo ? <button className="btn danger sm" onClick={() => removeListing(l.id)}>Supprimer l’exemple</button> : <span />}
        </div></div>)}
      {filteredListings.length === 0 && <div className="card soft">Aucune annonce ne correspond à ce filtre.</div>}
    </div> : <div className="stack">
      <div className="grid2 admin-filters">
        <div className="field"><label htmlFor="admin-search-bookings">Rechercher une réservation</label><input id="admin-search-bookings" type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Matériel, emprunteur, loueur…" /></div>
        <div className="field"><label htmlFor="admin-booking-filter">Statut</label><select id="admin-booking-filter" value={bookingFilter} onChange={e => setBookingFilter(e.target.value)}><option value="all">Tous les statuts</option>{Object.entries(STATUS_LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div>
      </div>
      <div className="card table-scroll"><table>
        <thead><tr><th>Matériel</th><th>Emprunteur</th><th>Loueur</th><th>État</th><th>Prix indicatif</th><th>Paiement</th></tr></thead>
        <tbody>{filteredBookings.map(b => <tr key={b.id}><td>{b.listing?.title}</td><td>{n(b.borrower)}</td><td>{n(b.owner)}</td><td>{STATUS_LABEL[b.status]}</td>
          <td className="num">{Number(b.price_total || 0).toLocaleString('fr-FR')} F</td><td>Non intégré</td></tr>)}
          {filteredBookings.length === 0 && <tr><td colSpan={6}>Aucune réservation ne correspond à ce filtre.</td></tr>}
        </tbody></table></div>
    </div>}
  </Page>
}
