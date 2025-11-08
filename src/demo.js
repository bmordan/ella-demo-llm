import { AIApplication } from './AIApplication.js';

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