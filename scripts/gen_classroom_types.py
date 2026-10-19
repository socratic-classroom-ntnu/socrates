#!/usr/bin/env python3
"""Generate the classroom contracts from the actual FastAPI schema, deterministically."""
import json
import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'backend'))

def ts(schema):
    if '$ref' in schema:
        return 'components["schemas"][' + json.dumps(schema['$ref'].rsplit('/', 1)[1]) + ']'
    if 'enum' in schema:
        return ' | '.join(json.dumps(v, ensure_ascii=False) for v in schema['enum'])
    if 'const' in schema:
        return json.dumps(schema['const'])
    if 'anyOf' in schema or 'oneOf' in schema:
        return '('+' | '.join(ts(x) for x in schema.get('anyOf', schema.get('oneOf')))+')'
    if 'allOf' in schema:
        return '('+' & '.join(ts(x) for x in schema['allOf'])+')'
    kind=schema.get('type')
    if kind=='array': return 'Array<'+ts(schema.get('items',{}))+'>'
    if kind=='object' or 'properties' in schema:
        props=schema.get('properties',{})
        if not props:
            value=schema.get('additionalProperties',{})
            return 'Record<string, '+(ts(value) if isinstance(value,dict) and value else 'unknown')+'>'
        # Response DTOs serialize their defaults; fields are required unless explicitly optional.
        required=schema.get('required',[])
        return '{ '+ '; '.join(json.dumps(k)+( '' if k in required or 'default' in v else '?')+': '+ts(v) for k,v in props.items())+' }'
    return {'string':'string','integer':'number','number':'number','boolean':'boolean','null':'null'}.get(kind,'unknown')

def build_spec():
    # Imported here so --spec runs on the host without the backend's dependencies.
    from app.modules.contract.service import classroom_openapi
    return classroom_openapi()

def write_contracts(spec):
    dest=ROOT/'frontend';dest.mkdir(exist_ok=True)
    (dest/'classroom-openapi.json').write_text(json.dumps(spec,ensure_ascii=False,indent=2,sort_keys=True)+'\n')
    schemas=spec['components']['schemas']
    out='// Generated from FastAPI /api/v2. Regenerate with scripts/gen_classroom_types.py.\nexport interface components { schemas: {\n'
    rows=[]
    for key,value in sorted(schemas.items()):
        rendered=ts(value)
        if key.endswith('-Output') and rendered=='unknown':
            input_key=key.removesuffix('-Output')+'-Input'
            if input_key in schemas:
                rendered='components["schemas"]['+json.dumps(input_key)+']'
        rows.append('  '+json.dumps(key)+': '+rendered+';')
    # FastAPI can split one model into -Input/-Output schemas. Keep the historic
    # unsuffixed TypeScript name as an output compatibility alias for consumers.
    for key in sorted(schemas):
        if not key.endswith('-Output'):
            continue
        stable=key.removesuffix('-Output')
        if stable not in schemas and stable+'-Input' in schemas:
            rows.append('  '+json.dumps(stable)+': components["schemas"]['+json.dumps(key)+'];')
    out+='\n'.join(rows)
    out+='\n} }\n'
    target=dest/'src/contract/classroomTypes.ts';target.parent.mkdir(parents=True,exist_ok=True);target.write_text(out)
    print('CLASSROOM_CONTRACT_GENERATED',len(schemas),len(spec['paths']))

def main():
    # The pre-commit hook splits this in two: --print-spec runs inside the backend container,
    # --spec runs on the host without the backend's dependencies. The printed spec keeps
    # FastAPI's key order, which the TS property order depends on (the JSON file is sorted).
    args=sys.argv[1:]
    if args==['--print-spec']:
        print(json.dumps(build_spec(),ensure_ascii=False));return
    if len(args)==2 and args[0]=='--spec':
        write_contracts(json.loads(Path(args[1]).read_text()));return
    write_contracts(build_spec())
if __name__=='__main__':main()
