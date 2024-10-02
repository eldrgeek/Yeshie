import os
import json
import shutil  # New import
from pathlib import Path
from llama_index.core import VectorStoreIndex, StorageContext, load_index_from_storage
from llama_index.vector_stores.chroma import ChromaVectorStore
import chromadb
from llama_index.embeddings.openai import OpenAIEmbedding
from llama_index.core.settings import Settings

class Handler:
    def __init__(self, store_type, index_path):
        self.store_type = store_type
        self.index_path = index_path

    def create_store(self):
        raise NotImplementedError

    def load_store(self):
        raise NotImplementedError

    def add_to_store(self, documents):
        raise NotImplementedError

    def update_store(self, documents):
        raise NotImplementedError

class BasicHandler(Handler):
    def create_store(self, embed_model):
        index = VectorStoreIndex([], embed_model=embed_model)
        os.makedirs(self.index_path, exist_ok=True)
        index.storage_context.persist(persist_dir=self.index_path)
        return index

    def load_store(self):
        storage_context = StorageContext.from_defaults(persist_dir=self.index_path)
        return load_index_from_storage(storage_context)

    def add_to_store(self, index, documents):
        for doc in documents:
            index.insert(doc)
        index.storage_context.persist(persist_dir=self.index_path)

    def update_store(self, index, documents):
        self.add_to_store(index, documents)

class ChromaHandler(Handler):
    def create_store(self, embed_model):
        os.makedirs(self.index_path, exist_ok=True)
        chroma_client = chromadb.PersistentClient(path=self.index_path)
        chroma_collection = chroma_client.create_collection("default")
        vector_store = ChromaVectorStore(chroma_collection=chroma_collection)
        storage_context = StorageContext.from_defaults(vector_store=vector_store)
        index = VectorStoreIndex([], storage_context=storage_context, embed_model=embed_model)
        index.storage_context.persist(persist_dir=self.index_path)
        return index

    def load_store(self):
        chroma_client = chromadb.PersistentClient(path=self.index_path)
        chroma_collection = chroma_client.get_or_create_collection("default")
        vector_store = ChromaVectorStore(chroma_collection=chroma_collection)
        storage_context = StorageContext.from_defaults(vector_store=vector_store, persist_dir=self.index_path)
        return VectorStoreIndex.from_vector_store(vector_store, storage_context=storage_context)

    def add_to_store(self, index, documents):
        for doc in documents:
            index.insert(doc)
        index.storage_context.persist(persist_dir=self.index_path)

    def update_store(self, index, documents):
        self.add_to_store(index, documents)

class VectorStoreManager:
    def __init__(self):
        self.index_base_path = Path("vector_stores")
        self.vs_index_path = self.index_base_path / "vector_store_index.json"
        self.vs_index = self.load_vsIndex()

    def load_vsIndex(self):
        if self.vs_index_path.exists():
            with open(self.vs_index_path, 'r') as f:
                return json.load(f)
        return {}

    def save_vsIndex(self):
        self.index_base_path.mkdir(parents=True, exist_ok=True)
        with open(self.vs_index_path, 'w') as f:
            json.dump(self.vs_index, f, indent=2)

    def get_handler(self, store_type, index_path):
        if store_type == "basic":
            return BasicHandler(store_type, index_path)
        elif store_type == "chroma":
            return ChromaHandler(store_type, index_path)
        else:
            raise ValueError(f"Unknown store type: {store_type}")

    def add_vector_store(self, name, store_type):
        if name not in self.vs_index:
            index_path = self.index_base_path / store_type / name
            handler = self.get_handler(store_type, index_path)
            
            if index_path.exists():
                index = handler.load_store()
            else:
                index = handler.create_store(Settings.embed_model)
            
            self.vs_index[name] = {
                "name": name,
                "type": store_type,
                "path": str(index_path)
            }
            self.save_vsIndex()
            return index
        else:
            return self.get_vector_store(name)

    def get_vector_store(self, name):
        if name in self.vs_index:
            store_info = self.vs_index[name]
            handler = self.get_handler(store_info["type"], store_info["path"])
            print("Preload")
            return handler.load_store()
        else:
            raise ValueError(f"Vector store '{name}' not found.")

    def add_to_vector_store(self, name, documents):
        if name in self.vs_index:
            store_info = self.vs_index[name]
            handler = self.get_handler(store_info["type"], store_info["path"])
            index = handler.load_store()
            handler.add_to_store(index, documents)
        else:
            raise ValueError(f"Vector store '{name}' not found.")

    def update_vector_store(self, name, documents):
        if name in self.vs_index:
            store_info = self.vs_index[name]
            handler = self.get_handler(store_info["type"], store_info["path"])
            index = handler.load_store()
            handler.update_store(index, documents)
        else:
            raise ValueError(f"Vector store '{name}' not found.")

    def get_index_path(self):
        return str(self.index_base_path)
    
    def remove_vector_store(self, name):
        if name in self.vs_index:
            store_info = self.vs_index[name]
            store_path = Path(store_info["path"])

            # Remove the store's files
            if store_path.exists():
                try:
                    shutil.rmtree(store_path)
                    print(f"Removed vector store files for '{name}'")
                except Exception as e:
                    print(f"Error removing vector store files for '{name}': {e}")
                    return False

            # Remove the store from the index
            del self.vs_index[name]
            self.save_vsIndex()
            print(f"Removed '{name}' from the vector store index")
            return True
        else:
            print(f"Vector store '{name}' not found")
            return False

    def get_store_path(self, name):  # New method
        if name in self.vs_index:
            return Path(self.vs_index[name]["path"])
        else:
            raise ValueError(f"Vector store '{name}' not found.")

def getManager():  # New function
    return VectorStoreManager()