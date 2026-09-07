#!/opt/homebrew/bin/python3.12
"""
Heidy's Bakery — Complete Visual User Guide & Troubleshooting Manual Generator
Generates a publication-quality 8-page PDF using Python 3.12 standard library.
Zero third-party dependencies.
"""

import os
import sys
import zlib
from pathlib import Path

# --- Pure Python PDF 1.4 Generation Engine ---

class PDFEngine:
    def __init__(self, title="Heidy's Bakery Guide"):
        self.title = title
        self.pages = []
        self.objects = []
        
    def new_page(self):
        page = Page()
        self.pages.append(page)
        return page

    def render(self, filepath):
        # 1: Catalog
        # 2: Pages
        # 3: Font Helvetica
        # 4: Font Helvetica-Bold
        # 5: Font Helvetica-Oblique
        # 6: Font Courier
        # Then for each page: Page Object, then Contents Object
        
        objects_bytes = []
        
        def add_obj(obj_str):
            objects_bytes.append(obj_str if isinstance(obj_str, bytes) else obj_str.encode('latin1'))
            return len(objects_bytes)

        # Catalog & Pages placeholder
        add_obj(b"") # 1: Catalog placeholder
        add_obj(b"") # 2: Pages placeholder
        
        # Standard 14 Fonts
        f_helv = add_obj(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>")
        f_bold = add_obj(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>")
        f_obli = add_obj(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding >>")
        f_cour = add_obj(b"<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>")
        
        page_refs = []
        
        for p in self.pages:
            content_bytes = p.get_stream()
            compressed = zlib.compress(content_bytes)
            
            # Contents object
            c_dict = f"<< /Length {len(compressed)} /Filter /FlateDecode >>\nstream\n".encode('latin1') + compressed + b"\nendstream"
            c_id = add_obj(c_dict)
            
            # Page object
            p_dict = (
                f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
                f"/Contents {c_id} 0 R /Resources << /Font << "
                f"/F1 {f_helv} 0 R /F2 {f_bold} 0 R /F3 {f_obli} 0 R /F4 {f_cour} 0 R "
                f">> >> >>"
            ).encode('latin1')
            p_id = add_obj(p_dict)
            page_refs.append(f"{p_id} 0 R")
            
        # Fill Catalog and Pages
        catalog = b"<< /Type /Catalog /Pages 2 0 R >>"
        kids_str = " ".join(page_refs)
        pages = f"<< /Type /Pages /Kids [{kids_str}] /Count {len(self.pages)} >>".encode('latin1')
        
        objects_bytes[0] = catalog
        objects_bytes[1] = pages
        
        # Construct PDF binary
        out = [b"%PDF-1.4\n"]
        offsets = [0]
        curr_offset = len(out[0])
        
        for i, obj in enumerate(objects_bytes, 1):
            offsets.append(curr_offset)
            header = f"{i} 0 obj\n".encode('latin1')
            footer = b"\nendobj\n"
            chunk = header + obj + footer
            out.append(chunk)
            curr_offset += len(chunk)
            
        xref_offset = curr_offset
        xref = [f"xref\n0 {len(objects_bytes)+1}\n0000000000 65535 f \n".encode('latin1')]
        for off in offsets[1:]:
            xref.append(f"{off:010d} 00000 n \n".encode('latin1'))
            
        trailer = (
            f"trailer\n<< /Size {len(objects_bytes)+1} /Root 1 0 R "
            f"/Info << /Title ({self.title}) /Creator (Heidy Bakery Pure Python PDF Engine) >> >>\n"
            f"startxref\n{xref_offset}\n%%EOF\n"
        ).encode('latin1')
        
        out.extend(xref)
        out.append(trailer)
        
        with open(filepath, 'wb') as f:
            f.write(b"".join(out))


def hex_to_rgb(hex_str):
    hex_str = hex_str.lstrip('#')
    if len(hex_str) == 3:
        hex_str = ''.join(c*2 for c in hex_str)
    return tuple(int(hex_str[i:i+2], 16) / 255.0 for i in (0, 2, 4))


class Page:
    def __init__(self, w=612, h=792):
        self.w = w
        self.h = h
        self.ops = []

    def op(self, s):
        self.ops.append(s.encode('latin1'))

    def set_fill(self, hex_color):
        r, g, b = hex_to_rgb(hex_color)
        self.op(f"{r:.3f} {g:.3f} {b:.3f} rg")

    def set_stroke(self, hex_color):
        r, g, b = hex_to_rgb(hex_color)
        self.op(f"{r:.3f} {g:.3f} {b:.3f} RG")

    def rect(self, x, y, w, h, fill=None, stroke=None, line_width=1):
        if fill:
            self.set_fill(fill)
            self.op(f"{x:.2f} {y:.2f} {w:.2f} {h:.2f} re f")
        if stroke:
            self.set_stroke(stroke)
            self.op(f"{line_width:.2f} w")
            self.op(f"{x:.2f} {y:.2f} {w:.2f} {h:.2f} re S")

    def round_rect(self, x, y, w, h, r=6, fill=None, stroke=None, line_width=1):
        # Approximate rounded rect with bezier curves
        k = 0.5522847498 * r
        path = (
            f"{x+r:.2f} {y:.2f} m "
            f"{x+w-r:.2f} {y:.2f} l {x+w-r+k:.2f} {y:.2f} {x+w:.2f} {y+k:.2f} {x+w:.2f} {y+r:.2f} c "
            f"{x+w:.2f} {y+h-r:.2f} l {x+w:.2f} {y+h-r+k:.2f} {x+w-r+k:.2f} {y+h:.2f} {x+w-r:.2f} {y+h:.2f} c "
            f"{x+r:.2f} {y+h:.2f} l {x+r-k:.2f} {y+h:.2f} {x:.2f} {y+h-r+k:.2f} {x:.2f} {y+h-r:.2f} c "
            f"{x:.2f} {y+r:.2f} l {x:.2f} {y+r-k:.2f} {x+r-k:.2f} {y:.2f} {x+r:.2f} {y:.2f} c h"
        )
        if fill:
            self.set_fill(fill)
            self.op(f"{path} f")
        if stroke:
            self.set_stroke(stroke)
            self.op(f"{line_width:.2f} w {path} S")

    def line(self, x1, y1, x2, y2, stroke="#DED5C9", line_width=1, dash=None):
        self.set_stroke(stroke)
        self.op(f"{line_width:.2f} w")
        if dash:
            self.op(f"[{dash}] 0 d")
        else:
            self.op("[] 0 d")
        self.op(f"{x1:.2f} {y1:.2f} m {x2:.2f} {y2:.2f} l S")
        self.op("[] 0 d")

    def circle(self, cx, cy, r, fill=None, stroke=None):
        k = 0.5522847498 * r
        path = (
            f"{cx+r:.2f} {cy:.2f} m "
            f"{cx+r:.2f} {cy+k:.2f} {cx+k:.2f} {cy+r:.2f} {cx:.2f} {cy+r:.2f} c "
            f"{cx-k:.2f} {cy+r:.2f} {cx-r:.2f} {cy+k:.2f} {cx-r:.2f} {cy:.2f} c "
            f"{cx-r:.2f} {cy-k:.2f} {cx-k:.2f} {cy-r:.2f} {cx:.2f} {cy-r:.2f} c "
            f"{cx+k:.2f} {cy-r:.2f} {cx+r:.2f} {cy-k:.2f} {cx+r:.2f} {cy:.2f} c h"
        )
        if fill:
            self.set_fill(fill)
            self.op(f"{path} f")
        if stroke:
            self.set_stroke(stroke)
            self.op(f"{path} S")

    def text(self, txt, x, y, font="F1", size=10, color="#302B27", align="left"):
        clean_txt = (
            str(txt)
            .replace("\\", "\\\\")
            .replace("(", "\\(")
            .replace(")", "\\)")
            .replace("—", "--")
            .replace("–", "-")
            .replace("•", "*")
            .replace("’", "'")
            .replace("‘", "'")
            .replace("“", '"')
            .replace("”", '"')
        )
        self.set_fill(color)
        self.op("BT")
        self.op(f"/{font} {size:.2f} Tf")
        
        # Simple alignment width approximation
        if align == "right":
            approx_w = len(clean_txt) * size * 0.52
            x = x - approx_w
        elif align == "center":
            approx_w = len(clean_txt) * size * 0.52
            x = x - (approx_w / 2)
            
        self.op(f"{x:.2f} {y:.2f} Td")
        self.op(f"({clean_txt}) Tj")
        self.op("ET")

    def wrapped_text(self, txt, x, y, width, font="F1", size=10, leading=13, color="#302B27"):
        words = txt.split()
        lines = []
        curr_line = []
        curr_len = 0
        max_chars = int(width / (size * 0.52))

        for w in words:
            if curr_len + len(w) + 1 <= max_chars:
                curr_line.append(w)
                curr_len += len(w) + 1
            else:
                lines.append(" ".join(curr_line))
                curr_line = [w]
                curr_len = len(w)
        if curr_line:
            lines.append(" ".join(curr_line))

        curr_y = y
        for l in lines:
            self.text(l, x, curr_y, font=font, size=size, color=color)
            curr_y -= leading
        return curr_y

    def get_stream(self):
        return b"\n".join(self.ops)


# --- Reusable UI Component Renderers (Vector Screenshots) ---

def draw_header_bar(page, title, page_num, total_pages=8):
    # Top brand bar
    page.rect(0, 782, 612, 10, fill="#76543C")
    page.text("Heidy's Bakery -- Complete User Guide & Troubleshooting Manual", 40, 764, font="F2", size=9, color="#76543C")
    page.text(f"Page {page_num} of {total_pages}", 572, 764, font="F1", size=9, color="#64594F", align="right")
    page.line(40, 756, 572, 756, stroke="#DED5C9", line_width=0.75)
    
    # Bottom footer
    page.line(40, 36, 572, 36, stroke="#DED5C9", line_width=0.75)
    page.text("Heidy's Bakery macOS App  *  100% Offline & Private  *  Arvind & Heidy", 40, 24, font="F1", size=8.5, color="#64594F")
    page.text("v0.1 Production Guide", 572, 24, font="F1", size=8.5, color="#64594F", align="right")


def draw_mac_window_shell(page, x, y, w, h, title="Heidy's Bakery", active_tab="prices"):
    # Window background & drop shadow
    page.round_rect(x+2, y-2, w, h, r=8, fill="#E6E0D8")
    page.round_rect(x, y, w, h, r=8, fill="#FFFDF9", stroke="#C5BCAF", line_width=1)
    
    # Title bar
    page.round_rect(x, y+h-28, w, 28, r=8, fill="#F3EEE6", stroke="#C5BCAF", line_width=1)
    page.rect(x, y+h-28, w, 10, fill="#F3EEE6") # flatten bottom corners
    page.line(x, y+h-28, x+w, y+h-28, stroke="#DED5C9", line_width=1)
    
    # Traffic lights (red, yellow, green)
    page.circle(x+14, y+h-14, 5, fill="#FF5F56")
    page.circle(x+28, y+h-14, 5, fill="#FFBD2E")
    page.circle(x+42, y+h-14, 5, fill="#27C93F")
    
    page.text(title, x+(w/2), y+h-18, font="F2", size=11, color="#302B27", align="center")
    page.text("Stored on this Mac", x+w-12, y+h-18, font="F1", size=9, color="#64594F", align="right")
    
    # Navigation bar
    nav_y = y + h - 54
    page.rect(x, nav_y, w, 26, fill="#F3EEE6")
    page.line(x, nav_y, x+w, nav_y, stroke="#DED5C9", line_width=1)
    
    tabs = [("prices", "Price list"), ("receipts", "Receipts"), ("ingredients", "Ingredients"), ("recipes", "Recipes"), ("settings", "Settings")]
    tx = x + 12
    for tid, tlabel in tabs:
        tw = len(tlabel) * 6 + 18
        if tid == active_tab:
            page.round_rect(tx, nav_y+3, tw, 20, r=4, fill="#FFFDF9", stroke="#76543C", line_width=1)
            page.text(tlabel, tx+(tw/2), nav_y+8, font="F2", size=9, color="#76543C", align="center")
        else:
            page.text(tlabel, tx+(tw/2), nav_y+8, font="F1", size=9, color="#302B27", align="center")
        tx += tw + 6
        
    return x, y, w, h - 54


# ==============================================================================
# BUILD PAGES
# ==============================================================================

def build_pdf(out_path):
    pdf = PDFEngine(title="Heidy's Bakery Guide & Troubleshooting Manual")
    
    # --------------------------------------------------------------------------
    # PAGE 1: COVER & OVERVIEW
    # --------------------------------------------------------------------------
    p1 = pdf.new_page()
    p1.rect(0, 782, 612, 10, fill="#76543C")
    
    # Hero Title Box
    p1.round_rect(40, 560, 532, 200, r=10, fill="#F3EEE6", stroke="#DED5C9", line_width=1)
    p1.text("HEIDY'S BAKERY", 60, 725, font="F2", size=13, color="#76543C")
    p1.text("Complete Visual User Guide", 60, 690, font="F2", size=26, color="#302B27")
    p1.text("& Troubleshooting Manual", 60, 660, font="F2", size=22, color="#76543C")
    p1.text("Interactive Screen Walkthroughs  *  Recipe Costing  *  Receipt OCR  *  Error Resolutions", 60, 630, font="F1", size=11, color="#64594F")
    
    # Core Principles Pills
    pills = [
        ("100% Offline & Private", "#326345", "#EAF3ED"),
        ("Selling Prices Never Auto-Change", "#76543C", "#F8EFEA"),
        ("Apple Vision On-Device OCR", "#1E5E7A", "#EAF2F6"),
        ("30-Save Undo Durability", "#6D4C41", "#F4EFEB")
    ]
    px = 60
    for ptext, pcol, pbg in pills:
        pw = len(ptext) * 5.6 + 14
        p1.round_rect(px, 580, pw, 22, r=4, fill=pbg, stroke=pcol, line_width=0.75)
        p1.text(ptext, px+(pw/2), 587, font="F2", size=8.5, color=pcol, align="center")
        px += pw + 8
        
    # Table of Contents Box
    p1.round_rect(40, 310, 532, 230, r=8, fill="#FFFDF9", stroke="#DED5C9", line_width=1)
    p1.text("MANUAL CONTENTS & ROADMAP", 58, 515, font="F2", size=11, color="#76543C")
    p1.line(58, 507, 554, 507, stroke="#DED5C9", line_width=0.5)
    
    toc_items = [
        ("Part 1: Quick Setup & Getting Started", "First launch, macOS security Gatekeeper bypass, welcome screen import.", "Page 1"),
        ("Part 2: Tab 1 -- Price List & Selling Prices", "Batch yields, cost per piece, retail & bulk margins, suggested prices.", "Page 2"),
        ("Part 3: Tab 2 -- Receipts & On-Device OCR", "iPhone shortcut capture, iCloud sync, candidate line extraction, verification.", "Page 3"),
        ("Part 4: Tab 3 & 4 -- Ingredients & Recipe Builder", "Master items, package sizes, batch vs piece lines, labor allowances.", "Page 4"),
        ("Part 5: Tab 5 -- Settings, Backups & Excel Fallback", "Markup defaults, full backup archives, 30-step undo, Excel round-trip.", "Page 5"),
        ("Part 6: Troubleshooting (Gatekeeper, Missing Costs, Units)", "Resolving security blocks, 'Missing costs' alerts, unit mismatches.", "Page 6"),
        ("Part 7: Troubleshooting (Cost Alerts, Receipts, Duplicates)", "Handling 'Cost up X%' badges, OCR matching, duplicate line combining.", "Page 7"),
        ("Part 8: Troubleshooting (Undo, Excel Reimport, Golden Rules)", "Recovering from mistakes, Excel reimport rules, operator safety checklist.", "Page 8")
    ]
    
    ty = 490
    for ttitle, tdesc, tp in toc_items:
        p1.text(ttitle, 58, ty, font="F2", size=9.5, color="#302B27")
        p1.text(tp, 554, ty, font="F2", size=9.5, color="#76543C", align="right")
        p1.text(tdesc, 58, ty-11, font="F1", size=8, color="#64594F")
        ty -= 22
        
    # Quick Start Box
    p1.round_rect(40, 50, 532, 245, r=8, fill="#F3EEE6", stroke="#DED5C9", line_width=1)
    p1.text("FIRST-TIME SETUP (FIRST 5 MINUTES)", 58, 270, font="F2", size=11, color="#76543C")
    p1.line(58, 262, 554, 262, stroke="#DED5C9", line_width=0.5)
    
    setup_steps = [
        ("1. Install to Applications", "Unzip 'Heidy Bakery Mac.zip' and drag 'Heidy Bakery.app' into your Applications folder."),
        ("2. Right-Click to Open (Gatekeeper)", "Because this is a test build, Right-Click (or Control-Click) the app in Applications and choose Open. Confirm 'Open'."),
        ("3. Import Reviewed Spreadsheet Data", "On the Welcome Screen, click 'Import reviewed spreadsheet data'. This loads all 11 recipes and 197 ingredients."),
        ("4. Set Markup Percentages in Settings", "In Settings, set Retail Markup (e.g. 50%) and Bulk Markup (e.g. 30%). Suggested prices will calculate immediately."),
        ("5. Link Your Receipt Folder", "In Settings, click 'Choose folder' and select iCloud Drive > Shortcuts > All new receipts.")
    ]
    sy = 245
    for stitle, sdesc in setup_steps:
        p1.circle(68, sy-2, 7, fill="#76543C")
        p1.text(stitle[:1], 68, sy-5, font="F2", size=8, color="#FFFFFF", align="center")
        p1.text(stitle[2:], 84, sy, font="F2", size=9.5, color="#302B27")
        p1.text(sdesc, 84, sy-11, font="F1", size=8.5, color="#64594F")
        sy -= 26
        
    draw_header_bar(p1, "Title & Overview", 1)

    # --------------------------------------------------------------------------
    # PAGE 2: TAB 1 -- PRICE LIST & SELLING PRICES
    # --------------------------------------------------------------------------
    p2 = pdf.new_page()
    draw_header_bar(p2, "Tab 1 -- Price List", 2)
    
    p2.text("TAB 1: PRICE LIST & SELLING PRICES", 40, 735, font="F2", size=16, color="#76543C")
    p2.text("Your master dashboard for product costing, retail/wholesale pricing, and profit margins.", 40, 720, font="F1", size=10, color="#64594F")
    
    # UI Vector Screenshot: Price List Tab
    wx, wy, ww, wh = draw_mac_window_shell(p2, 40, 420, 532, 285, title="Heidy's Bakery -- Price List", active_tab="prices")
    
    # Window Content
    p2.text("Price list", wx+16, wy+wh-22, font="F2", size=14, color="#302B27")
    p2.text("Your selling prices stay unchanged when costs change.", wx+16, wy+wh-34, font="F1", size=8, color="#64594F")
    
    p2.round_rect(wx+ww-160, wy+wh-32, 70, 18, r=3, fill="#FFFDF9", stroke="#DED5C9", line_width=0.75)
    p2.text("Export Excel", wx+ww-125, wy+wh-26, font="F1", size=8, color="#302B27", align="center")
    p2.round_rect(wx+ww-82, wy+wh-32, 66, 18, r=3, fill="#76543C")
    p2.text("New recipe", wx+ww-49, wy+wh-26, font="F2", size=8, color="#FFFFFF", align="center")
    
    # Filter row
    p2.round_rect(wx+16, wy+wh-58, 220, 18, r=3, fill="#FFFDF9", stroke="#DED5C9", line_width=0.75)
    p2.text("Find a recipe...", wx+22, wy+wh-52, font="F3", size=8, color="#888888")
    p2.round_rect(wx+245, wy+wh-58, 120, 18, r=3, fill="#FFFDF9", stroke="#DED5C9", line_width=0.75)
    p2.text("Show: All recipes", wx+252, wy+wh-52, font="F1", size=8, color="#302B27")
    
    # Table Header
    ty = wy + wh - 80
    p2.rect(wx+16, ty-14, ww-32, 16, fill="#F3EEE6")
    headers = [("Recipe / unit", 22, "left"), ("Yield", 120, "center"), ("Cost/pc", 160, "right"), ("Suggested", 215, "right"), ("Your Retail", 270, "right"), ("Margin", 310, "right"), ("Bulk Sug.", 360, "right"), ("Your Bulk", 410, "right"), ("Status", 480, "center")]
    for hname, hx, halign in headers:
        p2.text(hname, wx+hx, ty-10, font="F2", size=7.5, color="#302B27", align=halign)
        
    rows = [
        ("Vanilla Madeleines", "Per piece", "48", "$2.53", "$3.80", "$4.25", "40.5%", "$3.29", "$3.50", "Ready", "#326345", "#EAF3ED"),
        ("Matcha Financiers", "Per piece", "36", "$2.75", "$4.12", "$4.75", "42.1%", "$3.58", "$3.90", "Cost up 14.5%", "#A32922", "#FCEBEA"),
        ("Chestnut Tart", "Per piece", "12", "--", "--", "$5.50", "--", "--", "$4.50", "Missing costs", "#A32922", "#FCEBEA"),
        ("Almond Croissant", "Per piece", "24", "$1.95", "$2.93", "$3.75", "48.0%", "$2.54", "$3.00", "Ready", "#326345", "#EAF3ED"),
        ("Earl Grey Scone", "Per piece", "18", "$1.42", "$2.13", "$2.75", "48.4%", "$1.85", "$2.25", "Ready", "#326345", "#EAF3ED"),
        ("Chocolate Babka", "Per piece", "8", "$4.10", "$6.15", "$7.00", "41.4%", "$5.33", "$6.00", "Check dates", "#64594F", "#F3EEE6")
    ]
    ry = ty - 28
    for rtitle, runit, ryld, rcost, rsug, rret, rmar, rbsug, rbulk, rstat, scol, sbg in rows:
        p2.line(wx+16, ry+12, wx+ww-16, ry+12, stroke="#EFEBE4", line_width=0.5)
        p2.text(rtitle, wx+22, ry+2, font="F2", size=8, color="#76543C")
        p2.text(runit, wx+22, ry-7, font="F1", size=6.5, color="#888888")
        p2.text(ryld, wx+120, ry, font="F1", size=8, color="#302B27", align="center")
        p2.text(rcost, wx+160, ry, font="F1", size=8, color="#302B27", align="right")
        p2.text(rsug, wx+215, ry, font="F1", size=8, color="#64594F", align="right")
        
        # Retail input box mockup
        p2.round_rect(wx+245, ry-4, 32, 14, r=2, fill="#FFFDF9", stroke="#DED5C9", line_width=0.5)
        p2.text(rret, wx+273, ry, font="F2", size=8, color="#302B27", align="right")
        
        p2.text(rmar, wx+310, ry, font="F2", size=8, color="#326345" if rmar != "--" else "#888", align="right")
        p2.text(rbsug, wx+360, ry, font="F1", size=8, color="#64594F", align="right")
        
        # Bulk input box mockup
        p2.round_rect(wx+385, ry-4, 32, 14, r=2, fill="#FFFDF9", stroke="#DED5C9", line_width=0.5)
        p2.text(rbulk, wx+413, ry, font="F2", size=8, color="#302B27", align="right")
        
        # Status pill
        sw = len(rstat) * 4.5 + 8
        p2.round_rect(wx+480-(sw/2), ry-3, sw, 12, r=2, fill=sbg, stroke=scol, line_width=0.5)
        p2.text(rstat, wx+480, ry, font="F2", size=6.5, color=scol, align="center")
        ry -= 21

    # Explanatory Callout Cards below the UI
    cy = 405
    cards = [
        ("Understanding the Calculation Columns", [
            "Cost / piece: True batch cost divided by yield (includes all ingredients, packaging, labor, and overhead).",
            "Retail suggested: Calculated automatically as Cost x (1 + Retail Markup / 100).",
            "Your retail & Your bulk: The prices you set. Click directly in these boxes to type your selling prices.",
            "Margin: Gross profit percentage at your selling price: (Price - Cost) / Price x 100."
        ]),
        ("The Selling Price Stability Rule", [
            "Your selling prices NEVER change automatically when you approve new receipts or when ingredients rise.",
            "If egg or butter prices spike, the app updates the suggested price and displays a 'Cost up X%' badge.",
            "You remain in complete control: you can raise your price, keep it the same, or reset the review alert."
        ]),
        ("Interpreting the Review Status Badges", [
            "Ready (Green): All ingredient prices are complete and purchase dates are fresh.",
            "Missing costs (Red): One or more ingredients lack a package price or quantity. Suggested prices are disabled.",
            "Cost up X% (Red): Ingredient costs rose by more than your alert threshold (e.g. 10%). Review and clear in Recipes.",
            "Check dates (Gray): An ingredient purchase date is older than your stale threshold (e.g. 365 days)."
        ])
    ]
    for ctitle, cpoints in cards:
        p2.round_rect(40, cy-75, 532, 72, r=6, fill="#FFFDF9", stroke="#DED5C9", line_width=1)
        p2.text(ctitle, 54, cy-14, font="F2", size=9.5, color="#76543C")
        p2.line(54, cy-18, 558, cy-18, stroke="#EFEBE4", line_width=0.5)
        py = cy - 29
        for pt in cpoints:
            p2.circle(60, py+2, 2, fill="#76543C")
            p2.text(pt, 68, py, font="F1", size=8, color="#302B27")
            py -= 11
        cy -= 84

    # --------------------------------------------------------------------------
    # PAGE 3: TAB 2 -- RECEIPTS & ON-DEVICE OCR
    # --------------------------------------------------------------------------
    p3 = pdf.new_page()
    draw_header_bar(p3, "Tab 2 -- Receipts & OCR", 3)
    
    p3.text("TAB 2: RECEIPTS & ON-DEVICE OCR WORKFLOW", 40, 735, font="F2", size=16, color="#76543C")
    p3.text("How to photograph receipts on iPhone, sync via iCloud, and verify price updates.", 40, 720, font="F1", size=10, color="#64594F")
    
    # UI Vector Screenshot: Receipts Tab Split View
    wx, wy, ww, wh = draw_mac_window_shell(p3, 40, 430, 532, 275, title="Heidy's Bakery -- Receipts", active_tab="receipts")
    
    # Left column: Receipt Preview Mockup
    lw = 200
    p3.round_rect(wx+14, wy+12, lw, wh-24, r=4, fill="#F3EEE6", stroke="#DED5C9", line_width=0.5)
    p3.text("Original Receipt (Costco)", wx+24, wy+wh-24, font="F2", size=9, color="#302B27")
    p3.round_rect(wx+lw-60, wy+wh-30, 50, 16, r=2, fill="#FFFDF9", stroke="#DED5C9", line_width=0.5)
    p3.text("Open in Preview", wx+lw-35, wy+wh-25, font="F1", size=6.5, color="#76543C", align="center")
    
    # Simulated Receipt Paper
    p3.round_rect(wx+24, wy+24, lw-20, wh-62, r=2, fill="#FFFFFF", stroke="#D5CEC3", line_width=0.5)
    p3.text("COSTCO WHOLESALE", wx+24+(lw-20)/2, wy+wh-50, font="F2", size=8, color="#302B27", align="center")
    p3.text("09/05/2026 14:32", wx+24+(lw-20)/2, wy+wh-60, font="F1", size=6, color="#888888", align="center")
    p3.line(wx+30, wy+wh-66, wx+lw-6, wy+wh-66, stroke="#CCCCCC", line_width=0.5, dash="2,2")
    
    receipt_lines = [
        ("KS ORG EGGS 5DZ", "14.99 A"),
        ("KS UNSALTED BUTTER 4LB", "13.49 A"),
        ("ORG CANE SUGAR 10LB", "9.89 A"),
        ("ALL PURP FLOUR 25LB", "12.50 A"),
        ("KS PURE VANILLA 16OZ", "28.99 A"),
        ("SUBTOTAL", "79.86"),
        ("TOTAL", "$79.86")
    ]
    rly = wy + wh - 78
    for rl_desc, rl_pr in receipt_lines:
        font_style = "F2" if "TOTAL" in rl_desc else "F1"
        p3.text(rl_desc, wx+32, rly, font=font_style, size=6.5, color="#302B27")
        p3.text(rl_pr, wx+lw-12, rly, font=font_style, size=6.5, color="#302B27", align="right")
        rly -= 12
        
    # Right column: Verification & Line Matcher
    rx = wx + lw + 24
    rw = ww - lw - 38
    p3.text("Costco Wholesale", rx, wy+wh-22, font="F2", size=13, color="#302B27")
    p3.round_rect(rx+rw-80, wy+wh-26, 75, 16, r=3, fill="#FFF0CE", stroke="#E0C068", line_width=0.5)
    p3.text("Status: Needs review", rx+rw-42, wy+wh-21, font="F2", size=7, color="#76543C", align="center")
    
    # Store and Date Inputs
    p3.text("Retailer:", rx, wy+wh-46, font="F2", size=8, color="#302B27")
    p3.round_rect(rx+45, wy+wh-52, 100, 16, r=2, fill="#FFFDF9", stroke="#DED5C9", line_width=0.5)
    p3.text("Costco Wholesale", rx+50, wy+wh-47, font="F1", size=7.5, color="#302B27")
    
    p3.text("Date:", rx+160, wy+wh-46, font="F2", size=8, color="#302B27")
    p3.round_rect(rx+190, wy+wh-52, 75, 16, r=2, fill="#FFFDF9", stroke="#DED5C9", line_width=0.5)
    p3.text("2026-09-05", rx+195, wy+wh-47, font="F1", size=7.5, color="#302B27")
    
    # Action buttons
    p3.round_rect(rx, wy+wh-76, 95, 16, r=2, fill="#FFFDF9", stroke="#DED5C9", line_width=0.5)
    p3.text("Add purchase manual", rx+47, wy+wh-71, font="F1", size=7, color="#302B27", align="center")
    p3.round_rect(rx+105, wy+wh-76, 95, 16, r=2, fill="#FFFDF9", stroke="#DED5C9", line_width=0.5)
    p3.text("Find candidate lines", rx+152, wy+wh-71, font="F2", size=7, color="#76543C", align="center")
    
    # Extracted Purchases Table
    p3.text("Verified Purchases (3 lines):", rx, wy+wh-94, font="F2", size=8.5, color="#76543C")
    ply = wy + wh - 108
    plines = [
        ("KS ORG EGGS 5DZ", "Organic Eggs", "$14.99 paid", "60 each", "$0.2498 / each"),
        ("KS UNSALTED BUTTER 4LB", "Unsalted Butter", "$13.49 paid", "1,814.37 g", "$0.0074 / g"),
        ("ORG CANE SUGAR 10LB", "Granulated Cane Sugar", "$9.89 paid", "4,535.92 g", "$0.0022 / g")
    ]
    for pdesc, ping, pprice, pqty, pcost in plines:
        p3.round_rect(rx, ply-16, rw, 22, r=2, fill="#FFFDF9", stroke="#DED5C9", line_width=0.5)
        p3.text(pdesc, rx+6, ply-4, font="F2", size=7.5, color="#302B27")
        p3.text(f"Matched: {ping}", rx+6, ply-13, font="F1", size=6.5, color="#76543C")
        p3.text(f"{pprice} / {pqty}  ->  {pcost}", rx+rw-35, ply-8, font="F2", size=7, color="#326345", align="right")
        p3.round_rect(rx+rw-28, ply-14, 24, 14, r=2, fill="#F3EEE6", stroke="#DED5C9", line_width=0.5)
        p3.text("Edit", rx+rw-16, ply-9, font="F1", size=6.5, color="#302B27", align="center")
        ply -= 26
        
    # Big Approval Button
    p3.round_rect(rx, wy+12, 130, 24, r=3, fill="#76543C")
    p3.text("Approve price updates", rx+65, wy+22, font="F2", size=9, color="#FFFFFF", align="center")
    p3.round_rect(rx+140, wy+12, 110, 24, r=3, fill="#FFFDF9", stroke="#DED5C9", line_width=0.75)
    p3.text("Archive without updates", rx+195, wy+22, font="F1", size=8, color="#64594F", align="center")

    # Step-by-Step Instructions Below UI
    p3.round_rect(40, 50, 532, 365, r=8, fill="#FFFDF9", stroke="#DED5C9", line_width=1)
    p3.text("THE 4-STEP EVERYDAY RECEIPT ROUTINE", 58, 395, font="F2", size=11, color="#76543C")
    p3.line(58, 387, 554, 387, stroke="#DED5C9", line_width=0.5)
    
    r_steps = [
        ("Step 1: Snap with iPhone", "On your iPhone, tap the shortcut 'Save Bakery Receipt' and photograph the receipt. iCloud automatically syncs it to your Mac in the background."),
        ("Step 2: Check Folder in Mac App", "On your Mac, open Receipts > Check receipt folder. The app imports new photos, skips duplicates via SHA-256 hash, and reads the text."),
        ("Step 3: Find Candidate Lines", "Select the receipt, confirm Retailer and Purchase Date. Click 'Find candidate lines'. The app detects item lines and suggests previous matches."),
        ("Step 4: Verify Quantity & Unit Rules", "Click Edit on each purchase. Confirm total price paid, package quantity, and unit. CRITICAL RULE: For count items, enter the total piece count (e.g. 60 eggs = 60 each, NOT 1 flat). For weight, enter total grams (e.g. 2 x 1kg = 2000 g)."),
        ("Step 5: Approve Price Updates", "Click Approve price updates. Master ingredient unit costs update instantly, and suggested prices recalculate. Older receipts are safely logged in history without replacing newer prices.")
    ]
    sy = 368
    for stitle, sdesc in r_steps:
        p3.circle(68, sy-2, 8, fill="#76543C")
        p3.text(str(r_steps.index((stitle, sdesc))+1), 68, sy-6, font="F2", size=9, color="#FFFFFF", align="center")
        p3.text(stitle, 86, sy+1, font="F2", size=9.5, color="#302B27")
        sy = p3.wrapped_text(sdesc, 86, sy-11, 460, font="F1", size=8.5, leading=12, color="#64594F")
        sy -= 8

    # --------------------------------------------------------------------------
    # PAGE 4: TAB 3 & TAB 4 -- INGREDIENTS & RECIPE BUILDER
    # --------------------------------------------------------------------------
    p4 = pdf.new_page()
    draw_header_bar(p4, "Tabs 3 & 4 -- Ingredients & Recipes", 4)
    
    p4.text("TABS 3 & 4: INGREDIENTS CATALOG & RECIPE BUILDER", 40, 735, font="F2", size=16, color="#76543C")
    p4.text("Managing your master ingredients catalog and configuring true batch recipe costs.", 40, 720, font="F1", size=10, color="#64594F")
    
    # Top Half: Recipe Detail UI (Vanilla Madeleines)
    wx, wy, ww, wh = draw_mac_window_shell(p4, 40, 425, 532, 280, title="Heidy's Bakery -- Recipes Tab", active_tab="recipes")
    
    p4.text("Vanilla Madeleines", wx+16, wy+wh-22, font="F2", size=13, color="#302B27")
    p4.round_rect(wx+ww-190, wy+wh-28, 85, 18, r=2, fill="#FFFDF9", stroke="#DED5C9", line_width=0.5)
    p4.text("Edit recipe details", wx+ww-148, wy+wh-23, font="F1", size=7.5, color="#302B27", align="center")
    p4.round_rect(wx+ww-98, wy+wh-28, 85, 18, r=2, fill="#FFFDF9", stroke="#DED5C9", line_width=0.5)
    p4.text("Make a copy", wx+ww-56, wy+wh-23, font="F1", size=7.5, color="#302B27", align="center")
    
    # 4 Metric Cards
    cards_data = [
        ("Batch yield", "48 pieces"),
        ("Labour hours", "1.5 hrs x $24"),
        ("Other batch costs", "$1.20"),
        ("Cost per piece", "$2.5324")
    ]
    cx = wx + 16
    cw = (ww - 32 - 24) / 4
    for clabel, cval in cards_data:
        p4.round_rect(cx, wy+wh-64, cw, 30, r=4, fill="#F3EEE6", stroke="#DED5C9", line_width=0.5)
        p4.text(clabel, cx+8, wy+wh-44, font="F1", size=6.5, color="#64594F")
        p4.text(cval, cx+8, wy+wh-58, font="F2", size=9.5, color="#76543C" if "Cost" in clabel else "#302B27")
        cx += cw + 8
        
    # Table of Recipe Lines
    p4.text("Ingredients and Packaging per Batch (48 pieces):", wx+16, wy+wh-78, font="F2", size=8.5, color="#302B27")
    ly = wy + wh - 92
    p4.rect(wx+16, ly-12, ww-32, 14, fill="#F3EEE6")
    p4.text("Item Name", wx+22, ly-9, font="F2", size=7, color="#302B27")
    p4.text("Quantity & Unit", wx+160, ly-9, font="F2", size=7, color="#302B27")
    p4.text("Basis", wx+260, ly-9, font="F2", size=7, color="#302B27")
    p4.text("Cost / Source Unit", wx+350, ly-9, font="F2", size=7, color="#302B27", align="right")
    p4.text("Batch Cost", wx+ww-24, ly-9, font="F2", size=7, color="#302B27", align="right")
    
    rls = [
        ("Unsalted Butter", "250 g", "Per batch", "$0.00744 / g", "$1.86"),
        ("Granulated Sugar", "200 g", "Per batch", "$0.00218 / g", "$0.44"),
        ("Pastry Flour", "250 g", "Per batch", "$0.00110 / g", "$0.28"),
        ("Organic Large Eggs", "4 each", "Per batch", "$0.24983 / each", "$1.00"),
        ("Pure Vanilla Extract", "15 ml", "Per batch", "$0.06126 / ml", "$0.92"),
        ("Pastry Box / Packaging", "1 each", "Per piece x 48", "$0.45000 / each", "$21.60")
    ]
    rly = ly - 22
    for iname, iqty, ibasis, icost, itot in rls:
        p4.line(wx+16, rly+10, wx+ww-16, rly+10, stroke="#EFEBE4", line_width=0.5)
        p4.text(iname, wx+22, rly+1, font="F2", size=7.5, color="#76543C")
        p4.text(iqty, wx+160, rly+1, font="F1", size=7.5, color="#302B27")
        p4.text(ibasis, wx+260, rly+1, font="F1", size=7, color="#64594F")
        p4.text(icost, wx+350, rly+1, font="F1", size=7.5, color="#302B27", align="right")
        p4.text(itot, wx+ww-24, rly+1, font="F2", size=7.5, color="#326345", align="right")
        rly -= 15

    # Bottom Half: Ingredients Catalog & Recipe Explanations
    p4.round_rect(40, 50, 532, 355, r=8, fill="#FFFDF9", stroke="#DED5C9", line_width=1)
    p4.text("HOW TO MASTER INGREDIENTS & RECIPES", 58, 385, font="F2", size=11, color="#76543C")
    p4.line(58, 377, 554, 377, stroke="#DED5C9", line_width=0.5)
    
    guide_sections = [
        ("1. Managing Ingredients & Package Sizes", [
            "Always enter the total package price paid and total size contained in that package.",
            "Unit cost = Package Price / Package Size. The app calculates this down to 5 decimal places.",
            "Click 'Edit / history' on any ingredient to see its full timeline of past prices, stores, and receipt links.",
            "Never guess an unknown price: leave it blank. Blank prices trigger safety alerts; they are never treated as $0."
        ]),
        ("2. Per-Batch vs. Per-Piece Recipe Lines", [
            "Per batch: The quantity applies to the entire baking batch (e.g. 250g flour for 48 madeleines).",
            "Per piece: The quantity applies to each individual piece and is multiplied by yield (e.g. 1 individual packaging box or sticker per piece x 48 yield = 48 boxes per batch).",
            "This distinction ensures your packaging costs scale accurately when batch sizes change."
        ]),
        ("3. Changing Yield vs. Recipe Scaling", [
            "Changing the batch yield in 'Edit recipe details' changes how the batch cost is divided per piece.",
            "It does NOT automatically double or half your ingredient quantities.",
            "To test a new recipe variation, click 'Make a copy'. The duplicate receives a new ID and clears selling prices."
        ]),
        ("4. Wholesale / Bulk Overrides (Optional)", [
            "In 'Edit recipe details', open 'Different bulk costs' to set separate bulk packaging per piece or bulk labor hours.",
            "If left blank, the app uses standard recipe packaging and labor for wholesale calculations."
        ])
    ]
    gy = 358
    for gtitle, gpoints in guide_sections:
        p4.text(gtitle, 58, gy, font="F2", size=9.5, color="#76543C")
        gy -= 13
        for pt in gpoints:
            p4.circle(68, gy+2, 2, fill="#76543C")
            p4.text(pt, 76, gy, font="F1", size=8, color="#302B27")
            gy -= 11
        gy -= 6

    # --------------------------------------------------------------------------
    # PAGE 5: TAB 5 -- SETTINGS, BACKUPS & EXCEL FALLBACK
    # --------------------------------------------------------------------------
    p5 = pdf.new_page()
    draw_header_bar(p5, "Tab 5 -- Settings & Safety", 5)
    
    p5.text("TAB 5: SETTINGS, BACKUPS & EXCEL FALLBACK", 40, 735, font="F2", size=16, color="#76543C")
    p5.text("Configuring costing defaults, full backup archives, 30-step undo, and Excel portability.", 40, 720, font="F1", size=10, color="#64594F")
    
    # UI Vector Screenshot: Settings Tab
    wx, wy, ww, wh = draw_mac_window_shell(p5, 40, 430, 532, 275, title="Heidy's Bakery -- Settings", active_tab="settings")
    
    p5.text("Settings", wx+16, wy+wh-22, font="F2", size=14, color="#302B27")
    p5.text("Shared costing defaults and your local records.", wx+16, wy+wh-34, font="F1", size=8, color="#64594F")
    
    # Left pane: Costing Defaults
    pw = (ww - 40) / 2
    p5.round_rect(wx+14, wy+12, pw, wh-56, r=4, fill="#F3EEE6", stroke="#DED5C9", line_width=0.5)
    p5.text("Pricing & Cost Alerts", wx+24, wy+wh-72, font="F2", size=9.5, color="#76543C")
    
    s_fields = [
        ("Labour rate ($ / hour):", "$24.00"),
        ("Retail markup (%):", "50.0%"),
        ("Bulk markup (%):", "30.0%"),
        ("Cost increase alert (%):", "10.0%"),
        ("Review prices after (days):", "365 days")
    ]
    sfy = wy + wh - 92
    for sflabel, sfval in s_fields:
        p5.text(sflabel, wx+24, sfy, font="F1", size=8, color="#302B27")
        p5.round_rect(wx+pw-55, sfy-4, 60, 14, r=2, fill="#FFFDF9", stroke="#DED5C9", line_width=0.5)
        p5.text(sfval, wx+pw-6, sfy, font="F2", size=7.5, color="#302B27", align="right")
        sfy -= 22
        
    p5.round_rect(wx+24, wy+22, 90, 18, r=3, fill="#76543C")
    p5.text("Save settings", wx+69, wy+28, font="F2", size=8, color="#FFFFFF", align="center")
    
    # Right pane: Backups, Undo & Excel
    rx = wx + pw + 26
    p5.round_rect(rx, wy+12, pw, wh-56, r=4, fill="#F3EEE6", stroke="#DED5C9", line_width=0.5)
    p5.text("Backups, Undo & Excel Fallback", rx+10, wy+wh-72, font="F2", size=9.5, color="#76543C")
    
    # Action buttons inside right pane
    p5.text("Safety & Rollback:", rx+10, wy+wh-90, font="F2", size=8, color="#302B27")
    p5.round_rect(rx+10, wy+wh-112, 105, 18, r=2, fill="#FFFDF9", stroke="#DED5C9", line_width=0.5)
    p5.text("Save full backup", rx+62, wy+wh-106, font="F2", size=7.5, color="#76543C", align="center")
    p5.round_rect(rx+125, wy+wh-112, 105, 18, r=2, fill="#FFFDF9", stroke="#DED5C9", line_width=0.5)
    p5.text("Restore backup", rx+177, wy+wh-106, font="F1", size=7.5, color="#302B27", align="center")
    
    p5.round_rect(rx+10, wy+wh-136, 150, 18, r=2, fill="#FFF0CE", stroke="#E0C068", line_width=0.5)
    p5.text("Undo last saved change (Cmd+Z)", rx+85, wy+wh-130, font="F2", size=7.5, color="#76543C", align="center")
    
    p5.line(rx+10, wy+wh-146, rx+pw-10, wy+wh-146, stroke="#DED5C9", line_width=0.5)
    
    p5.text("Excel Portability:", rx+10, wy+wh-162, font="F2", size=8, color="#302B27")
    p5.round_rect(rx+10, wy+wh-184, 105, 18, r=2, fill="#FFFDF9", stroke="#DED5C9", line_width=0.5)
    p5.text("Export all to Excel", rx+62, wy+wh-178, font="F1", size=7.5, color="#302B27", align="center")
    p5.round_rect(rx+125, wy+wh-184, 105, 18, r=2, fill="#FFFDF9", stroke="#DED5C9", line_width=0.5)
    p5.text("Review Excel import", rx+177, wy+wh-178, font="F1", size=7.5, color="#302B27", align="center")

    # Safety & Best Practices Guide below UI
    p5.round_rect(40, 50, 532, 365, r=8, fill="#FFFDF9", stroke="#DED5C9", line_width=1)
    p5.text("SAFETY, UNDO, BACKUPS & EXCEL PORTABILITY", 58, 395, font="F2", size=11, color="#76543C")
    p5.line(58, 387, 554, 387, stroke="#DED5C9", line_width=0.5)
    
    settings_cards = [
        ("1. The 30-Step Instant Undo Safety Net", [
            "Made a mistake? Deleted a recipe by accident? Approved a receipt with wrong numbers?",
            "Click 'Undo last saved change' or press Cmd+Z. The app immediately reverts to the exact state before your save.",
            "The SQLite database retains the last 30 saves in an encrypted rollback history stack.",
            "Undoing changes NEVER deletes your scanned original receipt photos or PDFs."
        ]),
        ("2. Full Backup (.heidybackup) vs. Excel Export", [
            "A Full Backup bundles your database and ALL high-resolution original receipt files into a single archive.",
            "Save a full backup to iCloud Drive or an external USB drive once a week.",
            "An Excel export (.xlsx) contains editable inputs and formulas for independent recalculation, but it does NOT contain original receipt images or audit logs."
        ]),
        ("3. Excel Export & Safe Reimport Rules", [
            "Export all to Excel creates a workbook with live formulas (SUMIF, IF, OR) that calculate in Microsoft Excel.",
            "Reimporting accepts this app's template only: Keep record IDs and sheet headers unchanged.",
            "Enter values, not formulas, into editable columns (Ingredients, Recipes, Lines, Settings).",
            "The app validates all units and displays a change preview before applying any edits."
        ]),
        ("4. Local Database Location on Your Mac", [
            "Your live database is stored at: ~/Library/Application Support/Heidy Bakery/Bakery.sqlite",
            "Click 'Show local data folder' in Settings to view this folder directly in Finder.",
            "DO NOT drag the live database file into iCloud. Use 'Save full backup' instead."
        ])
    ]
    sy = 368
    for stitle, spoints in settings_cards:
        p5.text(stitle, 58, sy, font="F2", size=9.5, color="#76543C")
        sy -= 13
        for pt in spoints:
            p5.circle(68, sy+2, 2, fill="#76543C")
            p5.text(pt, 76, sy, font="F1", size=8, color="#302B27")
            sy -= 11
        sy -= 7

    # --------------------------------------------------------------------------
    # PAGE 6: TROUBLESHOOTING PART 1 (GATEKEEPER, MISSING COSTS, UNITS)
    # --------------------------------------------------------------------------
    p6 = pdf.new_page()
    draw_header_bar(p6, "Troubleshooting -- Part 1", 6)
    
    p6.text("TROUBLESHOOTING: HOW TO FIX ANY ERROR (PART 1)", 40, 735, font="F2", size=16, color="#A32922")
    p6.text("Step-by-step diagnostic and resolution cards for installation and costing issues.", 40, 720, font="F1", size=10, color="#64594F")
    
    # Error Card 1: Gatekeeper
    ey = 705
    errors_p6 = [
        (
            "ERROR 1: macOS Security Warning on First Launch",
            "Heidy Bakery cannot be opened because Apple cannot check it for malicious software.",
            "#A32922", "#FCEBEA",
            "Why this happens:",
            "This is an internal test build built specifically for your Mac, rather than an application distributed through the commercial Apple App Store. macOS Gatekeeper quarantines downloaded test apps by default.",
            "Exact Step-by-Step Fix:",
            [
                "1. DO NOT change or disable your Mac's global security settings.",
                "2. Open Finder and go to your Applications folder.",
                "3. Right-Click (or hold the Control key and click) on Heidy Bakery.app.",
                "4. Select 'Open' from the top of the contextual menu.",
                "5. A system dialog will appear: click the 'Open' button.",
                "6. macOS will permanently remember this approval. Future launches will open normally."
            ]
        ),
        (
            "ERROR 2: 'Missing costs' / 'Complete these costs before using suggested prices'",
            "Chestnut: Missing purchase price, size or unit  *  Recipe shows 'Missing costs' badge",
            "#A32922", "#FCEBEA",
            "Why this happens:",
            "An ingredient in this recipe lacks a package purchase price, total package quantity, or unit (e.g. Chestnut puree in the seed data). The app strictly refuses to assume an item is free.",
            "Exact Step-by-Step Fix:",
            [
                "1. Open the recipe in the Recipes tab and look at the ingredient table.",
                "2. The missing item will be flagged in red (e.g. 'Missing purchase price, size or unit').",
                "3. Click the ingredient name link to open its details directly.",
                "4. Enter the Package Price (e.g. $8.50) and Total Quantity in Package (e.g. 500 g).",
                "5. Click Save. The recipe cost, suggested retail, and profit margins will calculate immediately."
            ]
        ),
        (
            "ERROR 3: 'Units do not match' / Incompatible Unit Conversion",
            "Flour: Units do not match (Cannot convert grams to milliliters or count to weight)",
            "#A32922", "#FCEBEA",
            "Why this happens:",
            "A recipe line requests a unit in a different dimension than the purchased item (e.g. recipe specifies 250 ml of flour, but flour is purchased in grams or lbs). Because density varies by ingredient, conversion cannot be guessed.",
            "Exact Step-by-Step Fix:",
            [
                "1. In the recipe's ingredient list, click 'Edit' next to the flagged row.",
                "2. Check the Unit field. Supported compatible conversions are:",
                "   - Mass: g <-> kg <-> oz <-> lb",
                "   - Volume: ml <-> l <-> tsp <-> tbsp <-> fl oz <-> cup",
                "   - Count: each <-> piece <-> dozen",
                "3. Change the unit to match the ingredient's dimension (e.g. change ml to g).",
                "4. Enter the correct quantity in that unit and click Save."
            ]
        )
    ]
    
    for etitle, ebadge, bcol, bbg, ctitle, cdesc, stitle, ssteps in errors_p6:
        card_h = 195 if len(ssteps) > 5 else 175
        p6.round_rect(40, ey-card_h, 532, card_h, r=6, fill="#FFFDF9", stroke="#DED5C9", line_width=1)
        
        # Header strip
        p6.rect(40, ey-24, 532, 24, fill="#F3EEE6")
        p6.text(etitle, 54, ey-16, font="F2", size=9.5, color="#A32922")
        
        # Error badge
        bw = len(ebadge) * 4.8 + 12
        p6.round_rect(54, ey-44, bw, 15, r=2, fill=bbg, stroke=bcol, line_width=0.5)
        p6.text(ebadge, 60, ey-39, font="F2", size=7.5, color=bcol)
        
        # Cause
        p6.text(ctitle, 54, ey-56, font="F2", size=8, color="#76543C")
        cy = p6.wrapped_text(cdesc, 54, ey-68, 504, font="F1", size=8, leading=11, color="#302B27")
        
        # Solution
        p6.text(stitle, 54, cy-8, font="F2", size=8, color="#326345")
        sy = cy - 19
        for s in ssteps:
            p6.text(s, 54, sy, font="F1", size=7.8, color="#302B27")
            sy -= 10.5
            
        ey -= card_h + 12

    # --------------------------------------------------------------------------
    # PAGE 7: TROUBLESHOOTING PART 2 (ALERTS, RECEIPTS, DUPLICATES)
    # --------------------------------------------------------------------------
    p7 = pdf.new_page()
    draw_header_bar(p7, "Troubleshooting -- Part 2", 7)
    
    p7.text("TROUBLESHOOTING: HOW TO FIX ANY ERROR (PART 2)", 40, 735, font="F2", size=16, color="#A32922")
    p7.text("Resolving cost alert warnings, receipt scanning issues, and duplicate items.", 40, 720, font="F1", size=10, color="#64594F")
    
    ey = 705
    errors_p7 = [
        (
            "ERROR 4: 'Cost up X%' Alert Badge on Price List",
            "Matcha Financiers: Cost up 14.5%  *  Alert threshold exceeded",
            "#A32922", "#FCEBEA",
            "Why this happens:",
            "A recently approved receipt updated an ingredient price, causing the recipe's batch cost to rise above your alert threshold (e.g. 10%). Your selling prices have NOT changed.",
            "Exact Step-by-Step Fix:",
            [
                "1. On the Price list tab, click the recipe name link (e.g. Matcha Financiers).",
                "2. Review the new Cost per piece against your current selling price.",
                "3. Decide whether to adjust your retail or bulk selling price on the Price list tab.",
                "4. At the bottom of the recipe detail page, click 'Mark cost change as reviewed'.",
                "5. This establishes the new cost as your baseline and immediately clears the warning badge."
            ]
        ),
        (
            "ERROR 5: 'No receipts showing up after checking receipt folder'",
            "Folder empty or 'Choose your receipt folder in Settings first'",
            "#76543C", "#FFF0CE",
            "Why this happens:",
            "Either no folder has been chosen in Settings, the iPhone shortcut has not finished syncing via iCloud Drive, or the photos have not yet downloaded locally to your Mac.",
            "Exact Step-by-Step Fix:",
            [
                "1. Go to Settings and verify that Receipt folder displays a valid path.",
                "2. If blank, click 'Choose folder' and select iCloud Drive > Shortcuts > All new receipts.",
                "3. In Finder, open that folder and verify that the photo or PDF has a cloud icon indicating it is downloaded.",
                "4. If a cloud icon appears next to the file, double-click it once in Finder to download it.",
                "5. Return to the app and click 'Check receipt folder' again. You can also use 'Add photos / PDFs' to select directly."
            ]
        ),
        (
            "ERROR 6: 'Combine repeated purchases before approving'",
            "Combine repeated purchases of [Item] before approving receipt",
            "#A32922", "#FCEBEA",
            "Why this happens:",
            "The receipt line extractor created two separate lines matched to the same ingredient (e.g. buying two bags of flour scanned as two separate line items).",
            "Exact Step-by-Step Fix:",
            [
                "1. In the receipt purchase list, locate the duplicate matched items.",
                "2. Click 'Edit' on the second line and check 'Remove this purchase line'. Save.",
                "3. Click 'Edit' on the first line and update the Total quantity and Paid price to represent both items combined.",
                "4. Example: Two 1 kg bags at $3.25 each -> enter Paid price $6.50, Total quantity 2000 g.",
                "5. Click 'Approve price updates' once all items are unique."
            ]
        ),
        (
            "ERROR 7: 'Confirm a zero-cost purchase'",
            "Confirm purchase price, total package quantity and unit for [Item]",
            "#A32922", "#FCEBEA",
            "Why this happens:",
            "A receipt line has a price of $0.00. To prevent typos or partial OCR reads from corrupting recipe costs with accidental free items, the app requires explicit operator confirmation.",
            "Exact Step-by-Step Fix:",
            [
                "1. Click 'Edit' on the purchase line with $0.00.",
                "2. If you actually paid money, enter the correct price paid.",
                "3. If the item was genuinely free (promotional gift / free sample), check:",
                "   [x] 'I confirm this purchase was free (only for a $0 price)'.",
                "4. Click Save and proceed to approve the receipt."
            ]
        )
    ]
    
    for etitle, ebadge, bcol, bbg, ctitle, cdesc, stitle, ssteps in errors_p7:
        card_h = 145
        p7.round_rect(40, ey-card_h, 532, card_h, r=6, fill="#FFFDF9", stroke="#DED5C9", line_width=1)
        
        p7.rect(40, ey-22, 532, 22, fill="#F3EEE6")
        p7.text(etitle, 54, ey-15, font="F2", size=9, color="#A32922" if "ERROR" in etitle else "#76543C")
        
        bw = len(ebadge) * 4.8 + 12
        p7.round_rect(54, ey-39, bw, 13, r=2, fill=bbg, stroke=bcol, line_width=0.5)
        p7.text(ebadge, 60, ey-35, font="F2", size=7, color=bcol)
        
        p7.text(ctitle, 54, ey-49, font="F2", size=7.5, color="#76543C")
        cy = p7.wrapped_text(cdesc, 54, ey-59, 504, font="F1", size=7.5, leading=10, color="#302B27")
        
        p7.text(stitle, 54, cy-6, font="F2", size=7.5, color="#326345")
        sy = cy - 16
        for s in ssteps:
            p7.text(s, 54, sy, font="F1", size=7.2, color="#302B27")
            sy -= 9.5
            
        ey -= card_h + 10

    # --------------------------------------------------------------------------
    # PAGE 8: TROUBLESHOOTING PART 3 (UNDO, EXCEL REIMPORT, GOLDEN RULES)
    # --------------------------------------------------------------------------
    p8 = pdf.new_page()
    draw_header_bar(p8, "Troubleshooting -- Part 3 & Rules", 8)
    
    p8.text("TROUBLESHOOTING: ACCIDENTS, EXCEL & GOLDEN RULES", 40, 735, font="F2", size=16, color="#A32922")
    p8.text("Recovering from mistakes, Excel reimport rules, and the 5 golden rules for operators.", 40, 720, font="F1", size=10, color="#64594F")
    
    ey = 705
    errors_p8 = [
        (
            "ERROR 8: Accidental Recipe Deletion or Erroneous Receipt Approval",
            "How to use instant 30-step undo to restore your data safely",
            "#326345", "#EAF3ED",
            "Why this happens:",
            "You accidentally clicked Delete on a recipe, edited quantities with wrong numbers, or approved a receipt with inaccurate package sizes.",
            "Exact Step-by-Step Fix:",
            [
                "1. DO NOT PANIC: Your data is never immediately lost.",
                "2. Go to Settings > 'Undo last saved change' (or press Cmd+Z on your keyboard).",
                "3. The app will confirm restoring the state prior to your most recent save.",
                "4. Click 'Undo change'. All records revert immediately to their previous state.",
                "5. You can repeat this up to 30 consecutive saves into the past.",
                "6. Note: Undoing database changes never deletes your original receipt photos or PDFs."
            ]
        ),
        (
            "ERROR 9: Excel Reimport Rejected / Template Mismatch",
            "The sheet does not match the app's export template / Input formulas not supported",
            "#A32922", "#FCEBEA",
            "Why this happens:",
            "An exported Excel workbook was edited, but sheet names were renamed, column headers were moved, record IDs were deleted, or formulas were entered into input columns.",
            "Exact Step-by-Step Fix:",
            [
                "1. Reimport accepts workbooks generated by Heidy Bakery only. Keep IDs and headers unchanged.",
                "2. Enter static values (numbers or text) into input sheets: Ingredients, Recipes, Lines, Settings.",
                "3. DO NOT enter custom Excel formulas into input columns; replace formulas with static values before reimporting.",
                "4. When importing, the app shows a summary modal showing exact counts of modified items.",
                "5. Review the preview and click 'Apply reviewed import'."
            ]
        )
    ]
    
    for etitle, ebadge, bcol, bbg, ctitle, cdesc, stitle, ssteps in errors_p8:
        card_h = 175
        p8.round_rect(40, ey-card_h, 532, card_h, r=6, fill="#FFFDF9", stroke="#DED5C9", line_width=1)
        
        p8.rect(40, ey-22, 532, 22, fill="#F3EEE6")
        p8.text(etitle, 54, ey-15, font="F2", size=9, color="#A32922" if "ERROR 9" in etitle else "#76543C")
        
        bw = len(ebadge) * 4.8 + 12
        p8.round_rect(54, ey-39, bw, 13, r=2, fill=bbg, stroke=bcol, line_width=0.5)
        p8.text(ebadge, 60, ey-35, font="F2", size=7, color=bcol)
        
        p8.text(ctitle, 54, ey-49, font="F2", size=7.5, color="#76543C")
        cy = p8.wrapped_text(cdesc, 54, ey-59, 504, font="F1", size=7.5, leading=10, color="#302B27")
        
        p8.text(stitle, 54, cy-6, font="F2", size=7.5, color="#326345")
        sy = cy - 16
        for s in ssteps:
            p8.text(s, 54, sy, font="F1", size=7.2, color="#302B27")
            sy -= 9.5
            
        ey -= card_h + 10

    # The 5 Golden Rules Checklist
    p8.round_rect(40, 50, 532, 295, r=8, fill="#F3EEE6", stroke="#DED5C9", line_width=1)
    p8.text("THE 5 GOLDEN RULES FOR BAKERY OPERATORS", 58, 325, font="F2", size=11, color="#76543C")
    p8.line(58, 317, 554, 317, stroke="#DED5C9", line_width=0.5)
    
    golden_rules = [
        ("Rule 1: Always Enter Total Package Quantities", "For 60 eggs, enter quantity 60, unit each. For two 1 kg bags, enter 2000 g. Cost per piece depends entirely on accurate package sizes."),
        ("Rule 2: Your Selling Prices Are Sacred", "The app never raises or lowers your selling prices automatically. When ingredient prices rise, suggested prices update, but your prices stay under your direct control."),
        ("Rule 3: Save a Full Backup Weekly", "Go to Settings > Save full backup every Sunday. Save the .heidybackup file to iCloud Drive or an external drive. It protects your entire bakery and all original receipt photos."),
        ("Rule 4: When in Doubt, Press Cmd+Z", "Up to 30 saves can be undone at any time. You can experiment freely knowing you can always revert to your previous state instantly."),
        ("Rule 5: Keep the Live Database on Your Mac", "Do not drag the internal Bakery.sqlite file out of Application Support. Use the built-in backup and export buttons to share or archive data safely.")
    ]
    gy = 298
    for rtitle, rdesc in golden_rules:
        p8.circle(68, gy-2, 8, fill="#76543C")
        p8.text(str(golden_rules.index((rtitle, rdesc))+1), 68, gy-6, font="F2", size=9, color="#FFFFFF", align="center")
        p8.text(rtitle, 86, gy+1, font="F2", size=9.5, color="#302B27")
        gy = p8.wrapped_text(rdesc, 86, gy-11, 460, font="F1", size=8.5, leading=12, color="#64594F")
        gy -= 8

    # Save PDF
    pdf.render(out_path)
    print(f"Successfully generated 8-page PDF at: {out_path}")


if __name__ == "__main__":
    out_dir = Path("/Users/arvindk/devl/heidy")
    pdf_path = out_dir / "Heidy Bakery - Complete User Guide & Troubleshooting Manual.pdf"
    build_pdf(str(pdf_path))
