// Imports
import dotenv from 'dotenv';
dotenv.config();
import { Client, GatewayIntentBits, REST, Routes, Partials } from 'discord.js';
import axios from 'axios';
import chalk from 'chalk';
import figlet from 'figlet';
import gradient from 'gradient-string';
import admin from 'firebase-admin';
import express from 'express';
import cors from 'cors';

// Ignore the red squiggly lines, it works fine
import firebaseServiceAccount from './firebaseServiceAccountKey.json' assert { type: 'json' };

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
];

// Axios instance for ChatGPT Proxy
const api = axios.create({
    baseURL: process.env.CHATGPT_PROXY_URL,
});

// Initialize OpenAI Session
async function initOpenAI() {
    res = await api.post('/conversation', {
        message: process.env.CHATGPT_INITIAL_PROMPT,
        stream: false,
        clientOptions: {
            clientToUse: process.env.CLIENT_TO_USE,
        },
    });

    console.log(chalk.greenBright(`Connected to OpenAI API - ${res.data.response}`));
}

// Initialize Discord Application Commands
async function initDiscordCommands() {
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN);
    try {
        console.log('Started refreshing application commands (/)');
        await rest
            .put(Routes.applicationCommands(process.env.DISCORD_CLIENT_ID), { body: commands })
            .then(() => {
                console.log('Successfully reloaded application commands (/)');
            })
            .catch((e) => console.log(chalk.red(e)));
        console.log('Connecting to Discord Gateway...');
    } catch (error) {
        console.log(chalk.red(error));
    }
}

async function initFirebaseAdmin() {
    admin.initializeApp({
        credential: admin.credential.cert(firebaseServiceAccount),
        databaseURL: `https://${firebaseServiceAccount.project_id}.firebaseio.com`,
    });
    const db = admin.firestore();
    db.settings({ ignoreUndefinedProperties: true });
    console.log(chalk.greenBright('Connected to Firebase Firestore'));
    return db;
}

