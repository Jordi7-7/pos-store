import re, glob, os, collections
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
enum = open('src/common/errors/error-codes.ts').read()
members = dict(re.findall(r"^\s+(\w+) = '([A-Z_]+)'", enum, re.M))
HTTP = {'BAD_REQUEST': '400', 'UNAUTHORIZED': '401', 'FORBIDDEN': '403', 'NOT_FOUND': '404', 'CONFLICT': '409', 'PAYLOAD_TOO_LARGE': '413', 'TOO_MANY_REQUESTS': '429'}
info = collections.defaultdict(lambda: {'status': set(), 'mods': set(), 'msg': '', 'details': set()})
def split_args(a):
    out=[];d=0;cur='';q=None
    for ch in a:
        if q:
            cur+=ch
            if ch==q: q=None
            continue
        if ch in '\'"`': q=ch; cur+=ch; continue
        if ch in '([{': d+=1
        if ch in ')]}': d-=1
        if ch==',' and d==0: out.append(cur.strip()); cur=''; continue
        cur+=ch
    if cur.strip(): out.append(cur.strip())
    return out
for fp in glob.glob('src/**/*.ts', recursive=True):
    if fp.endswith('.spec.ts'): continue
    s = open(fp).read()
    for m in re.finditer(r"new (?:AppException|DomainError)\(", s):
        i=m.end(); depth=1; j=i
        while depth and j < len(s):
            if s[j]=='(':depth+=1
            elif s[j]==')':depth-=1
            j+=1
        args = split_args(s[i:j-1])
        if not args or not args[0].startswith('ErrorCode.'): 
            if args and re.match(r"^(ErrorCode\.|')", args[0]) is None: pass
            continue
        code = members.get(args[0].split('.')[1])
        if not code: continue
        e = info[code]
        mod = fp.split('/')[2] if fp.startswith('src/modules/') else 'common'
        e['mods'].add(mod)
        if len(args) > 1 and not e['msg']: e['msg'] = args[1].strip('`\'"')
        st = next((a for a in args if a.startswith('HttpStatus.') or re.match(r'^\d{3}$', a)), None)
        if st:
            e['status'].add(HTTP.get(st.replace('HttpStatus.', ''), st))
        if len(args) > 3:
            for part in split_args(args[3].strip().strip('{}').strip()):
                e['details'].add(part.split(':')[0].strip())
# códigos genéricos que produce el filtro
generic = {
 'BAD_REQUEST':'400','VALIDATION_FAILED':'400','UNAUTHORIZED':'401','FORBIDDEN':'403','NOT_FOUND':'404','CONFLICT':'409',
 'PAYLOAD_TOO_LARGE':'413','TOO_MANY_REQUESTS':'429','INTERNAL_ERROR':'500'}
out = ['# Catálogo de códigos de error', '',
'Generado con `python3 scripts/generate-error-catalog.py` a partir de los `AppException` y `DomainError` del código; no lo edites a mano. El front y el móvil deben decidir qué mostrar **a partir de `code`**, nunca parseando `message`.', '',
'Forma de toda respuesta de error:', '', '```json',
'{ "statusCode": 409, "code": "SKU_TAKEN", "message": "...", "details": { "sku": "ABC" }, "path": "/products", "timestamp": "...", "requestId": "..." }',
'```', '',
'- `message` está en español y sirve como texto de respaldo, pero puede cambiar.',
'- `details` es opcional y trae los datos variables (ids, SKUs, cantidades) para armar el mensaje en el cliente.',
'- `requestId` también viaja en la cabecera `x-request-id`: pídelo al reportar un fallo.', '',
'## Códigos genéricos', '', '| Código | HTTP | Cuándo |', '|---|---|---|']
whenGeneric = {'BAD_REQUEST':'Petición mal formada sin un código más específico','VALIDATION_FAILED':'Falla la validación de campos; `details` es la lista de mensajes por campo','UNAUTHORIZED':'No autenticado','FORBIDDEN':'Sin permiso','NOT_FOUND':'Recurso inexistente','CONFLICT':'Conflicto de estado','PAYLOAD_TOO_LARGE':'Cuerpo demasiado grande','TOO_MANY_REQUESTS':'Límite de peticiones','INTERNAL_ERROR':'Error no controlado; mensaje genérico, sin detalles internos'}
for c,h in generic.items(): out.append(f'| `{c}` | {h} | {whenGeneric[c]} |')
out += ['', '## Códigos de negocio', '', '| Código | HTTP | Módulo | Mensaje (ejemplo) | `details` |', '|---|---|---|---|---|']
for code in sorted(info):
    e = info[code]
    st = ', '.join(sorted(e['status'])) or '400 (DomainError)'
    msg = e['msg'].replace('|','\\|').replace('${','{')
    det = ', '.join(f'`{d}`' for d in sorted(e['details'])) or '—'
    out.append(f"| `{code}` | {st} | {', '.join(sorted(e['mods']))} | {msg} | {det} |")
used = set(info)
unused = [v for v in members.values() if v not in used and v not in generic]
if unused:
    out += ['', '## Reservados (definidos, aún sin uso)', ''] + [f'- `{u}`' for u in sorted(unused)]
open('docs/error-codes.md','w').write('\n'.join(out)+'\n')
print(len(info),'codes;', 'unused:', unused)
