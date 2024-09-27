# llmserver.py

import os
import json
from pathlib import Path
from dotenv import load_dotenv
from llama_index.core import VectorStoreIndex, Document, StorageContext, load_index_from_storage
from llama_index.core.settings import Settings
from llama_index.embeddings.openai import OpenAIEmbedding
from llama_index.llms.openai import OpenAI
from llama_index.core.query_engine import RetrieverQueryEngine
from llama_index.core.retrievers import VectorIndexRetriever

# Import the debugging module
import llmdebug 
import customprint
import monitor
import vectorstore
import monitor

class LLMServer:
    def __init__(self,sio):
        load_dotenv()
        self.openai_api_key = os.environ.get("OPENAI_API_KEY")
        if not self.openai_api_key:
            raise ValueError("OPENAI_API_KEY environment variable is not set")
        self.vector_store_manager = vectorstore.makeStore()
        # Initialize the models
        models = ["gpt-4o-2024-08-06", "gpt-3.5-turbo", "gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-4-turbo-preview"]
        Settings.llm = OpenAI(model=models[0], temperature=0)
        Settings.embed_model = OpenAIEmbedding(model="text-embedding-3-small")
        # Add the default vector store
        self.vector_store_manager.add_vector_store(
            name="project_files",
            creator=self.create_project_files_vector_store,
            maintainer=self.maintain_project_files_vector_store
        )
        self._getQueryEngine("project_files")
        self.sio = sio
        @self.sio.on('llm')
        def on_llm(data):
            print("Received LLM message:", data)

    def create_project_files_vector_store(self):
        documents = self._get_documents()
        index = VectorStoreIndex.from_documents(documents)
        return index

    def maintain_project_files_vector_store(self, index):
        new_or_modified_docs = self._get_new_or_modified_documents()
        if new_or_modified_docs:
            for doc in new_or_modified_docs:
                index.insert(doc)
            index.storage_context.persist()

    def _get_documents(self):
        documents = []
        file_tracker = {}
        for root, dirs, files in os.walk('.', topdown=True):
            dirs[:] = [d for d in dirs if not self._is_ignored(os.path.join(root, d))]
            for file in files:
                file_path = os.path.join(root, file)
                if not self._is_ignored(file_path) and (file.endswith(('.ts', '.tsx', '.py', '.sh')) or file == 'package.json'):
                    with open(file_path, 'r') as f:
                        content = f.read()
                    documents.append(Document(text=content, metadata=self._get_file_metadata(file_path)))
                    file_tracker[file_path] = os.path.getmtime(file_path)
        self._save_file_tracker(file_tracker)
        return documents

    def _get_new_or_modified_documents(self):
        new_or_modified_docs = []
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
                        new_or_modified_docs.append(Document(text=content, metadata=self._get_file_metadata(file_path)))
                        file_tracker[file_path] = last_modified
        self._save_file_tracker(file_tracker)
        return new_or_modified_docs

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
        file_tracker_path = "file_tracker.json"
        if os.path.exists(file_tracker_path):
            with open(file_tracker_path, 'r') as f:
                return json.load(f)
        return {}

    def _save_file_tracker(self, tracker):
        file_tracker_path = "file_tracker.json"
        with open(file_tracker_path, 'w') as f:
            json.dump(tracker, f)

    def _getQueryEngine (self, source):
        vector_store = self.vector_store_manager.get_vector_store(source)
        retriever = VectorIndexRetriever(index=vector_store, similarity_top_k=30)
        query_engine = RetrieverQueryEngine.from_args(
            retriever,
            node_postprocessors=[],
            verbose=False
        )
        self.query_engine = query_engine

    def process_message(self, message):
        source = message.get("source")
        prompt = message.get("prompt")
        from_identity = message.get("from")

        response = self.query_engine.query(prompt)
        formatted_response = str(response)

        # Return the response via the 'forward' function
        result_message = {
            "to": from_identity,
            "request": prompt,
            "result": formatted_response
        }
        return self.forward(result_message)

    def forward(self, message):
        monitor.forward(message)

    def start_listening(self):
        if self.socket:
            @self.socket.on('llm')
            def handle_llm_message(message):
                self.process_message(message)
        else:
            # Handle case where socket is not available
            pass  # You can implement alternative handling here

            verbose=True
        
        
def main():
    print("Starting LLM Server")
    server = LLMServer()
    
    # List of test questions to evaluate the server's responses
    test_questions = [
        "What files are in the project?",
        "List all Python files and their paths.",
        "Describe the contents of the package.json file directory.",
        "What is the purpose of the llmserver.py file?",
        "Are there any shell scripts in the project? If so, what are they?",
        "What React components are defined in the client/src/Components directory?",
        "Explain the structure of the extension directory.",
        "What is the main functionality of the background.ts file in the extension directory?",
        "How many different programming languages are used in this project, and what are they?"
    ]
    
    for question in test_questions:
        enhanced_prompt = f"""
        Based on the following context about the project files and their contents, please answer the question:
        "{question}"
        Provide a detailed and accurate answer based solely on the information present in the project files.
        If the information is not available in the context, please state that clearly.
        If a file pathis not given correctly, please infer the correct file path.        List ALL relevant files, not just a subset. Be as specific and comprehensive as possible.
        """
        print(f"Question: {question}")
        message = {"prompt":enhanced_prompt, "from":"self", "source":"project_files"}
        response = server.process_message(message)
        print(f"{response['result']}\n")
        print("-" * 80)  # Separator for readability

    print("Test questions completed.")

# def main1 ():    
#     load_dotenv()  
#     openai_api_key = os.environ.get("OPENAI_API_KEY")
#     if not openai_api_key:
#         raise ValueError("OPENAI_API_KEY environment variable is not set")
#     print("API Key: ", openai_api_key)
#     messages = [
#         ChatMessage(
#             role="system", content="You are a pirate with a colorful personality"
#         ),
#         ChatMessage(role="user", content="What is your name"),
#     ]
#     resp = OpenAI().chat(messages)
#     print(resp)



from llama_index.embeddings.openai import OpenAIEmbedding

def makeServer(sio):
    print("Making LLMServer")
    server = LLMServer(sio)
    return server

if __name__ == "__main__":
    customprint.makeCustomPrint("out")
    # test_embedding_model()
    # exit(0)

    main()


    # Delete the "out" file if it exist