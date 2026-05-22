import os
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from typing import List
from sqlmodel import Session, select
from .database import engine, create_db_and_tables
from .models import Printer, Filament, Supply, Order, FinancialMovement
from datetime import date


app = FastAPI(title="3D Manager API")
STATIC_DIR = Path(__file__).parent / "static"
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.on_event("startup")
def on_startup():
    create_db_and_tables()


@app.get("/")
def serve_index():
    return FileResponse(STATIC_DIR / "index.html")


# Printers
@app.get("/printers", response_model=List[Printer])
def list_printers():
    with Session(engine) as session:
        printers = session.exec(select(Printer)).all()
        return printers


@app.post("/printers", response_model=Printer)
def create_printer(printer: Printer):
    with Session(engine) as session:
        session.add(printer)
        session.commit()
        session.refresh(printer)
        return printer


@app.put("/printers/{printer_id}", response_model=Printer)
def update_printer(printer_id: int, data: Printer):
    with Session(engine) as session:
        printer = session.get(Printer, printer_id)
        if not printer:
            raise HTTPException(status_code=404, detail="Printer not found")
        printer.brand = data.brand
        printer.model = data.model
        printer.price = data.price
        printer.purchase_date = data.purchase_date
        session.add(printer)
        session.commit()
        session.refresh(printer)
        return printer


# Filament
@app.get("/filaments", response_model=List[Filament])
def list_filaments():
    with Session(engine) as session:
        return session.exec(select(Filament)).all()


@app.post("/filaments", response_model=Filament)
def create_filament(f: Filament):
    with Session(engine) as session:
        session.add(f)
        session.commit()
        session.refresh(f)
        return f


@app.put("/filaments/{filament_id}", response_model=Filament)
def update_filament(filament_id: int, data: Filament):
    with Session(engine) as session:
        filament = session.get(Filament, filament_id)
        if not filament:
            raise HTTPException(status_code=404, detail="Filament not found")
        filament.name = data.name
        filament.color = data.color
        filament.material = data.material
        filament.stock_grams = data.stock_grams
        filament.cost_per_kg = data.cost_per_kg
        filament.extruder_temp_c = data.extruder_temp_c
        filament.bed_temp_c = data.bed_temp_c
        session.add(filament)
        session.commit()
        session.refresh(filament)
        return filament


# Supplies
@app.get("/supplies", response_model=List[Supply])
def list_supplies():
    with Session(engine) as session:
        return session.exec(select(Supply)).all()


@app.post("/supplies", response_model=Supply)
def create_supply(s: Supply):
    with Session(engine) as session:
        session.add(s)
        session.commit()
        session.refresh(s)
        return s


@app.put("/supplies/{supply_id}", response_model=Supply)
def update_supply(supply_id: int, data: Supply):
    with Session(engine) as session:
        supply = session.get(Supply, supply_id)
        if not supply:
            raise HTTPException(status_code=404, detail="Supply not found")
        supply.name = data.name
        supply.stock_qty = data.stock_qty
        supply.unit_cost = data.unit_cost
        session.add(supply)
        session.commit()
        session.refresh(supply)
        return supply


# Orders (consume stock)
@app.get("/orders", response_model=List[Order])
def list_orders():
    with Session(engine) as session:
        return session.exec(select(Order)).all()


@app.post("/orders", response_model=Order)
def create_order(order: Order):
    # order.details expected format: {"filaments": [{"id":1, "grams":100}], "supplies": [{"id":2, "qty":1}]}
    with Session(engine) as session:
        if order.created_date is None:
            order.created_date = date.today()
        # update filaments
        details = order.details or {}
        for item in details.get("filaments", []):
            fid = item.get("id")
            grams = int(item.get("grams", 0))
            filament = session.get(Filament, fid)
            if not filament:
                raise HTTPException(status_code=404, detail=f"Filament {fid} not found")
            if filament.stock_grams < grams:
                raise HTTPException(status_code=400, detail=f"Not enough filament {filament.name}")
            filament.stock_grams -= grams
            session.add(filament)

        for item in details.get("supplies", []):
            sid = item.get("id")
            qty = int(item.get("qty", 0))
            supply = session.get(Supply, sid)
            if not supply:
                raise HTTPException(status_code=404, detail=f"Supply {sid} not found")
            if supply.stock_qty < qty:
                raise HTTPException(status_code=400, detail=f"Not enough supply {supply.name}")
            supply.stock_qty -= qty
            session.add(supply)

        session.add(order)
        session.commit()
        session.refresh(order)
        return order


