import { FormEvent, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase, configured } from '../lib/supabase'
import { CATEGORIES, CATEGORY_HINTS, fcfa, isReadyForPublic } from '../lib/util'
import { Icon, Logo } from '../components/ui'

const categoryIcons: Record<string, string> = {
  'Audiovisuel': 'cam', 'Bricolage et outils': 'tool', 'Maison et énergie': 'bolt',
  'Événement et fête': 'party', 'Sport et loisirs': 'bike', 'Autre': 'box',
}
const ZONES = ['Dakar', 'Plateau', 'Médina', 'Almadies', 'Ngor', 'Ouakam', 'Mermoz', 'Sacré-Cœur', 'Parcelles Assainies', 'Pikine', 'Guédiawaye', 'Rufisque', 'Thiès', 'Saint-Louis', 'Mbour', 'Saly']
const SORTS: [string, string][] = [['recent', 'Plus récentes'], ['asc', 'Prix croissant'], ['desc', 'Prix décroissant']]

function timeAgo(iso?: string) {
  if (!iso) return ''
  const m = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  if (m < 60) return `il y a ${m} min`
  const h = Math.round(m / 60); if (h < 24) return `il y a ${h} h`
  const d = Math.round(h / 24); return d < 30 ? `il y a ${d} j` : new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

export default function Home() {
  const [params, setParams] = useSearchParams()
  const [items, setItems] = useState<any[] | null>(null)
  const [query, setQuery] = useState(params.get('q') || '')
  const [district, setDistrict] = useState(params.get('lieu') || '')
  const [category, setCategory] = useState(params.get('cat') || '')
  const [maxPrice, setMaxPrice] = useState('')
  const [sort, setSort] = useState('recent')
  const [favs, setFavs] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem('abalma-favs') || '[]') } catch { return [] } })

  useEffect(() => {
    if (!configured) { setItems([]); return }
    supabase.from('listings').select('*, owner:public_profiles(id,first_name,last_name,verified,owner_rentals,owner_rating,job)')
      .eq('status', 'online').order('created_at', { ascending: false })
      .then(({ data }) => setItems((data || []).filter(isReadyForPublic)))
  }, [])

  useEffect(() => {
    const next: Record<string, string> = {}
    if (query.trim()) next.q = query.trim()
    if (district.trim()) next.lieu = district.trim()
    if (category) next.cat = category
    setParams(next, { replace: true })
  }, [query, district, category])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    const area = district.trim().toLowerCase()
    const max = Number(maxPrice) || 0
    const list = (items || []).filter(item => (!category || item.category === category)
      && (!q || `${item.title} ${item.description} ${item.category} ${item.category_other || ''}`.toLowerCase().includes(q))
      && (!area || area === 'dakar' && /dakar/i.test(`${item.city || ''} ${item.quartier || ''}`) || `${item.quartier || ''} ${item.city || ''}`.toLowerCase().includes(area))
      && (!max || Number(item.price) <= max))
    if (sort === 'asc') list.sort((a, b) => a.price - b.price)
    if (sort === 'desc') list.sort((a, b) => b.price - a.price)
    return list
  }, [items, query, district, category, maxPrice, sort])

  const counts = useMemo(() => {
    const c: Record<string, number> = {}; (items || []).forEach(i => { c[i.category] = (c[i.category] || 0) + 1 }); return c
  }, [items])

  function toggleFav(id: string) {
    const next = favs.includes(id) ? favs.filter(f => f !== id) : [...favs, id]
    setFavs(next); try { localStorage.setItem('abalma-favs', JSON.stringify(next)) } catch { /* storage indisponible */ }
  }
  function search(e: FormEvent) { e.preventDefault(); document.getElementById('annonces')?.scrollIntoView({ behavior: 'smooth' }) }
  const reset = () => { setQuery(''); setDistrict(''); setCategory(''); setMaxPrice('') }
  const filtered = Boolean(query || district || category || maxPrice)

  return <div className="jj">
    <header className="jj-top">
      <div className="jj-wrap jj-top-row">
        <Logo inverse />
        <form className="jj-search" onSubmit={search} role="search">
          <label className="jj-where"><Icon name="pin" size={18} /><span className="sr-only">Lieu</span>
            <input list="zones" value={district} onChange={e => setDistrict(e.target.value)} placeholder="Tout le Sénégal" /></label>
          <datalist id="zones">{ZONES.map(z => <option key={z} value={z} />)}</datalist>
          <label className="jj-what"><Icon name="search" size={18} /><span className="sr-only">Que cherchez-vous ?</span>
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Que cherchez-vous ? Caméra, perceuse, sono…" /></label>
          <button type="submit" className="jj-go" aria-label="Rechercher"><Icon name="search" size={20} /></button>
        </form>
        <div className="jj-actions">
          <Link className="jj-link" to="/connexion"><Icon name="user" size={18} /><span>Connexion</span></Link>
          <Link className="jj-post" to="/publier"><Icon name="plus" size={18} /><span>Publier</span></Link>
        </div>
      </div>
    </header>

    <div className="jj-wrap jj-layout">
      <aside className="jj-side" aria-label="Catégories">
        <h2>Catégories</h2>
        <button className={!category ? 'on' : ''} onClick={() => setCategory('')}><Icon name="search" size={18} /><span>Toutes les annonces</span><em>{items?.length ?? ''}</em></button>
        {CATEGORIES.map(c => <button key={c} className={category === c ? 'on' : ''} onClick={() => setCategory(category === c ? '' : c)}>
          <Icon name={categoryIcons[c] || 'box'} size={18} /><span>{c}<small>{CATEGORY_HINTS[c]}</small></span><em>{counts[c] || ''}</em></button>)}
        <div className="jj-side-cta"><b>Du matériel qui dort ?</b><p>Louez-le à vos voisins. Gratuit, sans paiement en ligne.</p><Link to="/publier">Publier une annonce</Link></div>
      </aside>

      <main className="jj-main">
        <div className="jj-chips" aria-label="Catégories">
          <button className={!category ? 'on' : ''} onClick={() => setCategory('')}>Tout</button>
          {CATEGORIES.map(c => <button key={c} className={category === c ? 'on' : ''} onClick={() => setCategory(category === c ? '' : c)}><Icon name={categoryIcons[c] || 'box'} size={16} />{c}</button>)}
        </div>

        <section className="jj-banner">
          <div><h1>Louez du matériel <span>près de chez vous</span></h1>
            <p>Caméras, outils, sono, groupes électrogènes… entre particuliers, au Sénégal.</p></div>
          <ul><li><Icon name="shield" size={18} />Identité vérifiée</li><li><Icon name="chat" size={18} />Contact direct</li><li><Icon name="check" size={18} />Inscription gratuite</li></ul>
        </section>

        <section id="annonces" className="jj-results">
          <div className="jj-bar">
            <h2>{category || 'Toutes les annonces'} <small>{items === null ? '' : `${results.length} résultat${results.length > 1 ? 's' : ''}`}</small></h2>
            <div className="jj-filters">
              <label><span className="sr-only">Prix maximum par jour</span><input inputMode="numeric" value={maxPrice} onChange={e => setMaxPrice(e.target.value.replace(/\D/g, ''))} placeholder="Prix max / jour" /></label>
              <label><span className="sr-only">Trier</span><select value={sort} onChange={e => setSort(e.target.value)}>{SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
              {filtered && <button type="button" onClick={reset}>Réinitialiser</button>}
            </div>
          </div>

          {items === null ? <div className="jj-grid">{Array.from({ length: 6 }, (_, i) => <div key={i} className="jj-card skeleton" />)}</div>
            : results.length ? <div className="jj-grid">
              {results.map(item => <article className="jj-card" key={item.id}>
                <Link to={`/annonce/${item.id}`} className="jj-img">
                  {item.photos?.[0] ? <img src={item.photos[0]} alt={item.title} loading="lazy" /> : <img src={`${import.meta.env.BASE_URL}hero/camera.svg`} alt="" />}
                  <span className="jj-count">{item.photos?.length || 1} photos</span>
                </Link>
                <button type="button" className={'jj-fav' + (favs.includes(item.id) ? ' on' : '')} aria-pressed={favs.includes(item.id)} aria-label="Ajouter aux favoris" onClick={() => toggleFav(item.id)}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill={favs.includes(item.id) ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.600A4 4 0 0 1 19 10c0 5.600-7 10-7 10z" /></svg></button>
                <Link to={`/annonce/${item.id}`} className="jj-info">
                  <b className="jj-price">{fcfa(item.price)} <span>/ jour</span></b>
                  <h3>{item.title}</h3>
                  <p className="jj-loc"><Icon name="pin" size={14} />{item.quartier || item.city || 'Sénégal'}</p>
                  <div className="jj-meta">
                    <span>{timeAgo(item.created_at)}</span>
                    {item.owner?.verified && <span className="jj-ok"><Icon name="shield" size={13} />Vérifié</span>}
                  </div>
                </Link>
              </article>)}
            </div>
              : <div className="jj-empty"><div><Icon name="box" size={30} /></div>
                <h3>{filtered ? 'Aucune annonce ne correspond' : 'Les premières annonces arrivent'}</h3>
                <p>{filtered ? 'Essayez un autre mot-clé ou élargissez la zone.' : 'Vous avez du matériel à louer ? Soyez parmi les premiers à le proposer.'}</p>
                {filtered ? <button className="jj-post" onClick={reset}>Voir toutes les annonces</button> : <Link className="jj-post" to="/publier"><Icon name="plus" size={18} />Publier une annonce</Link>}</div>}
        </section>

        <section className="jj-how">
          <h2>Comment ça marche ?</h2>
          <ol>
            <li><b>1</b><span>Cherchez</span><p>Par matériel et par quartier.</p></li>
            <li><b>2</b><span>Contactez</span><p>Échangez avec le propriétaire et réservez.</p></li>
            <li><b>3</b><span>Louez</span><p>Convenez du prix et de la remise en main propre.</p></li>
          </ol>
        </section>
      </main>
    </div>

    <footer className="jj-foot"><div className="jj-wrap"><Logo inverse /><span>Le matériel circule.</span>
      <nav><Link to="/mentions-legales">Mentions légales</Link><Link to="/confidentialite">Confidentialité</Link><Link to="/cgu">Conditions</Link></nav>
      <small>© {new Date().getFullYear()} ABALMA</small></div></footer>
    <Link to="/publier" className="jj-fab" aria-label="Publier une annonce"><Icon name="add" size={26} /></Link>
  </div>
}
