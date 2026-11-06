"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { createPortal } from "react-dom";
import { CircleHelp, X, ArrowRight, ArrowLeft, Download } from "lucide-react";
import "./stock-help.css";

type Language = "en" | "es";
const seenKey = "edelweiss-stock-tour-v1";
const languageKey = "edelweiss-stock-help-language";
const steps = [
  { target: "heading", en: ["Welcome to the bakery workspace", "A simple daily routine: review the bake, count what you actually make, then close each product. This tour explains the controls without changing or saving anything."], es: ["Bienvenidos al espacio de trabajo", "Una rutina sencilla: revisar la producción, contar lo que se prepara y cerrar cada producto. Esta visita explica los controles sin cambiar ni guardar nada."] },
  { target: "identity", en: ["Start with the date and your name", "Choose the day you are working on, then enter your name before editing. Today returns to the shop's current day in Maine. Always check the date before counting or planning."], es: ["Primero, la fecha y tu nombre", "Elige el día de trabajo e introduce tu nombre antes de editar. Today vuelve al día actual de la tienda en Maine. Comprueba siempre la fecha antes de contar o planificar."] },
  { target: "forecast", en: ["Next bake · Prepare the next bake", "Review Suggested and the separate Preorders quantity. Planned includes both. Open Why this quantity?, adjust with your judgement and Save plan for each product. Changes over 20% need a reason. Check suggestions with Valentina."], es: ["Next bake · Preparar la siguiente producción", "Revisa Suggested y los encargos separados en Preorders. Planned suma ambos. Abre Why this quantity?, ajusta con tu criterio y pulsa Save plan en cada producto. Cambios superiores al 20% necesitan un motivo. Valida las sugerencias con Valentina."] },
  { target: "counts", fallback: "today", en: ["Today & close · Count as you go", "Actually baked is what you really made; Left over is what remains. The planned quantity is only a hint until you confirm it. Blank means not counted; 0 means counted and none. Valid draft changes save automatically; check the save message."], es: ["Today & close · Contar durante el día", "Actually baked es la producción real; Left over, lo que queda. El plan es solo una referencia hasta confirmarlo. Vacío significa sin contar; 0 significa contado y no hay. Los cambios válidos del borrador se guardan automáticamente: comprueba el mensaje."] },
  { target: "finish", fallback: "today", en: ["Finish the close after checking", "Split leftovers into Too Good To Go, Reused and Discarded; these are parts of Left over, not extra pieces. Confirm Sold out and its time if known. Save progress keeps a draft. Finish product marks it Reviewed. Only use the all-sold shortcut when it is true."], es: ["Revisar y terminar el cierre", "Reparte los sobrantes en Too Good To Go, Reused y Discarded: forman parte de Left over, no son piezas adicionales. Confirma Sold out y su hora si la sabes. Save progress guarda un borrador; Finish product lo marca Reviewed. Usa el atajo de todo vendido solo si es cierto."] },
  { target: "week", en: ["Week plan · Organise the week", "Edit a day's quantity without changing recurring defaults. On a phone, choose the day and tap a product. Enter a reason for large changes. Print week gives the kitchen a complete one-page weekly plan."], es: ["Week plan · Organizar la semana", "Edita la cantidad de una fecha sin cambiar los valores habituales. En el móvil, elige el día y toca un producto. Añade un motivo a los cambios grandes. Print week imprime el plan semanal completo en una página para cocina."] },
  { target: "products", en: ["Products · Keep the basics accurate", "Recurring quantities apply to dates without a saved plan. Check product links and provisional names with Valentina. Do not link similar names by guesswork: the link determines which sales are used."], es: ["Products · Mantener bien la base", "Las cantidades habituales se aplican a fechas sin un plan guardado. Revisa con Valentina las asociaciones y los nombres provisionales. No asocies nombres parecidos por intuición: la asociación determina qué ventas se utilizan."] },
  { target: "settings", en: ["Settings · Adjust with the team", "Set pieces per tray, the planning margin and target sell-out times. Add events and closed dates before planning them. Agree changes with Valentina; they affect future suggestions, while saved plans stay in place."], es: ["Settings · Ajustar con el equipo", "Configura piezas por bandeja, margen de planificación y hora objetivo de agotado. Añade eventos y cierres antes de planificarlos. Acuerda los cambios con Valentina: afectan a nuevas sugerencias; los planes guardados se conservan."] },
  { target: "suppliers", en: ["Purchases · Follow purchase prices", "Read verified food, ingredient and beverage invoices. Compare prices only for matching products, units and currencies. An invoice does not confirm delivery or update stock. Gmail is not read automatically yet, and the app does not place orders."], es: ["Purchases · Seguir los precios de compra", "Consulta facturas verificadas de alimentos, ingredientes y bebidas. Compara precios de productos, unidades y monedas compatibles. Una factura no confirma recepción ni actualiza existencias. Gmail aún no se lee automáticamente y la app no realiza pedidos."] },
  { target: "analytics", en: ["Review · Learn from the records", "Compare sales by product, family and period. Month comparisons use the mean per observed open day. Read the coverage notes: missing counts are not zero. Waste and forecast accuracy need reviewed closes and enough reliable history."], es: ["Review · Aprender de los registros", "Compara ventas por producto, familia y periodo. Los meses se comparan mediante la media por día abierto observado. Lee las notas de cobertura: un dato ausente no es cero. Mermas y precisión necesitan cierres revisados e historial suficiente."] },
  { target: "actions", en: ["Print, sync and check saves", "Print week prepares the kitchen sheet. Sync sales refreshes website sales; it does not save your counts or plans. If a save fails, keep your entries and retry. If another device changed a record, reload and review before saving again. This is not fully offline."], es: ["Imprimir, sincronizar y comprobar", "Print week prepara la hoja de cocina. Sync sales actualiza las ventas de la web; no guarda recuentos ni planes. Si falla un guardado, conserva lo introducido y reintenta. Si otro dispositivo cambió el registro, recarga y revisa antes de guardar de nuevo. No funciona totalmente sin conexión."] },
  { target: "help", en: ["Ready for the daily routine", "Your next steps: check the date, enter your name and start with the day's actual production. Help & guides always lets you repeat this tour or download a user guide. This browser remembers that you have seen the introduction."], es: ["Listos para el trabajo diario", "Siguientes pasos: comprueba la fecha, escribe tu nombre y comienza con la producción real del día. Help & guides permite repetir la visita y descargar las guías. Este navegador recordará que ya has visto la introducción."] },
];

