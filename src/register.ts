import { REST, Routes, SlashCommandBuilder } from 'discord.js'
import dotenv from 'dotenv'

dotenv.config()

const commands = [
  new SlashCommandBuilder().setName('auth_spotify').setDescription('Authenticate with Spotify').setDescriptionLocalization("ja", "Spotifyで認証"),
  new SlashCommandBuilder().setName('ping').setDescription('Replies with Pong!').setDescriptionLocalization("ja", "Pong!と返信"),
].map(command => command.toJSON());

const token: string = process.env.TOKEN ?? ''
const appid: string = process.env.APP_ID ?? ""

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
  try {
    console.log('Started refreshing application (/) commands.');

    await rest.put(Routes.applicationCommands(appid), {
      body: commands,
    });

    console.log('Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error(error);
  }
})()
