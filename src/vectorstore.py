import os
import json
import shutil
import logging
from pathlib import Path
from llama_index.core import VectorStoreIndex, StorageContext, load_index_from_storage

from llama_index.vector_stores.chroma import ChromaVectorStore
import chromadb
from llama_index.embeddings.openai import OpenAIEmbedding
from llama_index.core.settings import Settings
import time

class Handler:
    def __init__(self, store_type: str, index_path: Path):
        self.store_type = store_type
        self.index_path = index_path

    def create_store(self, embed_model: str) -> VectorStoreIndex:
        """Create a new vector store."""
        raise NotImplementedError

    def load_store(self) -> VectorStoreIndex:
        """Load an existing vector store."""
        raise NotImplementedError

    def add_to_store(self, index: VectorStoreIndex, documents: list) -> None:
        """Add documents to the vector store."""
        raise NotImplementedError

    def update_store(self, index: VectorStoreIndex, documents: list) -> None:
        """Update the vector store with new documents."""
        self.add_to_store(index, documents)

    def _insert_documents(self, index: VectorStoreIndex, documents: list) -> None:
        """Insert documents into the vector store and persist."""
        for doc in documents:
            index.insert(doc)
        index.storage_context.persist(persist_dir=self.index_path)

class BasicHandler(Handler):
    def create_store(self, embed_model: str) -> VectorStoreIndex:
        """Create a basic vector store."""
        try:
            os.makedirs(self.index_path, exist_ok=True)
            logging.info(f"Creating basic store at {self.index_path}")
        except OSError as e:
            raise RuntimeError(f"Failed to create directory {self.index_path}: {e}")

        index = VectorStoreIndex([], embed_model=embed_model)
        index.storage_context.persist(persist_dir=self.index_path)
        return index

    def load_store(self) -> VectorStoreIndex:
        """Load a basic vector store."""
        try:
            storage_context = StorageContext.from_defaults(persist_dir=self.index_path)
            return load_index_from_storage(storage_context)
        except json.JSONDecodeError as e:
            logging.warning(f"JSON decode error loading vector store at {self.index_path}: {e}")
            logging.info(f"Recreating corrupted vector store at {self.index_path}")
            # Check if docstore.json exists and is empty
            docstore_path = self.index_path / "docstore.json"
            if docstore_path.exists() and docstore_path.stat().st_size == 0:
                # Remove empty file
                os.remove(docstore_path)
                logging.info(f"Removed empty docstore.json file")
            # Create a new store
            return self.create_store(Settings.embed_model)

    def add_to_store(self, index: VectorStoreIndex, documents: list) -> None:
        """Add documents to the basic vector store."""
        self._insert_documents(index, documents)

class ChromaHandler(Handler):
    def create_store(self, embed_model: str) -> VectorStoreIndex:
        """Create a Chroma vector store."""
        try:
            os.makedirs(self.index_path, exist_ok=True)
            logging.info(f"Creating Chroma store at {self.index_path}")
        except OSError as e:
            raise RuntimeError(f"Failed to create directory {self.index_path}: {e}")

        chroma_client = chromadb.PersistentClient(path=self.index_path)
        chroma_collection = chroma_client.create_collection("default")
        vector_store = ChromaVectorStore(chroma_collection=chroma_collection)
        storage_context = StorageContext.from_defaults(vector_store=vector_store)
        index = VectorStoreIndex([], storage_context=storage_context, embed_model=embed_model)
        index.storage_context.persist(persist_dir=self.index_path)
        return index

    def load_store(self) -> VectorStoreIndex:
        """Load a Chroma vector store."""
        try:
            chroma_client = chromadb.PersistentClient(path=self.index_path)
            chroma_collection = chroma_client.get_or_create_collection("default")
            vector_store = ChromaVectorStore(chroma_collection=chroma_collection)
            storage_context = StorageContext.from_defaults(vector_store=vector_store, persist_dir=self.index_path)
            return VectorStoreIndex.from_vector_store(vector_store, storage_context=storage_context)
        except json.JSONDecodeError as e:
            logging.warning(f"JSON decode error loading Chroma vector store at {self.index_path}: {e}")
            logging.info(f"Recreating corrupted Chroma vector store at {self.index_path}")
            # Check if docstore.json exists and is empty
            docstore_path = self.index_path / "docstore.json"
            if docstore_path.exists() and docstore_path.stat().st_size == 0:
                # Remove empty file
                os.remove(docstore_path)
                logging.info(f"Removed empty docstore.json file")
            # Create a new store
            return self.create_store(Settings.embed_model)

    def add_to_store(self, index: VectorStoreIndex, documents: list) -> None:
        """Add documents to the Chroma vector store."""
        self._insert_documents(index, documents)

