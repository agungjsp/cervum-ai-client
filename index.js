// Imports
import dotenv from 'dotenv';
dotenv.config();
import { Client, GatewayIntentBits, REST, Routes, Partials, ActivityType } from 'discord.js';
import axios from 'axios';
import chalk from 'chalk';
import figlet from 'figlet';
import gradient from 'gradient-string';

// Discord Slash Commands Defines
const commands = [
    {
        name: 'ping',
        description: 'Check Websocket Heartbeat & Roundtrip Latency',
    },
];

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
                })
            )
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
        client.user.setActivity('/ping');
    });

    // Channel Message Handler
    client.on('interactionCreate', async (interaction) => {
        if (!interaction.isChatInputCommand()) return;

        client.user.setActivity(interaction.user.tag, { type: ActivityType.Watching });

        switch (interaction.commandName) {
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
            } ms`
        );
        client.user.setActivity('/ping');
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
