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
        self.c.setSubject("Staff operating guide, edition 2026-11-06. All worked examples are fictional.")
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
        c.drawString(M, 35, self.t("06 Nov 2026 | Staff reference", "06 nov 2026 | Guía de uso"))
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
    g.page(t("01 / Start here", "01 / Empieza aquí"), t("A clear routine for every bake", "Una rutina clara para cada día"), t("Plan the bake. Count what happened. Review before closing.", "Planifica la producción. Cuenta lo que ocurrió. Revisa antes de cerrar."))
    g.box(t("Keep the screen labels in English", "Los botones siguen en inglés"), t("This guide uses the exact tab and button names you will see in the app. Every worked example is fictional and must not be entered as a real record.", "Esta guía conserva los nombres exactos de pestañas y botones para encontrarlos en la app. Todos los ejemplos son ficticios: no los registres como datos reales."))
    g.step("1", t("Choose the date and Your name", "Elige la fecha y escribe Your name"), t("Check the selected day before entering anything. The bakery uses Maine local dates and saved times show ET. Your name identifies the person making the entry; the login is shared.", "Comprueba el día seleccionado antes de escribir. Se usa la fecha local de Maine y las horas guardadas muestran ET. Tu nombre identifica a quien registra el dato; el acceso es compartido."))
    g.step("2", t("Before production: Next bake", "Antes de producir: Next bake"), t("Review Suggested and Preorders separately, adjust Planned quantity, then Save plan for each product. Opening Next bake selects tomorrow; check the date again.", "Revisa Suggested y Preorders por separado, ajusta Planned quantity y pulsa Save plan en cada producto. Next bake selecciona mañana al abrirse; vuelve a comprobar la fecha."))
    g.step("3", t("During the day and at close: Today &amp; close", "Durante el día y al cerrar: Today &amp; close"), t("Enter actual baked and leftover counts. Save progress as you go. At close, check each card and use Finish product until it shows Reviewed.", "Introduce la producción y los sobrantes reales. Guarda avances con Save progress. Al cerrar, revisa cada ficha y pulsa Finish product hasta que muestre Reviewed."))
    g.heading(t("Find the right place", "Encuentra cada tarea"))
    g.table([
        ("Next bake / Today &amp; close", t("Plan tomorrow / record actual production and close.", "Planificar mañana / registrar producción real y cerrar.")),
        ("Week plan / Products", t("Edit one date / maintain recurring weekly quantities and sales links.", "Editar una fecha / mantener cantidades semanales y asociaciones de ventas.")),
        ("Settings / Purchases / Review", t("Special dates and bake sizes / recorded invoices / reports and coverage.", "Fechas especiales y bandejas / facturas registradas / informes y cobertura.")),
    ])
    g.p(t("Daily counting does not require purchase or supplier administration. Suggestions need staff judgment; they do not place orders or change Clover.", "El recuento diario no requiere administrar compras ni proveedores. Las sugerencias necesitan criterio del equipo; no hacen pedidos ni cambian Clover."), size=10.1, leading=14, color=MUTED)
    g.p(t("Use <b>Help &amp; guides</b> to replay the tour, choose English/Español or download these guides. The tour opens on the first visit in each browser. Skip or replay it anytime; no individual staff tracking.", "Usa <b>Help &amp; guides</b> para repetir la visita, elegir English/Español o descargar estas guías. La visita aparece la primera vez en cada navegador. Puedes saltarla o repetirla cuando quieras; no hace seguimiento personal."), size=10.1, leading=14, color=MUTED)

    g.page(t("02 / Next bake", "02 / Next bake"), t("Review the quantity, then save", "Revisa la cantidad y guarda"), t("A suggestion is a starting point. A saved plan is your decision for one product and date.", "La sugerencia es un punto de partida. El plan guardado es vuestra decisión para un producto y una fecha."))
    g.step("1", t("Read the three numbers", "Lee los tres valores"), t("Manual par is the recurring quantity. Suggested is the estimate for regular demand. Preorders are confirmed pickup quantities shown separately. Planned quantity is the full quantity you will save.", "Manual par es la cantidad habitual. Suggested estima la demanda normal. Preorders muestra por separado los encargos confirmados para recoger. Planned quantity es la cantidad completa que guardarás."))
    g.metrics([("Suggested", "30"), ("Preorders", "+ 6"), ("Planned quantity", "36")], t("FICTIONAL EXAMPLE / One product, one selected date", "EJEMPLO FICTICIO / Un producto y una fecha"))
    g.p(t("In this example the full plan is 36, not 30. Do not add the same six pickup items a second time. Use suggestion restores the displayed proposal; it still needs Save plan.", "Aquí el plan completo es 36, no 30. No sumes los mismos seis encargos otra vez. Use suggestion recupera la propuesta mostrada; aún hay que pulsar Save plan."))
    g.step("2", t("Open Why this quantity?", "Abre Why this quantity?"), t("Read the explanation and warnings. The usual estimate uses recent matching weekdays; when there are too few valid days it falls back to the manual quantity. Events and missing evidence can change what is usable.", "Lee la explicación y los avisos. La estimación habitual usa el mismo día de la semana en semanas recientes; si faltan días válidos, vuelve a la cantidad manual. Los eventos y los datos que faltan afectan a la propuesta."))
    g.step("3", t("Adjust, explain and Save plan", "Ajusta, explica y pulsa Save plan"), t("Check tray sizes and pickup orders. A change over 20% needs a Reason. In this example, 46 is more than 20% above 36, so explain it before saving. Check for Plan saved. Repeat for each product.", "Comprueba bandejas y encargos. Un cambio superior al 20% requiere Reason. En el ejemplo, 46 supera en más del 20% a 36: explica el motivo antes de guardar. Comprueba Plan saved. Repite en cada producto."))
    g.box(t("If pickup orders are unavailable or not linked", "Si faltan encargos o asociaciones"), t("Do not treat the missing quantity as zero. Suggestions cannot be accepted while pickup-order data is incomplete. Confirm orders with the team; use Week plan only for a consciously reviewed manual plan.", "No interpretes la cantidad desconocida como cero. No se pueden aceptar sugerencias con encargos incompletos. Confirma los encargos con el equipo; usa Week plan solo para introducir un plan manual revisado."), warning=True)
    g.p(t("Reload suggestions does not replace plans already saved. Review changes and save deliberately.", "Reload suggestions no sustituye los planes ya guardados. Revisa los cambios y guarda de forma consciente."), size=10.1, leading=14, color=MUTED)

    g.page(t("03 / Today & close", "03 / Today & close"), t("Count actual production", "Cuenta la producción real"), t("The plan is not an actual count. A blank field and a zero mean different things.", "El plan no es un recuento real. Un campo vacío y un cero significan cosas distintas."))
    g.table([
        (t("Blank", "Vacío"), t("Not counted or not yet known. Leave unknown counts blank.", "Sin contar o aún desconocido. Deja vacío lo que no se sabe.")),
        ("0", t("Counted, and there are none. Enter zero only after checking.", "Contado y no hay unidades. Escribe cero solo tras comprobarlo.")),
        ("Actually baked", t("Everything actually produced for this product that day, including extra batches.", "Todo lo producido realmente de ese producto ese día, incluidas tandas extra.")),
        ("Left over", t("All unsold units before splitting their destination. Do not subtract TGTG, reused or discarded twice.", "Todas las unidades sin vender antes de separar su destino. No restes TGTG, reutilización o descarte dos veces.")),
    ])
    g.p(t("Enter Actually baked yourself. Confirm baked = plan is an explicit confirmation: use it only when actual production matches the plan. A pale placeholder is a hint, not a saved count.", "Introduce Actually baked. Confirm baked = plan es una confirmación explícita: úsala solo si la producción real coincide con el plan. El número tenue de ayuda no es un recuento guardado."))
    g.metrics([("Actually baked", "40"), ("Left over", "8")], t("FICTIONAL EXAMPLE / Count first, allocate second", "EJEMPLO FICTICIO / Primero cuenta, luego reparte"))
    g.p(t("Open Where did leftovers go? Enter Too Good To Go = 3, Reused = 2 and Discarded = 1. These are parts of the eight leftovers: 3 + 2 + 1 = 6. Two remain unassigned / kept; confirm their destination with the team. Left over stays 8.", "Abre Where did leftovers go? Registra Too Good To Go = 3, Reused = 2 y Discarded = 1. Son partes de los ocho sobrantes: 3 + 2 + 1 = 6. Quedan dos sin asignar / conservados; confirma su destino con el equipo. Left over sigue siendo 8."))
    g.box(t("Keep the counts consistent", "Mantén los recuentos coherentes"), t("Leftovers cannot exceed actual baked. TGTG + reused + discarded cannot exceed leftovers. Select Sold out only if none remain; Time (optional) records when it happened, if known.", "Los sobrantes no pueden superar lo producido. TGTG + reutilización + descarte no puede superar los sobrantes. Marca Sold out solo si no queda nada; Time (optional) recoge la hora si se conoce."))

    g.page(t("04 / Close & recover", "04 / Cierre y recuperación"), t("Finish with a reviewed record", "Termina con un registro revisado"), t("Check the whole card, then Finish product. Saving progress alone does not mark it reviewed.", "Revisa la ficha completa y pulsa Finish product. Guardar un avance no la marca como revisada."))
    g.heading(t("End-of-day checklist", "Lista de cierre"))
    for en, es in [
        ("The selected date and Your name are correct.", "La fecha seleccionada y Your name son correctos."),
        ("Actually baked and Left over are counted, including real zeros.", "Actually baked y Left over están contados, incluidos los ceros reales."),
        ("Too Good To Go, Reused and Discarded are correct subsets of leftovers.", "Too Good To Go, Reused y Discarded son partes correctas de los sobrantes."),
        ("Any unassigned / kept leftovers have an agreed destination.", "Los sobrantes sin asignar / conservados tienen un destino acordado."),
        ("Sold out and the optional time match what happened.", "Sold out y la hora opcional reflejan lo ocurrido."),
        ("Each product shows Reviewed; check filters before assuming all are done.", "Cada producto muestra Reviewed; comprueba los filtros antes de dar todo por terminado."),
    ]:
        g.check(t(en, es))
    g.box(t("One-tap close: only when the plan was exactly right", "Cierre rápido: solo si el plan fue exacto"), t("Baked [quantity] as planned · all sold → confirms the planned amount was actually baked, sets leftovers to zero and finishes the product as sold out. Use it only if all of that is true. Otherwise enter actual counts. It does not record an invented sell-out time.", "Baked [quantity] as planned · all sold → confirma que se produjo lo previsto, pone los sobrantes a cero y termina el producto como agotado. Úsalo solo si todo eso es cierto. Si no, introduce recuentos reales. No inventa una hora de agotado."), warning=True)
    g.heading(t("Know what has really saved", "Comprueba qué se ha guardado"))
    g.p(t("Valid edits try to save after about 1.5 seconds without another change. Save progress saves a draft now. Wait for Saved and check for errors before leaving; Unsaved or Not saved yet is not confirmation. A later edit to a Reviewed card needs another review.", "Los cambios válidos intentan guardarse tras unos 1,5 segundos sin otra edición. Save progress guarda un borrador al momento. Espera a Saved y revisa los errores antes de salir; Unsaved o Not saved yet no confirma nada. Si editas una ficha Reviewed, debes revisarla de nuevo."))
    g.p(t("No full offline mode: a save is confirmed only by the server. If an unsaved count is offered in the same tab, Restore it, review it and save. For a failed save, keep the tab open and retry. If someone changed the record, note your counts, Reload data, compare the latest values and re-enter only what is still correct.", "No hay modo offline completo: solo el servidor confirma el guardado. Si la misma pestaña ofrece un recuento pendiente, pulsa Restore, revísalo y guarda. Si falla, conserva la pestaña y reintenta. Si alguien cambió el registro, anota tus cantidades, pulsa Reload data, compara los valores recientes y vuelve a introducir solo lo que siga siendo correcto."), size=10.3, leading=14.3)

    g.page(t("05 / Week, defaults & special dates", "05 / Semana, cantidades y eventos"), t("Change the right level", "Cambia el nivel adecuado"), t("A plan for one day is different from the recurring quantities used on future days.", "Un plan para un día no equivale a las cantidades habituales de las próximas semanas."))
    g.step("1", "Week plan", t("Choose the week, then select a product quantity to edit that date. On mobile, choose the day first. Enter Planned quantity, add a Reason when required, and Save plan. A date edit does not alter recurring defaults.", "Elige la semana y selecciona una cantidad para editar esa fecha. En móvil, elige primero el día. Introduce Planned quantity, añade Reason si se exige y pulsa Save plan. Editar una fecha no cambia las cantidades habituales."))
    g.box("Print week", t("Use Print week for the kitchen copy. It opens the weekly plan and the print dialog. Choose Letter, landscape and one page; inspect the preview before printing. Check the date range and remember that a printout will not update itself.", "Usa Print week para la copia de cocina. Abre el plan semanal y el diálogo de impresión. Elige Letter, horizontal y una página; revisa la vista previa. Comprueba las fechas y recuerda que el papel no se actualiza solo."))
    g.step("2", "Products", t("A manager maintains Recurring weekly quantities for Mon-Sun. Save defaults affects dates without a saved plan; it does not replace saved plans. Check Clover product links and any Confirm with Valentina / Not linked warnings. Do not guess a match from a similar name.", "La persona responsable mantiene Recurring weekly quantities de Mon a Sun. Save defaults afecta a fechas sin plan guardado; no reemplaza planes existentes. Revisa las asociaciones Clover product y los avisos Confirm with Valentina / Not linked. No adivines por un nombre parecido."))
    g.step("3", "Settings", t("Confirm Units per tray, Extra allowance and Target sell-out time with the production lead, then Save product settings. Shop defaults includes Shop closing time and recent History weeks; changes need an operational reason, not a guess.", "Confirma Units per tray, Extra allowance y Target sell-out time con quien dirige producción; pulsa Save product settings. Shop defaults incluye Shop closing time e History weeks. Cambia estos valores por un motivo operativo, no por intuición sin revisar."))
    g.heading("Special dates &amp; closures")
    g.p(t("Set Event name, From, To and Applies to. Confirm whether it affects All products, a Product family or One product. A Bake multiplier of 1 keeps the usual level; 1.3 adds 30% before the extra allowance. Closed for these products stops the selected products. Save with Add event or Save event changes.", "Indica Event name, From, To y Applies to. Confirma si afecta a All products, Product family u One product. Bake multiplier = 1 mantiene el nivel habitual; 1.3 añade un 30% antes del margen extra. Closed for these products detiene los productos elegidos. Guarda con Add event o Save event changes."))
    g.p(t("After any setup change, return to Next bake, read Why this quantity? and review the affected date. Saved plans remain until someone deliberately changes them.", "Tras cambiar la configuración, vuelve a Next bake, lee Why this quantity? y revisa la fecha afectada. Los planes guardados permanecen hasta que alguien los cambie de forma expresa."), color=MUTED, size=10.1, leading=14)

    g.page(t("06 / Purchases & Review", "06 / Purchases y Review"), t("Read the record and its limits", "Lee los datos y sus límites"), t("A missing value is not a zero. An invoice is not a stock receipt or a payment confirmation.", "Un dato desconocido no es cero. Una factura no confirma recepción de existencias ni pago."))
    g.heading("Purchases")
    g.p(t("Read confirmed suppliers, imported invoices and Purchase price changes. On mobile, cards show Previous, Latest and Price change. Prices compare only the same supplier, SKU, unit and currency; shipping and other fees are excluded. No package-size or currency conversion is assumed.", "Consulta proveedores confirmados, facturas importadas y Purchase price changes. En móvil, las tarjetas muestran Previous, Latest y Price change. Solo se comparan el mismo proveedor, SKU, unidad y moneda; se excluyen portes y otros gastos. No se presuponen conversiones de formatos ni moneda."))
    g.box(t("A private register, not automatic inbox reading", "Un registro privado, sin lectura automática del correo"), t("The app does not read Gmail automatically yet. Managers import reviewed food, ingredient and beverage invoices through Advanced administration. Purchase administration is separate from daily counting. Negative discounts and credits need manual review. Purchases do not place orders, update ingredient stock or confirm delivery or payment.", "La app aún no lee Gmail automáticamente. La persona responsable importa facturas revisadas de alimentos, ingredientes y bebidas desde Advanced administration. Administrar compras es independiente del recuento diario. Los descuentos y abonos negativos requieren revisión manual. Las compras no hacen pedidos ni actualizan existencias; tampoco confirman entrega o pago."))
    g.heading("Review")
    g.p(t("Choose Compare, Product family and Product. Check linked products, recorded open days and complete closes before comparing periods. Read <b>Read with these limits</b> and <b>Daily sales coverage</b>. Recorded, Closed and Unavailable mean different things; missing dates are not zero-sales days.", "Elige Compare, Product family y Product. Comprueba productos vinculados, días abiertos con datos y cierres completos antes de comparar. Lee <b>Read with these limits</b> y <b>Daily sales coverage</b>. Recorded, Closed y Unavailable son estados distintos; los días sin datos no son días con ventas cero."))
    g.p(t("Sell-through, leftover destinations and forecast accuracy need actual measured closes. Unavailable and Forecast trend unavailable mean there is not enough usable evidence. Percent change is unavailable if the previous value is zero or missing. Reports help a discussion; they do not prove demand or recommend ingredient orders.", "Sell-through, destinos de sobrantes y precisión necesitan cierres medidos. Unavailable y Forecast trend unavailable indican que faltan datos utilizables. No hay cambio porcentual si el valor anterior es cero o falta. Los informes ayudan a revisar; no prueban la demanda ni recomiendan pedidos de ingredientes."))
    g.heading(t("When something blocks you", "Si algo te impide continuar"))
    g.table([
        (t("Save is disabled", "No puedes guardar"), t("Check Your name, selected date and visible warnings. Future actual counts are unavailable.", "Revisa Your name, fecha y avisos. No se admiten recuentos reales futuros.")),
        (t("Changed by someone else", "Otra persona lo cambió"), t("Reload the latest record, review and retry. Use Reload latest plan or Reload settings where offered; keep your notes.", "Recarga el registro más reciente, revisa y reintenta. Usa Reload latest plan o Reload settings cuando aparezca; conserva tus notas.")),
        (t("Data or session problem", "Fallo de datos o acceso"), t("Use Try again / Reload reports. If asked to refresh the session, sign in again. Tell the lead which date and product are affected; never replace missing data with zeros.", "Usa Try again / Reload reports. Si se pide renovar el acceso, vuelve a entrar. Indica al responsable fecha y producto; no sustituyas datos ausentes por ceros.")),
    ])
    g.finish()
    reader = PdfReader(path)
    if len(reader.pages) != 6:
        raise ValueError("Unexpected PDF page count")
    text = "\n".join(page.extract_text() or "" for page in reader.pages)
    for required in ["Your name", "Next bake", "Today & close", "Save progress", "Finish product", "Reviewed", "Week plan", "Products", "Settings", "Purchases", "Review", "Help & guides", "English", "Español", "Reload latest plan", "1.5" if lang == "en" else "1,5"]:
        if required not in text:
            raise ValueError(f"Missing guide topic: {required}")
    if "\ufffd" in text or "\u25a0" in text:
        raise ValueError("Broken glyph in extracted text")
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
