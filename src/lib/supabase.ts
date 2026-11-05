import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const configured = Boolean(url && key)
export const supabase = createClient(url || 'https://non-configure.supabase.co', key || 'non-configure')

/** Checks Supabase's public Auth settings before redirecting users to Google. */
export async function googleProviderEnabled(): Promise<boolean | null> {
  if (!url || !key) return null
  try {
    const response = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } })
    if (!response.ok) return null
    const settings = await response.json()
    return typeof settings.external?.google === 'boolean' ? settings.external.google : null
  } catch {
    return null
  }
}

/** Message d'erreur lisible, en français. */
export function errMsg(e: any): string {
  const m = e?.message || String(e || '')
  if (/Invalid login credentials/i.test(m)) return 'E-mail ou mot de passe incorrect.'
  if (/already registered/i.test(m)) return 'Un compte existe déjà avec cet e-mail.'
  if (/Email not confirmed/i.test(m)) return 'Confirmez votre e-mail avec le lien reçu, puis reconnectez-vous.'
  if (/Password should be/i.test(m)) return 'Le mot de passe doit contenir au moins 6 caractères.'
  if (/redirect_to.*not allowed|redirect url.*not allowed/i.test(m)) return 'Supabase refuse l’adresse de retour. Ajoutez l’URL publique de ce nouveau site suivie de /connexion dans Authentication → URL Configuration → Redirect URLs.'
  if (/database error saving new user/i.test(m)) return 'Supabase bloque la création du profil. Vérifiez que la migration supabase/prelaunch-migration.sql a été exécutée dans le projet ABALMA.'
  if (/email rate limit exceeded|too many requests/i.test(m)) return 'Trop de tentatives rapprochées. Attendez quelques minutes avant de réessayer.'
  if (/email address not authorized/i.test(m)) return 'Supabase n’envoie pas encore les e-mails ABALMA à cette adresse. Configurez un serveur SMTP personnalisé dans Authentication → Emails → SMTP Settings.'
  if (/email.*not.*confirmed/i.test(m)) return 'Confirmez votre adresse avec le lien reçu par e-mail, puis reconnectez-vous.'
  if (/Failed to fetch/i.test(m)) return 'Connexion impossible. Vérifiez votre réseau et réessayez.'
  if (/Unsupported provider|provider is not enabled/i.test(m)) return 'La connexion Google n’est pas encore activée pour ABALMA. Activez Google dans les fournisseurs Supabase, puis réessayez.'
  return m || 'Une erreur est survenue. Réessayez.'
}
