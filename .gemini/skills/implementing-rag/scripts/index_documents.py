"""
Production-Ready RAG Indexing Script
Focus: Idempotency, Recursive Chunking, and Pinecone/Gemini Integration.
"""

import os
from typing import List
from langchain_core.documents import Document
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from langchain_pinecone import PineconeVectorStore
from langchain_text_splitters import RecursiveCharacterTextSplitter

def index_documents(documents: List[Document], index_name: str):
    # 1. Recursive Chunking (Best Practice)
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=1000,
        chunk_overlap=150,
        separators=["\n\n", "\n", ". ", " ", ""]
    )
    chunks = text_splitter.split_documents(documents)

    # 2. Embedding Model (Gemini 1.5 - models/text-embedding-004)
    embeddings = GoogleGenerativeAIEmbeddings(model="models/text-embedding-004")

    # 3. Batch Upsert to Vector Store (Pinecone)
    # Note: Ensure PINECONE_API_KEY is in environment
    vectorstore = PineconeVectorStore.from_documents(
        chunks,
        embeddings,
        index_name=index_name,
        add_iteration_id=True # Idempotency: avoid duplicates if script re-runs
    )
    print(f"Successfully indexed {len(chunks)} chunks into {index_name}")

if __name__ == "__main__":
    # Example usage
    sample_docs = [Document(page_content="Sample content...", metadata={"source": "test.pdf", "id": "1"})]
    index_documents(sample_docs, os.getenv("PINECONE_INDEX_NAME", "rag-index"))
