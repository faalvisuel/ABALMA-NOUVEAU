import { ReactNode, useMemo, useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { fcfa, iso, ownerLevel, shortName } from '../lib/util'
import { useAuth } from '../auth'

const PATHS: Record<string, string> = {
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  cal: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
  plus: '<circle cx="12" cy="12" r="8.5"/><path d="M12 8v8M8 12h8"/>',
  card: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M16 15h2"/>',
  back: '<path d="M15 5l-7 7 7 7"/>', right: '<path d="M9 5l7 7-7 7"/>', left: '<path d="M15 5l-7 7 7 7"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>', x: '<path d="M7 7l10 10M17 7L7 17"/>',
  cam: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  pin: '<path d="M12 21s7-6.2 7-11a7 7 0 0 0-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  shield: '<path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.500-7-4.500-7-9V6z"/><path d="M9 12l2.200 2.200L15 10.500"/>',
  phone: '<path d="M6 4h3l2 5-2.500 1.500a11 11 0 0 0 5 5L15 13l5 2v3a2 2 0 0 1-2 2A15 15 0 0 1 4 6a2 2 0 0 1 2-2z"/>',
  chat: '<path d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H10l-5 4v-4a2 2 0 0 1-1-2z"/>',
  nav: '<path d="M12 3l7 18-7-4-7 4z"/>', add: '<path d="M12 6v12M6 12h12"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  tool: '<path d="M14.5 6.5a4 4 0 0 1-5.2 5.2L5 16v3h3l4.3-4.3a4 4 0 0 1 5.2-5.2l-2 2-1.3-1.3 2-2z"/><path d="M15 15l4 4"/>',
  bolt: '<path d="M13 2L4 14h6l-1 8 9-12h-6z"/>',
  party: '<path d="M4 20l4.5-12L16 15.5 4 20z"/><path d="M14 3.5l.7 2M18 6l2-.8M19.5 10.5l2 .8"/>',
  bike: '<circle cx="6" cy="18" r="3"/><circle cx="18" cy="18" r="3"/><path d="M9 18h5l3-7h-4l-2 4M14 11l-2-4H9"/>',
  box: '<path d="M3 8l9-5 9 5v8l-9 5-9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
  spark: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M18 16l.8 2.2L21 19l-2.2.8L18 22l-.8-2.2L15 19l2.2-.8z"/>',
}
export function Icon({ name, size = 22, stroke = 2 }: { name: string; size?: number; stroke?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke}
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: 'none' }}
    dangerouslySetInnerHTML={{ __html: PATHS[name] || '' }} />
}
export function Star({ on = true, size = 18 }: { on?: boolean; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" style={{ flex: 'none' }}>
    <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.900 1-6.100-4.400-4.300 6.100-.900z" fill={on ? '#F2C230' : '#D5DBD2'} /></svg>
}
export function Logo({ inverse = false }: { inverse?: boolean }) {
  return <Link to="/" className={'logo' + (inverse ? ' inverse' : '')} aria-label="ABALMA, accueil">
    <img src={`${import.meta.env.BASE_URL}${inverse ? 'alma-wordmark-light.svg' : 'alma-wordmark.svg'}`} alt="ABALMA" />
  </Link>
}
export function Header({ title, sub, back }: { title: string; sub?: string; back?: string | number }) {
  const nav = useNavigate()
  return <div className="header">
    <button className="back" aria-label="Retour" onClick={() => (typeof back === 'string' ? nav(back) : nav(-1))}><Icon name="back" stroke={2.2} /></button>
    <div className="stack s2 grow">{sub && <div className="label">{sub}</div>}<h1 className="display h2">{title}</h1></div>
  </div>
}
export function BottomNav() {
  const items: [string, string, string][] = [['/accueil', 'search', 'Explorer'], ['/reservations', 'cal', 'Réservations'], ['/publier', 'plus', 'Publier'], ['/profil', 'user', 'Profil'], ['/revenus', 'card', 'Suivi']]
  return <nav className="nav" aria-label="Navigation principale">
    {items.map(([to, ic, lab]) => <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => isActive ? 'active' : ''}><Icon name={ic} />{lab}</NavLink>)}
  </nav>
}
export function Avatar({ url, name, size = 40 }: { url?: string | null; name?: string; size?: number }) {
  const st = { width: size, height: size, borderRadius: '50%', flex: 'none' as const }
  return url ? <img src={url} alt={name ? `Photo de ${name}` : ''} style={{ ...st, objectFit: 'cover', background: '#E4EAE1' }} />
    : <span style={{ ...st, background: '#F2C230', color: '#10201A', display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: size * 0.4 }} aria-hidden="true">{(name || '?').trim()[0]?.toUpperCase() || '?'}</span>
}
export function TopBar() {
  const { user, profile } = useAuth()
  const links: [string, string][] = [['/accueil', 'Explorer'], ['/reservations', 'Réservations'], ['/mes-annonces', 'Mes annonces'], ['/revenus', 'Suivi']]
  return <header className="tb">
    <div className="tb-in">
      <Logo />
      <nav className="tb-links" aria-label="Navigation principale">
        {(user ? (profile?.is_admin ? [...links, ['/admin', 'Administration'] as [string, string]] : links) : [links[0]]).map(([to, label]) => <NavLink key={to} to={to} className={({ isActive }) => isActive ? 'active' : ''}>{label}</NavLink>)}
      </nav>
      <div className="tb-acts">
        {user ? <>
          <Link className="tb-pill" to="/publier"><Icon name="plus" size={18} />Publier</Link>
          <Link className="tb-avatar" to="/profil" aria-label="Mon profil"><Avatar url={profile?.avatar_url} name={profile?.first_name || user.email} size={40} /></Link>
        </> : <>
          <Link className="tb-text" to="/connexion">Se connecter</Link>
          <Link className="tb-pill" to="/publier">Publier une annonce</Link>
        </>}
      </div>
    </div>
  </header>
}
export function Page({ children, nav = true, wide = false, narrow = false }: { children: ReactNode; nav?: boolean; wide?: boolean; narrow?: boolean }) {
  return <><TopBar /><main className={'page' + (nav ? '' : ' no-nav') + (wide ? ' wide' : '') + (narrow ? ' narrow' : '')}>{children}</main>{nav && <BottomNav />}</>
}
export const Spinner = () => <div className="spinner" role="status" aria-label="Chargement" />
export const ErrorBox = ({ msg }: { msg?: string | null }) => msg ? <div className="error" role="alert">{msg}</div> : null

