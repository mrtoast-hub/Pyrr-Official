
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
addCommand("help", "general", "Open the command help menu", async message => {
  await message.reply({
    embeds: [buildHelpEmbed("general")],
    components: [createHelpMenu()]
  });
}, { aliases: ["commands"] });

addCommand("ping", "general", "Check bot response latency", async message => {
  const latency = Date.now() - message.createdTimestamp;

  await message.reply({
    embeds: [
      makeEmbed(
        "Connection Status",
        `Message latency: ${latency}ms\nAPI latency: ${Math.round(client.ws.ping)}ms`
      )
    ]
  });
});

addCommand("botinfo", "general", "View bot information", async message => {
  await message.reply({
    embeds: [
      makeEmbed("Bot Information", [
        `Name: ${BOT_NAME}`,
        `Creator: ${CREATOR}`,
        `Servers: ${client.guilds.cache.size}`,
        `Users: ${getTotalUsers()}`,
        `Commands: ${commandRegistry.size}`,
        `Uptime: ${formatDuration(Date.now() - startedAt)}`,
        `Support: ${SUPPORT_URL}`
      ].join("\n"))
    ]
  });
});

addCommand("uptime", "general", "Check bot uptime", async message => {
  await message.reply({
    embeds: [
      makeEmbed(
        "Bot Uptime",
        `Online for ${formatDuration(Date.now() - startedAt)}`
      )
    ]
  });
});

addCommand("serverinfo", "general", "View this server's information", async message => {
  const guild = message.guild;
  if (!guild) return sendError(message, "Use this command inside a server.");

  await message.reply({
    embeds: [
      makeEmbed("Server Information", [
        `Name: ${guild.name}`,
        `Server ID: ${guild.id}`,
        `Members: ${guild.memberCount}`,
        `Channels: ${guild.channels.cache.size}`,
        `Roles: ${guild.roles.cache.size}`,
        `Created: <t:${Math.floor(guild.createdTimestamp / 1000)}:D>`
      ].join("\n"))
    ]
  });
});

addCommand("userinfo", "general", "View a member's information", async message => {
  const member = message.mentions.members.first()
    || message.member;

  if (!member) return sendError(message, "Member not found.");

  await message.reply({
    embeds: [
      makeEmbed("User Information", [
        `Username: ${member.user.username}`,
        `User ID: ${member.id}`,
        `Nickname: ${member.nickname || "None"}`,
        `Account created: <t:${Math.floor(member.user.createdTimestamp / 1000)}:D>`,
        `Joined server: ${member.joinedTimestamp
          ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:D>`
          : "Unknown"}`
      ].join("\n"))
    ]
  });
});

addCommand("avatar", "utility", "Display a member's avatar", async message => {
  const user = message.mentions.users.first() || message.author;
  const avatar = user.displayAvatarURL({
    size: 1024,
    extension: "png"
  });

  await message.reply({
    embeds: [
      makeEmbed("Avatar", `[Open avatar image](${avatar})`)
        .setImage(avatar)
    ]
  });
});

addCommand("id", "utility", "Show a member's Discord ID", async message => {
  const user = message.mentions.users.first() || message.author;

  await message.reply({
    embeds: [
      makeEmbed("User ID", `${user.username}: \`${user.id}\``)
    ]
  });
});

addCommand("membercount", "utility", "Show this server's member count", async message => {
  if (!message.guild) {
    return sendError(message, "Use this command inside a server.");
  }

  await message.reply({
    embeds: [
      makeEmbed(
        "Member Count",
        `This server has ${message.guild.memberCount} members.`
      )
    ]
  });
});

addCommand("roleinfo", "utility", "View information about a role", async message => {
  if (!message.guild) {
    return sendError(message, "Use this command inside a server.");
  }

  const role = message.mentions.roles.first()
    || message.guild.roles.cache.get(message.content.split(/\s+/)[1]);

  if (!role) {
    return sendError(
      message,
      `Mention a role or provide its ID. Example: ${PREFIX}roleinfo @Role`
    );
  }

  await message.reply({
    embeds: [
      makeEmbed("Role Information", [
        `Name: ${role.name}`,
        `Role ID: ${role.id}`,
        `Members: ${role.members.size}`,
        `Position: ${role.position}`,
        `Mentionable: ${role.mentionable ? "Yes" : "No"}`,
        `Created: <t:${Math.floor(role.createdTimestamp / 1000)}:D>`
      ].join("\n"))
    ]
  });
});

