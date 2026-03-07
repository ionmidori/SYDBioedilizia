from typing import Optional
from pydantic import BaseModel, ConfigDict, Field

class NotificationPreferences(BaseModel):
    model_config = {"extra": "forbid"}
    email: bool = True
    quoteReady: bool = True

class UIPreferences(BaseModel):
    model_config = {"extra": "forbid"}
    theme: Optional[str] = Field(None, description="Theme preference (e.g. 'light', 'dark')")
    sidebarCollapsed: bool = False

class UserPreferences(BaseModel):
    notifications: NotificationPreferences = Field(default_factory=NotificationPreferences)
    ui: UIPreferences = Field(default_factory=UIPreferences)

    model_config = ConfigDict(extra="forbid", from_attributes=True)

class UserPreferencesUpdate(BaseModel):
    model_config = {"extra": "forbid"}
    notifications: Optional[NotificationPreferences] = None
    ui: Optional[UIPreferences] = None
