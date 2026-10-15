const rest = new REST({ version: "10" })
.setToken(process.env.DISCORD_TOKEN);
async function deploy() {
await rest.put(
Routes.applicationCommands(process.env.CLIENT_ID),
{ body: commands }
);
console.log("Pyrr slash commands registered successfully.");
}
deploy().catch(error => {
console.error("Command registration failed:", error);
process.exitCode = 1;
});
</CodeBlock>