addCommand("channelinfo", "utility", "View information about a channel", async message => {
  if (!message.guild) {
    return sendError(message, "Use this command inside a server.");
  }

  const channel = message.mentions.channels.first()
    || message.channel;

  await message.reply({
    embeds: [
      makeEmbed("Channel Information", [
        `Name: ${channel.name || "Unknown"}`,
        `Channel ID: ${channel.id}`,
        `Type: ${ChannelType[channel.type] || channel.type}`,
        `Created: <t:${Math.floor(channel.createdTimestamp / 1000)}:D>`
      ].join("\n"))
    ]
  });
});

addCommand("say", "utility", "Send text as the bot", async message => {
  const text = message.content.slice(
    PREFIX.length + message.content.trim().split(/\s+/)[0].length
  ).trim();

  if (!text) {
    return sendError(message, `Usage: ${PREFIX}say your message`);
  }

  if (!hasPermission(message.member, PermissionFlagsBits.ManageMessages)) {
    return sendError(message, "You need Manage Messages permission.");
  }

  await message.delete().catch(() => null);
  await message.channel.send({
    content: text,
    allowedMentions: { parse: [] }
  });
});

addCommand("clear", "moderation", "Delete a number of recent messages", async message => {
  if (!message.guild) {
    return sendError(message, "Use this command inside a server.");
  }

  if (!hasPermission(message.member, PermissionFlagsBits.ManageMessages)) {
    return sendError(message, "You need Manage Messages permission.");
  }

  if (!message.guild.members.me?.permissions.has(
    PermissionFlagsBits.ManageMessages
  )) {
    return sendError(message, "I need Manage Messages permission.");
  }

  const amount = Number(message.content.trim().split(/\s+/)[1]);

  if (!Number.isInteger(amount) || amount < 1 || amount > 100) {
    return sendError(message, `Usage: ${PREFIX}clear 1-100`);
  }

  const deleted = await message.channel.bulkDelete(amount, true)
    .catch(() => null);

  if (!deleted) {
    return sendError(
      message,
      "I could not bulk-delete messages. Check channel permissions and message age."
    );
  }

  const confirmation = await message.channel.send({
    embeds: [
      makeEmbed(
        "Messages Cleared",
        `Deleted ${deleted.size} recent messages.`
      )
    ]
  }).catch(() => null);

  if (confirmation) {
    setTimeout(() => confirmation.delete().catch(() => null), 5000);
  }
});

addCommand("kick", "moderation", "Kick a member from the server", async message => {
  if (!message.guild) {
    return sendError(message, "Use this command inside a server.");
  }

  if (!hasPermission(message.member, PermissionFlagsBits.KickMembers)) {
    return sendError(message, "You need Kick Members permission.");
  }

  if (!message.guild.members.me?.permissions.has(
    PermissionFlagsBits.KickMembers
  )) {
    return sendError(message, "I need Kick Members permission.");
  }

  const member = message.mentions.members.first();
  const reason = message.content.trim().split(/\s+/).slice(2).join(" ")
    || "No reason provided.";

  if (!member) {
    return sendError(message, `Usage: ${PREFIX}kick @member [reason]`);
  }

  if (member.id === message.author.id) {
    return sendError(message, "You cannot kick yourself.");
  }

  if (!member.kickable) {
    return sendError(message, "That member cannot be kicked by me.");
  }

  await member.kick(reason);

  await sendSuccess(
    message,
    `Kicked ${member.user.tag}.\nReason: ${reason}`
  );
});

addCommand("ban", "moderation", "Ban a member from the server", async message => {
  if (!message.guild) {
    return sendError(message, "Use this command inside a server.");
  }

  if (!hasPermission(message.member, PermissionFlagsBits.BanMembers)) {
    return sendError(message, "You need Ban Members permission.");
  }

  if (!message.guild.members.me?.permissions.has(
    PermissionFlagsBits.BanMembers
  )) {
    return sendError(message, "I need Ban Members permission.");
  }

  const member = message.mentions.members.first();
  const reason = message.content.trim().split(/\s+/).slice(2).join(" ")
    || "No reason provided.";

  if (!member) {
    return sendError(message, `Usage: ${PREFIX}ban @member [reason]`);
  }

  if (member.id === message.author.id) {
    return sendError(message, "You cannot ban yourself.");
  }

  if (!member.bannable) {
    return sendError(message, "That member cannot be banned by me.");
  }

  await member.ban({ reason });

  await sendSuccess(
    message,
    `Banned ${member.user.tag}.\nReason: ${reason}`
  );
});

