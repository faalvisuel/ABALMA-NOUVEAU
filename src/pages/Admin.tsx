import { useCallback, useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase, errMsg } from '../lib/supabase'
import { useAuth } from '../auth'
import { fcfa, isReadyForPublic, STATUS_LABEL } from '../lib/util'
import { ErrorBox, Header, Page, Spinner } from '../components/ui'

type AdminTab = 'overview' | 'users' | 'listings' | 'bookings'

export default function Admin() {
  const { profile, loading } = useAuth()
  const [tab, setTab] = useState<AdminTab>('overview')
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

  const load = useCallback(async () => {
    const [u, l, b, d] = await Promise.all([
      supabase.from('profiles').select('*').order('created_at', { ascending: false }),
      supabase.from('listings').select('*, owner:profiles(first_name,last_name)').order('created_at', { ascending: false }),
      supabase.from('bookings').select('*, listing:listings(title), borrower:profiles!bookings_borrower_id_fkey(first_name,last_name), owner:profiles!bookings_owner_id_fkey(first_name,last_name)').order('created_at', { ascending: false }),
      supabase.from('identity_documents').select('*').order('created_at', { ascending: true }),
    ])
    const firstError = u.error || l.error || b.error || d.error
    setErr(firstError ? errMsg(firstError) : null)
    setUsers(u.data || []); setListings(l.data || []); setBookings(b.data || []); setIdentityDocs(d.data || []); setReady(true)
  }, [])
  useEffect(() => { if (profile?.is_admin) load() }, [profile?.is_admin, load])

  if (loading) return <Page><Spinner /></Page>
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

  const n = (p: any) => p ? `${p.first_name || ''} ${p.last_name || ''}`.trim() || '—' : '—'
  const disputes = bookings.filter(b => b.status === 'dispute')
  const pendingIdentities = users.filter(u => u.identity_status === 'pending')
  const onlineListings = listings.filter(l => l.status === 'online' && isReadyForPublic(l))
  const incompleteListings = listings.filter(l => !l.is_demo && !isReadyForPublic(l))
  const newUsers = users.filter(u => u.created_at && Date.now() - new Date(u.created_at).getTime() < 30 * 86400000)
  const requestedBookings = bookings.filter(b => b.status === 'requested')
  const query = search.trim().toLocaleLowerCase('fr')
  const matches = (...parts: unknown[]) => !query || parts.some(part => String(part || '').toLocaleLowerCase('fr').includes(query))
  const filteredUsers = users.filter(u => {
    const statusMatch = userFilter === 'all' || (userFilter === 'suspended' ? u.suspended : u.identity_status === userFilter)
    return statusMatch && matches(n(u), u.quartier, u.id)
  })
  const filteredListings = listings.filter(l => {
    const statusMatch = listingFilter === 'all' || (listingFilter === 'incomplete' ? !l.is_demo && !isReadyForPublic(l)
      : listingFilter === 'demo' ? l.is_demo : listingFilter === 'public' ? isReadyForPublic(l) : l.status === listingFilter)
    return statusMatch && matches(l.title, l.category, l.quartier, n(l.owner), l.demo_owner)
  })
  const filteredBookings = bookings.filter(b => (bookingFilter === 'all' || b.status === bookingFilter)
    && matches(b.listing?.title, n(b.borrower), n(b.owner), STATUS_LABEL[b.status], b.id))

  return <Page>
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
      {([['overview', 'Vue d’ensemble'], ['users', 'Comptes'], ['listings', 'Annonces'], ['bookings', 'Réservations']] as const).map(([key, label]) =>
        <button key={key} role="tab" aria-selected={tab === key} className={'chip' + (tab === key ? ' on' : '')} onClick={() => { setTab(key); setSearch('') }}>{label}</button>)}
    </div>
    {!ready ? <Spinner /> : tab === 'overview' ? <div className="stack">
      <div className="card stack"><h2 className="h3">À traiter</h2>
        <button className="admin-queue-row" onClick={() => setTab('users')}><span>Identités à vérifier</span><span className="pill warn">{pendingIdentities.length}</span></button>
        <button className="admin-queue-row" onClick={() => { setTab('listings'); setListingFilter('incomplete') }}><span>Annonces incomplètes masquées</span><span className="pill warn">{incompleteListings.length}</span></button>
        <button className="admin-queue-row" onClick={() => { setTab('bookings'); setBookingFilter('requested') }}><span>Demandes de réservation en attente</span><span className="pill warn">{requestedBookings.length}</span></button>
        {disputes.length > 0 && <button className="admin-queue-row" onClick={() => setTab('bookings')}><span>Litiges à examiner</span><span className="pill warn">{disputes.length}</span></button>}
      </div>
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
          <div className="row top"><div className="stack s2 grow"><div className="bold">{n(u)}{u.is_admin ? ' · admin' : ''}</div>
            <div className="small muted">Inscription : {u.created_at ? new Date(u.created_at).toLocaleDateString('fr-FR') : '—'} · {u.quartier || 'Quartier non renseigné'} · score {u.score} · {u.rentals_done} empr. · {u.owner_rentals} loc.</div>
            <span className={'pill' + (u.identity_status === 'verified' ? '' : ' warn')}>Identité : {u.identity_status === 'verified' ? 'vérifiée' : u.identity_status === 'pending' ? 'à examiner' : u.identity_status === 'rejected' ? 'à corriger' : 'non vérifiée'}</span>
            {u.suspended && <span className="pill warn">Compte suspendu</span>}</div>
            <div className="stack s2 admin-user-actions"><button className="btn danger sm" onClick={() => run('admin_set_suspended', { p_user: u.id, p_value: !u.suspended })}>{u.suspended ? 'Réactiver' : 'Suspendre'}</button></div></div>
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
