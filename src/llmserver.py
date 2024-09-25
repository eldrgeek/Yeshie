import logging
import os
from pathlib import Path
import json
from dotenv import load_dotenv
from llama_index.core.llms import ChatMessage
from llama_index.core import VectorStoreIndex, Document, StorageContext, load_index_from_storage
from llama_index.core.settings import Settings
from llama_index.embeddings.openai import OpenAIEmbedding
from llama_index.llms.openai import OpenAI
from llama_index.core.query_engine import RetrieverQueryEngine
from llama_index.core.retrievers import VectorIndexRetriever
import llama_index
print("CORE VERSION: ", llama_index.core.__version__)


from llama_index.core.schema import TextNode
import textwrap

USE_EXISTING_INDEX = True # Global flag to use existing index without updates
RECREATE_INDEX = False  # Global flag to force index recreation
INSPECT_INDEX = False

def inspect_vector_index(index: VectorStoreIndex, max_chunks: int = 10, text_preview_length: int = 100):
    """
    Print data and metadata from each chunk in a VectorStoreIndex.
    """
    print(f"Inspecting VectorStoreIndex: {index.__class__.__name__}")
    print(f"Total number of nodes: {len(index.docstore.docs)}")
    
    for i, (node_id, node) in enumerate(index.docstore.docs.items()):
        if i >= max_chunks:
            print(f"\nReached max_chunks limit ({max_chunks}). Exiting...")
            break
        
        print(f"\nChunk {i + 1}:")
        print(f"Node ID: {node_id}")
        
        # Fetch the embedding from the vector store
        embedding_result = index._vector_store.get(node_id)  # Changed from [node_id] to node_id
        embedding = None
        if isinstance(embedding_result, list) and len(embedding_result) > 0:
            embedding = embedding_result[0].embedding if hasattr(embedding_result[0], 'embedding') else None
        elif isinstance(embedding_result, float):
            print("Embedding result is a float, not an object with 'embedding' attribute.")
            embedding = embedding_result  # Assign the float directly to embedding
        
        if embedding is not None:
            print(f"Embedding size: {len(embedding)}")
        else:
            print("Embedding: Not available")
            print(f"Node attributes: {dir(node)}")
            print(f"Node type: {type(node)}")
        
        print("Metadata:")
        for key, value in node.metadata.items():
            print(f"  {key}: {value}")
        
        print("Text preview:")
        preview = textwrap.shorten(node.text, width=text_preview_length, placeholder="...")
        print(textwrap.indent(preview, "  "))
    
        print("\nInspection complete.")
        exit(0)


    # Example usage:
    # inspect_vector_index(your_vector_index)

print("RECREATE_INDEX: ", RECREATE_INDEX)
print("USE_EXISTING_INDEX: ", USE_EXISTING_INDEX)

