#!/usr/bin/env python3
"""Build the two staff guides with embedded fonts and deterministic PDF bytes.

Run with the bundled Python runtime. Requires reportlab and pypdf.
Optional --runtime-root points to the Codex dependencies directory.
No application services, credentials or live business records are read.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
from pathlib import Path

from pypdf import PdfReader
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.pdfdoc import PDFString
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph

ROOT = Path(__file__).resolve().parents[1]
W, H, M = 612, 792, 48
CONTENT_W = W - M * 2
FOREST = colors.HexColor("#173a2d")
BURGUNDY = colors.HexColor("#742d3f")
GOLD = colors.HexColor("#c7a65b")
CREAM = colors.HexColor("#f5f0e6")
PAPER = colors.HexColor("#fffdf8")
LINE = colors.HexColor("#ded5c5")
MUTED = colors.HexColor("#5f6d63")
PALE_GREEN = colors.HexColor("#e7eee4")
PALE_RED = colors.HexColor("#f2e4e3")


def fonts(runtime: Path) -> None:
    sans = runtime / "node/node_modules/pdfjs-dist/standard_fonts"
    names = {"Body": "LiberationSans-Regular.ttf", "Body-Bold": "LiberationSans-Bold.ttf", "Body-Italic": "LiberationSans-Italic.ttf"}
    for name, file in names.items():
        pdfmetrics.registerFont(TTFont(name, str(sans / file)))
    pdfmetrics.registerFontFamily("Body", normal="Body", bold="Body-Bold", italic="Body-Italic", boldItalic="Body-Bold")
    serif = Path("C:/Windows/Fonts/georgia.ttf")
    pdfmetrics.registerFont(TTFont("Editorial", str(serif if serif.exists() else sans / "LiberationSans-Regular.ttf")))


class Guide:
    def __init__(self, path: Path, lang: str):
        self.lang = lang
        self.c = canvas.Canvas(str(path), pagesize=(W, H), invariant=1, pageCompression=1, initialFontName="Body")
        self.c.setTitle("Edelweiss | Stock & Production | " + ("Staff guide" if lang == "en" else "Guía del equipo"))
        self.c.setAuthor("Edelweiss")
        self.c.setSubject("Staff operating guide, edition 2026-11-13. All worked examples are fictional.")
        self.c.setCreator("Edelweiss reproducible staff-guide generator")
        self.c._doc.Catalog.Lang = PDFString("en-US" if lang == "en" else "es-ES")
        self.page_number = 0
        self.y = 0
        self.bounds: list[dict] = []

    def t(self, en: str, es: str) -> str:
        return en if self.lang == "en" else es

    def paragraph(self, text: str, x: float, top: float, width: float, size=10.7, leading=15.1, color=FOREST, font="Body") -> float:
        style = ParagraphStyle("text", fontName=font, fontSize=size, leading=leading, textColor=color, alignment=TA_LEFT, allowWidows=0, allowOrphans=0)
        para = Paragraph(text, style)
        _, height = para.wrap(width, H)
        if top - height < 70:
            raise ValueError(f"Page {self.page_number} ({self.lang}): text crosses the footer: {text[:80]}")
        para.drawOn(self.c, x, top - height)
        self.bounds.append({"page": self.page_number, "bottom": round(top - height, 2), "height": round(height, 2)})
        return height

    def page(self, section: str, title: str, subtitle: str) -> None:
        if self.page_number:
            self.c.showPage()
        self.page_number += 1
        c = self.c
        c.setFillColor(CREAM)
        c.rect(0, 0, W, H, fill=1, stroke=0)
        c.setFillColor(FOREST)
        c.rect(0, H - 9, W, 9, fill=1, stroke=0)
        c.setStrokeColor(GOLD)
        c.setLineWidth(1)
        c.circle(M + 14, H - 47, 14, stroke=1, fill=0)
        c.setFillColor(FOREST)
        c.setFont("Editorial", 17)
        c.drawCentredString(M + 14, H - 53, "E")
        c.setFont("Body-Bold", 10.5)
        c.drawString(M + 39, H - 43, "EDELWEISS")
        c.setFont("Body", 8.1)
        c.setFillColor(MUTED)
        c.drawString(M + 39, H - 56, self.t("BAKERY TEAM GUIDE", "GUÍA DEL EQUIPO"))
        c.setFont("Body-Bold", 8)
        c.drawRightString(W - M, H - 43, "STOCK & PRODUCTION")
        c.setFont("Body", 8)
        c.drawRightString(W - M, H - 56, self.t("ENGLISH", "ESPAÑOL"))
        c.setStrokeColor(LINE)
        c.line(M, H - 76, W - M, H - 76)
        self.y = H - 99
        self.p(section.upper(), size=9, leading=12, color=BURGUNDY, font="Body-Bold", after=8)
        self.p(title, size=27, leading=31, font="Editorial", after=9)
        self.p(subtitle, color=MUTED, size=11.2, leading=15.8, after=19)
        c.setStrokeColor(LINE)
        c.line(M, 52, W - M, 52)
        c.setFillColor(MUTED)
        c.setFont("Body", 8)
        c.drawString(M, 35, self.t("13 Nov 2026 | Staff reference", "13 nov 2026 | Guía de uso"))
        c.setFont("Body-Bold", 8)
        c.drawRightString(W - M, 35, f"{self.page_number:02d} / 06")

    def p(self, text: str, size=10.7, leading=15.1, color=FOREST, font="Body", after=8) -> None:
        height = self.paragraph(text, M, self.y, CONTENT_W, size, leading, color, font)
        self.y -= height + after

    def heading(self, text: str) -> None:
        self.p(text, size=14, leading=18, font="Body-Bold", after=7)

    def step(self, number: str, title: str, body: str) -> None:
        top = self.y
        self.c.setFillColor(FOREST)
        self.c.roundRect(M, top - 23, 25, 25, 6, fill=1, stroke=0)
        self.c.setFillColor(PAPER)
        self.c.setFont("Body-Bold", 10)
        self.c.drawCentredString(M + 12.5, top - 15, number)
        height = self.paragraph(f"<b>{title}</b><br/>{body}", M + 38, top, CONTENT_W - 38)
        self.y -= max(25, height) + 13

    def box(self, title: str, body: str, warning=False) -> None:
        height = self.paragraph_height(body, CONTENT_W - 28, 10.4, 14.5)
        box_h = height + 48
        if self.y - box_h < 70:
            raise ValueError(f"Box does not fit page {self.page_number} ({self.lang})")
        self.c.setFillColor(PALE_RED if warning else PALE_GREEN)
        self.c.roundRect(M, self.y - box_h, CONTENT_W, box_h, 8, fill=1, stroke=0)
        self.paragraph(title, M + 14, self.y - 12, CONTENT_W - 28, 10.6, 14, BURGUNDY if warning else FOREST, "Body-Bold")
        self.paragraph(body, M + 14, self.y - 33, CONTENT_W - 28, 10.4, 14.5)
        self.y -= box_h + 14

    @staticmethod
    def paragraph_height(text, width, size, leading):
        return Paragraph(text, ParagraphStyle("measure", fontName="Body", fontSize=size, leading=leading)).wrap(width, H)[1]

    def table(self, rows: list[tuple[str, str]], widths=(150, 366)) -> None:
        for left, right in rows:
            top = self.y
            row_h = max(self.paragraph_height(left, widths[0] - 22, 10.1, 14), self.paragraph_height(right, widths[1] - 22, 10.1, 14)) + 20
            if top - row_h < 70:
                raise ValueError(f"Table crosses footer on page {self.page_number} ({self.lang})")
            self.c.setFillColor(PAPER)
            self.c.rect(M, top - row_h, CONTENT_W, row_h, fill=1, stroke=0)
            self.c.setStrokeColor(LINE)
            self.c.line(M, top - row_h, W - M, top - row_h)
            self.paragraph(left, M + 11, top - 10, widths[0] - 22, 10.1, 14, FOREST, "Body-Bold")
            self.paragraph(right, M + widths[0] + 11, top - 10, widths[1] - 22, 10.1, 14)
            self.y -= row_h
        self.y -= 15

    def metrics(self, values: list[tuple[str, str]], caption: str) -> None:
        self.p(caption, size=8.7, leading=12, color=BURGUNDY, font="Body-Bold", after=8)
        gap = 10
        width = (CONTENT_W - gap * (len(values) - 1)) / len(values)
        for i, (label, number) in enumerate(values):
            x = M + i * (width + gap)
            self.c.setFillColor(PAPER)
            self.c.roundRect(x, self.y - 77, width, 77, 7, fill=1, stroke=0)
            self.paragraph(label, x + 11, self.y - 10, width - 22, 9.2, 12, MUTED)
            self.paragraph(number, x + 11, self.y - 34, width - 22, 25, 29, FOREST, "Editorial")
        self.y -= 92

    def check(self, text: str) -> None:
        top = self.y
        self.c.setStrokeColor(GOLD)
        self.c.setLineWidth(1.1)
        self.c.roundRect(M, top - 12, 11, 11, 2, stroke=1, fill=0)
        height = self.paragraph(text, M + 23, top, CONTENT_W - 23, 10.7, 15.1)
        self.y -= height + 11

    def finish(self):
        if self.page_number != 6:
            raise ValueError("Each guide must have exactly six pages")
        self.c.save()


def build(path: Path, lang: str) -> dict:
    g = Guide(path, lang)
    t = g.t
    g.page(t("01 / Start with one product", "01 / Empieza con un producto"), t("Learn with Plain Croissant", "Aprende con Plain Croissant"), t("One product. One fictional Friday. Practice the routine before using live records.", "Un producto. Un viernes ficticio. Practica la rutina antes de usar registros reales."))
    g.box(t("Original reference / Valentina's CSV", "Referencia original / CSV de Valentina"), t("Plain Croissant: 12 Monday-Thursday; 16 Friday-Sunday. These are the original recurring quantities. All other figures in this lesson are fictional, including sales, trays, orders and the event.", "Plain Croissant: 12 de lunes a jueves; 16 de viernes a domingo. Son las cantidades habituales originales. Las demás cifras de esta lección son ficticias: ventas, bandejas, encargos y evento."))
    g.step("1", "Help &amp; guides", t("Choose English or Español. Press Start guided practice / Iniciar práctica guiada. You will click buttons and fill in fields step by step. These guides keep the app's English control names.", "Elige English o Español. Pulsa Start guided practice / Iniciar práctica guiada. Vas a pulsar botones y rellenar campos paso a paso. Estas guías conservan los nombres ingleses de los controles."))
    g.step("2", t("Read the practice banner", "Comprueba el aviso de práctica"), t("PRACTICE ONLY · Nothing is saved means you are in the separate practice screen. Follow the highlighted control, step by step. It uses memory only: no Clover or dashboard records are saved. Dates and figures on the real screen underneath stay unchanged.", "PRACTICE ONLY · Nothing is saved (SOLO PRÁCTICA · No se guarda nada) identifica la pantalla separada. Sigue el control destacado, paso a paso. Solo usa memoria: no guarda datos en Clover ni en el dashboard. La fecha y las cifras reales de debajo no cambian."))
    g.box(t("The real workspace is connected", "El espacio real sí está conectado"), t("Outside practice, the app reads Clover's catalogue and sales through the bakery website and saves its own plans and counts. It does not change Clover inventory or website availability. Practice saves nothing.", "Fuera de la práctica, la app lee el catálogo y las ventas de Clover a través de la web y guarda sus propios planes y recuentos. No modifica existencias de Clover ni disponibilidad de la web. La práctica no guarda nada."))
    g.p(t("Practice opens on the first visit in each browser. You can leave, restart or repeat it from Help &amp; guides and download either guide. There is no individual staff tracking. For live entries, check the date and enter Your name first.", "La práctica aparece la primera vez en cada navegador. Puedes salir, reiniciar o repetirla desde Help &amp; guides y descargar ambas guías. No hay seguimiento personal. Para registrar datos reales, comprueba primero la fecha y escribe Your name."), size=10.1, leading=14, color=MUTED)

    g.page(t("02 / Next bake", "02 / Next bake"), t("Why 20? Why change it to 26?", "¿Por qué 20? ¿Por qué subir a 26?"), t("Plain Croissant / A fictional Friday. These are practice numbers, not a real production instruction.", "Plain Croissant / Un viernes ficticio. Son cifras de práctica, no una orden real de producción."))
    g.step("1", t("Click Next bake, then Why this quantity?", "Pulsa Next bake y Why this quantity?"), t("The four fictional Fridays sold 14, 16, 18 and 16: their average is 16. With no extra allowance and fictional trays of 6, round 16 up to 18. That is Suggested. Add 2 confirmed fictional Preorders: the full plan starts at 20.", "Los cuatro viernes ficticios vendieron 14, 16, 18 y 16: la media es 16. Sin margen extra y con bandejas ficticias de 6, redondeamos 16 hacia arriba a 18. Eso es Suggested. Sumamos 2 Preorders ficticios confirmados: el plan completo parte de 20."))
    g.metrics([("Suggested", "18"), ("Preorders", "+ 2"), ("Planned quantity", "20")], t("SIMULATED / Average 16; practice allowance 0; fictional trays of 6", "SIMULADO / Media 16; margen de práctica 0; bandejas ficticias de 6"))
    g.step("2", t("Enter 26 in Planned quantity", "Escribe 26 en Planned quantity"), t("A fictional local event needs six more pieces. Changing 20 to 26 adds 30%. That is over 20%, so type Local event in Reason. Do not add the same two preorders again: they were already in 20.", "Un evento local ficticio necesita seis piezas más. Subir de 20 a 26 es un 30% más. Supera el 20%: escribe Local event en Reason. No sumes otra vez los dos encargos: ya estaban incluidos en 20."))
    g.step("3", t("Click Save plan", "Pulsa Save plan"), t("The practice now shows a saved plan of 26 for that Friday. Only the simulator changed. You have decided how many to prepare; you have not yet confirmed that 26 were actually baked.", "La práctica muestra un plan guardado de 26 para ese viernes. Solo ha cambiado el simulador. Has decidido cuántas piezas preparar; todavía no has confirmado que realmente se produjeran 26."))
    g.box(t("Before saving a real plan", "Antes de guardar un plan real"), t("Check the date, Your name, trays and confirmed Preorders. Orders belong to the pickup date and are counted once across the website and orders sheet: do not add them again. Payments for later pickups are excluded from the daily suggestion. If a recommendation is blocked or a product/order is missing, ask the manager; never assume zero. Week plan remains available for a deliberately reviewed manual plan. Save each product.", "Comprueba fecha, Your name, bandejas y Preorders confirmados. Los encargos se incluyen en la fecha de recogida y se cuentan una sola vez entre la web y la hoja: no los sumes otra vez. Los pagos para recoger otro día quedan fuera de la sugerencia diaria. Si una recomendación está bloqueada o falta un producto/encargo, consulta al responsable; nunca supongas cero. Week plan permite un plan manual revisado. Guarda cada producto."), warning=True)

    g.page(t("03 / Today & close", "03 / Today & close"), t("Now count what really happened", "Ahora cuenta lo que ocurrió"), t("Plain Croissant / The same fictional Friday. The saved plan is 26; actual production still needs confirmation.", "Plain Croissant / El mismo viernes ficticio. El plan es 26; la producción real aún debe confirmarse."))
    g.step("1", t("Click Today &amp; close", "Pulsa Today &amp; close"), t("Keep the same lesson day. Find Plain Croissant. In practice we actually baked all 26, so enter 26 in Actually baked. A plan or pale placeholder is not an actual count.", "Mantén el mismo día del ejercicio. Busca Plain Croissant. En la práctica se produjeron las 26 piezas: escribe 26 en Actually baked. El plan o el número tenue de ayuda no es un recuento real."))
    g.step("2", t("Count the unsold pieces", "Cuenta las piezas sin vender"), t("There are 4 left. Enter 4 in Left over. This is the full leftover count before you split its destination. The next page will allocate those same four pieces.", "Quedan 4. Escribe 4 en Left over. Es el total de sobrantes antes de separar su destino. En la siguiente página repartirás esas mismas cuatro piezas."))
    g.metrics([("Actually baked", "26"), ("Left over", "4")], t("SIMULATED / Plain Croissant / Same Friday", "SIMULADO / Plain Croissant / Mismo viernes"))
    g.table([
        (t("Blank", "Vacío"), t("Not counted or unknown. Do not invent a zero.", "Sin contar o desconocido. No inventes un cero.")),
        ("0", t("Counted, and there are none. It is an actual observation.", "Contado y no hay unidades. Es una observación real.")),
        ("Confirm baked = plan", t("Only use it when actual production really matched the plan.", "Úsalo solo cuando lo producido coincidió realmente con el plan.")),
    ])
    g.box(t("Saving progress in the real workspace", "Guardar avances en el espacio real"), t("Valid edits try to save after about 1.5 seconds without another change. Save progress saves a draft now; it does not finish the product. Wait for Saved and check errors. No full offline mode: a real save is confirmed only by the server. Practice controls save only inside the exercise.", "Los cambios válidos intentan guardarse tras unos 1,5 segundos sin otra edición. Save progress guarda un borrador; no termina el producto. Espera a Saved y revisa errores. No hay modo offline completo: solo el servidor confirma un guardado real. La práctica solo cambia el ejercicio."))

    g.page(t("04 / Close the product", "04 / Cierra el producto"), t("Four leftovers, three destinations", "Cuatro sobrantes, tres destinos"), t("Plain Croissant / Same Friday: 26 baked and 4 left. Keep the whole count, then explain where it went.", "Plain Croissant / Mismo viernes: 26 producidos y 4 sobrantes. Conserva el total y explica su destino."))
    g.step("1", t("Open Where did leftovers go?", "Abre Where did leftovers go?"), t("Enter Too Good To Go = 2, Reused = 1 and Discarded = 1. They are parts of the four leftovers: 2 + 1 + 1 = 4. Left over stays 4. Discarded waste is only 1, not 4.", "Escribe Too Good To Go = 2, Reused = 1 y Discarded = 1. Son partes de los cuatro sobrantes: 2 + 1 + 1 = 4. Left over sigue siendo 4. Lo desechado es solo 1, no 4."))
    g.metrics([("Too Good To Go", "2"), ("Reused", "1"), ("Discarded", "1")], t("SIMULATED / All 4 leftovers are assigned; none are counted twice", "SIMULADO / Los 4 sobrantes están asignados; ninguno se cuenta dos veces"))
    g.step("2", t("Leave Sold out unselected", "Deja Sold out sin marcar"), t("Four pieces remained, so this product did not sell out. Do not add a sell-out time. In a real close, record Time (optional) only when Sold out is true and the time is known.", "Quedaron cuatro piezas: este producto no se agotó. No añadas una hora de agotado. En un cierre real, usa Time (optional) solo si Sold out es cierto y conoces la hora."))
    g.step("3", t("Click Finish product and check Reviewed", "Pulsa Finish product y comprueba Reviewed"), t("The lesson close is complete. In the real workspace, do this for every product after checking the date, Your name, actual counts and destinations. Check filters before assuming the whole day is finished.", "El cierre del ejercicio está completo. En el espacio real, repite en cada producto tras revisar fecha, Your name, recuentos y destinos. Comprueba los filtros antes de dar todo el día por terminado."))
    g.box(t("Do not use the all-sold shortcut in this example", "No uses el cierre de todo vendido en este ejemplo"), t("Baked [quantity] as planned · all sold → means the plan was actually baked and nothing remained. Our four leftovers make it wrong here. For a real close, leftovers cannot exceed baked; their destinations cannot exceed leftovers. Confirm any unassigned / kept pieces with the team.", "Baked [quantity] as planned · all sold → significa que se produjo el plan y no quedó nada. Aquí sería incorrecto porque sobraron cuatro. En un cierre real, los sobrantes no pueden superar lo producido ni sus destinos superar los sobrantes. Confirma con el equipo lo que quede sin asignar / conservado."), warning=True)
    g.heading(t("Checklist for a real close", "Lista para un cierre real"))
    g.check(t("Date, Your name and actual baked / leftover counts are correct.", "La fecha, Your name, la producción y los sobrantes reales son correctos."))
    g.check(t("Leftover destinations fit; Sold out matches what happened.", "Los destinos de sobrantes cuadran; Sold out refleja lo ocurrido."))
    g.check(t("Every product shows Reviewed; filters have been checked.", "Cada producto muestra Reviewed; has comprobado los filtros."))

    g.page(t("05 / Week plan", "05 / Week plan"), t("A different Friday, a different plan", "Otro viernes, otro plan"), t("Plain Croissant / Move to Friday of the following week. Do not overwrite the Friday you just closed.", "Plain Croissant / Pasa al viernes de la semana siguiente. No sobrescribas el viernes que acabas de cerrar."))
    g.step("1", t("Click Week plan, then next Friday's 16", "Pulsa Week plan y el 16 del viernes siguiente"), t("This is a future date in another week. Its starting quantity is the original recurring Friday default: 16. Today's reviewed practice close stays at 26 baked and 4 left.", "Es una fecha futura de otra semana. Parte de la cantidad habitual original del viernes: 16. El cierre de práctica de hoy sigue revisado, con 26 producidos y 4 sobrantes."))
    g.step("2", t("Enter 18 and click Save plan", "Escribe 18 y pulsa Save plan"), t("Only that next Friday becomes 18 in the simulator. You changed one date, not the weekly default. In the real Week plan, check the selected week and day before doing the same kind of edit.", "Solo ese viernes siguiente pasa a 18 en el simulador. Has cambiado una fecha, no el valor habitual semanal. En Week plan real, comprueba la semana y el día antes de una edición así."))
    g.table([
        (t("Original CSV reference", "Referencia original del CSV"), t("Mon-Thu: 12. Fri-Sun: 16. Recurring defaults stay unchanged.", "Lun-jue: 12. Vie-dom: 16. Los valores habituales no cambian.")),
        (t("Lesson Friday", "Viernes del ejercicio"), t("Plan 26; actual baked 26; leftovers 4; Reviewed.", "Plan 26; producción 26; sobrantes 4; Reviewed.")),
        (t("Following Friday", "Viernes siguiente"), t("One simulated saved plan: 18 instead of 16.", "Un plan de práctica para una fecha: 18 en vez de 16.")),
    ])
    g.heading(t("Where the other controls fit", "Para qué sirven los demás controles"))
    g.p(t("Products maintains recurring quantities and daily sales links. Thanksgiving and other campaign orders need separately confirmed production links; do not link their campaign items to daily sales. Ask the manager when an order is pending. Settings maintains trays, extra allowance, shop hours, events and closures. The lesson's tray of 6 and event are fictional: do not copy them. A manager confirms changes. Print week: choose Letter, landscape and inspect the kitchen plan.", "Products mantiene cantidades habituales y asociaciones de ventas diarias. Thanksgiving y otras campañas necesitan relaciones de producción confirmadas por separado: no vincules sus artículos a las ventas diarias. Consulta al responsable si hay encargos pendientes. Settings mantiene bandejas, margen, horarios, eventos y cierres. La bandeja de 6 y el evento del ejercicio son ficticios: no los copies. El responsable confirma cambios. Print week: elige Letter, horizontal y revisa el plan de cocina."))
    g.box(t("A starting point, not the whole old workbook", "Un punto de partida, no todo el Excel anterior"), t("The starting quantities came from a CSV extracted from Valentina's Excel. The planning method follows the Claude specification. This does not reproduce every old spreadsheet calculation. Annual history, freezer stock and dough planning are still pending.", "Las cantidades iniciales proceden de un CSV extraído del Excel de Valentina. El método sigue la especificación de Claude. No se ha reproducido cada cálculo del sistema anterior. Siguen pendientes el histórico anual, el congelador y la planificación de masas."))

    g.page(t("06 / Review & Purchases", "06 / Review y Purchases"), t("Read the result without guessing", "Lee el resultado sin suposiciones"), t("Plain Croissant / Return to the fictional Friday: 26 baked, 22 simulated sales and 4 leftovers.", "Plain Croissant / Vuelve al viernes ficticio: 26 producidos, 22 ventas simuladas y 4 sobrantes."))
    g.metrics([("Simulated sales", "22"), ("Actually baked", "26"), ("Left over", "4")], t("SIMULATED RESULTS / 4 leftovers = 2 TGTG + 1 reused + 1 discarded", "RESULTADOS SIMULADOS / 4 sobrantes = 2 TGTG + 1 reutilizado + 1 desechado"))
    g.p(t("Click Review. In this lesson, 26 - 22 = 4 explains the story. <b>The real app does not calculate sales by subtracting leftovers.</b> It reads recorded sales from Clover through the website. Discarded is 1; the other three leftovers went to TGTG or reuse. There was no sell-out.", "Pulsa Review. En el ejercicio, 26 - 22 = 4 explica el caso. <b>La app real no calcula ventas restando sobrantes.</b> Lee las ventas registradas de Clover a través de la web. Discarded es 1; los otros tres sobrantes fueron a TGTG o reutilización. No hubo agotado."))
    g.heading(t("Real Review: check the evidence first", "Review real: comprueba primero los datos"))
    g.p(t("Choose period and product. Sales comparisons use the payment date, which may differ from pickup and production. Check Read with these limits and Daily sales coverage. Unavailable is not zero. For plans with pickup orders, forecast accuracy stays unavailable until demand is measured on comparable pickup dates, even with completed closes. Production and waste need actual counts. Do not compare an advance payment directly with that day's bake.", "Elige período y producto. Las ventas se comparan por fecha de pago, que puede diferir de la recogida y la producción. Lee Read with these limits y Daily sales coverage. Unavailable no significa cero. La precisión de los planes con encargos queda pendiente hasta medir demanda comparable por fecha de recogida, incluso con cierres completos. Producción y desperdicio necesitan recuentos reales. No compares un pago anticipado directamente con lo horneado ese día."))
    g.heading("Purchases")
    g.p(t("Plain Croissant also needs ingredients, but an invoice is not a stock count. Purchases is a private register of manually verified food, ingredient and beverage invoices. It does not read Gmail automatically, place orders, confirm delivery/payment or update ingredient stock. Compare prices only for the same supplier, SKU, unit and currency; fees are separate. Negative credits need review.", "Plain Croissant necesita ingredientes, pero una factura no es un recuento. Purchases registra facturas verificadas manualmente de alimentos, ingredientes y bebidas. No lee Gmail automáticamente ni hace pedidos. Tampoco confirma entrega/pago ni actualiza existencias. Compara precios del mismo proveedor, SKU, unidad y moneda; los gastos van aparte. Los abonos negativos requieren revisión."))
    g.table([
        (t("A real save fails", "Falla un guardado real"), t("Keep your entries and retry. Check Your name, the date and errors. Restore may recover an unsaved count in the same tab; it still needs review and a confirmed save.", "Conserva lo escrito y reintenta. Revisa Your name, fecha y errores. Restore puede recuperar un recuento en la misma pestaña; aún debes revisarlo y confirmar el guardado.")),
        (t("Someone changed it", "Otra persona lo cambió"), t("Keep notes. Reload the latest record, compare and retry: Reload latest plan / Reload settings where offered. Never replace missing data with zeros.", "Conserva tus notas. Recarga, compara y reintenta: Reload latest plan / Reload settings cuando aparezca. No sustituyas datos ausentes por ceros.")),
    ])
    g.finish()
    reader = PdfReader(path)
    if len(reader.pages) != 6:
        raise ValueError("Unexpected PDF page count")
    page_texts = [page.extract_text() or "" for page in reader.pages]
    text = "\n".join(page_texts)
    for number, page_text in enumerate(page_texts, 1):
        if "Plain Croissant" not in page_text:
            raise ValueError(f"The continuous product story is missing from page {number}")
    for required in ["Your name", "Next bake", "Today & close", "Save progress", "Finish product", "Reviewed", "Week plan", "Products", "Settings", "Purchases", "Review", "Help & guides", "Start guided practice", "Iniciar práctica guiada", "English", "Español", "PRACTICE ONLY", "Nothing is saved", "Local event", "Reload latest plan", "1.5" if lang == "en" else "1,5"]:
        if required not in text:
            raise ValueError(f"Missing guide topic: {required}")
    for topic in (["13 Nov 2026", "pickup date", "counted once", "blocked", "payment date", "Thanksgiving"] if lang == "en" else ["13 nov 2026", "fecha de recogida", "una sola vez", "bloqueada", "fecha de pago", "Thanksgiving"]):
        if topic not in text:
            raise ValueError(f"Missing updated operating guidance: {topic}")
    if any(value in text for value in ("\ufffd", "\u25a0", "JSON", "409", "/api/")):
        raise ValueError("Broken glyph or unnecessary technical language in extracted text")
    return {"language": lang, "pages": len(reader.pages), "sha256": hashlib.sha256(path.read_bytes()).hexdigest(), "bytes": path.stat().st_size, "minimum_text_bottom_pt": min(item["bottom"] for item in g.bounds)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--runtime-root", type=Path, default=Path.home() / ".cache/codex-runtimes/codex-primary-runtime/dependencies")
    args = parser.parse_args()
    fonts(args.runtime_root)
    output = ROOT / "output/pdf"
    resources = ROOT / "resources/stock-guides"
    output.mkdir(parents=True, exist_ok=True)
    resources.mkdir(parents=True, exist_ok=True)
    results = []
    for lang in ("en", "es"):
        path = output / f"edelweiss-stock-guide-{lang}.pdf"
        result = build(path, lang)
        resource = resources / path.name
        shutil.copyfile(path, resource)
        if path.read_bytes() != resource.read_bytes():
            raise ValueError("Private download copy differs from the final guide")
        result.update({"output": str(path), "resource": str(resource)})
        results.append(result)
    print(json.dumps(results, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
