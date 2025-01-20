import os
import unittest
import tempfile
from pathlib import Path
from llmserver import SimpleServer, LLMServer
from dotenv import load_dotenv
from vectorstore import VectorStoreManager
from llama_index.core import Document
from llama_index.embeddings.huggingface import HuggingFaceEmbedding
from llama_index.core.settings import Settings
import logging
import warnings

# ============ Test Configuration ============
# Set which test to run. Options are:
# - None (runs all tests)
# - 'test_simple_server_initialization'
# - 'test_llm_server_initialization'
# - 'test_query_engine_creation'
# - 'test_simple_query'
SINGLE_TEST_TO_RUN = None  # Changed to None to run all tests
# ==========================================

# Configure logging
logging.basicConfig(level=logging.INFO, format='[%(levelname)s] %(message)s')
logger = logging.getLogger(__name__)

# Set tokenizer parallelism explicitly
os.environ["TOKENIZERS_PARALLELISM"] = "false"

# Filter specific deprecation warnings
warnings.filterwarnings("ignore", message=".*get_doc_id.*")
warnings.filterwarnings("ignore", message=".*docstore.set_document_hash.*")

def validate_openai_key(api_key):
    """Validate OpenAI API key format."""
    if not api_key:
        return False
    # Project-based keys are not supported by the OpenAI Python client yet
    # We need to use organization-based keys that start with 'sk-'
    # if api_key.startswith('sk-proj-'):
    #     logger.error("Project-based API keys (sk-proj-) are not currently supported.")
    #     logger.error("Please use an organization-based API key that starts with 'sk-'")
    #     return False
    if not api_key.startswith('sk-'):
        return False
    if len(api_key) < 40:
        return False
    return True

