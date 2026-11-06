"use client";

import { useEffect, useRef, useState } from "react";
import "./stock-practice.css";

type Language = "en" | "es";
type View = "overview" | "forecast" | "today" | "week" | "review" | "products" | "settings" | "purchases";
type Target = "forecast" | "why" | "planned" | "reason" | "save-plan" | "today" | "baked" | "leftover" | "breakdown" | "tgtg" | "reused" | "discarded" | "finish" | "week" | "friday" | "weekly-planned" | "save-week" | "review";
export interface StockPracticeProps {
  language: Language;
  onLanguageChange: (language: Language) => void;
  onClose: () => void;
  onComplete: () => void;
}
interface PracticeState {
  step: number; view: View; done: boolean; whyOpen: boolean; breakdownOpen: boolean; weeklyEditor: boolean;
  planned: string; reason: string; baked: string; leftover: string; tgtg: string; reused: string; discarded: string;
  weeklyPlanned: string; savedPlan: number | null; savedFriday: number | null; reviewed: boolean;
}
const initialState = (): PracticeState => ({ step: 0, view: "overview", done: false, whyOpen: false, breakdownOpen: false, weeklyEditor: false,
  planned: "20", reason: "", baked: "", leftover: "", tgtg: "", reused: "", discarded: "", weeklyPlanned: "16", savedPlan: null, savedFriday: null, reviewed: false });
const targets: Target[] = ["forecast", "why", "planned", "reason", "save-plan", "today", "baked", "leftover", "breakdown", "tgtg", "reused", "discarded", "finish", "week", "friday", "weekly-planned", "save-week", "review"];
const instructions = [
  { en: ["Start with Next bake", "This is a fictional Friday for Plain Croissant. First, click Next bake. You will plan, count and close one product yourself."], es: ["Empieza por Next bake", "Este es un viernes ficticio de Plain Croissant. Primero pulsa Next bake. Practicarás la planificación, el conteo y el cierre de un producto."] },
  { en: ["Understand the suggestion", "Open Why this quantity? before changing the plan. The four Fridays, tray size and orders in this exercise are fictional."], es: ["Entiende la sugerencia", "Abre Why this quantity? antes de cambiar el plan. Los cuatro viernes, el tamaño de bandeja y los encargos del ejercicio son ficticios."] },
  { en: ["Adjust the plan", "Enter 26 in Planned quantity for a local event. The original total is 20: 18 suggested plus 2 preorders."], es: ["Ajusta el plan", "Escribe 26 en Planned quantity por un evento local. El total original es 20: 18 sugeridos más 2 encargos."] },
  { en: ["Explain the extra pieces", "Type Local event in Reason. Increasing 20 to 26 is more than 20%, so the real workspace also needs a reason."], es: ["Explica las piezas adicionales", "Escribe Local event en Reason. Subir de 20 a 26 supera el 20%; en el espacio real también se exige un motivo."] },
  { en: ["Save the practice plan", "Click Save plan. The demo will remember 26. This does not change a real production plan."], es: ["Guarda el plan de práctica", "Pulsa Save plan. La demostración recordará 26. No cambiará ningún plan de producción real."] },
  { en: ["Move to the counter", "Click Today & close. A plan is a decision; the next screen records what you actually made."], es: ["Pasa al mostrador", "Pulsa Today & close. El plan es una decisión; la siguiente pantalla registra lo que realmente se produjo."] },
  { en: ["Count actual production", "Enter 26 in Actually baked. In real work, confirm the count yourself rather than assuming the plan was made."], es: ["Cuenta la producción real", "Escribe 26 en Actually baked. En el trabajo real confirma el conteo; no des por hecho que se produjo todo el plan."] },
  { en: ["Count what remains", "Enter 4 in Left over. Blank means not counted. Zero means counted, with none remaining."], es: ["Cuenta lo que queda", "Escribe 4 en Left over. Vacío significa sin contar. Cero significa contado y que no queda nada."] },
  { en: ["Explain the leftovers", "Open Where did leftovers go? The three categories are parts of the 4 leftovers, not extra pieces."], es: ["Explica los sobrantes", "Abre Where did leftovers go? Las tres categorías forman parte de los 4 sobrantes; no son piezas adicionales."] },
  { en: ["Allocate Too Good To Go", "Enter 2 in Too Good To Go. These 2 pieces are included in Left over."], es: ["Asigna Too Good To Go", "Escribe 2 en Too Good To Go. Estas 2 piezas ya están incluidas en Left over."] },
  { en: ["Record reuse", "Enter 1 in Reused. This piece is also part of Left over, separate from discarded waste."], es: ["Registra la reutilización", "Escribe 1 en Reused. Esta pieza también forma parte de Left over y se separa del desperdicio desechado."] },
  { en: ["Record actual waste", "Enter 1 in Discarded. You have now accounted for all 4 leftovers: 2 + 1 + 1."], es: ["Registra el desperdicio real", "Escribe 1 en Discarded. Ya has distribuido los 4 sobrantes: 2 + 1 + 1."] },
  { en: ["Finish the close", "Check 26 baked, 4 left over and the 2 / 1 / 1 breakdown. Click Finish product. Sold out stays No because 4 pieces remained."], es: ["Termina el cierre", "Revisa 26 producidos, 4 sobrantes y el reparto 2 / 1 / 1. Pulsa Finish product. Sold out sigue en No porque sobraron 4 piezas."] },
  { en: ["Plan the following week", "Click Week plan. We will edit next Friday, in the following week, without changing today's reviewed close."], es: ["Planifica la semana siguiente", "Pulsa Week plan. Editaremos el viernes de la semana siguiente sin cambiar el cierre revisado de hoy."] },
  { en: ["Choose next Friday", "Click Friday's 16. Plain Croissant's recurring quantities are 12 Monday–Thursday and 16 Friday–Sunday."], es: ["Elige el próximo viernes", "Pulsa el 16 del viernes. Las cantidades habituales de Plain Croissant son 12 de lunes a jueves y 16 de viernes a domingo."] },
  { en: ["Change one day's plan", "Enter 18 in Planned quantity for next Friday. This changes one date; the recurring Friday quantity stays 16."], es: ["Cambia el plan de un día", "Escribe 18 en Planned quantity para el próximo viernes. Solo cambia esa fecha; la cantidad habitual del viernes sigue siendo 16."] },
  { en: ["Save next Friday", "Click Save plan. Only next Friday becomes 18 in this demo. All other weekly defaults stay unchanged."], es: ["Guarda el próximo viernes", "Pulsa Save plan. Solo el próximo viernes pasará a 18 en esta demostración. Los demás valores habituales no cambian."] },
  { en: ["Review what happened", "Click Review. The example has 22 simulated sales from 26 baked. The 4 leftovers include 2 Too Good To Go, 1 reused and only 1 discarded."], es: ["Revisa lo sucedido", "Pulsa Review. El ejemplo tiene 22 ventas simuladas de 26 piezas producidas. Los 4 sobrantes incluyen 2 Too Good To Go, 1 reutilizada y solo 1 desechada."] },
];
const weekDays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const pars = [12, 12, 12, 12, 16, 16, 16];
function viewFor(step: number): View { return step === 0 ? "overview" : step <= 5 ? "forecast" : step <= 13 ? "today" : "week"; }

