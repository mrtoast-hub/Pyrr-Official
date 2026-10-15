
require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  Partials,
  ActivityType,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  PermissionFlagsBits,
  ChannelType,
  SlashCommandBuilder,
  REST,
  Routes
} = require("discord.js");

const PREFIX = "P'";
const BOT_NAME = "Pyrr Official";
const CREATOR = "_upyr";
const SUPPORT_URL = "https://discord.gg/e9D9hSKCa6";
const TWITCH_URL = "https://www.twitch.tv/noctis_official01";

if (!process.env.DISCORD_TOKEN) {
  throw new Error("Missing DISCORD_TOKEN environment variable.");
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ],
  partials: [
    Partials.Channel,
    Partials.Message,
    Partials.User,
    Partials.GuildMember
  ]
});

const COLORS = {
  main: 0x171717,
  success: 0x277a50,
  warning: 0xc58a26,
  error: 0xa83232,
  neutral: 0x393939
};

const startedAt = Date.now();
const cooldowns = new Map();
const commandRegistry = new Map();
const disabledCommands = new Set();

function makeEmbed(title, description, color = COLORS.main) {
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(description)
    .setFooter({ text: BOT_NAME })
    .setTimestamp();
}

function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  return `${days}d ${hours}h ${minutes}m ${remainingSeconds}s`;
}

function getTotalUsers() {
  return client.guilds.cache.reduce(
    (total, guild) => total + guild.memberCount,
    0
  );
}

function updatePresence() {
  const userCount = getTotalUsers();

  client.user.setPresence({
    activities: [{
      name: `${userCount} users`,
      type: ActivityType.Watching,
      url: TWITCH_URL
    }],
    status: "online"
  });
}

function hasPermission(member, permission) {
  return Boolean(member?.permissions?.has(permission));
}

function isOwner(userId) {
  const owners = (process.env.OWNER_IDS || "")
    .split(",")
    .map(id => id.trim())
    .filter(Boolean);

  return owners.includes(userId);
}

function addCommand(name, category, description, execute, options = {}) {
  commandRegistry.set(name, {
    name,
    category,
    description,
    execute,
    aliases: options.aliases || [],
    cooldown: options.cooldown || 1500,
    permissions: options.permissions || null,
    ownerOnly: options.ownerOnly || false
  });
}

function getCommand(name) {
  const normalized = name.toLowerCase();
  if (commandRegistry.has(normalized)) {
    return commandRegistry.get(normalized);
  }

  for (const command of commandRegistry.values()) {
    if (command.aliases.includes(normalized)) {
      return command;
    }
  }

  return null;
}

async function sendError(message, description) {
  return message.reply({
    embeds: [makeEmbed("Request failed", description, COLORS.error)]
  }).catch(() => null);
}

async function sendSuccess(message, description) {
  return message.reply({
    embeds: [makeEmbed("Completed", description, COLORS.success)]
  }).catch(() => null);
}

async function safeReply(interaction, payload) {
  if (interaction.deferred || interaction.replied) {
    return interaction.followUp(payload).catch(() => null);
  }

  return interaction.reply(payload).catch(() => null);
}

const HELP_CATEGORIES = [
  {
    label: "General",
    value: "general",
    description: "Basic bot and server information"
  },
  {
    label: "Utility",
    value: "utility",
    description: "Useful server tools"
  },
  {
    label: "Moderation",
    value: "moderation",
    description: "Member moderation tools"
  },
  {
    label: "Automod",
    value: "automod",
    description: "Basic automated moderation"
  },
  {
    label: "Economy",
    value: "economy",
    description: "Virtual balance and rewards"
  },
  {
    label: "Games",
    value: "games",
    description: "Virtual currency mini-games"
  },
  {
    label: "System",
    value: "system",
    description: "Bot and configuration tools"
  },
  {
    label: "Partnership",
    value: "partnership",
    description: "Partnership information"
  }
];

function createHelpMenu() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("pyrr_help_category")
      .setPlaceholder("Select a command category")
      .addOptions(HELP_CATEGORIES)
  );
}

function buildHelpEmbed(category = "general") {
  const commands = [...commandRegistry.values()]
    .filter(command => command.category === category);

  const categoryInfo = HELP_CATEGORIES.find(
    item => item.value === category
  );

  const lines = commands.length
    ? commands.map(command =>
        `\`${PREFIX}${command.name}\` — ${command.description}`
      )
    : ["No commands are available in this category yet."];

  return makeEmbed(
    `${BOT_NAME} | ${categoryInfo?.label || "Help"}`,
    lines.join("\n")
  ).addFields(
    {
      name: "Command prefix",
      value: `\`${PREFIX}\``,
      inline: true
    },
    {
      name: "Slash command",
      value: "`/help`",
      inline: true
    }
  );
                       }
