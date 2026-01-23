import sys
import os

print("🔍 Diagnostics: Verifying Python environment...")
print(f"🐍 Python Version: {sys.version}")
print(f"📂 CWD: {os.getcwd()}")
print(f"📦 sys.path: {sys.path}")

required_packages = [
    "fastapi",
    "uvicorn",
    "firebase_admin",
    "google.cloud.firestore",
    "google.genai",
    "langchain_core",
    "langgraph",
    "dotenv"
]

failed = []

for package in required_packages:
    try:
        __import__(package)
        print(f"✅ Import successful: {package}")
    except ImportError as e:
        print(f"❌ Import FAILED: {package} - {e}")
        failed.append(package)
    except Exception as e:
        print(f"❌ Error importing {package}: {e}")
        failed.append(package)

if failed:
    print(f"🚨 CRITICAL: {len(failed)} packages failed to import!")
    sys.exit(1)

print("✅ All core dependencies verified.")
sys.exit(0)
