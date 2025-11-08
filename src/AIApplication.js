import Database from 'better-sqlite3';
import { ChromaClient } from 'chromadb';
import fetch from 'cross-fetch';
import { v4 as uuidv4 } from 'uuid';

export class AIApplication {
    constructor() {
        return (async () => {
            this.db = new Database('users.db', {});
            
            const setupUserTable = this.db.prepare(`CREATE TABLE IF NOT EXISTS users (user_id TEXT PRIMARY KEY, name TEXT, preferences JSON);`);
            
            const setupConversationTable = this.db.prepare(`CREATE TABLE IF NOT EXISTS conversations (id TEXT PRIMARY KEY, user_id TEXT, timestamp DATETIME, content TEXT, FOREIGN KEY (user_id) REFERENCES users(user_id));`);
            
            setupUserTable.run();
            setupConversationTable.run();
    
            this.addUserStatement = this.db.prepare("INSERT INTO users (user_id, name, preferences) VALUES (@userId, @name, @preferences)");
            this.getUserStatement = this.db.prepare("SELECT * FROM users WHERE user_id = ?");
            this.addUserConversation = this.db.prepare("INSERT INTO conversations (id, user_id, timestamp, content) VALUES (?, ?, ?, ?)");
            this.getUserConversation = this.db.prepare("SELECT * FROM conversations WHERE user_id = ?");
    
            this.chroma = new ChromaClient({path: "http://localhost:8888"});
            const collections = await this.chroma.listCollections();
            const existingCollection = collections.find(c => c.name === "user_context");
            this.collection = await this.chroma[existingCollection ? 'getCollection' : 'createCollection']({
                name: "user_context",
                embeddingFunction: { 
                    generate: async (texts) => {
                        const embeddings = [];
        
                        for (const text of texts) {
                            try {
                                const response = await fetch('http://localhost:11434/api/embeddings', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                        model: 'nomic-embed-text',
                                        prompt: text
                                    })
                                });
                                
                                if (!response.ok) {
                                    throw new Error(`HTTP ${response.status}`);
                                }
                                
                                const result = await response.json();
                                
                                if (result.embedding) {
                                    embeddings.push(result.embedding);
                                } else {
                                    throw new Error('No embedding in response');
                                }
                            } catch (error) {
                                console.warn(`Embedding generation failed: ${error.message}`);
                                // nomic-embed-text uses 768 dimensions fallback to zeros
                                embeddings.push(Array(768).fill(0)); 
                            }
                        }
                        
                        return embeddings;
                    }
                }
            });
            return this;
        })();
    }

    async addUser({userId, name, preferences}) {
        const user = this.getUserStatement.get(userId);
        if (user) return;
        this.addUserStatement.run({
            userId, 
            name, 
            preferences: JSON.stringify(preferences)
        })
    }

    async storeConversation(userId, content) {
        const conversationId = uuidv4();
        const timestamp = new Date().toISOString();
        this.addUserConversation.run(conversationId, userId, timestamp, content);
        
        await this.collection.add({
            ids: [conversationId],
            documents: [content],
            metadatas: [{ userId, timestamp }]
        });
    }

    async getRelevantContext(userId, currentQuery, maxResults = 5) {
        const user = this.getUserStatement.get(userId);

        const results = await this.collection.query({
            queryTexts: [currentQuery],
            nResults: maxResults,
            whereMetadata: { userId }
        });

        return {
            user,
            relevantConversations: results
        };
    }

    _preparePrompt(context, query) {
        const {user, relevantConversations} = context;
        const preferences = JSON.parse(user.preferences);
        const conversationSummary = relevantConversations.documents?.[0]?.slice(0, 3)
            .map((doc, idx) => `${idx + 1}. ${doc.substring(0, 200)}...`)
            .join('\n') || 'No previous conversations';

        return `Based on the following context about the user and their previous conversations,
            provide a personal and contextually relevant response to their query.

            User Information:
            Name: ${user.name}
            Dietary Requirements: ${preferences.dietary_requirements.join(', ')}
            Food Preferences: ${preferences.food_preferences.join(', ')}
            Recent relevant conversations: ${conversationSummary}
            Current query: ${query}`;
    }

    async generateResponse(userId, query) {
        const context = await this.getRelevantContext(userId, query);
        const prompt = this._preparePrompt(context, query);
        const response = await fetch('http://localhost:11434/api/generate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'mistral:7b-instruct-q4_K_M',
                prompt: prompt,
                stream: false,
                options: {
                    num_predict: 1024,// Limit response length (default is unlimited)
                    temperature: 0.7, // Lower = faster, more deterministic
                    top_p: 0.9,       // Nucleus sampling - can speed up
                    top_k: 40,        // Top-k sampling - can speed up
                    num_ctx: 2048,    // Reduce context window if your prompts are long
                }
            })
        });

        const result = await response.json();
        const aiResponse = result.response;

        await this.storeConversation(
            userId,
            [query,aiResponse].join("|")
        );

        return aiResponse;
    }

    async getConversation(userId) {
        return this.getUserConversation.all(userId);
    }

    async preWarm() {
        try {
            await fetch('http://localhost:11434/api/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: 'mistral:7b-instruct-q4_K_M',
                    prompt: 'test',
                    stream: false,
                    options: { 
                        num_predict: 1
                    }
                })
            });
            console.log('Ollama model pre-warmed');
        } catch (error) {
            console.warn('Failed to pre-warm Ollama:', error.message);
        }
    }
}