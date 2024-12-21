"""Utility module for embedding model initialization."""

from llama_index.embeddings.huggingface import HuggingFaceEmbedding
from llama_index.core.settings import Settings
import logging

logger = logging.getLogger(__name__)

def init_embedding_model():
    """Initialize the HuggingFace embedding model."""
    logger.info("Initializing embedding model...")
    try:
        embed_model = HuggingFaceEmbedding(model_name="all-MiniLM-L6-v2")
        Settings.embed_model = embed_model
        logger.info("Embedding model initialized successfully")
        return embed_model
    except Exception as e:
        logger.error(f"Failed to initialize embedding model: {e}")
        raise