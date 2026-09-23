#!/usr/bin/env python3
"""Retrieve source-pinned classroom portrait; verify Git blob identity and GLB header."""
import base64
import hashlib
import json
from pathlib import Path
import urllib.request
ROOT=Path(__file__).resolve().parents[1]
SPEC=json.loads((ROOT/'frontend/public/avatars/ce-brunette/SOURCE.json').read_text())
def identity(data):return hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()
def main():
    dst=ROOT/'frontend/public/avatars/ce-brunette/avatar.glb';dst.parent.mkdir(parents=True,exist_ok=True)
    if dst.exists() and identity(dst.read_bytes())==SPEC['git_blob_sha']:return
    for url in [SPEC['url'],'https://api.github.com/repos/met4citizen/TalkingHead/git/blobs/'+SPEC['git_blob_sha']]:
        try:
            print('AVATAR_SOURCE '+url,flush=True)
            request=urllib.request.Request(url,headers={'User-Agent':'Socrates-Run2'})
            with urllib.request.urlopen(request,timeout=45) as r:data=r.read(12000000)
            if 'api.github.com' in url:data=base64.b64decode(json.loads(data)['content'])
            if identity(data)!=SPEC['git_blob_sha'] or data[:4]!=b'glTF':raise ValueError('ASSET_IDENTITY')
            dst.write_bytes(data);return
        except Exception as e:print('AVATAR_ATTEMPT '+type(e).__name__,flush=True)
    raise RuntimeError('PINNED_AVATAR_SOURCE_AWAITING')
if __name__=='__main__':main()
