import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase, errMsg } from '../lib/supabase'
import { useAuth } from '../auth'
import { borrowerLevel, fcfa, frDate, parseIso } from '../lib/util'
import { Calendar, ErrorBox, Header, Icon, Note, Page, Row, Spinner, Star } from '../components/ui'

export default function Reserve() {
  const { id } = useParams()
  const nav = useNavigate()
  const { profile } = useAuth()
  const [l, setL] = useState<any>(undefined)
  const [busy, setBusy] = useState<[string, string][]>([])
  const [start, setStart] = useState<string | null>(null)
  const [end, setEnd] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  useEffect(() => {
    supabase.from('listings').select('*, owner:public_profiles(first_name)').eq('id', id).maybeSingle().then(({ data }) => setL(data || null))
    supabase.rpc('listing_busy', { p_listing: id }).then(({ data }) => setBusy((data || []).map((r: any) => [r.start_date, r.end_date])))
  }, [id])

  if (l === undefined) return <Page nav={false}><Spinner /></Page>
  if (!l) return <Page nav={false}><Header title="Annonce introuvable" back="/" /></Page>
  if (profile?.identity_status !== 'verified') return <Page nav={false}>
    <Header title="Vérifiez votre identité" back={`/annonce/${id}`} />
    <div className="card stack"><p className="soft">La vérification manuelle de votre pièce d’identité est nécessaire avant d’envoyer une demande de location.</p>
      <Link to="/profil#identite" className="btn">Vérifier mon identité</Link></div>
  </Page>

  const score = profile?.score ?? 400
  const lvl = borrowerLevel(score)
  const last = end || start
  const days = start && last ? Math.round((parseIso(last).getTime() - parseIso(start).getTime()) / 86400000) + 1 : 0
  const total = days * l.price
  const discount = Math.round(total * lvl.pct / 100)
  const deposit = score >= 750 ? Math.floor(l.deposit / 2) : l.deposit

  async function send() {
    if (!start) return
    setSending(true); setErr(null)
    const { data, error } = await supabase.rpc('request_booking', { p_listing: id, p_start: start, p_end: last })
    setSending(false)
    if (error) return setErr(errMsg(error))
    nav(`/reservation/${data}`, { replace: true })
  }

  return <Page nav={false}>
    <Header title="Vos dates" back={`/annonce/${id}`} />
    <div className="card"><Calendar busy={busy} start={start} end={end} onChange={(s, e) => { setStart(s); setEnd(e) }} /></div>
    {start && <div className="grid2">
      <div className="card stack s2" style={{ padding: '12px 14px' }}><div className="tiny muted">Remise du matériel</div><div className="bold">{frDate(start)}</div></div>
      <div className="card stack s2" style={{ padding: '12px 14px' }}><div className="tiny muted">Retour</div><div className="bold">{frDate(last!)}</div></div>
    </div>}
    <div className="card stack">
      <h2 className="h3">Récapitulatif</h2>
      {days === 0 ? <div className="soft small">Choisissez vos dates pour voir le prix.</div> : <>
        <Row l={`${l.title} · ${days} jour${days > 1 ? 's' : ''} × ${fcfa(l.price)}`} v={fcfa(total)} />
        {discount > 0 && <Row l={`Réduction indicative ${lvl.name} (${lvl.pct} %)`} v={'− ' + fcfa(discount)} />}
        <hr className="sep" />
        <Row l="Estimation indicative" v={fcfa(total - discount)} bold />
        <Row l="Caution éventuelle (à convenir directement)" v={fcfa(deposit)} />
      </>}
    </div>
    <Link to="/score" className="card tint row" style={{ padding: '12px 14px', color: 'inherit' }}>
      <Star size={22} />
      <div className="stack s2 grow">
        <div className="bold" style={{ fontSize: 14 }}>Score de confiance : {score} · {lvl.name}</div>
        <div className="small soft">{lvl.next ? `Encore ${lvl.next.min - score} points pour le niveau ${lvl.next.name}.` : 'Vous avez le meilleur niveau.'}</div>
      </div>
      <Icon name="right" size={18} />
    </Link>
    <Note icon="shield">ABALMA ne collecte aucun paiement ni caution. Convenez des modalités directement avec le propriétaire avant la remise.</Note>
    <ErrorBox msg={err} />
    <div className="sticky-foot">
      <button className="btn" disabled={!start || sending} onClick={send}>{sending ? 'Envoi…' : score >= 900 ? 'Réserver (acceptation automatique)' : 'Envoyer la demande'}</button>
      <div className="tiny muted center">Demande sans paiement intégré · les montants affichés sont indicatifs.</div>
    </div>
  </Page>
}
