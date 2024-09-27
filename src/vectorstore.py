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
class VectorStoreManager:
    def __init__(self):
        self.vector_stores = {}
        self.index_base_path = "indexes"
        if not os.path.exists(self.index_base_path):
            os.makedirs(self.index_base_path)

    def add_vector_store(self, name, creator, maintainer):
        store_info = {
            "name": name,
            "store": None,
            "creator": creator,
            "maintainer": maintainer
        }
        self.vector_stores[name] = store_info
        self.load_or_create_vector_store(name)

    def load_or_create_vector_store(self, name):
        store_info = self.vector_stores.get(name)
        if store_info is None:
            raise ValueError(f"Vector store '{name}' not found.")
        index_path = os.path.join(self.index_base_path, name)
        if os.path.exists(index_path):
            # Load existing index
            storage_context = StorageContext.from_defaults(persist_dir=index_path)
            index = load_index_from_storage(storage_context)
            store_info["store"] = index
        else:
            # Create new index
            index = store_info["creator"]()
            index.storage_context.persist(persist_dir=index_path)
            store_info["store"] = index

    def get_vector_store(self, name):
        store_info = self.vector_stores.get(name)
        if store_info is None:
            raise ValueError(f"Vector store '{name}' not found.")
        return store_info["store"]

    def maintain_vector_store(self, name):
        store_info = self.vector_stores.get(name)
        if store_info is None:
            raise ValueError(f"Vector store '{name}' not found.")
        store_info["maintainer"](store_info["store"])

def makeStore():
    store = VectorStoreManager()
    return store

    # Delete the "out" file if it exist