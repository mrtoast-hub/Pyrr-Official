
require("dotenv").config();

const {
  REST,
  Routes,
  SlashCommandBuilder
} = require("discord.js");

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;

if (!token || !clientId) {
  throw new Error(
    "Missing DISCORD_TOKEN or CLIENT_ID environment variable."
  );
}

const commands = [
  new SlashCommandBuilder()
    .setName("help")
    .setDescription("Open the Pyrr Official help center"),

  new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Check the bot connection"),

  new SlashCommandBuilder()
    .setName("botinfo")
    .setDescription("View Pyrr Official information")
].map(command => command.toJSON());

const rest = new REST({ version: "10" }).setToken(token);

async function deployCommands() {
  console.log("Registering Pyrr Official slash commands...");

  await rest.put(
    Routes.applicationCommands(clientId),
    { body: commands }
  );

  console.log("Successfully registered slash commands.");
}

deployCommands().catch(error => {
  console.error("Slash command registration failed:", error);
  process.exitCode = 1;
});
