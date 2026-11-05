import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase, errMsg } from '../lib/supabase'
import { useAuth } from '../auth'
import { borrowerLevel, fcfa, frDate, initials, shortName, STATUS_LABEL, TAGS_FOR_BORROWER, TAGS_FOR_OWNER } from '../lib/util'
import { ErrorBox, Header, Icon, Note, Page, Row, Spinner, Star, Stars, Thumb } from '../components/ui'
import { BOOKING_SELECT } from './Bookings'

export default function BookingDetail() {
  const { id } = useParams()
  const { user, refresh } = useAuth()
  const [b, setB] = useState<any>(undefined)
  const [code, setCode] = useState<string | null>(null)
  const [priv, setPriv] = useState<any>(null)
  const [myReview, setMyReview] = useState<any>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const { data } = await supabase.from('bookings').select(BOOKING_SELECT).eq('id', id).maybeSingle()
    setB(data || null)
    if (!data) return
    if (data.borrower_id === user.id && ['accepted', 'ongoing'].includes(data.status)) {
      const [c, p] = await Promise.all([
        supabase.from('booking_codes').select('code').eq('booking_id', id).maybeSingle(),
        supabase.from('listing_private').select('*').eq('listing_id', data.listing_id).maybeSingle(),
      ])
      setCode(c.data?.code || null); setPriv(p.data || null)
    }
    const r = await supabase.from('reviews').select('*').eq('booking_id', id).eq('author_id', user.id).maybeSingle()
    setMyReview(r.data || null)
  }, [id, user.id])
  useEffect(() => { load() }, [load])

  async function call(fn: string, args: any) {
    setBusy(true); setErr(null)
    const { data, error } = await supabase.rpc(fn, args)
    setBusy(false)
    if (error) { setErr(errMsg(error)); return undefined }
    await load(); await refresh()
    return data ?? true
  }

  if (b === undefined) return <Page nav={false}><Spinner /></Page>
  if (!b) return <Page nav={false}><Header title="Réservation introuvable" back="/reservations" /></Page>

  const iAmOwner = b.owner_id === user.id
  const other = iAmOwner ? b.borrower : b.owner

  return <Page nav={false}>
    <Header title={iAmOwner ? 'Demande de location' : 'Ma réservation'} back={iAmOwner ? '/revenus' : '/reservations'} />
    <div className="card row" style={{ padding: 12 }}>
      <Thumb src={b.listing?.photos?.[0]} small />
      <div className="stack s2 grow">
        <div className="bold">{b.listing?.title}</div>
        <div className="small muted">{frDate(b.start_date)} → {frDate(b.end_date)} · {b.days} jour{b.days > 1 ? 's' : ''}</div>
      </div>
      <span className="pill">{STATUS_LABEL[b.status]}</span>
    </div>
    <ErrorBox msg={err} />
    {iAmOwner
      ? <OwnerView b={b} busy={busy} call={call} />
      : <BorrowerView b={b} busy={busy} call={call} code={code} priv={priv} />}
    {b.status === 'done' && (myReview
      ? <div className="card stack s6"><div className="bold">Votre avis</div><Stars value={myReview.stars} size={20} />{myReview.comment && <div className="soft small">{myReview.comment}</div>}</div>
      : <ReviewForm who={shortName(other)} ini={initials(other?.first_name, other?.last_name)} tags={iAmOwner ? TAGS_FOR_BORROWER : TAGS_FOR_OWNER} busy={busy}
          note={iAmOwner ? 'Votre note compte dans le score de confiance de l’emprunteur.' : 'Votre avis aide les autres emprunteurs et fait monter le niveau du loueur.'}
          onSend={(stars, tags, comment) => call('submit_review', { p_id: b.id, p_stars: stars, p_tags: tags, p_comment: comment })} />)}
    <div className="card stack">
      <h2 className="h3">Montants</h2>
      <Row l={`${b.days} jour${b.days > 1 ? 's' : ''} · estimation de location`} v={fcfa(b.price_total)} />
      {!iAmOwner && b.discount > 0 && <Row l="Réduction score de confiance" v={'− ' + fcfa(b.discount)} />}
      <Row l="Caution éventuelle convenue entre vous" v={fcfa(b.deposit)} />
      <div className="small soft">Paiement non intégré : aucun montant n’a été encaissé ni versé par ABALMA. Convenez directement de toute modalité avec l’autre partie.</div>
    </div>
  </Page>
}

