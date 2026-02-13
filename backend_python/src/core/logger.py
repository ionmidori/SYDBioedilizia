import logging
import sys
import os
import json
from logging.handlers import RotatingFileHandler
from src.core.config import settings
from src.core.context import get_request_id, get_session_id

class JsonFormatter(logging.Formatter):
    """
    Formatter that outputs JSON strings with context variables.
    Essential for centralized logging systems (ELK, Datadog, etc).
    """
    def format(self, record):
        log_record = {
            "timestamp": self.formatTime(record, self.datefmt),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "request_id": get_request_id(),
            "session_id": get_session_id() or "system"
        }
        
        # Merge extra fields (like duration_ms from trace_span)
        if hasattr(record, "duration_ms"):
             log_record["duration_ms"] = record.duration_ms
        if hasattr(record, "span"):
             log_record["span"] = record.span
             
        # Handle Exception info
        if record.exc_info:
            log_record["exception"] = self.formatException(record.exc_info)

        return json.dumps(log_record)

def setup_logging():
    """
    Configures the root logger with File (JSON) and Console (Human) handlers.
    Called once at application startup.
    """
    log_dir = os.getcwd() 
    log_file = os.path.join(log_dir, "server_debug.log")
    
    # 1. JSON File Handler (Machine Readable)
    file_handler = RotatingFileHandler(
        log_file,
        maxBytes=5 * 1024 * 1024,  # 5 MB
        backupCount=3,
        encoding='utf-8'
    )
    file_handler.setFormatter(JsonFormatter(datefmt='%Y-%m-%d %H:%M:%S'))
    
    # 2. Console Handler (Human Readable)
    # Force UTF-8 on Windows to support emoji in log messages (cp1252 can't encode them)
    if sys.platform == "win32" and hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    console_handler = logging.StreamHandler(sys.stdout)
    if settings.ENV == "production":
         # Use JSON in production console too
         console_handler.setFormatter(JsonFormatter(datefmt='%H:%M:%S'))
    else:
         # Pretty print in dev
         console_handler.setFormatter(logging.Formatter(
            '%(asctime)s | %(levelname)-8s | [%(name)s] %(message)s',
            datefmt='%H:%M:%S'
        ))
    
    # 3. Root Logger Config
    logging.basicConfig(
        level=logging.INFO, # Force INFO as baseline
        handlers=[file_handler, console_handler],
        force=True 
    )
    
    # Silence noisy libs
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    logging.getLogger("google").setLevel(logging.WARNING)

def get_logger(name: str) -> logging.Logger:
    """Get a standard logger instance."""
    return logging.getLogger(name)
