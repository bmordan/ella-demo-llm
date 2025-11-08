import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { AIApplication } from './src/AIApplication.js';

(async () => {
    try {
        const aiApp = await new AIApplication();
        aiApp.preWarm();
        console.log('AIApplication initialized successfully');

        const app = express();
        app.use(express.json());

        app.post('/users', async (req, res) => {
            const { name, preferences } = req.body;
            const userId = uuidv4();
            await aiApp.addUser({userId, name, preferences});
            res.json({ message: `User ${userId} added successfully` });
        });

        app.post('/ai/:userId', async (req, res) => {
            const { userId } = req.params;
            const { query } = req.body;
            const response = await aiApp.generateResponse(userId, query);
            res.json({ response });
        });


        app.get('/ai/:userId/conversations', async (req, res) => {
            const { userId } = req.params;
            const data = await aiApp.getConversation(userId);
            const conversations = data.map(c => {
                const [
                    query,
                    response
                ] = c.content.split("|");
                return {
                    id: c.id,
                    user_id: c.user_id,
                    timestamp: c.timestamp,
                    content: [
                        query,
                        response
                    ]
                };
            });
            res.json(conversations);
        });

        app.listen(7777, () => {
            console.log('AI Ella API is running on port 7777');
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
})();