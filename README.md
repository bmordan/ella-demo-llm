# Ella Demo LLM

This is a simple demo of the RAG pattern with some persistance of user context for the llm generated responses.
It leverages the Olama model from ~~The Facebook~~ ~~Facebook~~ Meta.

## ChromaDB

This this bad boy up and running with 

```
docker run -d -p 8888:8000 chromadb/chroma:latest
```

## Ollama

Make sure you have installed [Ollama](https://ollama.com/download/mac) and have that running too.
I'm using 2 different Ollama models one for embedding `nomic-embed-text` and `mistral:7b-instruct-q4_K_M` you will need to download these:

```sh
ollama pull nomic-embed-text
ollama pull mistral:7b-instruct-q4_K_M
```

## RAG (Retrieval-Augmented Generation)

1. Client Request: The flow starts when the Client sends a POST request to the Server.
1. Phase 1: Retrieve: The Server calls generateResponse on the AIApplication. This class first enters the "Retrieve" phase, fetching the user's preferences from SQLite and simultaneously querying ChromaDB for semantically similar past conversations.
1. Phase 2: Augment: The "Augment" phase is a simple but critical step. The application takes all the retrieved context (user info + past conversations) and augments the user's new query, building a rich, detailed prompt.
1. Phase 3: Generate: This augmented prompt is sent to the Ollama (LLM). The LLM doesn't just see "What about lunch?"; it sees "User: Bob, Prefs: vegan, Past Convo: '...loves spicy tofu...', Query: 'What about lunch?'". This is what allows the LLM to generate a relevant, personal response.
1. Phase 4: Store: Before sending the response back, the app stores the new "query and response" pair in both databases. It's stored in SQLite for retrieving the exact conversation history and in ChromaDB as a new embedding, making this conversation available for future RAG retrievals.
1. Response: Finally, the generated text is returned to the Server, which sends it back to the Client.

This diagram clearly shows the separation of concerns and the data flow that makes the RAG pattern so powerful.

![RAG Sequence diagram](https://private-user-images.githubusercontent.com/4499581/511692157-73f47131-59ff-42cb-b1bb-081fac76c09e.png?jwt=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJnaXRodWIuY29tIiwiYXVkIjoicmF3LmdpdGh1YnVzZXJjb250ZW50LmNvbSIsImtleSI6ImtleTUiLCJleHAiOjE3NjI2MTk3ODIsIm5iZiI6MTc2MjYxOTQ4MiwicGF0aCI6Ii80NDk5NTgxLzUxMTY5MjE1Ny03M2Y0NzEzMS01OWZmLTQyY2ItYjFiYi0wODFmYWM3NmMwOWUucG5nP1gtQW16LUFsZ29yaXRobT1BV1M0LUhNQUMtU0hBMjU2JlgtQW16LUNyZWRlbnRpYWw9QUtJQVZDT0RZTFNBNTNQUUs0WkElMkYyMDI1MTEwOCUyRnVzLWVhc3QtMSUyRnMzJTJGYXdzNF9yZXF1ZXN0JlgtQW16LURhdGU9MjAyNTExMDhUMTYzMTIyWiZYLUFtei1FeHBpcmVzPTMwMCZYLUFtei1TaWduYXR1cmU9ODg1MzYzMTI0NWM3Zjg0YjU3YzI1NmQxMDdiMDg4M2I2ZWIxMzAxY2YzYzI3OTM3ZWRiODQyYzYxYjFhMGYyMSZYLUFtei1TaWduZWRIZWFkZXJzPWhvc3QifQ.zha5u0SZPjPO-4ogBD0ose8DR3SYz0lyyb7lHFSsO90)