@app.put("/orders/{order_id}", response_model=Order)
def update_order(order_id: int, data: Order):
    with Session(engine) as session:
        order = session.get(Order, order_id)
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")
        order.customer_name = data.customer_name
        order.created_date = data.created_date
        order.due_date = data.due_date
        order.details = data.details or {"filaments": [], "supplies": []}
        order.models = data.models or []
        order.total_charge = data.total_charge
        order.completed = data.completed
        session.add(order)
        session.commit()
        session.refresh(order)
        return order


@app.patch("/orders/{order_id}/complete", response_model=Order)
def complete_order(order_id: int):
    with Session(engine) as session:
        order = session.get(Order, order_id)
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")
        if not order.completed:
            order.completed = True
            movement = FinancialMovement(
                type="income",
                amount=order.total_charge,
                description=f"Pedido: {order.customer_name or 'Sin nombre'}",
            )
            session.add(movement)
        session.add(order)
        session.commit()
        session.refresh(order)
        return order


# Financial movements
@app.get("/financials", response_model=List[FinancialMovement])
def list_financials():
    with Session(engine) as session:
        return session.exec(select(FinancialMovement)).all()


@app.post("/financials", response_model=FinancialMovement)
def create_financial(m: FinancialMovement):
    with Session(engine) as session:
        session.add(m)
        session.commit()
        session.refresh(m)
        return m


@app.put("/financials/{movement_id}", response_model=FinancialMovement)
def update_financial(movement_id: int, data: FinancialMovement):
    with Session(engine) as session:
        movement = session.get(FinancialMovement, movement_id)
        if not movement:
            raise HTTPException(status_code=404, detail="Financial movement not found")
        movement.type = data.type
        movement.amount = data.amount
        movement.description = data.description
        session.add(movement)
        session.commit()
        session.refresh(movement)
        return movement


# Budget calculator
@app.post("/budget")
def calculate_budget(data: dict):
    # expected keys: filament_id, model_grams, print_hours, print_minutes, post_hours, post_minutes,
    # labor_hour_cost, markup_multiplier
    fg = float(data.get("model_grams", data.get("filament_grams", 0)) or 0)
    print_hours = float(data.get("print_hours", 0)) + (float(data.get("print_minutes", 0)) / 60.0)
    post_hours = float(data.get("post_hours", 0)) + (float(data.get("post_minutes", 0)) / 60.0)
    machine_hour_cost = 258.0
    labor_hour_cost = float(data.get("labor_hour_cost", 1500) or 0)
    markup_multiplier = float(data.get("markup_multiplier", 3) or 3)

    cost_kg = float(data.get("filament_cost_per_kg", 0) or 0)
    filament_id = data.get("filament_id")
    if filament_id:
        with Session(engine) as session:
            filament = session.get(Filament, int(filament_id))
            if not filament:
                raise HTTPException(status_code=404, detail="Filament not found")
            cost_kg = float(filament.cost_per_kg)

    filament_cost = (fg / 1000.0) * cost_kg
    machine_cost = print_hours * machine_hour_cost
    labor_cost = post_hours * labor_hour_cost
    base_cost = filament_cost + machine_cost + labor_cost
    price = base_cost * markup_multiplier

    return {
        "filament_cost": filament_cost,
        "machine_cost": machine_cost,
        "labor_cost": labor_cost,
        "base_cost": base_cost,
        "price": price,
    }
