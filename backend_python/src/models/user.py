from typing import Optional
from pydantic import BaseModel, ConfigDict, Field

class NotificationPreferences(BaseModel):
    email: bool = True
    quoteReady: bool = True

class UIPreferences(BaseModel):
    theme: Optional[str] = Field(None, description="Theme preference (e.g. 'light', 'dark')")
    sidebarCollapsed: bool = False

class UserPreferences(BaseModel):
    notifications: NotificationPreferences = Field(default_factory=NotificationPreferences)
    ui: UIPreferences = Field(default_factory=UIPreferences)

    model_config = ConfigDict(from_attributes=True)

class UserPreferencesUpdate(BaseModel):
    notifications: Optional[NotificationPreferences] = None
    ui: Optional[UIPreferences] = None
