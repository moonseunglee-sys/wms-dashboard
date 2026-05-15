from datetime import datetime, date
from typing import Optional
from pydantic import BaseModel


class PickingDetailOut(BaseModel):
    id: int
    작업자: Optional[str] = None
    WAVE명: Optional[str] = None
    WAVE번호: Optional[str] = None
    PLT_ID: Optional[str] = None
    오더번호: Optional[str] = None
    ITEM_ID: Optional[str] = None
    피킹수량: Optional[int] = None
    LOCATION: Optional[str] = None
    작업일시: Optional[datetime] = None
    출고지역: Optional[str] = None
    shift_type: Optional[str] = None
    zone: Optional[str] = None
    예상작업시간_min: Optional[float] = None
    wave별_표준시간_min: Optional[float] = None
    wave별_작업시간_min: Optional[float] = None
    wave별_가동률: Optional[float] = None
    품목별_가동률: Optional[float] = None
    is_wave_start: Optional[bool] = None
    is_wave_end: Optional[bool] = None

    model_config = {"from_attributes": True}


class WorkerSummary(BaseModel):
    작업자: str
    화주사: str
    피킹건수: int
    표준시간_min: float
    실적시간_min: float
    가동률: float


class DailySummary(BaseModel):
    작업일: date
    피킹건수: int
    표준시간_min: float
    실적시간_min: float
    가동률: float


class DateRangeParams(BaseModel):
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    shift_type: Optional[str] = None
    작업자: Optional[str] = None