export function Thumb({ src, small }: { src?: string; small?: boolean }) {
  return <div className={'thumb' + (small ? ' sm' : '')}>{src ? <img src={src} alt="" loading="lazy" /> : <><Icon name="cam" size={small ? 20 : 26} stroke={1.8} />{!small && 'Photo'}</>}</div>
}
export function ListingCard({ l }: { l: any }) {
  const owner = l.owner
  const lvl = ownerLevel(owner)
  const name = l.is_demo ? l.demo_owner : shortName(owner)
  return <Link to={`/annonce/${l.id}`} className="listing-card">
    <Thumb src={l.photos?.[0]} />
    <div className="stack s6 grow">
      <div className="bold" style={{ lineHeight: 1.25 }}>{l.title}</div>
      <div className="small muted">{name} · {l.quartier}{owner?.verified ? ' · Identité vérifiée' : ''}</div>
      <div className="row wrap" style={{ gap: 8 }}>
        <span className="bold green num">{fcfa(l.price)} <span className="muted" style={{ fontWeight: 500 }}>/ jour</span></span>
        {lvl.rank > 0 && <span className={'pill' + (lvl.rank === 2 ? ' gold' : '')}>{lvl.name}</span>}
        {l.is_demo && <span className="pill warn">Exemple</span>}
      </div>
    </div>
  </Link>
}
export function Row({ l, v, bold, accent }: { l: ReactNode; v: ReactNode; bold?: boolean; accent?: boolean }) {
  return <div className="row between num" style={{ fontSize: bold ? 17 : 15, fontWeight: bold ? 700 : 400 }}>
    <span className={bold ? '' : 'soft'}>{l}</span><span className={accent ? 'accent' : ''} style={{ fontWeight: bold ? 700 : 600 }}>{v}</span></div>
}
export function Note({ icon, children }: { icon: string; children: ReactNode }) {
  return <div className="row top small soft"><span className="green"><Icon name={icon} size={20} /></span><div>{children}</div></div>
}
export function Stars({ value, onChange, size = 34 }: { value: number; onChange?: (n: number) => void; size?: number }) {
  if (!onChange) return <span className="row" style={{ gap: 2 }}>{[1, 2, 3, 4, 5].map(i => <Star key={i} on={i <= Math.round(value)} size={size} />)}</span>
  return <div className="stars" role="radiogroup" aria-label="Note sur 5">{[1, 2, 3, 4, 5].map(i =>
    <button key={i} type="button" role="radio" aria-checked={value === i} aria-label={`${i} étoile${i > 1 ? 's' : ''}`} onClick={() => onChange(i)}><Star on={i <= value} size={size} /></button>)}</div>
}