addCommand("timeout", "moderation", "Timeout a member for a duration in minutes", async message => {
  if (!message.guild) {
    return sendError(message, "Use this command inside a server.");
  }

  if (!hasPermission(message.member, PermissionFlagsBits.ModerateMembers)) {
    return sendError(message, "You need Moderate Members permission.");
  }

  if (!message.guild.members.me?.permissions.has(
    PermissionFlagsBits.ModerateMembers
  )) {
    return sendError(message, "I need Moderate Members permission.");
  }

  const args = message.content.trim().split(/\s+/);
  const member = message.mentions.members.first();
  const minutes = Number(args[2]);
  const reason = args.slice(3).join(" ") || "No reason provided.";

  if (!member || !Number.isInteger(minutes) || minutes < 1 || minutes > 40320) {
    return sendError(
      message,
      `Usage: ${PREFIX}timeout @member minutes [reason]\nMaximum duration: 40320 minutes.`
    );
  }

  if (!member.moderatable) {
    return sendError(message, "That member cannot be timed out by me.");
  }

  await member.timeout(minutes * 60 * 1000, reason);

  await sendSuccess(
    message,
    `Timed out ${member.user.tag} for ${minutes} minutes.\nReason: ${reason}`
  );
});

addCommand("untimeout", "moderation", "Remove a member's timeout", async message => {
  if (!message.guild) {
    return sendError(message, "Use this command inside a server.");
  }

  if (!hasPermission(message.member, PermissionFlagsBits.ModerateMembers)) {
    return sendError(message, "You need Moderate Members permission.");
  }

  const member = message.mentions.members.first();

  if (!member) {
    return sendError(message, `Usage: ${PREFIX}untimeout @member`);
  }

  if (!member.moderatable) {
    return sendError(message, "That member cannot be modified by me.");
  }

  await member.timeout(null, `Timeout removed by ${message.author.tag}`);

  await sendSuccess(message, `Removed timeout for ${member.user.tag}.`);
});

addCommand("lock", "moderation", "Prevent members from sending messages in this channel", async message => {
  if (!message.guild) {
    return sendError(message, "Use this command inside a server.");
  }

  if (!hasPermission(message.member, PermissionFlagsBits.ManageChannels)) {
    return sendError(message, "You need Manage Channels permission.");
  }

  const botMember = message.guild.members.me;

  if (!botMember?.permissions.has(PermissionFlagsBits.ManageChannels)) {
    return sendError(message, "I need Manage Channels permission.");
  }

  await message.channel.permissionOverwrites.edit(
    message.guild.roles.everyone,
    { SendMessages: false }
  );

  await sendSuccess(message, "This channel is now locked for regular members.");
});

addCommand("unlock", "moderation", "Allow members to send messages in this channel again", async message => {
  if (!message.guild) {
    return sendError(message, "Use this command inside a server.");
  }

  if (!hasPermission(message.member, PermissionFlagsBits.ManageChannels)) {
    return sendError(message, "You need Manage Channels permission.");
  }

  if (!message.guild.members.me?.permissions.has(
    PermissionFlagsBits.ManageChannels
  )) {
    return sendError(message, "I need Manage Channels permission.");
  }

  await message.channel.permissionOverwrites.edit(
    message.guild.roles.everyone,
    { SendMessages: null }
  );

  await sendSuccess(message, "The channel's default send-message permission was restored.");
});
      
const warningStore = new Map();
const economyStore = new Map();
const automodSettings = new Map();

function getWarningKey(guildId, userId) {
  return `${guildId}:${userId}`;
}

function getEconomyKey(guildId, userId) {
  return `${guildId}:${userId}`;
}

function getEconomy(guildId, userId) {
  const key = getEconomyKey(guildId, userId);

  if (!economyStore.has(key)) {
    economyStore.set(key, {
      wallet: 0,
      bank: 0,
      lastDaily: 0,
      lastWork: 0
    });
  }

  return economyStore.get(key);
}

