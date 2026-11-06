"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { createPortal } from "react-dom";
import { CircleHelp, X, ArrowRight, Download } from "lucide-react";
import { StockPractice } from "./StockPractice";
import "./stock-help.css";

type Language = "en" | "es";
const seenKey = "edelweiss-stock-practice-v2";
const languageKey = "edelweiss-stock-help-language";

export function StockHelp({ ready, workspace }: { ready: boolean; workspace: RefObject<HTMLElement | null> }) {
  const [panel, setPanel] = useState<"practice" | "help" | null>(null);
  const [language, setLanguage] = useState<Language>("en");
  const offered = useRef(false), dialog = useRef<HTMLDivElement>(null);
  const open = panel !== null, en = language === "en";
  const dismiss = useCallback(() => {
    if (panel === "practice") { try { localStorage.setItem(seenKey, "done"); } catch {} }
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
      setPanel("practice");
    });
    return () => cancelAnimationFrame(frame);
  }, [ready]);
  useEffect(() => {
    if (!open) return;
    const host = workspace.current, previousFocus = document.activeElement;
    const previousInert = host?.inert ?? false, overflow = document.body.style.overflow;
    const scroll = { left: window.scrollX, top: window.scrollY };
    host?.setAttribute("inert", ""); document.body.style.overflow = "hidden";
    return () => {
      if (host && !previousInert) host.removeAttribute("inert");
      document.body.style.overflow = overflow; window.scrollTo(scroll);
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [open, workspace]);
  useEffect(() => { if (open) dialog.current?.focus({ preventScroll: true }); }, [open, panel]);
  function chooseLanguage(next: Language) { setLanguage(next); try { localStorage.setItem(languageKey, next); } catch {} }
  function keyboard(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") { event.preventDefault(); dismiss(); return; }
    if (event.key !== "Tab") return;
    const controls = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),summary') ?? []).filter(element => element.getClientRects().length > 0);
    if (!controls.length) return;
    const first = controls[0], last = controls[controls.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
  return <>
    <button className="stock-button" type="button" data-stock-tour="help" onClick={() => { offered.current = true; setPanel("help"); }}><CircleHelp size={17}/> Help &amp; guides</button>
    {open && createPortal(<div className={`stock-help-layer ${panel === "practice" ? "practice-open" : ""}`}>
      {panel === "help" && <div className="stock-help-shade"/>}
      <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby={panel === "practice" ? "stock-practice-title" : "stock-help-title"} tabIndex={-1} className={panel === "practice" ? "stock-practice-dialog" : "stock-help-card help-home"} onKeyDown={keyboard} lang={language}>
        {panel === "practice" ? <StockPractice language={language} onLanguageChange={chooseLanguage} onClose={dismiss} onComplete={dismiss}/> : <>
          <header><span className="stock-help-eyebrow">Edelweiss · Stock &amp; Production</span><button className="stock-help-close" aria-label={en ? "Close help" : "Cerrar ayuda"} onClick={dismiss}><X size={20}/></button></header>
          <div className="stock-help-languages" aria-label="Help language"><button aria-pressed={en} onClick={() => chooseLanguage("en")}>English</button><button aria-pressed={!en} onClick={() => chooseLanguage("es")}>Español</button></div>
          <div className="stock-help-content">
            <h2 id="stock-help-title">{en ? "Learn one croissant's daily journey" : "Aprende el día a día con un croissant"}</h2>
            <p>{en ? "Practise with Plain Croissant: decide the bake, count what was made and finish the close. You click the controls and enter fictional quantities. The exercise saves nothing to the real workspace." : "Practica con Plain Croissant: decide la producción, cuenta lo preparado y termina el cierre. Tú pulsas los controles e introduces cantidades ficticias. El ejercicio no guarda nada en el espacio real."}</p>
            <ol className="stock-help-routine"><li><strong>Next bake</strong><span>{en ? "Decide what to prepare." : "Decidir qué preparar."}</span></li><li><strong>Today &amp; close</strong><span>{en ? "Count production and leftovers." : "Contar producción y sobrantes."}</span></li><li><strong>Week plan &amp; Review</strong><span>{en ? "Organise upcoming days and learn." : "Organizar los próximos días y aprender."}</span></li></ol>
            <details className="stock-help-reference"><summary>{en ? "What the other sections do" : "Para qué sirven los otros apartados"}</summary><p><strong>Products:</strong> {en ? "Valentina's recurring weekly quantities and sales links." : "Cantidades semanales habituales de Valentina y asociaciones de ventas."}<br/><strong>Settings:</strong> {en ? "Tray sizes, planning parameters, events and closures." : "Bandejas, parámetros, eventos y cierres."}<br/><strong>Purchases:</strong> {en ? "Verified invoices and comparable prices; no automatic Gmail reading or orders yet." : "Facturas verificadas y precios comparables; aún no lee Gmail ni hace pedidos automáticamente."}</p></details>
            <p className="stock-help-safety">{en ? "The real workspace reads catalogue and sales supplied by the website from Clover. It keeps its own plans and counts. It does not change Clover stock or website availability. Practice changes none of these records." : "El espacio real lee catálogo y ventas que la web obtiene de Clover y guarda sus propios planes y recuentos. No cambia las existencias de Clover ni la disponibilidad de la web. La práctica no modifica ninguno de estos registros."}</p>
            <div className="stock-help-downloads"><a download href="/api/stock/guides/en"><Download size={17}/> English guide · PDF</a><a download href="/api/stock/guides/es"><Download size={17}/> Guía en español · PDF</a></div>
          </div>
          <button className="stock-button primary stock-help-start" onClick={() => setPanel("practice")}>{en ? "Start guided practice" : "Iniciar práctica guiada"}<ArrowRight size={17}/></button>
        </>}
      </div>
    </div>, document.body)}
  </>;
}
