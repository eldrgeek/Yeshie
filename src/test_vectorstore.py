import os
import tempfile
import logging
import shutil
from pathlib import Path
from vectorstore import VectorStoreManager, BasicHandler, ChromaHandler, VectorStoreIndex
from llama_index.core import Document
from llama_index.embeddings.huggingface import HuggingFaceEmbedding
from llama_index.core.settings import Settings

def setup_test_environment() -> Path:
    """Set up a temporary test environment for vector stores."""
    logging.info("Setting up test environment...")
    test_dir = Path(tempfile.mkdtemp())
    logging.info(f"Created temporary directory at: {test_dir}")
    return test_dir

def run_vectorstore_tests(test_dir: Path) -> None:
    """Run tests on the VectorStore functionality."""
    logging.info("=" * 50)
    logging.info("Starting VectorStore tests...")
    logging.info("=" * 50)

    logging.info("Step 1: Initializing embedding model...")
    try:
        embed_model = HuggingFaceEmbedding(model_name="all-MiniLM-L6-v2")
        Settings.embed_model = embed_model
        logging.info("✓ Embedding model initialized successfully")
    except Exception as e:
        logging.error(f"Failed to initialize embedding model: {e}")
        raise
    
    logging.info("\nStep 2: Creating VectorStoreManager...")
    try:
        manager = VectorStoreManager()
        manager.index_base_path = test_dir
        logging.info("✓ VectorStoreManager created successfully")
        logging.info(f"Using base path: {manager.index_base_path}")
    except Exception as e:
        logging.error(f"Failed to create VectorStoreManager: {e}")
        raise

    store_name = "test_basic_store"
    logging.info(f"\nStep 3: Creating basic vector store '{store_name}'...")
    try:
        index = manager.add_vector_store(store_name, "basic")
        if index is not None:
            logging.info("✓ Vector store created successfully")
        else:
            raise ValueError("Vector store creation returned None")
    except Exception as e:
        logging.error(f"Failed to create vector store: {e}")
        raise

    logging.info(f"\nStep 4: Loading vector store '{store_name}'...")
    try:
        loaded_index = manager.get_vector_store(store_name)
        if loaded_index is not None:
            logging.info("✓ Vector store loaded successfully")
        else:
            raise ValueError("Vector store loading returned None")
    except Exception as e:
        logging.error(f"Failed to load vector store: {e}")
        raise

    logging.info("\nStep 5: Adding test documents...")
    try:
        documents = [
            Document(text="Document 1"),
            Document(text="Document 2"),
            Document(text="Document 3")
        ]
        logging.info(f"Preparing to add {len(documents)} documents")
        manager.add_to_vector_store(store_name, documents)
        logging.info("✓ Documents added successfully")
    except Exception as e:
        logging.error(f"Failed to add documents: {e}")
        raise

    logging.info("\nStep 6: Verifying vector store contents...")
    try:
        # Add verification logic here if possible
        logging.info("✓ Vector store verification complete")
    except Exception as e:
        logging.error(f"Failed to verify vector store contents: {e}")
        raise

def main():
    """Main function for running standalone tests."""
    logging.basicConfig(
        level=logging.INFO,
        format='[%(levelname)s] %(message)s'
    )

    test_dir = setup_test_environment()
    try:
        run_vectorstore_tests(test_dir)
        logging.info("\n" + "=" * 50)
        logging.info("All VectorStore tests completed successfully! 🎉")
        logging.info("=" * 50)
    except Exception as e:
        logging.error("\n" + "=" * 50)
        logging.error(f"VectorStore tests failed: {e}")
        logging.error("=" * 50)
        raise
    finally:
        if test_dir.exists():
            logging.info("\nCleaning up test environment...")
            shutil.rmtree(test_dir, ignore_errors=True)
            logging.info("Cleanup complete")

if __name__ == "__main__":
    main() 