import { CheckCircle2, Inbox, PackageCheck, PlugZap, ShoppingBag } from "lucide-react";
import type { OperationsOverview } from "@/lib/content-types";

export function OperationsInbox({ data }: { data: OperationsOverview }) {
  const active = data.items.filter((item) => !["completed", "cancelled"].includes(item.status));
  const requests = active.filter((item) => item.kind === "special-request");
  const upcoming = active.filter((item) => item.requestedFor).slice(0, 6);

  return <div>
    <header className="mb-7">
      <p className="eyebrow">Orders · Requests · Pickup</p>
      <h1 className="page-title">Operations Inbox</h1>
      <p className="mt-2 max-w-3xl text-sm text-[var(--muted)]">Una vista rápida para pedidos online, recogidas y peticiones especiales. Los conectores permanecen desactivados hasta validar el proyecto de Clover y el flujo de n8n.</p>
    </header>

    <div className="grid gap-4 sm:grid-cols-3">
      <Metric icon={ShoppingBag} label="Pedidos activos" value={active.filter((item) => item.kind === "online-order").length} />
      <Metric icon={Inbox} label="Peticiones por revisar" value={requests.filter((item) => ["new", "needs-review"].includes(item.status)).length} />
      <Metric icon={PackageCheck} label="Próximas recogidas" value={upcoming.length} />
    </div>

    {!data.configured && <section className="mt-6 rounded-3xl border border-[var(--line)] bg-white/70 p-6 shadow-sm">
      <div className="flex items-start gap-4"><div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[var(--cream)] text-[var(--forest)]"><PlugZap size={20}/></div><div>
        <h2 className="font-serif text-2xl">Preparado para conectar, sin datos de prueba</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">La bandeja está vacía intencionadamente. Cuando recibamos el resumen técnico, conectaremos Clover como fuente de pedidos y n8n o el proveedor de formularios como fuente de peticiones especiales. Los datos se normalizarán aquí sin alterar el checkout existente.</p>
      </div></div>
    </section>}

    <section className="mt-6 grid gap-4 lg:grid-cols-2">
      {data.sources.map((source) => <article key={source.id} className="rounded-3xl border border-[var(--line)] bg-white/70 p-5">
        <div className="flex items-center justify-between gap-3"><h3 className="font-medium text-[var(--ink)]">{source.label}</h3><span className={`rounded-full px-3 py-1 text-xs ${source.configured ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>{source.configured ? "Conectado" : "Pendiente"}</span></div>
        <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{source.note}</p>
      </article>)}
    </section>

    {data.configured && data.items.length === 0 && <div className="mt-6 rounded-3xl border border-dashed border-[var(--line)] p-10 text-center text-sm text-[var(--muted)]"><CheckCircle2 className="mx-auto mb-3"/>No hay pedidos o solicitudes pendientes.</div>}
  </div>;
}

function Metric({ icon: Icon, label, value }: { icon: typeof ShoppingBag; label: string; value: number }) {
  return <div className="rounded-3xl border border-[var(--line)] bg-white/70 p-5"><Icon size={19} className="mb-5 text-[var(--forest)]"/><p className="font-serif text-3xl">{value}</p><p className="mt-1 text-xs uppercase tracking-[.14em] text-[var(--muted)]">{label}</p></div>;
}