class TestLLMServer(unittest.TestCase):
    # List of all test methods for reference
    ALL_TESTS = [
        'test_llm_server_initialization',
        'test_query_engine_creation',
        'test_code_understanding'
    ]

    @classmethod
    def setUpClass(cls):
        """Set up test environment once before all tests."""
        # Load environment variables
        load_dotenv(override=True)
        
        # Validate OpenAI API key
        api_key = os.environ.get("OPENAI_API_KEY")
        if not validate_openai_key(api_key):
            raise ValueError(
                "Invalid or missing OPENAI_API_KEY environment variable.\n"
                "Please ensure you have set a valid OpenAI API key in your .env file or environment.\n"
                "The key should start with 'sk-' and be the correct length."
            )
        
        # Set up embedding model
        logger.info("Initializing embedding model...")
        embed_model = HuggingFaceEmbedding(model_name="all-MiniLM-L6-v2")
        Settings.embed_model = embed_model
        logger.info("Embedding model initialized successfully")
        
        logger.info("Setting up test environment...")
        try:
            # Create a temporary directory for vector store
            cls.temp_dir = tempfile.mkdtemp()
            logger.info(f"Created temporary directory at: {cls.temp_dir}")
            
            # Initialize vector store manager with temporary paths
            cls.vector_store_manager = VectorStoreManager()
            cls.vector_store_manager.index_base_path = Path(cls.temp_dir)
            cls.vector_store_manager.vs_index_path = Path(cls.temp_dir) / "vector_store_index.json"
            
            # Create a test vector store
            cls.test_store_name = "test_store"
            logger.info(f"Creating test vector store: {cls.test_store_name}")
            cls.vector_store = cls.vector_store_manager.add_vector_store(cls.test_store_name, "basic")
            
            # Add test documents to the vector store
            test_docs = [
                Document(text="Test document 1"),
                Document(text="Test document 2")
            ]
            logger.info("Adding test documents to vector store...")
            cls.vector_store_manager.add_to_vector_store(cls.test_store_name, test_docs)
            logger.info("Test environment setup completed successfully")
            
        except Exception as e:
            logger.error(f"Error during test setup: {str(e)}")
            if hasattr(cls, 'temp_dir') and os.path.exists(cls.temp_dir):
                import shutil
                shutil.rmtree(cls.temp_dir, ignore_errors=True)
            raise

    @classmethod
    def tearDownClass(cls):
        """Clean up after all tests."""
        if hasattr(cls, 'temp_dir') and os.path.exists(cls.temp_dir):
            logger.info("Cleaning up test environment...")
            import shutil
            shutil.rmtree(cls.temp_dir, ignore_errors=True)
            logger.info("Temporary directory cleaned up")

    def setUp(self):
        """Set up test fixtures before each test method."""
        self.llm_server = LLMServer(".", self.test_store_name)
        # Override the vector store manager with our test one
        self.llm_server.vector_store_manager = self.vector_store_manager

    def test_llm_server_initialization(self):
        """Test LLMServer initialization."""
        logger.info("Running LLM server initialization test...")
        self.assertIsNotNone(self.llm_server)
        self.assertIsNotNone(self.llm_server.openai_api_key)
        self.assertIsNotNone(self.llm_server.vector_store_manager)
        self.assertIn("gpt-4-turbo-preview", self.llm_server.models)
        logger.info("LLM server initialization test completed successfully")

    def test_query_engine_creation(self):
        """Test query engine creation with basic configuration."""
        logger.info("Running query engine creation test...")
        config = {
            "index": self.test_store_name,
            "instructions": "Test instructions",
            "model": "gpt-3.5-turbo"
        }
        self.llm_server.makeQueryEngine(config)
        self.assertIsNotNone(self.llm_server.query_engine)
        self.assertEqual(self.llm_server.instructions, "Test instructions")
        logger.info("Query engine creation test completed successfully")

    def test_code_understanding(self):
        """Test querying for code understanding from the codeStore."""
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key or not validate_openai_key(api_key):
            logger.warning("Skipping code understanding test: Valid OpenAI API key not available")
            self.skipTest("Valid OpenAI API key not available")
            
        logger.info("Running code understanding test...")
        test_code_store = "test_code_store"
        
        try:
            # Create a clean test store
            if test_code_store in self.vector_store_manager.vs_index:
                self.vector_store_manager.remove_vector_store(test_code_store)
            code_store = self.vector_store_manager.add_vector_store(test_code_store, "basic")
            
            # Create test Python files and add them to the vector store
            test_docs = [
                Document(
                    text="""
import numpy as np
from utils import process_data
from config import settings

def main():
    data = np.array([1, 2, 3])
    result = process_data(data)
    return result
""",
                    metadata={"filename": "main.py"}
                ),
                Document(
                    text="""
import pandas as pd
from typing import List

def process_data(data: List) -> pd.DataFrame:
    return pd.DataFrame(data)
""",
                    metadata={"filename": "utils.py"}
                ),
                Document(
                    text="""
settings = {
    'version': '1.0',
    'dependencies': ['numpy', 'pandas']
}
""",
                    metadata={"filename": "config.py"}
                )
            ]
            
            # Add test documents to the vector store
            self.vector_store_manager.add_to_vector_store(test_code_store, test_docs)
            
            # Configure and create query engine with the test store
            config = {
                "index": test_code_store,
                "instructions": "You are a code analysis assistant. Analyze the code and provide specific details about files and their dependencies.",
                "model": "gpt-3.5-turbo"
            }
            
            self.llm_server.makeQueryEngine(config)
            response = self.llm_server.makeQuery(
                "List all Python files and their dependencies. Format the response as a list."
            )
            
            # Verify response content
            self.assertIn("main.py", response, "Response should mention main.py")
            self.assertIn("utils.py", response, "Response should mention utils.py")
            self.assertIn("config.py", response, "Response should mention config.py")
            self.assertIn("numpy", response, "Response should mention numpy dependency")
            self.assertIn("pandas", response, "Response should mention pandas dependency")
            
            logger.info("Code understanding test completed successfully")
            
        except Exception as e:
            logger.error(f"Code understanding test failed: {str(e)}")
            raise
        finally:
            # Clean up the test store
            if hasattr(self, 'vector_store_manager') and test_code_store in self.vector_store_manager.vs_index:
                self.vector_store_manager.remove_vector_store(test_code_store)

if __name__ == '__main__':
    if SINGLE_TEST_TO_RUN:
        if SINGLE_TEST_TO_RUN not in TestLLMServer.ALL_TESTS:
            logger.error(f"Invalid test name: {SINGLE_TEST_TO_RUN}")
            logger.info("Available tests:")
            for test in TestLLMServer.ALL_TESTS:
                logger.info(f"  - {test}")
        else:
            suite = unittest.TestSuite()
            suite.addTest(TestLLMServer(SINGLE_TEST_TO_RUN))
            runner = unittest.TextTestRunner()
            runner.run(suite)
    else:
        # Run all tests
        unittest.main() 