/** A self-contained practice workspace. Every change lives only in this component. */
export function StockPractice({ language, onLanguageChange, onClose, onComplete }: StockPracticeProps) {
  const [state, setState] = useState<PracticeState>(initialState);
  const workspace = useRef<HTMLDivElement>(null);
  const es = language === "es";
  const target = state.done ? null : targets[state.step];
  const active = (name: Target) => target === name;
  const phase = state.done ? "Review" : state.step <= 5 || state.step >= 14 ? "Plan" : state.step <= 8 ? "Count" : "Close";
  const chapter = state.done ? (es ? "Práctica completada" : "Practice complete") : state.step <= 5 ? (es ? "1 · Planificar" : "1 · Plan the bake") : state.step <= 13 ? (es ? "2 · Contar y cerrar" : "2 · Count & close") : (es ? "3 · Plan semanal y revisión" : "3 · Week plan & review");
  const currentSection = ({ overview: es ? "Empieza aquí" : "Start here", forecast: "Next bake", today: "Today & close", week: "Week plan", review: "Review", products: "Products", settings: "Settings", purchases: "Purchases" })[state.view];
  const numericCorrect = (value: string, expected: number) => value.trim() !== "" && Number(value) === expected;
  const planValid = numericCorrect(state.planned, 26) && state.reason.trim().toLowerCase() === "local event";
  const closeValid = numericCorrect(state.baked, 26) && numericCorrect(state.leftover, 4) && numericCorrect(state.tgtg, 2) && numericCorrect(state.reused, 1) && numericCorrect(state.discarded, 1);
  useEffect(() => {
    const host = workspace.current;
    const element = host?.querySelector<HTMLElement>('[data-practice-target="true"]');
    if (!host) return;
    if (!element) { host.scrollTo({ top: 0, behavior: "instant" }); return; }
    // Only this independent scenario scrolls; the coach and page stay put.
    const bounds = host.getBoundingClientRect(), rect = element.getBoundingClientRect();
    if (rect.top < bounds.top + 16 || rect.bottom > bounds.bottom - 16) {
      host.scrollTo({ top: Math.max(0, host.scrollTop + rect.top - bounds.top - Math.max(20, (host.clientHeight - rect.height) / 3)), behavior: "instant" });
    }
  }, [state.step, state.view, state.done]);
  function change(field: "planned" | "reason" | "baked" | "leftover" | "tgtg" | "reused" | "discarded" | "weeklyPlanned", value: string, name: Target, expected?: number) {
    setState(previous => {
      if (previous.done || targets[previous.step] !== name) return previous;
      return { ...previous, [field]: value, step: (expected === undefined ? value.trim().toLowerCase() === "local event" : numericCorrect(value, expected)) ? previous.step + 1 : previous.step };
    });
  }
  function navigate(view: View, name: Target) {
    setState(previous => previous.done ? { ...previous, view } : targets[previous.step] === name ? { ...previous, view, step: previous.step + 1, ...(name === "review" ? { done: true, step: 17 } : {}) } : { ...previous, view: previous.view });
  }
  function back() {
    setState(previous => {
      const step = previous.done ? 17 : Math.max(0, previous.step - 1);
      const reset: Partial<PracticeState> = {};
      const objective = targets[step];
      if (objective === "planned") reset.planned = "20";
      else if (objective === "reason") reset.reason = "";
      else if (objective === "baked" || objective === "leftover" || objective === "tgtg" || objective === "reused" || objective === "discarded") reset[objective] = "";
      else if (objective === "weekly-planned") reset.weeklyPlanned = "16";
      return { ...previous, ...reset, step, done: false, view: viewFor(step), whyOpen: step > 1, breakdownOpen: step > 8, weeklyEditor: step === 15 || step === 16,
        reviewed: step <= 12 ? false : previous.reviewed, savedFriday: step <= 14 ? null : previous.savedFriday };
    });
  }
  const field = (label: string, value: string, name: Target, property: Parameters<typeof change>[0], expected: number) => <label className="practice-field">{label}<input aria-label={label} type="number" inputMode="numeric" min="0" step="1" value={value} readOnly={!active(name)} data-practice-target={active(name) ? "true" : undefined} onChange={event => change(property, event.target.value, name, expected)}/>{value !== "" && !numericCorrect(value, expected) && <small className="practice-correction">{es ? `En esta práctica, escribe ${expected}.` : `For this practice, enter ${expected}.`}</small>}</label>;
  return <section className="stock-practice" aria-labelledby="stock-practice-title">
    <header className="practice-header"><div><p className="practice-only">{es ? "SOLO PRÁCTICA · No se guarda nada" : "PRACTICE ONLY · Nothing is saved"}</p><h2 id="stock-practice-title">{es ? "Practica con Plain Croissant" : "Practice with Plain Croissant"}</h2></div><div className="practice-header-actions"><label className="practice-language"><span>{es ? "Idioma" : "Language"}</span><select aria-label={es ? "Idioma de la práctica" : "Practice language"} value={language} onChange={event => onLanguageChange(event.target.value as Language)}><option value="en">English</option><option value="es">Español</option></select></label><button className="stock-button" type="button" onClick={onClose}>{es ? "Cerrar práctica" : "Close practice"}</button></div></header>
    <div className="practice-context"><strong>{currentSection}</strong><span>Plain Croissant</span><span className="practice-phase">{es ? "Fase" : "Phase"}: {phase}</span><span className="practice-demo-label">DEMO</span><span className="practice-active-note">{es ? "En este ejercicio, solo está activo el control resaltado." : "Only the highlighted control is active in this exercise."}</span></div>
    <div className="practice-layout">
      <aside className="practice-coach" data-testid="practice-coach" aria-label={es ? "Instrucciones de práctica" : "Practice instructions"}>
        <div className="practice-progress"><strong>{es ? `Paso ${state.step + 1} de 18` : `Step ${state.step + 1} of 18`}</strong><span>{chapter}</span></div>
        <progress max={18} value={state.done ? 18 : state.step} aria-label={es ? "Progreso de práctica" : "Practice progress"}/>
        <div className="practice-instruction" aria-live="polite"><h3>{state.done ? (es ? "Ya has completado la rutina" : "You completed the daily routine") : instructions[state.step][language][0]}</h3><p>{state.done ? (es ? "Has guardado un plan ficticio, cerrado sus sobrantes y cambiado el viernes siguiente. Nada ha salido de esta práctica. Puedes volver al espacio real o explorar los otros menús de demostración." : "You saved a fictional plan, closed its leftovers and changed next Friday. Nothing left this practice. Return to the real workspace, or explore the other demo menus.") : instructions[state.step][language][1]}</p></div>
        {state.done && <button className="stock-button primary practice-return" type="button" data-practice-target="true" onClick={onComplete}>{es ? "Volver al espacio real" : "Return to real workspace"}</button>}
        <div className="practice-coach-actions"><button className="stock-button" type="button" disabled={state.step === 0 && !state.done} onClick={back}>{es ? "Volver" : "Back"}</button><button className="stock-button" type="button" onClick={() => setState(initialState())}>{es ? "Empezar de nuevo" : "Restart"}</button></div>
      </aside>
      <div className="practice-scenario">
        <nav className="practice-tabs" aria-label="Practice sections">{([{ view: "forecast", name: "Next bake" }, { view: "today", name: "Today & close" }, { view: "week", name: "Week plan" }, { view: "review", name: "Review" }] as const).map(tab => <button key={tab.view} type="button" aria-current={state.view === tab.view ? "page" : undefined} disabled={!state.done && state.view !== tab.view && target !== tab.view} data-practice-target={active(tab.view) ? "true" : undefined} onClick={() => navigate(tab.view, tab.view)}>{tab.name}</button>)}</nav>
        <div ref={workspace} className="practice-workspace" data-testid="practice-workspace">
          {state.view === "overview" && <article className="practice-card practice-intro"><span className="practice-demo-label">DEMO · Plain Croissant</span><h3>{es ? "Un producto. Una rutina completa." : "One product. One complete routine."}</h3><p>{es ? "Hoy practicarás tú, con botones y cantidades. No hay que leer una visita y pasar páginas." : "You will use the buttons and enter the quantities yourself, with a fictional Friday's bake."}</p><ol className="practice-routine"><li><strong>Plan</strong><span>Next bake · 20 → 26</span></li><li><strong>Count</strong><span>Actually baked · 26</span></li><li><strong>Close</strong><span>Left over · 4 = 2 + 1 + 1</span></li></ol><p className="practice-fiction">{es ? "Los valores habituales del producto son reales: 12 de lunes a jueves y 16 de viernes a domingo. El resto de este caso es ficticio." : "The product's recurring quantities are real: 12 Monday–Thursday and 16 Friday–Sunday. The rest of this case is fictional."}</p></article>}
          {state.view === "forecast" && <article className="practice-card"><div className="practice-card-title"><div><h3>Plain Croissant</h3><p>{es ? "Viernes ficticio · Next bake" : "Fictional Friday · Next bake"}</p></div><span className="practice-status">{state.savedPlan === null ? "Not saved · DEMO" : `Saved plan ${state.savedPlan} · DEMO`}</span></div>
            <dl className="practice-numbers"><div><dt>Manual par</dt><dd>16</dd></div><div><dt>Suggested</dt><dd>18</dd></div><div><dt>Preorders</dt><dd>2</dd></div><div><dt>Total before edit</dt><dd>20</dd></div></dl>
            <details open={state.whyOpen} className="practice-details"><summary data-practice-target={active("why") ? "true" : undefined} onClick={event => { event.preventDefault(); setState(previous => ({ ...previous, whyOpen: !previous.whyOpen, step: previous.step === 1 && !previous.whyOpen ? 2 : previous.step })); }}>Why this quantity?</summary><div><p>{es ? "Cuatro viernes ficticios: 14, 16, 18 y 16 ventas. Media: 16. Margen de práctica: 0. Bandejas ficticias de 6: redondear 16 hacia arriba da 18. Añadir 2 encargos ficticios da 20." : "Four fictional Fridays sold 14, 16, 18 and 16. Average: 16. Practice buffer: 0. Fictional trays of 6: round 16 up to 18. Add 2 fictional preorders for a total of 20."}</p><p className="practice-formula">(14 + 16 + 18 + 16) ÷ 4 = 16 → 18 + 2 = 20</p><small>{es ? "Las bandejas de 6 son solo un ejemplo; no cambian los ajustes reales." : "Trays of 6 are only a practice setting; real settings are unchanged."}</small></div></details>
            <div className="practice-form">{field("Planned quantity", state.planned, "planned", "planned", 26)}<label className="practice-field">Reason<input aria-label="Reason" value={state.reason} readOnly={!active("reason")} maxLength={500} placeholder="Local event" data-practice-target={active("reason") ? "true" : undefined} onChange={event => change("reason", event.target.value, "reason")}/><small>{es ? "Obligatorio: 26 supera en más del 20% el total de 20." : "Required: 26 is over 20% above the total of 20."}</small></label><button className="stock-button primary" type="button" disabled={!planValid || !active("save-plan")} data-practice-target={active("save-plan") ? "true" : undefined} onClick={() => setState(previous => ({ ...previous, savedPlan: 26, step: 5 }))}>Save plan</button></div>
          </article>}
          {state.view === "today" && <article className="practice-card"><div className="practice-card-title"><div><h3>Plain Croissant</h3><p>{es ? "El mismo viernes ficticio · Plan guardado: 26" : "The same fictional Friday · Saved plan: 26"}</p></div><span className="practice-status">{state.reviewed ? <><strong>Reviewed</strong><small> · DEMO</small></> : "Not reviewed · DEMO"}</span></div><div className="practice-form"><div className="practice-pair">{field("Actually baked", state.baked, "baked", "baked", 26)}{field("Left over", state.leftover, "leftover", "leftover", 4)}</div>
            <details open={state.breakdownOpen} className="practice-details"><summary data-practice-target={active("breakdown") ? "true" : undefined} onClick={event => { event.preventDefault(); setState(previous => ({ ...previous, breakdownOpen: !previous.breakdownOpen, step: previous.step === 8 && !previous.breakdownOpen ? 9 : previous.step })); }}>Where did leftovers go?</summary><div className="practice-allocation">{field("Too Good To Go", state.tgtg, "tgtg", "tgtg", 2)}{field("Reused", state.reused, "reused", "reused", 1)}{field("Discarded", state.discarded, "discarded", "discarded", 1)}<p>{es ? "Son partes de los 4 sobrantes: 2 + 1 + 1 = 4." : "These are parts of the 4 leftovers: 2 + 1 + 1 = 4."}</p></div></details>
            <div className="practice-soldout"><strong>Sold out: No</strong><span>{es ? "No se agotó: quedaron 4 piezas." : "This product did not sell out: 4 pieces remained."}</span></div><button className="stock-button primary" type="button" disabled={!closeValid || !active("finish")} data-practice-target={active("finish") ? "true" : undefined} onClick={() => setState(previous => ({ ...previous, reviewed: true, step: 13 }))}>Finish product</button></div>
          </article>}
          {state.view === "week" && <article className="practice-card"><div className="practice-card-title"><div><h3>{es ? "La semana siguiente" : "The following week"}</h3><p>Plain Croissant · Monday 9 – Sunday 15 November · DEMO</p></div>{state.savedFriday !== null && <span className="practice-status">Friday saved: 18 · DEMO</span>}</div><p>{es ? "Otra semana: el cierre revisado de hoy se conserva." : "A different week: today's reviewed close stays unchanged."}</p><div className="practice-week">{weekDays.map((day, index) => <button key={day} type="button" aria-label={index === 4 ? "Edit next Friday for Plain Croissant" : `${day} recurring quantity ${pars[index]}`} data-testid={index === 4 ? "practice-week-friday" : undefined} data-practice-target={index === 4 && active("friday") ? "true" : undefined} disabled={index !== 4 || !active("friday")} onClick={() => setState(previous => ({ ...previous, weeklyEditor: true, weeklyPlanned: "16", step: 15 }))}><span>{day}</span><strong>{index === 4 ? state.savedFriday ?? 16 : pars[index]}</strong><small>{index === 4 && state.savedFriday !== null ? "Saved plan · DEMO" : "Weekly default"}</small></button>)}</div>
            {state.weeklyEditor && <div className="practice-week-editor"><h4>Plain Croissant · Next Friday</h4><div className="practice-form">{field("Planned quantity", state.weeklyPlanned, "weekly-planned", "weeklyPlanned", 18)}<p>{es ? "Solo esta fecha. El valor habitual del viernes seguirá siendo 16." : "This date only. The recurring Friday quantity will remain 16."}</p><button className="stock-button primary" type="button" disabled={!numericCorrect(state.weeklyPlanned, 18) || !active("save-week")} data-practice-target={active("save-week") ? "true" : undefined} onClick={() => setState(previous => ({ ...previous, savedFriday: 18, weeklyEditor: false, step: 17 }))}>Save plan</button></div></div>}
          </article>}
          {state.view === "review" && <article className="practice-card"><span className="practice-demo-label">{es ? "RESULTADOS SIMULADOS · DEMO" : "SIMULATED RESULTS · DEMO"}</span><h3>{es ? "El resultado de ese viernes" : "That Friday's result"}</h3><dl className="practice-review-numbers"><div><dt>Simulated sales</dt><dd>22</dd></div><div><dt>Actually baked</dt><dd>26</dd></div><div><dt>Left over</dt><dd>4</dd></div><div><dt>Too Good To Go</dt><dd>2</dd></div><div><dt>Reused</dt><dd>1</dd></div><div><dt>Discarded</dt><dd>1</dd></div></dl><p className="practice-review-equation">26 − 22 = 4 &nbsp; · &nbsp; 4 = 2 + 1 + 1</p><p>{es ? "El desperdicio desechado es 1, no 4. Too Good To Go y Reused se muestran por separado. No hubo agotado porque quedaron piezas." : "Discarded waste is 1, not 4. Too Good To Go and Reused are shown separately. There was no sell-out because pieces remained."}</p><p>{es ? "El próximo viernes tiene ahora un plan de práctica de 18. Los valores habituales siguen en 12 / 16." : "Next Friday now has a practice plan of 18. Recurring defaults remain 12 / 16."}</p></article>}
          {state.done && state.view === "products" && <article className="practice-card"><h3>Products · Plain Croissant</h3><p>{es ? "Aquí se revisan asociaciones de producto y cantidades habituales. En este ejemplo no hay conexiones ni cambios reales." : "Review product links and recurring quantities here. This example has no live connection and makes no real changes."}</p><dl className="practice-numbers"><div><dt>Mon–Thu</dt><dd>12</dd></div><div><dt>Fri–Sun</dt><dd>16</dd></div></dl></article>}
          {state.done && state.view === "settings" && <article className="practice-card"><h3>Settings · DEMO</h3><p>{es ? "Las piezas por bandeja, el margen y los cierres afectan a nuevas sugerencias. Acuerda los ajustes reales con Valentina." : "Tray sizes, buffers and closures affect new suggestions. Agree real changes with Valentina."}</p><p><strong>Units per tray: 6 · Fictional practice setting</strong></p><p>{es ? "Esta bandeja ficticia solo explica el redondeo; no representa un ajuste confirmado de la tienda." : "This fictional tray only explains rounding; it is not a confirmed shop setting."}</p></article>}
          {state.done && state.view === "purchases" && <article className="practice-card"><h3>Purchases · DEMO</h3><p>{es ? "Factura ficticia de un proveedor de ejemplo. Esta sección compara precios de facturas importadas y verificadas; no lee correos automáticamente." : "A fictional invoice from an example supplier. This section compares verified, manually imported invoice prices; it does not read emails automatically."}</p><div className="practice-example-invoice"><strong>Demo supplier · DEMO-001</strong><span>Example flour · 1 bag · $25.00</span></div><p>{es ? "Sin datos de proveedores, correos ni facturas reales." : "No real supplier details, emails or invoices."}</p></article>}
          {state.done && <div className="practice-explore"><h3>{es ? "Opcional: conoce los otros menús" : "Optional: explore the other menus"}</h3><div>{(["products", "settings", "purchases"] as const).map(view => <button key={view} className="stock-button" type="button" onClick={() => setState(previous => ({ ...previous, view }))}>{view[0].toUpperCase() + view.slice(1)}</button>)}</div></div>}
        </div>
      </div>
    </div>
  </section>;
}
