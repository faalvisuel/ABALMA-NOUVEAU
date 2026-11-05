import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth'
import { BORROWER_LEVELS, borrowerLevel, shortName } from '../lib/util'
import { Header, Page } from '../components/ui'

const RULES: [string, string, boolean][] = [
  ['Location terminée', '+40', false], ['Retour à l’heure', '+10', false], ['Note de 5 étoiles reçue', '+10', false],
  ['Retour en retard', '−50', true], ['Litige ou casse à vos torts', '−150', true],
]

export default function Score() {
  const { user, profile } = useAuth()
  const [events, setEvents] = useState<any[]>([])
  useEffect(() => {
    supabase.from('score_events').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(20).then(({ data }) => setEvents(data || []))
  }, [user.id])
  const score = profile?.score ?? 400
  const lvl = borrowerLevel(score)
  return <Page>
    <Header title="Score de confiance" back="/" />
    <div className="card dark stack">
      <div className="row between" style={{ alignItems: 'flex-end' }}>
        <div className="stack s2"><div className="small muted">{shortName(profile)}</div>
          <div className="row" style={{ alignItems: 'flex-end', gap: 6 }}><span className="big num" style={{ fontSize: 44 }}>{score}</span><span className="muted">/ 1000</span></div></div>
        <span className="pill gold" style={{ fontSize: 14, padding: '6px 12px' }}>{lvl.name}</span>
      </div>
      <div className="progress" role="img" aria-label={`Score ${score} sur 1000`}><i style={{ width: `${score / 10}%` }} /></div>
      <div className="small muted">{lvl.next ? `Encore ${lvl.next.min - score} points pour devenir ${lvl.next.name} : ${lvl.next.perk.toLowerCase()}` : 'Vous avez atteint le meilleur niveau.'}</div>
    </div>
    <div className="stack s8"><h2 className="h3">Vos avantages par niveau</h2>
      {BORROWER_LEVELS.map(l => <div key={l.name} className={'card row' + (l.name === lvl.name ? ' tint outline' : '')} style={{ padding: '12px 14px' }}>
        <div className="stack s2 grow"><div className="row" style={{ gap: 8 }}><span className="bold">{l.name}</span><span className="small muted num">{l.min} à {l.max}</span></div><div className="small soft">{l.perk}</div></div>
        {l.name === lvl.name && <span className="pill dark">Vous</span>}
      </div>)}
    </div>
    <div className="card stack"><h2 className="h3">Comment le score évolue</h2>
      {RULES.map(([t, v, neg]) => <div key={t} className="row between" style={{ fontSize: 14 }}><span className="soft">{t}</span><span className={'bold num ' + (neg ? 'danger' : 'green')}>{v}</span></div>)}
    </div>
    {events.length > 0 && <div className="card stack"><h2 className="h3">Historique</h2>
      {events.map(e => <div key={e.id} className="row between" style={{ fontSize: 14 }}>
        <span className="soft">{e.reason} · {new Date(e.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</span>
        <span className={'bold num ' + (e.points < 0 ? 'danger' : 'green')}>{e.points > 0 ? '+' : '−'}{Math.abs(e.points)}</span></div>)}
    </div>}
    <Link to="/accueil#annonces" className="btn">Trouver du matériel</Link>
  </Page>
}

