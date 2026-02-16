from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, EmailStr, Field


class Token(BaseModel):
    access_token: str
    token_type: str


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)


class UserOut(BaseModel):
    id: int
    email: EmailStr
    is_master: bool

    class Config:
        from_attributes = True


class OptionChoice(BaseModel):
    label: str
    price_cents: int = 0


class OptionGroup(BaseModel):
    name: str
    required: bool = False
    choices: List[OptionChoice]


class MenuItemBase(BaseModel):
    name: str
    description: Optional[str] = None
    price_cents: int
    category: str
    image_url: Optional[str] = None
    options: Optional[List[OptionGroup]] = None


class MenuItemCreate(MenuItemBase):
    pass


class MenuItemOut(MenuItemBase):
    id: int

    class Config:
        from_attributes = True


class OrderItemIn(BaseModel):
    menu_item_id: int
    quantity: int = Field(default=1, ge=1)
    selected_options: Optional[Dict[str, str]] = None
    notes: Optional[str] = Field(default=None, max_length=500)


class OrderCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    items: List[OrderItemIn]


class OrderOut(BaseModel):
    id: int
    user_id: int
    name: Optional[str] = None
    items: List[Dict[str, Any]]
    total_cents: int
    served: bool = False
    created_at: datetime

    class Config:
        from_attributes = True
