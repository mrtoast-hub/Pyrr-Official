
const {
  Client,
  GatewayIntentBits,
  Partials,
  ActivityType,
  EmbedBuilder,
  PermissionsBitField,
  SlashCommandBuilder,
  REST,
  Routes
} = require("discord.js");

const fs = require("node:fs");
const path = require("node:path");

// ============================================
// PYRR OFFICIAL | MAIN CONFIGURATION
// ============================================

const BOT_NAME = "Pyrr Official";
const CREATOR = "_upyr";
const DEFAULT_PREFIX = ",";
const SUPPORT_SERVER = "https://discord.gg/TwDBvBmVdM";
const TWITCH_URL = "https://www.twitch.tv/noctis_official01";

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const OWNER_IDS = (process.env.OWNER_IDS || "")
  .split(",")
  .map(value => value.trim())
  .filter(Boolean);

if (!TOKEN) {
  console.error("[Pyrr] DISCORD_TOKEN is missing.");
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildInvites
  ],
  partials: [
    Partials.User,
    Partials.GuildMember,
    Partials.Message,
    Partials.Channel
  ]
});

// ============================================
// DATABASE
// ============================================

const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "pyrr-data.json");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadDatabase() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      return { guilds: {}, users: {} };
    }

    const parsed = JSON.parse(
      fs.readFileSync(DATA_FILE, "utf8")
    );

    return {
      guilds: parsed.guilds || {},
      users: parsed.users || {}
    };
  } catch (error) {
    console.error("[Pyrr] Database error:", error.message);
    return { guilds: {}, users: {} };
  }
}

const db = loadDatabase();

function saveDatabase() {
  try {
    const temporaryPath = DATA_FILE + ".tmp";

    fs.writeFileSync(
      temporaryPath,
      JSON.stringify(db, null, 2),
      "utf8"
    );

    fs.renameSync(temporaryPath, DATA_FILE);
  } catch (error) {
    console.error("[Pyrr] Save error:", error.message);
  }
}

// ============================================
// DEFAULT SERVER CONFIGURATION
// ============================================

function defaultConfig() {
  return {
    prefix: DEFAULT_PREFIX,

    welcome: {
      enabled: false,
      channelId: null,
      message: "Welcome {user} to {server}! Member #{count}."
    },

    leave: {
      enabled: false,
      channelId: null,
      message: "{username} has left {server}."
    },

    logs: {
      channelId: null
    },

    antinuke: {
      enabled: false,
      limit: 3,
      windowSeconds: 10,
      protectedUsers: []
    },

    antiraid: {
      enabled: false,
      joinLimit: 8,
      windowSeconds: 10,
      minimumAccountAgeHours: 24
    },

    automod: {
      enabled: false,
      antiSpam: true,
      antiInvite: false,
      antiMassMention: true
    },

    tickets: {
      categoryId: null,
      supportRoleId: null,
      logChannelId: null
    },

    warnings: {},
    disabledCommands: []
  };
}

function getConfig(guildId) {
  if (!db.guilds[guildId]) {
    db.guilds[guildId] = defaultConfig();
    saveDatabase();
  }

  const config = db.guilds[guildId];
  const defaults = defaultConfig();

  for (const [key, value] of Object.entries(defaults)) {
    if (config[key] === undefined) {
      config[key] = value;
    } else if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value)
    ) {
      config[key] = { ...value, ...config[key] };
    }
  }

  return config;
}

// ============================================
// COMMAND REGISTRY
// ============================================

const commands = new Map();
const slashCommands = [];

function registerCommand({
  name,
  description,
  category = "General",
  aliases = [],
  options = [],
  slash = true,
  execute
}) {
  const command = {
    name,
    description,
    category,
    aliases,
    options,
    slash,
    execute
  };

  commands.set(name, command);

  for (const alias of aliases) {
    commands.set(alias, command);
  }

  if (slash) {
    const builder = new SlashCommandBuilder()
      .setName(name)
      .setDescription(description.slice(0, 100));

    for (const option of options) {
      if (option.type === "string") {
        builder.addStringOption(item => {
          item
            .setName(option.name)
            .setDescription(option.description || option.name)
            .setRequired(Boolean(option.required));

          if (option.choices) {
            item.addChoices(...option.choices);
          }

          return item;
        });
      } else if (option.type === "user") {
        builder.addUserOption(item =>
          item
            .setName(option.name)
            .setDescription(option.description || option.name)
            .setRequired(Boolean(option.required))
        );
      } else if (option.type === "integer") {
        builder.addIntegerOption(item =>
          item
            .setName(option.name)
            .setDescription(option.description || option.name)
            .setRequired(Boolean(option.required))
        );
      } else if (option.type === "boolean") {
        builder.addBooleanOption(item =>
          item
            .setName(option.name)
            .setDescription(option.description || option.name)
            .setRequired(Boolean(option.required))
        );
      } else if (option.type === "channel") {
        builder.addChannelOption(item =>
          item
            .setName(option.name)
            .setDescription(option.description || option.name)
            .setRequired(Boolean(option.required))
        );
      } else if (option.type === "role") {
        builder.addRoleOption(item =>
          item
            .setName(option.name)
            .setDescription(option.description || option.name)
            .setRequired(Boolean(option.required))
        );
      }
    }

    slashCommands.push(builder);
  }
}

// ============================================
// PERMISSION & MESSAGE HELPERS
// ============================================

function isOwner(userId) {
  return OWNER_IDS.includes(userId);
}

function hasPermission(member, permission) {
  return Boolean(member?.permissions?.has(permission));
}

function canManageSettings(ctx) {
  return isOwner(ctx.user.id) ||
    hasPermission(
      ctx.member,
      PermissionsBitField.Flags.ManageGuild
    );
}

function makeEmbed(title, description, color = 0x252525) {
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(description)
    .setFooter({ text: `${BOT_NAME} | ${CREATOR}` })
    .setTimestamp();
}

function getPrefix(guildId) {
  return guildId
    ? getConfig(guildId).prefix || DEFAULT_PREFIX
    : DEFAULT_PREFIX;
}

function formatTemplate(template, values) {
  return String(template || "").replace(
    /\{(user|username|server|count|id)\}/g,
    (_, key) => String(values[key] ?? "")
  );
}

function makeContext(source, isInteraction) {
  const user = isInteraction ? source.user : source.author;
  const guild = source.guild;
  const member = isInteraction ? source.member : source.member;

  return {
    source,
    isInteraction,
    user,
    guild,
    member,
    channel: source.channel,
    options: isInteraction ? source.options : null,

    async reply(payload) {
      if (typeof payload === "string") {
        payload = { content: payload };
      }

      if (isInteraction) {
        if (source.deferred || source.replied) {
          return source.followUp(payload);
        }

        return source.reply({
          ...payload,
          allowedMentions: payload.allowedMentions || {
            parse: []
          }
        });
      }

      return source.reply({
        ...payload,
        allowedMentions: payload.allowedMentions || {
          parse: [],
          repliedUser: false
        }
      });
    },

    embed(title, description, color) {
      return this.reply({
        embeds: [makeEmbed(title, description, color)]
      });
    },

    getString(name) {
      if (isInteraction) {
        return source.options.getString(name);
      }

      return null;
    },

    getUser(name) {
      if (isInteraction) {
        return source.options.getUser(name);
      }

      return null;
    },

    getInteger(name) {
      if (isInteraction) {
        return source.options.getInteger(name);
      }

      return null;
    },

    getBoolean(name) {
      if (isInteraction) {
        return source.options.getBoolean(name);
      }

      return null;
    },

    getChannel(name) {
      if (isInteraction) {
        return source.options.getChannel(name);
      }

      return null;
    },

    getRole(name) {
      if (isInteraction) {
        return source.options.getRole(name);
      }

      return null;
    }
  };
}

// ============================================
// COMMAND EXECUTION
// ============================================

async function runCommand(command, ctx, args = []) {
  try {
    if (
      ctx.guild &&
      getConfig(ctx.guild.id).disabledCommands.includes(command.name)
    ) {
      return ctx.reply("This command is disabled in this server.");
    }

    await command.execute(ctx, args);
  } catch (error) {
    console.error(
      `[Pyrr] Command ${command.name} failed:`,
      error
    );

    const message = "An error occurred while running this command.";

    try {
      await ctx.reply({ content: message });
    } catch {
      // The interaction may have expired or already been acknowledged.
    }
  }
}

// ============================================
// END OF PART 1
// Append Part 2 below this line.
// Do not deploy until all parts are complete.
// ==========================================
        
/* ==========================================
   PART 2 — GENERAL / INFORMATION / UTILITY
   Append below Part 1
========================================== */

const BOT_STARTED_AT = Date.now();

function getUniqueCommands() {
  return [...new Set(commands.values())];
}

registerCommand({
  name: "help",
  description: "Show the command list.",
  category: "General",
  aliases: ["commands"],
  options: [{
    type: "string",
    name: "category",
    description: "Choose a command category."
  }],
  execute: async (ctx, args) => {
    const prefix = getPrefix(ctx.guild?.id);
    const selected = (
      ctx.isInteraction
        ? ctx.getString("category")
        : args[0]
    )?.toLowerCase();

    const all = getUniqueCommands();
    const categories = [...new Set(all.map(c => c.category))];

    if (selected && !categories.some(
      category => category.toLowerCase() === selected
    )) {
      return ctx.embed(
        "Help",
        `Unknown category.\nAvailable: ${categories.join(", ")}`
      );
    }

    const filtered = selected
      ? all.filter(c => c.category.toLowerCase() === selected)
      : all;

    const grouped = new Map();

    for (const command of filtered) {
      if (!grouped.has(command.category)) {
        grouped.set(command.category, []);
      }

      grouped.get(command.category).push(command);
    }

    const description = [...grouped.entries()]
      .map(([category, list]) => {
        const lines = list
          .sort((a, b) => a.name.localeCompare(b.name))
          .map(command => {
            const slash = command.slash
              ? `\`/${command.name}\``
              : "";

            const prefixText = `\`${prefix}${command.name}\``;

            return `${prefixText}${slash ? ` | ${slash}` : ""} — ${command.description}`;
          });

        return `**${category}**\n${lines.join("\n")}`;
      })
      .join("\n\n");

    return ctx.embed(
      selected ? `Help: ${selected}` : `${BOT_NAME} Commands`,
      `${description || "No commands in this category."}\n\n` +
      `Prefix: \`${prefix}\`\n` +
      `Support: ${SUPPORT_SERVER}`
    );
  }
});

registerCommand({
  name: "ping",
  description: "Check bot latency.",
  category: "General",
  execute: async ctx => {
    const latency = client.ws.ping;

    return ctx.embed(
      "Pong",
      `Gateway latency: **${latency} ms**`
    );
  }
});

registerCommand({
  name: "botinfo",
  description: "Show bot information.",
  category: "Information",
  execute: async ctx => {
    const guildCount = client.guilds.cache.size;

    const userCount = client.guilds.cache.reduce(
      (total, guild) => total + (guild.memberCount || 0),
      0
    );

    const uptimeSeconds = Math.floor(
      (Date.now() - BOT_STARTED_AT) / 1000
    );

    return ctx.embed(
      BOT_NAME,
      [
        `**Creator:** ${CREATOR}`,
        `**Bot ID:** ${client.user.id}`,
        `**Servers:** ${guildCount}`,
        `**Known members:** ${userCount}`,
        `**Commands:** ${getUniqueCommands().length}`,
        `**Uptime:** ${uptimeSeconds}s`,
        `**Prefix:** \`${getPrefix(ctx.guild?.id)}\``,
        `**Support:** ${SUPPORT_SERVER}`
      ].join("\n")
    );
  }
});

registerCommand({
  name: "serverinfo",
  description: "Show information about this server.",
  category: "Information",
  execute: async ctx => {
    if (!ctx.guild) {
      return ctx.reply("Use this command inside a server.");
    }

    const guild = ctx.guild;

    return ctx.embed(
      guild.name,
      [
        `**Server ID:** ${guild.id}`,
        `**Owner ID:** ${guild.ownerId || "Unavailable"}`,
        `**Members:** ${guild.memberCount}`,
        `**Channels:** ${guild.channels.cache.size}`,
        `**Roles:** ${guild.roles.cache.size}`,
        `**Created:** <t:${Math.floor(guild.createdTimestamp / 1000)}:F>`
      ].join("\n")
    );
  }
});

registerCommand({
  name: "userinfo",
  description: "Show information about a user.",
  category: "Information",
  aliases: ["whois"],
  options: [{
    type: "user",
    name: "user",
    description: "The user to inspect."
  }],
  execute: async (ctx, args) => {
    if (!ctx.guild) {
      return ctx.reply("Use this command inside a server.");
    }

    let user = ctx.isInteraction
      ? ctx.getUser("user")
      : ctx.source.mentions.users.first();

    if (!user && args[0]) {
      user = await client.users.fetch(args[0]).catch(() => null);
    }

    user ||= ctx.user;

    const member = await ctx.guild.members
      .fetch(user.id)
      .catch(() => null);

    const lines = [
      `**Username:** ${user.tag || user.username}`,
      `**User ID:** ${user.id}`,
      `**Account created:** <t:${Math.floor(user.createdTimestamp / 1000)}:F>`
    ];

    if (member?.joinedTimestamp) {
      lines.push(
        `**Joined server:** <t:${Math.floor(member.joinedTimestamp / 1000)}:F>`
      );
    }

    return ctx.embed(user.tag || user.username, lines.join("\n"));
  }
});

registerCommand({
  name: "avatar",
  description: "Show a user's avatar.",
  category: "Information",
  options: [{
    type: "user",
    name: "user",
    description: "Whose avatar to show."
  }],
  execute: async (ctx, args) => {
    let user = ctx.isInteraction
      ? ctx.getUser("user")
      : ctx.source.mentions.users.first();

    if (!user && args[0]) {
      user = await client.users.fetch(args[0]).catch(() => null);
    }

    user ||= ctx.user;

    const avatar = user.displayAvatarURL({
      size: 1024,
      extension: "png"
    });

    return ctx.reply({
      embeds: [
        makeEmbed(
          `${user.tag || user.username} — Avatar`,
          `[Open full-size avatar](${avatar})`
        ).setImage(avatar)
      ]
    });
  }
});

registerCommand({
  name: "servericon",
  description: "Show this server's icon.",
  category: "Information",
  execute: async ctx => {
    if (!ctx.guild) {
      return ctx.reply("Use this command inside a server.");
    }

    const icon = ctx.guild.iconURL({
      size: 1024,
      extension: "png"
    });

    if (!icon) {
      return ctx.reply("This server has no icon.");
    }

    return ctx.reply({
      embeds: [
        makeEmbed("Server Icon", `[Open image](${icon})`)
          .setImage(icon)
      ]
    });
  }
});

registerCommand({
  name: "membercount",
  description: "Show the server member count.",
  category: "Information",
  execute: async ctx => {
    if (!ctx.guild) {
      return ctx.reply("Use this command inside a server.");
    }

    return ctx.embed(
      "Member Count",
      `This server has **${ctx.guild.memberCount}** members.`
    );
  }
});

