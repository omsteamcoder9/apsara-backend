import 'dotenv/config';
import { GoogleGenAI } from '@google/genai';

const apiKey = process.env.GEMINI_API_KEY;

console.log(
    'API KEY:',
    apiKey ? 'LOADED' : 'MISSING'
);

const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
        apiVersion: 'v1'
    }
});

try {
    const interaction = await ai.interactions.create({
        model: 'gemini-3.6-flash',
        input: 'Say hello in one sentence.'
    });

    console.log('==============================');
    console.log('GEMINI SUCCESS');
    console.log('==============================');

    console.log(interaction.output_text);

} catch (error) {
    console.log('==============================');
    console.log('GEMINI FAILED');
    console.log('==============================');

    console.error(error);
}