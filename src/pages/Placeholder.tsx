export default function Placeholder({ title, step }: { title: string; step: string }) {
  return (
    <section className="card">
      <h1 className="ttl">{title}</h1>
      <p className="sub">이 화면은 {step}에서 만들어요.</p>
    </section>
  )
}
