import json
import os

from sqlalchemy.orm import Session

from . import auth, models


def get_user(db: Session, user_id: int):
    return db.query(models.User).filter(models.User.id == user_id).first()


def get_user_by_email(db: Session, email: str):
    return db.query(models.User).filter(models.User.email == email).first()


def get_master_user(db: Session):
    return db.query(models.User).filter(models.User.is_master == True).first()


def create_user(db: Session, email: str, password: str, is_master: bool = False):
    user = models.User(
        email=email, password_hash=auth.get_password_hash(password), is_master=is_master
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def ensure_master_user(db: Session):
    master_email = os.getenv("MASTER_EMAIL")
    master_password = os.getenv("MASTER_PASSWORD")
    if not master_email or not master_password:
        return None
    existing = get_master_user(db)
    if existing:
        return existing
    return create_user(db, master_email, master_password, is_master=True)


def authenticate_user(db: Session, email: str, password: str):
    user = get_user_by_email(db, email)
    if not user:
        return None
    if not auth.verify_password(password, user.password_hash):
        return None
    return user


def list_menu(db: Session):
    return (
        db.query(models.MenuItem)
        .order_by(models.MenuItem.category, models.MenuItem.name)
        .all()
    )


def create_menu_item(db: Session, item_data):
    options_json = json.dumps(item_data.get("options")) if item_data.get("options") else None
    item = models.MenuItem(
        name=item_data["name"],
        description=item_data.get("description"),
        price_cents=item_data["price_cents"],
        category=item_data["category"],
        image_url=item_data.get("image_url"),
        options_json=options_json,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def update_menu_item(db: Session, item: models.MenuItem, item_data):
    for key in ["name", "description", "price_cents", "category", "image_url"]:
        if key in item_data:
            setattr(item, key, item_data[key])
    if "options" in item_data:
        item.options_json = (
            json.dumps(item_data["options"]) if item_data["options"] else None
        )
    db.commit()
    db.refresh(item)
    return item


def delete_menu_item(db: Session, item: models.MenuItem):
    db.delete(item)
    db.commit()


def clear_menu(db: Session):
    db.query(models.MenuItem).delete()
    db.commit()


def get_menu_item(db: Session, item_id: int):
    return db.query(models.MenuItem).filter(models.MenuItem.id == item_id).first()


def seed_menu(db: Session):
    if db.query(models.MenuItem).count() > 0:
        return
    samples = [
        {
            "name": "Caramel Latte",
            "description": "Espresso, steamed milk, caramel drizzle.",
            "price_cents": 495,
            "category": "Lattes",
            "image_url": None,
            "options": [
                {
                    "name": "Size",
                    "required": True,
                    "choices": [
                        {"label": "Tall", "price_cents": 0},
                        {"label": "Grande", "price_cents": 50},
                        {"label": "Venti", "price_cents": 90},
                    ],
                },
                {
                    "name": "Milk",
                    "required": False,
                    "choices": [
                        {"label": "Whole", "price_cents": 0},
                        {"label": "Oat", "price_cents": 70},
                        {"label": "Almond", "price_cents": 70},
                    ],
                },
                {
                    "name": "Shots",
                    "required": False,
                    "choices": [
                        {"label": "Single", "price_cents": 0},
                        {"label": "Double", "price_cents": 80},
                    ],
                },
            ],
        },
        {
            "name": "Vanilla Cold Brew",
            "description": "Slow-steeped coffee, vanilla, light cream.",
            "price_cents": 465,
            "category": "Cold Brew",
            "image_url": None,
            "options": [
                {
                    "name": "Size",
                    "required": True,
                    "choices": [
                        {"label": "Tall", "price_cents": 0},
                        {"label": "Grande", "price_cents": 60},
                        {"label": "Venti", "price_cents": 110},
                    ],
                },
                {
                    "name": "Sweetness",
                    "required": False,
                    "choices": [
                        {"label": "Light", "price_cents": 0},
                        {"label": "Regular", "price_cents": 0},
                        {"label": "Extra", "price_cents": 0},
                    ],
                },
                {
                    "name": "Cream",
                    "required": False,
                    "choices": [
                        {"label": "Splash", "price_cents": 0},
                        {"label": "Light", "price_cents": 0},
                        {"label": "Extra", "price_cents": 0},
                    ],
                },
            ],
        },
        {
            "name": "Matcha Green Tea",
            "description": "Creamy matcha with a soft, sweet finish.",
            "price_cents": 525,
            "category": "Tea Lattes",
            "image_url": None,
            "options": [
                {
                    "name": "Size",
                    "required": True,
                    "choices": [
                        {"label": "Tall", "price_cents": 0},
                        {"label": "Grande", "price_cents": 55},
                        {"label": "Venti", "price_cents": 95},
                    ],
                },
                {
                    "name": "Milk",
                    "required": False,
                    "choices": [
                        {"label": "2%", "price_cents": 0},
                        {"label": "Oat", "price_cents": 70},
                        {"label": "Coconut", "price_cents": 70},
                    ],
                },
                {
                    "name": "Sweetener",
                    "required": False,
                    "choices": [
                        {"label": "None", "price_cents": 0},
                        {"label": "Classic", "price_cents": 0},
                        {"label": "Vanilla", "price_cents": 0},
                    ],
                },
            ],
        },
    ]
    for item in samples:
        create_menu_item(db, item)
