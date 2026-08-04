# Setting up Graphify for AI Memory

## Overview
This guide provides instructions on how to set up Graphify, an AI memory context solution, for this project. Graphify helps overcome context window limitations in Large Language Models (LLMs) by acting as a memory layer or knowledge graph, allowing the AI to retain long-term memory, keep track of past interactions, and retrieve relevant context efficiently.

## Prerequisites
- A running instance of the project.
- Access to the LLM backend (e.g., Gemini or Groq as used in this project).
- Environment variables configured for Graphify (API keys or database connections).

## Installation

1. **Install Dependencies**
   Navigate to the backend directory and install the necessary Python packages for Graphify:
   ```bash
   cd backend
   pip install graphify  # (Or the specific package name used for the graph memory implementation)
   ```

2. **Configure Environment Variables**
   Add the following variables to your `backend/.env` file:
   ```env
   GRAPHIFY_API_KEY=your_api_key_here
   GRAPHIFY_ENDPOINT=your_graphify_endpoint_here
   ```

## Integration into the Pipeline

1. **Initialize the Graph Memory Client**
   In your AI lead scoring or generation module, initialize the Graphify client to manage context.

2. **Storing Context**
   Whenever a new lead is processed or an LLM interaction occurs, push the key entities and relationships into Graphify:
   ```python
   # Example pseudo-code
   graphify.add_node(lead_id, properties={"niche": "restaurant", "city": "Kochi"})
   graphify.add_relation(lead_id, "SCORED", score_value)
   ```

3. **Retrieving Context**
   Before making a new LLM call, query Graphify to retrieve relevant historical context to inject into the prompt, thereby saving token limits and maintaining long-term context memory.
   ```python
   # Example pseudo-code
   context = graphify.get_context(lead_id)
   prompt = f"Given the previous context: {context}\nScore this new interaction..."
   ```

## Best Practices
- **Prune Old Memory:** Regularly clean up or archive stale nodes in the graph to maintain retrieval speed.
- **Entity Resolution:** Ensure that similar entities (e.g., duplicate business names) are merged in the graph.
- **Cost Management:** Monitor the size of the graph and the number of read/write operations to keep cloud costs under control.
