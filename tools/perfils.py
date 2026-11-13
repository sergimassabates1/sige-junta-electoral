#!/usr/bin/env python3
"""Sincronitza la taula de perfils (personatges/PERFILS.md) amb la web (index.html).

  python3 tools/perfils.py export   # index.html  -> personatges/PERFILS.md
  python3 tools/perfils.py import   # personatges/PERFILS.md -> index.html (+ fotos, sw.js, LLEGEIX.md)

La columna «#» és la clau: no la canviïs. Si canvies el nom en llatí, la foto
es reanomena sola (personatges/<nom-en-llati>.jpg).
Per afegir un personatge: afegeix una fila amb un número nou i posa'n la foto.
Per treure'n un: esborra la fila.
"""
import json, os, re, sys, unicodedata

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HTML = os.path.join(ROOT, 'index.html')
TABLE = os.path.join(ROOT, 'personatges', 'PERFILS.md')
SW = os.path.join(ROOT, 'sw.js')
README = os.path.join(ROOT, 'personatges', 'LLEGEIX.md')
COLS = [('#', None), ('Personatge', 'tipus'), ('Nom en llatí (usuari)', 'especie'), ('Edat', 'edat'),
        ('Va vestit', 'vestit'), ('Saluda', 'salut'), ('Dada reservada', 'broma'), ('Icona', 'ic')]

HEAD = """# Perfils dels personatges

Edita aquesta taula i després digues-ho a Claude (o executa `python3 tools/perfils.py import`).
Cada fila és el que veu el jugador al seu perfil.

- **#**: no el canviïs (és com es reconeix cada fila).
- **Nom en llatí (usuari)**: és el nom d'usuari per entrar. Si el canvies, la foto es reanomena sola.
- **Dada reservada**: si la deixes buida, el perfil no la mostra.
- **Icona**: només surt si falta la foto.
- No facis servir el caràcter `|` dins d'una cel·la (o escriu-lo com `\\|`).

"""


def slug(t):
    t = unicodedata.normalize('NFD', str(t))
    t = ''.join(c for c in t if unicodedata.category(c) != 'Mn').lower()
    return re.sub(r'[^a-z0-9]+', ' ', t).strip().replace(' ', '-')


def read_chars(s):
    c0 = s.index('var CHARS = ') + len('var CHARS = ')
    c1 = s.index('];', c0) + 1
    return json.loads(s[c0:c1]), c0, c1


def cell(v):
    return str(v if v is not None else '').replace('|', '\\|').replace('\n', ' ').strip()


def export():
    chars, _, _ = read_chars(open(HTML, encoding='utf-8').read())
    out = [HEAD, '| ' + ' | '.join(c for c, _ in COLS) + ' |', '|' + '---|' * len(COLS)]
    for i, ch in enumerate(chars, 1):
        out.append('| ' + ' | '.join(str(i) if k is None else cell(ch.get(k, '')) for _, k in COLS) + ' |')
    open(TABLE, 'w', encoding='utf-8').write('\n'.join(out) + '\n')
    print('Escrit', os.path.relpath(TABLE, ROOT), '(%d personatges)' % len(chars))


def parse_table():
    rows = []
    for line in open(TABLE, encoding='utf-8'):
        line = line.strip()
        if not line.startswith('|') or re.match(r'^\|[\s\-:|]+\|$', line):
            continue
        cells = [c.strip().replace('\\|', '|') for c in re.split(r'(?<!\\)\|', line.strip('|'))]
        if cells[0] == '#':
            head = cells
            continue
        rows.append(dict(zip(head, cells)))
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
