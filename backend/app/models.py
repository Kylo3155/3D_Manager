from __future__ import annotations

from typing import Optional
from datetime import datetime, date
from sqlmodel import SQLModel, Field
from sqlalchemy import Column, JSON


class Printer(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    brand: str
    model: str
    price: float = 0.0
    purchase_date: Optional[date] = None


class Filament(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    name: str
    color: Optional[str] = None
    material: Optional[str] = None
    stock_grams: int = 0
    cost_per_kg: float = 0.0
    extruder_temp_c: Optional[int] = None
    bed_temp_c: Optional[int] = None


class Supply(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    name: str
    stock_qty: int = 0
    unit_cost: float = 0.0


class Order(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    customer_name: Optional[str] = None
    created_date: Optional[date] = None
    due_date: Optional[date] = None
    details: dict = Field(default_factory=dict, sa_column=Column(JSON))
    models: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    total_charge: float = 0.0
    completed: bool = False


class FinancialMovement(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    type: str  # 'income' or 'expense'
    amount: float
    description: Optional[str] = None
