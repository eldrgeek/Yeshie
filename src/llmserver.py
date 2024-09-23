import os
import time
from pathlib import Path
import json
from dotenv import load_dotenv
from llama_index.core import VectorStoreIndex, Document, ServiceContext, StorageContext, load_index_from_storage, Settings  # New import
from llama_index.llms.openai import OpenAI
from llama_index.core.llms import ChatMessage
from llama_index.embeddings.openai import OpenAIEmbedding

# from llama_index.llms.openai import OpenAI

class LLMServer:
    def __init__(self):
        load_dotenv()
        self.index_name = "persistent_index"
        self.file_tracker_path = "file_tracker.json"
        self.index = self._update_or_create_index()
        self.openai_api_key = os.environ.get("OPENAI_API_KEY")
        if not self.openai_api_key:
            raise ValueError("OPENAI_API_KEY environment variable is not set")
        print("API Key: ", self.openai_api_key)
        
    def _update_or_create_index(self):
        if False and os.path.exists(self.index_name):
            # Load existing index
            storage_context = StorageContext.from_defaults(persist_dir=self.index_name)
            index = load_index_from_storage(storage_context)
            
            # Update index with new documents
            documents = self._get_documents()
    
            index.insert_nodes(index.build_nodes_from_documents(documents))
            index.storage_context.persist(persist_dir=self.index_name)  # Persist changes
            return index
        else:
            # Create new index
            documents = self._get_documents()
            llm_instance = OpenAI(model="gpt-3.5-turbo", temperature=0)  # Create an instance of OpenAI
            Settings.llm = llm_instance  # Updated to use the instance
            embed_model = OpenAIEmbedding(model="text-embedding-3-small")  # Use the correct embedding model
            index = VectorStoreIndex.from_documents(documents, embed_model=embed_model)  # Use the embedding model
            index.storage_context.persist(persist_dir=self.index_name)
            print("Index created")
            return index

    def _get_documents(self):
        documents = []
        file_tracker = self._load_file_tracker()

        for root, dirs, files in os.walk('.', topdown=True):
            dirs[:] = [d for d in dirs if not self._is_ignored(d)]
            for file in files:
                if file.endswith(('.ts', '.tsx', '.py', '.sh')) or file == 'package.json':
                    file_path = os.path.join(root, file)
                    last_modified = os.path.getmtime(file_path)
                    
                    if file_path not in file_tracker or file_tracker[file_path] < last_modified:
                        with open(file_path, 'r') as f:
                            content = f.read()
                        documents.append(Document(text=content, metadata={"file_path": file_path}))
                        file_tracker[file_path] = last_modified

        self._save_file_tracker(file_tracker)
        return documents

    def _is_ignored(self, path):
        gitignore_path = '.gitignore'
        if os.path.exists(gitignore_path):
            with open(gitignore_path, 'r') as f:
                ignored = [line.strip() for line in f if line.strip() and not line.startswith('#')]
            return any(Path(path).match(pattern) for pattern in ignored)
        return False

    def _load_file_tracker(self):
        if os.path.exists(self.file_tracker_path):
            with open(self.file_tracker_path, 'r') as f:
                return json.load(f)
        return {}

    def _save_file_tracker(self, tracker):
        with open(self.file_tracker_path, 'w') as f:
            json.dump(tracker, f)

    def process_message(self, message):
        query_engine = self.index.as_query_engine(llm=Settings.llm)  # Updated to use Settings
        response = query_engine.query(message)
        return str(response)

def main():
    print("Initializing LLM Server...")
    server = LLMServer()
    print("LLM Server initialized. Type 'exit' to quit.")


    user_input = "What are the names of the project's python files"
    response = server.process_message(user_input)
    print("\nLLM Response:")
    print(response)

    print("Exiting LLM Server.")

def main1 ():
    load_dotenv()  
    openai_api_key = os.environ.get("OPENAI_API_KEY")
    if not openai_api_key:
        raise ValueError("OPENAI_API_KEY environment variable is not set")
    print("API Key: ", openai_api_key)
    messages = [
        ChatMessage(
            role="system", content="You are a pirate with a colorful personality"
        ),
        ChatMessage(role="user", content="What is your name"),
    ]
    resp = OpenAI().chat(messages)
    print(resp)

if __name__ == "__main__":
    main()