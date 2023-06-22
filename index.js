// Imports
import dotenv from 'dotenv';
dotenv.config();
import { Client, GatewayIntentBits, REST, Routes, Partials, ActivityType } from 'discord.js';
import axios from 'axios';
import chalk from 'chalk';
import figlet from 'figlet';
import gradient from 'gradient-string';
import express from 'express';

// Defines
let res; // ChatGPT Thread Identifier
const app = express(); // Express App

app.use(express.json());

// Discord Slash Commands Defines
const commands = [
    {
        name: 'ask',
        description: 'Ask Anything!',
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
            case 'ask':
                askInteractionHandler(interaction);
                break;
            case 'ping':
                pingInteractionHandler(interaction);
                break;
            default:
                await interaction.reply({ content: 'Command Not Found' });
        }
    });

    client.login(process.env.DISCORD_BOT_TOKEN).catch((e) => console.log(chalk.red(e)));

    console.log('Connecting to OpenAI API...');

    await initOpenAI().catch((e) => {
        console.log(chalk.red(e));
    });

    async function pingInteractionHandler(interaction) {
        const sent = await interaction.deferReply({ fetchReply: true });
        interaction.followUp(
            `Websocket Heartbeat: ${interaction.client.ws.ping} ms. \nRoundtrip Latency: ${
                sent.createdTimestamp - interaction.createdTimestamp
            } ms`,
        );
    }

    async function askInteractionHandler(interaction) {
        const question = interaction.options.getString('question');
        const { tag, id } = interaction.user;

        console.log('----------Channel Message--------');
        console.log('Date & Time : ' + new Date());
        console.log('UserId      : ' + id);
        console.log('User        : ' + tag);
        console.log('Question    : ' + question);

        try {
            await interaction.deferReply({
                fetchReply: true,
                ephemeral: question.includes('--private') ? true : false,
            });

            askQuestion(question, interaction, async (content) => {
                const { response, details } = content?.data ?? {};
                const { model, usage } = details ?? {};

                const embed = {
                    content: '',
                    embeds: [
                        {
                            title: '',
                            color: 15386181,
                            description: `**Username**\n${tag}\n\n**Question**\n${question}\n\n**Answer**\n${response}`,
                            timestamp: null,
                            author: {
                                name: 'Cervum-AI',
                                url: '',
                            },
                            image: {},
                            thumbnail: {},
                            footer: {
                                text: `Model: ${model} • Token Usage: ${usage?.total_tokens}`,
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

                // TODO: send to DB
            });
        } catch (e) {
            console.error(chalk.red(e));
            await interaction.followUp({
                content: 'Oops, something went wrong! (Undefined Response). Try again please.',
            });
        }
    }

    function askQuestion(question, interaction, cb) {
        let tmr = setTimeout((e) => {
            cb('Oops, something went wrong! (Timeout)');
            console.error(chalk.red(e));
        }, 100000);

        if (process.env.TYPING_EFFECT === 'true') {
            api.post('/conversation', {
                message: question,
                stream: false,
                clientOptions: {
                    clientToUse: process.env.CLIENT_TO_USE,
                },
                conversationId: res.data.conversationId,
                parentMessageId: res.data.messageId,
            })
                .then((response) => {
                    clearTimeout(tmr);
                    interaction.editReply(
                        `**${interaction.user.tag}:** ${question}\n**${client.user.username}:** ${response.data.response}`,
                    );
                    res = response;
                    cb(response);
                })
                .catch((err) => {
                    cb('Oops, something went wrong! (Error)');
                    console.error(chalk.red('AskQuestion Error:' + err));
                });
        } else {
            api.post('/conversation', {
                message: question,
                stream: false,
                clientOptions: {
                    clientToUse: process.env.CLIENT_TO_USE,
                },
                conversationId: res.data.conversationId,
                parentMessageId: res.data.messageId,
            })
                .then((response) => {
                    clearTimeout(tmr);
                    res = response;
                    cb(response);
                })
                .catch((err) => {
                    cb('Oops, something went wrong! (Error)');
                    console.error(chalk.red('AskQuestion Error:' + err));
                });
        }
    }

    // Discord bot announcement endpoint
    app.post('/announcement', (req, res) => {
        const { message } = req.body;
        if (message) {
            client.channels.cache.get(process.env.DISCORD_ANNOUNCEMENT_CHANNEL_ID).send(message);
            res.send('OK');
        } else {
            res.send('No message');
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