function getAutomod(guildId) {
  if (!automodSettings.has(guildId)) {
    automodSettings.set(guildId, {
      enabled: false,
      invites: false,
      links: false,
      blockedWords: [],
      logChannelId: null
    });
  }

  return automodSettings.get(guildId);
}

function getWarnings(guildId, userId) {
  return warningStore.get(getWarningKey(guildId, userId)) || [];
}

function saveWarning(guildId, userId, warning) {
  const key = getWarningKey(guildId, userId);
  const warnings = getWarnings(guildId, userId);

  warnings.push(warning);
  warningStore.set(key, warnings);

  return warnings.length;
}

function parseMentionedMember(message) {
  return message.mentions.members.first() || null;
}

addCommand("warn", "moderation", "Warn a member and record the reason", async message => {
  if (!message.guild) {
    return sendError(message, "Use this command inside a server.");
  }

  if (!hasPermission(message.member, PermissionFlagsBits.ModerateMembers)) {
    return sendError(message, "You need Moderate Members permission.");
  }

  const member = parseMentionedMember(message);
  const reason = message.content.trim().split(/\s+/).slice(2).join(" ")
    || "No reason provided.";

  if (!member) {
    return sendError(message, `Usage: ${PREFIX}warn @member [reason]`);
  }

  if (member.id === message.author.id || member.user.bot) {
    return sendError(message, "Choose a valid member to warn.");
  }

  const count = saveWarning(message.guild.id, member.id, {
    moderator: message.author.id,
    reason,
    time: Date.now()
  });

  await sendSuccess(
    message,
    `Recorded a warning for ${member.user.tag}.\nTotal recorded warnings: ${count}\nReason: ${reason}`
  );
});

addCommand("warnings", "moderation", "View a member's recorded warnings", async message => {
  if (!message.guild) {
    return sendError(message, "Use this command inside a server.");
  }

  if (!hasPermission(message.member, PermissionFlagsBits.ModerateMembers)) {
    return sendError(message, "You need Moderate Members permission.");
  }

  const member = parseMentionedMember(message);

  if (!member) {
    return sendError(message, `Usage: ${PREFIX}warnings @member`);
  }

  const warnings = getWarnings(message.guild.id, member.id);

  if (!warnings.length) {
    return message.reply({
      embeds: [makeEmbed("Warnings", `${member.user.tag} has no recorded warnings.`)]
    });
  }

  const description = warnings.slice(-10).map((warning, index) =>
    `${index + 1}. ${warning.reason}\nModerator: <@${warning.moderator}>\nDate: <t:${Math.floor(warning.time / 1000)}:f>`
  ).join("\n\n");

  await message.reply({
    embeds: [
      makeEmbed(
        `Warnings for ${member.user.username}`,
        `${description}\n\nShowing up to the latest 10 warnings.`
      )
    ]
  });
});

addCommand("slowmode", "moderation", "Set the current channel's slowmode", async message => {
  if (!message.guild) {
    return sendError(message, "Use this command inside a server.");
  }

  if (!hasPermission(message.member, PermissionFlagsBits.ManageChannels)) {
    return sendError(message, "You need Manage Channels permission.");
  }

  if (!message.channel.setRateLimitPerUser) {
    return sendError(message, "Slowmode is not supported in this channel.");
  }

  const seconds = Number(message.content.trim().split(/\s+/)[1]);

  if (!Number.isInteger(seconds) || seconds < 0 || seconds > 21600) {
    return sendError(message, `Usage: ${PREFIX}slowmode 0-21600`);
  }

  await message.channel.setRateLimitPerUser(
    seconds,
    `Changed by ${message.author.tag}`
  );

  await sendSuccess(message, `Slowmode set to ${seconds} seconds.`);
});

addCommand("automod", "automod", "Enable or disable basic automatic moderation", async message => {
  if (!message.guild) {
    return sendError(message, "Use this command inside a server.");
  }

  if (!hasPermission(message.member, PermissionFlagsBits.ManageGuild)) {
    return sendError(message, "You need Manage Server permission.");
  }

  const settings = getAutomod(message.guild.id);
  const action = message.content.trim().split(/\s+/)[1]?.toLowerCase();

  if (action === "on") {
    settings.enabled = true;
    return sendSuccess(message, "Basic automatic moderation is enabled.");
  }

  if (action === "off") {
    settings.enabled = false;
    return sendSuccess(message, "Basic automatic moderation is disabled.");
  }

  return message.reply({
    embeds: [
      makeEmbed("Automod Configuration", [
        `Status: ${settings.enabled ? "Enabled" : "Disabled"}`,
        `Invite filter: ${settings.invites ? "Enabled" : "Disabled"}`,
        `Link filter: ${settings.links ? "Enabled" : "Disabled"}`,
        `Blocked words: ${settings.blockedWords.length}`,
        "",
        `Enable: ${PREFIX}automod on`,
        `Disable: ${PREFIX}automod off`,
        `Invite filter: ${PREFIX}antiinvite on/off`,
        `Link filter: ${PREFIX}antilink on/off`
      ].join("\n"))
    ]
  });
});

