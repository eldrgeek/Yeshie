

import os
from pathlib import Path
import json
from dotenv import load_dotenv
from llama_index.core import VectorStoreIndex, Document, StorageContext, load_index_from_storage
from llama_index.core.settings import Settings
from llama_index.embeddings.openai import OpenAIEmbedding
from llama_index.llms.openai import OpenAI
from llama_index.core.query_engine import RetrieverQueryEngine
from llama_index.core.retrievers import VectorIndexRetriever
import llama_index
print("CORE VERSION: ", llama_index.core.__version__)

class LLMServer:
    def __init__(self):
        load_dotenv()
        self.index_name = "persistent_index"
        self.file_tracker_path = "file_tracker.json"
        self.openai_api_key = os.environ.get("OPENAI_API_KEY")
        if not self.openai_api_key:
            raise ValueError("OPENAI_API_KEY environment variable is not set")
        Settings.llm = OpenAI(model="gpt-3.5-turbo", temperature=0)
        Settings.embed_model = OpenAIEmbedding(model="text-embedding-3-small")
        self.index = self._update_or_create_index()
        self.retriever = self._create_retriever()

    def _update_or_create_index(self):
        if os.path.exists(self.index_name):
            storage_context = StorageContext.from_defaults(persist_dir=self.index_name)
            index = load_index_from_storage(storage_context)
            documents = self._get_documents()
            for doc in documents:
                print("Inserting document: ", doc.metadata["file_path"])
                index.insert(doc)
            index.storage_context.persist(persist_dir=self.index_name)
        else:
            documents = self._get_documents()
            index = VectorStoreIndex.from_documents(documents)
            index.storage_context.persist(persist_dir=self.index_name)
            print("Index created")
        return index

    def _create_retriever(self):
        return VectorIndexRetriever(index=self.index, similarity_top_k=20)

    def _get_documents(self):
        documents = []
        file_tracker = self._load_file_tracker()
        for root, dirs, files in os.walk('.', topdown=True):
            dirs[:] = [d for d in dirs if not self._is_ignored(os.path.join(root, d))]
            for file in files:
                file_path = os.path.join(root, file)
                if not self._is_ignored(file_path) and (file.endswith(('.ts', '.tsx', '.py', '.sh')) or file == 'package.json'):
                    last_modified = os.path.getmtime(file_path)
                    if file_path not in file_tracker or file_tracker[file_path] < last_modified:
                        with open(file_path, 'r') as f:
                            content = f.read()
                        documents.append(Document(text=content, metadata=self._get_file_metadata(file_path)))
                        file_tracker[file_path] = last_modified
                        print(f"Added {file_path} to index")
        self._save_file_tracker(file_tracker)
        return documents

    def _get_file_metadata(self, file_path):
        return {
            "file_path": file_path,
            "creation_time": os.path.getctime(file_path),
            "last_modified_time": os.path.getmtime(file_path)
        }

    def _is_ignored(self, path):
        gitignore_path = '.gitignore'
        if os.path.exists(gitignore_path):
            with open(gitignore_path, 'r') as f:
                ignored = [line.strip() for line in f if line.strip() and not line.startswith('#')]
            path_obj = Path(path)
            for pattern in ignored:
                if pattern.endswith('/'):
                    if path_obj.is_dir() and (path_obj.match(pattern) or any(parent.match(pattern) for parent in path_obj.parents)):
                        return True
                elif path_obj.match(pattern) or any(parent.match(pattern) for parent in path_obj.parents):
                    return True
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
        query_engine = RetrieverQueryEngine.from_args(
            self.retriever,
            node_postprocessors=[],
            verbose=True
        )
        modified_query = f"List all the Python (.py) files in the project based on the indexed documents. Query: {message}"
        response = query_engine.query(modified_query)
        python_files = [node.metadata['file_path'] for node in response.source_nodes if node.metadata['file_path'].endswith('.py')]
        formatted_response = "The Python files in the project are:\n" + "\n".join(python_files)
        return formatted_response
def main():
    print("Initializing LLM Server...")
    server = LLMServer()
    print("LLM Server initialized. Type 'exit' to quit.")


    user_input = "What are the names of the project's python files"
    print(f"User Input: {user_input}")
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