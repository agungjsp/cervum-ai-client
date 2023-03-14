// Imports
import dotenv from 'dotenv';
dotenv.config();
import { Client, GatewayIntentBits, REST, Routes, Partials, ActivityType } from 'discord.js';
import axios from 'axios';
import chalk from 'chalk';
import figlet from 'figlet';
import gradient from 'gradient-string';

// Defines
let res; // ChatGPT Thread Identifier

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
        description: 'Check Websocket Heartbeat && Roundtrip Latency',
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
}

// Initialize Discord Application Commands & New ChatGPT Thread
async function initDiscordCommands(api) {
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

// Main Function (Entry Point)
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
        console.log(e);
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

    client.login(process.env.DISCORD_BOT_TOKEN).catch((e) => console.log(chalk.red(e)));

    client.once('ready', () => {
        console.log(`Logged in as ${client.user.tag}`);
        console.log(chalk.greenBright('Connected to Discord Gateway'));
        console.log(new Date());
        client.user.setStatus('online');
        client.user.setActivity('/ask');
    });

    // Channel Message Handler
    client.on('interactionCreate', async (interaction) => {
        if (!interaction.isChatInputCommand()) return;

        client.user.setActivity(interaction.user.tag, { type: ActivityType.Watching });

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

    async function pingInteractionHandler(interaction) {
        const sent = await interaction.reply({ content: 'Pinging...', fetchReply: true });
        interaction.editReply(
            `Websocket Heartbeat: ${interaction.client.ws.ping} ms. \nRoundtrip Latency: ${
                sent.createdTimestamp - interaction.createdTimestamp
            } ms`,
        );
        client.user.setActivity('/ask');
    }

    async function askInteractionHandler(interaction) {
        const question = interaction.options.getString('question');

        console.log('----------Channel Message--------');
        console.log('Date & Time : ' + new Date());
        console.log('UserId      : ' + interaction.user.id);
        console.log('User        : ' + interaction.user.tag);
        console.log('Question    : ' + question);

        try {
            await interaction.reply({ content: `${client.user.username} Is Processing Your Question...` });
            askQuestion(question, interaction, async (content) => {
                console.log('Response    : ' + content.response);
                console.log('---------------End---------------');
                if (content.response.length >= process.env.DISCORD_MAX_RESPONSE_LENGTH) {
                    await interaction.editReply({
                        content: "The answer to this question is very long, so I'll answer by DM.",
                    });
                    splitAndSendResponse(content.response, interaction.user);
                } else {
                    await interaction.editReply(
                        `**${interaction.user.tag}:** ${question}\n**${client.user.username}:** ${content.response}\n</>`,
                    );
                }
                client.user.setActivity('/ask');
                // TODO: send to DB
            });
        } catch (e) {
            console.error(chalk.red(e));
        }
    }

    function askQuestion(question, interaction, cb) {
        let tmr = setTimeout((e) => {
            cb('Oppss, something went wrong! (Timeout)');
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

    async function splitAndSendResponse(resp, user) {
        while (resp.length > 0) {
            let end = Math.min(process.env.DISCORD_MAX_RESPONSE_LENGTH, resp.length);
            await user.send(resp.slice(0, end));
            resp = resp.slice(end, resp.length);
        }
    }
}

// Discord Rate Limit Check
setInterval(() => {
    axios.get('https://discord.com/api/v10').catch((error) => {
        if (error.response.status == 429) {
            console.log('Discord Rate Limited');
            console.warn('Status: ' + error.response.status);
            console.warn(error);
        }
    });
}, 30000); // Check Every 30 Second

main(); // Call Main function

// ---End of Code---