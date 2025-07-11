// Imports
import dotenv from 'dotenv';
dotenv.config();
import { Client, GatewayIntentBits, REST, Routes, Partials, MessageFlags } from 'discord.js';
import axios from 'axios';
import chalk from 'chalk';
import figlet from 'figlet';
import gradient from 'gradient-string';
import admin from 'firebase-admin';
import express from 'express';
import cors from 'cors';

// Import Firebase service account configuration using fs
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const firebaseServiceAccount = JSON.parse(
    readFileSync(join(__dirname, 'firebaseServiceAccountKey.json'), 'utf8'),
);

// Defines
let res; // ChatGPT Thread Identifier
const app = express(); // Express App

app.use(express.json());
app.use(cors());

// Discord Slash Commands Defines
const commands = [
    {
        name: 'ask-gpt',
        description: 'Ask Anything with GPT!',
        options: [
            {
                name: 'question',
                description: 'Your question',
                type: 3,
                required: true,
            },
        ],
    },
    {
        name: 'ask-bing',
        description: 'New! Ask Anything with Bing!',
        options: [
            {
                name: 'question',
                description: 'Your question',
                type: 3,
                required: true,
            },
        ],
    },
    {
        name: 'toggle-session',
        description: 'Toggle Private or Public Chat Session',
    },
    {
        name: 'reset-chat',
        description: 'Start A Fresh Chat Session',
    },
    {
        name: 'ping',
        description: 'Check Websocket Heartbeat & Roundtrip Latency',
    },
    {
        name: 'help',
        description: 'Show what commands are available',
    },
];

// Axios instance for ChatGPT Proxy
const api = axios.create({
    baseURL: process.env.CHATGPT_PROXY_URL,
});

// Initialize OpenAI Session (Now active if initial prompt is set)
async function initOpenAI() {
    if (!process.env.CHATGPT_INITIAL_PROMPT) return;
    try {
        res = await api.post('/conversation', {
            message: process.env.CHATGPT_INITIAL_PROMPT,
            stream: false,
            clientOptions: {
                clientToUse: process.env.CLIENT_TO_USE,
            },
        });
        console.log(chalk.greenBright(`Connected to OpenAI API - ${res.data.response}`));
    } catch (error) {
        console.error(chalk.red(`[initOpenAI] - ${error}`));
    }
}

// Initialize Discord Application Commands
async function initDiscordCommands() {
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN);
    console.log('[initDiscordCommands] - Started refreshing application commands (/)');
    try {
        const response = await rest.put(Routes.applicationCommands(process.env.DISCORD_CLIENT_ID), {
            body: commands,
        });
        return response;
    } catch (error) {
        throw new Error(error);
    }
}

async function initFirebaseAdmin() {
    admin.initializeApp({
        credential: admin.credential.cert(firebaseServiceAccount),
        databaseURL: `https://${firebaseServiceAccount.project_id}.firebaseio.com`,
    });
    const db = admin.firestore();
    db.settings({ ignoreUndefinedProperties: true });
    console.log(chalk.greenBright('[initFirebaseAdmin] - Connected to Firebase Firestore'));
    return db;
}

