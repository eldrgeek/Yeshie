# llmserver.py

import os
from dotenv import load_dotenv
from llama_index.core import QueryBundle, VectorStoreIndex, SimpleDirectoryReader
from llama_index.core.query_engine import RetrieverQueryEngine
from llama_index.core.retrievers import VectorIndexRetriever
from llama_index.llms.openai import OpenAI
from llama_index.core.settings import Settings
import vectorstore
from codeStore import CodeStore
import logging
from embedding_model import init_embedding_model

# Load environment variables at module level
load_dotenv(override=True)
logging.basicConfig(level=logging.INFO, format='[%(levelname)s] %(message)s')
logger = logging.getLogger(__name__)

class BaseServer:
    """Base class for LLM servers with common functionality."""
    def __init__(self, sio=None):

        self.openai_api_key = os.environ.get("OPENAI_API_KEY")
        if not self.openai_api_key:
            raise ValueError("OPENAI_API_KEY environment variable is not set")
        Settings.llm = OpenAI(api_key=self.openai_api_key)  # Set the API key for llama_index
        self.models = ["gpt-4-turbo-preview", "gpt-3.5-turbo", "gpt-4", "gpt-4-32k"]
        self.sio = sio
        self.query_engine = None
        self.instructions = ""
        
        # Initialize embedding model
        init_embedding_model()

    def _emit_response(self, prompt, response):
        """Helper method to emit responses through socket if available."""
        if self.sio:
            self.sio.emit("response", {
                "request": prompt,
                "response": response
            })

    def _emit_error(self, error_message):
        """Helper method to emit errors through socket if available."""
        if self.sio:
            self.sio.emit("error", {"message": error_message})
        logger.error(error_message)

class SimpleServer(BaseServer):
    """Simple LLM server without vector store integration."""
    def makeQueryEngine(self, config):
        try:
            instructions = config.get("instructions", "")
            model_name = config.get("model", self.models[0])
            documents = SimpleDirectoryReader(config.get("path")).load_data()
            index = VectorStoreIndex.from_documents(documents)

            Settings.llm = OpenAI(model=model_name, temperature=0)
            retriever = VectorIndexRetriever(index=index, similarity_top_k=10)
            self.query_engine = RetrieverQueryEngine.from_args(
                retriever,
                node_postprocessors=[],
                verbose=False
            )
            self.instructions = instructions
            logger.info(f"Query engine created with model {model_name}")
        except Exception as e:
            error_msg = f"Failed to create query engine: {str(e)}"
            self._emit_error(error_msg)
            raise

    def makeQuery(self, prompt):
        if not self.query_engine:
            raise ValueError("Query engine not initialized. Call makeQueryEngine first.")

        full_prompt = f"{self.instructions}\n\n{prompt}" if self.instructions else prompt
        query_bundle = QueryBundle(query_str=full_prompt)

        try:
            response = self.query_engine.query(query_bundle)
            formatted_response = str(response)
            self._emit_response(prompt, formatted_response)
            return formatted_response
        except Exception as e:
            error_message = f"Error processing query: {str(e)}"
            self._emit_error(error_message)
            return error_message

class LLMServer(BaseServer):
    """LLM server with vector store integration."""
    def __init__(self, path, name, sio=None):
        super().__init__(sio)
        self.vector_store_manager = vectorstore.getManager()
        self.path = path
        self.name = name

    def makeQueryEngine(self, config):
        try:
            index_name = config.get("index")
            if not index_name:
                raise ValueError("Index name must be provided in config")
                
            instructions = config.get("instructions", "")
            model_name = config.get("model", self.models[0])

            vector_store = self.vector_store_manager.get_vector_store(index_name)
            if not vector_store:
                raise ValueError(f"Vector store '{index_name}' not found")

            Settings.llm = OpenAI(model=model_name, temperature=0)
            retriever = VectorIndexRetriever(index=vector_store, similarity_top_k=30)
            
            self.query_engine = RetrieverQueryEngine.from_args(
                retriever,
                node_postprocessors=[],
                verbose=False
            )
            self.instructions = instructions
            logger.info(f"Query engine created with model {model_name} and index {index_name}")
        except Exception as e:
            error_msg = f"Failed to create query engine: {str(e)}"
            self._emit_error(error_msg)
            raise

    def makeQuery(self, prompt):
        if not self.query_engine:
            raise ValueError("Query engine not initialized. Call makeQueryEngine first.")

        full_prompt = f"{self.instructions}\n\n{prompt}" if self.instructions else prompt
        query_bundle = QueryBundle(query_str=full_prompt)

        try:
            response = self.query_engine.query(query_bundle)
            formatted_response = str(response)
            self._emit_response(prompt, formatted_response)
            return formatted_response
        except Exception as e:
            error_message = f"Error processing query: {str(e)}"
            self._emit_error(error_message)
            return error_message

def makeServer(sio):
    """Factory function to create a server instance."""
    logger.info("Making LLMServer")
    server = SimpleServer(sio)
    return server

if __name__ == "__main__":
    # Example standalone usage
    try:
        from codeStore import CodeStore
        import vectorstore
        
        # First, create and initialize the CodeStore to process files
        print("\nInitializing CodeStore to process project files...")
        code_store = CodeStore(".", "test_store")
        documents = code_store.process_project()  # Process all files in the project
        
        # Create/update vector store using VectorStoreManager
        print("\nCreating vector store...")
        vector_store_manager = vectorstore.getManager()
        vector_store_manager.add_vector_store("test_store", "basic")  # Create the store if it doesn't exist
        vector_store_manager.add_to_vector_store("test_store", documents)  # Add the documents
        
        print("\nInitializing LLMServer...")
        # Initialize the LLMServer with the current directory
        server = LLMServer(".", "test_server")
        
        # Configure and create query engine with vector store
        server.makeQueryEngine({
            "index": "test_store",  # Use the same name we used for the vector store
            "instructions": "You are an AI assistant helping with code-related questions.",
            "model": "gpt-3.5-turbo"  # Using a faster model for testing
        })
        
        # Define test questions about the codebase
        test_questions = [
            "What are the main classes in the llmserver.py file and what do they do?",
            "How does error handling work in the BaseServer class?",
            "What embedding model is used in the project and how is it initialized?",
            "What is the purpose of the _emit_response and _emit_error methods?"
        ]
        
        print("\nLLM Server started. Testing with predefined questions about the codebase.")
        
        # Run through test questions
        for question in test_questions:
            print("\nQuestion:", question)
            print("\nResponse:", server.makeQuery(question))
            
    except Exception as e:
        logger.error(f"Error in standalone mode: {e}")
        
    print("\nServer stopped.")