addCommand("antiinvite", "automod", "Toggle Discord invite filtering", async message => {
  if (!message.guild) {
    return sendError(message, "Use this command inside a server.");
  }

  if (!hasPermission(message.member, PermissionFlagsBits.ManageGuild)) {
    return sendError(message, "You need Manage Server permission.");
  }

  const action = message.content.trim().split(/\s+/)[1]?.toLowerCase();

  if (!["on", "off"].includes(action)) {
    return sendError(message, `Usage: ${PREFIX}antiinvite on/off`);
  }

  const settings = getAutomod(message.guild.id);
  settings.invites = action === "on";

  await sendSuccess(message, `Invite filter ${action === "on" ? "enabled" : "disabled"}.`);
});

addCommand("antilink", "automod", "Toggle URL filtering", async message => {
  if (!message.guild) {
    return sendError(message, "Use this command inside a server.");
  }

  if (!hasPermission(message.member, PermissionFlagsBits.ManageGuild)) {
    return sendError(message, "You need Manage Server permission.");
  }

  const action = message.content.trim().split(/\s+/)[1]?.toLowerCase();

  if (!["on", "off"].includes(action)) {
    return sendError(message, `Usage: ${PREFIX}antilink on/off`);
  }

  const settings = getAutomod(message.guild.id);
  settings.links = action === "on";

  await sendSuccess(message, `Link filter ${action === "on" ? "enabled" : "disabled"}.`);
});

addCommand("blockword", "automod", "Add a word to the automatic moderation filter", async message => {
  if (!message.guild) {
    return sendError(message, "Use this command inside a server.");
  }

  if (!hasPermission(message.member, PermissionFlagsBits.ManageGuild)) {
    return sendError(message, "You need Manage Server permission.");
  }

  const word = message.content.trim().split(/\s+/).slice(1).join(" ")
    .toLowerCase();

  if (!word || word.length > 60) {
    return sendError(message, `Usage: ${PREFIX}blockword word`);
  }

  const settings = getAutomod(message.guild.id);

  if (settings.blockedWords.includes(word)) {
    return sendError(message, "That word is already in the filter.");
  }

  settings.blockedWords.push(word);

  await sendSuccess(message, `Added "${word}" to the word filter.`);
});

addCommand("unblockword", "automod", "Remove a word from the automatic moderation filter", async message => {
  if (!message.guild) {
    return sendError(message, "Use this command inside a server.");
  }

  if (!hasPermission(message.member, PermissionFlagsBits.ManageGuild)) {
    return sendError(message, "You need Manage Server permission.");
  }

  const word = message.content.trim().split(/\s+/).slice(1).join(" ")
    .toLowerCase();

  const settings = getAutomod(message.guild.id);
  const index = settings.blockedWords.indexOf(word);

  if (!word || index === -1) {
    return sendError(message, "That word is not in the filter.");
  }

  settings.blockedWords.splice(index, 1);

  await sendSuccess(message, `Removed "${word}" from the word filter.`);
});

addCommand("balance", "economy", "Check your virtual wallet and bank", async message => {
  if (!message.guild) {
    return sendError(message, "Use this command inside a server.");
  }

  const target = message.mentions.users.first() || message.author;
  const account = getEconomy(message.guild.id, target.id);

  await message.reply({
    embeds: [
      makeEmbed("Account Balance", [
        `Account: ${target.username}`,
        `Wallet: ${account.wallet} credits`,
        `Bank: ${account.bank} credits`,
        `Total: ${account.wallet + account.bank} credits`
      ].join("\n"))
    ]
  });
}, { aliases: ["bal"] });

