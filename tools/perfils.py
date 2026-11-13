#!/usr/bin/env -S uv run --script
# /// script
# dependencies = ["openpyxl"]
# ///
"""Sincronitza el full de càlcul de perfils (personatges/PERFILS.xlsx) amb la web (index.html).

  uv run tools/perfils.py export   # index.html -> personatges/PERFILS.xlsx
  uv run tools/perfils.py import   # personatges/PERFILS.xlsx -> index.html (+ fotos, sw.js, LLEGEIX.md)

La columna «#» és la clau: no la canviïs. Si canvies el nom en llatí, la foto
es reanomena sola (personatges/<nom-en-llati>.jpg).
Per afegir un personatge: afegeix una fila amb un número nou i posa'n la foto.
Per treure'n un: esborra la fila.
"""
import json, os, re, sys, unicodedata

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HTML = os.path.join(ROOT, 'index.html')
TABLE = os.path.join(ROOT, 'personatges', 'PERFILS.xlsx')
SW = os.path.join(ROOT, 'sw.js')
README = os.path.join(ROOT, 'personatges', 'LLEGEIX.md')
COLS = [('#', None), ('Personatge', 'tipus'), ('Nom en llatí (usuari)', 'especie'), ('Edat', 'edat'),
        ('Va vestit', 'vestit'), ('Saluda', 'salut'), ('Dada reservada', 'broma'), ('Icona', 'ic')]

WIDTHS = [5, 24, 26, 7, 62, 42, 46, 7]
HELP = [
    "Com editar els perfils",
    "",
    "1. Edita el full «Perfils»: cada fila és el que veu el jugador al seu perfil.",
    "2. Desa'l en format .xlsx (si LibreOffice pregunta, tria «Mantén el format actual»).",
    "3. Digues-ho a Claude, o executa: uv run tools/perfils.py import",
    "",
    "Columna #: no la canviïs (és com es reconeix cada fila).",
    "Nom en llatí (usuari): és el nom d'usuari per entrar. Si el canvies, la foto es reanomena sola.",
    "Dada reservada: si la deixes buida, el perfil no la mostra.",
    "Icona: només surt si falta la foto.",
    "Per afegir un personatge: una fila nova amb un número nou, i posa'n la foto a personatges/<nom-en-llati>.jpg.",
    "Per treure'n un: esborra la fila sencera.",
]


def slug(t):
    t = unicodedata.normalize('NFD', str(t))
    t = ''.join(c for c in t if unicodedata.category(c) != 'Mn').lower()
    return re.sub(r'[^a-z0-9]+', ' ', t).strip().replace(' ', '-')


def read_chars(s):
    c0 = s.index('var CHARS = ') + len('var CHARS = ')
    c1 = s.index('];', c0) + 1
    return json.loads(s[c0:c1]), c0, c1


def export():
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Font, PatternFill, Border, Side
    from openpyxl.utils import get_column_letter
    chars, _, _ = read_chars(open(HTML, encoding='utf-8').read())
    wb = Workbook(); ws = wb.active; ws.title = 'Perfils'
    ws.append([c for c, _ in COLS])
    for i, ch in enumerate(chars, 1):
        ws.append([i] + [ch.get(k, '') for _, k in COLS[1:]])
    thin = Side(style='thin', color='BBBBBB')
    for row in ws.iter_rows():
        for c in row:
            c.alignment = Alignment(wrap_text=True, vertical='top')
            c.border = Border(left=thin, right=thin, top=thin, bottom=thin)
            if c.row == 1:
                c.font = Font(bold=True, color='FFFFFF'); c.fill = PatternFill('solid', fgColor='0B3D91')
                c.alignment = Alignment(wrap_text=True, vertical='center')
            elif c.column in (2, 3):
                c.font = Font(bold=c.column == 2, italic=c.column == 3)
    for i, w in enumerate(WIDTHS, 1):
        ws.column_dimensions[get_column_letter(i)].width = w
    ws.freeze_panes = 'D2'
    ws.row_dimensions[1].height = 30
    ws.page_setup.orientation = 'landscape'; ws.page_setup.fitToWidth = 1; ws.page_setup.fitToHeight = 0
    ws.sheet_properties.pageSetUpPr.fitToPage = True; ws.print_title_rows = '1:1'
    h = wb.create_sheet('Instruccions')
    for line in HELP:
        h.append([line])
    h['A1'].font = Font(bold=True, size=14); h.column_dimensions['A'].width = 110
    wb.save(TABLE)
    print('Escrit', os.path.relpath(TABLE, ROOT), '(%d personatges)' % len(chars))


