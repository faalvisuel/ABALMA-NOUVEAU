export const COMMISSION = 0.15

export const CATEGORIES = [
  'Audiovisuel', 'Bricolage et outils', 'Maison et énergie', 'Événement et fête', 'Sport et loisirs', 'Autre',
]
export const CATEGORY_HINTS: Record<string, string> = {
  'Audiovisuel': 'Caméras, sono, lumière, micros',
  'Bricolage et outils': 'Perceuse, échelle, nettoyeur',
  'Maison et énergie': 'Groupe électrogène, ventilateur',
  'Événement et fête': 'Chaises, bâche, vidéoprojecteur',
  'Sport et loisirs': 'Vélo, tente, glacière',
  'Autre': 'Pas dans la liste ? Précisez-le vous-même.',
}
export const FILTERS: [string, string | null][] = [
  ['Tout', null], ['Audiovisuel', 'Audiovisuel'], ['Bricolage', 'Bricolage et outils'],
  ['Événement', 'Événement et fête'], ['Maison', 'Maison et énergie'], ['Sport', 'Sport et loisirs'], ['Autre', 'Autre'],
]

/** Only show complete, real listings to visitors; keep incomplete records available for editing. */
export function isReadyForPublic(l: any): boolean {
  if (!l || l.is_demo || !l.owner_id) return false
  const title = String(l.title || '').trim()
  const description = String(l.description || '').trim()
  const photos = Array.isArray(l.photos) ? l.photos.filter((photo: unknown) => typeof photo === 'string' && photo.trim()) : []
  const placeholder = /\b(test|exemple|demo|démo|placeholder|lorem ipsum|à venir|bientôt)\b/i
  return title.length >= 4 && description.length >= 30 && !placeholder.test(`${title} ${description}`)
    && Boolean(String(l.category || '').trim() && String(l.quartier || '').trim())
    && Number(l.price) > 0 && photos.length >= 3 && photos.length <= 5
}

/** 20000 -> "20 000 F" */
export function fcfa(n: number | null | undefined): string {
  const v = Math.round(Number(n) || 0)
  return v.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' F'
}

export function iso(d: Date): string {
  const p = (x: number) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
export function parseIso(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}
export function frDate(s: string, long = false): string {
  return parseIso(s).toLocaleDateString('fr-FR', long
    ? { weekday: 'long', day: 'numeric', month: 'long' }
    : { weekday: 'short', day: 'numeric', month: 'short' })
}
export function initials(first?: string, last?: string): string {
  return ((first?.[0] || '') + (last?.[0] || '')).toUpperCase() || '?'
}
export function shortName(p: any): string {
  if (!p) return ''
  return `${p.first_name || ''} ${p.last_name ? p.last_name[0] + '.' : ''}`.trim()
}

export const BORROWER_LEVELS = [
  { name: 'Nouveau', min: 0, max: 499, pct: 0, perk: 'Tarif normal, caution complète.' },
  { name: 'Fiable', min: 500, max: 749, pct: 5, perk: '5 % de réduction sur chaque location.' },
  { name: 'Très fiable', min: 750, max: 899, pct: 10, perk: '10 % de réduction et caution réduite de moitié.' },
  { name: 'Or', min: 900, max: 1000, pct: 10, perk: '10 % de réduction, caution réduite et demandes acceptées automatiquement.' },
]
export function borrowerLevel(score: number) {
  const i = Math.max(0, BORROWER_LEVELS.findIndex(l => score >= l.min && score <= l.max))
  return { ...BORROWER_LEVELS[i], index: i, next: BORROWER_LEVELS[i + 1] || null }
}

export type OwnerLevel = { name: 'Nouveau' | 'Confirmé' | 'Vedette'; rank: number }
export function ownerLevel(p: any): OwnerLevel {
  const n = p?.owner_rentals || 0
  const r = Number(p?.owner_rating || 0)
  if (n >= 15 && r >= 4.7) return { name: 'Vedette', rank: 2 }
  if (n >= 5 && r >= 4.5) return { name: 'Confirmé', rank: 1 }
  return { name: 'Nouveau', rank: 0 }
}

export const STATUS_LABEL: Record<string, string> = {
  requested: 'Demande envoyée', accepted: 'Acceptée · à organiser', refused: 'Refusée', paid: 'À organiser',
  ongoing: 'En cours', done: 'Terminée', cancelled: 'Annulée', dispute: 'Litige en cours',
}

export const TAGS_FOR_OWNER = ['Matériel conforme', 'Ponctuel', 'Bien expliqué', 'Accueillant']
export const TAGS_FOR_BORROWER = ['Retour à l’heure', 'Matériel soigné', 'Communication facile', 'Poli']

/** Réduit une photo à 1600 px de large maximum avant envoi (connexions lentes). */
export async function compressImage(file: File, max = 1600, quality = 0.82): Promise<Blob> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Image illisible.')); i.src = url
    })
    const scale = Math.min(1, max / Math.max(img.width, img.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(img.width * scale); canvas.height = Math.round(img.height * scale)
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
    return await new Promise<Blob>((res, rej) => canvas.toBlob(b => b ? res(b) : rej(new Error('Compression impossible.')), 'image/jpeg', quality))
  } finally { URL.revokeObjectURL(url) }
}