// Main Function (Execution Starts From Here)
async function main() {
    if (process.env.UWU === 'true') {
        console.log(
            gradient.pastel.multiline(
                figlet.textSync('Cervum-AI', {
                    font: 'Univers',
                    horizontalLayout: 'default',
                    verticalLayout: 'default',
                    width: 100,
                    whitespaceBreak: true,
                }),
            ),
        );
    }

    const db = await initFirebaseAdmin();

    initDiscordCommands()
        .then(() => {
            console.log(
                chalk.greenBright('[initDiscordCommands] - Initialized Discord Application Commands'),
            );
        })
        .catch((e) => {
            // Retry with backoff
            setTimeout(() => initDiscordCommands(), 3000);
            console.log(chalk.red(`[initDiscordCommands] - ${e}`));
        });

    const client = new Client({
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMessages,
            GatewayIntentBits.GuildIntegrations,
            GatewayIntentBits.DirectMessages,
            GatewayIntentBits.DirectMessageTyping,
            GatewayIntentBits.MessageContent,
        ],
        partials: [Partials.Channel],
    });

    client.on('error', (e) => {
        console.log(chalk.red(`[Discord on error] - ${e}`));
    });

    client.on('ready', () => {
        console.log(`[Discord on ready] - Logged in as ${client.user.tag}!`);
        console.log(chalk.greenBright('[Discord on ready] - Connected to Discord Gateway'));
        console.log(`[Discord on ready] - ${new Date().toLocaleString()}`);
        client.user.setStatus('online');
    });

    // Channel Message Handler
    client.on('interactionCreate', async (interaction) => {
        if (!interaction.isChatInputCommand()) return;

        switch (interaction.commandName) {
            case 'ask-gpt':
                askInteractionHandler(interaction, 'chatgpt');
                break;
            case 'ask-bing': {
                askInteractionHandler(interaction, 'bing'); // Re-enabled
                break;
            }
            case 'toggle-session': {
                toggleSessionInteractionHandler(interaction);
                break;
            }
            case 'reset-chat':
                resetChatInteractionHandler(interaction);
                break;
            case 'ping': {
                const text = `Websocket Heartbeat: ${client.ws.ping}ms\nRoundtrip Latency: ${
                    Date.now() - interaction.createdTimestamp
                }ms`;
                replyOnlyText(interaction, text);
                break;
            }
            case 'help': {
                const text =
                    "Here's a list of commands you can use with Cervum-AI:\n\n" +
                    '**/ask-gpt** - Ask Anything with GPT!\n' +
                    '**/ask-bing** - New! Ask Anything with Bing!\n' +
                    '**/toggle-session** - Toggle Private or Public Chat Session\n' +
                    '**/reset-chat** - Start A Fresh Chat Session\n' +
                    '**/ping** - Check Websocket Heartbeat & Roundtrip Latency\n' +
                    '**/help** - Show this message\n\n' +
                    'If you have any questions, please contact bot developer <@!' +
                    '323362522247856129' +
                    '>';
                replyOnlyText(interaction, text);
                break;
            }
            default:
                await interaction.reply({ content: 'Command Not Found' });
        }
    });

    client
        .login(process.env.DISCORD_BOT_TOKEN)
        .catch((e) => console.log(chalk.red(`[Discord login] - ${e}`)));

    await initOpenAI(); // Now called

    // await initOpenAI().catch((e) => {
    //     console.log(chalk.red(e));
    // });

    async function toggleSessionInteractionHandler(interaction) {
        try {
            await interaction.deferReply({
                flags: MessageFlags.Ephemeral,
            });
            const doc = await db.collection('chat-settings').doc(interaction.user.id).get();
            if (!doc.exists) {
                await db.collection('chat-settings').doc(interaction.user.id).set({
                    isPrivate: true,
                });
                await interaction.editReply('Session is now Private 🔒');
                return;
            }

            const isPrivate = doc.data().isPrivate;
            await db.collection('chat-settings').doc(interaction.user.id).update({
                isPrivate: !isPrivate,
            });
            await interaction.editReply(`Session is now ${isPrivate ? 'Public 🔓' : 'Private 🔒'}`);
        } catch (error) {
            console.log(chalk.red(`[toggleSessionInteractionHandler] - ${error}`));
            await interaction.editReply('Something Went Wrong ❌');
        }
    }

    async function replyOnlyText(interaction, text) {
        await interaction.deferReply({
            flags: MessageFlags.Ephemeral,
        });
        await interaction.editReply(text);
    }

    async function resetChatInteractionHandler(interaction) {
        try {
            await interaction.deferReply({
                flags: MessageFlags.Ephemeral,
            });

            const userRef = db.collection('users').doc(interaction.user.id);
            const batch = db.batch();

            const chatgptDocRef = userRef.collection('chatgpt').doc('conversation');
            batch.delete(chatgptDocRef);

            const bingDocRef = userRef.collection('bing').doc('conversation');
            batch.delete(bingDocRef);

            const [chatgptDoc, bingDoc] = await Promise.all([chatgptDocRef.get(), bingDocRef.get()]);

            if (!chatgptDoc.exists && !bingDoc.exists) {
                console.log('[resetChatInteractionHandler] - Chat Reset: Already Empty ✅');
                await interaction.editReply('Chat Reset: Already Empty ✅');
            } else {
                await batch.commit();
                console.log('[resetChatInteractionHandler] - Chat Reset: Successful ✅');
                await interaction.editReply('Chat Reset: Successful ✅');
            }
        } catch (error) {
            console.error(chalk.red(`[resetChatInteractionHandler] - ${error}`));
            await interaction.editReply('Something Went Wrong ❌');
        }
    }

    async function askInteractionHandler(interaction, clientToUse) {
        const question = interaction.options.getString('question');
        const { tag, id } = interaction.user;

        if (process.env.DEBUG === 'true') {
            console.log('----------Channel Message--------');
            console.log('Date & Time : ' + new Date());
            console.log('UserId      : ' + id);
            console.log('User        : ' + tag);
            console.log('Question    : ' + question);
        }

        try {
            const docRef = db.collection('chat-settings').doc(interaction.user.id);
            const doc = await docRef.get();
            let isPrivate = false;

            if (!doc.exists) {
                await docRef.set({
                    isPrivate,
                });
            } else {
                isPrivate = doc.data().isPrivate;
            }

            await interaction.deferReply({
                flags: isPrivate ? MessageFlags.Ephemeral : undefined,
            });

            askQuestion(question, interaction, clientToUse, async (content) => {
                const { response, details } = content?.data ?? {};
                const { model, usage } = details ?? {};

                const embed = {
                    content: '',
                    embeds: [
                        {
                            type: 'rich',
                            title: '',
                            color: 15386181,
                            description: `**Username**\n${tag}\n\n**Question**\n${question}\n\n**Answer**\n${response}`,
                            timestamp: null,
                            author: {
                                name: 'Cervum-AI',
                                url: '',
                            },
                            image: {
                                url: response?.match(/https?:\/\/\S+/g)?.[0],
                            },
                            thumbnail: {},
                            footer: {
                                text: `Model: ${model ?? 'bing'} • Token Usage: ${
                                    usage?.total_tokens ?? '-'
                                }`,
                            },
                            fields: [],
                        },
                    ],
                };

                console.log('Response    : ' + response);
                console.log('---------------End---------------');

                if (response === undefined) {
                    await interaction.followUp({
                        content: 'Oops, something went wrong! (Undefined Response). Try again please.',
                    });
                    return;
                }

                if (response.length >= process.env.DISCORD_MAX_RESPONSE_LENGTH) {
                    await interaction.followUp({
                        content: "The answer to this question is very long, so I'll answer by DM.",
                    });
                    await interaction.user.send(embed);
                } else {
                    await interaction.followUp(embed);
                }

                // Send to DB
                const timeStamp = new Date();
                const date = `${timeStamp.getUTCDate()}.${timeStamp.getUTCMonth()}.${timeStamp.getUTCFullYear()}`;
                const time = `${timeStamp.getUTCHours()}:${timeStamp.getUTCMinutes()}:${timeStamp.getUTCSeconds()}`;
                await db
                    .collection('chat-history')
                    .doc(id)
                    .collection(clientToUse)
                    .doc('conversation')
                    .collection(date)
                    .doc(time)
                    .set({
                        timeStamp: new Date(),
                        userID: id,
                        user: tag,
                        question: question,
                        answer: content.text,
                        parentMessageId: content.id,
                    });
            });
        } catch (e) {
            console.error(chalk.red(`[askInteractionHandler] - ${e}`));
            await interaction.followUp({
                content: 'Oops, something went wrong! (Undefined Response). Try again please.',
            });
        }
    }

    async function askQuestion(question, interaction, clientToUse, cb) {
        try {
            // Start typing indicator if effect is enabled
            if (process.env.TYPING_EFFECT === 'true') {
                await interaction.channel.sendTyping();
            }

            const userRef = db.collection('users').doc(interaction.user.id);
            const conversationRef = userRef.collection(clientToUse).doc('conversation');

            const doc = await conversationRef.get();

            let defaultPayload = {
                message: question,
                clientOptions: {
                    clientToUse,
                },
            };

            let defaultSet = {
                userID: interaction.user.id,
                user: interaction.user.tag,
                conversationId: null,
                parentMessageId: null,
                conversationSignature: null,
                clientId: null,
                invocationId: null,
            };

            let response;

            if (!doc.exists) {
                if (process.env.DEBUG === 'true') {
                    console.log('[askQuestion] - Conversation not found, creating new conversation...');
                }

                response = await api.post('/conversation', defaultPayload);

                defaultSet.conversationId = response.data.conversationId;
                defaultSet.parentMessageId =
                    clientToUse === 'chatgpt' ? response.data.messageId : response.data.details.messageId;

                if (clientToUse === 'bing') {
                    defaultSet.conversationSignature = response.data.conversationSignature;
                    defaultSet.clientId = response.data.clientId;
                    defaultSet.invocationId = response.data.invocationId;
                }

                await conversationRef.set(defaultSet);
            } else {
                if (process.env.DEBUG === 'true') {
                    console.log('[askQuestion] - Conversation found, sending message...');
                }

                const docData = doc.data();

                defaultPayload.conversationId = docData.conversationId;
                defaultPayload.parentMessageId = docData.parentMessageId;

                if (clientToUse === 'bing') {
                    defaultPayload.conversationSignature = docData.conversationSignature;
                    defaultPayload.clientId = docData.clientId;
                    defaultPayload.invocationId = docData.invocationId;
                }

                response = await api.post('/conversation', defaultPayload);

                defaultSet.conversationId = response.data.conversationId;
                defaultSet.parentMessageId =
                    clientToUse === 'chatgpt' ? response.data.messageId : response.data.details.messageId;

                if (clientToUse === 'bing') {
                    defaultSet.conversationSignature = response.data.conversationSignature;
                    defaultSet.clientId = response.data.clientId;
                    defaultSet.invocationId = response.data.invocationId;
                }

                await conversationRef.set(defaultSet);
            }

            // For streaming simulation (if enabled), edit reply in chunks
            if (process.env.TYPING_EFFECT === 'true' && response.data.response) {
                let streamedResponse = '';
                const chunks = response.data.response.match(/.{1,100}/g) || [response.data.response]; // Chunk into 100-char parts or full if small
                for (const chunk of chunks) {
                    streamedResponse += chunk;
                    await interaction.editReply({ content: streamedResponse }); // Edit the deferred reply
                    await new Promise((resolve) => setTimeout(resolve, 500)); // Delay for realistic typing effect
                }
            }

            cb(response);
        } catch (error) {
            console.log(chalk.red(`[askQuestion] - ${error}`));
            // Basic retry once on error
            try {
                if (process.env.DEBUG === 'true') {
                    console.log('[askQuestion] - Retrying API call once...');
                }
                const response = await api.post('/conversation', {
                    message: question,
                    clientOptions: { clientToUse },
                });
                cb(response);
            } catch (retryError) {
                console.log(chalk.red(`[askQuestion Retry] - ${retryError}`));
                cb({ data: { response: 'Oops, something went wrong! (Error after retry)' } });
            }
        }
    }

    // Discord bot announcement endpoint (added API key auth)
    app.post('/announcement', (req, res) => {
        const { channelId, message, apiKey } = req.body;
        if (apiKey !== process.env.ANNOUNCEMENT_API_KEY) {
            return res.status(401).send({ status: 401, message: 'Unauthorized' });
        }
        const channel = client.channels.cache.get(channelId);
        if (channel && message) {
            channel.send(message);
            res.send({ status: 200, message: 'Announcement sent' });
        } else {
            res.status(400).send({ status: 400, message: 'Missing channel ID or message' });
        }
    });

    app.get('/', async (req, res) => {
        // Check health of the server
        res.send('OK');
    });

    app.listen(process.env.PORT, () => {
        console.log(`[Express] - Listening on port ${process.env.PORT}!`);
    });
}

main(); // Call Main function

// ---End of Code---
