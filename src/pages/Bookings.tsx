import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, errMsg } from '../lib/supabase'
import { useAuth } from '../auth'
import { fcfa, frDate, STATUS_LABEL } from '../lib/util'
import { ErrorBox, Page, Spinner, Thumb } from '../components/ui'

export const BOOKING_SELECT = '*, listing:listings(id,title,photos,quartier), borrower:profiles!bookings_borrower_id_fkey(id,first_name,last_name,verified,score,rentals_done,disputes,borrower_rating), owner:profiles!bookings_owner_id_fkey(id,first_name,last_name,verified,owner_rating,owner_rentals)'

export function BookingRow({ b, as }: { b: any; as: 'borrower' | 'owner' }) {
  const warn = ['requested', 'accepted', 'dispute'].includes(b.status)
  return <Link to={`/reservation/${b.id}`} className="listing-card">
    <Thumb src={b.listing?.photos?.[0]} small />
    <div className="stack s2 grow">
      <div className="bold">{b.listing?.title}</div>
      <div className="small muted">{frDate(b.start_date)} → {frDate(b.end_date)} · {b.days} jour{b.days > 1 ? 's' : ''}</div>
      <div className="small num semi">Estimation indicative : {fcfa(b.price_total)}</div>
    </div>
    <span className={'pill' + (warn ? ' warn' : '')}>{STATUS_LABEL[b.status]}</span>
  </Link>
}

export default function Bookings() {
  const { user } = useAuth()
  const [rows, setRows] = useState<any[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    supabase.from('bookings').select(BOOKING_SELECT).eq('borrower_id', user.id).order('created_at', { ascending: false })
      .then(({ data, error }) => { if (error) setErr(errMsg(error)); setRows(data || []) })
  }, [user.id])
  const active = (rows || []).filter(b => ['requested', 'accepted', 'paid', 'ongoing', 'dispute'].includes(b.status))
  const past = (rows || []).filter(b => !active.includes(b))
  return <Page>
    <h1 className="display h1">Mes réservations</h1>
    <ErrorBox msg={err} />
    {rows === null ? <Spinner /> : rows.length === 0 ? <div className="card stack">
      <div className="bold">Aucune réservation pour l'instant</div>
      <div className="soft small">Vos demandes de location apparaîtront ici, avec votre code de remise et le contact du propriétaire.</div>
      <Link to="/accueil#annonces" className="btn">Trouver du matériel</Link>
    </div> : <>
      {active.length > 0 && <div className="stack"><h2 className="h3">En cours</h2>{active.map(b => <BookingRow key={b.id} b={b} as="borrower" />)}</div>}
      {past.length > 0 && <div className="stack"><h2 className="h3">Historique</h2>{past.map(b => <BookingRow key={b.id} b={b} as="borrower" />)}</div>}
    </>}
  </Page>
}

