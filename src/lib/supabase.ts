import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** 환경변수가 없으면 null (화면에 설정 안내를 띄움) */
export const supabase: SupabaseClient | null =
  url && key
    ? createClient(url, key, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          // 연차계산기와 같은 Supabase를 쓰므로 로그인 정보 저장 이름을 따로 둠
          storageKey: 'sched-auth',
        },
      })
    : null

/** 지금 로그인한 계정이 스케줄러 관리자 명단에 있는지 */
export async function checkIsAdmin(): Promise<boolean> {
  if (!supabase) return false
  const { data, error } = await supabase.rpc('sched_is_admin')
  if (error) throw error
  return data === true
}
