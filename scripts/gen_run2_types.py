#!/usr/bin/env python3
"""Generate Run2 contracts from the actual FastAPI schema, deterministically."""
import json
import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'backend'))
from app.run2.server import create_app

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

def main():
    spec=create_app(background=False).openapi()
    dest=ROOT/'frontend';dest.mkdir(exist_ok=True)
    (dest/'run2-openapi.json').write_text(json.dumps(spec,ensure_ascii=False,indent=2,sort_keys=True)+'\n')
    schemas=spec['components']['schemas']
    out='// Generated from FastAPI /api/v2. Regenerate with scripts/gen_run2_types.py.\nexport interface components { schemas: {\n'
    out+='\n'.join('  '+json.dumps(k)+': '+ts(v)+';' for k,v in sorted(schemas.items()))
    out+='\n} }\n'
    target=dest/'src/run2/generated.ts';target.parent.mkdir(parents=True,exist_ok=True);target.write_text(out)
    print('RUN2_CONTRACT_GENERATED',len(schemas),len(spec['paths']))
if __name__=='__main__':main()
