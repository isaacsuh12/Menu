import json
import os
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException
from fastapi.security import OAuth2PasswordRequestForm
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from sqlalchemy import inspect, text
from sqlalchemy.orm import Session

from . import auth, crud, models, schemas
from .db import Base, SessionLocal, engine, get_db

app = FastAPI(title="Menu")

static_dir = Path(__file__).resolve().parent.parent / "static"
app.mount("/static", StaticFiles(directory=static_dir), name="static")


@app.on_event("startup")
def on_startup():
    Base.metadata.create_all(bind=engine)
    inspector = inspect(engine)
    if "orders" in inspector.get_table_names():
        column_names = {column["name"] for column in inspector.get_columns("orders")}
        if "order_name" not in column_names:
            with engine.begin() as connection:
                connection.execute(
                    text("ALTER TABLE orders ADD COLUMN order_name VARCHAR(120)")
                )
        if "served" not in column_names:
            with engine.begin() as connection:
                connection.execute(
                    text("ALTER TABLE orders ADD COLUMN served BOOLEAN DEFAULT 0")
                )
    db = SessionLocal()
    try:
        crud.ensure_master_user(db)
    finally:
        db.close()


@app.get("/")
def index():
    return FileResponse(static_dir / "index.html")


@app.post("/auth/register", response_model=schemas.UserOut)
def register(user_in: schemas.UserCreate, db: Session = Depends(get_db)):
    if crud.get_user_by_email(db, user_in.email):
        raise HTTPException(status_code=400, detail="Email already registered")
    user = crud.create_user(db, user_in.email, user_in.password, is_master=False)
    return user


@app.post("/auth/become-master", response_model=schemas.UserOut)
def become_master(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    master_email = os.getenv("MASTER_EMAIL")
    if master_email and current_user.email.lower() != master_email.lower():
        raise HTTPException(status_code=403, detail="Master access restricted")
    db.query(models.User).update({models.User.is_master: False})
    current_user.is_master = True
    db.commit()
    db.refresh(current_user)
    return current_user


@app.post("/auth/login", response_model=schemas.Token)
def login(
    form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)
):
    user = crud.authenticate_user(db, form_data.username, form_data.password)
    if not user:
        raise HTTPException(status_code=400, detail="Incorrect email or password")
    token = auth.create_access_token({"sub": str(user.id)})
    return {"access_token": token, "token_type": "bearer"}


@app.get("/me", response_model=schemas.UserOut)
def get_me(current_user: models.User = Depends(auth.get_current_user)):
    return current_user


def menu_item_to_out(item: models.MenuItem) -> schemas.MenuItemOut:
    options = json.loads(item.options_json) if item.options_json else None
    return schemas.MenuItemOut(
        id=item.id,
        name=item.name,
        description=item.description,
        price_cents=item.price_cents,
        category=item.category,
        image_url=item.image_url,
        options=options,
    )


@app.get("/menu", response_model=list[schemas.MenuItemOut])
def get_menu(db: Session = Depends(get_db)):
    items = crud.list_menu(db)
    return [menu_item_to_out(item) for item in items]


@app.post("/menu", response_model=schemas.MenuItemOut)
def create_menu(
    menu_in: schemas.MenuItemCreate,
    db: Session = Depends(get_db),
    _: models.User = Depends(auth.require_master),
):
    item = crud.create_menu_item(db, menu_in.model_dump())
    return menu_item_to_out(item)