class VectorStoreManager:
    def __init__(self):
        self.index_base_path = Path("vector_stores")
        self.vs_index_path = self.index_base_path / "vector_store_index.json"
        self.vs_index = self.load_vsIndex()

    def load_vsIndex(self) -> dict:
        """Load the vector store index from a JSON file."""
        if self.vs_index_path.exists():
            with open(self.vs_index_path, 'r') as f:
                return json.load(f)
        return {}

    def save_vsIndex(self) -> None:
        """Save the vector store index to a JSON file."""
        # Create the directory and any necessary parent directories
        self.vs_index_path.parent.mkdir(parents=True, exist_ok=True)
        
        # Now save the index file
        with open(self.vs_index_path, 'w') as f:
            json.dump(self.vs_index, f, indent=2)

    def get_handler(self, store_type: str, index_path: Path) -> Handler:
        """Get the appropriate handler for the specified store type."""
        if store_type == "basic":
            return BasicHandler(store_type, index_path)
        elif store_type == "chroma":
            return ChromaHandler(store_type, index_path)
        else:
            raise ValueError(f"Unknown store type: {store_type}")

    def vector_store_exists(self, name: str) -> bool:
        """Check if a vector store exists and is valid."""
        if name not in self.vs_index:
            return False
            
        # Check if the store files exist
        store_info = self.vs_index[name]
        store_path = Path(store_info["path"])
        if not store_path.exists():
            # Clean up invalid entry
            del self.vs_index[name]
            self.save_vsIndex()
            return False
            
        return True

    def get_store_timestamp(self, name: str) -> float:
        """Get the last update timestamp of a vector store."""
        if name in self.vs_index:
            timestamp = self.vs_index[name].get("last_update", 0.0)
            # Ensure we have a valid timestamp with microsecond precision
            if isinstance(timestamp, (int, float)):
                return float(timestamp)
            return 0.0
        raise ValueError(f"Vector store '{name}' not found.")

    def update_store_timestamp(self, name: str) -> None:
        """Update the timestamp of a vector store to current time."""
        if name in self.vs_index:
            self.vs_index[name]["last_update"] = time.time()
            self.save_vsIndex()
        else:
            raise ValueError(f"Vector store '{name}' not found.")

    def add_vector_store(self, name: str, store_type: str) -> VectorStoreIndex:
        """Add a new vector store to the manager."""
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
                "path": str(index_path),
                "last_update": time.time()
            }
            self.save_vsIndex()
            return index
        else:
            return self.get_vector_store(name)

    def get_vector_store(self, name: str) -> VectorStoreIndex:
        """Retrieve a vector store by name."""
        if name in self.vs_index:
            store_info = self.vs_index[name]
            handler = self.get_handler(store_info["type"], store_info["path"])
            logging.info(f"Preloading vector store '{name}'")
            return handler.load_store()
        else:
            raise ValueError(f"Vector store '{name}' not found.")

    def add_to_vector_store(self, name: str, documents: list) -> None:
        """Add documents to a specified vector store."""
        if name in self.vs_index:
            store_info = self.vs_index[name]
            handler = self.get_handler(store_info["type"], store_info["path"])
            try:
                index = handler.load_store()
                handler.add_to_store(index, documents)
                # Update timestamp on successful addition
                self.update_store_timestamp(name)
            except Exception as e:
                logging.error(f"Error adding to vector store '{name}': {e}")
                # Attempt to recreate the store if it's corrupted
                try:
                    logging.warning(f"Attempting to recreate vector store '{name}'")
                    index = handler.create_store(Settings.embed_model)
                    handler.add_to_store(index, documents)
                    # Update timestamp on successful recreation
                    self.update_store_timestamp(name)
                    logging.info(f"Successfully recreated vector store '{name}'")
                except Exception as recovery_err:
                    logging.error(f"Failed to recover vector store '{name}': {recovery_err}")
                    raise recovery_err
        else:
            raise ValueError(f"Vector store '{name}' not found.")

    def update_vector_store(self, name: str, documents: list) -> None:
        """Update a specified vector store with new documents."""
        if name in self.vs_index:
            store_info = self.vs_index[name]
            handler = self.get_handler(store_info["type"], store_info["path"])
            index = handler.load_store()
            handler.update_store(index, documents)
        else:
            raise ValueError(f"Vector store '{name}' not found.")

    def get_index_path(self) -> str:
        """Get the base path for vector stores."""
        return str(self.index_base_path)
    
    def remove_vector_store(self, name: str) -> bool:
        """Remove a vector store by name."""
        if name in self.vs_index:
            store_info = self.vs_index[name]
            store_path = Path(store_info["path"])

            # Remove the store's files
            if store_path.exists():
                try:
                    shutil.rmtree(store_path)
                    logging.info(f"Removed vector store files for '{name}'")
                except Exception as e:
                    logging.error(f"Error removing vector store files for '{name}': {e}")
                    return False

            # Remove the store from the index
            del self.vs_index[name]
            self.save_vsIndex()
            logging.info(f"Removed '{name}' from the vector store index")
            return True
        else:
            logging.warning(f"Vector store '{name}' not found")
            return False

    def get_store_path(self, name: str) -> Path:
        """Get the path of a specified vector store."""
        if name in self.vs_index:
            return Path(self.vs_index[name]["path"])
        else:
            raise ValueError(f"Vector store '{name}' not found.")

def getManager() -> VectorStoreManager:
    """Get an instance of the VectorStoreManager."""
    return VectorStoreManager()