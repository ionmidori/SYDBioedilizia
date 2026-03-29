import sys
import logging
import asyncio
from fastapi import UploadFile

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("VERIFY_REPO")

async def verify_media_processor():
    try:
        logger.info("Verifying MediaProcessor...")
        from src.services.media_processor import MediaProcessor
        
        # Instantiate
        processor = MediaProcessor()
        logger.info("✅ MediaProcessor instantiated successfully.")
        
        # Check attributes
        assert hasattr(processor, "client"), "MediaProcessor missing client"
        assert hasattr(processor, "upload_video_for_analysis"), "MediaProcessor missing method"
        
    except ImportError as e:
        logger.error(f"❌ ImportError for MediaProcessor: {e}")
        sys.exit(1)
    except Exception as e:
        logger.error(f"❌ Error verifying MediaProcessor: {e}")
        sys.exit(1)

async def verify_conversation_repository():
    try:
        logger.info("Verifying ConversationRepository...")
        from src.repositories.conversation_repository import ConversationRepository
        
        # Instantiate
        repo = ConversationRepository()
        logger.info("✅ ConversationRepository instantiated successfully.")
        
        # Check methods
        assert hasattr(repo, "save_message"), "Repo missing save_message"
        assert hasattr(repo, "get_context"), "Repo missing get_context"
        assert hasattr(repo, "ensure_session"), "Repo missing ensure_session"
        
    except ImportError as e:
        logger.error(f"❌ ImportError for ConversationRepository: {e}")
        sys.exit(1)
    except Exception as e:
        logger.error(f"❌ Error verifying ConversationRepository: {e}")
        sys.exit(1)

async def verify_upload_router():
    try:
        logger.info("Verifying Upload Router...")
        from src.api.routes.upload import router
        logger.info("✅ Upload Router imported successfully.")
    except Exception as e:
        logger.error(f"❌ Error importing Upload Router: {e}")
        sys.exit(1)

async def main():
    logger.info("🚀 Starting Phase 2 Verification (Repo)...")
    
    await verify_media_processor()
    await verify_conversation_repository()
    await verify_upload_router()
    
    logger.info("🎉 All Phase 2 verifications passed!")

if __name__ == "__main__":
    asyncio.run(main())