/////// Main Function (Execution Starts From Here)
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

    await initDiscordCommands().catch((e) => {
        console.log(chalk.red(e));
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
        console.log(chalk.red(e));
    });

    client.on('ready', () => {
        console.log(`Logged in as ${client.user.tag}`);
        console.log(chalk.greenBright('Connected to Discord Gateway'));
        console.log(new Date());
        client.user.setStatus('online');
    });

    // Channel Message Handler
    client.on('interactionCreate', async (interaction) => {
        if (!interaction.isChatInputCommand()) return;

        switch (interaction.commandName) {
            case 'ask-gpt':
                askInteractionHandler(interaction, 'chatgpt');
                break;
            case 'ask-bing':
                askInteractionHandler(interaction, 'bing');
                break;
            case 'toggle-session':
                toggleSessionInteractionHandler(interaction);
                break;
            case 'reset-chat':
                resetChatInteractionHandler(interaction);
                break;
            case 'ping':
                pingInteractionHandler(interaction);
                break;
            default:
                await interaction.reply({ content: 'Command Not Found' });
        }
    });

    client.login(process.env.DISCORD_BOT_TOKEN).catch((e) => console.log(chalk.red(e)));

    // console.log('Connecting to OpenAI API...');

    // await initOpenAI().catch((e) => {
    //     console.log(chalk.red(e));
    // });

    async function toggleSessionInteractionHandler(interaction) {
        try {
            await interaction.deferReply({
                fetchReply: true,
                ephemeral: true,
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
            console.log(chalk.red(error));
            await interaction.editReply('Something Went Wrong ❌');
        }
    }

    async function pingInteractionHandler(interaction) {
        const sent = await interaction.deferReply({ fetchReply: true });
        interaction.followUp(
            `Websocket Heartbeat: ${interaction.client.ws.ping} ms. \nRoundtrip Latency: ${
                sent.createdTimestamp - interaction.createdTimestamp
            } ms`,
        );
    }

    async function resetChatInteractionHandler(interaction) {
        try {
            await interaction.reply('Checking...📚');

            const userRef = db.collection('users').doc(interaction.user.id);
            const batch = db.batch();

            const chatgptDocRef = userRef.collection('chatgpt').doc('conversation');
            batch.delete(chatgptDocRef);

            const bingDocRef = userRef.collection('bing').doc('conversation');
            batch.delete(bingDocRef);

            const [chatgptDoc, bingDoc] = await Promise.all([chatgptDocRef.get(), bingDocRef.get()]);

            if (!chatgptDoc.exists && !bingDoc.exists) {
                console.log('Chat Reset: Already Empty ✅');
                await interaction.editReply('Chat Reset: Already Empty ✅');
            } else {
                await batch.commit();
                console.log('Chat Reset: Successful ✅');
                await interaction.editReply('Chat Reset: Successful ✅');
            }
        } catch (error) {
            console.error(chalk.red(error));
            await interaction.editReply('Something Went Wrong ❌');
        }
    }

    async function askInteractionHandler(interaction, clientToUse) {
        const question = interaction.options.getString('question');
        const { tag, id } = interaction.user;

        console.log('----------Channel Message--------');
        console.log('Date & Time : ' + new Date());
        console.log('UserId      : ' + id);
        console.log('User        : ' + tag);
        console.log('Question    : ' + question);

        try {
            const doc = await db.collection('chat-settings').doc(interaction.user.id).get();
            const isPrivate = doc.data().isPrivate;

            await interaction.deferReply({
                fetchReply: true,
                ephemeral: isPrivate,
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
                    .doc(interaction.user.id)
                    .collection(clientToUse)
                    .doc('conversation')
                    .collection(date)
                    .doc(time)
                    .set({
                        timeStamp: new Date(),
                        userID: interaction.user.id,
                        user: interaction.user.tag,
                        question: question,
                        answer: content.text,
                        parentMessageId: content.id,
                    });
            });
        } catch (e) {
            console.error(chalk.red(e));
            await interaction.followUp({
                content: 'Oops, something went wrong! (Undefined Response). Try again please.',
            });
        }
    }

    async function askQuestion(question, interaction, clientToUse, cb) {
        try {
            const userRef = db.collection('users').doc(interaction.user.id);
            const conversationRef = userRef.collection(clientToUse).doc('conversation');

            const doc = await conversationRef.get();

            const defaultPayload = {
                message: question,
                clientOptions: {
                    clientToUse,
                },
            };

            const defaultSet = {
                userID: interaction.user.id,
                user: interaction.user.tag,
                conversationId: null,
                parentMessageId: null,
                conversationSignature: null,
                clientId: null,
                invocationId: null,
            };

            if (!doc.exists) {
                console.log('No conversation found, creating one...');

                const response = await api.post('/conversation', defaultPayload);

                defaultSet.conversationId = response.data.conversationId;
                defaultSet.parentMessageId =
                    clientToUse === 'chatgpt' ? response.data.messageId : response.data.details.messageId;

                if (clientToUse === 'bing') {
                    defaultSet.conversationSignature = response.data.conversationSignature;
                    defaultSet.clientId = response.data.clientId;
                    defaultSet.invocationId = response.data.invocationId;
                }

                await conversationRef.set(defaultSet);

                cb(response);
            } else {
                console.log('Conversation found, sending message...');

                const docData = doc.data();

                defaultPayload.conversationId = docData.conversationId;
                defaultPayload.parentMessageId = docData.parentMessageId;

                if (clientToUse === 'bing') {
                    defaultPayload.conversationSignature = docData.conversationSignature;
                    defaultPayload.clientId = docData.clientId;
                    defaultPayload.invocationId = docData.invocationId;
                }

                const response = await api.post('/conversation', defaultPayload);

                defaultSet.conversationId = response.data.conversationId;
                defaultSet.parentMessageId =
                    clientToUse === 'chatgpt' ? response.data.messageId : response.data.details.messageId;

                if (clientToUse === 'bing') {
                    defaultSet.conversationSignature = response.data.conversationSignature;
                    defaultSet.clientId = response.data.clientId;
                    defaultSet.invocationId = response.data.invocationId;
                }

                await conversationRef.set(defaultSet);

                cb(response);
            }
        } catch (error) {
            console.log(chalk.red('AskQuestion Error:' + error));
            cb('Oops, something went wrong! (Error)');
        }
    }

    // Discord bot announcement endpoint
    app.post('/announcement', (req, res) => {
        const { channelId, message } = req.body;
        const channel = client.channels.cache.get(channelId);
        if (channel && message) {
            channel.send(message);
            res.send({
                status: 200,
                message: 'Announcement sent',
            });
        } else {
            res.status(400).send({
                status: 400,
                message: 'Missing channel ID or message',
            });
        }
    });

    app.get('/', async (req, res) => {
        // Check health of the server
        res.send('OK');
    });

    app.listen(process.env.PORT, () => {
        console.log('Server listening on port ' + process.env.PORT);
    });
}

main(); // Call Main function

// ---End of Code---