def parse_table():
    from openpyxl import load_workbook
    ws = load_workbook(TABLE, data_only=True)['Perfils']
    rows, head = [], None
    for vals in ws.iter_rows(values_only=True):
        vals = ['' if v is None else (str(int(v)) if isinstance(v, float) and v.is_integer() else str(v)).strip() for v in vals]
        if head is None:
            head = vals; continue
        if not any(vals):
            continue
        rows.append(dict(zip(head, vals)))
    return rows


def do_import():
    s = open(HTML, encoding='utf-8').read()
    old, c0, c1 = read_chars(s)
    rows = parse_table()
    new, errs = [], []
    for r in rows:
        try:
            n = int(r['#'])
        except (KeyError, ValueError):
            errs.append('fila sense número: %r' % r); continue
        prev = old[n - 1] if 1 <= n <= len(old) else {}
        ch = {}
        for col, k in COLS[1:]:
            v = r.get(col, '').strip()
            if k == 'edat':
                v = int(v) if re.fullmatch(r'\d+', v) else v
            if k == 'broma' and not v:
                continue
            if k == 'ic' and not v:
                v = prev.get('ic', '🙂')
            ch[k] = v
        for k in ('tipus', 'especie', 'vestit', 'salut'):
            if not ch.get(k):
                errs.append('fila %d: falta «%s»' % (n, k))
        if prev and slug(prev['especie']) != slug(ch['especie']):
            a = os.path.join(ROOT, 'personatges', slug(prev['especie']) + '.jpg')
            b = os.path.join(ROOT, 'personatges', slug(ch['especie']) + '.jpg')
            if os.path.exists(a) and not os.path.exists(b):
                os.rename(a, b); print('Foto reanomenada:', os.path.basename(a), '->', os.path.basename(b))
        new.append(ch)
    slugs = [slug(c['especie']) for c in new]
    dup = {x for x in slugs if slugs.count(x) > 1}
    if dup:
        errs.append('noms en llatí repetits: %s' % ', '.join(sorted(dup)))
    if errs:
        sys.exit('No s\'ha importat res:\n  ' + '\n  '.join(errs))
    s = s[:c0] + json.dumps(new, ensure_ascii=False, indent=1) + s[c1:]
    open(HTML, 'w', encoding='utf-8').write(s)
    # sw.js: llista de fotos a la memòria cau + versió nova
    w = open(SW, encoding='utf-8').read()
    photos = sorted(f for f in os.listdir(os.path.join(ROOT, 'personatges')) if f.endswith('.jpg') and f[:-4] in slugs)
    base = re.search(r"var ASSETS = \[('[^\]]*?icon-512\.png')", w, re.S).group(1)
    w = re.sub(r"var ASSETS = \[.*?\];", "var ASSETS = [" + base + ",\n  " + ",\n  ".join("'./personatges/%s'" % p for p in photos) + "];", w, flags=re.S)
    w = re.sub(r"var CACHE = 'sige-v(\d+)-(\d+)';", lambda m: "var CACHE = 'sige-v%s-%d';" % (m.group(1), int(m.group(2)) + 1), w)
    open(SW, 'w', encoding='utf-8').write(w)
    rd = open(README, encoding='utf-8').read()
    rd = rd[:rd.index('| Personatge |')] + '| Personatge | Nom d\'usuari | Fitxer |\n|---|---|---|\n' + \
        ''.join('| %s | %s | `%s.jpg` |\n' % (c['tipus'], c['especie'], slug(c['especie'])) for c in new)
    open(README, 'w', encoding='utf-8').write(rd)
    missing = [c['tipus'] for c in new if slug(c['especie']) + '.jpg' not in photos]
    print('Importats %d personatges a index.html.' % len(new) + (' Sense foto: ' + ', '.join(missing) if missing else ''))


if __name__ == '__main__':
    {'export': export, 'import': do_import}.get(sys.argv[1] if len(sys.argv) > 1 else '', lambda: sys.exit(__doc__))()