function BorrowerView({ b, busy, call, code, priv }: any) {
  const owner = shortName(b.owner)
  if (b.status === 'requested') return <div className="stack">
    <div className="notice">Votre demande est envoyée. {owner} doit l’accepter avant que vous puissiez convenir directement des modalités.</div>
    <button className="btn danger sm" disabled={busy} onClick={() => call('cancel_booking', { p_id: b.id })}>Annuler ma demande</button>
  </div>
  if (b.status === 'refused') return <div className="notice">{owner} n'a pas pu accepter cette demande. Vous pouvez chercher un autre matériel. <Link to="/accueil#annonces" className="bold">Retour aux annonces</Link></div>
  if (b.status === 'cancelled') return <div className="notice">Cette réservation est annulée.</div>
  if (b.status === 'accepted') return <div className="stack s16">
    <div className="notice"><b>Demande acceptée · paiement non intégré.</b> Aucun paiement n’a été fait via ABALMA. Convenez directement des conditions avec {owner} avant la remise.</div>
    <div className="code-box"><div className="label">Votre code de remise</div><div className="code">{code ? code.split('').join(' ') : '· · · ·'}</div><div className="small muted">Partagez-le uniquement quand le matériel est effectivement remis.</div></div>
    <Contact priv={priv} owner={owner} />
    <button className="btn danger sm" disabled={busy} onClick={() => call('cancel_booking', { p_id: b.id })}>Annuler la réservation</button>
  </div>
  if (b.status === 'ongoing') return <div className="stack s16">
    <div className="notice">Location déclarée en cours. Retour prévu le {frDate(b.end_date, true)}.</div>
    <Contact priv={priv} owner={owner} />
  </div>
  if (b.status === 'dispute') return <div className="notice">Un problème a été signalé par {owner}. ABALMA examine la situation et vous contactera.</div>
  return <div className="notice">Location terminée. Votre caution est libérée.</div>
}

function Contact({ priv, owner }: { priv: any; owner: string }) {
  if (!priv) return <div className="notice">Le propriétaire n'a pas encore renseigné son adresse.</div>
  const digits = (priv.whatsapp || '').replace(/\D/g, '')
  const intl = digits.startsWith('221') ? digits : '221' + digits
  return <>
    <div className="card stack">
      <div className="stack s2"><div className="label">Lieu de remise</div><div className="bold" style={{ fontSize: 16 }}>{priv.exact_address || 'Adresse non renseignée'}</div></div>
      {priv.exact_address && <a className="btn ghost sm" target="_blank" rel="noreferrer" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(priv.exact_address + ', Dakar, Sénégal')}`}><Icon name="nav" size={18} />Ouvrir l'itinéraire</a>}
    </div>
    <div className="card stack">
      <div className="stack s2"><div className="label">Contact de {owner}</div><div className="display" style={{ fontSize: 20 }}>{priv.whatsapp || 'Numéro non renseigné'}</div></div>
      {digits && <div className="grid2">
        <a className="btn sm" target="_blank" rel="noreferrer" href={`https://wa.me/${intl}`}><Icon name="chat" size={18} />WhatsApp</a>
        <a className="btn ghost sm" href={`tel:+${intl}`}><Icon name="phone" size={18} />Appeler</a>
      </div>}
    </div>
    <Note icon="lock">L'adresse et le numéro sont visibles uniquement pour le propriétaire et les personnes ayant une demande acceptée ou en cours.</Note>
  </>
}

