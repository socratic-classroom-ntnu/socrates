"""Long-lived teacher Classroom assets; each linked group Session is one game."""
from copy import deepcopy
import time
from uuid import UUID,uuid4,uuid5
from fastapi import APIRouter,Request
from pydantic import BaseModel,Field
from sqlalchemy import String,Float,Integer,JSON,ForeignKey,UniqueConstraint,select
from sqlalchemy.orm import Mapped,mapped_column
from .storage import Base,Account,Room,Script,transaction,digest
from .orchestrator import DomainError
from . import service

class ClassroomAssets(Base):
    __tablename__='r73_classroom_assets'
    id:Mapped[str]=mapped_column(String(36),primary_key=True)
    owner_id:Mapped[str]=mapped_column(String(36),ForeignKey('r2_accounts.id'),index=True)
    title:Mapped[str]=mapped_column(String(160))
    revision:Mapped[int]=mapped_column(Integer,default=1)
    assets:Mapped[dict]=mapped_column(JSON,default=dict)
    created_at:Mapped[float]=mapped_column(Float,default=time.time)

class SessionLink(Base):
    __tablename__='r73_classroom_sessions'
    room_id:Mapped[str]=mapped_column(String(36),ForeignKey('r2_classroom_runs.id'),primary_key=True)
    classroom_id:Mapped[str]=mapped_column(String(36),ForeignKey('r73_classroom_assets.id'),index=True)
    batch_id:Mapped[str]=mapped_column(String(36),index=True)
    kind:Mapped[str]=mapped_column(String(20))
    created_at:Mapped[float]=mapped_column(Float,default=time.time)

class LibraryReceipt(Base):
    __tablename__='r73_library_receipts'
    key:Mapped[str]=mapped_column(String(200),primary_key=True)
    payload_hash:Mapped[str]=mapped_column(String(64))
    response:Mapped[dict]=mapped_column(JSON)

class Mutation(BaseModel):
    action_id:str=Field(min_length=8,max_length=100)
class CreateClassroom(Mutation):
    title:str=Field(min_length=1,max_length=160)
class AttachScript(Mutation):
    script_id:str|None=None
    document:dict|None=None
class CreateBatch(Mutation):
    script_id:str

router=APIRouter(prefix='/library')

def user(db,request,mutation=False):
    from .api import account
    return account(db,request,mutation)[0]

def owned(db,cid,a,lock=False):
    query=select(ClassroomAssets).where(ClassroomAssets.id==cid)
    if lock:query=query.with_for_update()
    c=db.scalar(query)
    if c is None or c.owner_id!=a.id:raise DomainError('CLASSROOM_ASSET_OWNER_REQUIRED',403)
    return c

def mutate(db,a,operation,body,action):
    key=f'{a.id}:{operation}:{body.action_id}'
    if len(key)>200:raise DomainError('ACTION_SCOPE_REQUIRED',422)
    hashed=digest(body.model_dump());old=db.get(LibraryReceipt,key)
    if old:
        if old.payload_hash!=hashed:raise DomainError('ACTION_ID_PAYLOAD_CONFLICT',409)
        return old.response
    result=action();db.add(LibraryReceipt(key=key,payload_hash=hashed,response=result));db.flush();return result

@router.get('/classrooms')
def list_classrooms(request:Request):
    with transaction() as db:
        a=user(db,request)
        return [{'id':c.id,'title':c.title,'revision':c.revision} for c in db.scalars(select(ClassroomAssets).where(ClassroomAssets.owner_id==a.id).order_by(ClassroomAssets.created_at.desc()))]

@router.post('/classrooms')
def create_classroom(body:CreateClassroom,request:Request):
    with transaction() as db:
        a=user(db,request,True)
        # Serialize this actor's new resource identities inside the native transaction.
        db.scalar(select(Account).where(Account.id==a.id).with_for_update())
        def action():
            cid=str(uuid5(UUID(a.id),'classroom-assets:'+body.action_id))
            c=ClassroomAssets(id=cid,owner_id=a.id,title=body.title.strip(),assets={'scripts':[],'avatar_pack_id':'stickman'})
            db.add(c);db.flush();return {'id':c.id,'title':c.title,'revision':c.revision}
        return mutate(db,a,'new-classroom',body,action)

@router.get('/classrooms/{cid}')
def classroom(cid:str,request:Request):
    with transaction() as db:
        a=user(db,request);c=owned(db,cid,a);scripts=[];sessions=[]
        for sid in c.assets.get('scripts',[]):
            s=db.get(Script,sid)
            if s and s.owner_id==a.id:scripts.append({'id':s.id,'revision':s.revision,'document':s.document})
        for link in db.scalars(select(SessionLink).where(SessionLink.classroom_id==cid).order_by(SessionLink.created_at.desc())):
            room=db.get(Room,link.room_id)
            if room:sessions.append({'id':room.id,'batch_id':link.batch_id,'kind':link.kind,'phase':room.state['phase'],'title':room.state['title'],'created_at':link.created_at})
        return {'id':c.id,'title':c.title,'revision':c.revision,'assets':c.assets,'scripts':scripts,'sessions':sessions}

@router.post('/classrooms/{cid}/scripts')
def attach_script(cid:str,body:AttachScript,request:Request):
    from .contracts import ScriptDocument
    with transaction() as db:
        a=user(db,request,True);c=owned(db,cid,a,True)
        def action():
            if body.script_id:
                s=db.get(Script,body.script_id)
                if s is None or s.owner_id!=a.id:raise DomainError('SCRIPT_OWNER_REQUIRED',403)
            else:
                doc=ScriptDocument.model_validate(body.document).model_dump()
                s=Script(id=str(uuid5(UUID(c.id),body.action_id)),owner_id=a.id,document=doc,revision=1);db.add(s);db.flush()
            assets=deepcopy(c.assets);ids=assets.setdefault('scripts',[])
            if s.id not in ids:ids.append(s.id);c.assets=assets;c.revision+=1
            return {'id':s.id,'revision':s.revision,'document':s.document,'classroom_id':cid}
        return mutate(db,a,'script:'+cid,body,action)

@router.post('/classrooms/{cid}/batches')
def create_batch(cid:str,body:CreateBatch,request:Request):
    with transaction() as db:
        a=user(db,request,True);c=owned(db,cid,a,True)
        if body.script_id not in c.assets.get('scripts',[]):raise DomainError('CLASSROOM_SCRIPT_REQUIRED',422)
        def action():
            response=service.create_room(db,a,body.script_id);room=db.get(Room,response['id']);state=deepcopy(room.state)
            state['asset_classroom_id']=cid;state['asset_classroom_revision']=c.revision;state['asset_snapshot']=deepcopy(c.assets);room.state=state
            db.add(SessionLink(room_id=room.id,classroom_id=cid,batch_id=room.id,kind='BATCH'))
            return {'id':room.id,'classroom_id':cid,'batch_id':room.id,'code':room.code}
        return mutate(db,a,'batch:'+cid,body,action)


def link_group_session(db,parent,group):
    cid=parent.state.get('asset_classroom_id')
    if cid and db.get(SessionLink,group.id) is None:
        db.add(SessionLink(room_id=group.id,classroom_id=cid,batch_id=parent.id,kind='SESSION'))
