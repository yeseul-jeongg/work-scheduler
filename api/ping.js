// 하루 한 번 Vercel이 자동으로 호출해서 Supabase 무료 프로젝트가 멈추지 않게 깨워요.
// 데이터를 읽거나 쓰지 않고 'ok'만 받아와요.
export default async function handler(req, res) {
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) {
    res.status(500).json({ ok: false, error: 'missing env' })
    return
  }
  try {
    const r = await fetch(`${url}/rest/v1/rpc/sched_ping`, {
      method: 'POST',
      headers: { apikey: key, 'Content-Type': 'application/json' },
      body: '{}',
    })
    res.status(r.ok ? 200 : 502).json({ ok: r.ok, status: r.status, at: new Date().toISOString() })
  } catch (e) {
    res.status(502).json({ ok: false, error: String(e) })
  }
}