export function StockHelp({ ready, workspace }: { ready: boolean; workspace: RefObject<HTMLElement | null> }) {
  const [panel, setPanel] = useState<"tour" | "help" | null>(null);
  const [step, setStep] = useState(0);
  const [language, setLanguage] = useState<Language>("en");
  const [bounds, setBounds] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const [card, setCard] = useState({ top: 100, left: 16 });
  const offered = useRef(false), dialog = useRef<HTMLDivElement>(null);
  const open = panel !== null, current = steps[step], text = current[language];
  const dismiss = useCallback(() => {
    if (panel === "tour") { try { localStorage.setItem(seenKey, "done"); } catch {} }
    setPanel(null);
  }, [panel]);
  useEffect(() => {
    if (!ready || offered.current) return;
    const frame = requestAnimationFrame(() => {
      offered.current = true;
      try {
        if (localStorage.getItem(languageKey) === "es") setLanguage("es");
        if (localStorage.getItem(seenKey) === "done") return;
      } catch {}
      setPanel("tour");
    });
    return () => cancelAnimationFrame(frame);
  }, [ready]);
  useEffect(() => {
    if (!open) return;
    const host = workspace.current, previousFocus = document.activeElement;
    const previousInert = host?.inert ?? false, overflow = document.body.style.overflow;
    const scroll = { left: window.scrollX, top: window.scrollY };
    host?.setAttribute("inert", "");
    document.body.style.overflow = "hidden";
    return () => {
      if (host && !previousInert) host.removeAttribute("inert");
      document.body.style.overflow = overflow;
      window.scrollTo(scroll);
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [open, workspace]);
  useEffect(() => {
    if (!open) return;
    dialog.current?.focus({ preventScroll: true });
    dialog.current?.querySelector(".stock-help-content")?.scrollTo({ top: 0 });
    if (panel !== "tour") return;
    const target = workspace.current?.querySelector<HTMLElement>(`[data-stock-tour="${current.target}"]`) ??
      workspace.current?.querySelector<HTMLElement>(`[data-stock-tour="${"fallback" in current ? current.fallback : current.target}"]`);
    if (target) {
      target.scrollIntoView({ block: "center", behavior: "instant" });
      if (window.innerWidth <= 600 && target.getBoundingClientRect().top > 170) window.scrollBy(0, target.getBoundingClientRect().top - 170);
    }
    let frame = 0;
    function measure() {
      const rect = target?.getBoundingClientRect();
      setBounds(rect ? { top: Math.max(4, rect.top - 5), left: Math.max(4, rect.left - 5), width: Math.min(rect.width + 10, window.innerWidth - 8), height: Math.min(rect.height + 10, window.innerHeight - 8) } : null);
      const height = dialog.current?.offsetHeight ?? 320, width = Math.min(420, window.innerWidth - 32);
      const desiredTop = rect && rect.bottom + height + 24 < window.innerHeight ? rect.bottom + 14 : rect ? rect.top - height - 14 : 100;
      setCard({ top: Math.max(16, Math.min(desiredTop, window.innerHeight - height - 16)), left: Math.max(16, Math.min(rect?.left ?? 16, window.innerWidth - width - 16)) });
    }
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); };
    measure(); window.addEventListener("resize", schedule); window.addEventListener("scroll", schedule, true);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("resize", schedule); window.removeEventListener("scroll", schedule, true); };
  }, [open, panel, current, language, workspace]);
  function chooseLanguage(next: Language) { setLanguage(next); try { localStorage.setItem(languageKey, next); } catch {} }
  function keyboard(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") { event.preventDefault(); dismiss(); }
    if (event.key !== "Tab") return;
    const controls = dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href]');
    if (!controls?.length) return;
    const first = controls[0], last = controls[controls.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
  const guides = <div className="stock-help-downloads"><a download href="/api/stock/guides/en"><Download size={17}/> English guide · PDF</a><a download href="/api/stock/guides/es"><Download size={17}/> Guía en español · PDF</a></div>;
  return <>
    <button className="stock-button" type="button" data-stock-tour="help" onClick={() => { offered.current = true; setPanel("help"); }}><CircleHelp size={17}/> Help &amp; guides</button>
    {open && createPortal(<div className="stock-help-layer">
      <div className={`stock-help-shade ${panel === "tour" && bounds ? "spotlight" : ""}`}/>
      {panel === "tour" && bounds && <div className="stock-help-spotlight" style={bounds} aria-hidden="true"/>}
      <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="stock-help-title" aria-describedby="stock-help-description" tabIndex={-1} className={`stock-help-card ${panel === "help" ? "help-home" : ""}`} style={panel === "tour" ? card : undefined} onKeyDown={keyboard} lang={language}>
        <header><span className="stock-help-eyebrow">Edelweiss · {panel === "tour" ? (language === "en" ? `Step ${step + 1} of ${steps.length}` : `Paso ${step + 1} de ${steps.length}`) : "Stock & Production"}</span><button className="stock-help-close" aria-label={language === "en" ? "Close help" : "Cerrar ayuda"} onClick={dismiss}><X size={20}/></button></header>
        <div className="stock-help-languages" aria-label="Help language"><button aria-pressed={language === "en"} onClick={() => chooseLanguage("en")}>English</button><button aria-pressed={language === "es"} onClick={() => chooseLanguage("es")}>Español</button></div>
        <div className="stock-help-content"><h2 id="stock-help-title">{panel === "tour" ? text[0] : language === "en" ? "A little help for the daily bake" : "Ayuda para el trabajo diario"}</h2>
        <p id="stock-help-description">{panel === "tour" ? text[1] : language === "en" ? "Follow the guided tour or keep a guide nearby. The tour only explains the controls: it does not change dates, counts or plans." : "Sigue la visita guiada o ten una guía a mano. La visita solo explica los controles: no cambia fechas, recuentos ni planes."}</p>
        {(panel === "help" || step === steps.length - 1) && guides}</div>
        {panel === "help" ? <button className="stock-button primary stock-help-start" onClick={() => { setStep(0); setPanel("tour"); }}>{language === "en" ? "Start guided tour" : "Iniciar visita guiada"}<ArrowRight size={17}/></button> : <>
          <div className="stock-help-progress" aria-hidden="true">{steps.map((_, i) => <span key={i} className={i <= step ? "done" : ""}/>)}</div>
          <footer>{step < steps.length - 1 ? <button className="stock-help-skip" onClick={dismiss}>{language === "en" ? "Skip tour" : "Saltar visita"}</button> : <span/>}<div><button className="stock-button" disabled={step === 0} onClick={() => setStep(step - 1)}><ArrowLeft size={16}/>{language === "en" ? "Back" : "Anterior"}</button><button className="stock-button primary" onClick={() => step === steps.length - 1 ? dismiss() : setStep(step + 1)}>{step === steps.length - 1 ? (language === "en" ? "Finish tour" : "Terminar visita") : (language === "en" ? "Next" : "Siguiente")}<ArrowRight size={16}/></button></div></footer>
        </>}
      </div>
    </div>, document.body)}
  </>;
}
