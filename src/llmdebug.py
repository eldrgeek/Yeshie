# llmdebug.py

import logging
import os
import json
from pathlib import Path
from dotenv import load_dotenv
import llama_index
import textwrap
from llama_index.core.schema import TextNode
from llama_index.embeddings.openai import OpenAIEmbedding

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
logging.getLogger("httpx").setLevel(logging.WARNING)

INSPECT_INDEX = False  # Set this to True if you want to inspect the index

def inspect_vector_index(index, max_chunks=10, text_preview_length=100):
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
        embedding_result = index._vector_store.get(node_id)
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


def test_embedding_model():
    load_dotenv()
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

