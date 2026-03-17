from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class FarmerCreate(BaseModel):
	phone: str = Field(min_length=3, max_length=32)
	district: str = Field(min_length=2, max_length=100)
	active: bool = True


class FarmerUpdate(BaseModel):
	phone: Optional[str] = Field(default=None, min_length=3, max_length=32)
	district: Optional[str] = Field(default=None, min_length=2, max_length=100)
	active: Optional[bool] = None


class Farmer(FarmerCreate):
	model_config = ConfigDict(from_attributes=True)

	id: int
	created_at: Optional[datetime] = None


class AlertCreate(BaseModel):
	district: str = Field(min_length=2, max_length=100)
	message: str = Field(min_length=5, max_length=1000)
	alert_date: date
	status: str = Field(default="draft", min_length=2, max_length=50)
	created_by: str = Field(default="system", min_length=2, max_length=100)


class AlertUpdate(BaseModel):
	district: Optional[str] = Field(default=None, min_length=2, max_length=100)
	message: Optional[str] = Field(default=None, min_length=5, max_length=1000)
	alert_date: Optional[date] = None
	status: Optional[str] = Field(default=None, min_length=2, max_length=50)
	created_by: Optional[str] = Field(default=None, min_length=2, max_length=100)
	target_count: Optional[int] = Field(default=None, ge=0)


class Alert(AlertCreate):
	model_config = ConfigDict(from_attributes=True)

	id: int
	target_count: int = 0
	created_at: Optional[datetime] = None


class UserCreate(BaseModel):
	username: str = Field(min_length=3, max_length=50)
	password: str = Field(min_length=8, max_length=128)
	role: str = Field(default="reviewer", min_length=2, max_length=50)


class UserUpdate(BaseModel):
	username: Optional[str] = Field(default=None, min_length=3, max_length=50)
	password: Optional[str] = Field(default=None, min_length=8, max_length=128)
	role: Optional[str] = Field(default=None, min_length=2, max_length=50)


class User(BaseModel):
	model_config = ConfigDict(from_attributes=True)

	id: int
	username: str
	role: str
	created_at: Optional[datetime] = None