addCommand("daily", "economy", "Claim your daily virtual reward", async message => {
  if (!message.guild) {
    return sendError(message, "Use this command inside a server.");
  }

  const account = getEconomy(message.guild.id, message.author.id);
  const cooldown = 24 * 60 * 60 * 1000;
  const remaining = cooldown - (Date.now() - account.lastDaily);

  if (remaining > 0) {
    return sendError(
      message,
      `You can claim again in ${formatDuration(remaining)}.`
    );
  }

  const reward = 250;
  account.wallet += reward;
  account.lastDaily = Date.now();

  await sendSuccess(
    message,
    `You received ${reward} virtual credits.\nWallet balance: ${account.wallet} credits.`
  );
});

addCommand("work", "economy", "Earn virtual credits by working", async message => {
  if (!message.guild) {
    return sendError(message, "Use this command inside a server.");
  }

  const account = getEconomy(message.guild.id, message.author.id);
  const cooldown = 60 * 60 * 1000;
  const remaining = cooldown - (Date.now() - account.lastWork);

  if (remaining > 0) {
    return sendError(message, `Try again in ${formatDuration(remaining)}.`);
  }

  const reward = Math.floor(Math.random() * 101) + 50;

  account.wallet += reward;
  account.lastWork = Date.now();

  await sendSuccess(
    message,
    `You earned ${reward} virtual credits.\nWallet balance: ${account.wallet} credits.`
  );
});

addCommand("deposit", "economy", "Move virtual credits into your bank", async message => {
  if (!message.guild) {
    return sendError(message, "Use this command inside a server.");
  }

  const account = getEconomy(message.guild.id, message.author.id);
  const amountText = message.content.trim().split(/\s+/)[1];
  const amount = amountText === "all" ? account.wallet : Number(amountText);

  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > account.wallet) {
    return sendError(message, `Usage: ${PREFIX}deposit amount or ${PREFIX}deposit all`);
  }

  account.wallet -= amount;
  account.bank += amount;

  await sendSuccess(message, `Deposited ${amount} credits into your bank.`);
});

addCommand("withdraw", "economy", "Move virtual credits from your bank to your wallet", async message => {
  if (!message.guild) {
    return sendError(message, "Use this command inside a server.");
  }

  const account = getEconomy(message.guild.id, message.author.id);
  const amountText = message.content.trim().split(/\s+/)[1];
  const amount = amountText === "all" ? account.bank : Number(amountText);

  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > account.bank) {
    return sendError(message, `Usage: ${PREFIX}withdraw amount or ${PREFIX}withdraw all`);
  }

  account.bank -= amount;
  account.wallet += amount;

  await sendSuccess(message, `Withdrew ${amount} credits from your bank.`);
});

addCommand("pay", "economy", "Transfer virtual credits to another member", async message => {
  if (!message.guild) {
    return sendError(message, "Use this command inside a server.");
  }

  const recipient = message.mentions.users.first();
  const args = message.content.trim().split(/\s+/);
  const amount = Number(args[2]);

  if (!recipient || recipient.bot || recipient.id === message.author.id) {
    return sendError(message, `Usage: ${PREFIX}pay @member amount`);
  }

  const senderAccount = getEconomy(message.guild.id, message.author.id);
  const recipientAccount = getEconomy(message.guild.id, recipient.id);

  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > senderAccount.wallet) {
    return sendError(message, "Enter a valid amount within your wallet balance.");
  }

  senderAccount.wallet -= amount;
  recipientAccount.wallet += amount;

  await sendSuccess(
    message,
    `Transferred ${amount} virtual credits to ${recipient.username}.`
  );
});