import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
logging.getLogger("httpx").setLevel(logging.WARNING)
class LLMServer:
    def __init__(self):
        load_dotenv()
        self.index_name = "persistent_index"
        self.file_tracker_path = "file_tracker.json"
        self.openai_api_key = os.environ.get("OPENAI_API_KEY")
        if not self.openai_api_key:
            raise ValueError("OPENAI_API_KEY environment variable is not set")
        models = ["gpt-4o-2024-08-06", "gpt-3.5-turbo", "gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-4-turbo-preview"]
        Settings.llm = OpenAI(model=models[0], temperature=0)
        Settings.embed_model = OpenAIEmbedding(model="text-embedding-3-small")
        print("Using model: ", Settings.llm.model)
        
        # Test embedding model
        test_text = "This is a test sentence."
        try:
            test_embedding = Settings.embed_model.get_text_embedding(test_text)
            print(f"Test embedding successful. Shape: {len(test_embedding)}")
        except Exception as e:
            print(f"Error testing embedding model: {str(e)}")
        self.index = self._update_or_create_index()
    
        print("Index created")
        if INSPECT_INDEX:
            inspect_vector_index(self.index)
        self.retriever = self._create_retriever()
        print("Retriever created")

    def _create_index_with_error_handling(self, documents, embed_model):  # Added 'self'
        def embedding_error_handler(nodes, **kwargs):  
            for node in nodes:
                try:
                    # Attempt to generate embedding
                    _ = embed_model.get_text_embedding(node.text)
                except Exception as e:
                    logger.error(f"Failed to generate embedding for node {node.node_id}: {str(e)}")
                    logger.error(f"Node text preview: {node.text[:100]}...")
            return nodes

        index = VectorStoreIndex.from_documents(
            documents,
            embed_model=embed_model,
            transformations=[embedding_error_handler]
        )
        return index

    def _update_or_create_index(self):
        if os.path.exists(self.index_name) and not RECREATE_INDEX:
            if USE_EXISTING_INDEX:
                print("Using existing index without updates.")
                storage_context = StorageContext.from_defaults(persist_dir=self.index_name)
                return load_index_from_storage(storage_context)
            
            print("Checking for updates to existing index.")
            storage_context = StorageContext.from_defaults(persist_dir=self.index_name)
            index = load_index_from_storage(storage_context)
            new_or_modified_docs = self._get_new_or_modified_documents()
            if new_or_modified_docs:
                print("Updating existing index with new or modified documents.")
                for doc in new_or_modified_docs:
                    print(f"Inserting document: {doc.metadata['file_path']}")
                    index.insert(doc)
                index.storage_context.persist(persist_dir=self.index_name)
            else:
                print("No updates needed for existing index.")
            return index
        else:
            print("Creating new index.")
            documents = self._get_documents()
            # Updated usage of index creation
            index = self.create_index_with_logging(documents, Settings.embed_model)  # Assign index here
            index.storage_context.persist(persist_dir=self.index_name)
            return index
        
    def create_index_with_logging(self, documents, embed_model):
        from llama_index.core.node_parser import SimpleNodeParser
        from llama_index.core.schema import TextNode

        def node_postprocessor(node):
            try:
                if isinstance(node, TextNode):
                    if node.embedding is None:
                        print(f"Generating embedding for node {node.node_id}")
                        node.embedding = embed_model.get_text_embedding(node.text)
                    print(f"Node {node.node_id}: Embedding shape: {len(node.embedding) if node.embedding is not None else 'None'}")
                else:
                    print(f"Unexpected node type: {type(node)}")
            except Exception as e:
                print(f"Error processing node {node.node_id}: {str(e)}")
            return node

        parser = SimpleNodeParser.from_defaults()
        nodes = parser.get_nodes_from_documents(documents)
        processed_nodes = [node_postprocessor(node) for node in nodes]

        print(f"Created {len(processed_nodes)} nodes")

        index = VectorStoreIndex(nodes=processed_nodes)
        return index

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
                        print(f"Added {file_path} to update list")
        self._save_file_tracker(file_tracker)
        return new_or_modified_docs

    def _create_retriever(self):
        return VectorIndexRetriever(index=self.index, similarity_top_k=30)

    def _get_documents(self):
        documents = []
        file_tracker = self._load_file_tracker()
        file_tracker = {}
        for root, dirs, files in os.walk('.', topdown=True):
            dirs[:] = [d for d in dirs if not self._is_ignored(os.path.join(root, d))]
            for file in files:
                file_path = os.path.join(root, file)
                if not self._is_ignored(file_path) and (file.endswith(('.ts', '.tsx', '.py', '.sh')) or file == 'package.json'):
                    last_modified = os.path.getmtime(file_path)
                    if RECREATE_INDEX or file_path not in file_tracker or file_tracker[file_path] < last_modified:
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
        
        # Updated prompt for clarity and specificity
        enhanced_prompt = f"""
        Based on the following context about the project files and their contents, please answer the question:
        "{message}"
        Provide a detailed and accurate answer based solely on the information present in the project files.
        If the information is not available in the context, please state that clearly.
        If a file pathis not given correctly, please infer the correct file path.        List ALL relevant files, not just a subset. Be as specific and comprehensive as possible.
        """
        
        response = query_engine.query(enhanced_prompt)
        logging.info(f"Raw response: {response}")
        
        formatted_response = "\n" + str(response)
        return formatted_response

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
        print(f"\nQuestion: {question}")
        response = server.process_message(question)
        print(f"Response: {response}\n")
        print("-" * 80)  # Separator for readability

    print("Test questions completed.")

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



def makeCustomPrint(filepath):
    import builtins

    if os.path.exists(filepath):
        os.remove(filepath)
    
    oldprint = builtins.print
    
    def custom_print(*args, **kwargs):
        oldprint(*args, flush=True, **kwargs)
        with open(filepath, "a") as f:
            oldprint(*args, file=f, flush=True, **kwargs)
    
    builtins.old_print = oldprint
    builtins.print = custom_print

from llama_index.embeddings.openai import OpenAIEmbedding

def test_embedding_model():
    load_dotenv()  # Ensure environment variables are loaded
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        print("Error: OPENAI_API_KEY not found in environment variables.")
        return

    embed_model = OpenAIEmbedding(api_key=api_key, model="text-embedding-3-small")
    test_text = "This is a test sentence for embedding."
    
    try:
        embedding = embed_model.get_text_embedding(test_text)
        print(f"Embedding generated successfully.")
        print(f"Embedding dimension: {len(embedding)}")
        print(f"First few values: {embedding[:5]}")
    except Exception as e:
        print(f"Failed to generate embedding: {str(e)}")
        print("Check your API key and network connection.")

if __name__ == "__main__":
    makeCustomPrint("out")
    # test_embedding_model()
    # exit(0)

    main()


    # Delete the "out" file if it exist