function OwnerView({ b, busy, call }: any) {
  const [code, setCode] = useState('')
  const [wrong, setWrong] = useState(false)
  const [late, setLate] = useState(false)
  const [problem, setProblem] = useState('')
  const [showProblem, setShowProblem] = useState(false)
  const p = b.borrower, lvl = borrowerLevel(p?.score ?? 400), name = shortName(p)
  const who = <div className="card stack">
    <div className="row"><div className="avatar light">{initials(p?.first_name, p?.last_name)}</div>
      <div className="stack s2 grow"><div className="bold">{name}{p?.verified ? ' · Identité vérifiée' : ''}</div>
        <div className="small muted">{p?.rentals_done || 0} location{(p?.rentals_done || 0) > 1 ? 's' : ''} terminée{(p?.rentals_done || 0) > 1 ? 's' : ''} · {p?.disputes || 0} litige{(p?.disputes || 0) > 1 ? 's' : ''}</div></div></div>
    <div className="card tint row small semi" style={{ padding: '8px 12px' }}><Star size={18} />Score de confiance {p?.score ?? 400} · {lvl.name}</div>
  </div>
  if (b.status === 'requested') return <div className="stack s16">{who}
    <div className="grid2">
      <button className="btn ghost sm" disabled={busy} onClick={() => call('respond_booking', { p_id: b.id, p_accept: false })}>Refuser</button>
      <button className="btn sm" disabled={busy} onClick={() => call('respond_booking', { p_id: b.id, p_accept: true })}>Accepter</button>
    </div></div>
  if (b.status === 'accepted') return <div className="stack s16">{who}
    <div className="notice">Demande acceptée. Aucun paiement n’est intégré. Confirmez les modalités directement avec {name} avant la remise.</div>
    <div className="card stack center">
      <h2 className="h3">Saisissez le code donné par {name}</h2>
      <div className="field"><label htmlFor="code" className="small muted">Code à 4 chiffres</label>
        <input id="code" className="code-input" inputMode="numeric" maxLength={4} autoComplete="off" value={code} onChange={e => { setCode(e.target.value.replace(/\D/g, '')); setWrong(false) }} /></div>
      {wrong && <div className="error" role="alert">Code incorrect. Vérifiez avec {name} ({5 - (b.code_attempts || 0)} essai{5 - (b.code_attempts || 0) > 1 ? 's' : ''} restant{5 - (b.code_attempts || 0) > 1 ? 's' : ''}).</div>}
      <div className="small muted">L’emprunteur vous le donne une fois le matériel en main. Ce code confirme la remise déclarée dans l’application; il ne confirme aucun paiement.</div>
    </div>
    <button className="btn" disabled={busy || code.length !== 4} onClick={async () => { const ok = await call('confirm_handover', { p_id: b.id, p_code: code }); if (ok === false) setWrong(true) }}>Valider la remise</button>
  </div>
  if (b.status === 'ongoing') return <div className="stack s16">{who}
    <div className="notice">Location déclarée en cours. Retour prévu le {frDate(b.end_date, true)}. Aucun versement n’est effectué par ABALMA.</div>
    <label className="row" style={{ minHeight: 44 }}><input type="checkbox" checked={late} onChange={e => setLate(e.target.checked)} style={{ width: 20, height: 20, accentColor: '#0F3D2E' }} /><span>Le matériel a été rendu en retard</span></label>
    {showProblem && <div className="field"><label htmlFor="pb">Décrivez le problème (casse, pièce manquante…)</label><textarea id="pb" value={problem} onChange={e => setProblem(e.target.value)} /></div>}
    <button className="btn" disabled={busy || (showProblem && !problem.trim())} onClick={() => call('confirm_return', { p_id: b.id, p_late: late, p_problem: showProblem ? problem : '' })}>{showProblem ? 'Envoyer le signalement' : 'Valider le retour en bon état'}</button>
    <button className="link-btn" onClick={() => setShowProblem(!showProblem)}>{showProblem ? 'Finalement, tout va bien' : 'Signaler un problème'}</button>
  </div>
  if (b.status === 'dispute') return <div className="stack">{who}<div className="notice">Votre signalement est transmis à ABALMA : « {b.problem} »</div></div>
  if (b.status === 'done') return <div className="stack">{who}<div className="notice">Location terminée selon les déclarations des utilisateurs. Aucun versement n’a été effectué par ABALMA.</div></div>
  return <div className="stack">{who}<div className="notice">Cette demande est {b.status === 'refused' ? 'refusée' : 'annulée'}.</div></div>
}

function ReviewForm({ who, ini, tags, note, busy, onSend }: { who: string; ini: string; tags: string[]; note: string; busy: boolean; onSend: (s: number, t: string[], c: string) => void }) {
  const [stars, setStars] = useState(0)
  const [sel, setSel] = useState<string[]>([])
  const [comment, setComment] = useState('')
  return <div className="card stack s16">
    <div className="stack center" style={{ alignItems: 'center' }}>
      <div className="avatar lg">{ini}</div><div className="bold" style={{ fontSize: 17 }}>Votre avis sur {who}</div>
      <Stars value={stars} onChange={setStars} />
    </div>
    <div className="stack s8"><div className="bold">Qu'est-ce qui s'est bien passé ?</div>
      <div className="row wrap" style={{ gap: 8 }}>{tags.map(t => { const on = sel.includes(t); return <button key={t} type="button" className={'chip' + (on ? ' on' : '')} aria-pressed={on} onClick={() => setSel(on ? sel.filter(x => x !== t) : [...sel, t])}>{t}</button> })}</div></div>
    <div className="field"><label htmlFor="cm">Un mot pour les autres (facultatif)</label><textarea id="cm" maxLength={600} value={comment} onChange={e => setComment(e.target.value)} /></div>
    <div className="small soft">{note}</div>
    <button className="btn" disabled={busy || stars === 0} onClick={() => onSend(stars, sel, comment)}>Envoyer mon avis</button>
  </div>
}

