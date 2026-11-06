import { ChangeEvent, FormEvent, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, errMsg } from '../lib/supabase'
import { useAuth } from '../auth'
import { CATEGORIES, CATEGORY_HINTS, compressImage, fcfa } from '../lib/util'
import { ErrorBox, Header, Icon, Note, Page, Thumb } from '../components/ui'

const MAX = 5, MIN = 3

export default function Publish() {
  const { user, profile } = useAuth()
  const [step, setStep] = useState(1)
  const [photos, setPhotos] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const [f, setF] = useState({ title: '', category: CATEGORIES[0], category_other: '', description: '', quartier: profile?.quartier || '', exact_address: '', whatsapp: '', price: '', deposit: '' })
  const [err, setErr] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState<any>(null)
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value })

  async function addPhotos(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []).slice(0, MAX - photos.length)
    e.target.value = ''
    if (!files.length) return
    setUploading(true); setErr(null)
    try {
      const urls: string[] = []
      for (const file of files) {
        const blob = await compressImage(file)
        const path = `${user.id}/${crypto.randomUUID()}.jpg`
        const { error } = await supabase.storage.from('photos').upload(path, blob, { contentType: 'image/jpeg' })
        if (error) throw error
        urls.push(supabase.storage.from('photos').getPublicUrl(path).data.publicUrl)
      }
      setPhotos(p => [...p, ...urls])
    } catch (e2) { setErr(errMsg(e2)) }
    setUploading(false)
  }

  const price = Math.max(0, parseInt(f.price || '0', 10) || 0)

  async function publish(e: FormEvent) {
    e.preventDefault(); setErr(null)
    if (f.description.trim().length < 10) return setErr('Décrivez votre matériel en 10 caractères minimum (état, accessoires fournis) : sans cela, l’annonce ne s’affiche pas.')
    if (price <= 0) return setErr('Indiquez un prix par jour.')
    setSaving(true)
    const { data, error } = await supabase.from('listings').insert({
      owner_id: user.id, title: f.title.trim(), category: f.category, category_other: f.category === 'Autre' ? f.category_other.trim() : null,
      description: f.description.trim(), quartier: f.quartier.trim(), price, deposit: Math.max(0, parseInt(f.deposit || '0', 10) || 0), photos,
    }).select().single()
    if (error) { setSaving(false); return setErr(errMsg(error)) }
    const p = await supabase.from('listing_private').insert({ listing_id: data.id, exact_address: f.exact_address.trim(), whatsapp: f.whatsapp.trim() })
    setSaving(false)
    if (p.error) return setErr(errMsg(p.error))
    setDone(data)
  }

  if (profile && profile.identity_status !== 'verified' && !done) return <Page>
    <Header title="Vérifiez votre identité" back="/" />
    <div className="card stack"><p className="soft">{profile.identity_status === 'pending'
      ? 'Votre dossier est en cours d’examen. Vous pourrez publier du matériel dès que l’équipe ABALMA l’aura validé.'
      : 'Pour la sécurité de tous, votre pièce d’identité est vérifiée manuellement avant de publier du matériel.'}</p>
      <Link to="/profil#identite" className="btn">{profile.identity_status === 'pending' ? 'Voir mon dossier' : 'Vérifier mon identité'}</Link></div>
  </Page>

  if (done) return <Page>
    <div className="card dark stack">
      <div className="avatar" style={{ background: '#F2C230', color: '#10201A' }}><Icon name="check" size={26} stroke={2.6} /></div>
      <h1 className="display" style={{ fontSize: 26 }}>Votre annonce est en ligne</h1>
      <p className="muted">Elle est visible par les emprunteurs de Dakar dès maintenant.</p>
    </div>
    <div className="card row" style={{ padding: 12 }}><Thumb src={done.photos?.[0]} small /><div className="stack s2 grow"><div className="bold">{done.title}</div><div className="small green bold num">Prix indicatif : {fcfa(done.price)} / jour</div></div></div>
    <div className="card stack"><h2 className="h3">Ce qui se passe ensuite</h2>
      <Note icon="check">Chaque demande apparaît dans l'onglet Revenus.</Note>
      <Note icon="check">Vous acceptez ou refusez en voyant le score de confiance de l'emprunteur.</Note>
      <Note icon="check">Aucun paiement n’est intégré; convenez directement des modalités avec l’emprunteur.</Note></div>
    <Link to="/mes-annonces" className="btn">Voir mes annonces</Link>
    <button className="link-btn" onClick={() => { setDone(null); setStep(1); setPhotos([]); setF({ ...f, title: '', description: '', price: '', deposit: '', category_other: '' }) }}>Publier un autre matériel</button>
  </Page>

  if (step === 1) return <Page>
    <Header title="Photos du matériel" sub="Étape 1 sur 2" back="/" />
    <p className="soft">Ajoutez {MIN} à {MAX} photos nettes. La première sert de photo principale.</p>
    <div className="grid3">
      {photos.map((u, i) => <div key={u} className="photo-slot"><img src={u} alt={`Photo ${i + 1}`} />
        <button className="rm" aria-label={`Retirer la photo ${i + 1}`} onClick={() => setPhotos(photos.filter(x => x !== u))}><Icon name="x" size={16} stroke={2.2} /></button></div>)}
      {photos.length < MAX && <label className="photo-add"><Icon name="add" />{uploading ? 'Envoi…' : 'Ajouter'}
        <input type="file" accept="image/*" multiple hidden disabled={uploading} onChange={addPhotos} /></label>}
    </div>
    <div className="row between"><span className="bold">{photos.length} photo{photos.length > 1 ? 's' : ''} sur {MAX}</span>{photos.length >= MIN && <span className="small green semi">Minimum atteint</span>}</div>
    <ErrorBox msg={err} />
    <div className="card stack"><h2 className="h3">Pour être loué plus vite</h2>
      <Note icon="check">Photographiez le matériel entier, à la lumière du jour.</Note>
      <Note icon="check">Montrez les accessoires fournis et les défauts éventuels.</Note>
      <Note icon="check">Pas de photo prise sur Internet : uniquement votre matériel.</Note></div>
    <button className="btn" disabled={photos.length < MIN || uploading} onClick={() => setStep(2)}>{photos.length < MIN ? `Encore ${MIN - photos.length} photo${MIN - photos.length > 1 ? 's' : ''}` : 'Continuer'}</button>
  </Page>

  return <Page>
    <div className="header"><button className="back" aria-label="Retour aux photos" onClick={() => setStep(1)}><Icon name="back" stroke={2.2} /></button>
      <div className="stack s2 grow"><div className="label">Étape 2 sur 2</div><h1 className="display h2">Informations</h1></div></div>
    <form className="stack s16" onSubmit={publish}>
      <div className="field"><label htmlFor="ti">Nom du matériel</label><input id="ti" required maxLength={80} placeholder="Ex. Enceinte active 1000 W" value={f.title} onChange={set('title')} /></div>
      <div className="field"><label htmlFor="ca">Catégorie</label><select id="ca" value={f.category} onChange={set('category')}>{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select><div className="hint">{CATEGORY_HINTS[f.category]}</div></div>
      {f.category === 'Autre' && <div className="field"><label htmlFor="co">Précisez le type de matériel</label><input id="co" required maxLength={40} placeholder="Ex. Machine à coudre" value={f.category_other} onChange={set('category_other')} /></div>}
      <div className="field"><label htmlFor="de">Description et accessoires inclus</label><textarea id="de" maxLength={800} minLength={10} placeholder="État, accessoires fournis, conditions…" value={f.description} onChange={set('description')} /></div>
      <div className="field"><label htmlFor="qu">Quartier (visible par tous)</label><input id="qu" required placeholder="Ex. Mermoz" value={f.quartier} onChange={set('quartier')} /></div>
      <div className="card stack">
        <div className="field"><label htmlFor="ad">Lieu exact de remise</label><input id="ad" required placeholder="Ex. Sacré-Cœur 3, villa 12" value={f.exact_address} onChange={set('exact_address')} /></div>
        <div className="field"><label htmlFor="wa">Numéro WhatsApp</label><input id="wa" required type="tel" inputMode="tel" placeholder="77 000 00 00" value={f.whatsapp} onChange={set('whatsapp')} /></div>
        <Note icon="lock">Montrés à l’emprunteur seulement après acceptation de sa demande.</Note>
      </div>
      <div className="grid2">
        <div className="field"><label htmlFor="pr">Prix par jour (F CFA)</label><input id="pr" required type="number" inputMode="numeric" min={500} step={500} value={f.price} onChange={set('price')} /></div>
        <div className="field"><label htmlFor="dp">Caution (F CFA)</label><input id="dp" type="number" inputMode="numeric" min={0} step={1000} placeholder="0" value={f.deposit} onChange={set('deposit')} /></div>
      </div>
      <div className="notice">Ce prix est une indication pour les échanges entre vous et les personnes intéressées. Aucun paiement ou commission n’est traité par ABALMA.</div>
      <ErrorBox msg={err} />
      <button className="btn" disabled={saving}>{saving ? 'Publication…' : 'Publier l’annonce'}</button>
      <div className="small soft center">Publier une annonce est gratuit.</div>
    </form>
  </Page>
}
