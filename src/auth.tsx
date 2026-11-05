import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react'
import { supabase } from './lib/supabase'

type Ctx = { user: any; profile: any; loading: boolean; refresh: () => Promise<void>; signOut: () => Promise<void> }
const AuthCtx = createContext<Ctx>({ user: null, profile: null, loading: true, refresh: async () => {}, signOut: async () => {} })

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (u: any) => {
    if (!u) { setProfile(null); return }
    const { data } = await supabase.from('profiles').select('*').eq('id', u.id).maybeSingle()
    setProfile(data)
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      const u = data.session?.user ?? null
      setUser(u); await load(u); setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      const u = session?.user ?? null
      setUser(u); load(u)
    })
    return () => sub.subscription.unsubscribe()
  }, [load])

  const refresh = useCallback(() => load(user), [load, user])
  const signOut = useCallback(async () => { await supabase.auth.signOut() }, [])

  return <AuthCtx.Provider value={{ user, profile, loading, refresh, signOut }}>{children}</AuthCtx.Provider>
}
export const useAuth = () => useContext(AuthCtx)
