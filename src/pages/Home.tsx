import { FormEvent, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, configured } from '../lib/supabase'
import { CATEGORIES, CATEGORY_HINTS, isReadyForPublic } from '../lib/util'
import { Icon, Logo } from '../components/ui'

const categoryIcons: Record<string, string> = {
  'Audiovisuel': 'cam', 'Bricolage et outils': 'tool', 'Maison et énergie': 'bolt',
  'Événement et fête': 'party', 'Sport et loisirs': 'bike', 'Autre': 'box',
}

export default function Home() {
  const [items, setItems] = useState<any[] | null>(null)
  const [query, setQuery] = useState('')
  const [district, setDistrict] = useState('')
  const [category, setCategory] = useState('')

  useEffect(() => {
    if (!configured) { setItems([]); return }
    supabase.from('listings').select('*, owner:public_profiles(id,first_name,last_name,verified,owner_rentals,owner_rating,job)')
      .eq('status', 'online').order('created_at', { ascending: false })
      .then(({ data }) => setItems((data || []).filter(isReadyForPublic)))
  }, [])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    const area = district.trim().toLowerCase()
    return (items || []).filter(item => (!category || item.category === category)
      && (!q || `${item.title} ${item.description} ${item.category} ${item.category_other || ''}`.toLowerCase().includes(q))
      && (!area || `${item.quartier || ''} ${item.city || ''}`.toLowerCase().includes(area)))
  }, [items, query, district, category])

  function search(event: FormEvent) {
    event.preventDefault()
    document.getElementById('annonces')?.scrollIntoView({ behavior: 'smooth' })
  }

  return <div className="market-v2">
    <header className="market-header">
      <div className="market-header-inner">
        <Logo />
        <nav aria-label="Navigation principale">
          <a href="#categories">Catégories</a><a href="#annonces">Explorer</a><a href="#comment">Comment ça marche</a>
        </nav>
        <div className="market-header-actions"><Link className="market-signin" to="/connexion">Se connecter</Link><Link className="market-sell" to="/connexion?mode=signup"><Icon name="plus" size={18}/>Proposer un matériel</Link></div>
      </div>
    </header>

    <main>
      <section className="market-hero">
        <div className="market-hero-content">
          <span className="market-eyebrow"><i/> La location entre particuliers, simplement</span>
          <h1>Le bon matériel.<br/><span>Au bon endroit.</span></h1>
          <p>Trouvez près de chez vous ou faites vivre le matériel que vous possédez.</p>
          <form className="market-search" onSubmit={search}>
            <label><Icon name="search" size={21}/><span className="sr-only">Que cherchez-vous ?</span><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Caméra, perceuse, sono…"/></label>
            <label className="market-location"><Icon name="pin" size={20}/><span className="sr-only">Ville ou quartier</span><input value={district} onChange={e => setDistrict(e.target.value)} placeholder="Ville ou quartier"/></label>
            <button type="submit" aria-label="Rechercher"><Icon name="search" size={19}/><span>Rechercher</span></button>
          </form>
          <div className="market-hero-links"><a href="#annonces">Parcourir les annonces <Icon name="right" size={16}/></a><span>Inscription simple et gratuite</span></div>
        </div>
        <div className="market-hero-art" aria-hidden="true">
          <div className="market-art-ring"/><div className="market-art-yellow"/>
          <img className="market-art-camera" src={`${import.meta.env.BASE_URL}hero/camera.svg`} alt=""/>
          <div className="market-art-note"><span className="market-art-check"><Icon name="check" size={17}/></span><span><b>À deux pas</b><small>Location locale</small></span></div>
          <div className="market-art-price"><small>À partir de</small><b>5 000 F <i>/ jour</i></b></div>
        </div>
      </section>

      <section className="market-categories" id="categories">
        <div className="market-section-head"><div><span className="market-kicker">Explorer par besoin</span><h2>Qu’est-ce qu’il vous faut ?</h2></div><a href="#annonces">Toutes les catégories <Icon name="right" size={16}/></a></div>
        <div className="market-category-grid">
          {CATEGORIES.map(name => <button key={name} className={'market-category' + (category === name ? ' selected' : '')} onClick={() => { setCategory(category === name ? '' : name); document.getElementById('annonces')?.scrollIntoView({ behavior: 'smooth' }) }}>
            <span className="market-category-icon"><Icon name={categoryIcons[name] || 'box'} size={23} stroke={1.8}/></span><span><b>{name}</b><small>{CATEGORY_HINTS[name]}</small></span><Icon name="right" size={17}/>
          </button>)}
        </div>
      </section>

      <section className="market-listings" id="annonces">
        <div className="market-section-head"><div><span className="market-kicker">Près de vous</span><h2>{category || 'Matériel à louer'}</h2></div><div className="market-listing-controls"><label><span className="sr-only">Filtrer par catégorie</span><select value={category} onChange={e => setCategory(e.target.value)}><option value="">Toutes les catégories</option>{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></label><Link className="market-outline-btn" to="/connexion?mode=signup">+ Proposer un matériel</Link></div></div>
        {items === null ? <div className="market-empty">Chargement des annonces…</div> : results.length ? <div className="market-listing-grid">
          {results.slice(0, 6).map(item => <Link to={`/annonce/${item.id}`} className="market-listing-card" key={item.id}>
            <div className="market-listing-image">{item.photos?.[0] ? <img src={item.photos[0]} alt=""/> : <img src={`${import.meta.env.BASE_URL}hero/camera.svg`} alt=""/>}<span>{item.category}</span><button aria-label="Ajouter aux favoris" type="button" onClick={e => e.preventDefault()}><Icon name="spark" size={18}/></button></div>
            <div className="market-listing-info"><h3>{item.title}</h3><p><Icon name="pin" size={14}/>{item.quartier || item.city || 'Sénégal'}</p><div><b>{Number(item.price).toLocaleString('fr-FR')} F</b><span>/ jour</span></div></div>
          </Link>)}
        </div> : <div className="market-empty-state"><div className="market-empty-icon"><Icon name="box" size={25}/></div><h3>Les premières annonces arrivent</h3><p>Vous avez du matériel à louer ? Soyez parmi les premiers à le proposer.</p><Link className="market-sell" to="/connexion?mode=signup"><Icon name="plus" size={18}/>Proposer un matériel</Link></div>}
      </section>

      <section className="market-publish" id="comment">
        <div className="market-publish-mark"><Icon name="add" size={28}/></div><div><span className="market-kicker">Vous avez du matériel ?</span><h2>Faites-le servir plus souvent.</h2><p>Publiez une annonce, indiquez vos disponibilités et échangez directement avec les personnes intéressées.</p></div><Link className="market-sell market-sell-light" to="/connexion?mode=signup">Proposer un matériel <Icon name="right" size={17}/></Link>
      </section>
    </main>
    <footer className="market-footer"><Logo/><span>Le matériel circule. Les idées aussi.</span><div><Link to="/mentions-legales">Mentions légales</Link><Link to="/confidentialite">Confidentialité</Link><Link to="/cgu">Conditions</Link></div><small>© {new Date().getFullYear()} ABALMA</small></footer>
  </div>
}