@app.put("/menu/{item_id}", response_model=schemas.MenuItemOut)
def update_menu(
    item_id: int,
    menu_in: schemas.MenuItemCreate,
    db: Session = Depends(get_db),
    _: models.User = Depends(auth.require_master),
):
    item = crud.get_menu_item(db, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Menu item not found")
    item = crud.update_menu_item(db, item, menu_in.model_dump())
    return menu_item_to_out(item)


@app.delete("/menu/{item_id}")
def delete_menu(
    item_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(auth.require_master),
):
    item = crud.get_menu_item(db, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Menu item not found")
    crud.delete_menu_item(db, item)
    return {"ok": True}


@app.delete("/menu")
def clear_menu(
    db: Session = Depends(get_db),
    _: models.User = Depends(auth.require_master),
):
    crud.clear_menu(db)
    return {"ok": True}


def compute_order_items(db: Session, items_in: list[schemas.OrderItemIn]):
    items = []
    total = 0
    for item_in in items_in:
        menu_item = crud.get_menu_item(db, item_in.menu_item_id)
        if not menu_item:
            raise HTTPException(status_code=404, detail="Menu item not found")
        options = json.loads(menu_item.options_json) if menu_item.options_json else []
        selected = []
        extra = 0
        selected_options = item_in.selected_options or {}
        for group in options:
            group_name = group.get("name")
            label = selected_options.get(group_name)
            if not label:
                continue
            choice = next(
                (choice for choice in group.get("choices", []) if choice["label"] == label),
                None,
            )
            if not choice:
                continue
            price = int(choice.get("price_cents", 0))
            selected.append(
                {"group": group_name, "label": label, "price_cents": price}
            )
            extra += price
        line_total = (menu_item.price_cents + extra) * item_in.quantity
        total += line_total
        notes = (item_in.notes or "").strip()
        items.append(
            {
                "menu_item_id": menu_item.id,
                "name": menu_item.name,
                "quantity": item_in.quantity,
                "base_price_cents": menu_item.price_cents,
                "options": selected,
                "notes": notes if notes else None,
                "line_total_cents": line_total,
            }
        )
    return items, total


@app.post("/orders", response_model=schemas.OrderOut)
def create_order(
    order_in: schemas.OrderCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    if not order_in.items:
        raise HTTPException(status_code=400, detail="Order is empty")
    order_name = order_in.name.strip()
    if not order_name:
        raise HTTPException(status_code=400, detail="Order name is required")
    items, total = compute_order_items(db, order_in.items)
    order = models.Order(
        user_id=current_user.id,
        order_name=order_name,
        items_json=json.dumps(items),
        total_cents=total,
        served=False,
    )
    db.add(order)
    db.commit()
    db.refresh(order)
    return schemas.OrderOut(
        id=order.id,
        user_id=order.user_id,
        name=order.order_name,
        items=items,
        total_cents=order.total_cents,
        served=bool(order.served),
        created_at=order.created_at,
    )


@app.get("/orders", response_model=list[schemas.OrderOut])
def list_orders(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    query = db.query(models.Order)
    if not current_user.is_master:
        query = query.filter(models.Order.user_id == current_user.id)
    orders = query.order_by(models.Order.created_at.desc()).all()
    out = []
    for order in orders:
        out.append(
            schemas.OrderOut(
                id=order.id,
                user_id=order.user_id,
                name=order.order_name,
                items=json.loads(order.items_json),
                total_cents=order.total_cents,
                served=bool(order.served),
                created_at=order.created_at,
            )
        )
    return out


@app.delete("/orders")
def clear_orders(
    db: Session = Depends(get_db),
    _: models.User = Depends(auth.require_master),
):
    crud.clear_orders(db)
    return {"ok": True}


@app.post("/orders/{order_id}/served")
def mark_order_served(
    order_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(auth.require_master),
):
    order = db.query(models.Order).filter(models.Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    order.served = True
    db.commit()
    return {"ok": True}


@app.get("/admin/users", response_model=list[schemas.UserOut])
def list_users(
    db: Session = Depends(get_db),
    _: models.User = Depends(auth.require_master),
):
    return crud.list_users(db)


@app.delete("/admin/users/{user_id}")
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.require_master),
):
    if current_user.id == user_id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
    user = crud.get_user(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    crud.delete_user(db, user)
    return {"ok": True}