const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']
/** Calendrier mois par mois, sélection d'une plage. busy = liste de [début, fin] au format AAAA-MM-JJ. */
export function Calendar({ busy, start, end, onChange }: { busy: [string, string][]; start: string | null; end: string | null; onChange: (s: string | null, e: string | null) => void }) {
  const today = useMemo(() => iso(new Date()), [])
  const [cursor, setCursor] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) })
  const isBusy = (d: string) => busy.some(([s, e]) => d >= s && d <= e)
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
  const offset = (first.getDay() + 6) % 7
  const count = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate()
  const now = new Date(); const minMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const maxDate = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate())
  const maxMonth = new Date(maxDate.getFullYear(), maxDate.getMonth(), 1)
  function pick(d: string) {
    if (!start || (start && end)) return onChange(d, null)
    if (d < start) return onChange(d, null)
    if (busy.some(([s]) => s > start && s <= d)) return onChange(d, null) // la plage ne peut pas enjamber un jour loué
    onChange(start, d)
  }
  const cells: (string | null)[] = [...Array(offset).fill(null), ...Array.from({ length: count }, (_, i) => iso(new Date(cursor.getFullYear(), cursor.getMonth(), i + 1)))]
  return <div className="cal">
    <div className="row between">
      <button type="button" className="icon-btn" aria-label="Mois précédent" disabled={cursor <= minMonth} onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}><Icon name="left" size={18} /></button>
      <div className="bold" aria-live="polite">{MONTHS[cursor.getMonth()]} {cursor.getFullYear()}</div>
      <button type="button" className="icon-btn" aria-label="Mois suivant" disabled={cursor >= maxMonth} onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}><Icon name="right" size={18} /></button>
    </div>
    <div className="cal-grid">
      {['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'].map(d => <div key={d} className="dow">{d}</div>)}
      {cells.map((d, i) => {
        if (!d) return <span key={'e' + i} />
        const b = isBusy(d), past = d < today || d > iso(maxDate)
        const sel = d === start || d === end, mid = start && end && d > start && d < end
        return <button key={d} type="button" disabled={b || past} onClick={() => pick(d)}
          aria-label={`${Number(d.slice(8))} ${MONTHS[cursor.getMonth()]}${b ? ', déjà loué' : ''}`} aria-pressed={!!sel}
          className={'day' + (b ? ' busy' : '') + (sel ? ' sel' : '') + (mid ? ' mid' : '') + (d === today ? ' today' : '')}>{Number(d.slice(8))}</button>
      })}
    </div>
    <div className="small muted">Les jours barrés sont déjà loués. Touchez le premier jour, puis le dernier.</div>
  </div>
}

