import Database from 'better-sqlite3';
import { ChromaClient } from 'chromadb';
import fetch from 'cross-fetch';
import { v4 as uuidv4 } from 'uuid';

class AIApplication {
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
    
            this.chroma = new ChromaClient({path: "http://localhost:8888"});
            const collections = await this.chroma.listCollections();
            const existingCollection = collections.find(c => c.name === "user_context");
            this.collection = await this.chroma[existingCollection ? 'getCollection' : 'createCollection']({
                name: "user_context",
                embeddingFunction: { 
                    generate: async (texts) => {
                        return texts.map(() => Array(1536).fill(0).map(() => Math.random()));
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

        // Store in SQL database
        this.addUserConversation.run(conversationId, userId, timestamp, content);

        // Store in vector database
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

        return `Based on the following context about the user and their previous conversations,
            provide a personal and contextually relevant response to their query.

            User Information:
            Name: ${user.name}
            Dietary Requirements: ${preferences.dietary_requirements.join(', ')}
            Food Preferences: ${preferences.food_preferences.join(', ')}
            
            Recent relevant conversations:
            ${JSON.stringify(relevantConversations, null, 2)}

            Current query: ${query}`;
    }

    async generateResponse(userId, query) {
        // Get context
        const context = await this.getRelevantContext(userId, query);
        
        // Prepare prompt with context
        const prompt = this._preparePrompt(context, query);

        // Call local LLM (using Ollama)
        const response = await fetch('http://localhost:11434/api/generate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'mistral',
                prompt: prompt,
                stream: false
            })
        });

        const result = await response.json();
        const aiResponse = result.response;

        // Store the conversation
        await this.storeConversation(
            userId,
            `User: ${query}\nAssistant: ${aiResponse}`
        );

        return aiResponse;
    }
}

async function runDemo() {
    const app = await new AIApplication();

    app.addUser({userId: 1, name: "Bernie", preferences: {
        dietary_requirements: ['vegan', 'gluten-free'],
        food_preferences: ['spicy food', 'Thai cuisine', 'salads']
    }})

    app.addUser({userId: 2, name: "Elen", preferences: {
        dietary_requirements: ['pescatarian', 'lactose-free'],
        food_preferences: ['Japanese cuisine', 'seafood', 'Mediterranean']
    }})

    // Generate responses for both users
    console.log('Bernie asks about dinner:\n');
    const response1 = await app.generateResponse(
        1,
        "What should I cook for dinner tonight? I'm in the mood for something filling."
    );
    console.log(response1);

    console.log('\nEllen asks about lunch:\n');
    const response2 = await app.generateResponse(
        2,
        "Can you suggest a quick lunch recipe that fits my dietary requirements?"
    );
    console.log(response2);

    // Follow-up question demonstrating context awareness
    console.log('\nBernie asks about leftovers:\n');
    const response3 = await app.generateResponse(
        1,
        "I have some leftover vegetables from yesterday. Any ideas?"
    );
    console.log(response3);
}

runDemo();