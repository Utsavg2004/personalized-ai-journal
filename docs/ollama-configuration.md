# Local Ollama Configuration

This guide details how to switch the LLM provider from the cloud-based OpenRouter to a local, privacy-first Ollama instance. This allows the Personalized AI Journal application to perform Retrieval-Augmented Generation (RAG) completely offline, fulfilling the assignment's provider abstraction requirements (Phase 9 & 10).

## 1. Install Ollama
If you haven't already, download and install Ollama from [ollama.com](https://ollama.com).

## 2. Pull a Compatible Model
Open your terminal and pull a lightweight instruct model. For a good balance of speed and reasoning in a RAG pipeline, `llama3.2` or `llama3.1:8b` is recommended.

```bash
ollama run llama3.2
```

Keep Ollama running in the background. By default, it binds to `http://localhost:11434`.

## 3. Configure the Application
Open the `backend/.env` file (or your root `.env` if using a unified setup) and update the LLM configuration section:

```dotenv
# ------------------------------------------------------------------------------
# LLM Provider Configuration
# ------------------------------------------------------------------------------
# Switch the provider to ollama
LLM_PROVIDER=ollama

# Point to the local Ollama API
LLM_BASE_URL=http://localhost:11434

# API Key is not required for local Ollama, leave blank
LLM_API_KEY=

# Set the model name exactly as it appears in `ollama list`
LLM_MODEL_NAME=llama3.2
```

## 4. How the Abstraction Works
The RAG Service (`rag.service.js`) and the core business logic **do not change** when you switch providers. 

The `LLMFactory` (`backend/src/services/llmProviders/index.js`) reads the `LLM_PROVIDER` environment variable at startup and instantiates the `ollamaProvider.js` implementation. The Ollama provider maps the standard `generateCompletion({ messages })` contract to Ollama's specific `/api/chat` REST structure (disabling streaming to return a single JSON object).

## 5. Verification
When you ask a question in the application's chat interface:
1. The backend will embed the question and retrieve relevant vectors.
2. The context and question will be sent to `http://localhost:11434/api/chat`.
3. You will see the local GPU/CPU spin up, and the terminal RAG logs will show:
   `[RAG] [LLM_REQUEST_STARTED] provider="ollama" model="llama3.2"`
