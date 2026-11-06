import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth'
import { fcfa, initials, isReadyForPublic, ownerLevel, shortName } from '../lib/util'
import { Icon, Page, Spinner, Star, Avatar } from '../components/ui'

export default function ListingPage() {
  const { id } = useParams()
  const nav = useNavigate()
  const { user } = useAuth()
  const [l, setL] = useState<any>(undefined)
  const [review, setReview] = useState<any>(null)
  const [i, setI] = useState(0)

  useEffect(() => {
    supabase.from('listings').select('*, owner:public_profiles(id,first_name,last_name,verified,owner_rentals,owner_rating,job,avatar_url)').eq('id', id).maybeSingle()
      .then(({ data }) => setL(data && isReadyForPublic(data) ? data : null))
    supabase.from('reviews').select('*, author:public_profiles!reviews_author_id_fkey(first_name,last_name)').eq('listing_id', id).eq('role', 'borrower_to_owner')
      .order('created_at', { ascending: false }).limit(1).then(({ data }) => setReview(data?.[0] || null))
  }, [id])

  if (l === undefined) return <Page nav={false}><Spinner /></Page>
  if (l === null) return <Page nav={false}><h1 className="display h2">Annonce introuvable</h1><Link to="/accueil" className="btn">Retour à l'accueil</Link></Page>

  const o = l.owner, lvl = ownerLevel(o)
  const name = l.is_demo ? l.demo_owner : shortName(o)
  const mine = user && o?.id === user.id
  const photos: string[] = l.photos || []

  return <Page nav={false} wide>
    <div className="listing-layout">
    <div className="listing-media">
    <div className="hero-photo">
      {photos.length ? <img src={photos[i]} alt={`${l.title}, photo ${i + 1} sur ${photos.length}`} /> : <div className="stack s6 center small"><Icon name="cam" size={44} stroke={1.5} />Pas encore de photo</div>}
      <button className="back" aria-label="Retour" onClick={() => nav(-1)}><Icon name="back" stroke={2.2} /></button>
      {photos.length > 1 && <div className="hero-dots">{photos.map((_, k) => <button key={k} className={k === i ? 'on' : ''} aria-label={`Photo ${k + 1}`} onClick={() => setI(k)}><i /></button>)}</div>}
    </div>
    {photos.length > 1 && <div className="listing-thumbs">{photos.map((src, k) => <button key={k} className={k === i ? 'on' : ''} aria-label={`Voir la photo ${k + 1}`} onClick={() => setI(k)}><img src={src} alt="" loading="lazy" /></button>)}</div>}
    </div>
    <div className="listing-info">
    <div className="stack s6">
      <div className="label">{l.category === 'Autre' && l.category_other ? l.category_other : l.category} · {l.quartier}</div>
      <h1 className="display h2">{l.title}</h1>
    </div>
    <div className="grid2">
      <div className="card stack s2" style={{ padding: '12px 14px' }}><div className="tiny muted">Prix par jour</div><div className="bold num" style={{ fontSize: 18 }}>{fcfa(l.price)}</div></div>
      <div className="card stack s2" style={{ padding: '12px 14px' }}><div className="tiny muted">Caution éventuelle à convenir</div><div className="bold num" style={{ fontSize: 18 }}>{fcfa(l.deposit)}</div></div>
    </div>
    <div className="card row" style={{ padding: '12px 14px' }}>
      {l.is_demo ? <div className="avatar">{(name || '?').slice(0, 1)}</div> : <Avatar url={o?.avatar_url} name={o?.first_name} size={44} />}
      <div className="stack s2 grow">
        <div className="bold">{name}</div>
        <div className="small muted">
          {l.is_demo ? 'Annonce d’exemple' : [o?.job, `${o?.owner_rentals || 0} location${(o?.owner_rentals || 0) > 1 ? 's' : ''}`, o?.owner_rating ? `note ${String(o.owner_rating).replace('.', ',')} sur 5` : 'pas encore de note'].filter(Boolean).join(' · ')}
        </div>
      </div>
      <div className="stack s6" style={{ alignItems: 'flex-end' }}>
        {o?.verified && <span className="pill"><Icon name="check" size={14} stroke={2.5} />Vérifié</span>}
        {lvl.rank > 0 && <span className={'pill' + (lvl.rank === 2 ? ' gold' : '')}>{lvl.name}</span>}
      </div>
    </div>
    {l.description && <div className="stack s8"><h2 className="h3">Description et accessoires inclus</h2><p className="soft" style={{ whiteSpace: 'pre-line' }}>{l.description}</p></div>}
    {review && <div className="card stack s6" style={{ padding: '12px 14px' }}>
      <div className="row small bold" style={{ gap: 6 }}><Star size={16} />{review.stars} sur 5 · {shortName(review.author)}</div>
      {review.comment && <div className="soft" style={{ fontSize: 14 }}>{review.comment}</div>}
    </div>}
    <div className="card stack s6" style={{ padding: '12px 14px' }}>
      <div className="small bold">Remise et retour</div>
      <div className="soft" style={{ fontSize: 14 }}>À récupérer chez le propriétaire, à {l.quartier}. L’adresse exacte et son numéro sont communiqués après acceptation de la demande.</div>
    </div>
    <div className="sticky-foot">
      {l.is_demo ? <div className="notice">Annonce d'exemple : elle montre à quoi ressemble une annonce, mais ne peut pas être réservée.</div>
        : mine ? <Link to="/mes-annonces" className="btn ghost">C'est votre annonce · la gérer</Link>
        : <div className="row" style={{ gap: 14 }}>
            <div className="stack s2"><div className="bold num" style={{ fontSize: 18 }}>{fcfa(l.price)}</div><div className="tiny muted">par jour</div></div>
            <Link to={`/reserver/${l.id}`} className="btn grow">Choisir mes dates</Link>
          </div>}
    </div>
    </div>
    </div>
  </Page>
}