registerCommand({
  name: "uptime",
  description: "Show how long the bot has been online.",
  category: "Information",
  execute: async ctx => {
    const total = Math.floor(
      (Date.now() - BOT_STARTED_AT) / 1000
    );

    const days = Math.floor(total / 86400);
    const hours = Math.floor((total % 86400) / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;

    return ctx.embed(
      "Bot Uptime",
      `${days}d ${hours}h ${minutes}m ${seconds}s`
    );
  }
});

registerCommand({
  name: "invite",
  description: "Get an invite link for the bot.",
  category: "General",
  execute: async ctx => {
    const invite = `https://discord.com/oauth2/authorize?client_id=${client.user.id}&permissions=8&scope=bot%20applications.commands`;

    return ctx.embed(
      "Invite Pyrr Official",
      `[Add the bot to your server](${invite})\n` +
      `[Support server](${SUPPORT_SERVER})`
    );
  }
});

registerCommand({
  name: "support",
  description: "Show the support server link.",
  category: "General",
  execute: async ctx => {
    return ctx.embed(
      "Pyrr Official Support",
      `[Join the support server](${SUPPORT_SERVER})`
    );
  }
});

registerCommand({
  name: "prefix",
  description: "Show the current server prefix.",
  category: "Configuration",
  execute: async ctx => {
    return ctx.embed(
      "Current Prefix",
      `Prefix: \`${getPrefix(ctx.guild?.id)}\`\nExample: \`${getPrefix(ctx.guild?.id)}help\``
    );
  }
});

registerCommand({
  name: "twitch",
  description: "Show the creator's Twitch link.",
  category: "General",
  execute: async ctx => {
    return ctx.embed(
      "Twitch",
      `[Watch ${CREATOR}](${TWITCH_URL})`
    );
  }
});

registerCommand({
  name: "member",
  description: "Show your member profile.",
  category: "Information",
  execute: async ctx => {
    if (!ctx.guild) {
      return ctx.reply("Use this command inside a server.");
    }

    const member = await ctx.guild.members
      .fetch(ctx.user.id)
      .catch(() => null);

    if (!member) {
      return ctx.reply("Could not load your server profile.");
    }

    return ctx.embed(
      "Your Server Profile",
      [
        `**User:** ${ctx.user.tag || ctx.user.username}`,
        `**ID:** ${ctx.user.id}`,
        `**Roles:** ${Math.max(0, member.roles.cache.size - 1)}`,
        `**Joined:** ${member.joinedTimestamp
          ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`
          : "Unknown"}`
      ].join("\n")
    );
  }
});

registerCommand({
  name: "poll",
  description: "Create a simple yes/no poll.",
  category: "Utility",
  options: [{
    type: "string",
    name: "question",
    description: "The question for the poll.",
    required: true
  }],
  execute: async (ctx, args) => {
    const question = ctx.isInteraction
      ? ctx.getString("question")
      : args.join(" ");

    if (!question || question.length > 1000) {
      return ctx.reply("Provide a question under 1000 characters.");
    }

    const sent = await ctx.channel.send({
      embeds: [
        makeEmbed("Poll", question)
      ],
      allowedMentions: { parse: [] }
    });

    await sent.react("👍").catch(() => {});
    await sent.react("👎").catch(() => {});

    if (ctx.isInteraction) {
      return ctx.reply("Poll created.");
    }

    return;
  }
});

registerCommand({
  name: "remind",
  description: "Set a reminder in this channel.",
  category: "Utility",
  options: [
    {
      type: "string",
      name: "duration",
      description: "Duration, such as 10s, 5m, or 1h.",
      required: true
    },
    {
      type: "string",
      name: "message",
      description: "What you want to be reminded about.",
      required: true
    }
  ],
  execute: async (ctx, args) => {
    const durationText = ctx.isInteraction
      ? ctx.getString("duration")
      : args[0];

    const reminderText = ctx.isInteraction
      ? ctx.getString("message")
      : args.slice(1).join(" ");

    const match = String(durationText || "")
      .match(/^(\d+)(s|m|h)$/i);

    if (!match || !reminderText) {
      return ctx.reply(
        "Usage: `,remind 10m take a break` (maximum 24 hours)."
      );
    }

    const multiplier = {
      s: 1000,
      m: 60000,
      h: 3600000
    }[match[2].toLowerCase()];

    const duration = Number(match[1]) * multiplier;

    if (duration < 1000 || duration > 86400000) {
      return ctx.reply("Choose a duration between 1 second and 24 hours.");
    }

    await ctx.reply("Reminder saved for this bot session.");

    setTimeout(async () => {
      try {
        await ctx.channel.send({
          content: `<@${ctx.user.id}> Reminder: ${reminderText}`,
          allowedMentions: {
            users: [ctx.user.id]
          }
        });
      } catch (error) {
        console.error("[Pyrr] Reminder error:", error.message);
      }
    }, duration);
  }
});

registerCommand({
  name: "say",
  description: "Send a message as the bot.",
  category: "Utility",
  options: [{
    type: "string",
    name: "message",
    description: "The text to send.",
    required: true
  }],
  execute: async (ctx, args) => {
    if (!ctx.guild) {
      return ctx.reply("Use this command inside a server.");
    }

    if (!hasPermission(
      ctx.member,
      PermissionsBitField.Flags.ManageMessages
    ) && !isOwner(ctx.user.id)) {
      return ctx.reply("You need Manage Messages permission.");
    }

    const text = ctx.isInteraction
      ? ctx.getString("message")
      : args.join(" ");

    if (!text) {
      return ctx.reply("Provide a message.");
    }

    await ctx.channel.send({
      content: text.slice(0, 1900),
      allowedMentions: { parse: [] }
    });

    return ctx.reply("Message sent.");
  }
});

registerCommand({
  name: "userinfoid",
  description: "Look up a Discord user by ID.",
  category: "Information",
  options: [{
    type: "string",
    name: "id",
    description: "The Discord user ID.",
    required: true
  }],
  execute: async (ctx, args) => {
    const id = ctx.isInteraction
      ? ctx.getString("id")
      : args[0];

    if (!/^\d{17,20}$/.test(String(id || ""))) {
      return ctx.reply("Provide a valid Discord user ID.");
    }

    const user = await client.users.fetch(id).catch(() => null);

    if (!user) {
      return ctx.reply("User not found.");
    }

    return ctx.embed(
      "User Lookup",
      [
        `**Username:** ${user.tag || user.username}`,
        `**ID:** ${user.id}`,
        `**Created:** <t:${Math.floor(user.createdTimestamp / 1000)}:F>`
      ].join("\n")
    );
  }
});

// ==========================================
// END OF PART 2
// Append Part 3 below this line.
// Do not deploy yet.
// ==========================================
                                              
/* ==========================================
   PART 3 — WELCOME / LEAVE / MODERATION
========================================== */

function getTargetUser(ctx, args, optionName = "user") {
  if (ctx.isInteraction) {
    return ctx.getUser(optionName);
  }

  return ctx.source.mentions.users.first() || null;
}

function getReason(ctx, args, start = 1) {
  if (ctx.isInteraction) {
    return ctx.getString("reason") || "No reason provided";
  }

  return args.slice(start).join(" ") || "No reason provided";
}

async function getTargetMember(ctx, args, optionName = "user") {
  if (!ctx.guild) return null;

  let user = getTargetUser(ctx, args, optionName);

  if (!user && !ctx.isInteraction && args[0]) {
    user = await client.users.fetch(args[0]).catch(() => null);
  }

  if (!user) return null;

  return ctx.guild.members.fetch(user.id).catch(() => null);
}

function hasBotPermission(guild, permission) {
  const me = guild.members.me;
  return Boolean(me?.permissions.has(permission));
}

async function requireGuild(ctx) {
  if (!ctx.guild) {
    await ctx.reply("Use this command inside a server.");
    return false;
  }

  return true;
}

async function requireManageGuild(ctx) {
  if (!await requireGuild(ctx)) return false;

  if (
    !isOwner(ctx.user.id) &&
    !hasPermission(ctx.member, PermissionsBitField.Flags.ManageGuild)
  ) {
    await ctx.reply("You need Manage Server permission.");
    return false;
  }

  return true;
}

async function requireModerator(ctx, permission) {
  if (!await requireGuild(ctx)) return false;

  if (
    !isOwner(ctx.user.id) &&
    !hasPermission(ctx.member, permission)
  ) {
    await ctx.reply("You do not have permission to use this command.");
    return false;
  }

  return true;
}

function parsePrefixChannel(ctx, args) {
  if (ctx.isInteraction) {
    return ctx.getChannel("channel");
  }

  const mention = ctx.source.mentions.channels.first();
  if (mention) return mention;

  const id = args[0]?.replace(/[<#>]/g, "");
  return id ? ctx.guild?.channels.cache.get(id) || null : null;
}

// ==========================================
// WELCOME / LEAVE CONFIGURATION
// ==========================================

registerCommand({
  name: "welcome",
  description: "Set the welcome channel.",
  category: "Welcome",
  options: [{
    type: "channel",
    name: "channel",
    description: "Channel for welcome messages.",
    required: true
  }],
  execute: async (ctx, args) => {
    if (!await requireManageGuild(ctx)) return;

    const channel = parsePrefixChannel(ctx, args);

    if (!channel || !channel.isTextBased()) {
      return ctx.reply("Mention a valid text channel.");
    }

    const config = getConfig(ctx.guild.id);
    config.welcome.channelId = channel.id;
    config.welcome.enabled = true;
    saveDatabase();

    return ctx.embed(
      "Welcome Enabled",
      `Welcome messages will be sent to <#${channel.id}>.`
    );
  }
});

registerCommand({
  name: "welcomeoff",
  description: "Disable welcome messages.",
  category: "Welcome",
  execute: async ctx => {
    if (!await requireManageGuild(ctx)) return;

    getConfig(ctx.guild.id).welcome.enabled = false;
    saveDatabase();

    return ctx.embed("Welcome Disabled", "Welcome messages are now off.");
  }
});

registerCommand({
  name: "welcomemessage",
  description: "Change the welcome message.",
  category: "Welcome",
  options: [{
    type: "string",
    name: "message",
    description: "Use {user}, {username}, {server}, {count}, {id}.",
    required: true
  }],
  execute: async (ctx, args) => {
    if (!await requireManageGuild(ctx)) return;

    const message = ctx.isInteraction
      ? ctx.getString("message")
      : args.join(" ");

    if (!message || message.length > 1800) {
      return ctx.reply("Message must be between 1 and 1800 characters.");
    }

    getConfig(ctx.guild.id).welcome.message = message;
    saveDatabase();

    return ctx.embed(
      "Welcome Message Updated",
      `Preview:\n${formatTemplate(message, {
        user: `<@${ctx.user.id}>`,
        username: ctx.user.username,
        server: ctx.guild.name,
        count: ctx.guild.memberCount,
        id: ctx.user.id
      })}`
    );
  }
});

registerCommand({
  name: "leaveset",
  description: "Set the leave-message channel.",
  category: "Welcome",
  options: [{
    type: "channel",
    name: "channel",
    description: "Channel for leave messages.",
    required: true
  }],
  execute: async (ctx, args) => {
    if (!await requireManageGuild(ctx)) return;

    const channel = parsePrefixChannel(ctx, args);

    if (!channel || !channel.isTextBased()) {
      return ctx.reply("Mention a valid text channel.");
    }

    const config = getConfig(ctx.guild.id);
    config.leave.channelId = channel.id;
    config.leave.enabled = true;
    saveDatabase();

    return ctx.embed(
      "Leave Messages Enabled",
      `Leave messages will be sent to <#${channel.id}>.`
    );
  }
});

registerCommand({
  name: "leaveoff",
  description: "Disable leave messages.",
  category: "Welcome",
  execute: async ctx => {
    if (!await requireManageGuild(ctx)) return;

    getConfig(ctx.guild.id).leave.enabled = false;
    saveDatabase();

    return ctx.embed("Leave Messages Disabled", "Leave messages are now off.");
  }
});

registerCommand({
  name: "leavemessage",
  description: "Change the leave message.",
  category: "Welcome",
  options: [{
    type: "string",
    name: "message",
    description: "Use {user}, {username}, {server}, {count}, {id}.",
    required: true
  }],
  execute: async (ctx, args) => {
    if (!await requireManageGuild(ctx)) return;

    const message = ctx.isInteraction
      ? ctx.getString("message")
      : args.join(" ");

    if (!message || message.length > 1800) {
      return ctx.reply("Message must be between 1 and 1800 characters.");
    }

    getConfig(ctx.guild.id).leave.message = message;
    saveDatabase();

    return ctx.embed("Leave Message Updated", message);
  }
});

// ==========================================
// MODERATION: BAN
// ==========================================

registerCommand({
  name: "ban",
  description: "Ban a member from this server.",
  category: "Moderation",
  options: [
    {
      type: "user",
      name: "user",
      description: "Member to ban.",
      required: true
    },
    {
      type: "string",
      name: "reason",
      description: "Reason for the ban."
    }
  ],
  execute: async (ctx, args) => {
    if (!await requireModerator(
      ctx,
      PermissionsBitField.Flags.BanMembers
    )) return;

    const user = getTargetUser(ctx, args);

    if (!user) {
      return ctx.reply("Mention the user to ban.");
    }

    if (user.id === ctx.user.id) {
      return ctx.reply("You cannot ban yourself.");
    }

    const member = await ctx.guild.members.fetch(user.id).catch(() => null);

    if (member && !isOwner(ctx.user.id)) {
      if (member.roles.highest.position >= ctx.member.roles.highest.position) {
        return ctx.reply("You cannot ban a member with an equal or higher role.");
      }
    }

    if (!hasBotPermission(ctx.guild, PermissionsBitField.Flags.BanMembers)) {
      return ctx.reply("I need the Ban Members permission.");
    }

    const reason = getReason(ctx, args);

    await ctx.guild.members.ban(user.id, {
      reason: `${ctx.user.tag}: ${reason}`
    });

    await sendLog(
      ctx.guild,
      "Member Banned",
      `**User:** ${user.tag || user.id}\n**Moderator:** ${ctx.user.tag}\n**Reason:** ${reason}`,
      0xC0392B
    );

    return ctx.embed(
      "Member Banned",
      `**User:** ${user.tag || user.id}\n**Reason:** ${reason}`
    );
  }
});

registerCommand({
  name: "unban",
  description: "Unban a user by ID.",
  category: "Moderation",
  options: [{
    type: "string",
    name: "id",
    description: "User ID to unban.",
    required: true
  }],
  execute: async (ctx, args) => {
    if (!await requireModerator(
      ctx,
      PermissionsBitField.Flags.BanMembers
    )) return;

    const id = ctx.isInteraction ? ctx.getString("id") : args[0];

    if (!/^\d{17,20}$/.test(String(id || ""))) {
      return ctx.reply("Provide a valid Discord user ID.");
    }

    if (!hasBotPermission(ctx.guild, PermissionsBitField.Flags.BanMembers)) {
      return ctx.reply("I need the Ban Members permission.");
    }

    await ctx.guild.members.unban(id, `Unbanned by ${ctx.user.tag}`);

    return ctx.embed("Unban Complete", `User \`${id}\` was unbanned.`);
  }
});

// ==========================================
// MODERATION: KICK
// ==========================================

registerCommand({
  name: "kick",
  description: "Kick a member from this server.",
  category: "Moderation",
  options: [
    {
      type: "user",
      name: "user",
      description: "Member to kick.",
      required: true
    },
    {
      type: "string",
      name: "reason",
      description: "Reason for the kick."
    }
  ],
  execute: async (ctx, args) => {
    if (!await requireModerator(
      ctx,
      PermissionsBitField.Flags.KickMembers
    )) return;

    const member = await getTargetMember(ctx, args);

    if (!member) {
      return ctx.reply("Member not found in this server.");
    }

    if (member.id === ctx.user.id) {
      return ctx.reply("You cannot kick yourself.");
    }

    if (
      !isOwner(ctx.user.id) &&
      member.roles.highest.position >= ctx.member.roles.highest.position
    ) {
      return ctx.reply("You cannot kick a member with an equal or higher role.");
    }

    if (!hasBotPermission(ctx.guild, PermissionsBitField.Flags.KickMembers)) {
      return ctx.reply("I need the Kick Members permission.");
    }

    const reason = getReason(ctx, args);

    await member.kick(`${ctx.user.tag}: ${reason}`);

    await sendLog(
      ctx.guild,
      "Member Kicked",
      `**User:** ${member.user.tag}\n**Moderator:** ${ctx.user.tag}\n**Reason:** ${reason}`,
      0xC0392B
    );

    return ctx.embed(
      "Member Kicked",
      `**User:** ${member.user.tag}\n**Reason:** ${reason}`
    );
  }
});

// ==========================================
// MODERATION: TIMEOUT
// ==========================================

registerCommand({
  name: "timeout",
  description: "Timeout a member for a duration.",
  category: "Moderation",
  options: [
    {
      type: "user",
      name: "user",
      description: "Member to timeout.",
      required: true
    },
    {
      type: "string",
      name: "duration",
      description: "Examples: 10m, 2h, 1d.",
      required: true
    },
    {
      type: "string",
      name: "reason",
      description: "Reason for the timeout."
    }
  ],
  execute: async (ctx, args) => {
    if (!await requireModerator(
      ctx,
      PermissionsBitField.Flags.ModerateMembers
    )) return;

    const member = await getTargetMember(ctx, args);

    const durationText = ctx.isInteraction
      ? ctx.getString("duration")
      : args[1];

    const match = String(durationText || "")
      .match(/^(\d+)(s|m|h|d)$/i);

    if (!member || !match) {
      return ctx.reply("Usage: `,timeout @user 10m reason`.");
    }

    const multiplier = {
      s: 1000,
      m: 60000,
      h: 3600000,
      d: 86400000
    }[match[2].toLowerCase()];

    const duration = Number(match[1]) * multiplier;

    if (duration < 1000 || duration > 28 * 86400000) {
      return ctx.reply("Duration must be between 1 second and 28 days.");
    }

    if (
      member.id === ctx.user.id ||
      member.id === ctx.guild.ownerId
    ) {
      return ctx.reply("You cannot timeout yourself or the server owner.");
    }

    if (!hasBotPermission(ctx.guild, PermissionsBitField.Flags.ModerateMembers)) {
      return ctx.reply("I need the Moderate Members permission.");
    }

    if (
      !isOwner(ctx.user.id) &&
      member.roles.highest.position >= ctx.member.roles.highest.position
    ) {
      return ctx.reply("You cannot timeout a member with an equal or higher role.");
    }

    const reason = ctx.isInteraction
      ? ctx.getString("reason") || "No reason provided"
      : args.slice(2).join(" ") || "No reason provided";

    await member.timeout(duration, `${ctx.user.tag}: ${reason}`);

    await sendLog(
      ctx.guild,
      "Member Timed Out",
      `**User:** ${member.user.tag}\n**Duration:** ${durationText}\n**Reason:** ${reason}`,
      0xC58B32
    );

    return ctx.embed(
      "Timeout Applied",
      `**User:** ${member.user.tag}\n**Duration:** ${durationText}\n**Reason:** ${reason}`
    );
  }
});

registerCommand({
  name: "untimeout",
  description: "Remove a member's timeout.",
  category: "Moderation",
  options: [{
    type: "user",
    name: "user",
    description: "Member to untimeout.",
    required: true
  }],
  execute: async (ctx, args) => {
    if (!await requireModerator(
      ctx,
      PermissionsBitField.Flags.ModerateMembers
    )) return;

    const member = await getTargetMember(ctx, args);

    if (!member) {
      return ctx.reply("Member not found.");
    }

    if (!hasBotPermission(ctx.guild, PermissionsBitField.Flags.ModerateMembers)) {
      return ctx.reply("I need the Moderate Members permission.");
    }

    await member.timeout(null, `Timeout removed by ${ctx.user.tag}`);

    return ctx.embed(
      "Timeout Removed",
      `${member.user.tag} can speak again.`
    );
  },
  aliases: ["untime"]
});

// ==========================================
// MODERATION: PURGE
// ==========================================

registerCommand({
  name: "purge",
  description: "Delete recent messages in this channel.",
  category: "Moderation",
  options: [{
    type: "integer",
    name: "amount",
    description: "Number of messages (1-100).",
    required: true
  }],
  execute: async (ctx, args) => {
    if (!await requireModerator(
      ctx,
      PermissionsBitField.Flags.ManageMessages
    )) return;

    const amount = ctx.isInteraction
      ? ctx.getInteger("amount")
      : Number(args[0]);

    if (!Number.isInteger(amount) || amount < 1 || amount > 100) {
      return ctx.reply("Choose a number from 1 to 100.");
    }

    if (!ctx.channel?.bulkDelete) {
      return ctx.reply("This channel does not support bulk deletion.");
    }

    if (!hasBotPermission(ctx.guild, PermissionsBitField.Flags.ManageMessages)) {
      return ctx.reply("I need the Manage Messages permission.");
    }

    const deleted = await ctx.channel.bulkDelete(amount, true);

    return ctx.reply(`Deleted ${deleted.size} recent messages.`);
  },
  aliases: ["clear"]
});

// ==========================================
// MODERATION: WARNINGS
// ==========================================

registerCommand({
  name: "warn",
  description: "Add a warning to a member.",
  category: "Moderation",
  options: [
    {
      type: "user",
      name: "user",
      description: "Member to warn.",
      required: true
    },
    {
      type: "string",
      name: "reason",
      description: "Reason for the warning.",
      required: true
    }
  ],
  execute: async (ctx, args) => {
    if (!await requireModerator(
      ctx,
      PermissionsBitField.Flags.ModerateMembers
    )) return;

    const user = getTargetUser(ctx, args);
    const reason = ctx.isInteraction
      ? ctx.getString("reason")
      : args.slice(1).join(" ");

    if (!user || !reason) {
      return ctx.reply("Mention a user and provide a reason.");
    }

    if (user.id === ctx.user.id) {
      return ctx.reply("You cannot warn yourself.");
    }

    const config = getConfig(ctx.guild.id);

    if (!config.warnings[user.id]) {
      config.warnings[user.id] = [];
    }

    config.warnings[user.id].push({
      moderatorId: ctx.user.id,
      reason: reason.slice(0, 500),
      timestamp: Date.now()
    });

    saveDatabase();

    await sendLog(
      ctx.guild,
      "Member Warned",
      `**User:** ${user.tag || user.id}\n**Moderator:** ${ctx.user.tag}\n**Reason:** ${reason}`,
      0xC58B32
    );

    return ctx.embed(
      "Warning Added",
      `${user.tag || user.id} now has ${config.warnings[user.id].length} warning(s).`
    );
  }
});

registerCommand({
  name: "warnings",
  description: "View a member's warnings.",
  category: "Moderation",
  options: [{
    type: "user",
    name: "user",
    description: "Member to inspect.",
    required: true
  }],
  execute: async (ctx, args) => {
    if (!await requireModerator(
      ctx,
      PermissionsBitField.Flags.ModerateMembers
    )) return;

    const user = getTargetUser(ctx, args);

    if (!user) {
      return ctx.reply("Mention a member.");
    }

    const list = getConfig(ctx.guild.id).warnings[user.id] || [];

    if (!list.length) {
      return ctx.embed(
        "Warnings",
        `${user.tag || user.id} has no recorded warnings.`
      );
    }

    const description = list.slice(-15).map((warning, index) =>
      `**${index + 1}.** ${warning.reason}\n` +
      `Moderator: <@${warning.moderatorId}> • ` +
      `<t:${Math.floor(warning.timestamp / 1000)}:R>`
    ).join("\n\n");

    return ctx.embed(
      `Warnings: ${user.tag || user.id}`,
      description
    );
  }
});

registerCommand({
  name: "clearwarns",
  description: "Clear a member's warning records.",
  category: "Moderation",
  options: [{
    type: "user",
    name: "user",
    description: "Member whose warnings to clear.",
    required: true
  }],
  execute: async (ctx, args) => {
    if (!await requireModerator(
      ctx,
      PermissionsBitField.Flags.ModerateMembers
    )) return;

    const user = getTargetUser(ctx, args);

    if (!user) {
      return ctx.reply("Mention a member.");
    }

    const config = getConfig(ctx.guild.id);
    delete config.warnings[user.id];
    saveDatabase();

    return ctx.embed(
      "Warnings Cleared",
      `Warning records cleared for ${user.tag || user.id}.`
    );
  },
  aliases: ["clearwarnings"]
});

// ==========================================
// MODERATION: SLOWMODE
// ==========================================

registerCommand({
  name: "slowmode",
  description: "Set channel slowmode in seconds.",
  category: "Moderation",
  options: [{
    type: "integer",
    name: "seconds",
    description: "Slowmode seconds (0-21600).",
    required: true
  }],
  execute: async (ctx, args) => {
    if (!await requireModerator(
      ctx,
      PermissionsBitField.Flags.ManageChannels
    )) return;

    const seconds = ctx.isInteraction
      ? ctx.getInteger("seconds")
      : Number(args[0]);

    if (!Number.isInteger(seconds) || seconds < 0 || seconds > 21600) {
      return ctx.reply("Choose a number from 0 to 21600 seconds.");
    }

    if (!ctx.channel?.setRateLimitPerUser) {
      return ctx.reply("This channel does not support slowmode.");
    }

    await ctx.channel.setRateLimitPerUser(
      seconds,
      `Changed by ${ctx.user.tag}`
    );

    return ctx.embed(
      "Slowmode Updated",
      `Slowmode set to **${seconds} seconds**.`
    );
  }
});

// ==========================================
// MODERATION: LOCK / UNLOCK
// ==========================================

registerCommand({
  name: "lock",
  description: "Lock the current text channel.",
  category: "Moderation",
  execute: async ctx => {
    if (!await requireModerator(
      ctx,
      PermissionsBitField.Flags.ManageChannels
    )) return;

    if (!ctx.channel?.permissionOverwrites) {
      return ctx.reply("This channel cannot be locked by this command.");
    }

    if (!hasBotPermission(ctx.guild, PermissionsBitField.Flags.ManageChannels)) {
      return ctx.reply("I need the Manage Channels permission.");
    }

    await ctx.channel.permissionOverwrites.edit(
      ctx.guild.roles.everyone,
      { SendMessages: false },
      { reason: `Locked by ${ctx.user.tag}` }
    );

    return ctx.embed("Channel Locked", `${ctx.channel} has been locked.`);
  }
});

registerCommand({
  
  name: "unlock",
  description: "Unlock the current text channel.",
  category: "Moderation",
  slash: true,
  execute: async (ctx) => {
    if (!(await requireModerator(ctx, PermissionsBitField.Flags.ManageChannels))) return;

    const channel = ctx.channel;
    if (!channel || !channel.isTextBased()) {
      await ctx.reply({ content: "Use this command in a text channel." });
      return;
    }

    const everyoneRole = ctx.guild.roles.everyone;
    const botMember = ctx.guild.members.me;

    if (!botMember || !botMember.permissions.has(
      PermissionsBitField.Flags.ManageChannels
    )) {
      await ctx.reply({ content: "I need the Manage Channels permission." });
      return;
    }

    await channel.permissionOverwrites.edit(everyoneRole, {
      SendMessages: null
    }).catch(async () => {
      await ctx.reply({ content: "I couldn't unlock this channel. Check my permissions." });
    });

    await ctx.reply({
      content: `Unlocked ${channel}.`
    });
  }
});

// ==========================================
// END OF PART 3
// Append Part 4 below this line.
// Do not deploy yet.
// ==========================================

const { AuditLogEvent } = require("discord.js");

const antiNukeEvents = new Map();
const antiRaidJoins = new Map();
const antiSpamMessages = new Map();

function prepareSecurityConfig(cfg) {
    if (!cfg.antinuke) {
        cfg.antinuke = {
            enabled: false,
            limit: 3,
            windowSeconds: 10,
            protectedUsers: [],
            protectedRoles: []
        };
    }

    if (!Array.isArray(cfg.antinuke.protectedUsers)) {
        cfg.antinuke.protectedUsers = [];
    }

    if (!Array.isArray(cfg.antinuke.protectedRoles)) {
        cfg.antinuke.protectedRoles = [];
    }

    if (typeof cfg.antinuke.limit !== "number") {
        cfg.antinuke.limit = 3;
    }

    if (typeof cfg.antinuke.windowSeconds !== "number") {
        cfg.antinuke.windowSeconds = 10;
    }

    if (!cfg.antiraid) {
        cfg.antiraid = {
            enabled: false,
            joinLimit: 8,
            windowSeconds: 10,
            minimumAccountAgeHours: 24
        };
    }

    if (!cfg.automod) {
        cfg.automod = {
            enabled: false,
            antiSpam: true,
            antiInvite: false,
            antiMassMention: true
        };
    }

    return cfg;
}

function saveSecurityData() {
    try {
        if (typeof saveDatabase === "function") {
            saveDatabase();
        } else if (typeof saveData === "function") {
            saveData();
        }
    } catch (error) {
        console.error("[SECURITY DATABASE]", error);
    }
}

function isGuildOwner(ctx) {
    return Boolean(
        ctx.guild &&
        ctx.user &&
        ctx.guild.ownerId === ctx.user.id
    );
}

async function requireGuildOwner(ctx) {
    if (!ctx.guild) {
        await ctx.reply({
            content: "This command can only be used inside a server."
        });
        return false;
    }

    if (!isGuildOwner(ctx)) {
        await ctx.reply({
            content: "Only the server owner can change these security settings."
        });
        return false;
    }

    return true;
}

async function sendSecurityLog(guild, message) {
    try {
        const cfg = prepareSecurityConfig(getConfig(guild.id));

        if (!cfg.logs || !cfg.logs.channelId) return;

        const channel = await guild.channels
            .fetch(cfg.logs.channelId)
            .catch(() => null);

        if (!channel || !channel.isTextBased()) return;

        await channel.send({
            content: message,
            allowedMentions: { parse: [] }
        });
    } catch (error) {
        console.error("[SECURITY LOG]", error);
    }
}

function isWhitelistedMember(cfg, member) {
    if (!member) return false;

    if (cfg.antinuke.protectedUsers.includes(member.id)) {
        return true;
    }

    if (member.id === member.guild.ownerId) {
        return true;
    }

    return member.roles.cache.some(role =>
        cfg.antinuke.protectedRoles.includes(role.id)
    );
}

registerCommand({
    name: "antinuke",
    description: "Enable or disable AntiNuke protection.",
    category: "Security",
    options: [
        {
            name: "enabled",
            type: "boolean",
            description: "Turn AntiNuke on or off",
            required: true
        }
    ],
    execute: async (ctx, args) => {
        if (!(await requireGuildOwner(ctx))) return;

        const cfg = prepareSecurityConfig(getConfig(ctx.guild.id));
        const value = ctx.isInteraction
            ? ctx.getBoolean("enabled")
            : String(args[0] || "").toLowerCase();

        let enabled;

        if (typeof value === "boolean") {
            enabled = value;
        } else if (["on", "enable", "enabled", "true"].includes(value)) {
            enabled = true;
        } else if (["off", "disable", "disabled", "false"].includes(value)) {
            enabled = false;
        } else {
            await ctx.reply({
                content: "Usage: `,antinuke on` or `,antinuke off`"
            });
            return;
        }

        cfg.antinuke.enabled = enabled;
        saveSecurityData();

        await ctx.reply({
            content: `AntiNuke is now **${enabled ? "ENABLED" : "DISABLED"}**.`
        });
    }
});

registerCommand({
    name: "antinukelimit",
    description: "Set the AntiNuke detection threshold.",
    category: "Security",
    options: [
        {
            name: "limit",
            type: "integer",
            description: "Number of suspicious actions",
            required: true
        }
    ],
    execute: async (ctx, args) => {
        if (!(await requireGuildOwner(ctx))) return;

        const cfg = prepareSecurityConfig(getConfig(ctx.guild.id));
        const limit = ctx.isInteraction
            ? ctx.getInteger("limit")
            : Number(args[0]);

        if (!Number.isInteger(limit) || limit < 2 || limit > 10) {
            await ctx.reply({
                content: "Choose a limit between 2 and 10."
            });
            return;
        }

        cfg.antinuke.limit = limit;
        saveSecurityData();

        await ctx.reply({
            content: `AntiNuke threshold set to ${limit} actions.`
        });
    }
});

// END PART 4A

registerCommand({
    name: "whitelist",
    description: "Add or remove a user or role from the AntiNuke whitelist.",
    category: "Security",
    options: [
        {
            name: "action",
            type: "string",
            description: "Choose add or disabled",
            required: true
        },
        {
            name: "targettype",
            type: "string",
            description: "Choose user or role",
            required: true
        },
        {
            name: "user",
            type: "user",
            description: "User to whitelist or remove",
            required: false
        },
        {
            name: "role",
            type: "role",
            description: "Role to whitelist or remove",
            required: false
        }
    ],
    execute: async (ctx, args) => {
        if (!(await requireGuildOwner(ctx))) return;

        const cfg = prepareSecurityConfig(getConfig(ctx.guild.id));

        let action;
        let targetType;
        let targetId;

        if (ctx.isInteraction) {
            action = String(
                ctx.getString("action") || ""
            ).toLowerCase();

            targetType = String(
                ctx.getString("targettype") || ""
            ).toLowerCase();

            if (targetType === "user") {
                const user = ctx.getUser("user");
                targetId = user ? user.id : null;
            } else if (targetType === "role") {
                const role = ctx.getRole("role");
                targetId = role ? role.id : null;
            }
        } else {
            const first = String(args[0] || "").toLowerCase();

            const removing = [
                "disabled",
                "disable",
                "remove",
                "off"
            ].includes(first);

            action = removing ? "disabled" : "add";
            targetType = String(
                args[removing ? 1 : 0] || ""
            ).toLowerCase();

            const rawTarget = args[removing ? 2 : 1];

            if (targetType === "user") {
                const mentioned = ctx.source.mentions?.users?.first();

                targetId = mentioned?.id ||
                    String(rawTarget || "").replace(/[<@!>]/g, "");
            } else if (targetType === "role") {
                const mentioned = ctx.source.mentions?.roles?.first();

                targetId = mentioned?.id ||
                    String(rawTarget || "").replace(/[<@&>]/g, "");
            }
        }

        const adding = [
            "add",
            "enable",
            "enabled",
            "on"
        ].includes(action);

        const removing = [
            "disabled",
            "disable",
            "remove",
            "off"
        ].includes(action);

        if (!adding && !removing) {
            await ctx.reply({
                content: "Action must be `add` or `disabled`."
            });
            return;
        }

        if (!["user", "role"].includes(targetType)) {
            await ctx.reply({
                content: "Target must be `user` or `role`."
            });
            return;
        }

        if (!targetId || !/^\d{17,20}$/.test(targetId)) {
            await ctx.reply({
                content: targetType === "user"
                    ? "Mention a valid user. Example: `,whitelist user @user`"
                    : "Mention a valid role. Example: `,whitelist role @role`"
            });
            return;
        }

        if (targetType === "user") {
            const user = await client.users
                .fetch(targetId)
                .catch(() => null);

            if (!user) {
                await ctx.reply({
                    content: "That user could not be found."
                });
                return;
            }

            const list = cfg.antinuke.protectedUsers;
            const exists = list.includes(targetId);

            if (adding && exists) {
                await ctx.reply({
                    content: "That user is already whitelisted."
                });
                return;
            }

            if (removing && !exists) {
                await ctx.reply({
                    content: "That user is not whitelisted."
                });
                return;
            }

            if (adding) {
                list.push(targetId);
            } else {
                cfg.antinuke.protectedUsers =
                    list.filter(id => id !== targetId);
            }

            saveSecurityData();

            await ctx.reply({
                content: adding
                    ? `Added **${user.tag || user.username}** to the AntiNuke whitelist.`
                    : `Removed **${user.tag || user.username}** from the AntiNuke whitelist.`
            });

            return;
        }

        const role = await ctx.guild.roles
            .fetch(targetId)
            .catch(() => null);

        if (!role) {
            await ctx.reply({
                content: "That role could not be found in this server."
            });
            return;
        }

        const roleList = cfg.antinuke.protectedRoles;
        const exists = roleList.includes(targetId);

        if (adding && exists) {
            await ctx.reply({
                content: "That role is already whitelisted."
            });
            return;
        }

        if (removing && !exists) {
            await ctx.reply({
                content: "That role is not whitelisted."
            });
            return;
        }

        if (adding) {
            roleList.push(targetId);
        } else {
            cfg.antinuke.protectedRoles =
                roleList.filter(id => id !== targetId);
        }

        saveSecurityData();

        await ctx.reply({
            content: adding
                ? `Added role **${role.name}** to the AntiNuke whitelist.`
                : `Removed role **${role.name}** from the AntiNuke whitelist.`
        });
    }
});

// END PART 4B

registerCommand({
    name: "antiraid",
    description: "Enable or disable AntiRaid monitoring.",
    category: "Security",
    options: [
        {
            name: "enabled",
            type: "boolean",
            description: "Turn AntiRaid on or off",
            required: true
        }
    ],
    execute: async (ctx, args) => {
        if (!(await requireGuildOwner(ctx))) return;

        const cfg = prepareSecurityConfig(getConfig(ctx.guild.id));
        const value = ctx.isInteraction
            ? ctx.getBoolean("enabled")
            : String(args[0] || "").toLowerCase();

        let enabled;

        if (typeof value === "boolean") {
            enabled = value;
        } else if (["on", "enable", "enabled", "true"].includes(value)) {
            enabled = true;
        } else if (["off", "disable", "disabled", "false"].includes(value)) {
            enabled = false;
        } else {
            await ctx.reply({
                content: "Usage: `,antiraid on` or `,antiraid off`"
            });
            return;
        }

        cfg.antiraid.enabled = enabled;
        saveSecurityData();

        await ctx.reply({
            content: `AntiRaid monitoring is now **${enabled ? "ENABLED" : "DISABLED"}**.`
        });
    }
});

registerCommand({
    name: "antiraidlimit",
    description: "Set the AntiRaid join threshold.",
    category: "Security",
    options: [
        {
            name: "limit",
            type: "integer",
            description: "Number of joins within the monitoring window",
            required: true
        }
    ],
    execute: async (ctx, args) => {
        if (!(await requireGuildOwner(ctx))) return;

        const cfg = prepareSecurityConfig(getConfig(ctx.guild.id));
        const limit = ctx.isInteraction
            ? ctx.getInteger("limit")
            : Number(args[0]);

        if (!Number.isInteger(limit) || limit < 3 || limit > 30) {
            await ctx.reply({
                content: "Choose a join limit between 3 and 30."
            });
            return;
        }

        cfg.antiraid.joinLimit = limit;
        saveSecurityData();

        await ctx.reply({
            content: `AntiRaid join threshold set to ${limit} members.`
        });
    }
});

registerCommand({
    name: "securitylogs",
    description: "Set the channel for security alerts.",
    category: "Security",
    options: [
        {
            name: "channel",
            type: "channel",
            description: "Channel for security alerts",
            required: true
        }
    ],
    execute: async (ctx, args) => {
        if (!(await requireGuildOwner(ctx))) return;

        let channel = ctx.isInteraction
            ? ctx.getChannel("channel")
            : ctx.source.mentions?.channels?.first();

        if (!channel && !ctx.isInteraction && args[0]) {
            const id = args[0].replace(/[<#>]/g, "");

            channel = await ctx.guild.channels
                .fetch(id)
                .catch(() => null);
        }

        if (!channel || !channel.isTextBased()) {
            await ctx.reply({
                content: "Mention a text channel. Example: `,securitylogs #security-logs`"
            });
            return;
        }

        const cfg = prepareSecurityConfig(getConfig(ctx.guild.id));
        cfg.logs.channelId = channel.id;
        saveSecurityData();

        await ctx.reply({
            content: `Security alerts will be sent to <#${channel.id}>.`
        });
    }
});

// END PART 4C

registerCommand({
    name: "automod",
    description: "Enable or disable AutoMod filtering.",
    category: "Security",
    options: [
        {
            name: "enabled",
            type: "boolean",
            description: "Turn AutoMod on or off",
            required: true
        }
    ],
    execute: async (ctx, args) => {
        if (!(await requireGuildOwner(ctx))) return;

        const cfg = prepareSecurityConfig(getConfig(ctx.guild.id));
        const value = ctx.isInteraction
            ? ctx.getBoolean("enabled")
            : String(args[0] || "").toLowerCase();

        let enabled;

        if (typeof value === "boolean") {
            enabled = value;
        } else if (["on", "enable", "enabled", "true"].includes(value)) {
            enabled = true;
        } else if (["off", "disable", "disabled", "false"].includes(value)) {
            enabled = false;
        } else {
            await ctx.reply({
                content: "Usage: `,automod on` or `,automod off`"
            });
            return;
        }

        cfg.automod.enabled = enabled;
        saveSecurityData();

        await ctx.reply({
            content: `AutoMod is now **${enabled ? "ENABLED" : "DISABLED"}**.`
        });
    }
});

// Configure individual AutoMod filters.
// Only the server owner can change these settings.

registerCommand({
    name: "automodfilter",
    description: "Configure an individual AutoMod filter.",
    category: "Security",
    options: [
        {
            name: "filter",
            type: "string",
            description: "spam, invite, or mentions",
            required: true
        },
        {
            name: "enabled",
            type: "boolean",
            description: "Enable or disable this filter",
            required: true
        }
    ],
    execute: async (ctx, args) => {
        if (!(await requireGuildOwner(ctx))) return;

        const cfg = prepareSecurityConfig(getConfig(ctx.guild.id));

        const filter = String(
            ctx.isInteraction
                ? ctx.getString("filter")
                : args[0] || ""
        ).toLowerCase();

        const enabled = ctx.isInteraction
            ? ctx.getBoolean("enabled")
            : ["on", "enable", "enabled", "true"].includes(
                String(args[1] || "").toLowerCase()
            );

        if (
            !["spam", "invite", "mentions"].includes(filter)
        ) {
            await ctx.reply({
                content: "Choose a filter: `spam`, `invite`, or `mentions`."
            });
            return;
        }

        if (
            !ctx.isInteraction &&
            !["on", "off", "enable", "disable", "enabled", "disabled", "true", "false"].includes(
                String(args[1] || "").toLowerCase()
            )
        ) {
            await ctx.reply({
                content: "Usage: `,automodfilter spam on`"
            });
            return;
        }

        if (filter === "spam") {
            cfg.automod.antiSpam = enabled;
        } else if (filter === "invite") {
            cfg.automod.antiInvite = enabled;
        } else if (filter === "mentions") {
            cfg.automod.antiMassMention = enabled;
        }

        saveSecurityData();

        await ctx.reply({
            content: `AutoMod filter **${filter}** is now **${enabled ? "ENABLED" : "DISABLED"}**.`
        });
    }
});

// END PART 4D

async function monitorAntiNuke(guild, targetId, actionName, auditType) {
    try {
        const cfg = prepareSecurityConfig(getConfig(guild.id));

        if (!cfg.antinuke.enabled) return;

        const logs = await guild.fetchAuditLogs({
            type: auditType,
            limit: 1
        }).catch(() => null);

        const entry = logs?.entries?.first();

        if (!entry || !entry.executor) return;
        if (Date.now() - entry.createdTimestamp > 15000) return;

        if (
            targetId &&
            entry.target?.id &&
            entry.target.id !== targetId
        ) return;

        const actorId = entry.executor.id;

        if (actorId === client.user.id) return;
        if (actorId === guild.ownerId) return;

        const actor = await guild.members
            .fetch(actorId)
            .catch(() => null);

        if (!actor || isWhitelistedMember(cfg, actor)) return;

        const key = `${guild.id}:${actorId}`;
        const now = Date.now();
        const windowMs = cfg.antinuke.windowSeconds * 1000;

        const events = (antiNukeEvents.get(key) || [])
            .filter(time => now - time < windowMs);

        events.push(now);
        antiNukeEvents.set(key, events);

        if (events.length >= cfg.antinuke.limit) {
            await sendSecurityLog(
                guild,
                `**AntiNuke Alert**\n` +
                `Actor: <@${actorId}>\n` +
                `Action: ${actionName}\n` +
                `Detected ${events.length} monitored actions within ` +
                `${cfg.antinuke.windowSeconds} seconds.\n` +
                `Please review the server audit log. No automatic mass-punishment was performed.`
            );

            antiNukeEvents.set(key, []);
        }
    } catch (error) {
        console.error("[ANTINUKE MONITOR]", error);
    }
}

client.on("channelDelete", channel => {
    monitorAntiNuke(
        channel.guild,
        channel.id,
        "Channel deletion",
        AuditLogEvent.ChannelDelete
    );
});

client.on("roleDelete", role => {
    monitorAntiNuke(
        role.guild,
        role.id,
        "Role deletion",
        AuditLogEvent.RoleDelete
    );
});

client.on("guildBanAdd", ban => {
    monitorAntiNuke(
        ban.guild,
        ban.user.id,
        "Member ban",
        AuditLogEvent.MemberBanAdd
    );
});

// ==========================================
// MEMBER JOIN: ANTIRAID + WELCOME
// ==========================================

client.on("guildMemberAdd", async member => {
    try {
        const cfg = prepareSecurityConfig(
            getConfig(member.guild.id)
        );

        if (cfg.antiraid.enabled) {
            const now = Date.now();
            const key = member.guild.id;
            const windowMs = cfg.antiraid.windowSeconds * 1000;

            const joins = (antiRaidJoins.get(key) || [])
                .filter(item => now - item.time < windowMs);

            joins.push({
                time: now,
                userId: member.id
            });

            antiRaidJoins.set(key, joins);

            const accountAgeHours =
                (now - member.user.createdTimestamp) / 3600000;

            const rapidJoin =
                joins.length >= cfg.antiraid.joinLimit;

            const newAccount =
                accountAgeHours < cfg.antiraid.minimumAccountAgeHours;

            if (rapidJoin || newAccount) {
                await sendSecurityLog(
                    member.guild,
                    `**AntiRaid Alert**\n` +
                    `New member: <@${member.id}>\n` +
                    `Account age: ${Math.max(0, Math.floor(accountAgeHours))} hours\n` +
                    `Recent joins: ${joins.length} within ` +
                    `${cfg.antiraid.windowSeconds} seconds.\n` +
                    `Please review recent joins. No automatic ban was performed.`
                );
            }
        }

        if (cfg.welcome?.enabled && cfg.welcome.channelId) {
            const channel = await member.guild.channels
                .fetch(cfg.welcome.channelId)
                .catch(() => null);

            if (channel && channel.isTextBased()) {
                const message = formatTemplate(
                    cfg.welcome.message ||
                        "Welcome {user} to {server}!",
                    {
                        user: `<@${member.id}>`,
                        username: member.user.username,
                        server: member.guild.name,
                        count: member.guild.memberCount
                    }
                );

                await channel.send({
                    content: message,
                    allowedMentions: {
                        users: [member.id],
                        roles: [],
                        parse: []
                    }
                });
            }
        }
    } catch (error) {
        console.error("[MEMBER JOIN]", error);
    }
});

// ==========================================
// MEMBER LEAVE
// ==========================================

client.on("guildMemberRemove", async member => {
    try {
        const cfg = prepareSecurityConfig(
            getConfig(member.guild.id)
        );

        if (!cfg.leave?.enabled || !cfg.leave.channelId) return;

        const channel = await member.guild.channels
            .fetch(cfg.leave.channelId)
            .catch(() => null);

        if (!channel || !channel.isTextBased()) return;

        const message = formatTemplate(
            cfg.leave.message ||
                "{username} has left {server}.",
            {
                user: `<@${member.id}>`,
                username: member.user.username,
                server: member.guild.name,
                count: member.guild.memberCount
            }
        );

        await channel.send({
            content: message,
            allowedMentions: { parse: [] }
        });
    } catch (error) {
        console.error("[MEMBER LEAVE]", error);
    }
});

// END PART 4E

client.on("messageCreate", async message => {
    try {
        if (!message.guild || message.author.bot) return;

        const cfg = prepareSecurityConfig(
            getConfig(message.guild.id)
        );

        if (!cfg.automod.enabled) return;

        // Exempt moderators who can manage messages.
        if (message.member?.permissions?.has(
            PermissionsBitField.Flags.ManageMessages
        )) {
            return;
        }

        const content = message.content || "";
        let reason = null;

        // Block Discord invite links when enabled.
        if (
            cfg.automod.antiInvite &&
            /(?:discord\.gg\/|discord(?:app)?\.com\/invite\/)/i.test(content)
        ) {
            reason = "Discord invite links are not allowed.";
        }

        // Detect mass mentions.
        if (
            !reason &&
            cfg.automod.antiMassMention &&
            (
                message.mentions.users.size >= 5 ||
                message.mentions.roles.size >= 5 ||
                message.mentions.everyone
            )
        ) {
            reason = "Excessive mentions are not allowed.";
        }

        // Detect repeated messages and rapid messaging.
        if (!reason && cfg.automod.antiSpam) {
            const key = `${message.guild.id}:${message.author.id}`;
            const now = Date.now();

            const recent = (antiSpamMessages.get(key) || [])
                .filter(item => now - item.time < 6000);

            recent.push({
                time: now,
                content: content.toLowerCase().trim()
            });

            antiSpamMessages.set(key, recent);

            const normalized = content.toLowerCase().trim();

            const repeated = recent.filter(item =>
                item.content === normalized && normalized.length > 0
            ).length;

            if (recent.length >= 6 || repeated >= 4) {
                reason = "Spam detected.";
                antiSpamMessages.set(key, []);
            }
        }

        if (!reason) return;

        // Delete the violating message when permitted.
        if (message.deletable) {
            await message.delete().catch(() => null);
        }

        // Notify the member without pinging everyone.
        await message.channel.send({
            content: `<@${message.author.id}>: ${reason}`,
            allowedMentions: {
                users: [message.author.id]
            }
        }).then(notice => {
            setTimeout(() => {
                notice.delete().catch(() => null);
            }, 5000);
        }).catch(() => null);

        await sendSecurityLog(
            message.guild,
            `**AutoMod Alert**\n` +
            `Member: <@${message.author.id}>\n` +
            `Channel: <#${message.channel.id}>\n` +
            `Reason: ${reason}`
        );
    } catch (error) {
        console.error("[AUTOMOD]", error);
    }
});

// ==========================================
// END OF PART 4
// Append Part 5 below this line.
// Do not deploy yet.
// ==========================================

registerCommand({
    name: "nick",
    description: "Change a server member's nickname.",
    category: "Moderation",
    options: [
        {
            name: "user",
            type: "user",
            description: "Member to rename",
            required: true
        },
        {
            name: "nickname",
            type: "string",
            description: "New nickname; use reset to clear it",
            required: true
        }
    ],
    execute: async (ctx, args) => {
        if (!(await requireModerator(
            ctx,
            PermissionsBitField.Flags.ManageNicknames
        ))) return;

        const member = await getTargetMember(ctx, args, "user");

        if (!member) {
            await ctx.reply({
                content: "Member not found. Mention a member or use their ID."
            });
            return;
        }

        const nickname = ctx.isInteraction
            ? ctx.getString("nickname")
            : args.slice(1).join(" ");

        if (!nickname) {
            await ctx.reply({
                content: "Provide a nickname or use `reset`."
            });
            return;
        }

        if (member.id === ctx.guild.ownerId) {
            await ctx.reply({
                content: "The server owner's nickname cannot be changed by this command."
            });
            return;
        }

        if (
            ctx.guild.members.me &&
            member.roles.highest.position >=
            ctx.guild.members.me.roles.highest.position
        ) {
            await ctx.reply({
                content: "My highest role must be above that member's highest role."
            });
            return;
        }

        const newNickname =
            nickname.toLowerCase() === "reset" ? null : nickname;

        try {
            await member.setNickname(
                newNickname,
                `Requested by ${ctx.user.tag || ctx.user.username}`
            );

            await ctx.reply({
                content: newNickname
                    ? `Changed ${member.user.username}'s nickname to **${newNickname}**.`
                    : `Reset ${member.user.username}'s nickname.`
            });
        } catch (error) {
            await ctx.reply({
                content: "I couldn't change that nickname. Check my permissions and role hierarchy."
            });
        }
    }
});

registerCommand({
    name: "roleadd",
    description: "Give a role to a server member.",
    category: "Moderation",
    options: [
        {
            name: "user",
            type: "user",
            description: "Member receiving the role",
            required: true
        },
        {
            name: "role",
            type: "role",
            description: "Role to give",
            required: true
        }
    ],
    execute: async (ctx, args) => {
        if (!(await requireModerator(
            ctx,
            PermissionsBitField.Flags.ManageRoles
        ))) return;

        const member = await getTargetMember(ctx, args, "user");

        const role = ctx.isInteraction
            ? ctx.getRole("role")
            : await ctx.guild.roles.fetch(
                String(args[1] || "").replace(/[<@&>]/g, "")
            ).catch(() => null);

        if (!member || !role) {
            await ctx.reply({
                content: "Member or role not found."
            });
            return;
        }

        const botMember = ctx.guild.members.me;

        if (
            role.id === ctx.guild.id ||
            role.managed ||
            !botMember ||
            role.position >= botMember.roles.highest.position
        ) {
            await ctx.reply({
                content: "I cannot assign that role because of its position or restrictions."
            });
            return;
        }

        if (
            role.position >= ctx.member.roles.highest.position &&
            ctx.user.id !== ctx.guild.ownerId
        ) {
            await ctx.reply({
                content: "You cannot assign a role equal to or above your highest role."
            });
            return;
        }

        try {
            await member.roles.add(
                role,
                `Requested by ${ctx.user.tag || ctx.user.username}`
            );

            await ctx.reply({
                content: `Added role **${role.name}** to **${member.user.username}**.`
            });
        } catch (error) {
            await ctx.reply({
                content: "Failed to assign the role. Check Manage Roles permission."
            });
        }
    }
});

registerCommand({
    name: "roleremove",
    description: "Remove a role from a server member.",
    category: "Moderation",
    options: [
        {
            name: "user",
            type: "user",
            description: "Member losing the role",
            required: true
        },
        {
            name: "role",
            type: "role",
            description: "Role to remove",
            required: true
        }
    ],
    execute: async (ctx, args) => {
        if (!(await requireModerator(
            ctx,
            PermissionsBitField.Flags.ManageRoles
        ))) return;

        const member = await getTargetMember(ctx, args, "user");

        const role = ctx.isInteraction
            ? ctx.getRole("role")
            : await ctx.guild.roles.fetch(
                String(args[1] || "").replace(/[<@&>]/g, "")
            ).catch(() => null);

        if (!member || !role) {
            await ctx.reply({
                content: "Member or role not found."
            });
            return;
        }

        const botMember = ctx.guild.members.me;

        if (
            role.id === ctx.guild.id ||
            role.managed ||
            !botMember ||
            role.position >= botMember.roles.highest.position
        ) {
            await ctx.reply({
                content: "I cannot remove that role because of its position or restrictions."
            });
            return;
        }

        if (
            role.position >= ctx.member.roles.highest.position &&
            ctx.user.id !== ctx.guild.ownerId
        ) {
            await ctx.reply({
                content: "You cannot remove a role equal to or above your highest role."
            });
            return;
        }

        if (!member.roles.cache.has(role.id)) {
            await ctx.reply({
                content: "That member does not have this role."
            });
            return;
        }

        try {
            await member.roles.remove(
                role,
                `Requested by ${ctx.user.tag || ctx.user.username}`
            );

            await ctx.reply({
                content: `Removed role **${role.name}** from **${member.user.username}**.`
            });
        } catch (error) {
            await ctx.reply({
                content: "Failed to remove the role. Check Manage Roles permission."
            });
        }
    }
});

// ==========================================
// END OF PART 5A
// Append Part 5B below this line.
// Do not deploy yet.
// ==========================================

registerCommand({
    name: "deafen",
    description: "Deafen a member in a voice channel.",
    category: "Moderation",
    options: [
        {
            name: "user",
            type: "user",
            description: "Member to deafen",
            required: true
        },
        {
            name: "reason",
            type: "string",
            description: "Reason for deafening",
            required: false
        }
    ],
    execute: async (ctx, args) => {
        if (!(await requireModerator(
            ctx,
            PermissionsBitField.Flags.DeafenMembers
        ))) return;

        const member = await getTargetMember(ctx, args, "user");

        if (!member) {
            await ctx.reply({ content: "Member not found." });
            return;
        }

        if (!member.voice.channel) {
            await ctx.reply({
                content: "That member is not in a voice channel."
            });
            return;
        }

        try {
            await member.voice.setDeaf(
                true,
                ctx.isInteraction
                    ? ctx.getString("reason") || "No reason provided"
                    : args.slice(1).join(" ") || "No reason provided"
            );

            await ctx.reply({
                content: `Deafened **${member.user.username}**.`
            });
        } catch (error) {
            await ctx.reply({
                content: "Could not deafen that member. Check permissions and role hierarchy."
            });
        }
    }
});

registerCommand({
    name: "undeafen",
    description: "Remove server deafening from a member.",
    category: "Moderation",
    options: [
        {
            name: "user",
            type: "user",
            description: "Member to undeafen",
            required: true
        }
    ],
    execute: async (ctx, args) => {
        if (!(await requireModerator(
            ctx,
            PermissionsBitField.Flags.DeafenMembers
        ))) return;

        const member = await getTargetMember(ctx, args, "user");

        if (!member) {
            await ctx.reply({ content: "Member not found." });
            return;
        }

        if (!member.voice.channel) {
            await ctx.reply({
                content: "That member is not in a voice channel."
            });
            return;
        }

        try {
            await member.voice.setDeaf(false);

            await ctx.reply({
                content: `Undeafened **${member.user.username}**.`
            });
        } catch (error) {
            await ctx.reply({
                content: "Could not undeafen that member. Check permissions and role hierarchy."
            });
        }
    }
});

registerCommand({
    name: "disconnect",
    description: "Disconnect a member from voice chat.",
    category: "Moderation",
    aliases: ["vckick"],
    options: [
        {
            name: "user",
            type: "user",
            description: "Member to disconnect",
            required: true
        },
        {
            name: "reason",
            type: "string",
            description: "Reason for disconnecting",
            required: false
        }
    ],
    execute: async (ctx, args) => {
        if (!(await requireModerator(
            ctx,
            PermissionsBitField.Flags.MoveMembers
        ))) return;

        const member = await getTargetMember(ctx, args, "user");

        if (!member) {
            await ctx.reply({ content: "Member not found." });
            return;
        }

        if (!member.voice.channel) {
            await ctx.reply({
                content: "That member is not in a voice channel."
            });
            return;
        }

        try {
            await member.voice.disconnect(
                ctx.isInteraction
                    ? ctx.getString("reason") || "No reason provided"
                    : args.slice(1).join(" ") || "No reason provided"
            );

            await ctx.reply({
                content: `Disconnected **${member.user.username}** from voice chat.`
            });
        } catch (error) {
            await ctx.reply({
                content: "Could not disconnect that member. Check permissions."
            });
        }
    }
});

registerCommand({
    name: "move",
    description: "Move a member to another voice channel.",
    category: "Moderation",
    options: [
        {
            name: "user",
            type: "user",
            description: "Member to move",
            required: true
        },
        {
            name: "channel",
            type: "channel",
            description: "Destination voice channel",
            required: true
        }
    ],
    execute: async (ctx, args) => {
        if (!(await requireModerator(
            ctx,
            PermissionsBitField.Flags.MoveMembers
        ))) return;

        const member = await getTargetMember(ctx, args, "user");

        const channel = ctx.isInteraction
            ? ctx.getChannel("channel")
            : await ctx.guild.channels.fetch(
                String(args[1] || "").replace(/[<#>]/g, "")
            ).catch(() => null);

        if (!member || !channel) {
            await ctx.reply({
                content: "Member or channel not found."
            });
            return;
        }

        if (!member.voice.channel) {
            await ctx.reply({
                content: "That member is not connected to voice chat."
            });
            return;
        }

        if (!channel.isVoiceBased()) {
            await ctx.reply({
                content: "The destination must be a voice channel or stage channel."
            });
            return;
        }

        try {
            await member.voice.setChannel(channel);

            await ctx.reply({
                content: `Moved **${member.user.username}** to **${channel.name}**.`
            });
        } catch (error) {
            await ctx.reply({
                content: "Could not move that member. Check Move Members permission."
            });
        }
    }
});

// ==========================================
// END OF PART 5B
// Append Part 5C below this line.
// Do not deploy yet.
// ==========================================

registerCommand({
    name: "unbanall",
    description: "Not available: bulk unbanning is disabled for safety.",
    category: "Moderation",
    slash: false,
    execute: async (ctx) => {
        await ctx.reply({
            content: "Bulk unbanning is disabled. Use `,unban USER_ID` to review and unban one user at a time."
        });
    }
});

registerCommand({
    name: "roleinfo",
    description: "View information about a server role.",
    category: "Utility",
    options: [
        {
            name: "role",
            type: "role",
            description: "Role to inspect",
            required: true
        }
    ],
    execute: async (ctx, args) => {
        if (!ctx.guild) {
            await ctx.reply({ content: "Use this command inside a server." });
            return;
        }

        let role;

        if (ctx.isInteraction) {
            role = ctx.getRole("role");
        } else {
            const mentioned = ctx.source.mentions?.roles?.first();
            const id = String(args[0] || "").replace(/[<@&>]/g, "");

            role = mentioned ||
                await ctx.guild.roles.fetch(id).catch(() => null);
        }

        if (!role) {
            await ctx.reply({
                content: "Mention a role or provide its ID."
            });
            return;
        }

        const embed = makeEmbed(
            "Role Information",
            `**Name:** ${role.name}\n` +
            `**ID:** ${role.id}\n` +
            `**Members:** ${role.members.size}\n` +
            `**Position:** ${role.position}\n` +
            `**Hoisted:** ${role.hoist ? "Yes" : "No"}\n` +
            `**Mentionable:** ${role.mentionable ? "Yes" : "No"}\n` +
            `**Managed:** ${role.managed ? "Yes" : "No"}\n` +
            `**Created:** <t:${Math.floor(role.createdTimestamp / 1000)}:F>`
        );

        await ctx.reply({ embeds: [embed] });
    }
});

registerCommand({
    name: "channelinfo",
    description: "View information about a channel.",
    category: "Utility",
    options: [
        {
            name: "channel",
            type: "channel",
            description: "Channel to inspect",
            required: false
        }
    ],
    execute: async (ctx, args) => {
        if (!ctx.guild) {
            await ctx.reply({ content: "Use this command inside a server." });
            return;
        }

        let channel;

        if (ctx.isInteraction) {
            channel = ctx.getChannel("channel") || ctx.channel;
        } else {
            const mentioned = ctx.source.mentions?.channels?.first();
            const id = String(args[0] || "").replace(/[<#>]/g, "");

            channel = mentioned ||
                (id
                    ? await ctx.guild.channels.fetch(id).catch(() => null)
                    : ctx.channel);
        }

        if (!channel) {
            await ctx.reply({ content: "Channel not found." });
            return;
        }

        const embed = makeEmbed(
            "Channel Information",
            `**Name:** ${channel.name || "Unknown"}\n` +
            `**ID:** ${channel.id}\n` +
            `**Type:** ${String(channel.type)}\n` +
            `**Created:** <t:${Math.floor(channel.createdTimestamp / 1000)}:F>`
        );

        await ctx.reply({ embeds: [embed] });
    }
});

registerCommand({
    name: "rolelist",
    description: "List server roles.",
    category: "Utility",
    options: [],
    execute: async (ctx) => {
        if (!ctx.guild) {
            await ctx.reply({ content: "Use this command inside a server." });
            return;
        }

        const roles = await ctx.guild.roles.fetch();

        const list = roles
            .filter(role => role.id !== ctx.guild.id)
            .sort((a, b) => b.position - a.position)
            .map(role => `**${role.name}** — ${role.id}`)
            .slice(0, 40);

        await ctx.reply({
            content: list.length
                ? `**Server Roles**\n${list.join("\n")}`.slice(0, 1900)
                : "No additional roles found."
        });
    }
});

registerCommand({
    name: "inrole",
    description: "List members with a particular role.",
    category: "Utility",
    options: [
        {
            name: "role",
            type: "role",
            description: "Role to check",
            required: true
        }
    ],
    execute: async (ctx, args) => {
        if (!ctx.guild) {
            await ctx.reply({ content: "Use this command inside a server." });
            return;
        }

        let role;

        if (ctx.isInteraction) {
            role = ctx.getRole("role");
        } else {
            role = ctx.source.mentions?.roles?.first();

            if (!role && args[0]) {
                role = await ctx.guild.roles.fetch(
                    args[0].replace(/[<@&>]/g, "")
                ).catch(() => null);
            }
        }

        if (!role) {
            await ctx.reply({ content: "Role not found." });
            return;
        }

        const members = role.members.map(member =>
            `${member.user.username} (${member.id})`
        );

        const output = members.length
            ? members.slice(0, 40).join("\n")
            : "No cached members found for this role.";

        await ctx.reply({
            content: `**Members with ${role.name}**\n${output}`.slice(0, 1900)
        });
    }
});

// ==========================================
// END OF PART 5C
// Append Part 5D below this line.
// Do not deploy yet.
// ==========================================
  
registerCommand({
    name: "announce",
    description: "Send an announcement to a channel.",
    category: "Utility",
    options: [
        {
            name: "channel",
            type: "channel",
            description: "Announcement channel",
            required: true
        },
        {
            name: "message",
            type: "string",
            description: "Announcement message",
            required: true
        }
    ],
    execute: async (ctx, args) => {
        if (!(await requireModerator(
            ctx,
            PermissionsBitField.Flags.ManageMessages
        ))) return;

        let channel;
        let message;

        if (ctx.isInteraction) {
            channel = ctx.getChannel("channel");
            message = ctx.getString("message");
        } else {
            channel = ctx.source.mentions?.channels?.first();

            if (!channel && args[0]) {
                channel = await ctx.guild.channels.fetch(
                    args[0].replace(/[<#>]/g, "")
                ).catch(() => null);
            }

            message = args.slice(1).join(" ");
        }

        if (!channel || !channel.isTextBased() || !message) {
            await ctx.reply({
                content: "Usage: `,announce #channel Your announcement`"
            });
            return;
        }

        if (message.length > 1900) {
            await ctx.reply({
                content: "Announcement must be 1900 characters or fewer."
            });
            return;
        }

        const botMember = ctx.guild.members.me;

        if (
            !botMember ||
            !channel.permissionsFor(botMember)?.has(
                PermissionsBitField.Flags.SendMessages
            )
        ) {
            await ctx.reply({
                content: "I cannot send messages in that channel."
            });
            return;
        }

        await channel.send({
            embeds: [
                makeEmbed("📢 Announcement", message)
            ],
            allowedMentions: { parse: [] }
        });

        await ctx.reply({
            content: `Announcement sent to ${channel}.`
        });
    }
});

registerCommand({
    name: "embed",
    description: "Create a simple embed message.",
    category: "Utility",
    options: [
        {
            name: "title",
            type: "string",
            description: "Embed title",
            required: true
        },
        {
            name: "message",
            type: "string",
            description: "Embed description",
            required: true
        }
    ],
    execute: async (ctx, args) => {
        if (!(await requireModerator(
            ctx,
            PermissionsBitField.Flags.ManageMessages
        ))) return;

        let title;
        let message;

        if (ctx.isInteraction) {
            title = ctx.getString("title");
            message = ctx.getString("message");
        } else {
            title = args[0];
            message = args.slice(1).join(" ");
        }

        if (!title || !message) {
            await ctx.reply({
                content: "Usage: `,embed Title | Description`"
            });
            return;
        }

        if (title.length > 200 || message.length > 3500) {
            await ctx.reply({
                content: "Title limit: 200 characters. Description limit: 3500."
            });
            return;
        }

        const embed = new EmbedBuilder()
            .setColor(0x202225)
            .setTitle(title)
            .setDescription(message)
            .setFooter({ text: "Pyrr Official" })
            .setTimestamp();

        await ctx.reply({ embeds: [embed] });
    }
});

registerCommand({
    name: "servercreated",
    description: "Show when this server was created.",
    category: "Utility",
    options: [],
    execute: async (ctx) => {
        if (!ctx.guild) {
            await ctx.reply({ content: "Use this command inside a server." });
            return;
        }

        await ctx.reply({
            content:
                `**${ctx.guild.name}** was created ` +
                `<t:${Math.floor(ctx.guild.createdTimestamp / 1000)}:F> ` +
                `(<t:${Math.floor(ctx.guild.createdTimestamp / 1000)}:R>).`
        });
    }
});

registerCommand({
    name: "memberjoined",
    description: "Check when a member joined this server.",
    category: "Utility",
    options: [
        {
            name: "user",
            type: "user",
            description: "Member to check",
            required: false
        }
    ],
    execute: async (ctx, args) => {
        if (!ctx.guild) {
            await ctx.reply({ content: "Use this command inside a server." });
            return;
        }

        let user;

        if (ctx.isInteraction) {
            user = ctx.getUser("user") || ctx.user;
        } else {
            user = ctx.source.mentions?.users?.first() || ctx.user;

            if (args[0] && !ctx.source.mentions?.users?.first()) {
                user = await client.users.fetch(args[0]).catch(() => user);
            }
        }

        const member = await ctx.guild.members.fetch(user.id).catch(() => null);

        if (!member) {
            await ctx.reply({
                content: "That user is not a member of this server."
            });
            return;
        }

        await ctx.reply({
            content:
                `**${member.user.username}** joined ` +
                `<t:${Math.floor(member.joinedTimestamp / 1000)}:F> ` +
                `(<t:${Math.floor(member.joinedTimestamp / 1000)}:R>).`
        });
    }
});

registerCommand({
    name: "permissions",
    description: "Show your permissions in this server.",
    category: "Utility",
    options: [],
    execute: async (ctx) => {
        if (!ctx.guild || !ctx.member) {
            await ctx.reply({
                content: "Use this command inside a server."
            });
            return;
        }

        const permissions = ctx.member.permissions;

        const names = permissions.toArray()
            .map(name => name
                .replace(/([A-Z])/g, " $1")
                .replace(/^./, letter => letter.toUpperCase())
            );

        const output = names.length
            ? names.join(", ")
            : "No permissions found.";

        await ctx.reply({
            content: `**Your Server Permissions**\n${output}`.slice(0, 1900)
        });
    }
});

registerCommand({
    name: "rolecount",
    description: "Count the roles in this server.",
    category: "Utility",
    options: [],
    execute: async (ctx) => {
        if (!ctx.guild) {
            await ctx.reply({ content: "Use this command inside a server." });
            return;
        }

        const roles = await ctx.guild.roles.fetch();

        await ctx.reply({
            content: `This server has **${Math.max(0, roles.size - 1)}** additional roles.`
        });
    }
});

// ==========================================
// END OF PART 5D
// Append Part 5E below this line.
// Do not deploy yet.
// ==========================================
      
registerCommand({
    name: "coinflip",
    description: "Flip a coin.",
    category: "Fun",
    options: [],
    execute: async (ctx) => {
        const result = Math.random() < 0.5 ? "Heads 🪙" : "Tails 🪙";
        await ctx.reply({ content: `**Coin Flip:** ${result}` });
    }
});

registerCommand({
    name: "dice",
    description: "Roll a six-sided dice.",
    category: "Fun",
    options: [
        {
            name: "sides",
            type: "integer",
            description: "Number of sides (2–100)",
            required: false
        }
    ],
    execute: async (ctx, args) => {
        const sides = ctx.isInteraction
            ? (ctx.getInteger("sides") ?? 6)
            : (Number(args[0]) || 6);

        if (!Number.isInteger(sides) || sides < 2 || sides > 100) {
            await ctx.reply({
                content: "Choose between 2 and 100 sides."
            });
            return;
        }

        const result = Math.floor(Math.random() * sides) + 1;
        await ctx.reply({
            content: `🎲 You rolled **${result}** (1–${sides}).`
        });
    }
});

registerCommand({
    name: "8ball",
    description: "Ask the magic 8-ball a question.",
    category: "Fun",
    options: [
        {
            name: "question",
            type: "string",
            description: "Your question",
            required: true
        }
    ],
    execute: async (ctx, args) => {
        const question = ctx.isInteraction
            ? ctx.getString("question")
            : args.join(" ");

        if (!question) {
            await ctx.reply({
                content: "Usage: `,8ball Will today be a good day?`"
            });
            return;
        }

        const answers = [
            "Yes, definitely.",
            "It looks promising.",
            "Most likely.",
            "Ask again later.",
            "Cannot predict that right now.",
            "The answer is unclear.",
            "Probably not.",
            "My answer is no.",
            "There is a chance."
        ];

        const answer = answers[Math.floor(Math.random() * answers.length)];

        await ctx.reply({
            embeds: [
                makeEmbed(
                    "🎱 Magic 8-Ball",
                    `**Question:** ${question.slice(0, 500)}\n**Answer:** ${answer}`
                )
            ]
        });
    }
});

registerCommand({
    name: "choose",
    description: "Choose randomly between options.",
    category: "Fun",
    options: [
        {
            name: "options",
            type: "string",
            description: "Options separated by commas",
            required: true
        }
    ],
    execute: async (ctx, args) => {
        const raw = ctx.isInteraction
            ? ctx.getString("options")
            : args.join(" ");

        const choices = raw
            .split(",")
            .map(item => item.trim())
            .filter(Boolean);

        if (choices.length < 2) {
            await ctx.reply({
                content: "Provide at least two options separated by commas."
            });
            return;
        }

        const choice = choices[Math.floor(Math.random() * choices.length)];

        await ctx.reply({
            content: `🤔 I choose: **${choice.slice(0, 200)}**`
        });
    }
});

registerCommand({
    name: "reverse",
    description: "Reverse some text.",
    category: "Fun",
    options: [
        {
            name: "text",
            type: "string",
            description: "Text to reverse",
            required: true
        }
    ],
    execute: async (ctx, args) => {
        const input = ctx.isInteraction
            ? ctx.getString("text")
            : args.join(" ");

        if (!input) {
            await ctx.reply({
                content: "Usage: `,reverse hello`"
            });
            return;
        }

        await ctx.reply({
            content: input.split("").reverse().join("").slice(0, 1900)
        });
    }
});

registerCommand({
    name: "character",
    description: "Count characters in a message.",
    category: "Utility",
    options: [
        {
            name: "text",
            type: "string",
            description: "Text to count",
            required: true
        }
    ],
    execute: async (ctx, args) => {
        const input = ctx.isInteraction
            ? ctx.getString("text")
            : args.join(" ");

        if (input == null) {
            await ctx.reply({ content: "Provide some text." });
            return;
        }

        await ctx.reply({
            content:
                `Characters: **${input.length}**\n` +
                `Words: **${input.trim() ? input.trim().split(/\s+/).length : 0}**`
        });
    }
});

registerCommand({
    name: "randomnumber",
    description: "Generate a random number between two limits.",
    category: "Fun",
    options: [
        {
            name: "min",
            type: "integer",
            description: "Minimum number",
            required: true
        },
        {
            name: "max",
            type: "integer",
            description: "Maximum number",
            required: true
        }
    ],
    execute: async (ctx, args) => {
        const min = ctx.isInteraction
            ? ctx.getInteger("min")
            : Number(args[0]);

        const max = ctx.isInteraction
            ? ctx.getInteger("max")
            : Number(args[1]);

        if (
            !Number.isSafeInteger(min) ||
            !Number.isSafeInteger(max) ||
            min > max ||
            max - min > 1000000
        ) {
            await ctx.reply({
                content: "Provide valid limits. The range must not exceed 1,000,000."
            });
            return;
        }

        const result = Math.floor(Math.random() * (max - min + 1)) + min;

        await ctx.reply({
            content: `🎯 Random number: **${result}**`
        });
    }
});

registerCommand({
    name: "emojilist",
    description: "List custom emojis in this server.",
    category: "Utility",
    options: [],
    execute: async (ctx) => {
        if (!ctx.guild) {
            await ctx.reply({ content: "Use this command inside a server." });
            return;
        }

        const emojis = await ctx.guild.emojis.fetch();

        const list = emojis.map(emoji =>
            `${emoji} — \`${emoji.name}\``
        );

        await ctx.reply({
            content: list.length
                ? `**Custom Emojis (${list.length})**\n${list.slice(0, 40).join("\n")}`.slice(0, 1900)
                : "This server has no custom emojis."
        });
    }
});

// ==========================================
// END OF PART 5E
// Append Part 5F below this line.
// Do not deploy yet.
// ==========================================
          
registerCommand({
    name: "hug",
    description: "Send someone a friendly hug.",
    category: "Fun",
    options: [
        {
            name: "user",
            type: "user",
            description: "Person to hug",
            required: true
        }
    ],
    execute: async (ctx, args) => {
        let user;

        if (ctx.isInteraction) {
            user = ctx.getUser("user");
        } else {
            user = ctx.source.mentions?.users?.first();
        }

        if (!user) {
            await ctx.reply({
                content: "Usage: `,hug @user`"
            });
            return;
        }

        await ctx.reply({
            content: `🫂 ${ctx.user} sends a friendly hug to ${user}!`,
            allowedMentions: { users: [ctx.user.id, user.id] }
        });
    }
});

registerCommand({
    name: "highfive",
    description: "Give someone a high five.",
    category: "Fun",
    options: [
        {
            name: "user",
            type: "user",
            description: "Person to high-five",
            required: true
        }
    ],
    execute: async (ctx) => {
        let user;

        if (ctx.isInteraction) {
            user = ctx.getUser("user");
        } else {
            user = ctx.source.mentions?.users?.first();
        }

        if (!user) {
            await ctx.reply({
                content: "Usage: `,highfive @user`"
            });
            return;
        }

        await ctx.reply({
            content: `🙌 ${ctx.user} gives ${user} a high five!`,
            allowedMentions: { users: [ctx.user.id, user.id] }
        });
    }
});

registerCommand({
    name: "ship",
    description: "Generate a random compatibility score for fun.",
    category: "Fun",
    options: [
        {
            name: "user1",
            type: "user",
            description: "First person",
            required: true
        },
        {
            name: "user2",
            type: "user",
            description: "Second person",
            required: true
        }
    ],
    execute: async (ctx) => {
        let first;
        let second;

        if (ctx.isInteraction) {
            first = ctx.getUser("user1");
            second = ctx.getUser("user2");
        } else {
            const users = [...(ctx.source.mentions?.users?.values() || [])];
            first = users[0];
            second = users[1];
        }

        if (!first || !second) {
            await ctx.reply({
                content: "Usage: `,ship @user1 @user2`"
            });
            return;
        }

        const score = Math.floor(Math.random() * 101);

        await ctx.reply({
            embeds: [
                makeEmbed(
                    "💞 Compatibility",
                    `${first} + ${second}\n\n**Fun score:** ${score}%\n\n` +
                    "This is a random score for entertainment, not a real compatibility test."
                )
            ],
            allowedMentions: { parse: [] }
        });
    }
});

registerCommand({
    name: "mock",
    description: "Convert text to alternating-case text.",
    category: "Fun",
    options: [
        {
            name: "text",
            type: "string",
            description: "Text to convert",
            required: true
        }
    ],
    execute: async (ctx, args) => {
        const input = ctx.isInteraction
            ? ctx.getString("text")
            : args.join(" ");

        if (!input) {
            await ctx.reply({
                content: "Usage: `,mock some text`"
            });
            return;
        }

        let upper = false;

        const result = [...input].map(char => {
            if (!/[a-z]/i.test(char)) return char;

            upper = !upper;
            return upper ? char.toUpperCase() : char.toLowerCase();
        }).join("");

        await ctx.reply({ content: result.slice(0, 1900) });
    }
});

registerCommand({
    name: "clap",
    description: "Put clap emojis between words.",
    category: "Fun",
    options: [
        {
            name: "text",
            type: "string",
            description: "Text to format",
            required: true
        }
    ],
    execute: async (ctx, args) => {
        const input = ctx.isInteraction
            ? ctx.getString("text")
            : args.join(" ");

        if (!input) {
            await ctx.reply({
                content: "Usage: `,clap this is a message`"
            });
            return;
        }

        await ctx.reply({
            content: input.trim().split(/\s+/).join(" 👏 ").slice(0, 1900),
            allowedMentions: { parse: [] }
        });
    }
});

registerCommand({
    name: "ascii",
    description: "Put text inside a simple text banner.",
    category: "Fun",
    options: [
        {
            name: "text",
            type: "string",
            description: "Text for the banner",
            required: true
        }
    ],
    execute: async (ctx, args) => {
        const input = (
            ctx.isInteraction
                ? ctx.getString("text")
                : args.join(" ")
        ).slice(0, 100);

        if (!input) {
            await ctx.reply({
                content: "Usage: `,ascii Pyrr Official`"
            });
            return;
        }

        const line = "-".repeat(Math.min(input.length + 4, 104));

        await ctx.reply({
            content: `\`\`\`text\n+${line}+\n|  ${input}  |\n+${line}+\n\`\`\``
        });
    }
});

registerCommand({
    name: "quote",
    description: "Create a quote card from text.",
    category: "Fun",
    options: [
        {
            name: "text",
            type: "string",
            description: "Quote text",
            required: true
        },
        {
            name: "author",
            type: "string",
            description: "Quote author",
            required: false
        }
    ],
    execute: async (ctx, args) => {
        const textValue = ctx.isInteraction
            ? ctx.getString("text")
            : args.join(" ");

        const author = ctx.isInteraction
            ? ctx.getString("author")
            : ctx.user.username;

        if (!textValue) {
            await ctx.reply({
                content: "Usage: `,quote Your quote here`"
            });
            return;
        }

        await ctx.reply({
            embeds: [
                makeEmbed(
                    "❝ Quote ❞",
                    `> ${textValue.slice(0, 1500)}\n\n— ${String(author || ctx.user.username).slice(0, 100)}`
                )
            ],
            allowedMentions: { parse: [] }
        });
    }
});

// ==========================================
// END OF PART 5F
// Append Part 5G below this line.
// Do not deploy yet.
// ==========================================
      
registerCommand({
    name: "uppercase",
    description: "Convert text to uppercase.",
    category: "Utility",
    options: [
        {
            name: "text",
            type: "string",
            description: "Text to convert",
            required: true
        }
    ],
    execute: async (ctx, args) => {
        const input = ctx.isInteraction
            ? ctx.getString("text")
            : args.join(" ");

        if (!input) {
            await ctx.reply({ content: "Usage: `,uppercase hello world`" });
            return;
        }

        await ctx.reply({ content: input.toUpperCase().slice(0, 1900) });
    }
});

registerCommand({
    name: "lowercase",
    description: "Convert text to lowercase.",
    category: "Utility",
    options: [
        {
            name: "text",
            type: "string",
            description: "Text to convert",
            required: true
        }
    ],
    execute: async (ctx, args) => {
        const input = ctx.isInteraction
            ? ctx.getString("text")
            : args.join(" ");

        if (!input) {
            await ctx.reply({ content: "Usage: `,lowercase HELLO WORLD`" });
            return;
        }

        await ctx.reply({ content: input.toLowerCase().slice(0, 1900) });
    }
});

registerCommand({
    name: "titlecase",
    description: "Capitalize the first letter of each word.",
    category: "Utility",
    options: [
        {
            name: "text",
            type: "string",
            description: "Text to format",
            required: true
        }
    ],
    execute: async (ctx, args) => {
        const input = ctx.isInteraction
            ? ctx.getString("text")
            : args.join(" ");

        if (!input) {
            await ctx.reply({ content: "Provide some text." });
            return;
        }

        const result = input.toLowerCase().replace(
            /\b\w/g,
            letter => letter.toUpperCase()
        );

        await ctx.reply({ content: result.slice(0, 1900) });
    }
});

registerCommand({
    name: "base64encode",
    description: "Encode text using Base64.",
    category: "Utility",
    options: [
        {
            name: "text",
            type: "string",
            description: "Text to encode",
            required: true
        }
    ],
    execute: async (ctx, args) => {
        const input = ctx.isInteraction
            ? ctx.getString("text")
            : args.join(" ");

        if (!input) {
            await ctx.reply({ content: "Provide text to encode." });
            return;
        }

        const encoded = Buffer.from(input, "utf8").toString("base64");

        await ctx.reply({
            content: `\`\`\`text\n${encoded.slice(0, 1800)}\n\`\`\``
        });
    }
});

registerCommand({
    name: "base64decode",
    description: "Decode Base64 text.",
    category: "Utility",
    options: [
        {
            name: "text",
            type: "string",
            description: "Base64 text to decode",
            required: true
        }
    ],
    execute: async (ctx, args) => {
        const input = (
            ctx.isInteraction
                ? ctx.getString("text")
                : args.join(" ")
        ).trim();

        if (!input || !/^[A-Za-z0-9+/]*={0,2}$/.test(input) || input.length % 4 !== 0) {
            await ctx.reply({ content: "Provide valid Base64 text." });
            return;
        }

        const decodedBuffer = Buffer.from(input, "base64");
        const decoded = decodedBuffer.toString("utf8");

        if (Buffer.from(decoded, "utf8").compare(decodedBuffer) !== 0) {
            await ctx.reply({ content: "The decoded data is not valid UTF-8 text." });
            return;
        }

        await ctx.reply({
            content: `\`\`\`text\n${decoded.slice(0, 1800)}\n\`\`\``
        });
    }
});

registerCommand({
    name: "urlencode",
    description: "Encode text for use in a URL.",
    category: "Utility",
    options: [
        {
            name: "text",
            type: "string",
            description: "Text to encode",
            required: true
        }
    ],
    execute: async (ctx, args) => {
        const input = ctx.isInteraction
            ? ctx.getString("text")
            : args.join(" ");

        if (!input) {
            await ctx.reply({ content: "Provide text to encode." });
            return;
        }

        await ctx.reply({
            content: `\`\`\`text\n${encodeURIComponent(input).slice(0, 1800)}\n\`\`\``
        });
    }
});

registerCommand({
    name: "urldecode",
    description: "Decode URL-encoded text.",
    category: "Utility",
    options: [
        {
            name: "text",
            type: "string",
            description: "Encoded text",
            required: true
        }
    ],
    execute: async (ctx, args) => {
        const input = ctx.isInteraction
            ? ctx.getString("text")
            : args.join(" ");

        if (!input) {
            await ctx.reply({ content: "Provide encoded text." });
            return;
        }

        try {
            const decoded = decodeURIComponent(input);

            await ctx.reply({
                content: `\`\`\`text\n${decoded.slice(0, 1800)}\n\`\`\``
            });
        } catch {
            await ctx.reply({
                content: "That text contains invalid URL encoding."
            });
        }
    }
});

registerCommand({
    name: "timestamp",
    description: "Show the current Unix timestamp.",
    category: "Utility",
    options: [],
    execute: async (ctx) => {
        const seconds = Math.floor(Date.now() / 1000);

        await ctx.reply({
            content:
                `**Unix timestamp:** \`${seconds}\`\n` +
                `**Discord time:** <t:${seconds}:F>\n` +
                `**Relative time:** <t:${seconds}:R>`
        });
    }
});

registerCommand({
    name: "hex",
    description: "Convert text to hexadecimal.",
    category: "Utility",
    options: [
        {
            name: "text",
            type: "string",
            description: "Text to convert",
            required: true
        }
    ],
    execute: async (ctx, args) => {
        const input = ctx.isInteraction
            ? ctx.getString("text")
            : args.join(" ");

        if (!input) {
            await ctx.reply({ content: "Provide text to convert." });
            return;
        }

        const result = Buffer.from(input, "utf8").toString("hex");

        await ctx.reply({
            content: `\`\`\`text\n${result.slice(0, 1800)}\n\`\`\``
        });
    }
});

registerCommand({
    name: "unhex",
    description: "Convert hexadecimal text back to text.",
    category: "Utility",
    options: [
        {
            name: "hex",
            type: "string",
            description: "Hexadecimal value",
            required: true
        }
    ],
    execute: async (ctx, args) => {
        const input = (
            ctx.isInteraction
                ? ctx.getString("hex")
                : args.join(" ")
        ).trim();

        if (!input || input.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(input)) {
            await ctx.reply({ content: "Provide valid hexadecimal text." });
            return;
        }

        const buffer = Buffer.from(input, "hex");
        const decoded = buffer.toString("utf8");

        if (Buffer.from(decoded, "utf8").compare(buffer) !== 0) {
            await ctx.reply({ content: "The hexadecimal value is not valid UTF-8 text." });
            return;
        }

        await ctx.reply({
            content: `\`\`\`text\n${decoded.slice(0, 1800)}\n\`\`\``
        });
    }
});

// ==========================================
// END OF PART 5G
// Append Part 5H below this line.
// Do not deploy yet.
// ==========================================
      
registerCommand({
    name: "botstatus",
    description: "Show the bot's current status.",
    category: "Utility",
    options: [],
    execute: async (ctx) => {
        const ping = client.ws.ping;
        const uptimeSeconds = Math.floor(process.uptime());

        const days = Math.floor(uptimeSeconds / 86400);
        const hours = Math.floor((uptimeSeconds % 86400) / 3600);
        const minutes = Math.floor((uptimeSeconds % 3600) / 60);
        const seconds = uptimeSeconds % 60;

        await ctx.reply({
            embeds: [
                makeEmbed(
                    "Pyrr Official — Status",
                    `**Status:** Online\n` +
                    `**WebSocket ping:** ${ping >= 0 ? `${ping}ms` : "Connecting"}\n` +
                    `**Uptime:** ${days}d ${hours}h ${minutes}m ${seconds}s\n` +
                    `**Servers:** ${client.guilds.cache.size}\n` +
                    `**Commands:** ${getUniqueCommands().length}`
                )
            ]
        });
    }
});

registerCommand({
    name: "serverbanner",
    description: "Show this server's banner.",
    category: "Utility",
    options: [],
    execute: async (ctx) => {
        if (!ctx.guild) {
            await ctx.reply({ content: "Use this command inside a server." });
            return;
        }

        const guild = await ctx.guild.fetch();

        const banner = guild.bannerURL({
            size: 1024,
            extension: "png"
        });

        if (!banner) {
            await ctx.reply({
                content: "This server doesn't have a banner set, or its banner isn't available."
            });
            return;
        }

        await ctx.reply({
            embeds: [
                new EmbedBuilder()
                    .setTitle(`${guild.name} — Server Banner`)
                    .setImage(banner)
                    .setColor(0x202225)
            ]
        });
    }
});

registerCommand({
    name: "randomcolor",
    description: "Generate a random hexadecimal color.",
    category: "Fun",
    options: [],
    execute: async (ctx) => {
        const color = Math.floor(Math.random() * 0x1000000);
        const hex = `#${color.toString(16).padStart(6, "0")}`;

        await ctx.reply({
            embeds: [
                new EmbedBuilder()
                    .setTitle("Random Color")
                    .setDescription(`**HEX:** \`${hex}\`\n**RGB:** \`${(color >> 16) & 255}, ${(color >> 8) & 255}, ${color & 255}\``)
                    .setColor(color)
                    .setFooter({ text: "Pyrr Official" })
            ]
        });
    }
});

registerCommand({
    name: "colorinfo",
    description: "Display information about a hexadecimal color.",
    category: "Utility",
    options: [
        {
            name: "hex",
            type: "string",
            description: "Hex color, such as #ff0000",
            required: true
        }
    ],
    execute: async (ctx, args) => {
        const input = (
            ctx.isInteraction
                ? ctx.getString("hex")
                : args[0]
        ).trim().replace(/^#/, "");

        if (!/^[0-9a-f]{6}$/i.test(input)) {
            await ctx.reply({
                content: "Enter a valid six-digit hex color, such as `#ff0000`."
            });
            return;
        }

        const value = parseInt(input, 16);
        const red = (value >> 16) & 255;
        const green = (value >> 8) & 255;
        const blue = value & 255;

        await ctx.reply({
            embeds: [
                new EmbedBuilder()
                    .setTitle("Color Information")
                    .setDescription(
                        `**HEX:** \`#${input.toUpperCase()}\`\n` +
                        `**RGB:** \`${red}, ${green}, ${blue}\`\n` +
                        `**Decimal:** \`${value}\``
                    )
                    .setColor(value)
            ]
        });
    }
});

registerCommand({
    name: "serverowner",
    description: "Show this server's owner.",
    category: "Utility",
    options: [],
    execute: async (ctx) => {
        if (!ctx.guild) {
            await ctx.reply({ content: "Use this command inside a server." });
            return;
        }

        const owner = await ctx.guild.fetchOwner().catch(() => null);

        if (!owner) {
            await ctx.reply({ content: "I couldn't retrieve the server owner." });
            return;
        }

        await ctx.reply({
            embeds: [
                makeEmbed(
                    "Server Owner",
                    `**User:** ${owner.user.username}\n` +
                    `**Mention:** <@${owner.id}>\n` +
                    `**ID:** \`${owner.id}\``
                )
            ],
            allowedMentions: { parse: [] }
        });
    }
});

registerCommand({
    name: "botinvite",
    description: "Get an invite link for Pyrr Official.",
    category: "Utility",
    options: [],
    execute: async (ctx) => {
        const invite = `https://discord.com/oauth2/authorize?client_id=${client.user.id}&scope=bot%20applications.commands`;

        await ctx.reply({
            embeds: [
                makeEmbed(
                    "Invite Pyrr Official",
                    `[Add the bot to your server](${invite})\n\n` +
                    `[Support Server](${SUPPORT_SERVER})`
                )
            ]
        });
    }
});

registerCommand({
    name: "botcreator",
    description: "Show the bot creator.",
    category: "Utility",
    options: [],
    execute: async (ctx) => {
        await ctx.reply({
            embeds: [
                makeEmbed(
                    "Bot Creator",
                    `**Bot:** ${BOT_NAME}\n` +
                    `**Creator:** ${CREATOR}\n` +
                    `[Support Server](${SUPPORT_SERVER})`
                )
            ]
        });
    }
});

registerCommand({
    name: "supportinfo",
    description: "Show the official support server.",
    category: "Utility",
    options: [],
    execute: async (ctx) => {
        await ctx.reply({
            embeds: [
                makeEmbed(
                    "Pyrr Official Support",
                    `Need help with the bot?\n\n[Join the support server](${SUPPORT_SERVER})`
                )
            ]
        });
    }
});

// ==========================================
// END OF PART 5H
// Append Part 5I below this line.
// Do not deploy yet.
// ==========================================
      
registerCommand({
    name: "rps",
    description: "Play rock-paper-scissors against the bot.",
    category: "Fun",
    options: [
        {
            name: "choice",
            type: "string",
            description: "Choose rock, paper, or scissors",
            required: true
        }
    ],
    execute: async (ctx, args) => {
        const choice = (
            ctx.isInteraction
                ? ctx.getString("choice")
                : args[0]
        ).toLowerCase();

        const valid = ["rock", "paper", "scissors"];

        if (!valid.includes(choice)) {
            await ctx.reply({
                content: "Choose `rock`, `paper`, or `scissors`."
            });
            return;
        }

        const botChoice = valid[Math.floor(Math.random() * valid.length)];
        let result;

        if (choice === botChoice) {
            result = "It's a tie! 🤝";
        } else if (
            (choice === "rock" && botChoice === "scissors") ||
            (choice === "paper" && botChoice === "rock") ||
            (choice === "scissors" && botChoice === "paper")
        ) {
            result = "You win! 🎉";
        } else {
            result = "I win this round! 🤖";
        }

        await ctx.reply({
            embeds: [
                makeEmbed(
                    "✊ Rock Paper Scissors",
                    `**Your choice:** ${choice}\n` +
                    `**My choice:** ${botChoice}\n\n${result}`
                )
            ]
        });
    }
});

registerCommand({
    name: "rate",
    description: "Give something a random fun rating.",
    category: "Fun",
    options: [
        {
            name: "thing",
            type: "string",
            description: "What should be rated?",
            required: true
        }
    ],
    execute: async (ctx, args) => {
        const thing = (
            ctx.isInteraction
                ? ctx.getString("thing")
                : args.join(" ")
        ).trim();

        if (!thing) {
            await ctx.reply({
                content: "Usage: `,rate my gaming setup`"
            });
            return;
        }

        const score = Math.floor(Math.random() * 101);

        await ctx.reply({
            embeds: [
                makeEmbed(
                    "⭐ Random Rating",
                    `**${thing.slice(0, 150)}** gets **${score}/100**!\n\nThis rating is random and just for fun.`
                )
            ]
        });
    }
});

registerCommand({
    name: "compliment",
    description: "Give someone a friendly compliment.",
    category: "Fun",
    options: [
        {
            name: "user",
            type: "user",
            description: "Person to compliment",
            required: true
        }
    ],
    execute: async (ctx) => {
        let user;

        if (ctx.isInteraction) {
            user = ctx.getUser("user");
        } else {
            user = ctx.source.mentions?.users?.first();
        }

        if (!user) {
            await ctx.reply({
                content: "Usage: `,compliment @user`"
            });
            return;
        }

        const compliments = [
            "You bring good energy to the server. ✨",
            "You have a great sense of humor. 😄",
            "You're a valuable part of this community. 🤝",
            "Keep being yourself. You're doing great. 🌟",
            "Your presence makes the conversation better. 💫",
            "You deserve credit for your effort. 👏",
            "You seem like someone people can count on. 💙"
        ];

        const message = compliments[
            Math.floor(Math.random() * compliments.length)
        ];

        await ctx.reply({
            content: `**A message for ${user.username}:**\n${message}`,
            allowedMentions: { parse: [] }
        });
    }
});

registerCommand({
    name: "motivate",
    description: "Get a random motivational message.",
    category: "Fun",
    options: [],
    execute: async (ctx) => {
        const messages = [
            "Small progress is still progress. Keep going.",
            "You don't need to have everything figured out today.",
            "Consistency can take you further than motivation alone.",
            "Learn from yesterday and make today count.",
            "Take a break when you need one, then continue at your own pace.",
            "Your mistakes can become useful lessons.",
            "Focus on what you can improve, one step at a time.",
            "You are allowed to start over and try again.",
            "Stay patient with yourself while you learn."
        ];

        const message = messages[
            Math.floor(Math.random() * messages.length)
        ];

        await ctx.reply({
            embeds: [
                makeEmbed("🌟 Daily Motivation", message)
            ]
        });
    }
});

registerCommand({
    name: "percentage",
    description: "Calculate a percentage of a number.",
    category: "Utility",
    options: [
        {
            name: "percent",
            type: "integer",
            description: "Percentage to calculate",
            required: true
        },
        {
            name: "number",
            type: "integer",
            description: "Number to calculate against",
            required: true
        }
    ],
    execute: async (ctx, args) => {
        const percent = ctx.isInteraction
            ? ctx.getInteger("percent")
            : Number(args[0]);

        const number = ctx.isInteraction
            ? ctx.getInteger("number")
            : Number(args[1]);

        if (
            !Number.isFinite(percent) ||
            !Number.isFinite(number) ||
            Math.abs(percent) > 1000000 ||
            Math.abs(number) > 1000000000
        ) {
            await ctx.reply({
                content: "Enter valid numbers within the supported range."
            });
            return;
        }

        const result = (percent / 100) * number;

        await ctx.reply({
            content: `**${percent}% of ${number} = ${result}**`
        });
    }
});

registerCommand({
    name: "average",
    description: "Calculate the average of numbers.",
    category: "Utility",
    options: [
        {
            name: "numbers",
            type: "string",
            description: "Numbers separated by commas",
            required: true
        }
    ],
    execute: async (ctx, args) => {
        const raw = (
            ctx.isInteraction
                ? ctx.getString("numbers")
                : args.join(" ")
        );

        const numbers = raw.split(",").map(value => value.trim());

        if (
            numbers.length < 1 ||
            numbers.length > 100 ||
            numbers.some(value => value === "" || !Number.isFinite(Number(value)))
        ) {
            await ctx.reply({
                content: "Enter up to 100 valid numbers separated by commas."
            });
            return;
        }

        const values = numbers.map(Number);
        const average = values.reduce((sum, value) => sum + value, 0) / values.length;

        await ctx.reply({
            content:
                `**Count:** ${values.length}\n` +
                `**Average:** ${Number(average.toFixed(6))}`
        });
    }
});

// ==========================================
// END OF PART 5I
// Append Part 5J below this line.
// Do not deploy yet.
// ==========================================

registerCommand({
    name: "calc",
    description: "Calculate a basic mathematical expression.",
    category: "Utility",
    options: [
        {
            name: "expression",
            type: "string",
            description: "Example: (25 + 5) * 2",
            required: true
        }
    ],
    execute: async (ctx, args) => {
        const expression = (
            ctx.isInteraction
                ? ctx.getString("expression")
                : args.join(" ")
        ).trim();

        if (!expression || expression.length > 100) {
            await ctx.reply({
                content: "Provide a mathematical expression under 100 characters."
            });
            return;
        }

        if (!/^[0-9+\-*/().%\s]+$/.test(expression)) {
            await ctx.reply({
                content: "Only numbers, parentheses, and basic math operators are allowed."
            });
            return;
        }

        const tokens = expression.match(
            /(?:\d+(?:\.\d*)?|\.\d+)|[()+\-*/%]/g
        );

        if (!tokens || tokens.join("") !== expression.replace(/\s/g, "")) {
            await ctx.reply({ content: "Invalid mathematical expression." });
            return;
        }

        let position = 0;

        function parseExpression() {
            let value = parseTerm();

            while (tokens[position] === "+" || tokens[position] === "-") {
                const operator = tokens[position++];
                const right = parseTerm();
                value = operator === "+" ? value + right : value - right;
            }

            return value;
        }

        function parseTerm() {
            let value = parseFactor();

            while (
                tokens[position] === "*" ||
                tokens[position] === "/" ||
                tokens[position] === "%"
            ) {
                const operator = tokens[position++];
                const right = parseFactor();

                if (
                    (operator === "/" || operator === "%") &&
                    right === 0
                ) {
                    throw new Error("Cannot divide by zero.");
                }

                if (operator === "*") value *= right;
                if (operator === "/") value /= right;
                if (operator === "%") value %= right;
            }

            return value;
        }

        function parseFactor() {
            const token = tokens[position];

            if (token === "+" || token === "-") {
                position++;
                const value = parseFactor();
                return token === "-" ? -value : value;
            }

            if (token === "(") {
                position++;
                const value = parseExpression();

                if (tokens[position] !== ")") {
                    throw new Error("Missing closing parenthesis.");
                }

                position++;
                return value;
            }

            if (token !== undefined && /^[\d.]+$/.test(token)) {
                position++;
                const value = Number(token);

                if (!Number.isFinite(value)) {
                    throw new Error("Invalid number.");
                }

                return value;
            }

            throw new Error("Invalid expression.");
        }

        try {
            const result = parseExpression();

            if (position !== tokens.length || !Number.isFinite(result)) {
                throw new Error("Invalid or out-of-range expression.");
            }

            await ctx.reply({
                content:
                    `**Expression:** \`${expression}\`\n` +
                    `**Result:** \`${Number(result.toPrecision(12))}\``
            });
        } catch (error) {
            await ctx.reply({
                content: error.message || "Unable to calculate that expression."
            });
        }
    }
});

registerCommand({
    name: "square",
    description: "Calculate the square of a number.",
    category: "Utility",
    options: [
        {
            name: "number",
            type: "string",
            description: "Number to square",
            required: true
        }
    ],
    execute: async (ctx, args) => {
        const raw = ctx.isInteraction
            ? ctx.getString("number")
            : args[0];

        const number = Number(raw);

        if (raw == null || raw.trim() === "" || !Number.isFinite(number) || Math.abs(number) > 1e100) {
            await ctx.reply({ content: "Provide a valid number." });
            return;
        }

        await ctx.reply({
            content: `**${number}² = ${number * number}**`
        });
    }
});

registerCommand({
    name: "squareroot",
    description: "Calculate the square root of a number.",
    category: "Utility",
    options: [
        {
            name: "number",
            type: "string",
            description: "Non-negative number",
            required: true
        }
    ],
    execute: async (ctx, args) => {
        const raw = ctx.isInteraction
            ? ctx.getString("number")
            : args[0];

        const number = Number(raw);

        if (raw == null || raw.trim() === "" || !Number.isFinite(number) || number < 0) {
            await ctx.reply({
                content: "Provide a valid non-negative number."
            });
            return;
        }

        await ctx.reply({
            content: `**√${number} = ${Math.sqrt(number)}**`
        });
    }
});

registerCommand({
    name: "factorial",
    description: "Calculate the factorial of an integer from 0 to 170.",
    category: "Utility",
    options: [
        {
            name: "number",
            type: "integer",
            description: "Integer from 0 to 170",
            required: true
        }
    ],
    execute: async (ctx, args) => {
        const number = ctx.isInteraction
            ? ctx.getInteger("number")
            : Number(args[0]);

        if (!Number.isInteger(number) || number < 0 || number > 170) {
            await ctx.reply({
                content: "Enter an integer from 0 to 170."
            });
            return;
        }

        let result = 1n;

        for (let i = 2; i <= number; i++) {
            result *= BigInt(i);
        }

        await ctx.reply({
            content: `**${number}! = ${result.toString()}**`
        });
    }
});

registerCommand({
    name: "convert",
    description: "Convert between common length units.",
    category: "Utility",
    options: [
        {
            name: "value",
            type: "string",
            description: "Value to convert",
            required: true
        },
        {
            name: "from",
            type: "string",
            description: "Source unit: mm, cm, m, km, in, ft, mi",
            required: true
        },
        {
            name: "to",
            type: "string",
            description: "Target unit: mm, cm, m, km, in, ft, mi",
            required: true
        }
    ],
    execute: async (ctx, args) => {
        let rawValue;
        let from;
        let to;

        if (ctx.isInteraction) {
            rawValue = ctx.getString("value");
            from = ctx.getString("from").toLowerCase();
            to = ctx.getString("to").toLowerCase();
        } else {
            rawValue = args[0];
            from = String(args[1] || "").toLowerCase();
            to = String(args[2] || "").toLowerCase();
        }

        const value = Number(rawValue);

        const units = {
            mm: 0.001,
            cm: 0.01,
            m: 1,
            km: 1000,
            in: 0.0254,
            ft: 0.3048,
            mi: 1609.344
        };

        if (
            rawValue == null ||
            rawValue.trim() === "" ||
            !Number.isFinite(value) ||
            Math.abs(value) > 1e100 ||
            !(from in units) ||
            !(to in units)
        ) {
            await ctx.reply({
                content: "Usage: `,convert 10 cm m` — units: mm, cm, m, km, in, ft, mi."
            });
            return;
        }

        const result = value * units[from] / units[to];

        await ctx.reply({
            content: `**${value} ${from} = ${Number(result.toPrecision(10))} ${to}**`
        });
    }
});

// ==========================================
// END OF PART 5J
// Append Part 5K below this line.
// Do not deploy yet.
// ==========================================
      
registerCommand({
    name: "wordcount",
    description: "Count words, characters, and lines.",
    category: "Utility",
    options: [
        {
            name: "text",
            type: "string",
            description: "Text to analyze",
            required: true
        }
    ],
    execute: async (ctx, args) => {
        const input = ctx.isInteraction
            ? ctx.getString("text")
            : args.join(" ");

        if (input == null || !input.length) {
            await ctx.reply({ content: "Provide some text." });
            return;
        }

        const words = input.trim()
            ? input.trim().split(/\s+/).length
            : 0;

        const lines = input.split(/\r\n|\r|\n/).length;

        await ctx.reply({
            embeds: [
                makeEmbed(
                    "Text Statistics",
                    `**Words:** ${words}\n` +
                    `**Characters:** ${input.length}\n` +
                    `**Characters without spaces:** ${input.replace(/\s/g, "").length}\n` +
                    `**Lines:** ${lines}`
                )
            ]
        });
    }
});

registerCommand({
    name: "palindrome",
    description: "Check whether text is a palindrome.",
    category: "Fun",
    options: [
        {
            name: "text",
            type: "string",
            description: "Text to check",
            required: true
        }
    ],
    execute: async (ctx, args) => {
        const input = ctx.isInteraction
            ? ctx.getString("text")
            : args.join(" ");

        if (!input) {
            await ctx.reply({
                content: "Usage: `,palindrome never odd or even`"
            });
            return;
        }

        const normalized = input
            .toLowerCase()
            .replace(/[^a-z0-9]/g, "");

        const reversed = [...normalized].reverse().join("");
        const result = normalized === reversed;

        await ctx.reply({
            content: result
                ? `✅ **"${input}"** is a palindrome.`
                : `❌ **"${input}"** is not a palindrome.`
        });
    }
});

registerCommand({
    name: "binary",
    description: "Convert text into binary.",
    category: "Utility",
    options: [
        {
            name: "text",
            type: "string",
            description: "Text to convert",
            required: true
        }
    ],
    execute: async (ctx, args) => {
        const input = ctx.isInteraction
            ? ctx.getString("text")
            : args.join(" ");

        if (!input) {
            await ctx.reply({ content: "Provide text to convert." });
            return;
        }

        const output = [...Buffer.from(input, "utf8")]
            .map(byte => byte.toString(2).padStart(8, "0"))
            .join(" ");

        if (output.length > 1800) {
            await ctx.reply({
                content: "That result is too long. Try shorter text."
            });
            return;
        }

        await ctx.reply({
            content: `\`\`\`text\n${output}\n\`\`\``
        });
    }
});

registerCommand({
    name: "unbinary",
    description: "Convert binary bytes back into text.",
    category: "Utility",
    options: [
        {
            name: "binary",
            type: "string",
            description: "8-bit binary bytes separated by spaces",
            required: true
        }
    ],
    execute: async (ctx, args) => {
        const input = (
            ctx.isInteraction
                ? ctx.getString("binary")
                : args.join(" ")
        ).trim();

        const bytes = input.split(/\s+/);

        if (
            !input ||
            bytes.length > 200 ||
            bytes.some(byte => !/^[01]{8}$/.test(byte))
        ) {
            await ctx.reply({
                content: "Enter 8-bit binary bytes separated by spaces."
            });
            return;
        }

        const buffer = Buffer.from(
            bytes.map(byte => parseInt(byte, 2))
        );

        const decoded = buffer.toString("utf8");

        if (Buffer.from(decoded, "utf8").compare(buffer) !== 0) {
            await ctx.reply({
                content: "Those bytes do not represent valid UTF-8 text."
            });
            return;
        }

        await ctx.reply({
            content: `\`\`\`text\n${decoded.slice(0, 1700)}\n\`\`\``
        });
    }
});

registerCommand({
    name: "morse",
    description: "Convert text into Morse code.",
    category: "Utility",
    options: [
        {
            name: "text",
            type: "string",
            description: "Text using A-Z and digits",
            required: true
        }
    ],
    execute: async (ctx, args) => {
        const input = (
            ctx.isInteraction
                ? ctx.getString("text")
                : args.join(" ")
        ).toUpperCase();

        if (!input) {
            await ctx.reply({ content: "Provide text to convert." });
            return;
        }

        const code = {
            A: ".-", B: "-...", C: "-.-.", D: "-..",
            E: ".", F: "..-.", G: "--.", H: "....",
            I: "..", J: ".---", K: "-.-", L: ".-..",
            M: "--", N: "-.", O: "---", P: ".--.",
            Q: "--.-", R: ".-.", S: "...", T: "-",
            U: "..-", V: "...-", W: ".--", X: "-..-",
            Y: "-.--", Z: "--..",
            0: "-----", 1: ".----", 2: "..---",
            3: "...--", 4: "....-", 5: ".....",
            6: "-....", 7: "--...", 8: "---..",
            9: "----."
        };

        const output = [...input]
            .map(char => char === " "
                ? "/"
                : code[char] || "?")
            .join(" ");

        if (output.length > 1800) {
            await ctx.reply({
                content: "That result is too long. Try shorter text."
            });
            return;
        }

        await ctx.reply({
            content: `**Morse Code**\n\`\`\`text\n${output}\n\`\`\``
        });
    }
});

// ==========================================
// END OF PART 5K
// Append Part 5L below this line.
// Do not deploy yet.
// ==========================================

registerCommand({
    name: "serverboosts",
    description: "Show this server's boost statistics.",
    category: "Utility",
    options: [],
    execute: async (ctx) => {
        if (!ctx.guild) {
            await ctx.reply({ content: "Use this command inside a server." });
            return;
        }

        const guild = await ctx.guild.fetch();

        await ctx.reply({
            embeds: [
                makeEmbed(
                    "Server Boost Statistics",
                    `**Server:** ${guild.name}\n` +
                    `**Boost level:** ${guild.premiumTier}\n` +
                    `**Total boosts:** ${guild.premiumSubscriptionCount ?? 0}\n` +
                    `**Boost slots used:** ${guild.premiumSubscriptionCount ?? 0}`
                )
            ]
        });
    }
});

registerCommand({
    name: "boosters",
    description: "List server members who boost the server.",
    category: "Utility",
    options: [],
    execute: async (ctx) => {
        if (!ctx.guild) {
            await ctx.reply({ content: "Use this command inside a server." });
            return;
        }

        const members = await ctx.guild.members.fetch();

        const boosters = members
            .filter(member => member.premiumSince)
            .sort((a, b) =>
                a.premiumSinceTimestamp - b.premiumSinceTimestamp
            );

        const list = boosters.map(member =>
            `**${member.user.username}** — <t:${Math.floor(member.premiumSinceTimestamp / 1000)}:R>`
        );

        await ctx.reply({
            content: list.length
                ? `**Server Boosters (${list.length})**\n${list.slice(0, 35).join("\n")}`.slice(0, 1900)
                : "No server boosters found."
        });
    }
});

registerCommand({
    name: "channelcount",
    description: "Count the channels in this server.",
    category: "Utility",
    options: [],
    execute: async (ctx) => {
        if (!ctx.guild) {
            await ctx.reply({ content: "Use this command inside a server." });
            return;
        }

        const channels = await ctx.guild.channels.fetch();

        const categories = channels.filter(channel => channel.type === 4).size;
        const textChannels = channels.filter(channel =>
            channel.type === 0 || channel.type === 5
        ).size;
        const voiceChannels = channels.filter(channel =>
            channel.type === 2 || channel.type === 13
        ).size;
        const otherChannels = channels.size - categories - textChannels - voiceChannels;

        await ctx.reply({
            embeds: [
                makeEmbed(
                    "Channel Statistics",
                    `**Total channels:** ${channels.size}\n` +
                    `**Text and announcement:** ${textChannels}\n` +
                    `**Voice and stage:** ${voiceChannels}\n` +
                    `**Categories:** ${categories}\n` +
                    `**Other:** ${otherChannels}`
                )
            ]
        });
    }
});

registerCommand({
    name: "serverfeatures",
    description: "Show enabled features of this server.",
    category: "Utility",
    options: [],
    execute: async (ctx) => {
        if (!ctx.guild) {
            await ctx.reply({ content: "Use this command inside a server." });
            return;
        }

        const guild = await ctx.guild.fetch();
        const features = guild.features || [];

        const formatted = features.length
            ? features.map(feature =>
                `• ${feature.replace(/_/g, " ").toLowerCase()}`
            ).join("\n")
            : "No special server features reported.";

        await ctx.reply({
            embeds: [
                makeEmbed(
                    "Server Features",
                    formatted.slice(0, 3500)
                )
            ]
        });
    }
});

registerCommand({
    name: "emojiinfo",
    description: "Show information about a custom server emoji.",
    category: "Utility",
    options: [
        {
            name: "emoji",
            type: "string",
            description: "Mention or ID of a custom emoji",
            required: true
        }
    ],
    execute: async (ctx, args) => {
        if (!ctx.guild) {
            await ctx.reply({ content: "Use this command inside a server." });
            return;
        }

        const raw = (
            ctx.isInteraction
                ? ctx.getString("emoji")
                : args[0]
        ).trim();

        const match = raw.match(/<?a?:?[\w]+:(\d+)>?/);
        const id = match ? match[1] : raw.replace(/[<>]/g, "");

        if (!/^\d{17,20}$/.test(id)) {
            await ctx.reply({
                content: "Provide a custom emoji mention or emoji ID."
            });
            return;
        }

        const emoji = await ctx.guild.emojis.fetch(id).catch(() => null);

        if (!emoji) {
            await ctx.reply({
                content: "I couldn't find that custom emoji in this server."
            });
            return;
        }

        const embed = makeEmbed(
            "Emoji Information",
            `**Name:** ${emoji.name}\n` +
            `**ID:** ${emoji.id}\n` +
            `**Animated:** ${emoji.animated ? "Yes" : "No"}\n` +
            `**Available:** ${emoji.available ? "Yes" : "No"}\n` +
            `**Created:** <t:${Math.floor(emoji.createdTimestamp / 1000)}:F>`
        );

        embed.setThumbnail(emoji.imageURL({ size: 256 }));

        await ctx.reply({ embeds: [embed] });
    }
});

registerCommand({
    name: "memberstatus",
    description: "Show a member's visible presence status.",
    category: "Utility",
    options: [
        {
            name: "user",
            type: "user",
            description: "Member to check",
            required: false
        }
    ],
    execute: async (ctx, args) => {
        if (!ctx.guild) {
            await ctx.reply({ content: "Use this command inside a server." });
            return;
        }

        let user;

        if (ctx.isInteraction) {
            user = ctx.getUser("user") || ctx.user;
        } else {
            user = ctx.source.mentions?.users?.first() || ctx.user;
        }

        const member = await ctx.guild.members.fetch({
            user: user.id,
            force: true
        }).catch(() => null);

        if (!member) {
            await ctx.reply({ content: "Member not found." });
            return;
        }

        const presence = member.presence;
        const status = presence?.status || "offline or unavailable";

        await ctx.reply({
            embeds: [
                makeEmbed(
                    "Member Presence",
                    `**User:** ${member.user.username}\n` +
                    `**Status:** ${status}\n\n` +
                    "Discord may hide presence information if the required intent is unavailable."
                )
            ]
        });
    }
});

// ==========================================
// END OF PART 5L
// Append Part 5M below this line.
// Do not deploy yet.
// ==========================================
// ==========================================
// PART 5M — SERVER & MEMBER UTILITIES
// ==========================================

registerCommand({
  name: "joinedat",
  description: "Check when a member joined this server.",
  category: "Utility",
  aliases: ["joinage"],
  options: [
    { name: "user", description: "Member to check", type: "user", required: false }
  ],
  slash: true,
  execute: async (ctx, args) => {
    if (!ctx.guild) {
      await ctx.reply({ content: "Use this command inside a server." });
      return;
    }

    let member = ctx.isInteraction
      ? await getTargetMember(ctx, args, "user")
      : await getTargetMember(ctx, args);

    if (!member) member = ctx.member;

    await ctx.reply({
      embeds: [makeEmbed(
        "Member Join Date",
        `**Member:** ${member.user.tag}\n**Joined:** <t:${Math.floor(member.joinedTimestamp / 1000)}:F>\n**Relative:** <t:${Math.floor(member.joinedTimestamp / 1000)}:R>`
      )]
    });
  }
});

registerCommand({
  name: "createdat",
  description: "Check when a Discord account was created.",
  category: "Utility",
  aliases: ["accountage"],
  options: [
    { name: "user", description: "User to check", type: "user", required: false }
  ],
  slash: true,
  execute: async (ctx, args) => {
    let user = ctx.isInteraction
      ? ctx.getUser("user")
      : ctx.source.mentions.users.first();

    if (!user && !ctx.isInteraction && args[0]) {
      user = await client.users.fetch(args[0]).catch(() => null);
    }

    if (!user) user = ctx.user;

    const created = Math.floor(user.createdTimestamp / 1000);

    await ctx.reply({
      embeds: [makeEmbed(
        "Account Creation Date",
        `**User:** ${user.tag}\n**Created:** <t:${created}:F>\n**Account age:** <t:${created}:R>`
      )]
    });
  }
});

registerCommand({
  name: "memberroles",
  description: "Show the roles assigned to a member.",
  category: "Utility",
  aliases: ["userroles"],
  options: [
    { name: "user", description: "Member to check", type: "user", required: false }
  ],
  slash: true,
  execute: async (ctx, args) => {
    if (!ctx.guild) {
      await ctx.reply({ content: "Use this command inside a server." });
      return;
    }

    let member = ctx.isInteraction
      ? await getTargetMember(ctx, args, "user")
      : await getTargetMember(ctx, args);

    if (!member) member = ctx.member;

    const roles = member.roles.cache
      .filter(role => role.id !== ctx.guild.id)
      .sort((a, b) => b.position - a.position)
      .map(role => role.toString());

    await ctx.reply({
      embeds: [makeEmbed(
        `Roles — ${member.user.tag}`,
        roles.length ? roles.join(", ") : "This member has no additional roles."
      )]
    });
  }
});

registerCommand({
  name: "finduser",
  description: "Find a server member by name or ID.",
  category: "Utility",
  options: [
    { name: "query", description: "Username, display name, or user ID", type: "string", required: true }
  ],
  slash: true,
  execute: async (ctx, args) => {
    if (!ctx.guild) {
      await ctx.reply({ content: "Use this command inside a server." });
      return;
    }

    const query = (
      ctx.isInteraction ? ctx.getString("query") : args.join(" ")
    ).trim();

    if (!query) {
      await ctx.reply({ content: "Provide a username, display name, or user ID." });
      return;
    }

    let member = null;

    if (/^\d{17,20}$/.test(query)) {
      member = await ctx.guild.members.fetch(query).catch(() => null);
    }

    if (!member) {
      const members = await ctx.guild.members.fetch().catch(() => null);

      if (members) {
        const lower = query.toLowerCase();

        member = members.find(m =>
          m.user.username.toLowerCase() === lower ||
          m.displayName.toLowerCase() === lower ||
          m.user.tag.toLowerCase() === lower
        ) || null;
      }
    }

    if (!member) {
      await ctx.reply({ content: "No matching member found." });
      return;
    }

    await ctx.reply({
      embeds: [makeEmbed(
        "Member Found",
        `**User:** ${member.user.tag}\n**Display name:** ${member.displayName}\n**ID:** \`${member.id}\`\n**Mention:** ${member}\n**Joined:** <t:${Math.floor(member.joinedTimestamp / 1000)}:R>`
      )]
    });
  }
});

registerCommand({
  name: "findrole",
  description: "Find a role by name or ID.",
  category: "Utility",
  options: [
    { name: "query", description: "Role name or role ID", type: "string", required: true }
  ],
  slash: true,
  execute: async (ctx, args) => {
    if (!ctx.guild) {
      await ctx.reply({ content: "Use this command inside a server." });
      return;
    }

    const query = (
      ctx.isInteraction ? ctx.getString("query") : args.join(" ")
    ).trim();

    if (!query) {
      await ctx.reply({ content: "Provide a role name or ID." });
      return;
    }

    const role = ctx.guild.roles.cache.get(query) ||
      ctx.guild.roles.cache.find(r =>
        r.name.toLowerCase() === query.toLowerCase()
      );

    if (!role) {
      await ctx.reply({ content: "No matching role found." });
      return;
    }

    await ctx.reply({
      embeds: [makeEmbed(
        "Role Found",
        `**Role:** ${role}\n**Name:** ${role.name}\n**ID:** \`${role.id}\`\n**Members:** ${role.members.size}\n**Position:** ${role.position}`
      )]
    });
  }
});

registerCommand({
  name: "findchannel",
  description: "Find a channel by name or ID.",
  category: "Utility",
  options: [
    { name: "query", description: "Channel name or channel ID", type: "string", required: true }
  ],
  slash: true,
  execute: async (ctx, args) => {
    if (!ctx.guild) {
      await ctx.reply({ content: "Use this command inside a server." });
      return;
    }

    const query = (
      ctx.isInteraction ? ctx.getString("query") : args.join(" ")
    ).trim();

    if (!query) {
      await ctx.reply({ content: "Provide a channel name or ID." });
      return;
    }

    const channel = ctx.guild.channels.cache.get(query) ||
      ctx.guild.channels.cache.find(c =>
        c.name && c.name.toLowerCase() === query.toLowerCase()
      );

    if (!channel) {
      await ctx.reply({ content: "No matching channel found." });
      return;
    }

    await ctx.reply({
      embeds: [makeEmbed(
        "Channel Found",
        `**Channel:** ${channel}\n**Name:** ${channel.name || "Unnamed"}\n**ID:** \`${channel.id}\`\n**Type:** ${channel.type}`
      )]
    });
  }
});

registerCommand({
  name: "channelname",
  description: "Change the name of the current channel.",
  category: "Moderation",
  options: [
    { name: "name", description: "New channel name", type: "string", required: true }
  ],
  slash: true,
  execute: async (ctx, args) => {
    if (!(await requireModerator(ctx, PermissionsBitField.Flags.ManageChannels))) return;

    const channel = ctx.channel;
    const name = (
      ctx.isInteraction ? ctx.getString("name") : args.join(" ")
    ).trim();

    if (!channel || !channel.isTextBased() || !channel.setName) {
      await ctx.reply({ content: "Use this command in a renameable text channel." });
      return;
    }

    if (!name || name.length > 100) {
      await ctx.reply({ content: "Provide a valid channel name (maximum 100 characters)." });
      return;
    }

    try {
      await channel.setName(name);
      await ctx.reply({ content: `Channel renamed to **${name}**.` });
    } catch (error) {
      await ctx.reply({ content: "I couldn't rename this channel. Check my Manage Channels permission." });
    }
  }
});

registerCommand({
  name: "topic",
  description: "Set the topic of the current text channel.",
  category: "Moderation",
  options: [
    { name: "text", description: "New channel topic", type: "string", required: true }
  ],
  slash: true,
  execute: async (ctx, args) => {
    if (!(await requireModerator(ctx, PermissionsBitField.Flags.ManageChannels))) return;

    const channel = ctx.channel;
    const topic = (
      ctx.isInteraction ? ctx.getString("text") : args.join(" ")
    ).trim();

    if (!channel || !channel.isTextBased() || !channel.setTopic) {
      await ctx.reply({ content: "Use this command in a text channel that supports topics." });
      return;
    }

    if (topic.length > 1024) {
      await ctx.reply({ content: "The topic must be 1024 characters or fewer." });
      return;
    }

    try {
      await channel.setTopic(topic);
      await ctx.reply({ content: "Channel topic updated." });
    } catch (error) {
      await ctx.reply({ content: "I couldn't update the topic. Check my Manage Channels permission." });
    }
  }
});

// ==========================================
// END OF PART 5M
// Append Part 5N below this line.
// ==========================================// ==========================================
// PART 5N — MODERATION & MESSAGE UTILITIES
// ==========================================

registerCommand({
  name: "unwarn",
  description: "Remove a warning from a member.",
  category: "Moderation",
  options: [
    { name: "user", description: "Member to edit", type: "user", required: true },
    { name: "index", description: "Warning number to remove", type: "integer", required: true }
  ],
  slash: true,
  execute: async (ctx, args) => {
    if (!(await requireModerator(ctx, PermissionsBitField.Flags.ModerateMembers))) return;

    const member = await getTargetMember(ctx, args, "user");
    const index = ctx.isInteraction
      ? ctx.getInteger("index")
      : Number(args[1]);

    if (!member) {
      await ctx.reply({ content: "Member not found." });
      return;
    }

    const cfg = getConfig(ctx.guild.id);
    cfg.warnings = cfg.warnings || {};
    cfg.warnings[member.id] = cfg.warnings[member.id] || [];

    if (!Number.isInteger(index) || index < 1 || index > cfg.warnings[member.id].length) {
      await ctx.reply({ content: "Invalid warning number. Check `,warnings @user` first." });
      return;
    }

    const removed = cfg.warnings[member.id].splice(index - 1, 1)[0];
    saveDatabase();

    await ctx.reply({
      embeds: [makeEmbed(
        "Warning Removed",
        `Removed warning **#${index}** from ${member.user.tag}.\n**Reason:** ${removed.reason || "No reason recorded"}`
      )]
    });
  }
});

registerCommand({
  name: "lockdown",
  description: "Lock the current channel for regular members.",
  category: "Moderation",
  slash: true,
  execute: async (ctx) => {
    if (!(await requireModerator(ctx, PermissionsBitField.Flags.ManageChannels))) return;

    const channel = ctx.channel;

    if (!channel || !channel.permissionOverwrites) {
      await ctx.reply({ content: "Use this command in a server channel." });
      return;
    }

    try {
      await channel.permissionOverwrites.edit(ctx.guild.roles.everyone, {
        SendMessages: false
      });

      await ctx.reply({
        embeds: [makeEmbed("Channel Lockdown", `${channel} is now locked for regular members.`)]
      });
    } catch (error) {
      await ctx.reply({ content: "Couldn't lock this channel. Check my Manage Channels permission." });
    }
  }
});

registerCommand({
  name: "unlockdown",
  description: "Restore the default send-message permission in this channel.",
  category: "Moderation",
  aliases: ["unlockall"],
  slash: true,
  execute: async (ctx) => {
    if (!(await requireModerator(ctx, PermissionsBitField.Flags.ManageChannels))) return;

    const channel = ctx.channel;

    if (!channel || !channel.permissionOverwrites) {
      await ctx.reply({ content: "Use this command in a server channel." });
      return;
    }

    try {
      await channel.permissionOverwrites.edit(ctx.guild.roles.everyone, {
        SendMessages: null
      });

      await ctx.reply({
        embeds: [makeEmbed("Channel Unlocked", `${channel} now uses its inherited send-message permission.`)]
      });
    } catch (error) {
      await ctx.reply({ content: "Couldn't unlock this channel. Check my Manage Channels permission." });
    }
  }
});

registerCommand({
  name: "addrole",
  description: "Create a new role in the server.",
  category: "Moderation",
  options: [
    { name: "name", description: "Name of the new role", type: "string", required: true }
  ],
  slash: true,
  execute: async (ctx, args) => {
    if (!(await requireModerator(ctx, PermissionsBitField.Flags.ManageRoles))) return;

    const name = (
      ctx.isInteraction ? ctx.getString("name") : args.join(" ")
    ).trim();

    if (!name || name.length > 100) {
      await ctx.reply({ content: "Enter a role name between 1 and 100 characters." });
      return;
    }

    try {
      const role = await ctx.guild.roles.create({
        name,
        reason: `Created by ${ctx.user.tag}`
      });

      await ctx.reply({ content: `Created role ${role} (\`${role.id}\`).` });
    } catch (error) {
      await ctx.reply({ content: "Couldn't create the role. Check my Manage Roles permission and role hierarchy." });
    }
  }
});

registerCommand({
  name: "deleterole",
  description: "Delete a role by selecting it.",
  category: "Moderation",
  options: [
    { name: "role", description: "Role to delete", type: "role", required: true }
  ],
  slash: true,
  execute: async (ctx, args) => {
    if (!(await requireModerator(ctx, PermissionsBitField.Flags.ManageRoles))) return;

    let role = ctx.isInteraction ? ctx.getRole("role") : null;

    if (!role && args[0]) {
      const roleId = args[0].replace(/[<@&>]/g, "");
      role = ctx.guild.roles.cache.get(roleId) ||
        ctx.guild.roles.cache.find(r => r.name.toLowerCase() === args.join(" ").toLowerCase());
    }

    if (!role) {
      await ctx.reply({ content: "Role not found. Mention the role or provide its ID." });
      return;
    }

    if (role.id === ctx.guild.id || role.managed || role.position >= ctx.guild.members.me.roles.highest.position) {
      await ctx.reply({ content: "I can't delete the everyone, managed, or higher/equal role." });
      return;
    }

    try {
      const roleName = role.name;
      await role.delete(`Deleted by ${ctx.user.tag}`);
      await ctx.reply({ content: `Deleted role **${roleName}**.` });
    } catch (error) {
      await ctx.reply({ content: "Couldn't delete that role. Check my Manage Roles permission." });
    }
  }
});

registerCommand({
  name: "rolecolor",
  description: "Change a role's color using a hex code.",
  category: "Moderation",
  options: [
    { name: "role", description: "Role to recolor", type: "role", required: true },
    { name: "hex", description: "Hex color, such as #FF0000", type: "string", required: true }
  ],
  slash: true,
  execute: async (ctx, args) => {
    if (!(await requireModerator(ctx, PermissionsBitField.Flags.ManageRoles))) return;

    let role = ctx.isInteraction ? ctx.getRole("role") : null;
    let hex = ctx.isInteraction ? ctx.getString("hex") : args[1];

    if (!role && args[0]) {
      const roleId = args[0].replace(/[<@&>]/g, "");
      role = ctx.guild.roles.cache.get(roleId);
    }

    if (!role) {
      await ctx.reply({ content: "Role not found. Mention the role or provide its ID." });
      return;
    }

    hex = String(hex || "").trim().replace(/^#/, "");

    if (!/^[0-9a-fA-F]{6}$/.test(hex)) {
      await ctx.reply({ content: "Invalid color. Use a six-digit hex code, such as `#FF0000`." });
      return;
    }

    if (role.managed || role.position >= ctx.guild.members.me.roles.highest.position) {
      await ctx.reply({ content: "I can't edit that role because of role hierarchy or integration restrictions." });
      return;
    }

    try {
      await role.setColor(parseInt(hex, 16), `Color changed by ${ctx.user.tag}`);
      await ctx.reply({ content: `Changed **${role.name}** to \`#${hex.toUpperCase()}\`.` });
    } catch (error) {
      await ctx.reply({ content: "Couldn't change the role color. Check my Manage Roles permission." });
    }
  }
});

registerCommand({
  name: "messageid",
  description: "Show the ID of a message you reply to.",
  category: "Utility",
  aliases: ["msgid"],
  slash: false,
  execute: async (ctx) => {
    const message = ctx.source;

    if (!message.reference || !message.reference.messageId) {
      await ctx.reply({ content: "Reply to a message with `,messageid` to get its ID." });
      return;
    }

    await ctx.reply({
      content: `Message ID: \`${message.reference.messageId}\``
    });
  }
});

registerCommand({
  name: "serverid",
  description: "Show this server's ID.",
  category: "Utility",
  slash: true,
  execute: async (ctx) => {
    if (!ctx.guild) {
      await ctx.reply({ content: "This command only works in a server." });
      return;
    }

    await ctx.reply({
      content: `Server ID: \`${ctx.guild.id}\``
    });
  }
});

// ==========================================
// END OF PART 5N
// Append Part 5O below this line.
// ==========================================// ==========================================
// PART 5O — CONFIGURATION & SERVER TOOLS
// ==========================================

registerCommand({
  name: "setlogs",
  description: "Set the server moderation log channel.",
  category: "Configuration",
  options: [
    { name: "channel", description: "Channel for logs", type: "channel", required: true }
  ],
  slash: true,
  execute: async (ctx, args) => {
    if (!(await requireManageGuild(ctx))) return;

    let channel = ctx.isInteraction ? ctx.getChannel("channel") : null;

    if (!channel && args[0]) {
      channel = ctx.guild.channels.cache.get(args[0].replace(/[<#>]/g, ""));
    }

    if (!channel || !channel.isTextBased()) {
      await ctx.reply({ content: "Choose a valid text channel." });
      return;
    }

    const cfg = getConfig(ctx.guild.id);
    cfg.logs = cfg.logs || {};
    cfg.logs.channelId = channel.id;
    saveDatabase();

    await ctx.reply({ content: `Server log channel set to ${channel}.` });
  }
});

registerCommand({
  name: "showconfig",
  description: "Show the current server bot configuration.",
  category: "Configuration",
  slash: true,
  execute: async (ctx) => {
    if (!(await requireManageGuild(ctx))) return;

    const cfg = getConfig(ctx.guild.id);

    await ctx.reply({
      embeds: [makeEmbed(
        "Server Configuration",
        [
          `**Prefix:** \`${cfg.prefix || DEFAULT_PREFIX}\``,
          `**Welcome:** ${cfg.welcome?.enabled ? "Enabled" : "Disabled"}`,
          `**Leave messages:** ${cfg.leave?.enabled ? "Enabled" : "Disabled"}`,
          `**Log channel:** ${cfg.logs?.channelId ? `<#${cfg.logs.channelId}>` : "Not set"}`,
          `**AntiNuke:** ${cfg.antinuke?.enabled ? "Enabled" : "Disabled"}`,
          `**AntiRaid:** ${cfg.antiraid?.enabled ? "Enabled" : "Disabled"}`,
          `**AutoMod:** ${cfg.automod?.enabled ? "Enabled" : "Disabled"}`
        ].join("\n")
      )]
    });
  }
});

registerCommand({
  name: "disablecommand",
  description: "Disable a bot command in this server.",
  category: "Configuration",
  options: [
    { name: "command", description: "Command name to disable", type: "string", required: true }
  ],
  slash: true,
  execute: async (ctx, args) => {
    if (!(await requireManageGuild(ctx))) return;

    const name = (
      ctx.isInteraction ? ctx.getString("command") : args[0]
    ).toLowerCase().replace(/^,/, "");

    const command = commands.get(name);

    if (!command) {
      await ctx.reply({ content: "That command doesn't exist." });
      return;
    }

    const cfg = getConfig(ctx.guild.id);
    cfg.disabledCommands = cfg.disabledCommands || [];

    if (!cfg.disabledCommands.includes(command.name)) {
      cfg.disabledCommands.push(command.name);
      saveDatabase();
    }

    await ctx.reply({ content: `Disabled \`${command.name}\` in this server.` });
  }
});

registerCommand({
  name: "enablecommand",
  description: "Re-enable a disabled bot command.",
  category: "Configuration",
  options: [
    { name: "command", description: "Command name to enable", type: "string", required: true }
  ],
  slash: true,
  execute: async (ctx, args) => {
    if (!(await requireManageGuild(ctx))) return;

    const name = (
      ctx.isInteraction ? ctx.getString("command") : args[0]
    ).toLowerCase().replace(/^,/, "");

    const command = commands.get(name);

    if (!command) {
      await ctx.reply({ content: "That command doesn't exist." });
      return;
    }

    const cfg = getConfig(ctx.guild.id);
    cfg.disabledCommands = cfg.disabledCommands || [];
    cfg.disabledCommands = cfg.disabledCommands.filter(item => item !== command.name);
    saveDatabase();

    await ctx.reply({ content: `Enabled \`${command.name}\` in this server.` });
  }
});

registerCommand({
  name: "resetconfig",
  description: "Reset the bot configuration for this server.",
  category: "Configuration",
  slash: true,
  execute: async (ctx) => {
    if (!(await requireGuildOwner(ctx))) return;

    const cfg = getConfig(ctx.guild.id);
    const fresh = defaultGuildConfig();

    Object.keys(cfg).forEach(key => delete cfg[key]);
    Object.assign(cfg, fresh);
    saveDatabase();

    await ctx.reply({
      embeds: [makeEmbed(
        "Configuration Reset",
        "The server configuration has been reset to its defaults."
      )]
    });
  }
});

registerCommand({
  name: "setprefix",
  description: "Change the bot's prefix for this server.",
  category: "Configuration",
  options: [
    { name: "prefix", description: "New prefix, 1–5 characters", type: "string", required: true }
  ],
  slash: true,
  execute: async (ctx, args) => {
    if (!(await requireManageGuild(ctx))) return;

    const prefix = (
      ctx.isInteraction ? ctx.getString("prefix") : args[0]
    ).trim();

    if (!prefix || prefix.length > 5 || /\s/.test(prefix)) {
      await ctx.reply({ content: "Prefix must be 1–5 characters with no spaces." });
      return;
    }

    const cfg = getConfig(ctx.guild.id);
    cfg.prefix = prefix;
    saveDatabase();

    await ctx.reply({ content: `Prefix changed to \`${prefix}\`.` });
  }
});

registerCommand({
  name: "setnickname",
  description: "Set the bot's nickname in this server.",
  category: "Configuration",
  options: [
    { name: "nickname", description: "New nickname", type: "string", required: true }
  ],
  slash: true,
  execute: async (ctx, args) => {
    if (!(await requireManageGuild(ctx))) return;

    const nickname = (
      ctx.isInteraction ? ctx.getString("nickname") : args.join(" ")
    ).trim();

    if (!nickname || nickname.length > 32) {
      await ctx.reply({ content: "Nickname must be between 1 and 32 characters." });
      return;
    }

    const botMember = ctx.guild.members.me;

    if (!botMember) {
      await ctx.reply({ content: "Couldn't find the bot's server member." });
      return;
    }

    try {
      await botMember.setNickname(nickname, `Nickname changed by ${ctx.user.tag}`);
      await ctx.reply({ content: `Bot nickname changed to **${nickname}**.` });
    } catch (error) {
      await ctx.reply({ content: "Couldn't change my nickname. Check my permissions." });
    }
  }
});

registerCommand({
  name: "resetnickname",
  description: "Reset the bot's server nickname.",
  category: "Configuration",
  slash: true,
  execute: async (ctx) => {
    if (!(await requireManageGuild(ctx))) return;

    try {
      await ctx.guild.members.me.setNickname(null, `Nickname reset by ${ctx.user.tag}`);
      await ctx.reply({ content: "Bot nickname reset." });
    } catch (error) {
      await ctx.reply({ content: "Couldn't reset my nickname. Check my permissions." });
    }
  }
});

// ==========================================
// END OF PART 5O
// Append Part 5P below this line.
// ==========================================// ==========================================
// PART 5P — ECONOMY COMMANDS
// ==========================================

function getEconomyUser(userId) {
  database.users = database.users || {};

  if (!database.users[userId]) {
    database.users[userId] = {
      wallet: 0,
      bank: 0,
      lastDaily: 0,
      lastWork: 0
    };
  }

  const user = database.users[userId];

  user.wallet = Math.max(0, Number(user.wallet) || 0);
  user.bank = Math.max(0, Number(user.bank) || 0);
  user.lastDaily = Number(user.lastDaily) || 0;
  user.lastWork = Number(user.lastWork) || 0;

  return user;
}

function formatCoins(amount) {
  return `${Math.floor(Number(amount) || 0).toLocaleString("en-US")} coins`;
}

registerCommand({
  name: "balance",
  description: "Check your wallet and bank balance.",
  category: "Economy",
  aliases: ["bal", "money"],
  options: [
    { name: "user", description: "Member whose balance to check", type: "user", required: false }
  ],
  slash: true,
  execute: async (ctx, args) => {
    let target = ctx.isInteraction
      ? ctx.getUser("user")
      : ctx.source.mentions.users.first();

    if (!target && !ctx.isInteraction && args[0]) {
      target = await client.users.fetch(args[0]).catch(() => null);
    }

    if (!target) target = ctx.user;

    const account = getEconomyUser(target.id);

    await ctx.reply({
      embeds: [makeEmbed(
        `💰 ${target.username}'s Balance`,
        `**Wallet:** ${formatCoins(account.wallet)}\n**Bank:** ${formatCoins(account.bank)}\n**Total:** ${formatCoins(account.wallet + account.bank)}`
      )]
    });
  }
});

registerCommand({
  name: "daily",
  description: "Claim your daily coins.",
  category: "Economy",
  slash: true,
  execute: async (ctx) => {
    const account = getEconomyUser(ctx.user.id);
    const now = Date.now();
    const cooldown = 24 * 60 * 60 * 1000;
    const remaining = cooldown - (now - account.lastDaily);

    if (remaining > 0) {
      const hours = Math.floor(remaining / 3600000);
      const minutes = Math.floor((remaining % 3600000) / 60000);

      await ctx.reply({
        content: `You already claimed your daily reward. Try again in **${hours}h ${minutes}m**.`
      });
      return;
    }

    const reward = 500;
    account.wallet += reward;
    account.lastDaily = now;
    saveDatabase();

    await ctx.reply({
      embeds: [makeEmbed(
        "🎁 Daily Reward",
        `You received **${formatCoins(reward)}**!\n**Wallet balance:** ${formatCoins(account.wallet)}`
      )]
    });
  }
});

registerCommand({
  name: "work",
  description: "Work to earn coins.",
  category: "Economy",
  slash: true,
  execute: async (ctx) => {
    const account = getEconomyUser(ctx.user.id);
    const now = Date.now();
    const cooldown = 60 * 60 * 1000;
    const remaining = cooldown - (now - account.lastWork);

    if (remaining > 0) {
      const minutes = Math.ceil(remaining / 60000);

      await ctx.reply({
        content: `You're tired from working. Try again in **${minutes} minutes**.`
      });
      return;
    }

    const jobs = [
      "helped a local shop",
      "completed a delivery",
      "designed a server banner",
      "fixed a computer",
      "organized a community event",
      "completed a freelance task"
    ];

    const job = jobs[Math.floor(Math.random() * jobs.length)];
    const reward = Math.floor(Math.random() * 201) + 100;

    account.wallet += reward;
    account.lastWork = now;
    saveDatabase();

    await ctx.reply({
      embeds: [makeEmbed(
        "💼 Work Completed",
        `You ${job} and earned **${formatCoins(reward)}**!\n**Wallet balance:** ${formatCoins(account.wallet)}`
      )]
    });
  }
});

registerCommand({
  name: "deposit",
  description: "Deposit coins from your wallet into your bank.",
  category: "Economy",
  aliases: ["dep"],
  options: [
    { name: "amount", description: "Amount to deposit, or all", type: "string", required: true }
  ],
  slash: true,
  execute: async (ctx, args) => {
    const account = getEconomyUser(ctx.user.id);
    const raw = (
      ctx.isInteraction ? ctx.getString("amount") : args[0]
    ).toLowerCase();

    const amount = raw === "all" ? account.wallet : Number(raw);

    if (!Number.isSafeInteger(amount) || amount <= 0) {
      await ctx.reply({ content: "Enter a positive whole number or `all`." });
      return;
    }

    if (amount > account.wallet) {
      await ctx.reply({ content: "You don't have enough coins in your wallet." });
      return;
    }

    account.wallet -= amount;
    account.bank += amount;
    saveDatabase();

    await ctx.reply({
      embeds: [makeEmbed(
        "🏦 Deposit Complete",
        `Deposited **${formatCoins(amount)}**.\n**Wallet:** ${formatCoins(account.wallet)}\n**Bank:** ${formatCoins(account.bank)}`
      )]
    });
  }
});

registerCommand({
  name: "withdraw",
  description: "Withdraw coins from your bank into your wallet.",
  category: "Economy",
  aliases: ["with"],
  options: [
    { name: "amount", description: "Amount to withdraw, or all", type: "string", required: true }
  ],
  slash: true,
  execute: async (ctx, args) => {
    const account = getEconomyUser(ctx.user.id);
    const raw = (
      ctx.isInteraction ? ctx.getString("amount") : args[0]
    ).toLowerCase();

    const amount = raw === "all" ? account.bank : Number(raw);

    if (!Number.isSafeInteger(amount) || amount <= 0) {
      await ctx.reply({ content: "Enter a positive whole number or `all`." });
      return;
    }

    if (amount > account.bank) {
      await ctx.reply({ content: "You don't have enough coins in your bank." });
      return;
    }

    account.bank -= amount;
    account.wallet += amount;
    saveDatabase();

    await ctx.reply({
      embeds: [makeEmbed(
        "🏧 Withdrawal Complete",
        `Withdrew **${formatCoins(amount)}**.\n**Wallet:** ${formatCoins(account.wallet)}\n**Bank:** ${formatCoins(account.bank)}`
      )]
    });
  }
});

registerCommand({
  name: "leaderboard",
  description: "Show the richest users in the economy.",
  category: "Economy",
  aliases: ["lb", "richest"],
  slash: true,
  execute: async (ctx) => {
    const users = Object.entries(database.users || {})
      .map(([id, data]) => ({
        id,
        wallet: Math.max(0, Number(data.wallet) || 0),
        bank: Math.max(0, Number(data.bank) || 0)
      }))
      .sort((a, b) => (b.wallet + b.bank) - (a.wallet + a.bank))
      .slice(0, 10);

    if (!users.length) {
      await ctx.reply({ content: "No economy accounts exist yet. Use `,daily` to start." });
      return;
    }

    const lines = await Promise.all(users.map(async (user, index) => {
      const accountUser = await client.users.fetch(user.id).catch(() => null);
      const name = accountUser ? accountUser.username : `User ${user.id}`;

      return `**${index + 1}.** ${name} — ${formatCoins(user.wallet + user.bank)}`;
    }));

    await ctx.reply({
      embeds: [makeEmbed("🏆 Economy Leaderboard", lines.join("\n"))]
    });
  }
});

// ==========================================
// END OF PART 5P
// Append Part 5Q below this line.
// ==========================================// ==========================================
// PART 5Q — ECONOMY & FUN COMMANDS
// ==========================================

registerCommand({
  name: "beg",
  description: "Try your luck and ask for some coins.",
  category: "Economy",
  slash: true,
  execute: async (ctx) => {
    const account = getEconomyUser(ctx.user.id);
    const success = Math.random() < 0.65;

    if (!success) {
      await ctx.reply({
        content: "Nobody gave you coins this time. Try again later!"
      });
      return;
    }

    const reward = Math.floor(Math.random() * 101) + 25;
    account.wallet += reward;
    saveDatabase();

    await ctx.reply({
      embeds: [makeEmbed(
        "🪙 Begging",
        `Someone gave you **${formatCoins(reward)}**!\n**Wallet:** ${formatCoins(account.wallet)}`
      )]
    });
  }
});

registerCommand({
  name: "crime",
  description: "Try a fictional crime scenario for coins or a fine.",
  category: "Economy",
  slash: true,
  execute: async (ctx) => {
    const account = getEconomyUser(ctx.user.id);
    const success = Math.random() < 0.45;

    if (success) {
      const reward = Math.floor(Math.random() * 301) + 100;
      account.wallet += reward;
      saveDatabase();

      await ctx.reply({
        embeds: [makeEmbed(
          "🎭 Fictional Crime Result",
          `Your fictional mission succeeded! You earned **${formatCoins(reward)}**.`
        )]
      });
      return;
    }

    const fine = Math.min(
      account.wallet,
      Math.floor(Math.random() * 151) + 50
    );

    account.wallet -= fine;
    saveDatabase();

    await ctx.reply({
      embeds: [makeEmbed(
        "🚔 Fictional Crime Result",
        `You got caught in the game and paid a **${formatCoins(fine)}** fine.`
      )]
    });
  }
});

registerCommand({
  name: "givecoins",
  description: "Give economy coins to another member.",
  category: "Economy",
  options: [
    { name: "user", description: "Member to receive coins", type: "user", required: true },
    { name: "amount", description: "Amount to transfer", type: "integer", required: true }
  ],
  slash: true,
  execute: async (ctx, args) => {
    let target = ctx.isInteraction
      ? ctx.getUser("user")
      : ctx.source.mentions.users.first();

    if (!target && args[0]) {
      target = await client.users.fetch(args[0]).catch(() => null);
    }

    const amount = ctx.isInteraction
      ? ctx.getInteger("amount")
      : Number(args[1]);

    if (!target) {
      await ctx.reply({ content: "Mention a valid user or provide their ID." });
      return;
    }

    if (target.bot || target.id === ctx.user.id) {
      await ctx.reply({ content: "You can't transfer coins to a bot or yourself." });
      return;
    }

    if (!Number.isSafeInteger(amount) || amount <= 0) {
      await ctx.reply({ content: "Enter a positive whole-number amount." });
      return;
    }

    const sender = getEconomyUser(ctx.user.id);

    if (sender.wallet < amount) {
      await ctx.reply({ content: "You don't have enough coins in your wallet." });
      return;
    }

    const receiver = getEconomyUser(target.id);

    sender.wallet -= amount;
    receiver.wallet += amount;
    saveDatabase();

    await ctx.reply({
      embeds: [makeEmbed(
        "💸 Transfer Complete",
        `${ctx.user.username} sent **${formatCoins(amount)}** to ${target.username}.`
      )]
    });
  }
});

registerCommand({
  name: "pay",
  description: "Pay another member using your wallet balance.",
  category: "Economy",
  aliases: ["sendcoins"],
  options: [
    { name: "user", description: "Member to pay", type: "user", required: true },
    { name: "amount", description: "Amount to pay", type: "integer", required: true }
  ],
  slash: true,
  execute: async (ctx, args) => {
    let target = ctx.isInteraction
      ? ctx.getUser("user")
      : ctx.source.mentions.users.first();

    if (!target && args[0]) {
      target = await client.users.fetch(args[0]).catch(() => null);
    }

    const amount = ctx.isInteraction
      ? ctx.getInteger("amount")
      : Number(args[1]);

    if (!target || target.bot || target.id === ctx.user.id) {
      await ctx.reply({ content: "Choose a different, valid user." });
      return;
    }

    if (!Number.isSafeInteger(amount) || amount <= 0) {
      await ctx.reply({ content: "Enter a positive whole-number amount." });
      return;
    }

    const sender = getEconomyUser(ctx.user.id);

    if (sender.wallet < amount) {
      await ctx.reply({ content: "Insufficient wallet balance." });
      return;
    }

    const receiver = getEconomyUser(target.id);

    sender.wallet -= amount;
    receiver.wallet += amount;
    saveDatabase();

    await ctx.reply({
      content: `💸 ${ctx.user.username} paid **${formatCoins(amount)}** to ${target.username}.`
    });
  }
});

registerCommand({
  name: "slots",
  description: "Play a fictional slot machine using coins.",
  category: "Economy",
  options: [
    { name: "bet", description: "Amount to bet", type: "integer", required: true }
  ],
  slash: true,
  execute: async (ctx, args) => {
    const account = getEconomyUser(ctx.user.id);
    const bet = ctx.isInteraction
      ? ctx.getInteger("bet")
      : Number(args[0]);

    if (!Number.isSafeInteger(bet) || bet <= 0 || bet > account.wallet) {
      await ctx.reply({ content: "Enter a valid bet within your wallet balance." });
      return;
    }

    const symbols = ["🍒", "🍋", "🍇", "⭐", "🔔", "🍀"];
    const result = Array.from(
      { length: 3 },
      () => symbols[Math.floor(Math.random() * symbols.length)]
    );

    let multiplier = 0;

    if (result[0] === result[1] && result[1] === result[2]) {
      multiplier = 3;
    } else if (
      result[0] === result[1] ||
      result[1] === result[2] ||
      result[0] === result[2]
    ) {
      multiplier = 1;
    }

    account.wallet -= bet;
    const winnings = bet * multiplier;
    account.wallet += winnings;
    saveDatabase();

    await ctx.reply({
      embeds: [makeEmbed(
        "🎰 Slot Machine",
        `${result.join(" | ")}\n\n` +
        (multiplier === 3
          ? `Jackpot! You received **${formatCoins(winnings)}**.`
          : multiplier === 1
            ? `Two symbols matched! You received **${formatCoins(winnings)}**.`
            : `No match this time. You lost **${formatCoins(bet)}**.`) +
        `\n**Wallet:** ${formatCoins(account.wallet)}`
      )]
    });
  }
});

registerCommand({
  name: "rob",
  description: "Attempt a fictional coin robbery from another member.",
  category: "Economy",
  options: [
    { name: "user", description: "Target member", type: "user", required: true }
  ],
  slash: true,
  execute: async (ctx, args) => {
    let target = ctx.isInteraction
      ? ctx.getUser("user")
      : ctx.source.mentions.users.first();

    if (!target && args[0]) {
      target = await client.users.fetch(args[0]).catch(() => null);
    }

    if (!target || target.bot || target.id === ctx.user.id) {
      await ctx.reply({ content: "Choose a different, valid user." });
      return;
    }

    const robber = getEconomyUser(ctx.user.id);
    const victim = getEconomyUser(target.id);

    if (victim.wallet < 100) {
      await ctx.reply({ content: "That user doesn't have enough wallet coins to rob." });
      return;
    }

    if (Math.random() < 0.4) {
      const stolen = Math.min(
        victim.wallet,
        Math.floor(Math.random() * 201) + 50
      );

      victim.wallet -= stolen;
      robber.wallet += stolen;
      saveDatabase();

      await ctx.reply({
        content: `🎭 Your fictional robbery succeeded! You got **${formatCoins(stolen)}** from ${target.username}.`
      });
    } else {
      const fine = Math.min(
        robber.wallet,
        Math.floor(Math.random() * 151) + 25
      );

      robber.wallet -= fine;
      saveDatabase();

      await ctx.reply({
        content: `🚨 You got caught in the game and paid **${formatCoins(fine)}**.`
      });
    }
  }
});

// ==========================================
// END OF PART 5Q
// Append Part 5R below this line.
// ==========================================// ==========================================
// PART 5R — FUN & PROFILE COMMANDS
// ==========================================

registerCommand({
  name: "meme",
  description: "Show a random text meme.",
  category: "Fun",
  slash: true,
  execute: async (ctx) => {
    const memes = [
      "Me: I'll sleep early tonight. Also me at 3 AM: one more video.",
      "My code works. I don't know why. I'm not touching it.",
      "Discord status: online. Motivation: offline.",
      "When the bot finally works after 47 errors: legendary.",
      "I came, I saw, I forgot why I came.",
      "99 problems and the missing bracket is all of them.",
      "My Wi-Fi has two moods: fast and prehistoric.",
      "I need a break from my break.",
      "Loading... please wait. My brain is buffering.",
      "The plan was simple. Then I opened the settings."
    ];

    await ctx.reply({
      embeds: [makeEmbed(
        "😂 Random Meme",
        memes[Math.floor(Math.random() * memes.length)]
      )]
    });
  }
});

registerCommand({
  name: "fact",
  description: "Share a random general-interest fact.",
  category: "Fun",
  slash: true,
  execute: async (ctx) => {
    const facts = [
      "Octopuses have three hearts.",
      "A group of flamingos is called a flamboyance.",
      "Honey can remain stable for a very long time when properly stored.",
      "The Moon moves away from Earth by a few centimeters each year.",
      "Bananas are botanically berries, while strawberries are not true berries.",
      "Some turtles can breathe through specialized tissues near their tails.",
      "Lightning can heat the surrounding air to temperatures hotter than the Sun's surface.",
      "Sharks existed before trees.",
      "A day on Venus is longer than its year.",
      "Butterflies taste using sensors on their feet."
    ];

    await ctx.reply({
      embeds: [makeEmbed(
        "🧠 Random Fact",
        facts[Math.floor(Math.random() * facts.length)]
      )]
    });
  }
});

registerCommand({
  name: "joke",
  description: "Tell a random clean joke.",
  category: "Fun",
  slash: true,
  execute: async (ctx) => {
    const jokes = [
      ["Why do programmers prefer dark mode?", "Because light attracts bugs."],
      ["Why did the computer go to the doctor?", "It caught a virus."],
      ["Why was the math book sad?", "It had too many problems."],
      ["What do you call a sleeping bull?", "A bulldozer."],
      ["Why did the developer bring a ladder?", "To reach the high-level code."],
      ["What is a computer's favorite snack?", "Microchips."],
      ["Why don't skeletons fight each other?", "They don't have the guts."],
      ["Why did the phone wear glasses?", "It lost its contacts."],
      ["What did the zero say to the eight?", "Nice belt!"],
      ["Why was the calendar nervous?", "Its days were numbered."]
    ];

    const joke = jokes[Math.floor(Math.random() * jokes.length)];

    await ctx.reply({
      embeds: [makeEmbed("😄 Random Joke", `**${joke[0]}**\n${joke[1]}`)]
    });
  }
});

registerCommand({
  name: "riddle",
  description: "Get a random riddle.",
  category: "Fun",
  slash: true,
  execute: async (ctx) => {
    const riddles = [
      ["What has keys but cannot open locks?", "A piano."],
      ["What gets wetter as it dries?", "A towel."],
      ["What has a face and two hands but no arms or legs?", "A clock."],
      ["What has many teeth but cannot bite?", "A comb."],
      ["What can travel around the world while staying in one corner?", "A stamp."],
      ["What has one eye but cannot see?", "A needle."],
      ["What goes up but never comes down?", "Your age."],
      ["What has cities but no houses, forests but no trees, and rivers but no water?", "A map."]
    ];

    const item = riddles[Math.floor(Math.random() * riddles.length)];

    await ctx.reply({
      embeds: [makeEmbed(
        "🧩 Riddle",
        `**${item[0]}**\n\n||${item[1]}||`
      )]
    });
  }
});

registerCommand({
  name: "roast",
  description: "Generate a lighthearted roast.",
  category: "Fun",
  options: [
    { name: "user", description: "Member to roast", type: "user", required: false }
  ],
  slash: true,
  execute: async (ctx, args) => {
    let target = ctx.isInteraction
      ? ctx.getUser("user")
      : ctx.source.mentions.users.first();

    if (!target && args[0]) {
      target = await client.users.fetch(args[0]).catch(() => null);
    }

    if (!target) target = ctx.user;

    const roasts = [
      "Your Wi-Fi signal has more stability than your plans.",
      "You're the human version of a loading screen.",
      "Your comeback is still downloading.",
      "Even your autocorrect gave up trying to understand you.",
      "Your alarm clock has trust issues with you.",
      "You bring everyone together when the group chat needs a funny moment.",
      "Your browser has 47 tabs open and none of them are helping.",
      "Your keyboard deserves a vacation after those messages.",
      "Your plans have more plot twists than a TV series.",
      "You're proof that even the tutorial level can be challenging."
    ];

    await ctx.reply({
      embeds: [makeEmbed(
        "🔥 Friendly Roast",
        `${target.username}: ${roasts[Math.floor(Math.random() * roasts.length)]}`
      )]
    });
  }
});

registerCommand({
  name: "complimentuser",
  description: "Send a friendly compliment to a member.",
  category: "Fun",
  options: [
    { name: "user", description: "Member to compliment", type: "user", required: true }
  ],
  slash: true,
  execute: async (ctx, args) => {
    let target = ctx.isInteraction
      ? ctx.getUser("user")
      : ctx.source.mentions.users.first();

    if (!target && args[0]) {
      target = await client.users.fetch(args[0]).catch(() => null);
    }

    if (!target) {
      await ctx.reply({ content: "Mention a valid user or provide their ID." });
      return;
    }

    const compliments = [
      "You bring good energy to the community.",
      "Your creativity stands out.",
      "You make conversations more interesting.",
      "Your effort doesn't go unnoticed.",
      "You have a great sense of humor.",
      "You deserve credit for the progress you've made.",
      "You make this server a more welcoming place.",
      "Keep being yourself. Your individuality matters."
    ];

    await ctx.reply({
      content: `✨ ${target}, ${compliments[Math.floor(Math.random() * compliments.length)]}`
    });
  }
});

registerCommand({
  name: "profile",
  description: "Show a simple Discord profile summary.",
  category: "Utility",
  options: [
    { name: "user", description: "User to view", type: "user", required: false }
  ],
  slash: true,
  execute: async (ctx, args) => {
    let target = ctx.isInteraction
      ? ctx.getUser("user")
      : ctx.source.mentions.users.first();

    if (!target && args[0]) {
      target = await client.users.fetch(args[0]).catch(() => null);
    }

    if (!target) target = ctx.user;

    const account = getEconomyUser(target.id);
    const created = Math.floor(target.createdTimestamp / 1000);

    let member = null;

    if (ctx.guild) {
      member = await ctx.guild.members.fetch(target.id).catch(() => null);
    }

    const lines = [
      `**Username:** ${target.tag}`,
      `**User ID:** \`${target.id}\``,
      `**Account created:** <t:${created}:D>`,
      `**Server nickname:** ${member?.nickname || "None"}`,
      `**Wallet:** ${formatCoins(account.wallet)}`,
      `**Bank:** ${formatCoins(account.bank)}`
    ];

    await ctx.reply({
      embeds: [makeEmbed(`👤 ${target.username}'s Profile`, lines.join("\n"))]
    });
  }
});

registerCommand({
  name: "suggest",
  description: "Submit a suggestion to the current channel.",
  category: "Utility",
  options: [
    { name: "idea", description: "Your suggestion", type: "string", required: true }
  ],
  slash: true,
  execute: async (ctx, args) => {
    if (!ctx.guild) {
      await ctx.reply({ content: "Use this command inside a server." });
      return;
    }

    const idea = (
      ctx.isInteraction ? ctx.getString("idea") : args.join(" ")
    ).trim();

    if (!idea || idea.length > 1500) {
      await ctx.reply({ content: "Your suggestion must be between 1 and 1500 characters." });
      return;
    }

    await ctx.reply({
      embeds: [makeEmbed(
        "💡 New Suggestion",
        `**From:** ${ctx.user.tag}\n\n${idea}`
      )]
    });
  }
});

registerCommand({
  name: "feedback",
  description: "Send feedback about the bot.",
  category: "Utility",
  options: [
    { name: "message", description: "Your feedback", type: "string", required: true }
  ],
  slash: true,
  execute: async (ctx, args) => {
    const feedback = (
      ctx.isInteraction ? ctx.getString("message") : args.join(" ")
    ).trim();

    if (!feedback || feedback.length > 1500) {
      await ctx.reply({ content: "Feedback must be between 1 and 1500 characters." });
      return;
    }

    await ctx.reply({
      embeds: [makeEmbed(
        "📨 Feedback Received",
        `Thanks for your feedback, ${ctx.user.username}!\n\nYour message:\n${feedback}`
      )]
    });
  }
});

// ==========================================
// END OF PART 5R
// Append Part 5S below this line.
// ==========================================// ==========================================
// PART 5S — GIVEAWAY & POLL TOOLS
// ==========================================

const activeGiveaways = new Map();

registerCommand({
  name: "giveaway",
  description: "Start a simple reaction-based giveaway.",
  category: "Giveaway",
  options: [
    { name: "minutes", description: "Duration in minutes", type: "integer", required: true },
    { name: "prize", description: "Giveaway prize", type: "string", required: true }
  ],
  slash: true,
  execute: async (ctx, args) => {
    if (!(await requireModerator(ctx, PermissionsBitField.Flags.ManageGuild))) return;

    const minutes = ctx.isInteraction
      ? ctx.getInteger("minutes")
      : Number(args[0]);

    const prize = (
      ctx.isInteraction ? ctx.getString("prize") : args.slice(1).join(" ")
    ).trim();

    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 10080) {
      await ctx.reply({ content: "Duration must be between 1 and 10080 minutes." });
      return;
    }

    if (!prize || prize.length > 200) {
      await ctx.reply({ content: "Enter a prize name (maximum 200 characters)." });
      return;
    }

    const endAt = Date.now() + minutes * 60000;

    const message = await ctx.channel.send({
      embeds: [makeEmbed(
        "🎉 GIVEAWAY",
        `**Prize:** ${prize}\n**Hosted by:** ${ctx.user}\n**Ends:** <t:${Math.floor(endAt / 1000)}:R>\n\nReact with 🎉 to enter!`
      )]
    });

    await message.react("🎉");

    activeGiveaways.set(message.id, {
      guildId: ctx.guild.id,
      channelId: ctx.channel.id,
      prize,
      hostId: ctx.user.id,
      endAt
    });

    await ctx.reply({ content: `Giveaway created! [Jump to giveaway](${message.url})` });

    setTimeout(async () => {
      try {
        const giveaway = activeGiveaways.get(message.id);
        if (!giveaway) return;

        const channel = await client.channels.fetch(giveaway.channelId).catch(() => null);
        const giveawayMessage = channel
          ? await channel.messages.fetch(message.id).catch(() => null)
          : null;

        if (!giveawayMessage) {
          activeGiveaways.delete(message.id);
          return;
        }

        const reaction = giveawayMessage.reactions.cache.get("🎉");
        const users = reaction
          ? await reaction.users.fetch().catch(() => null)
          : null;

        const entrants = users
          ? users.filter(user => !user.bot).map(user => user.id)
          : [];

        activeGiveaways.delete(message.id);

        if (!entrants.length) {
          await channel.send(`🎉 Giveaway ended for **${giveaway.prize}**, but nobody entered.`);
          return;
        }

        const winnerId = entrants[Math.floor(Math.random() * entrants.length)];

        await channel.send({
          content: `🎉 Congratulations <@${winnerId}>! You won **${giveaway.prize}**!`
        });
      } catch (error) {
        console.error("Giveaway ending error:", error);
      }
    }, minutes * 60000);
  }
});

registerCommand({
  name: "reroll",
  description: "Choose a new winner from a completed giveaway message.",
  category: "Giveaway",
  options: [
    { name: "messageid", description: "Giveaway message ID", type: "string", required: true }
  ],
  slash: true,
  execute: async (ctx, args) => {
    if (!(await requireModerator(ctx, PermissionsBitField.Flags.ManageGuild))) return;

    const messageId = (
      ctx.isInteraction ? ctx.getString("messageid") : args[0]
    ).trim();

    const message = await ctx.channel.messages.fetch(messageId).catch(() => null);

    if (!message) {
      await ctx.reply({ content: "I couldn't find that message in this channel." });
      return;
    }

    const reaction = message.reactions.cache.get("🎉");
    const users = reaction
      ? await reaction.users.fetch().catch(() => null)
      : null;

    const entrants = users
      ? users.filter(user => !user.bot).map(user => user.id)
      : [];

    if (!entrants.length) {
      await ctx.reply({ content: "No eligible giveaway entrants were found." });
      return;
    }

    const winnerId = entrants[Math.floor(Math.random() * entrants.length)];

    await ctx.reply({
      content: `🎉 New winner: <@${winnerId}>!`
    });
  }
});

registerCommand({
  name: "endgiveaway",
  description: "End an active giveaway early.",
  category: "Giveaway",
  options: [
    { name: "messageid", description: "Giveaway message ID", type: "string", required: true }
  ],
  slash: true,
  execute: async (ctx, args) => {
    if (!(await requireModerator(ctx, PermissionsBitField.Flags.ManageGuild))) return;

    const messageId = (
      ctx.isInteraction ? ctx.getString("messageid") : args[0]
    ).trim();

    const giveaway = activeGiveaways.get(messageId);

    if (!giveaway || giveaway.guildId !== ctx.guild.id) {
      await ctx.reply({ content: "No active giveaway found with that message ID." });
      return;
    }

    const channel = await client.channels.fetch(giveaway.channelId).catch(() => null);
    const message = channel
      ? await channel.messages.fetch(messageId).catch(() => null)
      : null;

    activeGiveaways.delete(messageId);

    if (!message || !channel) {
      await ctx.reply({ content: "Giveaway ended, but its message could not be found." });
      return;
    }

    const reaction = message.reactions.cache.get("🎉");
    const users = reaction
      ? await reaction.users.fetch().catch(() => null)
      : null;

    const entrants = users
      ? users.filter(user => !user.bot).map(user => user.id)
      : [];

    if (!entrants.length) {
      await ctx.reply({ content: "Giveaway ended. No eligible entrants were found." });
      return;
    }

    const winnerId = entrants[Math.floor(Math.random() * entrants.length)];

    await channel.send(`🎉 Giveaway ended early! Winner: <@${winnerId}> — **${giveaway.prize}**`);
    await ctx.reply({ content: "Giveaway ended." });
  }
});

registerCommand({
  name: "quickpoll",
  description: "Create a simple yes/no poll.",
  category: "Utility",
  options: [
    { name: "question", description: "Poll question", type: "string", required: true }
  ],
  slash: true,
  execute: async (ctx, args) => {
    const question = (
      ctx.isInteraction ? ctx.getString("question") : args.join(" ")
    ).trim();

    if (!question || question.length > 900) {
      await ctx.reply({ content: "Enter a poll question of up to 900 characters." });
      return;
    }

    const pollMessage = await ctx.channel.send({
      embeds: [makeEmbed("📊 Quick Poll", question)]
    });

    await pollMessage.react("👍");
    await pollMessage.react("👎");

    await ctx.reply({ content: `Poll created! [Jump to poll](${pollMessage.url})` });
  }
});

// ==========================================
// END OF PART 5S
// Append Part 5T below this line.
// ==========================================// ==========================================
// PART 5T — TICKETS & SUPPORT TOOLS
// ==========================================

const activeTickets = new Map();

registerCommand({
  name: "ticketsetup",
  description: "Set the category used for support tickets.",
  category: "Tickets",
  options: [
    { name: "category", description: "Category channel for tickets", type: "channel", required: true }
  ],
  slash: true,
  execute: async (ctx) => {
    if (!(await requireManageGuild(ctx))) return;

    const category = ctx.getChannel("category");

    if (!category || category.type !== 4) {
      await ctx.reply({ content: "Choose a valid category channel." });
      return;
    }

    const cfg = getConfig(ctx.guild.id);
    cfg.tickets = cfg.tickets || {};
    cfg.tickets.categoryId = category.id;
    saveDatabase();

    await ctx.reply({ content: `Ticket category set to **${category.name}**.` });
  }
});

registerCommand({
  name: "ticketrole",
  description: "Set the role allowed to view support tickets.",
  category: "Tickets",
  options: [
    { name: "role", description: "Support staff role", type: "role", required: true }
  ],
  slash: true,
  execute: async (ctx) => {
    if (!(await requireManageGuild(ctx))) return;

    const role = ctx.getRole("role");

    if (!role || role.id === ctx.guild.id) {
      await ctx.reply({ content: "Choose a valid support role." });
      return;
    }

    const cfg = getConfig(ctx.guild.id);
    cfg.tickets = cfg.tickets || {};
    cfg.tickets.supportRoleId = role.id;
    saveDatabase();

    await ctx.reply({ content: `Support role set to ${role}.` });
  }
});

registerCommand({
  name: "ticketlog",
  description: "Set the channel for ticket transcripts and logs.",
  category: "Tickets",
  options: [
    { name: "channel", description: "Ticket log channel", type: "channel", required: true }
  ],
  slash: true,
  execute: async (ctx) => {
    if (!(await requireManageGuild(ctx))) return;

    const channel = ctx.getChannel("channel");

    if (!channel || !channel.isTextBased()) {
      await ctx.reply({ content: "Choose a valid text channel." });
      return;
    }

    const cfg = getConfig(ctx.guild.id);
    cfg.tickets = cfg.tickets || {};
    cfg.tickets.logChannelId = channel.id;
    saveDatabase();

    await ctx.reply({ content: `Ticket log channel set to ${channel}.` });
  }
});

registerCommand({
  name: "ticket",
  description: "Create a private support ticket.",
  category: "Tickets",
  options: [
    { name: "reason", description: "Why do you need support?", type: "string", required: false }
  ],
  slash: true,
  execute: async (ctx) => {
    if (!ctx.guild) {
      await ctx.reply({ content: "Tickets can only be created in a server." });
      return;
    }

    const cfg = getConfig(ctx.guild.id);
    const ticketCfg = cfg.tickets || {};
    const reason = ctx.getString("reason") || "No reason provided";

    const existing = ctx.guild.channels.cache.find(channel =>
      channel.topic &&
      channel.topic.includes(`ticket-owner:${ctx.user.id}`)
    );

    if (existing) {
      await ctx.reply({ content: `You already have an open ticket: ${existing}` });
      return;
    }

    const permissionOverwrites = [
      {
        id: ctx.guild.roles.everyone.id,
        deny: [PermissionsBitField.Flags.ViewChannel]
      },
      {
        id: ctx.user.id,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ReadMessageHistory,
          PermissionsBitField.Flags.AttachFiles
        ]
      }
    ];

    if (ticketCfg.supportRoleId) {
      permissionOverwrites.push({
        id: ticketCfg.supportRoleId,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ReadMessageHistory
        ]
      });
    }

    try {
      const channelOptions = {
        name: `ticket-${ctx.user.username}`
          .toLowerCase()
          .replace(/[^a-z0-9-]/g, "-")
          .slice(0, 90),
        type: 0,
        topic: `ticket-owner:${ctx.user.id} | reason:${reason.slice(0, 150)}`,
        permissionOverwrites,
        reason: `Support ticket opened by ${ctx.user.tag}`
      };

      if (ticketCfg.categoryId) {
        const category = ctx.guild.channels.cache.get(ticketCfg.categoryId);
        if (category && category.type === 4) {
          channelOptions.parent = category.id;
        }
      }

      const channel = await ctx.guild.channels.create(channelOptions);

      activeTickets.set(channel.id, {
        ownerId: ctx.user.id,
        guildId: ctx.guild.id
      });

      await channel.send({
        content: `${ctx.user}${ticketCfg.supportRoleId ? ` <@&${ticketCfg.supportRoleId}>` : ""}`,
        embeds: [makeEmbed(
          "🎫 Support Ticket",
          `**Opened by:** ${ctx.user.tag}\n**Reason:** ${reason}\n\nPlease describe your issue. Staff can use \`,ticketclose\` to close this ticket.`
        )]
      });

      await ctx.reply({ content: `Your ticket has been created: ${channel}` });
    } catch (error) {
      console.error("Ticket creation error:", error);
      await ctx.reply({ content: "Couldn't create a ticket. Check my Manage Channels and View Channel permissions." });
    }
  }
});

registerCommand({
  name: "ticketclose",
  description: "Close the current support ticket.",
  category: "Tickets",
  slash: true,
  execute: async (ctx) => {
    if (!ctx.guild || !ctx.channel) {
      await ctx.reply({ content: "Use this command inside a ticket channel." });
      return;
    }

    const topic = ctx.channel.topic || "";
    const ownerMatch = topic.match(/ticket-owner:(\d+)/);
    const ownerId = ownerMatch ? ownerMatch[1] : null;

    if (!ownerId) {
      await ctx.reply({ content: "This channel doesn't appear to be a ticket." });
      return;
    }

    const isOwner = ctx.user.id === ownerId;
    const isStaff = ctx.member.permissions.has(
      PermissionsBitField.Flags.ManageChannels
    ) || (
      getConfig(ctx.guild.id).tickets?.supportRoleId &&
      ctx.member.roles.cache.has(getConfig(ctx.guild.id).tickets.supportRoleId)
    );

    if (!isOwner && !isStaff) {
      await ctx.reply({ content: "Only the ticket owner or authorized staff can close this ticket." });
      return;
    }

    await ctx.reply({ content: "Closing this ticket in 3 seconds..." });

    setTimeout(async () => {
      try {
        const cfg = getConfig(ctx.guild.id);
        const logId = cfg.tickets?.logChannelId;
        const logChannel = logId
          ? ctx.guild.channels.cache.get(logId)
          : null;

        if (logChannel && logChannel.isTextBased()) {
          await logChannel.send({
            embeds: [makeEmbed(
              "Ticket Closed",
              `**Channel:** ${ctx.channel.name}\n**Closed by:** ${ctx.user.tag}\n**Ticket owner ID:** ${ownerId}`
            )]
          });
        }

        activeTickets.delete(ctx.channel.id);
        await ctx.channel.delete(`Ticket closed by ${ctx.user.tag}`);
      } catch (error) {
        console.error("Ticket close error:", error);
      }
    }, 3000);
  }
});

registerCommand({
  name: "ticketadd",
  description: "Give a member access to the current ticket.",
  category: "Tickets",
  options: [
    { name: "user", description: "Member to add", type: "user", required: true }
  ],
  slash: true,
  execute: async (ctx) => {
    if (!ctx.guild || !ctx.channel.topic?.includes("ticket-owner:")) {
      await ctx.reply({ content: "Use this command inside a ticket channel." });
      return;
    }

    const cfg = getConfig(ctx.guild.id);
    const isStaff = ctx.member.permissions.has(
      PermissionsBitField.Flags.ManageChannels
    ) || (
      cfg.tickets?.supportRoleId &&
      ctx.member.roles.cache.has(cfg.tickets.supportRoleId)
    );

    if (!isStaff) {
      await ctx.reply({ content: "Only ticket staff can add members." });
      return;
    }

    const user = ctx.getUser("user");

    try {
      await ctx.channel.permissionOverwrites.edit(user.id, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true,
        AttachFiles: true
      });

      await ctx.reply({ content: `Added ${user} to this ticket.` });
    } catch (error) {
      await ctx.reply({ content: "Couldn't add that member. Check my permissions." });
    }
  }
});

registerCommand({
  name: "ticketremove",
  description: "Remove a member from the current ticket.",
  category: "Tickets",
  options: [
    { name: "user", description: "Member to remove", type: "user", required: true }
  ],
  slash: true,
  execute: async (ctx) => {
    if (!ctx.guild || !ctx.channel.topic?.includes("ticket-owner:")) {
      await ctx.reply({ content: "Use this command inside a ticket channel." });
      return;
    }

    const cfg = getConfig(ctx.guild.id);
    const isStaff = ctx.member.permissions.has(
      PermissionsBitField.Flags.ManageChannels
    ) || (
      cfg.tickets?.supportRoleId &&
      ctx.member.roles.cache.has(cfg.tickets.supportRoleId)
    );

    if (!isStaff) {
      await ctx.reply({ content: "Only ticket staff can remove members." });
      return;
    }

    const user = ctx.getUser("user");

    try {
      await ctx.channel.permissionOverwrites.delete(user.id);
      await ctx.reply({ content: `Removed ${user} from this ticket.` });
    } catch (error) {
      await ctx.reply({ content: "Couldn't remove that member. Check my permissions." });
    }
  }
});

// ==========================================
// END OF PART 5T
// Append Part 5U below this line.
// ==========================================// ==========================================
// PYRR OFFICIAL — PART 5U
// EXTRA SERVER & UTILITY COMMANDS
// ==========================================

registerCommand({
  name: "serverstats",
  description: "Show detailed server statistics.",
  category: "Utility",
  slash: true,
  execute: async (ctx) => {
    if (!ctx.guild) {
      await ctx.reply({ content: "This command can only be used in a server." });
      return;
    }

    const guild = ctx.guild;
    await guild.fetch().catch(() => null);

    const members = await guild.members.fetch().catch(() => null);
    const channels = guild.channels.cache;
    const roles = guild.roles.cache;
    const emojis = guild.emojis.cache;

    const humans = members
      ? members.filter(member => !member.user.bot).size
      : guild.memberCount;

    const bots = members
      ? members.filter(member => member.user.bot).size
      : "Unknown";

    const textChannels = channels.filter(channel =>
      channel.type === 0
    ).size;

    const voiceChannels = channels.filter(channel =>
      channel.type === 2
    ).size;

    const categories = channels.filter(channel =>
      channel.type === 4
    ).size;

    const embed = makeEmbed(
      "Server Statistics",
      `Detailed statistics for **${guild.name}**`
    );

    embed.addFields(
      {
        name: "Members",
        value: `Total: **${guild.memberCount}**\nHumans: **${humans}**\nBots: **${bots}**`,
        inline: true
      },
      {
        name: "Channels",
        value: `Text: **${textChannels}**\nVoice: **${voiceChannels}**\nCategories: **${categories}**`,
        inline: true
      },
      {
        name: "Server Assets",
        value: `Roles: **${Math.max(0, roles.size - 1)}**\nEmojis: **${emojis.size}**\nBoosts: **${guild.premiumSubscriptionCount || 0}**`,
        inline: true
      },
      {
        name: "Created",
        value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:F>`,
        inline: false
      }
    );

    if (guild.iconURL()) {
      embed.setThumbnail(guild.iconURL({ size: 256 }));
    }

    await ctx.reply({ embeds: [embed] });
  }
});

registerCommand({
  name: "rolepermissions",
  description: "Display permissions granted to a role.",
  category: "Utility",
  options: [
    { name: "role", description: "Role to inspect", type: "role", required: true }
  ],
  slash: true,
  execute: async (ctx, args) => {
    if (!ctx.guild) {
      await ctx.reply({ content: "Use this command inside a server." });
      return;
    }

    let role = ctx.isInteraction
      ? ctx.getRole("role")
      : ctx.source.mentions.roles.first();

    if (!role && !ctx.isInteraction && args[0]) {
      role = ctx.guild.roles.cache.get(args[0].replace(/[<@&>]/g, ""));
    }

    if (!role) {
      await ctx.reply({
        content: "Mention a role or provide its role ID."
      });
      return;
    }

    const permissions = role.permissions.toArray();

    const description = permissions.length
      ? permissions.map(permission =>
          `• \`${permission}\``
        ).join("\n")
      : "This role has no special permissions.";

    const embed = makeEmbed(
      "Role Permissions",
      `Permissions for ${role}`
    );

    embed.addFields(
      {
        name: "Role Information",
        value: `Name: **${role.name}**\nID: \`${role.id}\`\nPosition: **${role.position}**`,
        inline: false
      },
      {
        name: `Permissions (${permissions.length})`,
        value: description.slice(0, 3900),
        inline: false
      }
    );

    await ctx.reply({ embeds: [embed] });
  }
});

registerCommand({
  name: "channeltopic",
  description: "Show the topic of a text channel.",
  category: "Utility",
  options: [
    { name: "channel", description: "Channel to inspect", type: "channel", required: false }
  ],
  slash: true,
  execute: async (ctx, args) => {
    if (!ctx.guild) {
      await ctx.reply({ content: "Use this command inside a server." });
      return;
    }

    let channel = ctx.isInteraction
      ? ctx.getChannel("channel")
      : ctx.source.mentions.channels.first();

    if (!channel && !ctx.isInteraction && args[0]) {
      channel = ctx.guild.channels.cache.get(
        args[0].replace(/[<#>]/g, "")
      );
    }

    channel = channel || ctx.channel;

    if (!channel || !channel.isTextBased()) {
      await ctx.reply({ content: "Choose a text channel." });
      return;
    }

    await ctx.reply({
      embeds: [
        makeEmbed(
          "Channel Topic",
          `**Channel:** ${channel}\n**Topic:** ${channel.topic || "No topic has been set."}`
        )
      ]
    });
  }
});

registerCommand({
  name: "channelid",
  description: "Display a channel ID.",
  category: "Utility",
  options: [
    { name: "channel", description: "Channel to inspect", type: "channel", required: false }
  ],
  slash: true,
  execute: async (ctx, args) => {
    if (!ctx.guild) {
      await ctx.reply({ content: "Use this command inside a server." });
      return;
    }

    let channel = ctx.isInteraction
      ? ctx.getChannel("channel")
      : ctx.source.mentions.channels.first();

    if (!channel && !ctx.isInteraction && args[0]) {
      channel = ctx.guild.channels.cache.get(
        args[0].replace(/[<#>]/g, "")
      );
    }

    channel = channel || ctx.channel;

    if (!channel) {
      await ctx.reply({ content: "Channel not found." });
      return;
    }

    await ctx.reply({
      content: `Channel: ${channel}\nID: \`${channel.id}\``
    });
  }
});

registerCommand({
  name: "roleid",
  description: "Display a role ID.",
  category: "Utility",
  options: [
    { name: "role", description: "Role to inspect", type: "role", required: true }
  ],
  slash: true,
  execute: async (ctx, args) => {
    if (!ctx.guild) {
      await ctx.reply({ content: "Use this command inside a server." });
      return;
    }

    let role = ctx.isInteraction
      ? ctx.getRole("role")
      : ctx.source.mentions.roles.first();

    if (!role && !ctx.isInteraction && args[0]) {
      role = ctx.guild.roles.cache.get(
        args[0].replace(/[<@&>]/g, "")
      );
    }

    if (!role) {
      await ctx.reply({
        content: "Mention a role or provide its role ID."
      });
      return;
    }

    await ctx.reply({
      content: `Role: ${role}\nName: **${role.name}**\nID: \`${role.id}\``
    });
  }
});

registerCommand({
  name: "botpermissions",
  description: "Show the bot's permissions in this server.",
  category: "Utility",
  slash: true,
  execute: async (ctx) => {
    if (!ctx.guild) {
      await ctx.reply({ content: "Use this command inside a server." });
      return;
    }

    const botMember = ctx.guild.members.me;

    if (!botMember) {
      await ctx.reply({ content: "I couldn't retrieve my server member data." });
      return;
    }

    const permissions = botMember.permissions.toArray();

    const embed = makeEmbed(
      "Pyrr Official Permissions",
      `Current server permissions for **${ctx.guild.name}**`
    );

    embed.addFields({
      name: `Granted Permissions (${permissions.length})`,
      value: permissions.length
        ? permissions.map(permission => `• \`${permission}\``).join("\n").slice(0, 3900)
        : "No permissions detected.",
      inline: false
    });

    await ctx.reply({ embeds: [embed] });
  }
});

registerCommand({
  name: "memberperms",
  description: "Show a member's effective server permissions.",
  category: "Utility",
  options: [
    { name: "user", description: "Member to inspect", type: "user", required: false }
  ],
  slash: true,
  execute: async (ctx, args) => {
    if (!ctx.guild) {
      await ctx.reply({ content: "Use this command inside a server." });
      return;
    }

    let user = ctx.isInteraction
      ? ctx.getUser("user")
      : ctx.source.mentions.users.first();

    if (!user && !ctx.isInteraction && args[0]) {
      user = await client.users.fetch(args[0]).catch(() => null);
    }

    user = user || ctx.user;

    const member = await ctx.guild.members.fetch(user.id).catch(() => null);

    if (!member) {
      await ctx.reply({ content: "That user is not in this server." });
      return;
    }

    const permissions = member.permissions.toArray();

    const embed = makeEmbed(
      "Member Permissions",
      `Effective permissions for ${member}`
    );

    embed.addFields(
      {
        name: "Member",
        value: `${member.user.tag}\nID: \`${member.id}\``,
        inline: false
      },
      {
        name: `Permissions (${permissions.length})`,
        value: permissions.length
          ? permissions.map(permission => `• \`${permission}\``).join("\n").slice(0, 3900)
          : "No permissions detected.",
        inline: false
      }
    );

    await ctx.reply({ embeds: [embed] });
  }
});

registerCommand({
  name: "botlatency",
  description: "Show the bot's gateway latency.",
  category: "Utility",
  slash: true,
  execute: async (ctx) => {
    const latency = client.ws.ping;

    await ctx.reply({
      embeds: [
        makeEmbed(
          "Gateway Latency",
          `Current WebSocket ping: **${latency >= 0 ? `${latency} ms` : "Unavailable"}**`
        )
      ]
    });
  }
});

registerCommand({
  name: "serververification",
  description: "Show the server verification level.",
  category: "Utility",
  slash: true,
  execute: async (ctx) => {
    if (!ctx.guild) {
      await ctx.reply({ content: "Use this command inside a server." });
      return;
    }

    const levels = {
      0: "None",
      1: "Low",
      2: "Medium",
      3: "High",
      4: "Very High"
    };

    await ctx.reply({
      embeds: [
        makeEmbed(
          "Server Verification",
          `**Server:** ${ctx.guild.name}\n**Level:** ${levels[ctx.guild.verificationLevel] || "Unknown"}`
        )
      ]
    });
  }
});

registerCommand({
  name: "boostinfo",
  description: "Show server boost information.",
  category: "Utility",
  slash: true,
  execute: async (ctx) => {
    if (!ctx.guild) {
      await ctx.reply({ content: "Use this command inside a server." });
      return;
    }

    const guild = ctx.guild;
    const boosters = guild.members.cache.filter(member => member.premiumSince);

    const embed = makeEmbed(
      "Server Boost Information",
      `Boost information for **${guild.name}**`
    );

    embed.addFields(
      {
        name: "Boost Count",
        value: `**${guild.premiumSubscriptionCount || 0}**`,
        inline: true
      },
      {
        name: "Boost Level",
        value: `**${guild.premiumTier}**`,
        inline: true
      },
      {
        name: "Cached Boosters",
        value: `**${boosters.size}**`,
        inline: true
      }
    );

    await ctx.reply({ embeds: [embed] });
  }
});

// ==========================================
// END OF PART 5U
// Paste Part 5V after this section.
// ==========================================// ==========================================
// PYRR OFFICIAL — PART 5V
// MODERATION & SERVER MANAGEMENT
// ==========================================

registerCommand({
  name: "unmute",
  description: "Remove a member's timeout.",
  category: "Moderation",
  options: [
    { name: "user", description: "Member to untimeout", type: "user", required: true },
    { name: "reason", description: "Reason for removing timeout", type: "string", required: false }
  ],
  slash: true,
  execute: async (ctx, args) => {
    if (!(await requireModerator(ctx, PermissionsBitField.Flags.ModerateMembers))) return;

    const member = await getTargetMember(ctx, args);

    if (!member) {
      await ctx.reply({ content: "Member not found. Mention them or provide a valid user ID." });
      return;
    }

    if (!member.moderatable) {
      await ctx.reply({ content: "I cannot remove this member's timeout. Check role hierarchy and permissions." });
      return;
    }

    await member.timeout(null, getReason(ctx, args)).catch(async () => {
      await ctx.reply({ content: "Failed to remove timeout. Check my permissions." });
    });

    await ctx.reply({
      content: `Removed timeout for **${member.user.tag}**.`
    });
  }
});

registerCommand({
  name: "untimeoutall",
  description: "List timed-out members; does not mass-remove timeouts.",
  category: "Moderation",
  slash: true,
  execute: async (ctx) => {
    if (!(await requireModerator(ctx, PermissionsBitField.Flags.ModerateMembers))) return;

    const members = await ctx.guild.members.fetch().catch(() => null);

    if (!members) {
      await ctx.reply({ content: "Couldn't retrieve server members." });
      return;
    }

    const timedOut = members.filter(member =>
      member.communicationDisabledUntilTimestamp &&
      member.communicationDisabledUntilTimestamp > Date.now()
    );

    const lines = timedOut.map(member =>
      `• ${member.user.tag} — <t:${Math.floor(member.communicationDisabledUntilTimestamp / 1000)}:R>`
    );

    await ctx.reply({
      embeds: [
        makeEmbed(
          "Timed-out Members",
          lines.length ? lines.slice(0, 40).join("\n") : "No timed-out members found."
        )
      ]
    });
  }
});

registerCommand({
  name: "warnreason",
  description: "Show the saved warning reasons for a member.",
  category: "Moderation",
  options: [
    { name: "user", description: "Member to inspect", type: "user", required: true }
  ],
  slash: true,
  execute: async (ctx, args) => {
    if (!(await requireModerator(ctx, PermissionsBitField.Flags.ModerateMembers))) return;

    const member = await getTargetMember(ctx, args);

    if (!member) {
      await ctx.reply({ content: "Member not found." });
      return;
    }

    const cfg = getConfig(ctx.guild.id);
    const records = cfg.warnings?.[member.id] || [];

    if (!records.length) {
      await ctx.reply({ content: `No saved warnings for **${member.user.tag}**.` });
      return;
    }

    const lines = records.slice(-15).map((warning, index) => {
      if (typeof warning === "string") {
        return `${index + 1}. ${warning}`;
      }

      const reason = warning.reason || "No reason provided";
      const moderator = warning.moderatorId
        ? `<@${warning.moderatorId}>`
        : "Unknown moderator";

      return `${index + 1}. ${reason}\n   Moderator: ${moderator}`;
    });

    await ctx.reply({
      embeds: [
        makeEmbed(
          `Warnings — ${member.user.tag}`,
          lines.join("\n").slice(0, 3900)
        )
      ]
    });
  }
});

registerCommand({
  name: "nickname",
  description: "Display a member's current nickname.",
  category: "Utility",
  options: [
    { name: "user", description: "Member to inspect", type: "user", required: false }
  ],
  slash: true,
  execute: async (ctx, args) => {
    if (!ctx.guild) {
      await ctx.reply({ content: "Use this command inside a server." });
      return;
    }

    const member = await getTargetMember(ctx, args) || ctx.member;

    if (!member) {
      await ctx.reply({ content: "Member not found." });
      return;
    }

    await ctx.reply({
      embeds: [
        makeEmbed(
          "Member Nickname",
          `**Member:** ${member.user.tag}\n**Nickname:** ${member.nickname || "No nickname set."}`
        )
      ]
    });
  }
});

registerCommand({
  name: "membercreated",
  description: "Show when a member's Discord account was created.",
  category: "Utility",
  options: [
    { name: "user", description: "Member to inspect", type: "user", required: false }
  ],
  slash: true,
  execute: async (ctx, args) => {
    let user = ctx.isInteraction
      ? ctx.getUser("user")
      : ctx.source.mentions.users.first();

    if (!user && !ctx.isInteraction && args[0]) {
      user = await client.users.fetch(args[0]).catch(() => null);
    }

    user = user || ctx.user;

    await ctx.reply({
      embeds: [
        makeEmbed(
          "Account Creation",
          `**User:** ${user.tag}\n**Created:** <t:${Math.floor(user.createdTimestamp / 1000)}:F>\n**Relative:** <t:${Math.floor(user.createdTimestamp / 1000)}:R>`
        )
      ]
    });
  }
});

registerCommand({
  name: "roleposition",
  description: "Show a role's position in the server hierarchy.",
  category: "Utility",
  options: [
    { name: "role", description: "Role to inspect", type: "role", required: true }
  ],
  slash: true,
  execute: async (ctx, args) => {
    if (!ctx.guild) {
      await ctx.reply({ content: "Use this command inside a server." });
      return;
    }

    let role = ctx.isInteraction
      ? ctx.getRole("role")
      : ctx.source.mentions.roles.first();

    if (!role && !ctx.isInteraction && args[0]) {
      role = ctx.guild.roles.cache.get(args[0].replace(/[<@&>]/g, ""));
    }

    if (!role) {
      await ctx.reply({ content: "Role not found." });
      return;
    }

    await ctx.reply({
      content: `**${role.name}** is at position **${role.position}**.`
    });
  }
});

registerCommand({
  name: "channelposition",
  description: "Show a channel's position.",
  category: "Utility",
  options: [
    { name: "channel", description: "Channel to inspect", type: "channel", required: false }
  ],
  slash: true,
  execute: async (ctx, args) => {
    if (!ctx.guild) {
      await ctx.reply({ content: "Use this command inside a server." });
      return;
    }

    let channel = ctx.isInteraction
      ? ctx.getChannel("channel")
      : ctx.source.mentions.channels.first();

    if (!channel && !ctx.isInteraction && args[0]) {
      channel = ctx.guild.channels.cache.get(args[0].replace(/[<#>]/g, ""));
    }

    channel = channel || ctx.channel;

    if (!channel) {
      await ctx.reply({ content: "Channel not found." });
      return;
    }

    await ctx.reply({
      content: `**${channel.name || "Unnamed channel"}** position: **${channel.position ?? "Unavailable"}**`
    });
  }
});

registerCommand({
  name: "serverdescription",
  description: "Show the server description.",
  category: "Utility",
  slash: true,
  execute: async (ctx) => {
    if (!ctx.guild) {
      await ctx.reply({ content: "Use this command inside a server." });
      return;
    }

    await ctx.reply({
      embeds: [
        makeEmbed(
          "Server Description",
          ctx.guild.description || "This server has no description set."
        )
      ]
    });
  }
});

registerCommand({
  name: "servervanity",
  description: "Show the server's vanity invite code, if available.",
  category: "Utility",
  slash: true,
  execute: async (ctx) => {
    if (!ctx.guild) {
      await ctx.reply({ content: "Use this command inside a server." });
      return;
    }

    const code = ctx.guild.vanityURLCode;

    await ctx.reply({
      content: code
        ? `Vanity invite: https://discord.gg/${code}`
        : "This server does not have a vanity invite code available."
    });
  }
});

// ==========================================
// END OF PART 5V
// Paste Part 5W after this section.
// ==========================================// ==========================================
// PYRR OFFICIAL — PART 5W
// FUN, TEXT & UTILITY COMMANDS
// ==========================================

registerCommand({
  name: "randomnumber",
  description: "Generate a random number within a range.",
  category: "Fun",
  options: [
    { name: "min", description: "Minimum number", type: "integer", required: true },
    { name: "max", description: "Maximum number", type: "integer", required: true }
  ],
  slash: true,
  execute: async (ctx, args) => {
    const min = ctx.isInteraction
      ? ctx.getInteger("min")
      : Number(args[0]);

    const max = ctx.isInteraction
      ? ctx.getInteger("max")
      : Number(args[1]);

    if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || min > max) {
      await ctx.reply({ content: "Provide a valid range. Example: `,randomnumber 1 100`" });
      return;
    }

    if (max - min > 1000000000) {
      await ctx.reply({ content: "The range is too large. Keep it within 1 billion." });
      return;
    }

    const result = Math.floor(Math.random() * (max - min + 1)) + min;

    await ctx.reply({
      embeds: [
        makeEmbed("Random Number", `Generated number: **${result}**\nRange: ${min}–${max}`)
      ]
    });
  }
});

registerCommand({
  name: "randommember",
  description: "Pick a random human member from the server.",
  category: "Fun",
  slash: true,
  execute: async (ctx) => {
    if (!ctx.guild) {
      await ctx.reply({ content: "Use this command inside a server." });
      return;
    }

    const members = await ctx.guild.members.fetch().catch(() => null);

    if (!members) {
      await ctx.reply({ content: "I couldn't retrieve the server members." });
      return;
    }

    const humans = members.filter(member => !member.user.bot);

    if (!humans.size) {
      await ctx.reply({ content: "No human members were found." });
      return;
    }

    const picked = humans.random();

    await ctx.reply({
      embeds: [
        makeEmbed("Random Member", `Today's pick is ${picked}!`)
      ]
    });
  }
});

registerCommand({
  name: "randomrole",
  description: "Pick a random role from the server.",
  category: "Fun",
  slash: true,
  execute: async (ctx) => {
    if (!ctx.guild) {
      await ctx.reply({ content: "Use this command inside a server." });
      return;
    }

    const roles = ctx.guild.roles.cache.filter(role =>
      role.id !== ctx.guild.id && !role.managed
    );

    if (!roles.size) {
      await ctx.reply({ content: "No eligible roles were found." });
      return;
    }

    const role = roles.random();

    await ctx.reply({
      embeds: [
        makeEmbed("Random Role", `Selected role: ${role}`)
      ]
    });
  }
});

registerCommand({
  name: "randomemoji",
  description: "Pick a random custom emoji from the server.",
  category: "Fun",
  slash: true,
  execute: async (ctx) => {
    if (!ctx.guild) {
      await ctx.reply({ content: "Use this command inside a server." });
      return;
    }

    const emojis = ctx.guild.emojis.cache.filter(emoji => emoji.available);

    if (!emojis.size) {
      await ctx.reply({ content: "This server has no available custom emojis." });
      return;
    }

    const emoji = emojis.random();

    await ctx.reply({
      content: `Random emoji: ${emoji} (\`${emoji.name}\`)`
    });
  }
});

registerCommand({
  name: "serveremojis",
  description: "List custom emojis available in the server.",
  category: "Utility",
  slash: true,
  execute: async (ctx) => {
    if (!ctx.guild) {
      await ctx.reply({ content: "Use this command inside a server." });
      return;
    }

    const emojis = ctx.guild.emojis.cache;

    if (!emojis.size) {
      await ctx.reply({ content: "This server has no custom emojis." });
      return;
    }

    const lines = emojis.map(emoji =>
      `${emoji} \`${emoji.name}\``
    );

    await ctx.reply({
      embeds: [
        makeEmbed(
          `Server Emojis (${emojis.size})`,
          lines.slice(0, 70).join("\n").slice(0, 3900)
        )
      ]
    });
  }
});

registerCommand({
  name: "serverroles",
  description: "List roles in the server.",
  category: "Utility",
  slash: true,
  execute: async (ctx) => {
    if (!ctx.guild) {
      await ctx.reply({ content: "Use this command inside a server." });
      return;
    }

    const roles = ctx.guild.roles.cache
      .filter(role => role.id !== ctx.guild.id)
      .sort((a, b) => b.position - a.position);

    if (!roles.size) {
      await ctx.reply({ content: "No additional roles were found." });
      return;
    }

    const lines = roles.map(role =>
      `• ${role.name} — position ${role.position}`
    );

    await ctx.reply({
      embeds: [
        makeEmbed(
          `Server Roles (${roles.size})`,
          lines.slice(0, 70).join("\n").slice(0, 3900)
        )
      ]
    });
  }
});

registerCommand({
  name: "serverchannels",
  description: "List channels in the server.",
  category: "Utility",
  slash: true,
  execute: async (ctx) => {
    if (!ctx.guild) {
      await ctx.reply({ content: "Use this command inside a server." });
      return;
    }

    const channels = ctx.guild.channels.cache.sort((a, b) =>
      (a.rawPosition ?? a.position ?? 0) -
      (b.rawPosition ?? b.position ?? 0)
    );

    if (!channels.size) {
      await ctx.reply({ content: "No channels were found." });
      return;
    }

    const lines = channels.map(channel =>
      `• ${channel} — \`${channel.name}\``
    );

    await ctx.reply({
      embeds: [
        makeEmbed(
          `Server Channels (${channels.size})`,
          lines.slice(0, 70).join("\n").slice(0, 3900)
        )
      ]
    });
  }
});

registerCommand({
  name: "sayas",
  description: "Send a message as the bot in the current channel.",
  category: "Utility",
  options: [
    { name: "message", description: "Message to send", type: "string", required: true }
  ],
  slash: true,
  execute: async (ctx, args) => {
    if (!ctx.guild) {
      await ctx.reply({ content: "Use this command inside a server." });
      return;
    }

    if (!ctx.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
      await ctx.reply({ content: "You need Manage Messages permission." });
      return;
    }

    const message = ctx.isInteraction
      ? ctx.getString("message")
      : args.join(" ");

    if (!message || !message.trim()) {
      await ctx.reply({ content: "Provide a message to send." });
      return;
    }

    if (!ctx.channel || !ctx.channel.isTextBased()) {
      await ctx.reply({ content: "This channel cannot receive messages." });
      return;
    }

    await ctx.channel.send({
      content: message.slice(0, 2000),
      allowedMentions: { parse: [] }
    }).catch(async () => {
      await ctx.reply({ content: "I couldn't send the message. Check my permissions." });
      return;
    });

    await ctx.reply({ content: "Message sent." });
  }
});

registerCommand({
  name: "echo",
  description: "Repeat text without triggering mentions.",
  category: "Utility",
  options: [
    { name: "text", description: "Text to repeat", type: "string", required: true }
  ],
  slash: true,
  execute: async (ctx, args) => {
    const value = ctx.isInteraction
      ? ctx.getString("text")
      : args.join(" ");

    if (!value || !value.trim()) {
      await ctx.reply({ content: "Provide text to repeat." });
      return;
    }

    await ctx.reply({
      content: value.slice(0, 1900),
      allowedMentions: { parse: [] }
    });
  }
});

registerCommand({
  name: "charcount",
  description: "Count characters in a text string.",
  category: "Utility",
  options: [
    { name: "text", description: "Text to count", type: "string", required: true }
  ],
  slash: true,
  execute: async (ctx, args) => {
    const value = ctx.isInteraction
      ? ctx.getString("text")
      : args.join(" ");

    if (value === undefined || value === null) {
      await ctx.reply({ content: "Provide text to count." });
      return;
    }

    await ctx.reply({
      embeds: [
        makeEmbed(
          "Character Count",
          `Characters: **${Array.from(value).length}**\nWords: **${value.trim() ? value.trim().split(/\s+/).length : 0}**`
        )
      ]
    });
  }
});

registerCommand({
  name: "randomhex",
  description: "Generate a random hexadecimal color code.",
  category: "Fun",
  slash: true,
  execute: async (ctx) => {
    const color = `#${Math.floor(Math.random() * 0xFFFFFF)
      .toString(16)
      .padStart(6, "0")
      .toUpperCase()}`;

    await ctx.reply({
      embeds: [
        makeEmbed("Random Hex Color", `Color code: \`${color}\``)
      ]
    });
  }
});

// ==========================================
// END OF PART 5W
// Paste Part 5X after this section.
// ==========================================// ==========================================
// PYRR OFFICIAL — PART 5X
// SERVER TOOLS & MODERATION UTILITIES
// ==========================================

registerCommand({
  name: "purgebots",
  description: "Count bots in the server without removing members.",
  category: "Moderation",
  slash: true,
  execute: async (ctx) => {
    if (!(await requireModerator(ctx, PermissionsBitField.Flags.ManageMessages))) return;

    const members = await ctx.guild.members.fetch().catch(() => null);

    if (!members) {
      await ctx.reply({ content: "I couldn't retrieve the server members." });
      return;
    }

    const bots = members.filter(member => member.user.bot);

    await ctx.reply({
      embeds: [
        makeEmbed(
          "Bot Member Report",
          `Bots found: **${bots.size}**\nNo members were removed.`
        )
      ]
    });
  }
});

registerCommand({
  name: "purgehumans",
  description: "Count human members without removing anyone.",
  category: "Moderation",
  slash: true,
  execute: async (ctx) => {
    if (!(await requireModerator(ctx, PermissionsBitField.Flags.ManageMessages))) return;

    const members = await ctx.guild.members.fetch().catch(() => null);

    if (!members) {
      await ctx.reply({ content: "I couldn't retrieve the server members." });
      return;
    }

    const humans = members.filter(member => !member.user.bot);

    await ctx.reply({
      embeds: [
        makeEmbed(
          "Human Member Report",
          `Human members found: **${humans.size}**\nNo members were removed.`
        )
      ]
    });
  }
});

registerCommand({
  name: "purgeattachments",
  description: "Delete recent messages that contain attachments.",
  category: "Moderation",
  options: [
    { name: "amount", description: "Messages to scan, from 1 to 100", type: "integer", required: true }
  ],
  slash: true,
  execute: async (ctx, args) => {
    if (!(await requireModerator(ctx, PermissionsBitField.Flags.ManageMessages))) return;

    const amount = ctx.isInteraction
      ? ctx.getInteger("amount")
      : Number(args[0]);

    if (!Number.isInteger(amount) || amount < 1 || amount > 100) {
      await ctx.reply({ content: "Amount must be between 1 and 100." });
      return;
    }

    if (!ctx.channel || !ctx.channel.isTextBased() || !ctx.channel.messages) {
      await ctx.reply({ content: "Use this command in a message channel." });
      return;
    }

    const messages = await ctx.channel.messages.fetch({ limit: amount }).catch(() => null);

    if (!messages) {
      await ctx.reply({ content: "I couldn't fetch messages. Check my permissions." });
      return;
    }

    const eligible = messages.filter(message =>
      message.attachments.size > 0 &&
      Date.now() - message.createdTimestamp < 14 * 24 * 60 * 60 * 1000
    );

    if (!eligible.size) {
      await ctx.reply({ content: "No eligible messages with attachments were found." });
      return;
    }

    const deleted = await ctx.channel.bulkDelete(eligible, true).catch(() => null);

    if (!deleted) {
      await ctx.reply({ content: "Couldn't bulk-delete messages. Check my permissions." });
      return;
    }

    await ctx.reply({
      content: `Deleted **${deleted.size}** message(s) containing attachments.`
    });
  }
});

registerCommand({
  name: "purgeuser",
  description: "Delete recent messages from a specified member.",
  category: "Moderation",
  options: [
    { name: "user", description: "Member whose messages to delete", type: "user", required: true },
    { name: "amount", description: "Messages to scan, from 1 to 100", type: "integer", required: true }
  ],
  slash: true,
  execute: async (ctx, args) => {
    if (!(await requireModerator(ctx, PermissionsBitField.Flags.ManageMessages))) return;

    const member = await getTargetMember(ctx, args, "user");

    if (!member) {
      await ctx.reply({ content: "Member not found." });
      return;
    }

    const amount = ctx.isInteraction
      ? ctx.getInteger("amount")
      : Number(args[1]);

    if (!Number.isInteger(amount) || amount < 1 || amount > 100) {
      await ctx.reply({ content: "Amount must be between 1 and 100." });
      return;
    }

    if (!ctx.channel || !ctx.channel.isTextBased() || !ctx.channel.messages) {
      await ctx.reply({ content: "Use this command in a message channel." });
      return;
    }

    const messages = await ctx.channel.messages.fetch({ limit: amount }).catch(() => null);

    if (!messages) {
      await ctx.reply({ content: "Couldn't fetch messages. Check my permissions." });
      return;
    }

    const matching = messages.filter(message =>
      message.author.id === member.id &&
      Date.now() - message.createdTimestamp < 14 * 24 * 60 * 60 * 1000
    );

    if (!matching.size) {
      await ctx.reply({ content: "No eligible recent messages from that member were found." });
      return;
    }

    const deleted = await ctx.channel.bulkDelete(matching, true).catch(() => null);

    if (!deleted) {
      await ctx.reply({ content: "Couldn't bulk-delete messages. Check my permissions." });
      return;
    }

    await ctx.reply({
      content: `Deleted **${deleted.size}** recent message(s) from **${member.user.tag}**.`
    });
  }
});

registerCommand({
  name: "purgeembeds",
  description: "Delete recent messages containing embeds.",
  category: "Moderation",
  options: [
    { name: "amount", description: "Messages to scan, from 1 to 100", type: "integer", required: true }
  ],
  slash: true,
  execute: async (ctx, args) => {
    if (!(await requireModerator(ctx, PermissionsBitField.Flags.ManageMessages))) return;

    const amount = ctx.isInteraction
      ? ctx.getInteger("amount")
      : Number(args[0]);

    if (!Number.isInteger(amount) || amount < 1 || amount > 100) {
      await ctx.reply({ content: "Amount must be between 1 and 100." });
      return;
    }

    if (!ctx.channel || !ctx.channel.isTextBased() || !ctx.channel.messages) {
      await ctx.reply({ content: "Use this command in a message channel." });
      return;
    }

    const messages = await ctx.channel.messages.fetch({ limit: amount }).catch(() => null);

    if (!messages) {
      await ctx.reply({ content: "Couldn't fetch messages. Check my permissions." });
      return;
    }

    const eligible = messages.filter(message =>
      message.embeds.length > 0 &&
      Date.now() - message.createdTimestamp < 14 * 24 * 60 * 60 * 1000
    );

    if (!eligible.size) {
      await ctx.reply({ content: "No eligible messages with embeds were found." });
      return;
    }

    const deleted = await ctx.channel.bulkDelete(eligible, true).catch(() => null);

    if (!deleted) {
      await ctx.reply({ content: "Couldn't bulk-delete messages. Check my permissions." });
      return;
    }

    await ctx.reply({
      content: `Deleted **${deleted.size}** message(s) containing embeds.`
    });
  }
});

registerCommand({
  name: "purgefiles",
  description: "Delete recent messages containing file attachments.",
  category: "Moderation",
  options: [
    { name: "amount", description: "Messages to scan, from 1 to 100", type: "integer", required: true }
  ],
  slash: true,
  execute: async (ctx, args) => {
    if (!(await requireModerator(ctx, PermissionsBitField.Flags.ManageMessages))) return;

    const amount = ctx.isInteraction
      ? ctx.getInteger("amount")
      : Number(args[0]);

    if (!Number.isInteger(amount) || amount < 1 || amount > 100) {
      await ctx.reply({ content: "Amount must be between 1 and 100." });
      return;
    }

    if (!ctx.channel || !ctx.channel.isTextBased() || !ctx.channel.messages) {
      await ctx.reply({ content: "Use this command in a message channel." });
      return;
    }

    const messages = await ctx.channel.messages.fetch({ limit: amount }).catch(() => null);

    if (!messages) {
      await ctx.reply({ content: "Couldn't fetch messages. Check my permissions." });
      return;
    }

    const eligible = messages.filter(message =>
      message.attachments.size > 0 &&
      Date.now() - message.createdTimestamp < 14 * 24 * 60 * 60 * 1000
    );

    if (!eligible.size) {
      await ctx.reply({ content: "No eligible recent file messages were found." });
      return;
    }

    const deleted = await ctx.channel.bulkDelete(eligible, true).catch(() => null);

    if (!deleted) {
      await ctx.reply({ content: "Couldn't delete messages. Check my permissions." });
      return;
    }

    await ctx.reply({
      content: `Deleted **${deleted.size}** message(s) containing files.`
    });
  }
});

// ==========================================
// END OF PART 5X
// Paste Part 5Y after this section.
// ==========================================// ==========================================
// PYRR OFFICIAL — PART 5Y
// SERVER SAFETY & INFORMATION
// ==========================================

registerCommand({
  name: "memberaudit",
  description: "Show a basic member audit report.",
  category: "Utility",
  slash: true,
  execute: async (ctx) => {
    if (!ctx.guild) {
      await ctx.reply({ content: "Use this command inside a server." });
      return;
    }

    const members = await ctx.guild.members.fetch().catch(() => null);

    if (!members) {
      await ctx.reply({ content: "I couldn't retrieve the server members." });
      return;
    }

    const humans = members.filter(member => !member.user.bot).size;
    const bots = members.filter(member => member.user.bot).size;
    const online = members.filter(member =>
      member.presence?.status &&
      member.presence.status !== "offline"
    ).size;

    await ctx.reply({
      embeds: [
        makeEmbed(
          "Member Audit",
          `**Total members:** ${members.size}\n**Humans:** ${humans}\n**Bots:** ${bots}\n**Members with cached online presence:** ${online}\n\nPresence counts may be incomplete if the required intent is unavailable.`
        )
      ]
    });
  }
});

registerCommand({
  name: "checkpermissions",
  description: "Check whether a member has a named permission.",
  category: "Utility",
  options: [
    { name: "user", description: "Member to check", type: "user", required: true },
    { name: "permission", description: "Permission name, e.g. ManageMessages", type: "string", required: true }
  ],
  slash: true,
  execute: async (ctx, args) => {
    if (!ctx.guild) {
      await ctx.reply({ content: "Use this command inside a server." });
      return;
    }

    const member = await getTargetMember(ctx, args, "user");

    if (!member) {
      await ctx.reply({ content: "Member not found." });
      return;
    }

    const rawPermission = ctx.isInteraction
      ? ctx.getString("permission")
      : args.slice(1).join("");

    const permission = String(rawPermission || "")
      .replace(/[\s_-]/g, "")
      .toLowerCase();

    const permissionMap = {
      administrator: PermissionsBitField.Flags.Administrator,
      manageguild: PermissionsBitField.Flags.ManageGuild,
      managechannels: PermissionsBitField.Flags.ManageChannels,
      manageroles: PermissionsBitField.Flags.ManageRoles,
      managemessages: PermissionsBitField.Flags.ManageMessages,
      moderateMembers: PermissionsBitField.Flags.ModerateMembers,
      kickmembers: PermissionsBitField.Flags.KickMembers,
      banmembers: PermissionsBitField.Flags.BanMembers,
      viewauditlog: PermissionsBitField.Flags.ViewAuditLog,
      sendmessages: PermissionsBitField.Flags.SendMessages,
      embedlinks: PermissionsBitField.Flags.EmbedLinks,
      attachfiles: PermissionsBitField.Flags.AttachFiles,
      mentioneveryone: PermissionsBitField.Flags.MentionEveryone,
      movemembers: PermissionsBitField.Flags.MoveMembers,
      deafenmembers: PermissionsBitField.Flags.DeafenMembers
    };

    const flag = permissionMap[permission];

    if (!flag) {
      await ctx.reply({
        content: "Unsupported permission name. Try `Administrator`, `ManageGuild`, `ManageChannels`, `ManageRoles`, `ManageMessages`, `KickMembers`, or `BanMembers`."
      });
      return;
    }

    const allowed = member.permissions.has(flag);

    await ctx.reply({
      embeds: [
        makeEmbed(
          "Permission Check",
          `**Member:** ${member.user.tag}\n**Permission:** \`${rawPermission}\`\n**Granted:** ${allowed ? "Yes" : "No"}`
        )
      ]
    });
  }
});

registerCommand({
  name: "checkbotperms",
  description: "Check whether the bot has a named server permission.",
  category: "Utility",
  options: [
    { name: "permission", description: "Permission name, e.g. ManageMessages", type: "string", required: true }
  ],
  slash: true,
  execute: async (ctx) => {
    if (!ctx.guild) {
      await ctx.reply({ content: "Use this command inside a server." });
      return;
    }

    const rawPermission = ctx.isInteraction
      ? ctx.getString("permission")
      : "";

    const permission = String(rawPermission || "")
      .replace(/[\s_-]/g, "")
      .toLowerCase();

    const permissionMap = {
      administrator: PermissionsBitField.Flags.Administrator,
      manageguild: PermissionsBitField.Flags.ManageGuild,
      managechannels: PermissionsBitField.Flags.ManageChannels,
      manageroles: PermissionsBitField.Flags.ManageRoles,
      managemessages: PermissionsBitField.Flags.ManageMessages,
      kickmembers: PermissionsBitField.Flags.KickMembers,
      banmembers: PermissionsBitField.Flags.BanMembers,
      viewauditlog: PermissionsBitField.Flags.ViewAuditLog,
      sendmessages: PermissionsBitField.Flags.SendMessages,
      embedlinks: PermissionsBitField.Flags.EmbedLinks,
      attachfiles: PermissionsBitField.Flags.AttachFiles,
      mentioneveryone: PermissionsBitField.Flags.MentionEveryone,
      movemembers: PermissionsBitField.Flags.MoveMembers,
      deafenmembers: PermissionsBitField.Flags.DeafenMembers
    };

    const flag = permissionMap[permission];

    if (!flag) {
      await ctx.reply({
        content: "Unsupported permission name. Try `Administrator`, `ManageGuild`, `ManageChannels`, `ManageRoles`, or `ManageMessages`."
      });
      return;
    }

    const botMember = ctx.guild.members.me;

    if (!botMember) {
      await ctx.reply({ content: "Couldn't retrieve the bot's server member data." });
      return;
    }

    const allowed = botMember.permissions.has(flag);

    await ctx.reply({
      embeds: [
        makeEmbed(
          "Bot Permission Check",
          `**Permission:** \`${rawPermission}\`\n**Granted:** ${allowed ? "Yes" : "No"}`
        )
      ]
    });
  }
});

registerCommand({
  name: "serverage",
  description: "Show how old the server is.",
  category: "Utility",
  slash: true,
  execute: async (ctx) => {
    if (!ctx.guild) {
      await ctx.reply({ content: "Use this command inside a server." });
      return;
    }

    const created = ctx.guild.createdTimestamp;
    const days = Math.max(0, Math.floor((Date.now() - created) / 86400000));

    await ctx.reply({
      embeds: [
        makeEmbed(
          "Server Age",
          `**Server:** ${ctx.guild.name}\n**Created:** <t:${Math.floor(created / 1000)}:F>\n**Age:** ${days.toLocaleString()} days`
        )
      ]
    });
  }
});

registerCommand({
  name: "memberage",
  description: "Show how long a member has been in the server.",
  category: "Utility",
  options: [
    { name: "user", description: "Member to inspect", type: "user", required: false }
  ],
  slash: true,
  execute: async (ctx, args) => {
    if (!ctx.guild) {
      await ctx.reply({ content: "Use this command inside a server." });
      return;
    }

    const member = await getTargetMember(ctx, args, "user") || ctx.member;

    if (!member) {
      await ctx.reply({ content: "Member not found." });
      return;
    }

    const joined = member.joinedTimestamp;

    if (!joined) {
      await ctx.reply({ content: "Join date is unavailable." });
      return;
    }

    const days = Math.max(0, Math.floor((Date.now() - joined) / 86400000));

    await ctx.reply({
      embeds: [
        makeEmbed(
          "Membership Age",
          `**Member:** ${member.user.tag}\n**Joined:** <t:${Math.floor(joined / 1000)}:F>\n**Time in server:** ${days.toLocaleString()} days`
        )
      ]
    });
  }
});

registerCommand({
  name: "botcreated",
  description: "Show when this bot account was created.",
  category: "Utility",
  slash: true,
  execute: async (ctx) => {
    const created = client.user.createdTimestamp;

    await ctx.reply({
      embeds: [
        makeEmbed(
          "Bot Account Age",
          `**Bot:** ${client.user.tag}\n**Created:** <t:${Math.floor(created / 1000)}:F>\n**Relative:** <t:${Math.floor(created / 1000)}:R>`
        )
      ]
    });
  }
});

registerCommand({
  name: "servermember",
  description: "Show a member's server profile summary.",
  category: "Utility",
  options: [
    { name: "user", description: "Member to inspect", type: "user", required: false }
  ],
  slash: true,
  execute: async (ctx, args) => {
    if (!ctx.guild) {
      await ctx.reply({ content: "Use this command inside a server." });
      return;
    }

    const member = await getTargetMember(ctx, args, "user") || ctx.member;

    if (!member) {
      await ctx.reply({ content: "Member not found." });
      return;
    }

    const roles = member.roles.cache
      .filter(role => role.id !== ctx.guild.id)
      .sort((a, b) => b.position - a.position)
      .map(role => role.toString());

    const embed = makeEmbed(
      "Server Member Profile",
      `Information for **${member.user.tag}**`
    );

    embed.addFields(
      {
        name: "Joined Server",
        value: member.joinedTimestamp
          ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:F>`
          : "Unknown",
        inline: false
      },
      {
        name: "Top Role",
        value: `${member.roles.highest}`,
        inline: true
      },
      {
        name: "Role Count",
        value: `${Math.max(0, member.roles.cache.size - 1)}`,
        inline: true
      },
      {
        name: "Roles",
        value: roles.length ? roles.slice(0, 15).join(", ").slice(0, 1000) : "No additional roles",
        inline: false
      }
    );

    await ctx.reply({ embeds: [embed] });
  }
});

// ==========================================
// END OF PART 5Y
// Paste Part 5Z after this section.
// ==========================================// ==========================================
// PYRR OFFICIAL — PART 5Z
// BOT HEALTH & SERVER AUDIT
// ==========================================

registerCommand({
  name: "bothealth",
  description: "Show bot health and runtime information.",
  category: "Utility",
  slash: true,
  execute: async (ctx) => {
    const memory = process.memoryUsage();
    const uptimeSeconds = Math.floor(process.uptime());

    const formatUptime = (seconds) => {
      const days = Math.floor(seconds / 86400);
      const hours = Math.floor((seconds % 86400) / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      const secs = seconds % 60;

      return `${days}d ${hours}h ${minutes}m ${secs}s`;
    };

    const embed = makeEmbed(
      "Pyrr Official — Health",
      "Current runtime diagnostics."
    );

    embed.addFields(
      {
        name: "Gateway",
        value: client.ws.ping >= 0
          ? `${client.ws.ping} ms`
          : "Unavailable",
        inline: true
      },
      {
        name: "Runtime",
        value: formatUptime(uptimeSeconds),
        inline: true
      },
      {
        name: "Memory",
        value: `${Math.round(memory.rss / 1024 / 1024)} MB`,
        inline: true
      },
      {
        name: "Guilds",
        value: `${client.guilds.cache.size}`,
        inline: true
      },
      {
        name: "Cached Users",
        value: `${client.users.cache.size}`,
        inline: true
      },
      {
        name: "Node.js",
        value: process.version,
        inline: true
      }
    );

    await ctx.reply({ embeds: [embed] });
  }
});

registerCommand({
  name: "serveraudit",
  description: "Run a read-only server configuration audit.",
  category: "Utility",
  slash: true,
  execute: async (ctx) => {
    if (!ctx.guild) {
      await ctx.reply({ content: "Use this command inside a server." });
      return;
    }

    const guild = ctx.guild;
    const botMember = guild.members.me;
    const warnings = [];

    if (!botMember) {
      await ctx.reply({ content: "Couldn't retrieve the bot's server member data." });
      return;
    }

    if (!botMember.permissions.has(PermissionsBitField.Flags.ViewAuditLog)) {
      warnings.push("The bot cannot view the audit log.");
    }

    if (!botMember.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
      warnings.push("The bot cannot manage or delete messages.");
    }

    if (!botMember.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
      warnings.push("The bot cannot manage channels.");
    }

    if (!botMember.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
      warnings.push("The bot cannot manage roles.");
    }

    if (!botMember.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
      warnings.push("The bot cannot timeout members.");
    }

    const cfg = getConfig(guild.id);

    if (!cfg.logs?.channelId) {
      warnings.push("No security log channel is configured.");
    }

    if (!cfg.welcome?.enabled) {
      warnings.push("Welcome messages are disabled.");
    }

    if (!cfg.leave?.enabled) {
      warnings.push("Leave messages are disabled.");
    }

    if (!cfg.antinuke?.enabled) {
      warnings.push("AntiNuke monitoring is disabled.");
    }

    if (!cfg.antiraid?.enabled) {
      warnings.push("AntiRaid monitoring is disabled.");
    }

    const description = warnings.length
      ? warnings.map((warning, index) => `${index + 1}. ${warning}`).join("\n")
      : "No issues were detected by these basic checks.";

    const embed = makeEmbed(
      "Server Configuration Audit",
      description.slice(0, 3900)
    );

    embed.addFields({
      name: "Audit Scope",
      value: "Read-only checks. This command does not change server settings.",
      inline: false
    });

    await ctx.reply({ embeds: [embed] });
  }
});

registerCommand({
  name: "prefixinfo",
  description: "Show the current prefix and example commands.",
  category: "Utility",
  slash: true,
  execute: async (ctx) => {
    if (!ctx.guild) {
      await ctx.reply({
        content: `Default prefix: \`${DEFAULT_PREFIX}\`\nExample: \`${DEFAULT_PREFIX}help\``
      });
      return;
    }

    const prefix = getPrefix(ctx.guild.id);

    await ctx.reply({
      embeds: [
        makeEmbed(
          "Prefix Information",
          `**Current prefix:** \`${prefix}\`\n**Help:** \`${prefix}help\`\n**Bot information:** \`${prefix}botinfo\`\n**Ping:** \`${prefix}ping\``
        )
      ]
    });
  }
});

registerCommand({
  name: "supportlink",
  description: "Display the official support server link.",
  category: "General",
  slash: true,
  execute: async (ctx) => {
    await ctx.reply({
      embeds: [
        makeEmbed(
          "Pyrr Official Support",
          `Need help with the bot?\n\n[Join the support server](${SUPPORT_SERVER})`
        )
      ]
    });
  }
});

registerCommand({
  name: "twitchlink",
  description: "Display the official Twitch channel.",
  category: "General",
  slash: true,
  execute: async (ctx) => {
    await ctx.reply({
      embeds: [
        makeEmbed(
          "Official Twitch",
          `[Visit the Twitch channel](${TWITCH_URL})`
        )
      ]
    });
  }
});

registerCommand({
  name: "memberlookup",
  description: "Look up a server member using a mention or ID.",
  category: "Utility",
  options: [
    {
      name: "user",
      description: "Member to look up",
      type: "user",
      required: true
    }
  ],
  slash: true,
  execute: async (ctx, args) => {
    if (!ctx.guild) {
      await ctx.reply({ content: "Use this command inside a server." });
      return;
    }

    const member = await getTargetMember(ctx, args, "user");

    if (!member) {
      await ctx.reply({ content: "That member could not be found in this server." });
      return;
    }

    const embed = makeEmbed(
      "Member Lookup",
      `Found **${member.user.tag}**`
    );

    embed.addFields(
      {
        name: "User ID",
        value: `\`${member.id}\``,
        inline: true
      },
      {
        name: "Bot Account",
        value: member.user.bot ? "Yes" : "No",
        inline: true
      },
      {
        name: "Nickname",
        value: member.nickname || "Not set",
        inline: true
      },
      {
        name: "Account Created",
        value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:F>`,
        inline: false
      },
      {
        name: "Joined Server",
        value: member.joinedTimestamp
          ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:F>`
          : "Unknown",
        inline: false
      }
    );

    if (member.user.displayAvatarURL()) {
      embed.setThumbnail(
        member.user.displayAvatarURL({ size: 256 })
      );
    }

    await ctx.reply({ embeds: [embed] });
  }
});

registerCommand({
  name: "channelpermissions",
  description: "Show this bot's permissions in a channel.",
  category: "Utility",
  options: [
    {
      name: "channel",
      description: "Channel to inspect",
      type: "channel",
      required: false
    }
  ],
  slash: true,
  execute: async (ctx, args) => {
    if (!ctx.guild) {
      await ctx.reply({ content: "Use this command inside a server." });
      return;
    }

    let channel = ctx.isInteraction
      ? ctx.getChannel("channel")
      : ctx.source.mentions.channels.first();

    if (!channel && !ctx.isInteraction && args[0]) {
      channel = ctx.guild.channels.cache.get(
        args[0].replace(/[<#>]/g, "")
      );
    }

    channel = channel || ctx.channel;

    if (!channel || !channel.permissionsFor) {
      await ctx.reply({ content: "Couldn't inspect that channel." });
      return;
    }

    const botMember = ctx.guild.members.me;

    if (!botMember) {
      await ctx.reply({ content: "Couldn't retrieve the bot's member data." });
      return;
    }

    const permissions = channel.permissionsFor(botMember);

    if (!permissions) {
      await ctx.reply({ content: "Channel permissions are unavailable." });
      return;
    }

    const importantPermissions = [
      ["ViewChannel", PermissionsBitField.Flags.ViewChannel],
      ["SendMessages", PermissionsBitField.Flags.SendMessages],
      ["ReadMessageHistory", PermissionsBitField.Flags.ReadMessageHistory],
      ["EmbedLinks", PermissionsBitField.Flags.EmbedLinks],
      ["AttachFiles", PermissionsBitField.Flags.AttachFiles],
      ["ManageMessages", PermissionsBitField.Flags.ManageMessages],
      ["ManageChannels", PermissionsBitField.Flags.ManageChannels],
      ["ManageRoles", PermissionsBitField.Flags.ManageRoles]
    ];

    const lines = importantPermissions.map(([name, flag]) => {
      return `${permissions.has(flag) ? "✅" : "❌"} ${name}`;
    });

    await ctx.reply({
      embeds: [
        makeEmbed(
          `Permissions — #${channel.name || "channel"}`,
          lines.join("\n")
        )
      ]
    });
  }
});

registerCommand({
  name: "botservers",
  description: "Show the number of servers this bot is in.",
  category: "Utility",
  slash: true,
  execute: async (ctx) => {
    await ctx.reply({
      embeds: [
        makeEmbed(
          "Bot Server Count",
          `Pyrr Official is currently connected to **${client.guilds.cache.size}** server(s).`
        )
      ]
    });
  }
});

// ==========================================
// END OF PART 5Z
// More integration work remains.
// ==========================================// ==========================================
// PYRR OFFICIAL — PART 6A
// EXTRA UTILITY COMMANDS
// ==========================================

registerCommand({
  name: "serverregion",
  description: "Show the server locale and preferred language setting.",
  category: "Utility",
  slash: true,
  execute: async (ctx) => {
    if (!ctx.guild) {
      await ctx.reply({ content: "Use this command inside a server." });
      return;
    }

    await ctx.reply({
      embeds: [
        makeEmbed(
          "Server Locale",
          `**Server:** ${ctx.guild.name}\n**Preferred Locale:** ${ctx.guild.preferredLocale || "Unavailable"}\n\nDiscord manages the actual server region automatically for most servers.`
        )
      ]
    });
  }
});

registerCommand({
  name: "botaccount",
  description: "Show information about the bot account.",
  category: "Utility",
  slash: true,
  execute: async (ctx) => {
    const bot = client.user;

    await ctx.reply({
      embeds: [
        makeEmbed(
          "Bot Account",
          `**Name:** ${bot.username}\n**Tag:** ${bot.tag}\n**ID:** \`${bot.id}\`\n**Created:** <t:${Math.floor(bot.createdTimestamp / 1000)}:F>\n**Servers:** ${client.guilds.cache.size}\n**Prefix:** \`${DEFAULT_PREFIX}\``
        )
      ]
    });
  }
});

registerCommand({
  name: "guildicon",
  description: "Show the current server icon.",
  category: "Utility",
  slash: true,
  execute: async (ctx) => {
    if (!ctx.guild) {
      await ctx.reply({ content: "Use this command inside a server." });
      return;
    }

    const icon = ctx.guild.iconURL({
      size: 1024,
      extension: "png"
    });

    if (!icon) {
      await ctx.reply({ content: "This server has no custom icon." });
      return;
    }

    const embed = makeEmbed("Server Icon", ctx.guild.name);
    embed.setImage(icon);

    await ctx.reply({ embeds: [embed] });
  }
});

registerCommand({
  name: "guildbanner",
  description: "Show the current server banner.",
  category: "Utility",
  slash: true,
  execute: async (ctx) => {
    if (!ctx.guild) {
      await ctx.reply({ content: "Use this command inside a server." });
      return;
    }

    const guild = await ctx.guild.fetch().catch(() => null);
    const banner = guild?.bannerURL({
      size: 1024,
      extension: "png"
    });

    if (!banner) {
      await ctx.reply({
        content: "No server banner is available."
      });
      return;
    }

    const embed = makeEmbed("Server Banner", ctx.guild.name);
    embed.setImage(banner);

    await ctx.reply({ embeds: [embed] });
  }
});

registerCommand({
  name: "membercountbots",
  description: "Show the cached human and bot member counts.",
  category: "Utility",
  slash: true,
  execute: async (ctx) => {
    if (!ctx.guild) {
      await ctx.reply({ content: "Use this command inside a server." });
      return;
    }

    const members = await ctx.guild.members.fetch().catch(() => null);

    if (!members) {
      await ctx.reply({
        content: "Couldn't retrieve server members. Check the bot's Server Members Intent."
      });
      return;
    }

    const humans = members.filter(member => !member.user.bot).size;
    const bots = members.filter(member => member.user.bot).size;

    await ctx.reply({
      embeds: [
        makeEmbed(
          "Member Breakdown",
          `**Total:** ${members.size}\n**Human accounts:** ${humans}\n**Bot accounts:** ${bots}`
        )
      ]
    });
  }
});

registerCommand({
  name: "textstats",
  description: "Show the current message's character and word counts.",
  category: "Utility",
  options: [
    {
      name: "text",
      description: "Text to analyze",
      type: "string",
      required: true
    }
  ],
  slash: true,
  execute: async (ctx, args) => {
    const value = ctx.isInteraction
      ? ctx.getString("text")
      : args.join(" ");

    if (typeof value !== "string" || !value.length) {
      await ctx.reply({ content: "Provide some text to analyze." });
      return;
    }

    const words = value.trim()
      ? value.trim().split(/\s+/).length
      : 0;

    const lines = value.length
      ? value.split(/\r\n|\r|\n/).length
      : 0;

    await ctx.reply({
      embeds: [
        makeEmbed(
          "Text Statistics",
          `**Characters:** ${Array.from(value).length}\n**Words:** ${words}\n**Lines:** ${lines}\n**Bytes (UTF-8):** ${Buffer.byteLength(value, "utf8")}`
        )
      ]
    });
  }
});

registerCommand({
  name: "unixnow",
  description: "Show the current Unix timestamp.",
  category: "Utility",
  slash: true,
  execute: async (ctx) => {
    const timestamp = Math.floor(Date.now() / 1000);

    await ctx.reply({
      embeds: [
        makeEmbed(
          "Current Timestamp",
          `**Unix:** \`${timestamp}\`\n**Discord short time:** <t:${timestamp}:t>\n**Discord full date:** <t:${timestamp}:F>\n**Relative:** <t:${timestamp}:R>`
        )
      ]
    });
  }
});

registerCommand({
  name: "percentageof",
  description: "Calculate a percentage of a number.",
  category: "Utility",
  options: [
    {
      name: "percent",
      description: "Percentage to calculate",
      type: "integer",
      required: true
    },
    {
      name: "number",
      description: "Number to calculate against",
      type: "integer",
      required: true
    }
  ],
  slash: true,
  execute: async (ctx, args) => {
    const percent = ctx.isInteraction
      ? ctx.getInteger("percent")
      : Number(args[0]);

    const number = ctx.isInteraction
      ? ctx.getInteger("number")
      : Number(args[1]);

    if (
      !Number.isFinite(percent) ||
      !Number.isFinite(number) ||
      Math.abs(percent) > 1000000000 ||
      Math.abs(number) > 1000000000
    ) {
      await ctx.reply({
        content: "Provide valid numbers within ±1 billion."
      });
      return;
    }

    const result = (percent / 100) * number;

    await ctx.reply({
      embeds: [
        makeEmbed(
          "Percentage Calculator",
          `${percent}% of ${number} = **${Number(result.toFixed(8))}**`
        )
      ]
    });
  }
});

registerCommand({
  name: "averageof",
  description: "Calculate the average of several numbers.",
  category: "Utility",
  options: [
    {
      name: "numbers",
      description: "Numbers separated by spaces or commas",
      type: "string",
      required: true
    }
  ],
  slash: true,
  execute: async (ctx, args) => {
    const raw = ctx.isInteraction
      ? ctx.getString("numbers")
      : args.join(" ");

    const values = String(raw || "")
      .split(/[\s,]+/)
      .filter(Boolean)
      .map(Number);

    if (
      values.length < 1 ||
      values.length > 100 ||
      values.some(value => !Number.isFinite(value))
    ) {
      await ctx.reply({
        content: "Provide 1–100 valid numbers. Example: `,averageof 10 20 30`"
      });
      return;
    }

    const average = values.reduce((sum, value) => sum + value, 0) /
      values.length;

    await ctx.reply({
      embeds: [
        makeEmbed(
          "Average Calculator",
          `**Numbers:** ${values.length}\n**Average:** ${Number(average.toFixed(8))}`
        )
      ]
    });
  }
});

// ==========================================
// END OF PART 6A
// ==========================================
 // ==========================================
 // PART 6B — EXTRA UTILITY COMMANDS
 // ==========================================

registerCommand({
  name: "rolecreated",
  description: "Show when a role was created.",
  category: "Utility",
  options: [
    { name: "role", type: "role", description: "Role to inspect", required: true }
  ],
  execute: async (ctx) => {
    const role = ctx.isInteraction
      ? ctx.getRole("role")
      : ctx.guild.roles.cache.get(
          (ctx.source.mentions.roles.first()?.id || ctx.source.content.split(/\s+/)[1] || "").replace(/[<@&>]/g, "")
        );

    if (!role) {
      await ctx.reply({ content: "Please provide a valid role." });
      return;
    }

    await ctx.reply({
      embeds: [makeEmbed("Role Created", [
        `**Role:** ${role}`,
        `**Created:** <t:${Math.floor(role.createdTimestamp / 1000)}:F>`,
        `**Role ID:** \`${role.id}\``
      ].join("\n"))]
    });
  }
});

registerCommand({
  name: "channelcreated",
  description: "Show when a channel was created.",
  category: "Utility",
  options: [
    { name: "channel", type: "channel", description: "Channel to inspect", required: false }
  ],
  execute: async (ctx) => {
    const channel = ctx.isInteraction
      ? (ctx.getChannel("channel") || ctx.channel)
      : (ctx.source.mentions.channels.first() || ctx.channel);

    if (!channel) {
      await ctx.reply({ content: "Channel not found." });
      return;
    }

    await ctx.reply({
      embeds: [makeEmbed("Channel Created", [
        `**Channel:** ${channel}`,
        `**Created:** <t:${Math.floor(channel.createdTimestamp / 1000)}:F>`,
        `**Channel ID:** \`${channel.id}\``
      ].join("\n"))]
    });
  }
});

registerCommand({
  name: "guildcreated",
  description: "Show the server creation date.",
  category: "Utility",
  execute: async (ctx) => {
    if (!ctx.guild) {
      await ctx.reply({ content: "Use this command inside a server." });
      return;
    }

    await ctx.reply({
      embeds: [makeEmbed("Server Creation", [
        `**Server:** ${ctx.guild.name}`,
        `**Created:** <t:${Math.floor(ctx.guild.createdTimestamp / 1000)}:F>`,
        `**Server ID:** \`${ctx.guild.id}\``
      ].join("\n"))]
    });
  }
});

registerCommand({
  name: "guildownerid",
  description: "Show the server owner's ID.",
  category: "Utility",
  execute: async (ctx) => {
    if (!ctx.guild) {
      await ctx.reply({ content: "Use this command inside a server." });
      return;
    }

    await ctx.reply({
      embeds: [makeEmbed("Server Owner", [
        `**Owner:** <@${ctx.guild.ownerId}>`,
        `**Owner ID:** \`${ctx.guild.ownerId}\``
      ].join("\n"))]
    });
  }
});

registerCommand({
  name: "snowflake",
  description: "Convert a Discord snowflake ID to a timestamp.",
  category: "Utility",
  options: [
    { name: "id", type: "string", description: "Discord ID", required: true }
  ],
  execute: async (ctx, args) => {
    const id = ctx.isInteraction
      ? ctx.getString("id")
      : args[0];

    if (!id || !/^\d{17,20}$/.test(id)) {
      await ctx.reply({ content: "Provide a valid Discord snowflake ID." });
      return;
    }

    const timestamp = Number((BigInt(id) >> 22n) + 1420070400000n);

    if (!Number.isFinite(timestamp)) {
      await ctx.reply({ content: "That ID could not be converted." });
      return;
    }

    await ctx.reply({
      embeds: [makeEmbed("Snowflake Converter", [
        `**ID:** \`${id}\``,
        `**Timestamp:** <t:${Math.floor(timestamp / 1000)}:F>`,
        `**Relative:** <t:${Math.floor(timestamp / 1000)}:R>`
      ].join("\n"))]
    });
  }
});

registerCommand({
  name: "discordtime",
  description: "Show the current Discord timestamp.",
  category: "Utility",
  options: [
    { name: "format", type: "string", description: "Timestamp format", required: false }
  ],
  execute: async (ctx) => {
    const formats = ["f", "F", "d", "D", "t", "T", "R"];
    const requested = ctx.isInteraction
      ? ctx.getString("format")
      : null;
    const format = formats.includes(requested) ? requested : "F";
    const unix = Math.floor(Date.now() / 1000);

    await ctx.reply({
      embeds: [makeEmbed("Discord Timestamp", [
        `**Unix:** \`${unix}\``,
        `**Selected:** <t:${unix}:${format}>`,
        `**Relative:** <t:${unix}:R>`
      ].join("\n"))]
    });
  }
});

registerCommand({
  name: "rolecreatedid",
  description: "Look up a role using its ID.",
  category: "Utility",
  options: [
    { name: "id", type: "string", description: "Role ID", required: true }
  ],
  execute: async (ctx, args) => {
    if (!ctx.guild) {
      await ctx.reply({ content: "Use this command inside a server." });
      return;
    }

    const id = ctx.isInteraction
      ? ctx.getString("id")
      : args[0];

    const role = ctx.guild.roles.cache.get(id);

    if (!role) {
      await ctx.reply({ content: "I couldn't find that role in this server." });
      return;
    }

    await ctx.reply({
      embeds: [makeEmbed("Role Lookup", [
        `**Role:** ${role}`,
        `**Name:** ${role.name}`,
        `**ID:** \`${role.id}\``,
        `**Members:** ${role.members.size}`,
        `**Position:** ${role.position}`
      ].join("\n"))]
    });
  }
});

registerCommand({
  name: "channelcreatedid",
  description: "Look up a channel using its ID.",
  category: "Utility",
  options: [
    { name: "id", type: "string", description: "Channel ID", required: true }
  ],
  execute: async (ctx, args) => {
    if (!ctx.guild) {
      await ctx.reply({ content: "Use this command inside a server." });
      return;
    }

    const id = ctx.isInteraction
      ? ctx.getString("id")
      : args[0];

    const channel = ctx.guild.channels.cache.get(id);

    if (!channel) {
      await ctx.reply({ content: "I couldn't find that channel in this server." });
      return;
    }

    await ctx.reply({
      embeds: [makeEmbed("Channel Lookup", [
        `**Channel:** ${channel}`,
        `**Name:** ${channel.name}`,
        `**ID:** \`${channel.id}\``,
        `**Type:** ${channel.type}`
      ].join("\n"))]
    });
  }
});

// ==========================================
// END OF PART 6B
// Append Part 6C after this section.
// ==========================================

 // ==========================================
 // PART 6C — EXTRA UTILITY COMMANDS
 // ==========================================

registerCommand({
  name: "rolecolorhex",
  description: "Show a role's color in hexadecimal.",
  category: "Utility",
  options: [
    { name: "role", type: "role", description: "Role to inspect", required: true }
  ],
  execute: async (ctx, args) => {
    if (!ctx.guild) {
      await ctx.reply({ content: "Use this command inside a server." });
      return;
    }

    const role = ctx.isInteraction
      ? ctx.getRole("role")
      : ctx.guild.roles.cache.get(
          (ctx.source.mentions.roles.first()?.id || args[0] || "").replace(/[<@&>]/g, "")
        );

    if (!role) {
      await ctx.reply({ content: "Please provide a valid role." });
      return;
    }

    await ctx.reply({
      embeds: [makeEmbed("Role Color", [
        `**Role:** ${role}`,
        `**Hex:** \`${role.hexColor.toUpperCase()}\``,
        `**RGB:** \`${role.color ? [
          (role.color >> 16) & 255,
          (role.color >> 8) & 255,
          role.color & 255
        ].join(", ") : "255, 255, 255"}\``
      ].join("\n"))]
    });
  }
});

registerCommand({
  name: "channeltype",
  description: "Show the type of a channel.",
  category: "Utility",
  options: [
    { name: "channel", type: "channel", description: "Channel to inspect", required: false }
  ],
  execute: async (ctx) => {
    if (!ctx.guild) {
      await ctx.reply({ content: "Use this command inside a server." });
      return;
    }

    const channel = ctx.isInteraction
      ? (ctx.getChannel("channel") || ctx.channel)
      : (ctx.source.mentions.channels.first() || ctx.channel);

    if (!channel) {
      await ctx.reply({ content: "Channel not found." });
      return;
    }

    const types = {
      0: "Text",
      1: "Direct Message",
      2: "Voice",
      4: "Category",
      5: "Announcement",
      10: "Announcement Thread",
      11: "Public Thread",
      12: "Private Thread",
      13: "Stage",
      15: "Forum",
      16: "Media"
    };

    await ctx.reply({
      embeds: [makeEmbed("Channel Type", [
        `**Channel:** ${channel}`,
        `**Type:** ${types[channel.type] || "Other"}`,
        `**Type ID:** \`${channel.type}\``
      ].join("\n"))]
    });
  }
});

registerCommand({
  name: "servericonurl",
  description: "Show the server icon URL.",
  category: "Utility",
  execute: async (ctx) => {
    if (!ctx.guild) {
      await ctx.reply({ content: "Use this command inside a server." });
      return;
    }

    const url = ctx.guild.iconURL({ size: 1024, extension: "png" });

    await ctx.reply({
      embeds: [makeEmbed("Server Icon", url
        ? `[Open server icon](${url})`
        : "This server doesn't have an icon.")]
    });
  }
});

registerCommand({
  name: "botavatar",
  description: "Show the bot's avatar.",
  category: "Utility",
  execute: async (ctx) => {
    const user = ctx.client.user;
    const url = user.displayAvatarURL({ size: 1024, extension: "png" });

    await ctx.reply({
      embeds: [makeEmbed("Bot Avatar", `[Open bot avatar](${url})`)]
    });
  }
});

registerCommand({
  name: "guildname",
  description: "Show the current server name.",
  category: "Utility",
  execute: async (ctx) => {
    if (!ctx.guild) {
      await ctx.reply({ content: "Use this command inside a server." });
      return;
    }

    await ctx.reply({
      embeds: [makeEmbed("Server Name", [
        `**Name:** ${ctx.guild.name}`,
        `**Length:** ${ctx.guild.name.length} characters`,
        `**ID:** \`${ctx.guild.id}\``
      ].join("\n"))]
    });
  }
});

registerCommand({
  name: "myid",
  description: "Show your Discord user ID.",
  category: "Utility",
  execute: async (ctx) => {
    await ctx.reply({
      embeds: [makeEmbed("Your Discord ID", `\`${ctx.user.id}\``)]
    });
  }
});

registerCommand({
  name: "myavatar",
  description: "Show your Discord avatar.",
  category: "Utility",
  execute: async (ctx) => {
    const url = ctx.user.displayAvatarURL({ size: 1024, extension: "png" });

    await ctx.reply({
      embeds: [makeEmbed("Your Avatar", `[Open avatar](${url})`)]
    });
  }
});

registerCommand({
  name: "servermember",
  description: "Look up a server member by ID.",
  category: "Utility",
  options: [
    { name: "id", type: "string", description: "Member ID", required: true }
  ],
  execute: async (ctx, args) => {
    if (!ctx.guild) {
      await ctx.reply({ content: "Use this command inside a server." });
      return;
    }

    const id = ctx.isInteraction
      ? ctx.getString("id")
      : args[0];

    const member = await ctx.guild.members.fetch(id).catch(() => null);

    if (!member) {
      await ctx.reply({ content: "That member isn't in this server." });
      return;
    }

    await ctx.reply({
      embeds: [makeEmbed("Member Lookup", [
        `**User:** ${member.user.tag}`,
        `**Mention:** ${member}`,
        `**ID:** \`${member.id}\``,
        `**Joined:** ${member.joinedTimestamp
          ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`
          : "Unknown"}`
      ].join("\n"))]
    });
  }
});

// ==========================================
// END OF PART 6C
// Append Part 6D after this section.
// ==========================================

 // ==========================================
 // PART 6D — EXTRA UTILITY COMMANDS
 // ==========================================

registerCommand({
  name: "servercreatedrelative",
  description: "Show how long ago the server was created.",
  category: "Utility",
  execute: async (ctx) => {
    if (!ctx.guild) {
      await ctx.reply({ content: "Use this command inside a server." });
      return;
    }

    const timestamp = Math.floor(ctx.guild.createdTimestamp / 1000);

    await ctx.reply({
      embeds: [makeEmbed("Server Age", [
        `**Server:** ${ctx.guild.name}`,
        `**Created:** <t:${timestamp}:F>`,
        `**Age:** <t:${timestamp}:R>`
      ].join("\n"))]
    });
  }
});

registerCommand({
  name: "memberjoinedrelative",
  description: "Show how long ago a member joined.",
  category: "Utility",
  options: [
    { name: "user", type: "user", description: "Member to check", required: false }
  ],
  execute: async (ctx) => {
    if (!ctx.guild) {
      await ctx.reply({ content: "Use this command inside a server." });
      return;
    }

    const user = ctx.isInteraction
      ? (ctx.getUser("user") || ctx.user)
      : (ctx.source.mentions.users.first() || ctx.user);

    const member = await ctx.guild.members.fetch(user.id).catch(() => null);

    if (!member || !member.joinedTimestamp) {
      await ctx.reply({ content: "Couldn't find that member's join date." });
      return;
    }

    const timestamp = Math.floor(member.joinedTimestamp / 1000);

    await ctx.reply({
      embeds: [makeEmbed("Member Join Age", [
        `**Member:** ${member.user.tag}`,
        `**Joined:** <t:${timestamp}:F>`,
        `**Time ago:** <t:${timestamp}:R>`
      ].join("\n"))]
    });
  }
});

registerCommand({
  name: "rolemembers",
  description: "List members who have a specific role.",
  category: "Utility",
  options: [
    { name: "role", type: "role", description: "Role to inspect", required: true }
  ],
  execute: async (ctx, args) => {
    if (!ctx.guild) {
      await ctx.reply({ content: "Use this command inside a server." });
      return;
    }

    const role = ctx.isInteraction
      ? ctx.getRole("role")
      : ctx.guild.roles.cache.get(
          (ctx.source.mentions.roles.first()?.id || args[0] || "").replace(/[<@&>]/g, "")
        );

    if (!role) {
      await ctx.reply({ content: "Please provide a valid role." });
      return;
    }

    const members = role.members.map(member => member.user.tag);
    const display = members.slice(0, 40);

    await ctx.reply({
      embeds: [makeEmbed("Role Members", [
        `**Role:** ${role.name}`,
        `**Count:** ${members.length}`,
        display.length ? display.map(name => `• ${name}`).join("\n") : "No cached members found.",
        members.length > 40 ? `\n…and ${members.length - 40} more.` : ""
      ].join("\n"))]
    });
  }
});

registerCommand({
  name: "channelcounttype",
  description: "Count channels by type in this server.",
  category: "Utility",
  execute: async (ctx) => {
    if (!ctx.guild) {
      await ctx.reply({ content: "Use this command inside a server." });
      return;
    }

    const channels = [...ctx.guild.channels.cache.values()];
    const text = channels.filter(channel => channel.isTextBased() && !channel.isVoiceBased()).length;
    const voice = channels.filter(channel => channel.isVoiceBased()).length;
    const categories = channels.filter(channel => channel.type === 4).length;
    const threads = channels.filter(channel => channel.isThread()).length;

    await ctx.reply({
      embeds: [makeEmbed("Channel Counts", [
        `**Total:** ${channels.length}`,
        `**Text-based:** ${text}`,
        `**Voice-based:** ${voice}`,
        `**Categories:** ${categories}`,
        `**Threads:** ${threads}`
      ].join("\n"))]
    });
  }
});

// ==========================================
// END OF PART 6D
// Append the next part after this section.
// ==========================================

 // ==========================================
 // PART 6E — STARTUP, PREFIX & SLASH HANDLERS
 // ==========================================

client.once("clientReady", async () => {
  console.log("==================================");
  console.log(`${BOT_NAME} is online.`);
  console.log(`Creator: ${CREATOR}`);
  console.log(`Bot ID: ${client.user.id}`);
  console.log(`Servers: ${client.guilds.cache.size}`);
  console.log(`Registered prefix commands: ${getUniqueCommands().length}`);
  console.log(`Prefix: ${DEFAULT_PREFIX}`);
  console.log("==================================");

  client.user.setPresence({
    activities: [
      {
        name: "Noctis Official | ,help",
        type: ActivityType.Watching
      }
    ],
    status: "online"
  });

  if (!CLIENT_ID) {
    console.warn("CLIENT_ID is missing. Slash commands were not registered.");
    return;
  }

  try {
    // Discord allows up to 100 global application commands.
    // Keep only unique slash command names.
    const seen = new Set();
    const uniqueSlashCommands = slashCommands.filter(builder => {
      const name = builder.name;

      if (!name || seen.has(name)) return false;

      seen.add(name);
      return true;
    }).slice(0, 100);

    const rest = new REST({ version: "10" }).setToken(TOKEN);

    await rest.put(
      Routes.applicationCommands(CLIENT_ID),
      {
        body: uniqueSlashCommands.map(command => command.toJSON())
      }
    );

    console.log(`Slash commands registered: ${uniqueSlashCommands.length}`);
    console.log("Slash command registration completed.");
  } catch (error) {
    console.error("Slash registration failed:", error.message);
  }
});

// Prefix command handler: ,help, ,ping, ,ban, etc.
client.on("messageCreate", async message => {
  try {
    if (!message.guild || message.author.bot) return;
    if (!message.content) return;

    const prefix = getPrefix(message.guild.id);

    if (!message.content.startsWith(prefix)) return;

    const input = message.content.slice(prefix.length).trim();
    if (!input) return;

    const parts = input.split(/\s+/);
    const commandName = parts.shift().toLowerCase();
    const command = commands.get(commandName);

    if (!command) return;

    const ctx = makeContext(message, false);

    await runCommand(command, ctx, parts);
  } catch (error) {
    console.error("Prefix command error:", error);
  }
});

// Slash command handler.
client.on("interactionCreate", async interaction => {
  try {
    if (!interaction.isChatInputCommand()) return;

    const command = commands.get(interaction.commandName);

    if (!command || !command.slash) {
      await interaction.reply({
        content: "That command is unavailable.",
        ephemeral: true
      }).catch(() => {});
      return;
    }

    const ctx = makeContext(interaction, true);

    await runCommand(command, ctx, []);
  } catch (error) {
    console.error("Slash command error:", error);

    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: "Something went wrong while running that command.",
        ephemeral: true
      }).catch(() => {});
    }
  }
});

// ==========================================
// PART 6E END
// ==========================================

// Login once.
client.login(TOKEN).catch(error => {
  console.error("Discord login failed:", error.message);
});
