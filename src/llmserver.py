# llmserver.py

import os
from dotenv import load_dotenv
from llama_index.core import QueryBundle, VectorStoreIndex,SimpleDirectoryReader
from llama_index.core.query_engine import RetrieverQueryEngine
from llama_index.core.retrievers import VectorIndexRetriever
from llama_index.llms.openai import OpenAI
from llama_index.core.settings import Settings
import vectorstore
# from codeStore import CodeStore


# Load documents

class SimpleServer:
    def __init__(self, sio=None):
        load_dotenv()
        self.openai_api_key = os.environ.get("OPENAI_API_KEY")
        if not self.openai_api_key:
            raise ValueError("OPENAI_API_KEY environment variable is not set")
        self.models = ["gpt-4-turbo-preview", "gpt-3.5-turbo", "gpt-4", "gpt-4-32k"]  # Added model options

    def makeQueryEngine(self, config):
            index_name = config.get("index")
            instructions = config.get("instructions", "")
            model_name = config.get("model", self.models[0])  # Default to first model in the list
            documents = SimpleDirectoryReader(config.get("path")).load_data()
            index = VectorStoreIndex.from_documents(documents)

            retriever = VectorIndexRetriever(index=index, similarity_top_k=10)
            self.query_engine = RetrieverQueryEngine.from_args(
                retriever,
                node_postprocessors=[],
                verbose=False
            )
            self.instructions = instructions
    
    def makeQuery(self, prompt):
        if not self.query_engine:
            raise ValueError("Query engine not initialized. Call makeQueryEngine first.")

        full_prompt = f"{self.instructions}\n\n{prompt}" if self.instructions else prompt
        query_bundle = QueryBundle(query_str=full_prompt)

        try:
            response = self.query_engine.query(query_bundle)
            formatted_response = str(response)
            
            if self.sio:
                self.sio.emit("response", {
                    "request": prompt,
                    "response": formatted_response
                })
            
            return formatted_response
        except Exception as e:
            error_message = f"Error processing query: {str(e)}"
            if self.sio:
                self.sio.emit("error", {"message": error_message})
            return error_message


class LLMServer:
    def __init__(self, path, name, sio=None):
        load_dotenv()
        self.openai_api_key = os.environ.get("OPENAI_API_KEY")
        if not self.openai_api_key:
            raise ValueError("OPENAI_API_KEY environment variable is not set")
        self.vector_store_manager = vectorstore.getManager()  # Updated to use default store
        self.models = ["gpt-4-turbo-preview", "gpt-3.5-turbo", "gpt-4", "gpt-4-32k"]  # Added model options
        self.sio = sio
        self.query_engine = None

    def makeQueryEngine(self, config):
        index_name = config.get("index")
        instructions = config.get("instructions", "")
        model_name = config.get("model", self.models[0])  # Default to first model in the list

        vector_store = self.vector_store_manager.get_vector_store(index_name)
        retriever = VectorIndexRetriever(index=vector_store, similarity_top_k=30)
        
        Settings.llm = OpenAI(model=model_name, temperature=0)
        
        self.query_engine = RetrieverQueryEngine.from_args(
            retriever,
            node_postprocessors=[],
            verbose=False
        )
        
        self.instructions = instructions

    def makeQuery(self, prompt):
        if not self.query_engine:
            raise ValueError("Query engine not initialized. Call makeQueryEngine first.")

        full_prompt = f"{self.instructions}\n\n{prompt}" if self.instructions else prompt
        query_bundle = QueryBundle(query_str=full_prompt)

        try:
            response = self.query_engine.query(query_bundle)
            formatted_response = str(response)
            
            if self.sio:
                self.sio.emit("response", {
                    "request": prompt,
                    "response": formatted_response
                })
            
            return formatted_response
        except Exception as e:
            error_message = f"Error processing query: {str(e)}"
            if self.sio:
                self.sio.emit("error", {"message": error_message})
            return error_message

def makeServer(sio):
    print("Making LLMServer")
    server = SimpleServer(sio)
    return server


# Example usage
if __name__ == "__main__":
    pass
def oldMain():
    server = LLMServer(".", "YeshieCode")  # Updated name to "YeshieCode"
    
    # Initialize CodeStore and update the vector store
    # code_store = CodeStore(".", "YeshieCode")  # Updated name to "YeshieCode"
    # code_store.update_store()
    
    # Configure and create query engine
    server.makeQueryEngine({
        # "index": code_store.store_name,
        "instructions": "You are an AI assistant helping with code-related questions.",
        "model": "gpt-3.5-turbo"
    })
    
    # Make a query
    response = server.makeQuery("What files are in the project?")
    print(response)
