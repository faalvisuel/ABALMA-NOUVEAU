import { FormEvent, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase, configured } from '../lib/supabase'
import { CATEGORIES, fcfa, isReadyForPublic } from '../lib/util'
import { Icon, Logo } from '../components/ui'

const ZONES = ['Dakar', 'Plateau', 'Médina', 'Almadies', 'Ngor', 'Ouakam', 'Mermoz', 'Sacré-Cœur', 'Parcelles Assainies', 'Pikine', 'Guédiawaye', 'Rufisque', 'Thiès', 'Saint-Louis', 'Mbour', 'Saly']

export default function Home() {
  const [params, setParams] = useSearchParams()
  const [items, setItems] = useState<any[] | null>(null)
  const [query, setQuery] = useState(params.get('q') || '')
  const [district, setDistrict] = useState(params.get('lieu') || '')
  const [category, setCategory] = useState(params.get('cat') || '')
  const [sort, setSort] = useState('recent')

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
    const list = (items || []).filter(item => (!category || item.category === category)
      && (!q || `${item.title} ${item.description} ${item.category} ${item.category_other || ''}`.toLowerCase().includes(q))
      && (!area || `${item.quartier || ''} ${item.city || ''}`.toLowerCase().includes(area)))
    if (sort === 'asc') list.sort((a, b) => a.price - b.price)
    if (sort === 'desc') list.sort((a, b) => b.price - a.price)
    return list
  }, [items, query, district, category, sort])

  const filtered = Boolean(query || district || category)
  const reset = () => { setQuery(''); setDistrict(''); setCategory('') }
  const search = (e: FormEvent) => { e.preventDefault(); document.getElementById('annonces')?.scrollIntoView({ behavior: 'smooth' }) }

  return <div className="ab">
    <header className="ab-head">
      <div className="ab-wrap ab-head-row">
        <Logo />
        <nav className="ab-links" aria-label="Navigation">
          <a href="#annonces">Parcourir</a><a href="#comment">Comment ça marche</a><Link to="/publier">Proposer du matériel</Link>
        </nav>
        <div className="ab-acts"><Link className="ab-signin" to="/connexion">Se connecter</Link><Link className="ab-btn" to="/publier">Publier une annonce</Link></div>
      </div>
    </header>

    <main className="ab-wrap">
      <section className="ab-hero">
        <div className="ab-hero-text">
          <h1>Du matériel à louer, près de chez vous</h1>
          <p>Trouvez ce qu’il vous faut ou faites travailler ce que vous possédez. Inscription gratuite, sans paiement en ligne.</p>
          <div className="ab-hero-cta"><Link className="ab-btn ab-lg" to="/publier">Publier une annonce</Link><a className="ab-ghost ab-lg" href="#annonces">Parcourir les annonces</a></div>
        </div>
        <div className="ab-hero-img" aria-hidden="true"><img src={`${import.meta.env.BASE_URL}hero/camera.svg`} alt="" /></div>
      </section>

      <form className="ab-search" onSubmit={search} role="search">
        <label><span className="sr-only">Que cherchez-vous ?</span><Icon name="search" size={20} />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Caméra, perceuse, sono…" /></label>
        <label><span className="sr-only">Quartier ou ville</span><Icon name="pin" size={20} />
          <input list="zones" value={district} onChange={e => setDistrict(e.target.value)} placeholder="Quartier ou ville" /></label>
        <datalist id="zones">{ZONES.map(z => <option key={z} value={z} />)}</datalist>
        <button type="submit">Rechercher</button>
      </form>

      <nav className="ab-cats" aria-label="Catégories">
        <button className={!category ? 'on' : ''} onClick={() => setCategory('')}>Tout</button>
        {CATEGORIES.map(c => <button key={c} className={category === c ? 'on' : ''} onClick={() => setCategory(category === c ? '' : c)}>{c}</button>)}
      </nav>

      <section id="annonces" className="ab-list">
        <div className="ab-bar">
          <p>{items === null ? 'Chargement…' : `${results.length} annonce${results.length > 1 ? 's' : ''}`}</p>
          <label><span className="sr-only">Trier</span>
            <select value={sort} onChange={e => setSort(e.target.value)}>
              <option value="recent">Plus récentes</option><option value="asc">Prix croissant</option><option value="desc">Prix décroissant</option>
            </select></label>
        </div>

        {items === null ? <div className="ab-grid">{Array.from({ length: 8 }, (_, i) => <div key={i} className="ab-skel" />)}</div>
          : results.length ? <div className="ab-grid">
            {results.map(item => <Link to={`/annonce/${item.id}`} className="ab-card" key={item.id}>
              <div className="ab-photo"><img src={item.photos?.[0] || `${import.meta.env.BASE_URL}hero/camera.svg`} alt={item.title} loading="lazy" /></div>
              <h3>{item.title}</h3>
              <p className="ab-price">{fcfa(item.price)} <span>par jour</span></p>
              <p className="ab-place">{item.quartier || item.city || 'Sénégal'}{item.owner?.verified ? ' · Identité vérifiée' : ''}</p>
            </Link>)}
          </div>
            : <div className="ab-empty">
              <h2>{filtered ? 'Aucune annonce trouvée' : 'Aucune annonce pour le moment'}</h2>
              <p>{filtered ? 'Essayez un autre mot ou un autre quartier.' : 'Vous avez du matériel à louer ? Publiez la première annonce.'}</p>
              {filtered ? <button className="ab-btn" onClick={reset}>Effacer la recherche</button> : <Link className="ab-btn" to="/publier">Publier une annonce</Link>}
            </div>}
      </section>
      <section className="ab-how" id="comment">
        <h2>Comment ça marche</h2>
        <ol>
          <li><b>1</b><h3>Cherchez</h3><p>Tapez le matériel et votre quartier pour voir ce qui est disponible près de vous.</p></li>
          <li><b>2</b><h3>Contactez</h3><p>Échangez directement avec le propriétaire et réservez les dates qui vous conviennent.</p></li>
          <li><b>3</b><h3>Louez</h3><p>Convenez du prix ensemble et récupérez le matériel en main propre.</p></li>
        </ol>
      </section>

      <section className="ab-trust">
        <div><h2>Une location en confiance</h2>
          <p>Les propriétaires peuvent faire vérifier leur identité, et vous gardez le contact direct avec eux. ABALMA ne prend aucun paiement : vous réglez entre vous, au moment de la remise.</p>
          <Link className="ab-btn" to="/connexion?mode=signup">Créer un compte gratuit</Link></div>
        <ul><li><h3>Identité vérifiée</h3><p>Une pièce d’identité contrôlée avant le badge.</p></li><li><h3>Contact direct</h3><p>Pas d’intermédiaire entre vous et le propriétaire.</p></li><li><h3>Gratuit</h3><p>Inscription et publication sans frais.</p></li></ul>
      </section>
    </main>

    <footer className="ab-foot"><div className="ab-wrap">
      <div className="ab-foot-cols">
        <div><h4>Découvrir</h4>{CATEGORIES.slice(0, 5).map(c => <a key={c} href="#annonces" onClick={() => setCategory(c)}>{c}</a>)}</div>
        <div><h4>Proposer du matériel</h4><Link to="/publier">Publier une annonce</Link><Link to="/mes-annonces">Mes annonces</Link><Link to="/reservations">Mes réservations</Link></div>
        <div><h4>À propos</h4><Link to="/mentions-legales">Mentions légales</Link><Link to="/confidentialite">Confidentialité</Link><Link to="/cgu">Conditions d’utilisation</Link><Link to="/cookies">Cookies</Link></div>
      </div>
      <p className="ab-copy">© {new Date().getFullYear()} ABALMA. Le matériel circule.</p>
    </div></footer>
  </div>
}
