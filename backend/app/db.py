import json

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import settings


class Base(DeclarativeBase):
    pass


def _dumps(value: object) -> str:
    """序列化 JSON 時保留中文字元，不轉成 unicode escape。

    jsonb 寫入時本來就會把 escape 解回字元，所以這對最終儲存內容沒有差別；
    差別在於直接看 SQL log、或未來若有欄位仍是 json 型別時，人讀得懂。
    """
    return json.dumps(value, ensure_ascii=False)


engine = create_engine(settings.database_url, pool_pre_ping=True, json_serializer=_dumps)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)