addCommand("leaderboard", "economy", "Show the richest members in this bot session", async message => {
  if (!message.guild) {
    return sendError(message, "Use this command inside a server.");
  }

  const entries = [...economyStore.entries()]
    .filter(([key]) => key.startsWith(`${message.guild.id}:`))
    .map(([key, account]) => ({
      userId: key.split(":")[1],
      total: account.wallet + account.bank
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  const description = entries.length
    ? entries.map((entry, index) =>
        `${index + 1}. <@${entry.userId}> — ${entry.total} credits`
      ).join("\n")
    : "No economy accounts have been created yet.";

  await message.reply({
    embeds: [makeEmbed("Economy Leaderboard", description)]
  });
});

addCommand("coinflip", "games", "Play a virtual-credit coin flip", async message => {
  if (!message.guild) {
    return sendError(message, "Use this command inside a server.");
  }

  const args = message.content.trim().split(/\s+/);
  const choice = args[1]?.toLowerCase();
  const amount = Number(args[2]);

  if (!["heads", "tails"].includes(choice)) {
    return sendError(message, `Usage: ${PREFIX}coinflip heads/tails amount`);
  }

  if (!Number.isSafeInteger(amount) || amount < 1 || amount > 1000) {
    return sendError(message, "Choose a virtual-credit amount from 1 to 1000.");
  }

  const account = getEconomy(message.guild.id, message.author.id);

  if (account.wallet < amount) {
    return sendError(message, "You do not have enough virtual credits.");
  }

  const result = Math.random() < 0.5 ? "heads" : "tails";
  const won = result === choice;

  if (won) {
    account.wallet += amount;
  } else {
    account.wallet -= amount;
  }

  await message.reply({
    embeds: [
      makeEmbed("Coin Flip Result", [
        `Your choice: ${choice}`,
        `Result: ${result}`,
        `Outcome: ${won ? "Win" : "Loss"}`,
        `Wallet: ${account.wallet} credits`
      ].join("\n"), won ? COLORS.success : COLORS.neutral)
    ]
  });
});

addCommand("support", "partnership", "Show the official support server", async message => {
  await message.reply({
    embeds: [
      makeEmbed(
        "Pyrr Official Support",
        `Join the support server for help and announcements:\n${SUPPORT_URL}`
      )
    ]
  });
});

addCommand("partnership", "partnership", "Show partnership information", async message => {
  await message.reply({
    embeds: [
      makeEmbed(
        "Partnership Information",
        [
          "Interested in partnering with Pyrr Official?",
          "Contact the support team to discuss your server and partnership requirements.",
          "",
          `Support server: ${SUPPORT_URL}`
        ].join("\n")
      )
    ]
  });
});

addCommand("invite", "system", "Show the bot invite link", async message => {
  if (!client.application) {
    await client.application?.fetch().catch(() => null);
  }

  const applicationId = client.application?.id || client.user.id;
  const invite = `https://discord.com/oauth2/authorize?client_id=${applicationId}&scope=bot%20applications.commands&permissions=0`;

  await message.reply({
    embeds: [
      makeEmbed("Invite Pyrr Official", `[Open the Discord authorization page](${invite})`)
    ]
  });
});

addCommand("prefix", "system", "Show the current command prefix", async message => {
  await message.reply({
    embeds: [
      makeEmbed("Command Prefix", `Current prefix: \`${PREFIX}\``)
    ]
  });
});

addCommand("sayembed", "system", "Send a custom title and message as an embed", async message => {
  if (!hasPermission(message.member, PermissionFlagsBits.ManageMessages)) {
    return sendError(message, "You need Manage Messages permission.");
  }

  const args = message.content.trim().split(/\s+/);
  const title = args[1];
  const description = args.slice(2).join(" ");

  if (!title || !description) {
    return sendError(message, `Usage: ${PREFIX}sayembed title message`);
  }

  await message.channel.send({
    embeds: [makeEmbed(title.slice(0, 200), description.slice(0, 4000))],
    allowedMentions: { parse: [] }
  });
});

addCommand("owner", "system", "Show the configured bot owner", async message => {
  const owners = (process.env.OWNER_IDS || "")
    .split(",")
    .map(id => id.trim())
    .filter(Boolean);

  await message.reply({
    embeds: [
      makeEmbed(
        "Bot Owner",
        owners.length
          ? owners.map(id => `<@${id}>`).join("\n")
          : `Creator: ${CREATOR}\nSet OWNER_IDS in the hosting environment to configure owner mentions.`
      )
    ]
  });
});
      
client.on("messageCreate", async message => {
  try {
    if (!message.guild || message.author.bot) return;

    const settings = getAutomod(message.guild.id);
    const member = message.member;

    if (
      settings.enabled &&
      member &&
      !member.permissions.has(PermissionFlagsBits.ManageMessages)
    ) {
      const content = message.content.toLowerCase();

      const containsInvite =
        /(?:discord\.gg\/|discord(?:app)?\.com\/invite\/)[a-z0-9-]+/i.test(content);

      const containsLink =
        /https?:\/\/\S+|www\.\S+/i.test(content);

      const containsBlockedWord = settings.blockedWords.some(word =>
        content.includes(word.toLowerCase())
      );

      const shouldDelete =
        (settings.invites && containsInvite) ||
        (settings.links && containsLink) ||
        containsBlockedWord;

      if (shouldDelete) {
        await message.delete().catch(() => null);
        return;
      }
    }

    if (!message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
    const commandName = args.shift()?.toLowerCase();

    if (!commandName) return;

    const command = getCommand(commandName);
    if (!command) return;

    if (disabledCommands.has(command.name)) {
      return sendError(message, "This command is currently disabled.");
    }

    if (command.ownerOnly && !isOwner(message.author.id)) {
      return sendError(message, "This command is restricted to the bot owner.");
    }

    if (command.permissions && !hasPermission(message.member, command.permissions)) {
      return sendError(message, "You do not have permission to use this command.");
    }

    const cooldownKey = `${message.guild.id}:${message.author.id}:${command.name}`;
    const lastUsed = cooldowns.get(cooldownKey) || 0;
    const remaining = command.cooldown - (Date.now() - lastUsed);

    if (remaining > 0) {
      return sendError(
        message,
        `Please wait ${Math.ceil(remaining / 1000)} seconds before using this command again.`
      );
    }

    cooldowns.set(cooldownKey, Date.now());

    await command.execute(message, args);
  } catch (error) {
    console.error("Prefix command error:", error);

    await message.reply({
      embeds: [
        makeEmbed(
          "Command Error",
          "The command could not be completed. Check the bot logs and permissions.",
          COLORS.error
        )
      ]
    }).catch(() => null);
  }
});

client.on("interactionCreate", async interaction => {
  try {
    if (interaction.isStringSelectMenu()) {
      if (interaction.customId !== "pyrr_help_category") return;

      const category = interaction.values[0];
      const validCategory = HELP_CATEGORIES.some(
        item => item.value === category
      );

      if (!validCategory) {
        return safeReply(interaction, {
          content: "Invalid help category.",
          ephemeral: true
        });
      }

      await interaction.update({
        embeds: [buildHelpEmbed(category)],
        components: [createHelpMenu()]
      });

      return;
    }

    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === "help") {
      await interaction.reply({
        embeds: [buildHelpEmbed("general")],
        components: [createHelpMenu()]
      });
      return;
    }

    if (interaction.commandName === "ping") {
      await interaction.reply({
        embeds: [
          makeEmbed(
            "Connection Status",
            `API latency: ${Math.round(client.ws.ping)}ms`
          )
        ]
      });
      return;
    }

    if (interaction.commandName === "botinfo") {
      await interaction.reply({
        embeds: [
          makeEmbed("Bot Information", [
            `Name: ${BOT_NAME}`,
            `Creator: ${CREATOR}`,
            `Servers: ${client.guilds.cache.size}`,
            `Users: ${getTotalUsers()}`,
            `Prefix commands: ${commandRegistry.size}`,
            `Uptime: ${formatDuration(Date.now() - startedAt)}`,
            `Support: ${SUPPORT_URL}`
          ].join("\n"))
        ]
      });
    }
  } catch (error) {
    console.error("Interaction error:", error);

    await safeReply(interaction, {
      content: "Something went wrong while processing this interaction.",
      ephemeral: true
    });
  }
});

client.once("ready", () => {
  console.log("--------------------------------");
  console.log(`${BOT_NAME} is online.`);
  console.log(`Creator: ${CREATOR}`);
  console.log(`Bot ID: ${client.user.id}`);
  console.log(`Servers: ${client.guilds.cache.size}`);
  console.log(`Known members: ${getTotalUsers()}`);
  console.log(`Registered prefix commands: ${commandRegistry.size}`);
  console.log(`Prefix: ${PREFIX}`);
  console.log("--------------------------------");

  updatePresence();

  setInterval(() => {
    updatePresence();
  }, 5 * 60 * 1000);
});

client.on("guildCreate", () => {
  updatePresence();
});

client.on("guildDelete", () => {
  updatePresence();
});

client.on("error", error => {
  console.error("Discord client error:", error);
});

process.on("unhandledRejection", error => {
  console.error("Unhandled promise rejection:", error);
});

process.on("uncaughtException", error => {
  console.error("Uncaught exception:", error);
});

client.login(process.env.DISCORD_TOKEN);
    
