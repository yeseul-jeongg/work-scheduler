import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * 환경변수 주소를 정리해요.
 * Supabase 화면에서 복사할 때 끝에 /rest/v1/ 이나 / 가 같이 붙는 경우가 있어서
 * 앞뒤 공백, 끝의 /rest/v1, / 를 떼고 https://xxxx.supabase.co 형태로 맞춰요.
 */
export function cleanSupabaseUrl(raw: string | undefined): string | undefined {
  if (!raw) return undefined
  let u = raw.trim().replace(/^["']|["']$/g, '')
  u = u.replace(/\/+$/, '')
  u = u.replace(/\/(rest|auth)\/v1$/i, '')
  u = u.replace(/\/+$/, '')
  if (u && !/^https?:\/\//i.test(u)) u = `https://${u}`
  return u || undefined
}

const url = cleanSupabaseUrl(import.meta.env.VITE_SUPABASE_URL as string | undefined)
const key = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim()

/** 설정값이 이상할 때 화면에 보여줄 안내 (문제 없으면 빈 문자열) */
export const configProblem: string = (() => {
  if (!url || !key) return 'missing'
  if (!/^https?:\/\/[^/]+$/.test(url)) return 'url'
  if (key.startsWith('sb_secret_')) return 'secret'
  return ''
})()

/** 환경변수가 없으면 null (화면에 설정 안내를 띄움) */
export const supabase: SupabaseClient | null =
  url && key && configProblem !== 'secret'
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

/** 로그인 오류를 원인별로 나눠서 알려줘요 */
export function loginErrorMessage(err: { message?: string; status?: number; code?: string; name?: string }): string {
  const msg = (err.message || '').toLowerCase()
  const code = (err.code || '').toLowerCase()
  if (code === 'invalid_credentials' || msg.includes('invalid login credentials')) {
    return '이메일 또는 비밀번호가 맞지 않아요.'
  }
  if (code === 'email_not_confirmed' || msg.includes('email not confirmed')) {
    return '이메일 인증이 안 된 계정이에요. Supabase > Authentication > Users 에서 이 계정을 확인해주세요.'
  }
  if (msg.includes('invalid api key') || msg.includes('no api key') || err.status === 401) {
    return '사이트 연결 설정(Supabase 키)이 맞지 않아요. Vercel 환경변수 VITE_SUPABASE_ANON_KEY 를 확인해주세요.'
  }
  if (err.status === 404 || msg.includes('not found')) {
    return '사이트 연결 설정(Supabase 주소)이 맞지 않아요. Vercel 환경변수 VITE_SUPABASE_URL 을 확인해주세요.'
  }
  if (err.name === 'AuthRetryableFetchError' || msg.includes('failed to fetch') || msg.includes('network')) {
    return 'Supabase에 연결하지 못했어요. 인터넷 연결이나 Supabase 프로젝트가 일시정지되지 않았는지 확인해주세요.'
  }
  if (err.status === 429 || msg.includes('rate limit')) {
    return '로그인 시도가 너무 많아요. 잠시 후 다시 해주세요.'
  }
  return `로그인하지 못했어요. (${err.message || '알 수 없는 오류'})`
}
