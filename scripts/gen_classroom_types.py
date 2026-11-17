#!/usr/bin/env python3
"""Generate the classroom contracts from the actual FastAPI schema, deterministically."""
import ast
import json
import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'backend'))

def property_ts(name, schema, required, input_type=False):
    description=schema.get('description')
    jsdoc='/** '+str(description).replace('*/', '*\\/')+' */ ' if description else ''
    optional='' if name in required or (not input_type and 'default' in schema) else '?'
    return jsdoc+json.dumps(name)+optional+': '+ts(schema,input_type=input_type)

def ts(schema,input_type=False):
    if '$ref' in schema:
        namespace='requestComponents' if input_type else 'components'
        return namespace+'["schemas"][' + json.dumps(schema['$ref'].rsplit('/', 1)[1]) + ']'
    if 'enum' in schema:
        return ' | '.join(json.dumps(v, ensure_ascii=False) for v in schema['enum'])
    if 'const' in schema:
        return json.dumps(schema['const'])
    if 'anyOf' in schema or 'oneOf' in schema:
        return '('+' | '.join(ts(x,input_type=input_type) for x in schema.get('anyOf', schema.get('oneOf')))+')'
    if 'allOf' in schema:
        return '('+' & '.join(ts(x,input_type=input_type) for x in schema['allOf'])+')'
    kind=schema.get('type')
    if kind=='array': return 'Array<'+ts(schema.get('items',{}),input_type=input_type)+'>'
    if kind=='object' or 'properties' in schema:
        props=schema.get('properties',{})
        if not props:
            value=schema.get('additionalProperties',{})
            return 'Record<string, '+(ts(value,input_type=input_type) if isinstance(value,dict) and value else 'unknown')+'>'
        # Response DTOs serialize their defaults; fields are required unless explicitly optional.
        required=schema.get('required',[])
        return '{ '+ '; '.join(property_ts(k,v,required,input_type=input_type) for k,v in props.items())+' }'
    return {'string':'string','integer':'number','number':'number','boolean':'boolean','null':'null'}.get(kind,'unknown')

def build_spec():
    # Imported here so --spec runs on the host without the backend's dependencies.
    from app.modules.contract.service import classroom_openapi
    return classroom_openapi()

def render_paths(spec):
    """Render the public operation map from the FastAPI OpenAPI paths."""
    rows=['export interface paths {']
    methods=('get','post','put','patch','delete')
    for full_path,operations in sorted(spec['paths'].items()):
        path=full_path.removeprefix('/api/v2')
        rows.append('  '+json.dumps(path)+': {')
        for method in methods:
            if method not in operations:
                continue
            operation=operations[method]
            request_content=operation.get('requestBody',{}).get('content',{})
            request_media=next(iter(request_content),'none')
            body=request_content.get(request_media,{}).get('schema')
            body_type=ts(body,input_type=True) if body else 'never'
            body_required='true' if operation.get('requestBody',{}).get('required',False) else 'false'
            success=[]
            for status,response in sorted(operation.get('responses',{}).items()):
                if not status.startswith('2'):
                    continue
                content=response.get('content',{})
                success.extend(ts(media.get('schema',{})) for media in content.values())
                if not content:
                    success.append('null')
            response_type=' | '.join(dict.fromkeys(success)) if success else 'unknown'
            success_media=next((media for status,response in sorted(operation.get('responses',{}).items()) if status.startswith('2') for media in response.get('content',{})), 'none')
            fields=[f'body: {body_type}',f'bodyRequired: {body_required}',f'requestMedia: {json.dumps(request_media)}',f'response: {response_type}',f'responseMedia: {json.dumps(success_media)}']
            params=operation.get('parameters',[])
            for location in ('path','query'):
                selected=[p for p in params if p.get('in')==location]
                shape='{ '+ '; '.join(json.dumps(p['name'])+('' if p.get('required') else '?')+': '+ts(p.get('schema',{})) for p in selected)+' }' if selected else 'never'
                fields.append(f'{location}: {shape}')
            rows.append('    '+json.dumps(method)+': { '+'; '.join(fields)+' };')
        rows.append('  };')
    return '\n'.join(rows+['}'])

def render_reason_codes(catalog):
    """Read only literal assignments, so host generation needs no backend imports."""
    names={'REASON_CODES','DYNAMIC_REASON_CODES','SERVER_ONLY_REASON_CODES'}
    values={}
    for node in ast.parse(Path(catalog).read_text(encoding='utf-8')).body:
        if isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name):
            name=node.target.id
        elif isinstance(node, ast.Assign) and len(node.targets)==1 and isinstance(node.targets[0],ast.Name):
            name=node.targets[0].id
        else:
            continue
        if name in names:
            values[name]=ast.literal_eval(node.value)
    if set(values)!=names:
        raise ValueError('Incomplete reason-code catalog')
    codes=sorted((set(values['REASON_CODES'])|set(values['DYNAMIC_REASON_CODES']))-set(values['SERVER_ONLY_REASON_CODES']))
    return '// Generated from backend/app/modules/contract/contracts.py.\nexport type ClassroomReasonCode = '+' | '.join(json.dumps(code) for code in codes)+';\n'

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
    out+='\nexport interface requestComponents { schemas: {\n'
    out+='\n'.join('  '+json.dumps(key)+': '+ts(value,input_type=True)+';' for key,value in sorted(schemas.items()))
    out+='\n} }\n'
    out+='\n'+render_paths(spec)+'\n'
    out+='\n'+render_reason_codes(ROOT/'backend/app/modules/contract/contracts.py')
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
