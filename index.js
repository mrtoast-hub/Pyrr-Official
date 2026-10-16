
const {
  Client,
  GatewayIntentBits,
  Partials,
  ActivityType,
  EmbedBuilder,
  PermissionsBitField,
  SlashCommandBuilder,
  REST,
  Routes,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ChannelType,
  AuditLogEvent
} = require("discord.js");

const fs = require("fs");
const path = require("path");

// ==========================================
// PYRR OFFICIAL | BLACK & WHITE EDITION
// ==========================================

const BOT_NAME = "PYRR OFFICIAL";
const CREATOR = "_upyr";
const DEFAULT_PREFIX = ",";
const SUPPORT_SERVER = "https://discord.gg/TwDBvBmVdM";

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const OWNER_IDS = (process.env.OWNER_IDS || "")
  .split(",")
  .map(id => id.trim())
  .filter(Boolean);

if (!TOKEN) {
  console.error("Missing DISCORD_TOKEN environment variable.");
  process.exit(1);
}

// ==========================================
// DISCORD CLIENT
// ==========================================

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

// ==========================================
// DATABASE
// ==========================================

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
    console.error("Database load error:", error.message);
    return { guilds: {}, users: {} };
  }
}

let database = loadDatabase();

function saveDatabase() {
  try {
    const temporaryFile = DATA_FILE + ".tmp";

    fs.writeFileSync(
      temporaryFile,
      JSON.stringify(database, null, 2),
      "utf8"
    );

    fs.renameSync(temporaryFile, DATA_FILE);
  } catch (error) {
    console.error("Database save error:", error.message);
  }
}

// ==========================================
// DEFAULT GUILD CONFIG
// ==========================================

function defaultGuildConfig() {
  return {
    prefix: DEFAULT_PREFIX,

    antinuke: {
      enabled: false,
      punishment: "ban",
      limit: 3,
      windowSeconds: 10,
      logChannelId: null,
      protectedUsers: [],
      protectedRoles: [],
      actions: {
        channelDelete: true,
        roleDelete: true,
        ban: true,
        kick: true,
        webhookCreate: true,
        botAdd: true
      }
    },

    antiraid: {
      enabled: false,
      joinLimit: 8,
      windowSeconds: 10,
      minimumAccountAgeHours: 24,
      logChannelId: null
    },

    automod: {
      enabled: false,
      antiSpam: true,
      antiInvite: false,
      antiMassMention: true
    },

    welcome: {
      enabled: false,
      channelId: null,
      message: null,
      thumbnailUrl: null,
      bannerUrl: null
    },

    leave: {
      enabled: false,
      channelId: null,
      message: null,
      thumbnailUrl: null,
      bannerUrl: null
    },

    verification: {
      enabled: false,
      channelId: null,
      roleId: null,
      color: "#FFFFFF",
      thumbnailUrl: null,
      bannerUrl: null
    },

    tickets: {
      channelId: null,
      categoryId: null,
      supportRoleId: null,
      bannerUrl: null,
      description: null,
      logChannelId: null
    },

    logs: { channelId: null },

    leveling: {
      enabled: true,
      logChannelId: null,
      roles: {}
    },

    disabledCommands: []
  };
}

function getConfig(guildId) {
  if (!database.guilds[guildId]) {
    database.guilds[guildId] = defaultGuildConfig();
    saveDatabase();
  }

  const current = database.guilds[guildId];
  const defaults = defaultGuildConfig();

  for (const [key, value] of Object.entries(defaults)) {
    if (current[key] === undefined) {
      current[key] = value;
    } else if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value)
    ) {
      current[key] = {
        ...value,
        ...current[key]
      };
    }
  }

  return current;
}

// ==========================================
// COMMAND REGISTRY
// ==========================================

const commands = new Map();
const slashCommands = [];

function registerCommand({
  name,
  description,
  category = "Utility",
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

  if (!slash) return;

  const builder = new SlashCommandBuilder()
    .setName(name)
    .setDescription(description.slice(0, 100));

  for (const option of options) {
    const descriptionText = (
      option.description || option.name
    ).slice(0, 100);

    if (option.type === "string") {
      builder.addStringOption(item =>
        item.setName(option.name)
          .setDescription(descriptionText)
          .setRequired(Boolean(option.required))
      );
    } else if (option.type === "user") {
      builder.addUserOption(item =>
        item.setName(option.name)
          .setDescription(descriptionText)
          .setRequired(Boolean(option.required))
      );
    } else if (option.type === "integer") {
      builder.addIntegerOption(item =>
        item.setName(option.name)
          .setDescription(descriptionText)
          .setRequired(Boolean(option.required))
      );
    } else if (option.type === "boolean") {
      builder.addBooleanOption(item =>
        item.setName(option.name)
          .setDescription(descriptionText)
          .setRequired(Boolean(option.required))
      );
    } else if (option.type === "channel") {
      builder.addChannelOption(item =>
        item.setName(option.name)
          .setDescription(descriptionText)
          .setRequired(Boolean(option.required))
      );
    } else if (option.type === "role") {
      builder.addRoleOption(item =>
        item.setName(option.name)
          .setDescription(descriptionText)
          .setRequired(Boolean(option.required))
      );
    }
  }

  slashCommands.push(builder);
}

// ==========================================
// STYLE & COMMON HELPERS
// ==========================================

const SYMBOL = {
  main: "⟡",
  line: "━━━━━━━━━━━━━━━━━━",
  security: "⛨",
  success: "◈",
  warning: "〢",
  support: "⌘",
  arrow: "↳",
  dot: "▪"
};

function makeEmbed(title, description) {
  return new EmbedBuilder()
    .setColor("#FFFFFF")
    .setTitle(`${SYMBOL.main} ${title}`)
    .setDescription(description || "No details provided.")
    .setFooter({
      text: `${BOT_NAME} 〢 ${CREATOR}`
    })
    .setTimestamp();
}

function getPrefix(guildId) {
  if (!guildId) return DEFAULT_PREFIX;
  return getConfig(guildId).prefix || DEFAULT_PREFIX;
}

function getUniqueCommands() {
  const unique = new Map();

  for (const command of commands.values()) {
    if (!unique.has(command.name)) {
      unique.set(command.name, command);
    }
  }

  return [...unique.values()];
}

function isOwner(userId) {
  return OWNER_IDS.includes(userId);
}

function canManageSettings(ctx) {
  return Boolean(
    ctx.guild &&
    (
      ctx.guild.ownerId === ctx.user.id ||
      isOwner(ctx.user.id)
    )
  );
}

function hasPermission(member, permission) {
  return Boolean(
    member &&
    member.permissions &&
    member.permissions.has(permission)
  );
}

// ==========================================
// CONTEXT HELPER
// ==========================================

function makeContext(source, isInteraction) {
  const user = isInteraction
    ? source.user
    : source.author;

  const guild = source.guild || null;
  const member = isInteraction
    ? source.member
    : source.member;

  const channel = source.channel || null;

  async function reply(payload) {
    if (typeof payload === "string") {
      payload = { content: payload };
    }

    if (isInteraction) {
      if (source.replied || source.deferred) {
        return source.followUp(payload);
      }

      return source.reply(payload);
    }

    return source.reply(payload);
  }

  function optionGetter(type, name) {
    if (!isInteraction) return null;

    try {
      return source.options[type](name);
    } catch {
      return null;
    }
  }

  return {
    source,
    isInteraction,
    user,
    guild,
    member,
    channel,

    reply,

    embed(title, description) {
      return reply({
        embeds: [makeEmbed(title, description)]
      });
    },

    getString(name) {
      return optionGetter("getString", name);
    },

    getUser(name) {
      return optionGetter("getUser", name);
    },

    getInteger(name) {
      return optionGetter("getInteger", name);
    },

    getBoolean(name) {
      return optionGetter("getBoolean", name);
    },

    getChannel(name) {
      return optionGetter("getChannel", name);
    },

    getRole(name) {
      return optionGetter("getRole", name);
    }
  };
}

// ==========================================
// PERMISSION CHECKS
// ==========================================

async function requireGuild(ctx) {
  if (ctx.guild) return true;

  await ctx.reply({
    content: "⟡ This command can only be used in a server.",
    ephemeral: ctx.isInteraction
  });

  return false;
}

async function requireGuildOwner(ctx) {
  if (!ctx.guild) {
    await ctx.reply({
      content: "⟡ Use this command inside your server.",
      ephemeral: ctx.isInteraction
    });
    return false;
  }

  if (
    ctx.guild.ownerId !== ctx.user.id &&
    !isOwner(ctx.user.id)
  ) {
    await ctx.reply({
      content: "⟡ Only the server owner can configure this feature.",
      ephemeral: ctx.isInteraction
    });
    return false;
  }

  return true;
}

async function requireModerator(ctx, permission) {
  if (!(await requireGuild(ctx))) return false;

  if (!hasPermission(ctx.member, permission)) {
    await ctx.reply({
      content: "⟡ You do not have permission to use this command.",
      ephemeral: ctx.isInteraction
    });
    return false;
  }

  return true;
}

// ==========================================
// COMMAND EXECUTION
// ==========================================

async function runCommand(command, ctx, args = []) {
  try {
    if (
      ctx.guild &&
      getConfig(ctx.guild.id).disabledCommands.includes(command.name)
    ) {
      await ctx.reply({
        content: "⟡ This command is disabled in this server.",
        ephemeral: ctx.isInteraction
      });
      return;
    }

    await command.execute(ctx, args);
  } catch (error) {
    console.error(
      `Command error [${command.name}]:`,
      error
    );

    await ctx.reply({
      content: "⟡ Something went wrong. Check the bot console for details.",
      ephemeral: ctx.isInteraction
    }).catch(() => {});
  }
}

// PART 1 END — APPEND PART 2 BELOW
        
 // ==========================================
 // PART 2 — HELP, BASIC COMMANDS & STICK
 // ==========================================

const BOT_STARTED_AT = Date.now();

registerCommand({
  name: "help",
  description: "Browse PYRR OFFICIAL commands.",
  category: "Utility",
  options: [{
    name: "category",
    description: "Choose a command category.",
    type: "string",
    required: false
  }],
  execute: async (ctx, args) => {
    const all = getUniqueCommands();
    const selected = (
      ctx.isInteraction
        ? ctx.getString("category")
        : args.join(" ")
    ) || "";

    const categories = [...new Set(
      all.map(command => command.category)
    )].sort();

    const embed = makeEmbed(
      "PYRR OFFICIAL",
      [
        "WELCOME TO PYRR OFFICIAL",
        "A professional toolkit for server security and community management.",
        "",
        `〢 Prefix: \`${getPrefix(ctx.guild?.id)}\``,
        `〢 Categories: **${categories.length}**`,
        `〢 Total Commands: **${all.length}**`,
        "",
        SYMBOL.line,
        "",
        selected
          ? `**${selected} Commands**`
          : "**Browse a category below.**"
      ].join("\n")
    );

    const filtered = selected
      ? all.filter(command =>
          command.category.toLowerCase() === selected.toLowerCase()
        )
      : [];

    if (selected && filtered.length === 0) {
      await ctx.reply({
        content: "⟡ Category not found. Choose a category from the menu.",
        ephemeral: ctx.isInteraction
      });
      return;
    }

    if (selected) {
      embed.addFields({
        name: "Command List",
        value: filtered
          .map(command =>
            `\`${getPrefix(ctx.guild?.id)}${command.name}\` — ${command.description}`
          )
          .join("\n")
          .slice(0, 1024)
      });
    }

    const options = categories.slice(0, 25).map(category => ({
      label: category,
      value: category,
      description: `Browse ${category} commands`.slice(0, 100)
    }));

    const rows = [];

    if (options.length) {
      rows.push(
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId("pyrr_help_category")
            .setPlaceholder("Browse a category")
            .addOptions(options)
        )
      );
    }

    await ctx.reply({
      embeds: [embed],
      components: rows
    });
  }
});

registerCommand({
  name: "ping",
  description: "Check bot response latency.",
  category: "Utility",
  execute: async ctx => {
    await ctx.reply({
      embeds: [
        makeEmbed(
          "Connection Status",
          `〢 WebSocket: **${client.ws.ping} ms**\n〢 Status: **Online**`
        )
      ]
    });
  }
});

registerCommand({
  name: "botinfo",
  description: "Show bot information.",
  category: "Utility",
  execute: async ctx => {
    const embed = makeEmbed(
      "Bot Information",
      [
        `〢 Name: **${BOT_NAME}**`,
        `〢 Creator: **${CREATOR}**`,
        `〢 Servers: **${client.guilds.cache.size}**`,
        `〢 Users cached: **${client.users.cache.size}**`,
        `〢 Prefix: \`${getPrefix(ctx.guild?.id)}\``,
        `〢 Support: ${SUPPORT_SERVER}`
      ].join("\n")
    );

    if (client.user) {
      embed.setThumbnail(client.user.displayAvatarURL());
    }

    await ctx.reply({ embeds: [embed] });
  }
});

registerCommand({
  name: "serverinfo",
  description: "Show information about this server.",
  category: "Utility",
  execute: async ctx => {
    if (!(await requireGuild(ctx))) return;

    const guild = ctx.guild;
    const embed = makeEmbed(
      "Server Information",
      [
        `〢 Name: **${guild.name}**`,
        `〢 ID: \`${guild.id}\``,
        `〢 Owner: <@${guild.ownerId}>`,
        `〢 Members: **${guild.memberCount}**`,
        `〢 Channels: **${guild.channels.cache.size}**`,
        `〢 Roles: **${guild.roles.cache.size}**`,
        `〢 Created: <t:${Math.floor(guild.createdTimestamp / 1000)}:F>`
      ].join("\n")
    );

    const icon = guild.iconURL({ size: 512 });
    if (icon) embed.setThumbnail(icon);

    const banner = guild.bannerURL({ size: 1024 });
    if (banner) embed.setImage(banner);

    await ctx.reply({ embeds: [embed] });
  }
});

registerCommand({
  name: "userinfo",
  description: "Show information about a server member.",
  category: "Utility",
  options: [{
    name: "user",
    description: "Member to inspect.",
    type: "user",
    required: false
  }],
  execute: async (ctx, args) => {
    if (!(await requireGuild(ctx))) return;

    let user = ctx.isInteraction
      ? ctx.getUser("user")
      : ctx.source.mentions.users.first();

    if (!user && !ctx.isInteraction && args[0]) {
      user = await client.users.fetch(args[0]).catch(() => null);
    }

    user ||= ctx.user;

    const member = await ctx.guild.members.fetch(user.id).catch(() => null);

    const embed = makeEmbed(
      "User Information",
      [
        `〢 Username: **${user.username}**`,
        `〢 ID: \`${user.id}\``,
        `〢 Account Created: <t:${Math.floor(user.createdTimestamp / 1000)}:F>`,
        member
          ? `〢 Joined Server: <t:${Math.floor(member.joinedTimestamp / 1000)}:F>`
          : "〢 Server membership: Not found"
      ].join("\n")
    );

    embed.setThumbnail(user.displayAvatarURL({ size: 512 }));

    await ctx.reply({ embeds: [embed] });
  }
});

registerCommand({
  name: "avatar",
  description: "Show a user's avatar.",
  category: "Utility",
  options: [{
    name: "user",
    description: "User whose avatar you want.",
    type: "user",
    required: false
  }],
  execute: async (ctx, args) => {
    let user = ctx.isInteraction
      ? ctx.getUser("user")
      : ctx.source.mentions.users.first();

    if (!user && !ctx.isInteraction && args[0]) {
      user = await client.users.fetch(args[0]).catch(() => null);
    }

    user ||= ctx.user;

    const url = user.displayAvatarURL({
      size: 1024,
      extension: "png"
    });

    const embed = makeEmbed(
      "Avatar",
      `[Open full-size avatar](${url})`
    ).setImage(url);

    await ctx.reply({ embeds: [embed] });
  }
});

registerCommand({
  name: "prefix",
  description: "Show this server's command prefix.",
  category: "Utility",
  execute: async ctx => {
    await ctx.reply({
      embeds: [
        makeEmbed(
          "Server Prefix",
          `〢 Current prefix: \`${getPrefix(ctx.guild?.id)}\`\n〢 Example: \`${getPrefix(ctx.guild?.id)}help\``
        )
      ]
    });
  }
});

registerCommand({
  name: "setprefix",
  description: "Change the server prefix.",
  category: "SetPyrr",
  options: [{
    name: "prefix",
    description: "New prefix, 1 to 5 characters.",
    type: "string",
    required: true
  }],
  execute: async (ctx, args) => {
    if (!(await requireGuildOwner(ctx))) return;

    const nextPrefix = (
      ctx.isInteraction
        ? ctx.getString("prefix")
        : args[0]
    ) || "";

    if (
      nextPrefix.length < 1 ||
      nextPrefix.length > 5 ||
      /\s/.test(nextPrefix)
    ) {
      await ctx.reply({
        content: "⟡ Prefix must be 1–5 characters with no spaces.",
        ephemeral: ctx.isInteraction
      });
      return;
    }

    getConfig(ctx.guild.id).prefix = nextPrefix;
    saveDatabase();

    await ctx.reply({
      embeds: [
        makeEmbed(
          "Prefix Updated",
          `〢 New prefix: \`${nextPrefix}\`\n〢 Try \`${nextPrefix}help\``
        )
      ]
    });
  }
});

// ,stick <message>
// Sends a clean, branded announcement-style embed.

registerCommand({
  name: "stick",
  description: "Send a branded message embed.",
  category: "Utility",
  options: [{
    name: "message",
    description: "Message to display.",
    type: "string",
    required: true
  }],
  execute: async (ctx, args) => {
    if (!ctx.guild) {
      await ctx.reply({
        content: "⟡ Use this command inside a server.",
        ephemeral: ctx.isInteraction
      });
      return;
    }

    if (!hasPermission(ctx.member, PermissionsBitField.Flags.ManageMessages)) {
      await ctx.reply({
        content: "⟡ You need Manage Messages to use this command.",
        ephemeral: ctx.isInteraction
      });
      return;
    }

    const message = (
      ctx.isInteraction
        ? ctx.getString("message")
        : args.join(" ")
    ) || "";

    if (!message.trim()) {
      await ctx.reply({
        content: `Usage: \`${getPrefix(ctx.guild.id)}stick <your message>\``,
        ephemeral: ctx.isInteraction
      });
      return;
    }

    const embed = makeEmbed(
      "PYRR OFFICIAL 〢 NOTICE",
      message.slice(0, 4000)
    );

    embed.setAuthor({
      name: ctx.user.username,
      iconURL: ctx.user.displayAvatarURL()
    });

    await ctx.reply({ embeds: [embed] });
  }
});

// ==========================================
// HELP DROPDOWN INTERACTION
// ==========================================

client.on("interactionCreate", async interaction => {
  if (!interaction.isStringSelectMenu()) return;
  if (interaction.customId !== "pyrr_help_category") return;

  const selected = interaction.values[0];
  const all = getUniqueCommands().filter(command =>
    command.category.toLowerCase() === selected.toLowerCase()
  );

  const embed = makeEmbed(
    `${selected} Commands`,
    all.length
      ? all.map(command =>
          `\`${getPrefix(interaction.guildId)}${command.name}\` — ${command.description}`
        ).join("\n").slice(0, 4000)
      : "No commands are registered in this category yet."
  );

  await interaction.update({
    embeds: [embed],
    components: interaction.message.components
  });
});

// PART 2 END — APPEND PART 3 BELOW
      
/* ================================
   PYRR OFFICIAL — PART 3
   ANTINUKE PANEL & WHITELIST
================================ */

function antinukeEmbed(guild) {
  const cfg = getConfig(guild.id);
  const an = cfg.antinuke;

  return makeEmbed(
    "ANTINUKE CONTROL PANEL",
    [
      `**Server:** ${guild.name}`,
      `**Status:** ${an.enabled ? "ENABLED" : "DISABLED"}`,
      `**Punishment:** ${String(an.punishment).toUpperCase()}`,
      `**Action limit:** ${an.limit} actions`,
      `**Time window:** ${an.windowSeconds} seconds`,
      `**Log channel:** ${an.logChannelId ? `<#${an.logChannelId}>` : "Not configured"}`,
      `**Whitelisted users:** ${an.protectedUsers.length}`,
      `**Whitelisted roles:** ${an.protectedRoles.length}`,
      "",
      `${SYMBOL.line}`,
      "**CONTROL OPTIONS**",
      `${SYMBOL.arrow} Toggle protection on/off`,
      `${SYMBOL.arrow} Configure punishment`,
      `${SYMBOL.arrow} Add or remove whitelist entries`,
      `${SYMBOL.arrow} Configure the log channel`,
      "",
      "Only the server owner or bot owner can use these controls."
    ].join("\n")
  );
}

function antinukePanelRows() {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("pyrr_an_toggle")
      .setLabel("Enable / Disable")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("pyrr_an_punishment")
      .setLabel("Punishment")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("pyrr_an_refresh")
      .setLabel("Refresh")
      .setStyle(ButtonStyle.Secondary)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("pyrr_an_add_user")
      .setLabel("Add User")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("pyrr_an_add_role")
      .setLabel("Add Role")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("pyrr_an_remove")
      .setLabel("Remove Whitelist")
      .setStyle(ButtonStyle.Danger)
  );

  return [row1, row2];
}

function isAntinukeController(interaction) {
  if (!interaction.guild || !interaction.user) return false;
  return (
    isOwner(interaction.user.id) ||
    interaction.guild.ownerId === interaction.user.id
  );
}

function whitelistMenu(guild, type, action = "add") {
  const cfg = getConfig(guild.id).antinuke;
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`pyrr_an_wl_${action}_${type}`)
    .setPlaceholder(
      action === "add"
        ? `Select a ${type} to whitelist`
        : `Select a whitelisted ${type} to remove`
    )
    .setMinValues(1)
    .setMaxValues(1);

  let options = [];

  if (type === "user") {
    if (action === "add") {
      options = [...guild.members.cache.values()]
        .filter(member => !member.user.bot)
        .slice(0, 25)
        .map(member => ({
          label: member.user.username.slice(0, 100),
          description: `User ID: ${member.id}`,
          value: member.id
        }));
    } else {
      options = cfg.protectedUsers
        .slice(0, 25)
        .map(id => ({
          label: `User ${id}`.slice(0, 100),
          description: "Remove this user from the whitelist",
          value: id
        }));
    }
  }

  if (type === "role") {
    if (action === "add") {
      options = [...guild.roles.cache.values()]
        .filter(role => role.id !== guild.id && !role.managed)
        .slice(0, 25)
        .map(role => ({
          label: role.name.slice(0, 100),
          description: `Role ID: ${role.id}`,
          value: role.id
        }));
    } else {
      options = cfg.protectedRoles
        .slice(0, 25)
        .map(id => {
          const role = guild.roles.cache.get(id);
          return {
            label: (role ? role.name : `Role ${id}`).slice(0, 100),
            description: "Remove this role from the whitelist",
            value: id
          };
        });
    }
  }

  if (!options.length) {
    options = [{
      label: "No entries available",
      description: "There are no selectable entries",
      value: "pyrr_none"
    }];
    menu.setDisabled(true);
  } else {
    menu.addOptions(options);
  }

  return new ActionRowBuilder().addComponents(menu);
}

async function sendAntinukePanel(ctx) {
  if (!ctx.guild) {
    return ctx.reply("This command can only be used in a server.");
  }

  if (!isOwner(ctx.user.id) && ctx.guild.ownerId !== ctx.user.id) {
    return ctx.reply("Only the server owner or bot owner can open this panel.");
  }

  return ctx.reply({
    embeds: [antinukeEmbed(ctx.guild)],
    components: antinukePanelRows()
  });
}

registerCommand({
  name: "antinuke",
  description: "Open the PYRR antinuke control panel.",
  category: "Antinuke",
  aliases: ["an"],
  execute: async (ctx) => sendAntinukePanel(ctx)
});

registerCommand({
  name: "setup",
  description: "Open the security setup panel.",
  category: "Antinuke",
  execute: async (ctx) => sendAntinukePanel(ctx)
});

registerCommand({
  name: "punishment",
  description: "Set the antinuke punishment.",
  category: "Antinuke",
  aliases: ["punish"],
  options: [
    {
      name: "type",
      description: "kick, ban, or timeout",
      type: "string",
      required: true
    }
  ],
  execute: async (ctx, args) => {
    if (!ctx.guild) return ctx.reply("Use this command in a server.");
    if (!isOwner(ctx.user.id) && ctx.guild.ownerId !== ctx.user.id) {
      return ctx.reply("Only the server owner or bot owner can change punishment.");
    }

    const value = (
      ctx.getString("type") ||
      args[0] ||
      ""
    ).toLowerCase();

    if (!["kick", "ban", "timeout"].includes(value)) {
      return ctx.reply("Choose a valid punishment: `kick`, `ban`, or `timeout`.");
    }

    getConfig(ctx.guild.id).antinuke.punishment = value;
    saveDatabase();

    return ctx.reply({
      embeds: [makeEmbed(
        "ANTINUKE PUNISHMENT UPDATED",
        `${SYMBOL.success} Punishment set to **${value.toUpperCase()}**.`
      )]
    });
  }
});

registerCommand({
  name: "antinukelogs",
  description: "Set the channel used for antinuke logs.",
  category: "Antinuke",
  options: [
    {
      name: "channel",
      description: "Channel for security logs",
      type: "channel",
      required: true
    }
  ],
  execute: async (ctx, args) => {
    if (!ctx.guild) return ctx.reply("Use this command in a server.");
    if (!isOwner(ctx.user.id) && ctx.guild.ownerId !== ctx.user.id) {
      return ctx.reply("Only the server owner or bot owner can configure antinuke logs.");
    }

    let channel = ctx.getChannel("channel");

    if (!channel && args[0]) {
      const id = args[0].replace(/[<#>]/g, "");
      channel = ctx.guild.channels.cache.get(id);
    }

    if (
      !channel ||
      !channel.isTextBased() ||
      channel.isDMBased()
    ) {
      return ctx.reply("Please provide a valid text channel.");
    }

    getConfig(ctx.guild.id).antinuke.logChannelId = channel.id;
    saveDatabase();

    return ctx.reply({
      embeds: [makeEmbed(
        "ANTINUKE LOGS CONFIGURED",
        `${SYMBOL.success} Security logs will use ${channel}.`
      )]
    });
  }
});

/* Owner-only panel buttons */

client.on("interactionCreate", async interaction => {
  if (!interaction.isButton()) return;
  if (!interaction.customId.startsWith("pyrr_an_")) return;

  if (!interaction.guild) {
    return interaction.reply({
      content: "Use this control inside a server.",
      ephemeral: true
    });
  }

  if (!isAntinukeController(interaction)) {
    return interaction.reply({
      content: "Only the server owner or bot owner can use these controls.",
      ephemeral: true
    });
  }

  const cfg = getConfig(interaction.guild.id).antinuke;
  const id = interaction.customId;

  if (id === "pyrr_an_toggle") {
    cfg.enabled = !cfg.enabled;
    saveDatabase();

    return interaction.update({
      embeds: [antinukeEmbed(interaction.guild)],
      components: antinukePanelRows()
    });
  }

  if (id === "pyrr_an_refresh") {
    return interaction.update({
      embeds: [antinukeEmbed(interaction.guild)],
      components: antinukePanelRows()
    });
  }

  if (id === "pyrr_an_punishment") {
    const menu = new StringSelectMenuBuilder()
      .setCustomId("pyrr_an_choose_punishment")
      .setPlaceholder("Choose the punishment")
      .addOptions(
        { label: "Kick", description: "Kick the detected actor", value: "kick" },
        { label: "Ban", description: "Ban the detected actor", value: "ban" },
        { label: "Timeout", description: "Temporarily timeout the detected actor", value: "timeout" }
      );

    return interaction.reply({
      content: "Select the punishment for detected antinuke activity:",
      components: [new ActionRowBuilder().addComponents(menu)],
      ephemeral: true
    });
  }

  if (id === "pyrr_an_add_user") {
    return interaction.reply({
      content: "Choose a member to add to the antinuke whitelist:",
      components: [whitelistMenu(interaction.guild, "user", "add")],
      ephemeral: true
    });
  }

  if (id === "pyrr_an_add_role") {
    return interaction.reply({
      content: "Choose a role to add to the antinuke whitelist:",
      components: [whitelistMenu(interaction.guild, "role", "add")],
      ephemeral: true
    });
  }

  if (id === "pyrr_an_remove") {
    const row1 = whitelistMenu(interaction.guild, "user", "remove");
    const row2 = whitelistMenu(interaction.guild, "role", "remove");

    return interaction.reply({
      content: "Select a whitelisted user or role to remove:",
      components: [row1, row2],
      ephemeral: true
    });
  }
});

/* Antinuke select menus */

client.on("interactionCreate", async interaction => {
  if (!interaction.isStringSelectMenu()) return;
  if (!interaction.customId.startsWith("pyrr_an_")) return;

  if (!interaction.guild) {
    return interaction.reply({
      content: "This menu only works inside a server.",
      ephemeral: true
    });
  }

  if (!isAntinukeController(interaction)) {
    return interaction.reply({
      content: "You are not allowed to change these settings.",
      ephemeral: true
    });
  }

  const cfg = getConfig(interaction.guild.id).antinuke;
  const id = interaction.customId;
  const value = interaction.values[0];

  if (value === "pyrr_none") {
    return interaction.reply({
      content: "No entries are available for this selection.",
      ephemeral: true
    });
  }

  if (id === "pyrr_an_choose_punishment") {
    if (!["kick", "ban", "timeout"].includes(value)) {
      return interaction.reply({
        content: "Invalid punishment choice.",
        ephemeral: true
      });
    }

    cfg.punishment = value;
    saveDatabase();

    return interaction.update({
      content: `Antinuke punishment set to **${value.toUpperCase()}**.`,
      components: []
    });
  }

  if (id === "pyrr_an_wl_add_user") {
    if (!cfg.protectedUsers.includes(value)) {
      cfg.protectedUsers.push(value);
    }
    saveDatabase();

    return interaction.update({
      content: `User <@${value}> added to the antinuke whitelist.`,
      components: []
    });
  }

  if (id === "pyrr_an_wl_add_role") {
    if (!cfg.protectedRoles.includes(value)) {
      cfg.protectedRoles.push(value);
    }
    saveDatabase();

    return interaction.update({
      content: `Role <@&${value}> added to the antinuke whitelist.`,
      components: []
    });
  }

  if (id === "pyrr_an_wl_remove_user") {
    cfg.protectedUsers = cfg.protectedUsers.filter(id => id !== value);
    saveDatabase();

    return interaction.update({
      content: `User whitelist entry removed: \`${value}\`.`,
      components: []
    });
  }

  if (id === "pyrr_an_wl_remove_role") {
    cfg.protectedRoles = cfg.protectedRoles.filter(id => id !== value);
    saveDatabase();

    return interaction.update({
      content: `Role whitelist entry removed: \`${value}\`.`,
      components: []
    });
  }
});

// PART 3 END — APPEND PART 4 BELOW
          
/* ================================
   PYRR OFFICIAL — PART 4
   ANTINUKE EVENT MONITOR
================================ */

const antinukeActionHistory = new Map();
const antinukePunishedActors = new Set();

async function sendAntinukeLog(guild, description) {
  try {
    const cfg = getConfig(guild.id).antinuke;
    if (!cfg.logChannelId) return;

    const channel = guild.channels.cache.get(cfg.logChannelId);
    if (!channel || !channel.isTextBased()) return;

    await channel.send({
      embeds: [
        makeEmbed("ANTINUKE SECURITY LOG", description)
      ]
    });
  } catch (error) {
    console.error("Antinuke log error:", error.message);
  }
}

function getAntinukeActionName(action) {
  const names = new Map([
    [AuditLogEvent.ChannelDelete, "channelDelete"],
    [AuditLogEvent.RoleDelete, "roleDelete"],
    [AuditLogEvent.MemberBanAdd, "ban"],
    [AuditLogEvent.MemberKick, "kick"],
    [AuditLogEvent.WebhookCreate, "webhookCreate"],
    [AuditLogEvent.BotAdd, "botAdd"]
  ]);

  return names.get(action) || null;
}

function actorIsProtected(guild, cfg, actorId) {
  if (!actorId) return true;
  if (actorId === guild.ownerId) return true;
  if (client.user && actorId === client.user.id) return true;
  if (isOwner(actorId)) return true;
  if (cfg.protectedUsers.includes(actorId)) return true;

  const member = guild.members.cache.get(actorId);

  if (member && member.roles.cache.some(
    role => cfg.protectedRoles.includes(role.id)
  )) {
    return true;
  }

  return false;
}

async function punishAntinukeActor(guild, actorId, actionName) {
  const cfg = getConfig(guild.id).antinuke;
  const an = cfg.ant in Object(cfg) ? cfg.ant : cfg;

  if (!an.enabled || actorIsProtected(guild, an, actorId)) return;

  const punishmentKey = `${guild.id}:${actorId}`;

  if (antinukePunishedActors.has(punishmentKey)) return;
  antinukePunishedActors.add(punishmentKey);

  let outcome = "No punishment was applied.";

  try {
    const actor = await guild.members.fetch(actorId).catch(() => null);

    if (!actor) {
      outcome = "Actor is no longer a member or could not be fetched.";
    } else if (!guild.members.me) {
      outcome = "Unable to verify the bot's server permissions.";
    } else {
      const me = guild.members.me;
      const botCanAct = me.permissions.has(
        PermissionsBitField.Flags.KickMembers
      );

      if (
        actor.id === guild.ownerId ||
        actor.id === client.user.id ||
        actor.roles.highest.position >= me.roles.highest.position
      ) {
        outcome = "Punishment skipped because the actor cannot be moderated by the bot.";
      } else if (an.punishment === "kick" && botCanAct) {
        await actor.kick("PYRR Antinuke: action limit exceeded.");
        outcome = "Actor was kicked.";
      } else if (
        an.punishment === "ban" &&
        me.permissions.has(PermissionsBitField.Flags.BanMembers)
      ) {
        await actor.ban({
          reason: "PYRR Antinuke: action limit exceeded."
        });
        outcome = "Actor was banned.";
      } else if (
        an.punishment === "timeout" &&
        me.permissions.has(PermissionsBitField.Flags.ModerateMembers)
      ) {
        await actor.timeout(
          10 * 60 * 1000,
          "PYRR Antinuke: action limit exceeded."
        );
        outcome = "Actor received a 10-minute timeout.";
      } else {
        outcome = "The bot lacks the required permission for this punishment.";
      }
    }
  } catch (error) {
    outcome = `Punishment failed: ${String(error.message).slice(0, 250)}`;
    console.error("Antinuke punishment error:", error);
  }

  await sendAntinukeLog(
    guild,
    [
      `**Actor:** <@${actorId}> (\`${actorId}\`)`,
      `**Detected action:** \`${actionName}\``,
      `**Configured punishment:** \`${an.punishment}\``,
      `**Result:** ${outcome}`
    ].join("\n")
  );

  // Avoid repeated punishments for the same actor during this process.
  // Clear the guard after a short cooldown.
  setTimeout(() => {
    antinukePunishedActors.delete(punishmentKey);
  }, 60_000);
}

client.on("guildAuditLogEntryCreate", async (entry, guild) => {
  try {
    if (!guild || !entry.executorId) return;

    const cfg = getConfig(guild.id).antinuke;
    const an = cfg.antinuke || cfg;

    if (!an.enabled) return;

    const actionName = getAntinukeActionName(entry.action);
    if (!actionName) return;

    // Respect the action switches configured for the antinuke system.
    if (
      an.actions &&
      Object.prototype.hasOwnProperty.call(an.actions, actionName) &&
      !an.actions[actionName]
    ) {
      return;
    }

    const actorId = entry.executorId;

    if (actorIsProtected(guild, an, actorId)) return;

    const now = Date.now();
    const windowMs = Math.max(1, Number(an.windowSeconds) || 10) * 1000;
    const limit = Math.max(1, Number(an.limit) || 3);
    const historyKey = `${guild.id}:${actorId}:${actionName}`;

    const timestamps = (
      antinukeActionHistory.get(historyKey) || []
    ).filter(timestamp => now - timestamp <= windowMs);

    timestamps.push(now);
    antinukeActionHistory.set(historyKey, timestamps);

    if (timestamps.length < limit) {
      await sendAntinukeLog(
        guild,
        [
          `**Actor:** <@${actorId}>`,
          `**Action:** \`${actionName}\``,
          `**Count:** ${timestamps.length}/${limit}`,
          `**Window:** ${an.windowSeconds} seconds`,
          "**Status:** Activity recorded."
        ].join("\n")
      );
      return;
    }

    // Reset the counter before attempting punishment so the same
    // audit-log burst does not immediately trigger duplicate actions.
    antinukeActionHistory.set(historyKey, []);

    await sendAntinukeLog(
      guild,
      [
        `**Actor:** <@${actorId}>`,
        `**Action:** \`${actionName}\``,
        `**Count:** ${timestamps.length}/${limit}`,
        "**Status:** Action limit exceeded."
      ].join("\n")
    );

    await punishAntinukeActor(guild, actorId, actionName);
  } catch (error) {
    console.error("Antinuke monitor error:", error);
  }
});

// PART 4 END — APPEND PART 5 BELOW
        
/* ================================
   PYRR OFFICIAL — PART 5
   MODERATION COMMANDS
================================ */

function moderationAllowed(ctx, permission) {
  if (!ctx.guild || !ctx.member) {
    ctx.reply("This command can only be used in a server.");
    return false;
  }

  if (isOwner(ctx.user.id) || ctx.guild.ownerId === ctx.user.id) {
    return true;
  }

  if (!ctx.member.permissions.has(permission)) {
    ctx.reply("You do not have permission to use this command.");
    return false;
  }

  return true;
}

function extractId(value) {
  if (!value) return null;
  const match = String(value).match(/\d{17,20}/);
  return match ? match[0] : null;
}

async function resolveTargetMember(ctx, args = [], optionName = "user") {
  if (!ctx.guild) return null;

  const selectedUser = ctx.getUser(optionName);
  const id = selectedUser?.id || extractId(args[0]);

  if (!id) return null;

  return ctx.guild.members.fetch(id).catch(() => null);
}

function moderationReason(ctx, args = [], start = 1) {
  const slashReason = ctx.getString("reason");
  if (slashReason) return slashReason.slice(0, 450);

  const reason = args.slice(start).join(" ").trim();
  return (reason || "No reason provided").slice(0, 450);
}

function parseDurationMs(input) {
  if (!input) return null;

  const match = String(input).trim().toLowerCase()
    .match(/^(\d+)(s|m|h|d)$/);

  if (!match) return null;

  const amount = Number(match[1]);
  const unit = match[2];

  const multiplier = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000
  }[unit];

  const duration = amount * multiplier;

  if (!Number.isFinite(duration) || duration <= 0) return null;
  return duration;
}

function canModerateTarget(ctx, target) {
  if (!target) {
    ctx.reply("Member not found. Check the mention or user ID.");
    return false;
  }

  if (target.id === ctx.user.id) {
    ctx.reply("You cannot use this command on yourself.");
    return false;
  }

  if (target.id === ctx.guild.ownerId) {
    ctx.reply("The server owner cannot be moderated by this command.");
    return false;
  }

  if (
    !isOwner(ctx.user.id) &&
    ctx.guild.ownerId !== ctx.user.id &&
    target.roles.highest.position >= ctx.member.roles.highest.position
  ) {
    ctx.reply("Your highest role must be above the target's highest role.");
    return false;
  }

  return true;
}

/* BAN */

registerCommand({
  name: "ban",
  description: "Ban a member from the server.",
  category: "Moderation",
  options: [
    {
      name: "user",
      description: "Member to ban",
      type: "user",
      required: true
    },
    {
      name: "reason",
      description: "Reason for the ban",
      type: "string",
      required: false
    }
  ],
  execute: async (ctx, args) => {
    if (!moderationAllowed(ctx, PermissionsBitField.Flags.BanMembers)) return;

    const target = await resolveTargetMember(ctx, args);
    if (!canModerateTarget(ctx, target)) return;

    const reason = moderationReason(ctx, args, 1);
    const me = ctx.guild.members.me;

    if (!me?.permissions.has(PermissionsBitField.Flags.BanMembers)) {
      return ctx.reply("I need the **Ban Members** permission.");
    }

    if (target.roles.highest.position >= me.roles.highest.position) {
      return ctx.reply("My highest role must be above the target's highest role.");
    }

    await target.ban({ reason: `${ctx.user.tag}: ${reason}` });

    return ctx.reply({
      embeds: [makeEmbed(
        "MEMBER BANNED",
        `${SYMBOL.success} **Member:** ${target.user.tag}\n**Reason:** ${reason}`
      )]
    });
  }
});

/* KICK */

registerCommand({
  name: "kick",
  description: "Kick a member from the server.",
  category: "Moderation",
  options: [
    {
      name: "user",
      description: "Member to kick",
      type: "user",
      required: true
    },
    {
      name: "reason",
      description: "Reason for the kick",
      type: "string",
      required: false
    }
  ],
  execute: async (ctx, args) => {
    if (!moderationAllowed(ctx, PermissionsBitField.Flags.KickMembers)) return;

    const target = await resolveTargetMember(ctx, args);
    if (!canModerateTarget(ctx, target)) return;

    const reason = moderationReason(ctx, args, 1);
    const me = ctx.guild.members.me;

    if (!me?.permissions.has(PermissionsBitField.Flags.KickMembers)) {
      return ctx.reply("I need the **Kick Members** permission.");
    }

    if (target.roles.highest.position >= me.roles.highest.position) {
      return ctx.reply("My highest role must be above the target's highest role.");
    }

    await target.kick(`${ctx.user.tag}: ${reason}`);

    return ctx.reply({
      embeds: [makeEmbed(
        "MEMBER KICKED",
        `${SYMBOL.success} **Member:** ${target.user.tag}\n**Reason:** ${reason}`
      )]
    });
  }
});

/* TIMEOUT */

registerCommand({
  name: "timeout",
  description: "Timeout a member for a specified duration.",
  category: "Moderation",
  options: [
    {
      name: "user",
      description: "Member to timeout",
      type: "user",
      required: true
    },
    {
      name: "duration",
      description: "Examples: 10m, 2h, 1d",
      type: "string",
      required: true
    },
    {
      name: "reason",
      description: "Reason for the timeout",
      type: "string",
      required: false
    }
  ],
  execute: async (ctx, args) => {
    if (!moderationAllowed(ctx, PermissionsBitField.Flags.ModerateMembers)) return;

    const target = await resolveTargetMember(ctx, args);
    if (!canModerateTarget(ctx, target)) return;

    const durationText = ctx.getString("duration") || args[1];
    const duration = parseDurationMs(durationText);

    if (!duration || duration > 28 * 24 * 60 * 60 * 1000) {
      return ctx.reply("Use a duration such as `10m`, `2h`, or `1d` (maximum 28 days).");
    }

    const me = ctx.guild.members.me;

    if (!me?.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
      return ctx.reply("I need the **Moderate Members** permission.");
    }

    if (target.roles.highest.position >= me.roles.highest.position) {
      return ctx.reply("My highest role must be above the target's highest role.");
    }

    const reason = moderationReason(ctx, args, 2);

    await target.timeout(duration, `${ctx.user.tag}: ${reason}`);

    return ctx.reply({
      embeds: [makeEmbed(
        "MEMBER TIMED OUT",
        `${SYMBOL.success} **Member:** ${target.user.tag}\n**Duration:** ${durationText}\n**Reason:** ${reason}`
      )]
    });
  }
});

/* REMOVE TIMEOUT */

registerCommand({
  name: "untimeout",
  description: "Remove a member's timeout.",
  category: "Moderation",
  aliases: ["untime"],
  options: [
    {
      name: "user",
      description: "Member to untimeout",
      type: "user",
      required: true
    }
  ],
  execute: async (ctx, args) => {
    if (!moderationAllowed(ctx, PermissionsBitField.Flags.ModerateMembers)) return;

    const target = await resolveTargetMember(ctx, args);
    if (!canModerateTarget(ctx, target)) return;

    if (!ctx.guild.members.me?.permissions.has(
      PermissionsBitField.Flags.ModerateMembers
    )) {
      return ctx.reply("I need the **Moderate Members** permission.");
    }

    await target.timeout(null, `Timeout removed by ${ctx.user.tag}`);

    return ctx.reply({
      embeds: [makeEmbed(
        "TIMEOUT REMOVED",
        `${SYMBOL.success} Timeout removed for **${target.user.tag}**.`
      )]
    });
  }
});

/* UNBAN */

registerCommand({
  name: "unban",
  description: "Unban a user by their ID.",
  category: "Moderation",
  options: [
    {
      name: "user_id",
      description: "ID of the banned user",
      type: "string",
      required: true
    },
    {
      name: "reason",
      description: "Reason for the unban",
      type: "string",
      required: false
    }
  ],
  execute: async (ctx, args) => {
    if (!moderationAllowed(ctx, PermissionsBitField.Flags.BanMembers)) return;

    const id = ctx.getString("user_id") || args[0];
    if (!/^\d{17,20}$/.test(String(id || ""))) {
      return ctx.reply("Provide a valid Discord user ID.");
    }

    if (!ctx.guild.members.me?.permissions.has(
      PermissionsBitField.Flags.BanMembers
    )) {
      return ctx.reply("I need the **Ban Members** permission.");
    }

    const reason = moderationReason(ctx, args, 1);

    await ctx.guild.members.unban(id, `${ctx.user.tag}: ${reason}`);

    return ctx.reply({
      embeds: [makeEmbed(
        "USER UNBANNED",
        `${SYMBOL.success} **User ID:** ${id}\n**Reason:** ${reason}`
      )]
    });
  }
});

/* PURGE MESSAGES */

registerCommand({
  name: "purge",
  description: "Bulk-delete recent messages.",
  category: "Moderation",
  options: [
    {
      name: "amount",
      description: "Number of messages, from 1 to 100",
      type: "integer",
      required: true
    }
  ],
  execute: async (ctx, args) => {
    if (!moderationAllowed(ctx, PermissionsBitField.Flags.ManageMessages)) return;

    const amount = ctx.getInteger("amount") ?? Number(args[0]);

    if (!Number.isInteger(amount) || amount < 1 || amount > 100) {
      return ctx.reply("Choose an amount from 1 to 100.");
    }

    if (!ctx.channel?.bulkDelete) {
      return ctx.reply("This channel does not support bulk deletion.");
    }

    if (!ctx.guild.members.me?.permissions.has(
      PermissionsBitField.Flags.ManageMessages
    )) {
      return ctx.reply("I need the **Manage Messages** permission.");
    }

    // Discord cannot bulk-delete messages older than 14 days.
    const deleted = await ctx.channel.bulkDelete(amount, true);

    return ctx.reply({
      embeds: [makeEmbed(
        "MESSAGES PURGED",
        `${SYMBOL.success} Deleted **${deleted.size}** recent messages.`
      )]
    });
  }
});

/* LOCK CHANNEL */

registerCommand({
  name: "lock",
  description: "Prevent members from sending messages in this channel.",
  category: "Moderation",
  execute: async (ctx) => {
    if (!moderationAllowed(ctx, PermissionsBitField.Flags.ManageChannels)) return;

    if (!ctx.guild.members.me?.permissions.has(
      PermissionsBitField.Flags.ManageChannels
    )) {
      return ctx.reply("I need the **Manage Channels** permission.");
    }

    await ctx.channel.permissionOverwrites.edit(
      ctx.guild.roles.everyone,
      { SendMessages: false },
      { reason: `Channel locked by ${ctx.user.tag}` }
    );

    return ctx.reply({
      embeds: [makeEmbed(
        "CHANNEL LOCKED",
        `${SYMBOL.success} ${ctx.channel} has been locked for @everyone.`
      )]
    });
  }
});

/* UNLOCK CHANNEL */

registerCommand({
  name: "unlock",
  description: "Restore the default send-message permission.",
  category: "Moderation",
  execute: async (ctx) => {
    if (!moderationAllowed(ctx, PermissionsBitField.Flags.ManageChannels)) return;

    if (!ctx.guild.members.me?.permissions.has(
      PermissionsBitField.Flags.ManageChannels
    )) {
      return ctx.reply("I need the **Manage Channels** permission.");
    }

    await ctx.channel.permissionOverwrites.edit(
      ctx.guild.roles.everyone,
      { SendMessages: null },
      { reason: `Channel unlocked by ${ctx.user.tag}` }
    );

    return ctx.reply({
      embeds: [makeEmbed(
        "CHANNEL UNLOCKED",
        `${SYMBOL.success} Default send-message permissions restored in ${ctx.channel}.`
      )]
    });
  }
});

/* SLOWMODE */

registerCommand({
  name: "slowmode",
  description: "Set the channel slowmode in seconds.",
  category: "Moderation",
  options: [
    {
      name: "seconds",
      description: "Seconds from 0 to 21600",
      type: "integer",
      required: true
    }
  ],
  execute: async (ctx, args) => {
    if (!moderationAllowed(ctx, PermissionsBitField.Flags.ManageChannels)) return;

    const seconds = ctx.getInteger("seconds") ?? Number(args[0]);

    if (!Number.isInteger(seconds) || seconds < 0 || seconds > 21600) {
      return ctx.reply("Choose a number from 0 to 21600 seconds.");
    }

    if (!ctx.channel?.setRateLimitPerUser) {
      return ctx.reply("This channel does not support slowmode.");
    }

    await ctx.channel.setRateLimitPerUser(
      seconds,
      `Slowmode changed by ${ctx.user.tag}`
    );

    return ctx.reply({
      embeds: [makeEmbed(
        "SLOWMODE UPDATED",
        `${SYMBOL.success} Slowmode is now **${seconds} seconds**.`
      )]
    });
  }
});

/* ROLE MANAGEMENT */

registerCommand({
  name: "role",
  description: "Add or remove a role from a member.",
  category: "Moderation",
  options: [
    {
      name: "user",
      description: "Member to update",
      type: "user",
      required: true
    },
    {
      name: "role",
      description: "Role to add or remove",
      type: "role",
      required: true
    },
    {
      name: "action",
      description: "Choose add or remove",
      type: "string",
      required: true
    }
  ],
  execute: async (ctx, args) => {
    if (!moderationAllowed(ctx, PermissionsBitField.Flags.ManageRoles)) return;

    const target = await resolveTargetMember(ctx, args);
    if (!canModerateTarget(ctx, target)) return;

    const selectedRole = ctx.getRole("role");
    const roleId = selectedRole?.id || extractId(args[1]);
    const role = roleId ? ctx.guild.roles.cache.get(roleId) : null;
    const action = (ctx.getString("action") || args[2] || "").toLowerCase();

    if (!role) return ctx.reply("Role not found.");
    if (!["add", "remove"].includes(action)) {
      return ctx.reply("Choose `add` or `remove`.");
    }

    const me = ctx.guild.members.me;

    if (!me?.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
      return ctx.reply("I need the **Manage Roles** permission.");
    }

    if (role.managed || role.position >= me.roles.highest.position) {
      return ctx.reply("I cannot manage that role because of its position or managed status.");
    }

    if (
      !isOwner(ctx.user.id) &&
      ctx.guild.ownerId !== ctx.user.id &&
      role.position >= ctx.member.roles.highest.position
    ) {
      return ctx.reply("Your highest role must be above the selected role.");
    }

    if (action === "add") {
      await target.roles.add(role, `Role added by ${ctx.user.tag}`);
    } else {
      await target.roles.remove(role, `Role removed by ${ctx.user.tag}`);
    }

    return ctx.reply({
      embeds: [makeEmbed(
        "ROLE UPDATED",
        `${SYMBOL.success} **Action:** ${action}\n**Member:** ${target.user.tag}\n**Role:** ${role.name}`
      )]
    });
  }
});

// PART 5 END — APPEND PART 6 BELOW
    
/* ================================
   PYRR OFFICIAL — PART 6
   JAIL, SNIPE & EMOJI UTILITIES
================================ */

// Store deleted and edited messages in memory.
const pyrrSnipes = new Map();
const pyrrEditSnipes = new Map();

function getSnipeKey(channelId) {
  return `pyrr_snipe_${channelId}`;
}

function getEditSnipeKey(channelId) {
  return `pyrr_editsnipe_${channelId}`;
}

function hasManageMessages(ctx) {
  return (
    isOwner(ctx.user.id) ||
    ctx.guild?.ownerId === ctx.user.id ||
    ctx.member?.permissions.has(PermissionsBitField.Flags.ManageMessages)
  );
}

/* MESSAGE TRACKING */

client.on("messageDelete", message => {
  try {
    if (!message.guild || message.author?.bot) return;
    if (!message.content && !message.attachments.size) return;

    pyrrSnipes.set(getSnipeKey(message.channel.id), {
      authorId: message.author?.id || null,
      authorTag: message.author?.tag || "Unknown user",
      content: message.content || "(No text content)",
      attachments: [...message.attachments.values()].map(item => item.url),
      deletedAt: Date.now()
    });
  } catch (error) {
    console.error("Snipe tracking error:", error.message);
  }
});

client.on("messageUpdate", (oldMessage, newMessage) => {
  try {
    if (!newMessage.guild || newMessage.author?.bot) return;
    if (oldMessage.content === newMessage.content) return;
    if (!oldMessage.content && !newMessage.content) return;

    pyrrEditSnipes.set(getEditSnipeKey(newMessage.channel.id), {
      authorId: newMessage.author?.id || null,
      authorTag: newMessage.author?.tag || "Unknown user",
      before: oldMessage.content || "(Original content unavailable)",
      after: newMessage.content || "(No text content)",
      editedAt: Date.now()
    });
  } catch (error) {
    console.error("Edit-snipe tracking error:", error.message);
  }
});

/* SNIPE */

registerCommand({
  name: "snipe",
  description: "Show the most recently deleted message in this channel.",
  category: "Utility",
  execute: async ctx => {
    if (!ctx.guild) return ctx.reply("Use this command in a server.");

    const data = pyrrSnipes.get(getSnipeKey(ctx.channel.id));
    if (!data) return ctx.reply("No deleted message is available in this channel.");

    const embed = makeEmbed(
      "MESSAGE SNIPE",
      [
        `**Author:** ${data.authorId ? `<@${data.authorId}>` : data.authorTag}`,
        `**Deleted:** <t:${Math.floor(data.deletedAt / 1000)}:R>`,
        "",
        data.content.slice(0, 2500),
        data.attachments.length
          ? `\n**Attachments:**\n${data.attachments.slice(0, 5).join("\n")}`
          : ""
      ].join("\n")
    );

    return ctx.reply({ embeds: [embed] });
  }
});

/* CLEAR SNIPE */

registerCommand({
  name: "clearsnipe",
  description: "Clear the saved deleted-message record for this channel.",
  category: "Utility",
  execute: async ctx => {
    if (!ctx.guild) return ctx.reply("Use this command in a server.");
    if (!hasManageMessages(ctx)) {
      return ctx.reply("You need Manage Messages permission.");
    }

    const existed = pyrrSnipes.delete(getSnipeKey(ctx.channel.id));

    return ctx.reply(
      existed
        ? "Deleted-message record cleared for this channel."
        : "There is no saved deleted-message record."
    );
  }
});

/* EDIT SNIPE */

registerCommand({
  name: "editsnipe",
  description: "Show the most recently edited message in this channel.",
  category: "Utility",
  execute: async ctx => {
    if (!ctx.guild) return ctx.reply("Use this command in a server.");

    const data = pyrrEditSnipes.get(getEditSnipeKey(ctx.channel.id));
    if (!data) return ctx.reply("No edited message is available in this channel.");

    return ctx.reply({
      embeds: [
        makeEmbed(
          "EDIT SNIPE",
          [
            `**Author:** ${data.authorId ? `<@${data.authorId}>` : data.authorTag}`,
            `**Edited:** <t:${Math.floor(data.editedAt / 1000)}:R>`,
            "",
            "**Before:**",
            data.before.slice(0, 1500),
            "",
            "**After:**",
            data.after.slice(0, 1500)
          ].join("\n")
        )
      ]
    });
  }
});

/* STEAL EMOJI */

registerCommand({
  name: "stealemoji",
  description: "Add a custom emoji from a URL or emoji markup.",
  category: "Utility",
  options: [
    {
      name: "emoji",
      description: "Custom emoji markup or direct image URL",
      type: "string",
      required: true
    },
    {
      name: "name",
      description: "Name for the new emoji",
      type: "string",
      required: false
    }
  ],
  execute: async (ctx, args) => {
    if (!ctx.guild) return ctx.reply("Use this command in a server.");

    if (
      !isOwner(ctx.user.id) &&
      ctx.guild.ownerId !== ctx.user.id &&
      !ctx.member?.permissions.has(PermissionsBitField.Flags.ManageEmojisAndStickers)
    ) {
      return ctx.reply("You need Manage Expressions permission.");
    }

    if (!ctx.guild.members.me?.permissions.has(
      PermissionsBitField.Flags.ManageEmojisAndStickers
    )) {
      return ctx.reply("I need the Manage Expressions permission.");
    }

    const input = ctx.getString("emoji") || args[0] || "";
    const customMatch = input.match(/^<a?:([a-zA-Z0-9_]{2,32}):(\d{17,20})>$/);

    let imageUrl = input;
    let emojiName = ctx.getString("name") || args[1] || "pyrr_emoji";

    if (customMatch) {
      emojiName = ctx.getString("name") || args[1] || customMatch[1];
      const animated = input.startsWith("<a:");
      imageUrl = `https://cdn.discordapp.com/emojis/${customMatch[2]}.${animated ? "gif" : "png"}`;
    }

    if (!/^https:\/\/\S+$/i.test(imageUrl)) {
      return ctx.reply("Provide a custom emoji like `<:name:id>` or a direct HTTPS image URL.");
    }

    if (!/^[a-zA-Z0-9_]{2,32}$/.test(emojiName)) {
      return ctx.reply("Emoji name must be 2–32 letters, numbers, or underscores.");
    }

    try {
      const response = await fetch(imageUrl);

      if (!response.ok) {
        return ctx.reply("Could not download that image. Check the URL and try again.");
      }

      const contentType = response.headers.get("content-type") || "";

      if (!contentType.startsWith("image/")) {
        return ctx.reply("That URL does not appear to point to an image.");
      }

      const bytes = Buffer.from(await response.arrayBuffer());

      if (!bytes.length || bytes.length > 256 * 1024) {
        return ctx.reply("The image is empty or exceeds the 256 KB upload limit.");
      }

      const emoji = await ctx.guild.emojis.create({
        attachment: bytes,
        name: emojiName,
        reason: `Emoji added by ${ctx.user.tag}`
      });

      return ctx.reply({
        embeds: [
          makeEmbed(
            "EMOJI ADDED",
            `${SYMBOL.success} Added ${emoji} as **${emoji.name}**.`
          )
        ]
      });
    } catch (error) {
      console.error("Steal emoji error:", error.message);
      return ctx.reply("Could not add the emoji. Check permissions and server emoji limits.");
    }
  }
});

/* JAIL CONFIGURATION */

function getJailConfig(guildId) {
  const cfg = getConfig(guildId);

  if (!cfg.jail) {
    cfg.jail = {
      roleId: null,
      savedRoles: {}
    };
  }

  if (!cfg.jail.savedRoles) cfg.jail.savedRoles = {};
  return cfg.jail;
}

/* SET JAIL ROLE */

registerCommand({
  name: "setjail",
  description: "Configure the jail role for this server.",
  category: "Moderation",
  options: [
    {
      name: "role",
      description: "Role to use as the jail role",
      type: "role",
      required: true
    }
  ],
  execute: async (ctx, args) => {
    if (!ctx.guild) return ctx.reply("Use this command in a server.");

    if (
      !isOwner(ctx.user.id) &&
      ctx.guild.ownerId !== ctx.user.id &&
      !ctx.member?.permissions.has(PermissionsBitField.Flags.ManageRoles)
    ) {
      return ctx.reply("You need Manage Roles permission.");
    }

    const selectedRole = ctx.getRole("role");
    const roleId = selectedRole?.id || extractId(args[0]);
    const role = roleId ? ctx.guild.roles.cache.get(roleId) : null;

    if (!role) return ctx.reply("Jail role not found.");
    if (role.managed) return ctx.reply("Managed roles cannot be used as the jail role.");

    const me = ctx.guild.members.me;

    if (!me?.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
      return ctx.reply("I need Manage Roles permission.");
    }

    if (role.position >= me.roles.highest.position) {
      return ctx.reply("My highest role must be above the jail role.");
    }

    getJailConfig(ctx.guild.id).roleId = role.id;
    saveDatabase();

    return ctx.reply(`Jail role set to ${role}.`);
  }
});

/* JAIL MEMBER */

registerCommand({
  name: "jail",
  description: "Assign the configured jail role to a member.",
  category: "Moderation",
  options: [
    {
      name: "user",
      description: "Member to jail",
      type: "user",
      required: true
    },
    {
      name: "reason",
      description: "Reason",
      type: "string",
      required: false
    }
  ],
  execute: async (ctx, args) => {
    if (!ctx.guild) return ctx.reply("Use this command in a server.");

    if (!moderationAllowed(ctx, PermissionsBitField.Flags.ManageRoles)) return;

    const target = await resolveTargetMember(ctx, args);
    if (!canModerateTarget(ctx, target)) return;

    const jail = getJailConfig(ctx.guild.id);
    const role = jail.roleId ? ctx.guild.roles.cache.get(jail.roleId) : null;

    if (!role) {
      return ctx.reply("Jail role is not configured. Use `,setjail @role` first.");
    }

    const me = ctx.guild.members.me;

    if (!me?.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
      return ctx.reply("I need Manage Roles permission.");
    }

    if (role.position >= me.roles.highest.position) {
      return ctx.reply("My highest role must be above the jail role.");
    }

    if (target.roles.highest.position >= me.roles.highest.position) {
      return ctx.reply("My highest role must be above the target's highest role.");
    }

    const saved = target.roles.cache
      .filter(item => item.id !== ctx.guild.id && !item.managed)
      .map(item => item.id);

    jail.savedRoles[target.id] = saved;

    await target.roles.set([role.id], `Jailed by ${ctx.user.tag}`);
    saveDatabase();

    return ctx.reply({
      embeds: [
        makeEmbed(
          "MEMBER JAILED",
          `${SYMBOL.success} **Member:** ${target.user.tag}\n**Reason:** ${moderationReason(ctx, args, 1)}`
        )
      ]
    });
  }
});

/* UNJAIL MEMBER */

registerCommand({
  name: "unjail",
  description: "Restore saved roles to a jailed member.",
  category: "Moderation",
  options: [
    {
      name: "user",
      description: "Member to unjail",
      type: "user",
      required: true
    }
  ],
  execute: async (ctx, args) => {
    if (!ctx.guild) return ctx.reply("Use this command in a server.");

    if (!moderationAllowed(ctx, PermissionsBitField.Flags.ManageRoles)) return;

    const target = await resolveTargetMember(ctx, args);
    if (!canModerateTarget(ctx, target)) return;

    const jail = getJailConfig(ctx.guild.id);
    const saved = jail.savedRoles[target.id];

    if (!saved) {
      return ctx.reply("No saved role record was found for this member.");
    }

    const me = ctx.guild.members.me;

    if (!me?.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
      return ctx.reply("I need Manage Roles permission.");
    }

    const restorable = saved.filter(roleId => {
      const role = ctx.guild.roles.cache.get(roleId);
      return role && !role.managed && role.position < me.roles.highest.position;
    });

    await target.roles.set(
      restorable,
      `Unjailed by ${ctx.user.tag}`
    );

    delete jail.savedRoles[target.id];
    saveDatabase();

    return ctx.reply({
      embeds: [
        makeEmbed(
          "MEMBER UNJAILED",
          `${SYMBOL.success} Restored **${restorable.length}** role(s) to ${target.user.tag}.`
        )
      ]
    });
  }
});

/* JAIL LIST */

registerCommand({
  name: "jllist",
  description: "List members with saved jail records.",
  category: "Moderation",
  execute: async ctx => {
    if (!ctx.guild) return ctx.reply("Use this command in a server.");

    if (
      !isOwner(ctx.user.id) &&
      ctx.guild.ownerId !== ctx.user.id &&
      !ctx.member?.permissions.has(PermissionsBitField.Flags.ManageRoles)
    ) {
      return ctx.reply("You need Manage Roles permission.");
    }

    const jail = getJailConfig(ctx.guild.id);
    const entries = Object.keys(jail.savedRoles);

    if (!entries.length) {
      return ctx.reply("No jail records were found.");
    }

    const lines = entries.slice(0, 40).map(id => `▪ <@${id}> — \`${id}\``);

    return ctx.reply({
      embeds: [
        makeEmbed("JAIL RECORDS", lines.join("\n"))
      ]
    });
  }
});

// PART 6 END — APPEND PART 7 BELOW
  
/* ================================
   PYRR OFFICIAL — PART 7
   UTILITY & AUTOMATION COMMANDS
================================ */

const pyrrAfkUsers = new Map();

function getUtilityConfig(guildId) {
  const cfg = getConfig(guildId);

  if (!cfg.autoReact) cfg.autoReact = [];
  if (!cfg.autoRespond) cfg.autoRespond = [];

  return cfg;
}

function cleanUsername(value) {
  return String(value || "")
    .trim()
    .replace(/^@/, "")
    .replace(/[^a-zA-Z0-9._]/g, "")
    .slice(0, 50);
}

function makeSocialEmbed(platform, username, url) {
  return makeEmbed(
    `${platform.toUpperCase()} PROFILE`,
    [
      `**Username:** ${username}`,
      `**Profile:** ${url}`,
      "",
      "Live account statistics are not available through this command."
    ].join("\n")
  );
}

/* INSTAGRAM */

registerCommand({
  name: "ig",
  description: "Show an Instagram profile link.",
  category: "Utility",
  options: [
    {
      name: "username",
      description: "Instagram username",
      type: "string",
      required: true
    }
  ],
  execute: async (ctx, args) => {
    const username = cleanUsername(
      ctx.getString("username") || args[0]
    );

    if (!username) {
      return ctx.reply("Usage: `,ig username`");
    }

    const url = `https://www.instagram.com/${encodeURIComponent(username)}/`;

    return ctx.reply({
      embeds: [makeSocialEmbed("Instagram", `@${username}`, url)]
    });
  }
});

/* TIKTOK */

registerCommand({
  name: "tt",
  description: "Show a TikTok profile link.",
  category: "Utility",
  aliases: ["tiktok"],
  options: [
    {
      name: "username",
      description: "TikTok username",
      type: "string",
      required: true
    }
  ],
  execute: async (ctx, args) => {
    const username = cleanUsername(
      ctx.getString("username") || args[0]
    );

    if (!username) {
      return ctx.reply("Usage: `,tt username`");
    }

    const url = `https://www.tiktok.com/@${encodeURIComponent(username)}`;

    return ctx.reply({
      embeds: [makeSocialEmbed("TikTok", `@${username}`, url)]
    });
  }
});

/* YOUTUBE */

registerCommand({
  name: "yt",
  description: "Show a YouTube channel or handle link.",
  category: "Utility",
  aliases: ["youtube"],
  options: [
    {
      name: "channel",
      description: "YouTube handle or channel URL",
      type: "string",
      required: true
    }
  ],
  execute: async (ctx, args) => {
    const raw = String(
      ctx.getString("channel") || args.join(" ") || ""
    ).trim();

    if (!raw) {
      return ctx.reply("Usage: `,yt @handle` or `,yt channel-url`");
    }

    let url;

    if (/^https:\/\/(www\.)?youtube\.com\//i.test(raw)) {
      url = raw;
    } else {
      const handle = raw.startsWith("@") ? raw : `@${raw}`;
      if (!/^@[a-zA-Z0-9._-]{1,100}$/.test(handle)) {
        return ctx.reply("Provide a valid YouTube handle or YouTube channel URL.");
      }

      url = `https://www.youtube.com/${encodeURIComponent(handle)}`;
    }

    return ctx.reply({
      embeds: [makeSocialEmbed("YouTube", raw, url)]
    });
  }
});

/* AFK STATUS */

registerCommand({
  name: "afk",
  description: "Set your AFK status and optional reason.",
  category: "Utility",
  options: [
    {
      name: "reason",
      description: "Why you are AFK",
      type: "string",
      required: false
    }
  ],
  execute: async (ctx, args) => {
    const reason = (
      ctx.getString("reason") ||
      args.join(" ") ||
      "AFK"
    ).slice(0, 300);

    pyrrAfkUsers.set(ctx.user.id, {
      reason,
      since: Date.now()
    });

    return ctx.reply({
      embeds: [
        makeEmbed(
          "AFK STATUS SET",
          `${SYMBOL.success} ${ctx.user}, your AFK status is now active.\n**Reason:** ${reason}`
        )
      ]
    });
  }
});

/* AFK MESSAGE HANDLING */

client.on("messageCreate", async message => {
  try {
    if (!message.guild || message.author.bot) return;

    const ownAfk = pyrrAfkUsers.get(message.author.id);

    if (ownAfk) {
      pyrrAfkUsers.delete(message.author.id);

      await message.reply({
        content: `${SYMBOL.success} Welcome back, ${message.author}. Your AFK status has been removed.`,
        allowedMentions: { users: [message.author.id] }
      }).catch(() => {});
    }

    const mentionedUsers = [...message.mentions.users.values()];

    for (const user of mentionedUsers.slice(0, 5)) {
      const afk = pyrrAfkUsers.get(user.id);
      if (!afk) continue;

      await message.reply({
        content: [
          `〢 **${user.username}** is currently AFK.`,
          `**Reason:** ${afk.reason}`,
          `**Since:** <t:${Math.floor(afk.since / 1000)}:R>`
        ].join("\n"),
        allowedMentions: { repliedUser: false }
      }).catch(() => {});
    }
  } catch (error) {
    console.error("AFK handler error:", error.message);
  }
});

/* AUTOMATION PERMISSION CHECK */

function canManageAutomation(ctx) {
  if (!ctx.guild || !ctx.member) return false;

  return (
    isOwner(ctx.user.id) ||
    ctx.guild.ownerId === ctx.user.id ||
    ctx.member.permissions.has(PermissionsBitField.Flags.ManageGuild)
  );
}

/* AUTOREACT SETUP */

registerCommand({
  name: "autoreact",
  description: "Add or remove an automatic reaction trigger.",
  category: "Utility",
  options: [
    {
      name: "action",
      description: "add or remove",
      type: "string",
      required: true
    },
    {
      name: "trigger",
      description: "Word or phrase to detect",
      type: "string",
      required: true
    },
    {
      name: "emoji",
      description: "Emoji to react with (required for add)",
      type: "string",
      required: false
    }
  ],
  execute: async (ctx, args) => {
    if (!ctx.guild) return ctx.reply("Use this command in a server.");
    if (!canManageAutomation(ctx)) {
      return ctx.reply("You need Manage Server permission.");
    }

    const action = (
      ctx.getString("action") || args[0] || ""
    ).toLowerCase();

    const trigger = (
      ctx.getString("trigger") || args[1] || ""
    ).trim().toLowerCase();

    const emoji = ctx.getString("emoji") || args[2] || "";
    const cfg = getUtilityConfig(ctx.guild.id);

    if (!["add", "remove", "list"].includes(action)) {
      return ctx.reply("Use `add`, `remove`, or `list`.");
    }

    if (action === "list") {
      const items = cfg.autoReact.slice(0, 30);

      return ctx.reply({
        embeds: [
          makeEmbed(
            "AUTOREACT RULES",
            items.length
              ? items.map(item => `▪ \`${item.trigger}\` → ${item.emoji}`).join("\n")
              : "No autoreact rules configured."
          )
        ]
      });
    }

    if (!trigger || trigger.length > 80) {
      return ctx.reply("Provide a trigger from 1 to 80 characters.");
    }

    const existing = cfg.autoReact.findIndex(
      item => item.trigger === trigger
    );

    if (action === "remove") {
      if (existing < 0) return ctx.reply("That autoreact trigger was not found.");

      cfg.autoReact.splice(existing, 1);
      saveDatabase();

      return ctx.reply(`Removed autoreact trigger: \`${trigger}\`.`);
    }

    if (!emoji || emoji.length > 100) {
      return ctx.reply("Provide an emoji for the autoreact rule.");
    }

    if (existing >= 0) {
      cfg.autoReact[existing].emoji = emoji;
    } else {
      if (cfg.autoReact.length >= 50) {
        return ctx.reply("This server has reached the 50 autoreact-rule limit.");
      }

      cfg.autoReact.push({ trigger, emoji });
    }

    saveDatabase();

    return ctx.reply({
      embeds: [
        makeEmbed(
          "AUTOREACT UPDATED",
          `${SYMBOL.success} Messages containing \`${trigger}\` will trigger ${emoji}.`
        )
      ]
    });
  }
});

/* AUTORESPOND SETUP */

registerCommand({
  name: "autorespond",
  description: "Create or remove an automatic response trigger.",
  category: "Utility",
  options: [
    {
      name: "action",
      description: "add or remove",
      type: "string",
      required: true
    },
    {
      name: "trigger",
      description: "Word or phrase to detect",
      type: "string",
      required: true
    },
    {
      name: "response",
      description: "Response text (required for add)",
      type: "string",
      required: false
    }
  ],
  execute: async (ctx, args) => {
    if (!ctx.guild) return ctx.reply("Use this command in a server.");
    if (!canManageAutomation(ctx)) {
      return ctx.reply("You need Manage Server permission.");
    }

    const action = (
      ctx.getString("action") || args[0] || ""
    ).toLowerCase();

    const trigger = (
      ctx.getString("trigger") || args[1] || ""
    ).trim().toLowerCase();

    const response = (
      ctx.getString("response") ||
      args.slice(2).join(" ")
    ).trim();

    const cfg = getUtilityConfig(ctx.guild.id);

    if (!["add", "remove", "list"].includes(action)) {
      return ctx.reply("Use `add`, `remove`, or `list`.");
    }

    if (action === "list") {
      const items = cfg.autoRespond.slice(0, 30);

      return ctx.reply({
        embeds: [
          makeEmbed(
            "AUTORESPOND RULES",
            items.length
              ? items.map(item =>
                  `▪ \`${item.trigger}\` → ${item.response.slice(0, 100)}`
                ).join("\n")
              : "No autorespond rules configured."
          )
        ]
      });
    }

    if (!trigger || trigger.length > 80) {
      return ctx.reply("Provide a trigger from 1 to 80 characters.");
    }

    const existing = cfg.autoRespond.findIndex(
      item => item.trigger === trigger
    );

    if (action === "remove") {
      if (existing < 0) return ctx.reply("That autorespond trigger was not found.");

      cfg.autoRespond.splice(existing, 1);
      saveDatabase();

      return ctx.reply(`Removed autorespond trigger: \`${trigger}\`.`);
    }

    if (!response || response.length > 1500) {
      return ctx.reply("Provide a response from 1 to 1500 characters.");
    }

    if (existing >= 0) {
      cfg.autoRespond[existing].response = response;
    } else {
      if (cfg.autoRespond.length >= 50) {
        return ctx.reply("This server has reached the 50 autorespond-rule limit.");
      }

      cfg.autoRespond.push({ trigger, response });
    }

    saveDatabase();

    return ctx.reply({
      embeds: [
        makeEmbed(
          "AUTORESPOND UPDATED",
          `${SYMBOL.success} Trigger \`${trigger}\` has been configured.`
        )
      ]
    });
  }
});

/* AUTOMATION MESSAGE HANDLER */

client.on("messageCreate", async message => {
  try {
    if (!message.guild || message.author.bot || !message.content) return;

    const cfg = getUtilityConfig(message.guild.id);
    const content = message.content.toLowerCase();
    const prefix = getPrefix(message.guild.id);

    // Never trigger on a bot command, preventing accidental loops.
    if (content.startsWith(prefix.toLowerCase())) return;

    for (const rule of cfg.autoReact.slice(0, 50)) {
      if (!rule.trigger || !rule.emoji) continue;
      if (!content.includes(rule.trigger.toLowerCase())) continue;

      await message.react(rule.emoji).catch(() => {});
    }

    for (const rule of cfg.autoRespond.slice(0, 50)) {
      if (!rule.trigger || !rule.response) continue;
      if (!content.includes(rule.trigger.toLowerCase())) continue;

      await message.reply({
        content: rule.response,
        allowedMentions: { parse: [] }
      }).catch(() => {});

      break;
    }
  } catch (error) {
    console.error("Automation handler error:", error.message);
  }
});

// PART 7 END — APPEND PART 8 BELOW
      
/* ================================
   PYRR OFFICIAL — PART 8
   LEVELING SYSTEM
================================ */

function getLevelingConfig(guildId) {
  const cfg = getConfig(guildId);

  if (!cfg.leveling) {
    cfg.leveling = {
      users: {},
      roles: [],
      logChannelId: null,
      disabled: false
    };
  }

  if (!cfg.leveling.users) cfg.leveling.users = {};
  if (!Array.isArray(cfg.leveling.roles)) cfg.leveling.roles = [];

  if (typeof cfg.leveling.disabled !== "boolean") {
    cfg.leveling.disabled = false;
  }

  return cfg.leveling;
}

function xpNeeded(level) {
  return 100 + Math.max(0, level) * 50;
}

function getLevelUser(guildId, userId) {
  const leveling = getLevelingConfig(guildId);

  if (!leveling.users[userId]) {
    leveling.users[userId] = {
      xp: 0,
      level: 0,
      messages: 0
    };
  }

  return leveling.users[userId];
}

function calculateLevel(totalXp) {
  let level = 0;
  let remaining = Math.max(0, totalXp);

  while (remaining >= xpNeeded(level) && level < 500) {
    remaining -= xpNeeded(level);
    level++;
  }

  return {
    level,
    currentXp: remaining,
    nextLevelXp: xpNeeded(level)
  };
}

function levelProgressBar(current, needed, size = 12) {
  const ratio = needed > 0
    ? Math.min(1, Math.max(0, current / needed))
    : 0;

  const filled = Math.round(ratio * size);

  return "▰".repeat(filled) + "▱".repeat(size - filled);
}

async function applyLevelRoles(guild, member, level) {
  const leveling = getLevelingConfig(guild.id);
  const me = guild.members.me;

  if (!me?.permissions.has(PermissionsBitField.Flags.ManageRoles)) return;

  for (const item of leveling.roles) {
    if (item.level !== level) continue;

    const role = guild.roles.cache.get(item.roleId);

    if (
      !role ||
      role.managed ||
      role.position >= me.roles.highest.position
    ) {
      continue;
    }

    await member.roles.add(role, "PYRR Leveling reward").catch(() => {});
  }
}

/* RANK */

registerCommand({
  name: "rank",
  description: "View your level and XP, or another member's rank.",
  category: "Leveling",
  options: [
    {
      name: "user",
      description: "Member whose rank you want to view",
      type: "user",
      required: false
    }
  ],
  execute: async (ctx, args) => {
    if (!ctx.guild) return ctx.reply("Use this command in a server.");

    const selectedUser = ctx.getUser("user");
    const targetId = selectedUser?.id || extractId(args[0]) || ctx.user.id;
    const targetUser = await client.users.fetch(targetId).catch(() => null);

    if (!targetUser) return ctx.reply("User not found.");

    const leveling = getLevelingConfig(ctx.guild.id);
    const data = leveling.users[targetId];

    if (!data) {
      return ctx.reply(`${targetUser.username} has not earned any XP yet.`);
    }

    const calculated = calculateLevel(data.xp);
    const progress = levelProgressBar(
      calculated.currentXp,
      calculated.nextLevelXp
    );

    const allUsers = Object.entries(leveling.users)
      .sort((a, b) => b[1].xp - a[1].xp);

    const position = allUsers.findIndex(([id]) => id === targetId) + 1;

    return ctx.reply({
      embeds: [
        makeEmbed(
          "LEVEL PROFILE",
          [
            `**Member:** ${targetUser}`,
            `**Level:** ${calculated.level}`,
            `**Total XP:** ${data.xp}`,
            `**Messages counted:** ${data.messages || 0}`,
            `**Server rank:** #${position || "—"}`,
            "",
            `${progress} ${calculated.currentXp}/${calculated.nextLevelXp} XP`
          ].join("\n")
        )
      ]
    });
  }
});

/* LEADERBOARD */

registerCommand({
  name: "leaderboard",
  description: "Show the top 10 members by XP.",
  category: "Leveling",
  aliases: ["lb", "top"],
  execute: async ctx => {
    if (!ctx.guild) return ctx.reply("Use this command in a server.");

    const leveling = getLevelingConfig(ctx.guild.id);

    const sorted = Object.entries(leveling.users)
      .sort((a, b) => b[1].xp - a[1].xp)
      .slice(0, 10);

    if (!sorted.length) {
      return ctx.reply("The leveling leaderboard is empty.");
    }

    const lines = await Promise.all(
      sorted.map(async ([userId, data], index) => {
        const user = await client.users.fetch(userId).catch(() => null);
        const name = user ? user.username : `User ${userId}`;
        const level = calculateLevel(data.xp).level;

        return `**${index + 1}.** ${name} — Level ${level} · ${data.xp} XP`;
      })
    );

    return ctx.reply({
      embeds: [
        makeEmbed("LEVEL LEADERBOARD", lines.join("\n"))
      ]
    });
  }
});

/* LEVEL ROLE MANAGEMENT */

registerCommand({
  name: "levelrole",
  description: "Manage roles awarded at specific levels.",
  category: "Leveling",
  options: [
    {
      name: "action",
      description: "add, remove, or list",
      type: "string",
      required: true
    },
    {
      name: "level",
      description: "Required level",
      type: "integer",
      required: false
    },
    {
      name: "role",
      description: "Role awarded at that level",
      type: "role",
      required: false
    }
  ],
  execute: async (ctx, args) => {
    if (!ctx.guild) return ctx.reply("Use this command in a server.");

    if (
      !isOwner(ctx.user.id) &&
      ctx.guild.ownerId !== ctx.user.id &&
      !ctx.member?.permissions.has(PermissionsBitField.Flags.ManageRoles)
    ) {
      return ctx.reply("You need Manage Roles permission.");
    }

    const leveling = getLevelingConfig(ctx.guild.id);
    const action = (
      ctx.getString("action") || args[0] || ""
    ).toLowerCase();

    if (action === "list") {
      if (!leveling.roles.length) {
        return ctx.reply("No level reward roles have been configured.");
      }

      const lines = leveling.roles
        .slice(0, 30)
        .map(item => `▪ **Level ${item.level}:** <@&${item.roleId}>`);

      return ctx.reply({
        embeds: [makeEmbed("LEVEL REWARD ROLES", lines.join("\n"))]
      });
    }

    const level = ctx.getInteger("level") ?? Number(args[1]);
    const selectedRole = ctx.getRole("role");
    const roleId = selectedRole?.id || extractId(args[2]);
    const role = roleId ? ctx.guild.roles.cache.get(roleId) : null;

    if (action === "remove") {
      if (!Number.isInteger(level) || level < 1 || level > 500) {
        return ctx.reply("Provide a level from 1 to 500.");
      }

      const before = leveling.roles.length;

      leveling.roles = leveling.roles.filter(item => item.level !== level);

      if (before === leveling.roles.length) {
        return ctx.reply("No reward role was configured for that level.");
      }

      saveDatabase();

      return ctx.reply(`Removed the reward role setting for level ${level}.`);
    }

    if (action !== "add") {
      return ctx.reply("Usage: `,levelrole add <level> @role`, `remove <level>`, or `list`.");
    }

    if (!Number.isInteger(level) || level < 1 || level > 500) {
      return ctx.reply("Provide a level from 1 to 500.");
    }

    if (!role) return ctx.reply("Provide a valid role.");

    const me = ctx.guild.members.me;

    if (!me?.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
      return ctx.reply("I need Manage Roles permission.");
    }

    if (role.managed || role.position >= me.roles.highest.position) {
      return ctx.reply("I cannot assign that role because of its position or managed status.");
    }

    const existing = leveling.roles.find(item => item.level === level);

    if (existing) {
      existing.roleId = role.id;
    } else {
      leveling.roles.push({
        level,
        roleId: role.id
      });
    }

    saveDatabase();

    return ctx.reply({
      embeds: [
        makeEmbed(
          "LEVEL REWARD UPDATED",
          `${SYMBOL.success} Members reaching level **${level}** can receive ${role}.`
        )
      ]
    });
  }
});

/* LEVEL ANNOUNCEMENT CHANNEL */

registerCommand({
  name: "setlevel",
  description: "Configure leveling announcements.",
  category: "Leveling",
  options: [
    {
      name: "action",
      description: "log or delete",
      type: "string",
      required: true
    },
    {
      name: "channel",
      description: "Announcement channel",
      type: "channel",
      required: false
    }
  ],
  execute: async (ctx, args) => {
    if (!ctx.guild) return ctx.reply("Use this command in a server.");

    if (
      !isOwner(ctx.user.id) &&
      ctx.guild.ownerId !== ctx.user.id &&
      !ctx.member?.permissions.has(PermissionsBitField.Flags.ManageGuild)
    ) {
      return ctx.reply("You need Manage Server permission.");
    }

    const leveling = getLevelingConfig(ctx.guild.id);
    const action = (
      ctx.getString("action") || args[0] || ""
    ).toLowerCase();

    if (action === "delete") {
      leveling.logChannelId = null;
      saveDatabase();

      return ctx.reply("Level-up announcement channel removed.");
    }

    if (action !== "log") {
      return ctx.reply("Use `,setlevel log #channel` or `,setlevel delete`.");
    }

    let channel = ctx.getChannel("channel");

    if (!channel && args[1]) {
      channel = ctx.guild.channels.cache.get(extractId(args[1]));
    }

    if (
      !channel ||
      !channel.isTextBased() ||
      channel.isDMBased()
    ) {
      return ctx.reply("Provide a valid text channel.");
    }

    leveling.logChannelId = channel.id;
    saveDatabase();

    return ctx.reply(`Level-up announcements will be sent to ${channel}.`);
  }
});

/* XP AND LEVEL-UP HANDLER */

const pyrrXpCooldowns = new Map();

client.on("messageCreate", async message => {
  try {
    if (!message.guild || message.author.bot) return;

    const leveling = getLevelingConfig(message.guild.id);
    if (leveling.disabled) return;

    const prefix = getPrefix(message.guild.id);

    // Commands do not award XP.
    if (message.content.startsWith(prefix)) return;

    const cooldownKey = `${message.guild.id}:${message.author.id}`;
    const now = Date.now();
    const previous = pyrrXpCooldowns.get(cooldownKey) || 0;

    // One XP award per member every 60 seconds.
    if (now - previous < 60_000) return;

    pyrrXpCooldowns.set(cooldownKey, now);

    const data = getLevelUser(message.guild.id, message.author.id);
    const oldLevel = calculateLevel(data.xp).level;

    data.xp += Math.floor(Math.random() * 11) + 10;
    data.messages = (data.messages || 0) + 1;

    const newLevel = calculateLevel(data.xp).level;

    if (newLevel > oldLevel) {
      const logChannel = leveling.logChannelId
        ? message.guild.channels.cache.get(leveling.logChannelId)
        : null;

      const destination =
        logChannel?.isTextBased() ? logChannel : message.channel;

      await destination.send({
        embeds: [
          makeEmbed(
            "LEVEL UP",
            `${SYMBOL.success} Congratulations ${message.author}!\nYou reached **Level ${newLevel}**.`
          )
        ],
        allowedMentions: {
          users: [message.author.id]
        }
      }).catch(() => {});

      await applyLevelRoles(message.guild, message.member, newLevel);
    }

    saveDatabase();
  } catch (error) {
    console.error("Leveling handler error:", error.message);
  }
});

// PART 8 END — APPEND PART 9 BELOW
                  // ==============================
// PART 9 — VERIFICATION SYSTEM
// ==============================

function getVerificationConfig(guildId) {
  const cfg = getConfig(guildId);

  if (!cfg.verification) {
    cfg.verification = {};
  }

  const v = cfg.verification;

  if (typeof v.enabled !== "boolean") v.enabled = false;
  if (!("channelId" in v)) v.channelId = null;
  if (!("roleId" in v)) v.roleId = null;
  if (!v.color) v.color = "#FFFFFF";
  if (!("customThumbnail" in v)) v.customThumbnail = null;
  if (!("banner" in v)) v.banner = null;
  if (!("messageId" in v)) v.messageId = null;

  return v;
}

function validHexColor(value) {
  return /^#[0-9A-Fa-f]{6}$/.test(value || "");
}

function validImageUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function getVerificationImage(guild, cfg) {
  if (cfg.customThumbnail && validImageUrl(cfg.customThumbnail)) {
    return cfg.customThumbnail;
  }

  if (guild.iconURL()) return guild.iconURL({ size: 512 });

  return null;
}

function createVerificationEmbed(guild, cfg) {
  const embed = new EmbedBuilder()
    .setColor(validHexColor(cfg.color) ? cfg.color : "#FFFFFF")
    .setTitle("⛨ 〢 SERVER VERIFICATION")
    .setDescription(
      [
        "Welcome to **" + guild.name + "**.",
        "",
        "Click the button below to verify your membership.",
        "After verification, the configured role will be assigned.",
        "",
        "▪ Keep your account secure.",
        "▪ Follow the server rules.",
        "▪ Do not share your private information."
      ].join("\n")
    )
    .setFooter({
      text: "PYRR OFFICIAL 〢 Verification System"
    })
    .setTimestamp();

  const image = getVerificationImage(guild, cfg);

  if (image) embed.setThumbnail(image);

  if (cfg.banner && validImageUrl(cfg.banner)) {
    embed.setImage(cfg.banner);
  }

  return embed;
}

function createVerificationRows() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("pyrr_verify_button")
        .setLabel("Verify")
        .setEmoji("⛨")
        .setStyle(ButtonStyle.Secondary)
    )
  ];
}

registerCommand({
  name: "verification",
  description: "Configure and send the server verification panel.",
  category: "Verification",
  options: [
    {
      name: "channel",
      description: "Channel where the verification panel will be sent.",
      type: "channel",
      required: true
    },
    {
      name: "role",
      description: "Role granted after verification.",
      type: "role",
      required: true
    }
  ],
  execute: async ctx => {
    if (!ctx.guild) {
      return ctx.reply("This command can only be used inside a server.");
    }

    if (!canManageSettings(ctx)) {
      return ctx.reply("You need Manage Server permission to configure verification.");
    }

    const channel = ctx.isInteraction
      ? ctx.getChannel("channel")
      : ctx.message.mentions.channels.first();

    const role = ctx.isInteraction
      ? ctx.getRole("role")
      : ctx.message.mentions.roles.first();

    if (!channel || !channel.isTextBased() || !channel.send) {
      return ctx.reply(
        "Usage: `,verification #channel @role`"
      );
    }

    if (!role) {
      return ctx.reply(
        "Usage: `,verification #channel @role`"
      );
    }

    if (role.id === ctx.guild.id) {
      return ctx.reply("The @everyone role cannot be used for verification.");
    }

    const botMember = ctx.guild.members.me;

    if (
      !botMember ||
      !botMember.permissions.has(PermissionsBitField.Flags.ManageRoles)
    ) {
      return ctx.reply("I need the Manage Roles permission.");
    }

    if (role.position >= botMember.roles.highest.position) {
      return ctx.reply(
        "Move my bot role above the verification role in Server Settings → Roles."
      );
    }

    const cfg = getVerificationConfig(ctx.guild.id);

    cfg.enabled = true;
    cfg.channelId = channel.id;
    cfg.roleId = role.id;

    saveDatabase();

    const panel = await channel.send({
      embeds: [createVerificationEmbed(ctx.guild, cfg)],
      components: createVerificationRows()
    });

    cfg.messageId = panel.id;
    saveDatabase();

    return ctx.reply(
      "Verification panel sent to " + channel + ". Role: " + role + "."
    );
  }
});

registerCommand({
  name: "verificationset",
  description: "Customize the verification panel.",
  category: "Verification",
  options: [
    {
      name: "setting",
      description: "What do you want to configure?",
      type: "string",
      required: true,
      choices: [
        { name: "Color", value: "color" },
        { name: "Custom Thumbnail", value: "customthumbnail" },
        { name: "Banner", value: "banner" },
        { name: "Reset Images", value: "reset" },
        { name: "Disable Verification", value: "disabled" }
      ]
    },
    {
      name: "value",
      description: "Hex color or image URL, depending on the setting.",
      type: "string",
      required: false
    }
  ],
  execute: async ctx => {
    if (!ctx.guild) {
      return ctx.reply("This command can only be used inside a server.");
    }

    if (!canManageSettings(ctx)) {
      return ctx.reply("You need Manage Server permission.");
    }

    const setting = ctx.isInteraction
      ? ctx.getString("setting")
      : (ctx.args[0] || "").toLowerCase();

    const value = ctx.isInteraction
      ? ctx.getString("value")
      : ctx.args.slice(1).join(" ");

    const cfg = getVerificationConfig(ctx.guild.id);

    if (setting === "color") {
      if (!validHexColor(value)) {
        return ctx.reply("Use a valid hex color, for example `#FFFFFF`.");
      }

      cfg.color = value;
      saveDatabase();

      return ctx.reply("Verification embed color updated to `" + value + "`.");
    }

    if (setting === "customthumbnail") {
      if (!validImageUrl(value)) {
        return ctx.reply("Provide a valid image URL starting with `https://`.");
      }

      cfg.customThumbnail = value;
      saveDatabase();

      return ctx.reply("Verification thumbnail updated.");
    }

    if (setting === "banner" || setting === "setbanner") {
      if (!validImageUrl(value)) {
        return ctx.reply("Provide a valid banner image URL starting with `https://`.");
      }

      cfg.banner = value;
      saveDatabase();

      return ctx.reply("Verification banner updated.");
    }

    if (setting === "reset") {
      cfg.customThumbnail = null;
      cfg.banner = null;
      cfg.color = "#FFFFFF";
      saveDatabase();

      return ctx.reply(
        "Verification images and color reset. The server icon will be used as the fallback thumbnail."
      );
    }

    if (setting === "disabled" || setting === "disable") {
      cfg.enabled = false;
      saveDatabase();

      return ctx.reply("Verification has been disabled.");
    }

    return ctx.reply(
      "Available settings: `color`, `customthumbnail`, `banner`, `reset`, `disabled`."
    );
  }
});

// Prefix shortcuts for the requested verification settings.
registerCommand({
  name: "verifycolor",
  description: "Set verification embed color.",
  category: "Verification",
  slash: false,
  execute: async ctx => {
    if (!ctx.guild) return ctx.reply("Use this command inside a server.");
    if (!canManageSettings(ctx)) return ctx.reply("You need Manage Server permission.");

    const value = ctx.args[0];

    if (!validHexColor(value)) {
      return ctx.reply("Usage: `,verifycolor #FFFFFF`");
    }

    getVerificationConfig(ctx.guild.id).color = value;
    saveDatabase();

    return ctx.reply("Verification color updated to `" + value + "`.");
  }
});

registerCommand({
  name: "verifythumbnail",
  description: "Set a custom verification thumbnail.",
  category: "Verification",
  slash: false,
  execute: async ctx => {
    if (!ctx.guild) return ctx.reply("Use this command inside a server.");
    if (!canManageSettings(ctx)) return ctx.reply("You need Manage Server permission.");

    const value = ctx.args[0];

    if (!validImageUrl(value)) {
      return ctx.reply("Usage: `,verifythumbnail https://example.com/image.png`");
    }

    getVerificationConfig(ctx.guild.id).customThumbnail = value;
    saveDatabase();

    return ctx.reply("Verification thumbnail updated.");
  }
});

registerCommand({
  name: "verifybanner",
  description: "Set a custom verification banner.",
  category: "Verification",
  slash: false,
  execute: async ctx => {
    if (!ctx.guild) return ctx.reply("Use this command inside a server.");
    if (!canManageSettings(ctx)) return ctx.reply("You need Manage Server permission.");

    const value = ctx.args[0];

    if (!validImageUrl(value)) {
      return ctx.reply("Usage: `,verifybanner https://example.com/banner.png`");
    }

    getVerificationConfig(ctx.guild.id).banner = value;
    saveDatabase();

    return ctx.reply("Verification banner updated.");
  }
});

registerCommand({
  name: "verifyreset",
  description: "Reset verification image and color settings.",
  category: "Verification",
  slash: false,
  execute: async ctx => {
    if (!ctx.guild) return ctx.reply("Use this command inside a server.");
    if (!canManageSettings(ctx)) return ctx.reply("You need Manage Server permission.");

    const cfg = getVerificationConfig(ctx.guild.id);

    cfg.customThumbnail = null;
    cfg.banner = null;
    cfg.color = "#FFFFFF";

    saveDatabase();

    return ctx.reply("Verification settings reset.");
  }
});

registerCommand({
  name: "verifydisable",
  description: "Disable verification.",
  category: "Verification",
  slash: false,
  execute: async ctx => {
    if (!ctx.guild) return ctx.reply("Use this command inside a server.");
    if (!canManageSettings(ctx)) return ctx.reply("You need Manage Server permission.");

    getVerificationConfig(ctx.guild.id).enabled = false;
    saveDatabase();

    return ctx.reply("Verification has been disabled.");
  }
});

// Verification button handler.
client.on("interactionCreate", async interaction => {
  if (!interaction.isButton()) return;
  if (interaction.customId !== "pyrr_verify_button") return;

  try {
    if (!interaction.guild || !interaction.member) {
      return interaction.reply({
        content: "This verification button only works inside a server.",
        ephemeral: true
      });
    }

    const guild = interaction.guild;
    const cfg = getVerificationConfig(guild.id);

    if (!cfg.enabled || !cfg.roleId) {
      return interaction.reply({
        content: "Verification is currently unavailable. Contact a server moderator.",
        ephemeral: true
      });
    }

    const member = await guild.members.fetch(interaction.user.id);
    const role = await guild.roles.fetch(cfg.roleId);

    if (!role) {
      return interaction.reply({
        content: "The verification role no longer exists. Contact a moderator.",
        ephemeral: true
      });
    }

    if (member.roles.cache.has(role.id)) {
      return interaction.reply({
        content: "You are already verified.",
        ephemeral: true
      });
    }

    const botMember = guild.members.me;

    if (
      !botMember ||
      !botMember.permissions.has(PermissionsBitField.Flags.ManageRoles) ||
      role.position >= botMember.roles.highest.position
    ) {
      return interaction.reply({
        content: "The bot cannot assign the verification role. Please contact a moderator.",
        ephemeral: true
      });
    }

    await member.roles.add(role, "Completed server verification");

    return interaction.reply({
      content: "⛨ You are now verified. Welcome to " + guild.name + "!",
      ephemeral: true
    });
  } catch (error) {
    console.error("[Verification Button Error]", error);

    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: "Verification failed. Please contact a server moderator.",
        ephemeral: true
      }).catch(() => {});
    }
  }
});

console.log("[PYRR] Verification system loaded.");

// PART 9 END — APPEND PART 10 BELOW// ==============================
// PART 10 — WELCOME & LEAVE
// ==============================

function getWelcomeConfig(guildId) {
  const cfg = getConfig(guildId);

  if (!cfg.welcome) cfg.welcome = {};

  const w = cfg.welcome;

  if (typeof w.enabled !== "boolean") w.enabled = false;
  if (!("channelId" in w)) w.channelId = null;
  if (!("message" in w)) {
    w.message = "Welcome {user} to **{server}**! You are member #{count}.";
  }
  if (!("banner" in w)) w.banner = null;
  if (!("color" in w)) w.color = "#FFFFFF";

  return w;
}

function getLeaveConfig(guildId) {
  const cfg = getConfig(guildId);

  if (!cfg.leave) cfg.leave = {};

  const l = cfg.leave;

  if (typeof l.enabled !== "boolean") l.enabled = false;
  if (!("channelId" in l)) l.channelId = null;
  if (!("message" in l)) {
    l.message = "{user} has left **{server}**.";
  }
  if (!("banner" in l)) l.banner = null;
  if (!("color" in l)) l.color = "#FFFFFF";

  return l;
}

function replaceWelcomeVariables(template, member) {
  const guild = member.guild;

  return String(template || "")
    .replace(/\{user\}/gi, `<@${member.id}>`)
    .replace(/\{username\}/gi, member.user.username)
    .replace(/\{server\}/gi, guild.name)
    .replace(/\{count\}/gi, String(guild.memberCount))
    .replace(/\{id\}/gi, member.id)
    .replace(/\{created\}/gi, `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`)
    .replace(/\{joined\}/gi, member.joinedTimestamp
      ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`
      : "Unknown");
}

function createMemberCardEmbed(member, type) {
  const isWelcome = type === "welcome";
  const cfg = isWelcome
    ? getWelcomeConfig(member.guild.id)
    : getLeaveConfig(member.guild.id);

  const defaultMessage = isWelcome
    ? "Welcome {user} to **{server}**! You are member #{count}."
    : "{user} has left **{server}**.";

  const description = replaceWelcomeVariables(
    cfg.message || defaultMessage,
    member
  );

  const embed = new EmbedBuilder()
    .setColor(validHexColor(cfg.color) ? cfg.color : "#FFFFFF")
    .setTitle(
      isWelcome
        ? "⟡ 〢 MEMBER WELCOME"
        : "〢 〢 MEMBER LEFT"
    )
    .setDescription(description)
    .setThumbnail(member.user.displayAvatarURL({ size: 512 }))
    .setFooter({
      text: "PYRR OFFICIAL 〢 " + member.guild.name
    })
    .setTimestamp();

  if (cfg.banner && validImageUrl(cfg.banner)) {
    embed.setImage(cfg.banner);
  } else if (member.guild.bannerURL()) {
    embed.setImage(member.guild.bannerURL({ size: 1024 }));
  }

  if (isWelcome) {
    embed.addFields(
      {
        name: "Account Created",
        value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`,
        inline: true
      },
      {
        name: "Member Count",
        value: String(member.guild.memberCount),
        inline: true
      }
    );
  }

  return embed;
}

async function sendMemberCard(guild, member, type) {
  const cfg = type === "welcome"
    ? getWelcomeConfig(guild.id)
    : getLeaveConfig(guild.id);

  if (!cfg.enabled || !cfg.channelId) return;

  const channel = await guild.channels.fetch(cfg.channelId).catch(() => null);

  if (!channel || !channel.isTextBased() || !channel.send) return;

  await channel.send({
    embeds: [createMemberCardEmbed(member, type)],
    allowedMentions: {
      parse: [],
      users: [member.id]
    }
  }).catch(error => {
    console.error(`[PYRR ${type} send error]`, error);
  });
}

// Welcome configuration.
registerCommand({
  name: "welcome",
  description: "Configure welcome messages.",
  category: "Welcome & Leave",
  options: [
    {
      name: "action",
      description: "Choose a welcome action.",
      type: "string",
      required: true,
      choices: [
        { name: "Setup", value: "setup" },
        { name: "Edit Message", value: "edit" },
        { name: "Test", value: "test" },
        { name: "Disable", value: "disable" }
      ]
    },
    {
      name: "channel",
      description: "Welcome channel for setup.",
      type: "channel",
      required: false
    },
    {
      name: "message",
      description: "Welcome message for editing.",
      type: "string",
      required: false
    }
  ],
  execute: async ctx => {
    if (!ctx.guild) return ctx.reply("Use this command inside a server.");
    if (!canManageSettings(ctx)) {
      return ctx.reply("You need Manage Server permission.");
    }

    const action = ctx.isInteraction
      ? ctx.getString("action")
      : (ctx.args[0] || "").toLowerCase();

    const channel = ctx.isInteraction
      ? ctx.getChannel("channel")
      : ctx.message.mentions.channels.first();

    const message = ctx.isInteraction
      ? ctx.getString("message")
      : ctx.args.slice(1).join(" ");

    const cfg = getWelcomeConfig(ctx.guild.id);

    if (action === "setup") {
      if (!channel || !channel.isTextBased() || !channel.send) {
        return ctx.reply("Usage: `,welcome setup #channel`");
      }

      cfg.channelId = channel.id;
      cfg.enabled = true;
      saveDatabase();

      return ctx.reply("Welcome messages enabled in " + channel + ".");
    }

    if (action === "edit") {
      if (!message) {
        return ctx.reply(
          "Usage: `,welcome edit Your message here`"
        );
      }

      if (message.length > 1500) {
        return ctx.reply("Keep the welcome message under 1500 characters.");
      }

      cfg.message = message;
      saveDatabase();

      return ctx.reply(
        "Welcome message updated. Variables: `{user}`, `{username}`, `{server}`, `{count}`, `{id}`, `{created}`, `{joined}`."
      );
    }

    if (action === "test") {
      if (!cfg.channelId) {
        return ctx.reply("Set a welcome channel first with `,welcome setup #channel`.");
      }

      await sendMemberCard(ctx.guild, ctx.member, "welcome");
      return ctx.reply("Welcome test sent, if the configured channel is available.");
    }

    if (action === "disable") {
      cfg.enabled = false;
      saveDatabase();
      return ctx.reply("Welcome messages disabled.");
    }

    return ctx.reply("Actions: `setup`, `edit`, `test`, `disable`.");
  }
});

// Prefix shortcut: ,welcomesend #channel
registerCommand({
  name: "welcomesend",
  description: "Set the welcome channel.",
  category: "Welcome & Leave",
  slash: false,
  execute: async ctx => {
    if (!ctx.guild) return ctx.reply("Use this command inside a server.");
    if (!canManageSettings(ctx)) return ctx.reply("You need Manage Server permission.");

    const channel = ctx.message.mentions.channels.first();

    if (!channel || !channel.isTextBased() || !channel.send) {
      return ctx.reply("Usage: `,welcomesend #channel`");
    }

    const cfg = getWelcomeConfig(ctx.guild.id);
    cfg.channelId = channel.id;
    cfg.enabled = true;
    saveDatabase();

    return ctx.reply("Welcome channel set to " + channel + ".");
  }
});

// Leave configuration.
registerCommand({
  name: "leave",
  description: "Configure leave messages.",
  category: "Welcome & Leave",
  options: [
    {
      name: "action",
      description: "Choose a leave action.",
      type: "string",
      required: true,
      choices: [
        { name: "Setup", value: "setup" },
        { name: "Edit Message", value: "edit" },
        { name: "Test", value: "test" },
        { name: "Disable", value: "disable" }
      ]
    },
    {
      name: "channel",
      description: "Leave message channel for setup.",
      type: "channel",
      required: false
    },
    {
      name: "message",
      description: "Leave message for editing.",
      type: "string",
      required: false
    }
  ],
  execute: async ctx => {
    if (!ctx.guild) return ctx.reply("Use this command inside a server.");
    if (!canManageSettings(ctx)) {
      return ctx.reply("You need Manage Server permission.");
    }

    const action = ctx.isInteraction
      ? ctx.getString("action")
      : (ctx.args[0] || "").toLowerCase();

    const channel = ctx.isInteraction
      ? ctx.getChannel("channel")
      : ctx.message.mentions.channels.first();

    const message = ctx.isInteraction
      ? ctx.getString("message")
      : ctx.args.slice(1).join(" ");

    const cfg = getLeaveConfig(ctx.guild.id);

    if (action === "setup") {
      if (!channel || !channel.isTextBased() || !channel.send) {
        return ctx.reply("Usage: `,leave setup #channel`");
      }

      cfg.channelId = channel.id;
      cfg.enabled = true;
      saveDatabase();

      return ctx.reply("Leave messages enabled in " + channel + ".");
    }

    if (action === "edit") {
      if (!message) {
        return ctx.reply("Usage: `,leave edit Your message here`");
      }

      if (message.length > 1500) {
        return ctx.reply("Keep the leave message under 1500 characters.");
      }

      cfg.message = message;
      saveDatabase();

      return ctx.reply(
        "Leave message updated. Variables: `{user}`, `{username}`, `{server}`, `{count}`, `{id}`, `{created}`, `{joined}`."
      );
    }

    if (action === "test") {
      if (!cfg.channelId) {
        return ctx.reply("Set a leave channel first with `,leave setup #channel`.");
      }

      await sendMemberCard(ctx.guild, ctx.member, "leave");
      return ctx.reply("Leave test sent, if the configured channel is available.");
    }

    if (action === "disable") {
      cfg.enabled = false;
      saveDatabase();
      return ctx.reply("Leave messages disabled.");
    }

    return ctx.reply("Actions: `setup`, `edit`, `test`, `disable`.");
  }
});

// Prefix shortcut: ,leavesend #channel
registerCommand({
  name: "leavesend",
  description: "Set the leave-message channel.",
  category: "Welcome & Leave",
  slash: false,
  execute: async ctx => {
    if (!ctx.guild) return ctx.reply("Use this command inside a server.");
    if (!canManageSettings(ctx)) return ctx.reply("You need Manage Server permission.");

    const channel = ctx.message.mentions.channels.first();

    if (!channel || !channel.isTextBased() || !channel.send) {
      return ctx.reply("Usage: `,leavesend #channel`");
    }

    const cfg = getLeaveConfig(ctx.guild.id);
    cfg.channelId = channel.id;
    cfg.enabled = true;
    saveDatabase();

    return ctx.reply("Leave channel set to " + channel + ".");
  }
});

// Member event handlers.
client.on("guildMemberAdd", async member => {
  await sendMemberCard(member.guild, member, "welcome");
});

client.on("guildMemberRemove", async member => {
  await sendMemberCard(member.guild, member, "leave");
});

console.log("[PYRR] Welcome and leave systems loaded.");

// PART 10 END — APPEND PART 11 BELOW// ==============================
// PART 11 — AUTOMOD SYSTEM
// ==============================

function getAutoModConfig(guildId) {
  const cfg = getConfig(guildId);

  if (!cfg.automod) cfg.automod = {};

  const a = cfg.automod;

  if (typeof a.enabled !== "boolean") a.enabled = false;
  if (typeof a.blockLinks !== "boolean") a.blockLinks = false;
  if (typeof a.blockInvites !== "boolean") a.blockInvites = false;
  if (typeof a.antiSpam !== "boolean") a.antiSpam = false;
  if (typeof a.badWordsEnabled !== "boolean") a.badWordsEnabled = false;
  if (!Array.isArray(a.badWords)) a.badWords = [];
  if (!("logChannelId" in a)) a.logChannelId = null;
  if (!Number.isInteger(a.spamLimit)) a.spamLimit = 5;
  if (!Number.isInteger(a.spamWindowSeconds)) a.spamWindowSeconds = 6;

  return a;
}

const pyrrMessageHistory = new Map();
const pyrrAutomodCooldowns = new Map();

function isExemptFromAutomod(member) {
  if (!member) return false;

  return (
    member.permissions.has(PermissionsBitField.Flags.Administrator) ||
    member.permissions.has(PermissionsBitField.Flags.ManageMessages)
  );
}

function containsDiscordInvite(content) {
  return /(?:discord\.gg\/|discord(?:app)?\.com\/invite\/)\S+/i.test(content);
}

function containsWebLink(content) {
  return /(?:https?:\/\/|www\.)\S+/i.test(content);
}

function containsBlockedWord(content, words) {
  const normalized = String(content || "").toLowerCase();

  return words.some(word => {
    const clean = String(word || "").trim().toLowerCase();
    if (!clean) return false;

    return normalized.includes(clean);
  });
}

async function sendAutomodLog(guild, title, description, member) {
  const cfg = getAutoModConfig(guild.id);

  if (!cfg.logChannelId) return;

  const channel = await guild.channels.fetch(cfg.logChannelId).catch(() => null);

  if (!channel || !channel.isTextBased() || !channel.send) return;

  const embed = new EmbedBuilder()
    .setColor("#FFFFFF")
    .setTitle("〢  " + title)
    .setDescription(description)
    .setFooter({ text: "PYRR OFFICIAL 〢 AutoMod" })
    .setTimestamp();

  if (member) {
    embed.addFields({
      name: "Member",
      value: `${member.user.tag} (${member.id})`,
      inline: false
    });
  }

  await channel.send({ embeds: [embed] }).catch(() => {});
}

async function automodDelete(message, reason) {
  if (!message.guild || !message.member) return;

  const key = `${message.guild.id}:${message.author.id}`;
  const now = Date.now();
  const lastNotice = pyrrAutomodCooldowns.get(key) || 0;

  await message.delete().catch(() => {});

  await sendAutomodLog(
    message.guild,
    "Message Removed",
    `**Reason:** ${reason}\n**Channel:** ${message.channel}\n**Message ID:** ${message.id}`,
    message.member
  );

  // Avoid repeatedly sending warning messages to the same user.
  if (now - lastNotice > 8000) {
    pyrrAutomodCooldowns.set(key, now);

    await message.channel.send({
      content: `${message.author}, your message was removed by AutoMod: **${reason}**.`,
      allowedMentions: { users: [message.author.id] }
    }).then(msg => {
      setTimeout(() => msg.delete().catch(() => {}), 5000);
    }).catch(() => {});
  }
}

registerCommand({
  name: "automod",
  description: "Configure automatic moderation.",
  category: "AutoMod",
  options: [
    {
      name: "action",
      description: "Choose an AutoMod setting.",
      type: "string",
      required: true,
      choices: [
        { name: "Enable", value: "enable" },
        { name: "Disable", value: "disable" },
        { name: "Links On", value: "linkson" },
        { name: "Links Off", value: "linksoff" },
        { name: "Invites On", value: "inviteson" },
        { name: "Invites Off", value: "invitesoff" },
        { name: "Anti-Spam On", value: "spamon" },
        { name: "Anti-Spam Off", value: "spamoff" },
        { name: "Bad Words On", value: "badwordson" },
        { name: "Bad Words Off", value: "badwordsoff" },
        { name: "Status", value: "status" }
      ]
    }
  ],
  execute: async ctx => {
    if (!ctx.guild) return ctx.reply("Use this command inside a server.");
    if (!canManageSettings(ctx)) {
      return ctx.reply("You need Manage Server permission.");
    }

    const action = ctx.isInteraction
      ? ctx.getString("action")
      : (ctx.args[0] || "").toLowerCase();

    const cfg = getAutoModConfig(ctx.guild.id);

    const settings = {
      enable: () => { cfg.enabled = true; },
      disable: () => { cfg.enabled = false; },
      linkson: () => { cfg.blockLinks = true; },
      linksoff: () => { cfg.blockLinks = false; },
      inviteson: () => { cfg.blockInvites = true; },
      invitesoff: () => { cfg.blockInvites = false; },
      spamon: () => { cfg.antiSpam = true; },
      spamoff: () => { cfg.antiSpam = false; },
      badwordson: () => { cfg.badWordsEnabled = true; },
      badwordsoff: () => { cfg.badWordsEnabled = false; }
    };

    if (action === "status") {
      const embed = new EmbedBuilder()
        .setColor("#FFFFFF")
        .setTitle("⟡  PYRR AUTOMOD")
        .setDescription([
          `**Master:** ${cfg.enabled ? "Enabled" : "Disabled"}`,
          `**Link Filter:** ${cfg.blockLinks ? "Enabled" : "Disabled"}`,
          `**Invite Filter:** ${cfg.blockInvites ? "Enabled" : "Disabled"}`,
          `**Anti-Spam:** ${cfg.antiSpam ? "Enabled" : "Disabled"}`,
          `**Bad Words:** ${cfg.badWordsEnabled ? "Enabled" : "Disabled"}`,
          `**Blocked Words:** ${cfg.badWords.length}`,
          `**Log Channel:** ${cfg.logChannelId ? `<#${cfg.logChannelId}>` : "Not configured"}`
        ].join("\n"))
        .setFooter({ text: "PYRR OFFICIAL 〢 AutoMod" });

      return ctx.reply({ embeds: [embed] });
    }

    if (!settings[action]) {
      return ctx.reply(
        "Use `,automod enable`, `,automod disable`, or `,automod status`."
      );
    }

    settings[action]();
    saveDatabase();

    return ctx.reply(`AutoMod setting updated: **${action}**.`);
  }
});

registerCommand({
  name: "automodlog",
  description: "Set the AutoMod log channel.",
  category: "AutoMod",
  slash: false,
  execute: async ctx => {
    if (!ctx.guild) return ctx.reply("Use this command inside a server.");
    if (!canManageSettings(ctx)) return ctx.reply("You need Manage Server permission.");

    const channel = ctx.message.mentions.channels.first();

    if (!channel || !channel.isTextBased() || !channel.send) {
      return ctx.reply("Usage: `,automodlog #channel`");
    }

    getAutoModConfig(ctx.guild.id).logChannelId = channel.id;
    saveDatabase();

    return ctx.reply("AutoMod logs will be sent to " + channel + ".");
  }
});

registerCommand({
  name: "badword",
  description: "Add or remove blocked words.",
  category: "AutoMod",
  slash: false,
  execute: async ctx => {
    if (!ctx.guild) return ctx.reply("Use this command inside a server.");
    if (!canManageSettings(ctx)) return ctx.reply("You need Manage Server permission.");

    const action = (ctx.args[0] || "").toLowerCase();
    const word = ctx.args.slice(1).join(" ").trim();
    const cfg = getAutoModConfig(ctx.guild.id);

    if (action === "list") {
      return ctx.reply(
        cfg.badWords.length
          ? `Blocked words: ${cfg.badWords.map(w => `\`${w}\``).join(", ")}`
          : "No blocked words configured."
      );
    }

    if (!word || word.length > 80) {
      return ctx.reply("Usage: `,badword add <word>` or `,badword remove <word>`");
    }

    if (action === "add") {
      if (cfg.badWords.some(w => w.toLowerCase() === word.toLowerCase())) {
        return ctx.reply("That word is already on the block list.");
      }

      if (cfg.badWords.length >= 100) {
        return ctx.reply("The blocked-word list is full (100 words).");
      }

      cfg.badWords.push(word);
      saveDatabase();

      return ctx.reply("Added the blocked word.");
    }

    if (action === "remove") {
      const before = cfg.badWords.length;

      cfg.badWords = cfg.badWords.filter(
        w => w.toLowerCase() !== word.toLowerCase()
      );

      if (before === cfg.badWords.length) {
        return ctx.reply("That word was not found.");
      }

      saveDatabase();
      return ctx.reply("Removed the blocked word.");
    }

    return ctx.reply(
      "Usage: `,badword add <word>`, `,badword remove <word>`, or `,badword list`"
    );
  }
});

// Main AutoMod message filter.
client.on("messageCreate", async message => {
  try {
    if (!message.guild || message.author.bot || !message.member) return;
    if (isExemptFromAutomod(message.member)) return;

    const cfg = getAutoModConfig(message.guild.id);

    if (!cfg.enabled) return;

    const content = message.content || "";

    if (cfg.blockInvites && containsDiscordInvite(content)) {
      return automodDelete(message, "Discord invites are not allowed");
    }

    if (cfg.blockLinks && containsWebLink(content)) {
      return automodDelete(message, "Links are not allowed");
    }

    if (
      cfg.badWordsEnabled &&
      containsBlockedWord(content, cfg.badWords)
    ) {
      return automodDelete(message, "Blocked word detected");
    }

    if (cfg.antiSpam) {
      const key = `${message.guild.id}:${message.author.id}`;
      const now = Date.now();
      const windowMs = Math.max(2, cfg.spamWindowSeconds) * 1000;

      const history = (pyrrMessageHistory.get(key) || [])
        .filter(timestamp => now - timestamp < windowMs);

      history.push(now);
      pyrrMessageHistory.set(key, history);

      if (history.length >= Math.max(2, cfg.spamLimit)) {
        pyrrMessageHistory.set(key, []);

        return automodDelete(
          message,
          `Spam detected (${cfg.spamLimit} messages within ${cfg.spamWindowSeconds} seconds)`
        );
      }
    }
  } catch (error) {
    console.error("[PYRR AutoMod Error]", error);
  }
});

console.log("[PYRR] AutoMod system loaded.");

// PART 11 END — APPEND PART 12 BELOW// ==============================
// PART 12 — ANTIRAID SYSTEM
// ==============================

function getAntiRaidConfig(guildId) {
  const cfg = getConfig(guildId);

  if (!cfg.antiraid) cfg.antiraid = {};

  const a = cfg.antiraid;

  if (typeof a.enabled !== "boolean") a.enabled = false;
  if (!Number.isInteger(a.joinLimit)) a.joinLimit = 8;
  if (!Number.isInteger(a.windowSeconds)) a.windowSeconds = 10;
  if (!["kick", "ban", "timeout"].includes(a.punishment)) {
    a.punishment = "timeout";
  }
  if (!("logChannelId" in a)) a.logChannelId = null;
  if (!Array.isArray(a.exemptUsers)) a.exemptUsers = [];
  if (!Array.isArray(a.exemptRoles)) a.exemptRoles = [];
  if (typeof a.lockdown !== "boolean") a.lockdown = false;

  return a;
}

const pyrrJoinHistory = new Map();
const pyrrRaidCooldowns = new Map();

function createAntiRaidEmbed(guild) {
  const cfg = getAntiRaidConfig(guild.id);

  return new EmbedBuilder()
    .setColor("#FFFFFF")
    .setTitle("⛨  PYRR ANTIRAID")
    .setDescription([
      `**Status:** ${cfg.enabled ? "Enabled" : "Disabled"}`,
      `**Join Limit:** ${cfg.joinLimit} members`,
      `**Time Window:** ${cfg.windowSeconds} seconds`,
      `**Punishment:** ${cfg.punishment}`,
      `**Lockdown:** ${cfg.lockdown ? "Enabled" : "Disabled"}`,
      `**Log Channel:** ${cfg.logChannelId ? `<#${cfg.logChannelId}>` : "Not configured"}`,
      "",
      "Use the buttons below to manage AntiRaid."
    ].join("\n"))
    .setFooter({ text: "PYRR OFFICIAL 〢 Security" })
    .setTimestamp();
}

function createAntiRaidRows() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("pyrr_ar_toggle")
        .setLabel("Enable / Disable")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("pyrr_ar_refresh")
        .setLabel("Refresh")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("pyrr_ar_lockdown")
        .setLabel("Lockdown")
        .setStyle(ButtonStyle.Danger)
    ),
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("pyrr_ar_punishment")
        .setPlaceholder("Select raid punishment")
        .addOptions(
          { label: "Kick", value: "kick", description: "Kick detected raid joiners" },
          { label: "Ban", value: "ban", description: "Ban detected raid joiners" },
          { label: "Timeout", value: "timeout", description: "Timeout detected raid joiners" }
        )
    )
  ];
}

registerCommand({
  name: "antiraid",
  description: "Open the AntiRaid control panel.",
  category: "AntiRaid",
  slash: false,
  execute: async ctx => {
    if (!ctx.guild) return ctx.reply("Use this command inside a server.");
    if (!canManageSettings(ctx)) {
      return ctx.reply("You need Manage Server permission.");
    }

    const embed = createAntiRaidEmbed(ctx.guild);

    return ctx.reply({
      embeds: [embed],
      components: createAntiRaidRows()
    });
  }
});

registerCommand({
  name: "raidlimit",
  description: "Set the number of joins that triggers raid protection.",
  category: "AntiRaid",
  slash: false,
  execute: async ctx => {
    if (!ctx.guild) return ctx.reply("Use this command inside a server.");
    if (!canManageSettings(ctx)) return ctx.reply("You need Manage Server permission.");

    const limit = Number(ctx.args[0]);
    const cfg = getAntiRaidConfig(ctx.guild.id);

    if (!Number.isInteger(limit) || limit < 3 || limit > 100) {
      return ctx.reply("Usage: `,raidlimit 8` (choose a number from 3 to 100).");
    }

    cfg.joinLimit = limit;
    saveDatabase();

    return ctx.reply(`AntiRaid join limit set to **${limit}**.`);
  }
});

registerCommand({
  name: "raidwindow",
  description: "Set the raid detection time window in seconds.",
  category: "AntiRaid",
  slash: false,
  execute: async ctx => {
    if (!ctx.guild) return ctx.reply("Use this command inside a server.");
    if (!canManageSettings(ctx)) return ctx.reply("You need Manage Server permission.");

    const seconds = Number(ctx.args[0]);
    const cfg = getAntiRaidConfig(ctx.guild.id);

    if (!Number.isInteger(seconds) || seconds < 3 || seconds > 60) {
      return ctx.reply("Usage: `,raidwindow 10` (3 to 60 seconds).");
    }

    cfg.windowSeconds = seconds;
    saveDatabase();

    return ctx.reply(`AntiRaid time window set to **${seconds} seconds**.`);
  }
});

registerCommand({
  name: "raidpunishment",
  description: "Set the punishment for detected raid joiners.",
  category: "AntiRaid",
  slash: false,
  execute: async ctx => {
    if (!ctx.guild) return ctx.reply("Use this command inside a server.");
    if (!canManageSettings(ctx)) return ctx.reply("You need Manage Server permission.");

    const punishment = (ctx.args[0] || "").toLowerCase();

    if (!["kick", "ban", "timeout"].includes(punishment)) {
      return ctx.reply("Usage: `,raidpunishment kick`, `ban`, or `timeout`.");
    }

    getAntiRaidConfig(ctx.guild.id).punishment = punishment;
    saveDatabase();

    return ctx.reply(`AntiRaid punishment set to **${punishment}**.`);
  }
});

registerCommand({
  name: "raidlog",
  description: "Set the AntiRaid log channel.",
  category: "AntiRaid",
  slash: false,
  execute: async ctx => {
    if (!ctx.guild) return ctx.reply("Use this command inside a server.");
    if (!canManageSettings(ctx)) return ctx.reply("You need Manage Server permission.");

    const channel = ctx.message.mentions.channels.first();

    if (!channel || !channel.isTextBased() || !channel.send) {
      return ctx.reply("Usage: `,raidlog #channel`");
    }

    getAntiRaidConfig(ctx.guild.id).logChannelId = channel.id;
    saveDatabase();

    return ctx.reply("AntiRaid logs will be sent to " + channel + ".");
  }
});

registerCommand({
  name: "raidexempt",
  description: "Add or remove a user from the AntiRaid exemption list.",
  category: "AntiRaid",
  slash: false,
  execute: async ctx => {
    if (!ctx.guild) return ctx.reply("Use this command inside a server.");
    if (!canManageSettings(ctx)) return ctx.reply("You need Manage Server permission.");

    const action = (ctx.args[0] || "").toLowerCase();
    const user = ctx.message.mentions.users.first();
    const cfg = getAntiRaidConfig(ctx.guild.id);

    if (action === "list") {
      return ctx.reply(
        cfg.exemptUsers.length
          ? `Exempt users: ${cfg.exemptUsers.map(id => `<@${id}>`).join(", ")}`
          : "No exempt users configured."
      );
    }

    if (!user) {
      return ctx.reply("Usage: `,raidexempt add @user`, `,raidexempt remove @user`, or `,raidexempt list`.");
    }

    if (action === "add") {
      if (!cfg.exemptUsers.includes(user.id)) cfg.exemptUsers.push(user.id);
      saveDatabase();
      return ctx.reply(`${user} added to the AntiRaid exemption list.`);
    }

    if (action === "remove") {
      cfg.exemptUsers = cfg.exemptUsers.filter(id => id !== user.id);
      saveDatabase();
      return ctx.reply(`${user} removed from the AntiRaid exemption list.`);
    }

    return ctx.reply("Actions: `add`, `remove`, `list`.");
  }
});

async function sendAntiRaidLog(guild, description) {
  const cfg = getAntiRaidConfig(guild.id);

  if (!cfg.logChannelId) return;

  const channel = await guild.channels.fetch(cfg.logChannelId).catch(() => null);

  if (!channel || !channel.isTextBased() || !channel.send) return;

  await channel.send({
    embeds: [
      new EmbedBuilder()
        .setColor("#FFFFFF")
        .setTitle("⛨  ANTIRAID ALERT")
        .setDescription(description)
        .setFooter({ text: "PYRR OFFICIAL 〢 Security" })
        .setTimestamp()
    ]
  }).catch(() => {});
}

async function punishRaidMember(member, punishment) {
  const guild = member.guild;
  const botMember = guild.members.me;

  if (!botMember || !member.manageable) return false;

  try {
    if (punishment === "ban") {
      if (!botMember.permissions.has(PermissionsBitField.Flags.BanMembers)) return false;
      await member.ban({ reason: "PYRR AntiRaid protection" });
      return true;
    }

    if (punishment === "kick") {
      if (!botMember.permissions.has(PermissionsBitField.Flags.KickMembers)) return false;
      await member.kick("PYRR AntiRaid protection");
      return true;
    }

    if (punishment === "timeout") {
      if (!botMember.permissions.has(PermissionsBitField.Flags.ModerateMembers)) return false;
      await member.timeout(10 * 60 * 1000, "PYRR AntiRaid protection");
      return true;
    }
  } catch (error) {
    console.error("[PYRR AntiRaid Punishment Error]", error);
  }

  return false;
}

// Detect rapid joins. Raid punishment is applied only after the configured threshold.
client.on("guildMemberAdd", async member => {
  try {
    const guild = member.guild;
    const cfg = getAntiRaidConfig(guild.id);

    if (!cfg.enabled) return;
    if (cfg.exemptUsers.includes(member.id)) return;

    if (
      cfg.exemptRoles.length &&
      member.roles.cache.some(role => cfg.exemptRoles.includes(role.id))
    ) {
      return;
    }

    const now = Date.now();
    const key = guild.id;
    const windowMs = Math.max(3, cfg.windowSeconds) * 1000;

    const history = (pyrrJoinHistory.get(key) || [])
      .filter(entry => now - entry.time < windowMs);

    history.push({ id: member.id, time: now });
    pyrrJoinHistory.set(key, history);

    if (history.length < cfg.joinLimit) return;

    const lastTriggered = pyrrRaidCooldowns.get(key) || 0;

    if (now - lastTriggered < 30000) return;

    pyrrRaidCooldowns.set(key, now);

    await sendAntiRaidLog(
      guild,
      `Rapid joins detected: **${history.length}** members within **${cfg.windowSeconds} seconds**.\nConfigured punishment: **${cfg.punishment}**.`
    );

    if (cfg.lockdown) {
      const everyone = guild.roles.everyone;

      for (const channel of guild.channels.cache.values()) {
        if (!channel.isTextBased() || !channel.permissionOverwrites) continue;

        await channel.permissionOverwrites.edit(
          everyone,
          { SendMessages: false },
          { reason: "PYRR AntiRaid lockdown" }
        ).catch(() => {});
      }
    }

    for (const entry of history) {
      const raidMember = await guild.members.fetch(entry.id).catch(() => null);

      if (!raidMember || raidMember.user.bot) continue;
      if (cfg.exemptUsers.includes(raidMember.id)) continue;

      await punishRaidMember(raidMember, cfg.punishment);
    }

    await sendAntiRaidLog(
      guild,
      `AntiRaid response completed. Review the audit logs and confirm the server is secure.`
    );

    pyrrJoinHistory.set(key, []);
  } catch (error) {
    console.error("[PYRR AntiRaid Event Error]", error);
  }
});

// AntiRaid control panel interactions.
client.on("interactionCreate", async interaction => {
  if (!interaction.guild) return;

  const supported = [
    "pyrr_ar_toggle",
    "pyrr_ar_refresh",
    "pyrr_ar_lockdown",
    "pyrr_ar_punishment"
  ];

  if (!supported.includes(interaction.customId)) return;

  if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageGuild)) {
    return interaction.reply({
      content: "You need Manage Server permission to control AntiRaid.",
      ephemeral: true
    }).catch(() => {});
  }

  const cfg = getAntiRaidConfig(interaction.guild.id);

  if (interaction.customId === "pyrr_ar_toggle") {
    cfg.enabled = !cfg.enabled;
    saveDatabase();

    return interaction.update({
      embeds: [createAntiRaidEmbed(interaction.guild)],
      components: createAntiRaidRows()
    }).catch(() => {});
  }

  if (interaction.customId === "pyrr_ar_refresh") {
    return interaction.update({
      embeds: [createAntiRaidEmbed(interaction.guild)],
      components: createAntiRaidRows()
    }).catch(() => {});
  }

  if (interaction.customId === "pyrr_ar_lockdown") {
    cfg.lockdown = !cfg.lockdown;
    saveDatabase();

    return interaction.update({
      embeds: [createAntiRaidEmbed(interaction.guild)],
      components: createAntiRaidRows()
    }).catch(() => {});
  }

  if (interaction.customId === "pyrr_ar_punishment") {
    const value = interaction.values[0];

    if (!["kick", "ban", "timeout"].includes(value)) {
      return interaction.reply({
        content: "Invalid punishment.",
        ephemeral: true
      });
    }

    cfg.punishment = value;
    saveDatabase();

    return interaction.update({
      embeds: [createAntiRaidEmbed(interaction.guild)],
      components: createAntiRaidRows()
    }).catch(() => {});
  }
});

console.log("[PYRR] AntiRaid system loaded.");

// PART 12 END — APPEND PART 13 BELOW// ==============================
// PART 13 — TICKET SYSTEM
// ==============================

function getTicketConfig(guildId) {
  const cfg = getConfig(guildId);

  if (!cfg.tickets) cfg.tickets = {};

  const t = cfg.tickets;

  if (!("channelId" in t)) t.channelId = null;
  if (!("categoryId" in t)) t.categoryId = null;
  if (!("roleId" in t)) t.roleId = null;
  if (!("banner" in t)) t.banner = null;
  if (!("description" in t)) {
    t.description = "Choose an option below to contact our support team.";
  }
  if (!Array.isArray(t.openTickets)) t.openTickets = [];
  if (!Array.isArray(t.panels)) t.panels = [];

  return t;
}

function ticketEmbed(guild, title, description) {
  const cfg = getTicketConfig(guild.id);

  const embed = new EmbedBuilder()
    .setColor("#FFFFFF")
    .setTitle("⌘  " + title)
    .setDescription(description)
    .setFooter({ text: "PYRR OFFICIAL 〢 Support" })
    .setTimestamp();

  if (cfg.banner && validImageUrl(cfg.banner)) {
    embed.setImage(cfg.banner);
  } else if (guild.iconURL()) {
    embed.setThumbnail(guild.iconURL({ size: 512 }));
  }

  return embed;
}

function ticketPanelRows() {
  return [
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("pyrr_ticket_open")
        .setPlaceholder("Choose a ticket category")
        .addOptions(
          {
            label: "General Support",
            value: "support",
            description: "Ask a question or request assistance."
          },
          {
            label: "Partnership",
            value: "partnership",
            description: "Submit a partnership request."
          },
          {
            label: "Create Ticket",
            value: "create",
            description: "Open a general ticket."
          },
          {
            label: "Claim Perks",
            value: "perks",
            description: "Ask about available server perks."
          },
          {
            label: "Shop",
            value: "shop",
            description: "Ask about shop-related questions."
          }
        )
    )
  ];
}

function ticketControlRows() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("pyrr_ticket_claim")
        .setLabel("Claim Ticket")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("pyrr_ticket_close")
        .setLabel("Close Ticket")
        .setStyle(ButtonStyle.Danger)
    )
  ];
}

function ticketSlug(value) {
  return String(value || "ticket")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 20);
}

async function findOpenTicket(guild, userId) {
  const cfg = getTicketConfig(guild.id);

  const record = cfg.openTickets.find(
    item => item.userId === userId && item.status === "open"
  );

  if (!record) return null;

  const channel = await guild.channels.fetch(record.channelId).catch(() => null);

  if (!channel) {
    cfg.openTickets = cfg.openTickets.filter(
      item => item.channelId !== record.channelId
    );
    saveDatabase();
    return null;
  }

  return channel;
}

async function createTicketChannel(guild, user, category) {
  const cfg = getTicketConfig(guild.id);

  const existing = await findOpenTicket(guild, user.id);
  if (existing) return { channel: existing, existed: true };

  const botMember = guild.members.me;

  if (
    !botMember ||
    !botMember.permissions.has(PermissionsBitField.Flags.ManageChannels)
  ) {
    throw new Error("I need Manage Channels permission to create tickets.");
  }

  const overwrites = [
    {
      id: guild.roles.everyone.id,
      deny: [PermissionsBitField.Flags.ViewChannel]
    },
    {
      id: user.id,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.AttachFiles,
        PermissionsBitField.Flags.EmbedLinks
      ]
    },
    {
      id: botMember.id,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.ManageChannels,
        PermissionsBitField.Flags.ManageMessages
      ]
    }
  ];

  if (cfg.roleId) {
    const supportRole = await guild.roles.fetch(cfg.roleId).catch(() => null);

    if (supportRole) {
      overwrites.push({
        id: supportRole.id,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ReadMessageHistory
        ]
      });
    }
  }

  const options = {
    name: `${ticketSlug(category)}-${ticketSlug(user.username)}`,
    type: ChannelType.GuildText,
    permissionOverwrites: overwrites,
    topic: `PYRR ticket | Owner: ${user.id} | Type: ${category}`
  };

  if (cfg.categoryId) {
    const parent = await guild.channels.fetch(cfg.categoryId).catch(() => null);

    if (parent && parent.type === ChannelType.GuildCategory) {
      options.parent = parent.id;
    }
  }

  const channel = await guild.channels.create(options);

  cfg.openTickets.push({
    channelId: channel.id,
    userId: user.id,
    category,
    status: "open",
    claimedBy: null,
    createdAt: Date.now()
  });

  saveDatabase();

  await channel.send({
    content: `<@${user.id}>${cfg.roleId ? ` <@&${cfg.roleId}>` : ""}`,
    embeds: [
      ticketEmbed(
        guild,
        `${category.toUpperCase()} TICKET`,
        `Welcome, <@${user.id}>.\n\n${cfg.description}\n\nPlease explain your request clearly. A support team member will assist you.`
      )
    ],
    components: ticketControlRows(),
    allowedMentions: {
      users: [user.id],
      roles: cfg.roleId ? [cfg.roleId] : []
    }
  });

  return { channel, existed: false };
}

// Configure the panel channel.
registerCommand({
  name: "ticket",
  description: "Configure and manage the ticket system.",
  category: "Tickets",
  options: [
    {
      name: "action",
      description: "Ticket configuration action.",
      type: "string",
      required: true,
      choices: [
        { name: "Channel", value: "channel" },
        { name: "Category", value: "category" },
        { name: "Support Role", value: "role" },
        { name: "Banner", value: "banner" },
        { name: "Description", value: "description" },
        { name: "Send Panel", value: "send" },
        { name: "Add Member", value: "add" }
      ]
    },
    {
      name: "channel",
      description: "Ticket panel channel.",
      type: "channel",
      required: false
    },
    {
      name: "category",
      description: "Category where tickets are created.",
      type: "channel",
      required: false
    },
    {
      name: "role",
      description: "Support role.",
      type: "role",
      required: false
    },
    {
      name: "value",
      description: "Banner URL, description, or member ID.",
      type: "string",
      required: false
    }
  ],
  execute: async ctx => {
    if (!ctx.guild) return ctx.reply("Use this command inside a server.");
    if (!canManageSettings(ctx)) {
      return ctx.reply("You need Manage Server permission.");
    }

    const action = ctx.isInteraction
      ? ctx.getString("action")
      : (ctx.args[0] || "").toLowerCase();

    const channel = ctx.isInteraction
      ? ctx.getChannel("channel")
      : ctx.message.mentions.channels.first();

    const category = ctx.isInteraction
      ? ctx.getChannel("category")
      : null;

    const role = ctx.isInteraction
      ? ctx.getRole("role")
      : ctx.message.mentions.roles.first();

    const value = ctx.isInteraction
      ? ctx.getString("value")
      : ctx.args.slice(1).join(" ");

    const cfg = getTicketConfig(ctx.guild.id);

    if (action === "channel") {
      if (!channel || !channel.isTextBased() || !channel.send) {
        return ctx.reply("Select a valid ticket panel text channel.");
      }

      cfg.channelId = channel.id;
      saveDatabase();
      return ctx.reply("Ticket panel channel set to " + channel + ".");
    }

    if (action === "category") {
      if (!category || category.type !== ChannelType.GuildCategory) {
        return ctx.reply("Select a valid server category.");
      }

      cfg.categoryId = category.id;
      saveDatabase();
      return ctx.reply("Ticket category updated.");
    }

    if (action === "role") {
      if (!role) return ctx.reply("Select a valid support role.");

      cfg.roleId = role.id;
      saveDatabase();
      return ctx.reply("Support role set to " + role + ".");
    }

    if (action === "banner") {
      if (!validImageUrl(value)) {
        return ctx.reply("Provide a valid image URL starting with `https://`.");
      }

      cfg.banner = value;
      saveDatabase();
      return ctx.reply("Ticket banner updated.");
    }

    if (action === "description") {
      if (!value || value.length > 1500) {
        return ctx.reply("Provide a description under 1500 characters.");
      }

      cfg.description = value;
      saveDatabase();
      return ctx.reply("Ticket description updated.");
    }

    if (action === "send") {
      if (!cfg.channelId) {
        return ctx.reply("Configure the panel channel first.");
      }

      const panelChannel = await ctx.guild.channels.fetch(cfg.channelId).catch(() => null);

      if (!panelChannel || !panelChannel.isTextBased() || !panelChannel.send) {
        return ctx.reply("The configured ticket panel channel is unavailable.");
      }

      const panel = await panelChannel.send({
        embeds: [
          ticketEmbed(
            ctx.guild,
            "PYRR OFFICIAL SUPPORT",
            cfg.description
          )
        ],
        components: ticketPanelRows()
      });

      cfg.panels.push(panel.id);
      saveDatabase();

      return ctx.reply("Ticket panel sent to " + panelChannel + ".");
    }

    if (action === "add") {
      const memberId = (value || "").replace(/[<@!>]/g, "");
      const member = await ctx.guild.members.fetch(memberId).catch(() => null);

      if (!member) {
        return ctx.reply("Provide a valid member ID in the value field.");
      }

      const ticket = ctx.channel;

      const record = cfg.openTickets.find(
        item => item.channelId === ticket.id && item.status === "open"
      );

      if (!record) {
        return ctx.reply("Use this command inside an open ticket channel.");
      }

      await ticket.permissionOverwrites.edit(member.id, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true
      });

      return ctx.reply(`${member} has been added to this ticket.`);
    }

    return ctx.reply("Available actions: `channel`, `category`, `role`, `banner`, `description`, `send`, `add`.");
  }
});

// Prefix shortcut: ,tping
registerCommand({
  name: "tping",
  description: "Ping the ticket support team.",
  category: "Tickets",
  slash: false,
  execute: async ctx => {
    if (!ctx.guild) return ctx.reply("Use this command inside a server.");

    const cfg = getTicketConfig(ctx.guild.id);

    const record = cfg.openTickets.find(
      item => item.channelId === ctx.channel.id && item.status === "open"
    );

    if (!record) {
      return ctx.reply("Use this command inside an open ticket.");
    }

    if (!cfg.roleId) {
      return ctx.reply("No support role is configured.");
    }

    return ctx.reply({
      content: `<@&${cfg.roleId}> Support has been requested.`,
      allowedMentions: { roles: [cfg.roleId] }
    });
  }
});

// Ticket panel selection and ticket buttons.
client.on("interactionCreate", async interaction => {
  if (!interaction.guild) return;

  try {
    if (
      interaction.isStringSelectMenu() &&
      interaction.customId === "pyrr_ticket_open"
    ) {
      await interaction.deferReply({ ephemeral: true });

      const category = interaction.values[0];
      const result = await createTicketChannel(
        interaction.guild,
        interaction.user,
        category
      );

      return interaction.editReply({
        content: result.existed
          ? `You already have an open ticket: ${result.channel}`
          : `Your ticket has been created: ${result.channel}`
      });
    }

    if (!interaction.isButton()) return;

    if (
      interaction.customId !== "pyrr_ticket_close" &&
      interaction.customId !== "pyrr_ticket_claim"
    ) {
      return;
    }

    const cfg = getTicketConfig(interaction.guild.id);

    const record = cfg.openTickets.find(
      item => item.channelId === interaction.channelId && item.status === "open"
    );

    if (!record) {
      return interaction.reply({
        content: "This channel is not registered as an open ticket.",
        ephemeral: true
      });
    }

    const isOwner = record.userId === interaction.user.id;
    const hasManageGuild = interaction.memberPermissions?.has(
      PermissionsBitField.Flags.ManageGuild
    );

    const supportRoleMember = cfg.roleId &&
      interaction.member?.roles?.cache?.has(cfg.roleId);

    if (interaction.customId === "pyrr_ticket_claim") {
      if (!hasManageGuild && !supportRoleMember) {
        return interaction.reply({
          content: "Only the support team can claim this ticket.",
          ephemeral: true
        });
      }

      record.claimedBy = interaction.user.id;
      saveDatabase();

      return interaction.reply({
        content: `Ticket claimed by ${interaction.user}.`,
        allowedMentions: { users: [interaction.user.id] }
      });
    }

    if (!isOwner && !hasManageGuild && !supportRoleMember) {
      return interaction.reply({
        content: "Only the ticket owner or support team can close this ticket.",
        ephemeral: true
      });
    }

    await interaction.reply({
      content: "Ticket closing in 5 seconds."
    });

    record.status = "closed";
    saveDatabase();

    setTimeout(() => {
      interaction.channel.delete("PYRR ticket closed").catch(() => {});
    }, 5000);
  } catch (error) {
    console.error("[PYRR Ticket Error]", error);

    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: "Ticket action failed. Check the bot permissions and configuration.",
        ephemeral: true
      }).catch(() => {});
    } else if (interaction.deferred) {
      await interaction.editReply(
        "Ticket action failed. Check the bot permissions and configuration."
      ).catch(() => {});
    }
  }
});

console.log("[PYRR] Ticket system loaded.");

// PART 13 END — APPEND PART 14 BELOW// ==============================
// PART 14 — SETPYRR, BOT PROFILE & PREMIUM
// ==============================

function getPremiumConfig() {
    if (!Array.isArray(database.premium)) {
        database.premium = [];
    }
    return database.premium;
}

function isBotOwner(userId) {
    return OWNER_IDS.includes(userId);
}

function parseImageAttachment(ctx) {
    if (ctx.isInteraction) {
        return ctx.getString("url");
    }

    const attachment = ctx.source.attachments?.first();

    if (attachment && attachment.contentType?.startsWith("image/")) {
        return attachment.url;
    }

    return ctx.args?.[0] || null;
}

// SET BOT PROFILE PICTURE
registerCommand({
    name: "setpfp",
    description: "Change the bot profile picture",
    category: "SetPyrr",
    aliases: [],
    options: [
        {
            name: "url",
            description: "Direct image URL",
            type: "string",
            required: true
        }
    ],
    execute: async (ctx) => {
        if (!isBotOwner(ctx.user.id)) {
            return ctx.reply({
                embeds: [
                    makeEmbed(
                        "Access Denied",
                        "Only the configured bot owner can use this command."
                    )
                ]
            });
        }

        const imageUrl = parseImageAttachment(ctx);

        if (!imageUrl) {
            return ctx.reply({
                embeds: [
                    makeEmbed(
                        "Missing Image",
                        "Provide a direct image URL or attach an image when using the prefix command."
                    )
                ]
            });
        }

        if (!/^https:\/\/\S+/i.test(imageUrl)) {
            return ctx.reply({
                embeds: [
                    makeEmbed(
                        "Invalid URL",
                        "Please provide a valid HTTPS image URL."
                    )
                ]
            });
        }

        try {
            await ctx.source.client.user.setAvatar(imageUrl);

            return ctx.reply({
                embeds: [
                    makeEmbed(
                        "Profile Updated",
                        "The bot profile picture has been updated."
                    )
                ]
            });
        } catch (error) {
            console.error("[SETPFP]", error);

            return ctx.reply({
                embeds: [
                    makeEmbed(
                        "Update Failed",
                        "Could not update the bot profile picture. Check the image URL and try again later."
                    )
                ]
            });
        }
    }
});

// SET BOT BANNER
registerCommand({
    name: "setbanner",
    description: "Change the bot profile banner",
    category: "SetPyrr",
    aliases: [],
    options: [
        {
            name: "url",
            description: "Direct image URL",
            type: "string",
            required: true
        }
    ],
    execute: async (ctx) => {
        if (!isBotOwner(ctx.user.id)) {
            return ctx.reply({
                embeds: [
                    makeEmbed(
                        "Access Denied",
                        "Only the configured bot owner can use this command."
                    )
                ]
            });
        }

        return ctx.reply({
            embeds: [
                makeEmbed(
                    "Banner Update",
                    "Changing a bot banner may not be supported for your bot account through the Discord API. This command does not claim the banner was changed."
                )
            ]
        });
    }
});

// ADD OR REMOVE PREMIUM SERVERS
registerCommand({
    name: "prem",
    description: "Manage premium server access",
    category: "Premium",
    aliases: [],
    options: [
        {
            name: "action",
            description: "Premium action",
            type: "string",
            required: true,
            choices: [
                { name: "Add", value: "add" },
                { name: "Remove", value: "remove" },
                { name: "List", value: "list" }
            ]
        },
        {
            name: "server_id",
            description: "Target server ID",
            type: "string",
            required: false
        }
    ],
    execute: async (ctx) => {
        if (!isBotOwner(ctx.user.id)) {
            return ctx.reply({
                embeds: [
                    makeEmbed(
                        "Access Denied",
                        "Only the configured bot owner can manage premium servers."
                    )
                ]
            });
        }

        const action = ctx.isInteraction
            ? ctx.getString("action")
            : ctx.args[0]?.toLowerCase();

        const serverId = ctx.isInteraction
            ? ctx.getString("server_id")
            : ctx.args[1];

        const premium = getPremiumConfig();

        if (action === "list") {
            const list = premium.length
                ? premium.map((id, index) =>
                    `\`${index + 1}.\` ${id}`
                  ).join("\n")
                : "No premium servers configured.";

            return ctx.reply({
                embeds: [
                    makeEmbed("Premium Servers", list)
                ]
            });
        }

        if (!["add", "remove"].includes(action)) {
            return ctx.reply({
                embeds: [
                    makeEmbed(
                        "Invalid Action",
                        "Use `add`, `remove`, or `list`."
                    )
                ]
            });
        }

        if (!serverId || !/^\d{17,20}$/.test(serverId)) {
            return ctx.reply({
                embeds: [
                    makeEmbed(
                        "Invalid Server ID",
                        "Provide a valid Discord server ID."
                    )
                ]
            });
        }

        if (action === "add") {
            if (premium.includes(serverId)) {
                return ctx.reply({
                    embeds: [
                        makeEmbed(
                            "Already Premium",
                            "That server already has premium access."
                        )
                    ]
                });
            }

            premium.push(serverId);
        } else {
            if (!premium.includes(serverId)) {
                return ctx.reply({
                    embeds: [
                        makeEmbed(
                            "Not Found",
                            "That server is not on the premium list."
                        )
                    ]
                });
            }

            database.premium = premium.filter(
                id => id !== serverId
            );
        }

        saveDatabase();

        return ctx.reply({
            embeds: [
                makeEmbed(
                    "Premium Updated",
                    `Server ID: \`${serverId}\`\nAction: \`${action}\``
                )
            ]
        });
    }
});

// CHECK PREMIUM STATUS
registerCommand({
    name: "premium",
    description: "Check this server's premium status",
    category: "Premium",
    aliases: [],
    options: [],
    execute: async (ctx) => {
        if (!ctx.guild) {
            return ctx.reply({
                embeds: [
                    makeEmbed(
                        "Server Only",
                        "Use this command inside a server."
                    )
                ]
            });
        }

        const enabled = getPremiumConfig().includes(
            ctx.guild.id
        );

        return ctx.reply({
            embeds: [
                makeEmbed(
                    "Premium Status",
                    enabled
                        ? "This server has premium access."
                        : "This server does not have premium access."
                )
            ]
        });
    }
});

// PART 14 END — APPEND PART 15 BELOW// ==============================
// PART 15 — PARTNERSHIP SYSTEM
// ==============================

function getPartnershipConfig(guildId) {
    const cfg = getConfig(guildId);

    if (!cfg.partnership) {
        cfg.partnership = {
            enabled: false,
            channelId: null,
            managerRoleId: null,
            alliedRoleId: null
        };
    }

    return cfg.partnership;
}

const pyrrPendingPartnerships = new Map();

// SETUP PARTNERSHIP
registerCommand({
    name: "partnershipsetup",
    description: "Configure the partnership system",
    category: "Partnership",
    aliases: ["partnershipconfig"],
    slash: false,
    execute: async (ctx) => {
        if (!ctx.guild) {
            return ctx.reply({
                embeds: [
                    makeEmbed(
                        "Server Only",
                        "Use this command inside your server."
                    )
                ]
            });
        }

        if (!canManageSettings(ctx)) {
            return ctx.reply({
                embeds: [
                    makeEmbed(
                        "Access Denied",
                        "You need permission to manage server settings."
                    )
                ]
            });
        }

        const channel = ctx.source.mentions?.channels?.first();
        const roles = ctx.source.mentions?.roles;
        const roleList = roles ? [...roles.values()] : [];

        const managerRole = roleList[0];
        const alliedRole = roleList[1];

        if (!channel || !managerRole || !alliedRole) {
            return ctx.reply({
                embeds: [
                    makeEmbed(
                        "Partnership Setup",
                        "Mention the partnership channel, manager role, and allied role.\n\n" +
                        "**Example:**\n" +
                        "`,partnershipsetup #partnerships @PartnershipManager @Allied`"
                    )
                ]
            });
        }

        if (!channel.isTextBased() || !channel.guild) {
            return ctx.reply({
                embeds: [
                    makeEmbed(
                        "Invalid Channel",
                        "Please mention a text channel from this server."
                    )
                ]
            });
        }

        const config = getPartnershipConfig(ctx.guild.id);

        config.enabled = true;
        config.channelId = channel.id;
        config.managerRoleId = managerRole.id;
        config.alliedRoleId = alliedRole.id;

        saveDatabase();

        return ctx.reply({
            embeds: [
                makeEmbed(
                    "Partnership Configured",
                    `**Channel:** ${channel}\n` +
                    `**Manager Role:** ${managerRole}\n` +
                    `**Allied Role:** ${alliedRole}\n\n` +
                    "Use `,partnershippanel` to send the partnership panel."
                )
            ]
        });
    }
});

// SEND PARTNERSHIP PANEL
registerCommand({
    name: "partnershippanel",
    description: "Send the partnership application panel",
    category: "Partnership",
    aliases: ["partnerpanel"],
    slash: false,
    execute: async (ctx) => {
        if (!ctx.guild) {
            return ctx.reply({
                embeds: [
                    makeEmbed(
                        "Server Only",
                        "Use this command inside your server."
                    )
                ]
            });
        }

        if (!canManageSettings(ctx)) {
            return ctx.reply({
                embeds: [
                    makeEmbed(
                        "Access Denied",
                        "You need permission to manage server settings."
                    )
                ]
            });
        }

        const config = getPartnershipConfig(ctx.guild.id);

        if (!config.enabled) {
            return ctx.reply({
                embeds: [
                    makeEmbed(
                        "Not Configured",
                        "Run `,partnershipsetup #channel @ManagerRole @AlliedRole` first."
                    )
                ]
            });
        }

        const embed = makeEmbed(
            "PYRR OFFICIAL 〢 Partnership",
            "Interested in partnering with our community?\n\n" +
            "〢 Open a partnership ticket.\n" +
            "〢 Submit your server advertisement.\n" +
            "〢 Wait for staff approval.\n\n" +
            "Please keep advertisements accurate and follow server rules."
        );

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId("pyrr_partner_open")
                .setLabel("Apply for Partnership")
                .setStyle(ButtonStyle.Secondary)
        );

        return ctx.reply({
            embeds: [embed],
            components: [row]
        });
    }
});

// SUBMIT A PARTNERSHIP ADVERTISEMENT
registerCommand({
    name: "partnerad",
    description: "Submit a partnership advertisement for review",
    category: "Partnership",
    aliases: ["partnershipad"],
    slash: false,
    execute: async (ctx) => {
        if (!ctx.guild || !ctx.channel) {
            return ctx.reply({
                embeds: [
                    makeEmbed(
                        "Server Only",
                        "Use this command inside a server channel."
                    )
                ]
            });
        }

        const config = getPartnershipConfig(ctx.guild.id);

        if (!config.enabled) {
            return ctx.reply({
                embeds: [
                    makeEmbed(
                        "Partnership Disabled",
                        "The partnership system has not been configured."
                    )
                ]
            });
        }

        if (!ctx.channel.name?.toLowerCase().includes("partnership")) {
            return ctx.reply({
                embeds: [
                    makeEmbed(
                        "Wrong Channel",
                        "Use this command inside your partnership ticket channel."
                    )
                ]
            });
        }

        const ad = ctx.args.join(" ").trim();

        if (!ad || ad.length < 10) {
            return ctx.reply({
                embeds: [
                    makeEmbed(
                        "Advertisement Required",
                        "Example:\n`,partnerad Join our community for events, games, and friendly chats! discord.gg/example`"
                    )
                ]
            });
        }

        if (ad.length > 1500) {
            return ctx.reply({
                embeds: [
                    makeEmbed(
                        "Advertisement Too Long",
                        "Keep your advertisement under 1500 characters."
                    )
                ]
            });
        }

        const pendingId = `${ctx.guild.id}_${ctx.user.id}_${Date.now()}`;

        pyrrPendingPartnerships.set(pendingId, {
            guildId: ctx.guild.id,
            userId: ctx.user.id,
            channelId: ctx.channel.id,
            ad,
            createdAt: Date.now()
        });

        const reviewEmbed = makeEmbed(
            "Partnership Review",
            `**Submitted by:** ${ctx.user}\n` +
            `**Application channel:** ${ctx.channel}\n\n` +
            "**Advertisement:**\n" +
            ad +
            "\n\nReview this submission before approving it."
        );

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`pyrr_partner_yes:${pendingId}`)
                .setLabel("Approve")
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId(`pyrr_partner_no:${pendingId}`)
                .setLabel("Reject")
                .setStyle(ButtonStyle.Secondary)
        );

        let reviewChannel = ctx.guild.channels.cache.get(
            config.channelId
        );

        if (!reviewChannel || !reviewChannel.isTextBased()) {
            pyrrPendingPartnerships.delete(pendingId);

            return ctx.reply({
                embeds: [
                    makeEmbed(
                        "Configuration Error",
                        "The configured partnership channel is unavailable."
                    )
                ]
            });
        }

        try {
            await reviewChannel.send({
                content: config.managerRoleId
                    ? `<@&${config.managerRoleId}>`
                    : undefined,
                embeds: [reviewEmbed],
                components: [row],
                allowedMentions: {
                    parse: [],
                    roles: config.managerRoleId
                        ? [config.managerRoleId]
                        : []
                }
            });

            return ctx.reply({
                embeds: [
                    makeEmbed(
                        "Submitted for Review",
                        "Your advertisement has been sent to the partnership team. Please wait for their decision."
                    )
                ]
            });
        } catch (error) {
            console.error("[PARTNERSHIP SUBMIT]", error);
            pyrrPendingPartnerships.delete(pendingId);

            return ctx.reply({
                embeds: [
                    makeEmbed(
                        "Submission Failed",
                        "I couldn't send your submission. Check the bot's channel permissions."
                    )
                ]
            });
        }
    }
});

// PARTNERSHIP BUTTON HANDLER
client.on("interactionCreate", async interaction => {
    if (!interaction.isButton()) return;

    const customId = interaction.customId;

    // OPEN PARTNERSHIP APPLICATION GUIDE
    if (customId === "pyrr_partner_open") {
        const config = getPartnershipConfig(
            interaction.guildId
        );

        if (!config.enabled) {
            return interaction.reply({
                content: "The partnership system is not configured.",
                ephemeral: true
            });
        }

        return interaction.reply({
            embeds: [
                makeEmbed(
                    "How to Apply",
                    "Open a partnership ticket using the ticket panel.\n\n" +
                    "Inside a partnership ticket, submit your advertisement using:\n" +
                    "`,partnerad Your server advertisement here`\n\n" +
                    "Your submission will be reviewed by the partnership team."
                )
            ],
            ephemeral: true
        });
    }

    // APPROVE OR REJECT SUBMISSIONS
    if (
        !customId.startsWith("pyrr_partner_yes:") &&
        !customId.startsWith("pyrr_partner_no:")
    ) {
        return;
    }

    if (!interaction.guild) {
        return interaction.reply({
            content: "This action must be used inside a server.",
            ephemeral: true
        });
    }

    const isApprove = customId.startsWith("pyrr_partner_yes:");
    const pendingId = customId.slice(
        isApprove
            ? "pyrr_partner_yes:".length
            : "pyrr_partner_no:".length
    );

    const pending = pyrrPendingPartnerships.get(pendingId);

    if (!pending) {
        return interaction.reply({
            content: "This submission has expired or was already processed.",
            ephemeral: true
        });
    }

    if (pending.guildId !== interaction.guild.id) {
        return interaction.reply({
            content: "This submission belongs to another server.",
            ephemeral: true
        });
    }

    const config = getPartnershipConfig(interaction.guild.id);
    const member = interaction.member;

    const hasManagerRole =
        Boolean(config.managerRoleId) &&
        member.roles?.cache?.has(config.managerRoleId);

    const hasManageGuild =
        member.permissions?.has(
            PermissionsBitField.Flags.ManageGuild
        );

    if (!hasManagerRole && !hasManageGuild) {
        return interaction.reply({
            content: "You need the partnership manager role or Manage Server permission.",
            ephemeral: true
        });
    }

    if (!isApprove) {
        pyrrPendingPartnerships.delete(pendingId);

        await interaction.update({
            embeds: [
                makeEmbed(
                    "Partnership Rejected",
                    `Submission from <@${pending.userId}> was rejected by ${interaction.user}.`
                )
            ],
            components: []
        });

        const applicantChannel = interaction.guild.channels.cache.get(
            pending.channelId
        );

        if (applicantChannel?.isTextBased()) {
            await applicantChannel.send({
                embeds: [
                    makeEmbed(
                        "Application Update",
                        "Your partnership advertisement was not approved. Please contact the partnership team if you need clarification."
                    )
                ]
            }).catch(() => {});
        }

        return;
    }

    const destination = interaction.guild.channels.cache.get(
        config.channelId
    );

    if (!destination || !destination.isTextBased()) {
        return interaction.reply({
            content: "The configured partnership channel is unavailable.",
            ephemeral: true
        });
    }

    const approvedEmbed = makeEmbed(
        "PYRR OFFICIAL 〢 New Partnership",
        pending.ad
    );

    approvedEmbed.addFields({
        name: "Partnership Status",
        value: "Approved",
        inline: true
    });

    try {
        await destination.send({
            embeds: [approvedEmbed],
            allowedMentions: {
                parse: []
            }
        });

        const applicant = await interaction.guild.members
            .fetch(pending.userId)
            .catch(() => null);

        if (applicant && config.alliedRoleId) {
            const alliedRole = interaction.guild.roles.cache.get(
                config.alliedRoleId
            );

            const botMember = interaction.guild.members.me;

            if (
                alliedRole &&
                botMember &&
                botMember.permissions.has(
                    PermissionsBitField.Flags.ManageRoles
                ) &&
                alliedRole.position < botMember.roles.highest.position
            ) {
                await applicant.roles.add(
                    alliedRole,
                    "Partnership application approved"
                ).catch(error => {
                    console.error("[PARTNERSHIP ROLE]", error);
                });
            }
        }

        pyrrPendingPartnerships.delete(pendingId);

        await interaction.update({
            embeds: [
                makeEmbed(
                    "Partnership Approved",
                    `Approved by ${interaction.user}. The advertisement was published.`
                )
            ],
            components: []
        });

        const applicantChannel = interaction.guild.channels.cache.get(
            pending.channelId
        );

        if (applicantChannel?.isTextBased()) {
            await applicantChannel.send({
                embeds: [
                    makeEmbed(
                        "Application Approved",
                        "Your partnership advertisement has been approved and published. Thank you for partnering with us."
                    )
                ]
            }).catch(() => {});
        }
    } catch (error) {
        console.error("[PARTNERSHIP APPROVAL]", error);

        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
                content: "Something went wrong while approving this submission.",
                ephemeral: true
            }).catch(() => {});
        }
    }
});

// PART 15 END — APPEND PART 16 BELOW// ==============================
// PART 16 — SERVER LOGS SYSTEM
// ==============================

function getServerLogsConfig(guildId) {
    const cfg = getConfig(guildId);

    if (!cfg.serverLogs) {
        cfg.serverLogs = {
            enabled: false,
            channelId: null,
            events: {
                memberJoin: true,
                memberLeave: true,
                messageDelete: true,
                messageEdit: true,
                ban: true,
                channelCreate: true,
                channelDelete: true,
                roleCreate: true,
                roleDelete: true
            }
        };
    }

    return cfg.serverLogs;
}

async function sendServerLog(guild, eventKey, title, description) {
    try {
        if (!guild) return;

        const config = getServerLogsConfig(guild.id);

        if (!config.enabled || !config.channelId) return;
        if (config.events[eventKey] === false) return;

        const channel = guild.channels.cache.get(config.channelId);

        if (!channel || !channel.isTextBased()) return;

        const embed = makeEmbed(title, description);

        await channel.send({
            embeds: [embed],
            allowedMentions: {
                parse: []
            }
        });
    } catch (error) {
        console.error("[SERVER LOGS]", error);
    }
}

function shortenLogText(value, maxLength = 900) {
    if (!value) return "*No text available.*";

    const textValue = String(value);

    return textValue.length > maxLength
        ? textValue.slice(0, maxLength) + "..."
        : textValue;
}

// CONFIGURE LOG CHANNEL
registerCommand({
    name: "setlogs",
    description: "Set the server logging channel",
    category: "Logging",
    aliases: ["logchannel"],
    slash: false,
    execute: async (ctx) => {
        if (!ctx.guild) {
            return ctx.reply({
                embeds: [
                    makeEmbed(
                        "Server Only",
                        "Use this command inside a server."
                    )
                ]
            });
        }

        if (!canManageSettings(ctx)) {
            return ctx.reply({
                embeds: [
                    makeEmbed(
                        "Access Denied",
                        "You need permission to manage server settings."
                    )
                ]
            });
        }

        const channel = ctx.source.mentions?.channels?.first();

        if (
            !channel ||
            !channel.isTextBased() ||
            channel.guild?.id !== ctx.guild.id
        ) {
            return ctx.reply({
                embeds: [
                    makeEmbed(
                        "Invalid Channel",
                        "Mention a text channel from this server.\n\nExample: `,setlogs #server-logs`"
                    )
                ]
            });
        }

        const config = getServerLogsConfig(ctx.guild.id);

        config.channelId = channel.id;
        config.enabled = true;

        saveDatabase();

        return ctx.reply({
            embeds: [
                makeEmbed(
                    "Server Logs Enabled",
                    `Log channel set to ${channel}.\n\nUse \`,logs status\` to view the current configuration.`
                )
            ]
        });
    }
});

// ENABLE, DISABLE, OR CHECK LOGS
registerCommand({
    name: "logs",
    description: "Manage server logging",
    category: "Logging",
    aliases: ["logsettings"],
    slash: false,
    execute: async (ctx) => {
        if (!ctx.guild) {
            return ctx.reply({
                embeds: [
                    makeEmbed(
                        "Server Only",
                        "Use this command inside a server."
                    )
                ]
            });
        }

        if (!canManageSettings(ctx)) {
            return ctx.reply({
                embeds: [
                    makeEmbed(
                        "Access Denied",
                        "You need permission to manage server settings."
                    )
                ]
            });
        }

        const action = (ctx.args[0] || "status").toLowerCase();
        const config = getServerLogsConfig(ctx.guild.id);

        if (action === "enable") {
            if (!config.channelId) {
                return ctx.reply({
                    embeds: [
                        makeEmbed(
                            "Channel Required",
                            "Set a log channel first using `,setlogs #server-logs`."
                        )
                    ]
                });
            }

            config.enabled = true;
            saveDatabase();

            return ctx.reply({
                embeds: [
                    makeEmbed(
                        "Logs Enabled",
                        "Server logging is now enabled."
                    )
                ]
            });
        }

        if (action === "disable") {
            config.enabled = false;
            saveDatabase();

            return ctx.reply({
                embeds: [
                    makeEmbed(
                        "Logs Disabled",
                        "Server logging is now disabled."
                    )
                ]
            });
        }

        if (action !== "status") {
            return ctx.reply({
                embeds: [
                    makeEmbed(
                        "Usage",
                        "Use `,logs enable`, `,logs disable`, or `,logs status`."
                    )
                ]
            });
        }

        const channel = config.channelId
            ? ctx.guild.channels.cache.get(config.channelId)
            : null;

        return ctx.reply({
            embeds: [
                makeEmbed(
                    "Server Logs Status",
                    `**Status:** ${config.enabled ? "Enabled" : "Disabled"}\n` +
                    `**Channel:** ${channel || "Not configured"}\n\n` +
                    "**Tracked events**\n" +
                    "▪ Member joins and leaves\n" +
                    "▪ Message deletions and edits\n" +
                    "▪ Member bans\n" +
                    "▪ Channel creation and deletion\n" +
                    "▪ Role creation and deletion"
                )
            ]
        });
    }
});

// TOGGLE INDIVIDUAL LOG EVENTS
registerCommand({
    name: "logevent",
    description: "Enable or disable a specific logging event",
    category: "Logging",
    aliases: [],
    slash: false,
    execute: async (ctx) => {
        if (!ctx.guild) {
            return ctx.reply({
                embeds: [
                    makeEmbed(
                        "Server Only",
                        "Use this command inside a server."
                    )
                ]
            });
        }

        if (!canManageSettings(ctx)) {
            return ctx.reply({
                embeds: [
                    makeEmbed(
                        "Access Denied",
                        "You need permission to manage server settings."
                    )
                ]
            });
        }

        const eventAliases = {
            join: "memberJoin",
            memberjoin: "memberJoin",
            leave: "memberLeave",
            memberleave: "memberLeave",
            delete: "messageDelete",
            messagedelete: "messageDelete",
            edit: "messageEdit",
            messageedit: "messageEdit",
            ban: "ban",
            channelcreate: "channelCreate",
            channeldelete: "channelDelete",
            rolecreate: "roleCreate",
            roledelete: "roleDelete"
        };

        const requestedEvent = (
            ctx.args[0] || ""
        ).toLowerCase();

        const action = (
            ctx.args[1] || ""
        ).toLowerCase();

        const eventKey = eventAliases[requestedEvent];

        if (
            !eventKey ||
            !["on", "off"].includes(action)
        ) {
            return ctx.reply({
                embeds: [
                    makeEmbed(
                        "Log Event Usage",
                        "Examples:\n" +
                        "`,logevent join off`\n" +
                        "`,logevent delete on`\n\n" +
                        "Events: `join`, `leave`, `delete`, `edit`, `ban`, `channelcreate`, `channeldelete`, `rolecreate`, `roledelete`."
                    )
                ]
            });
        }

        const config = getServerLogsConfig(ctx.guild.id);

        config.events[eventKey] = action === "on";

        saveDatabase();

        return ctx.reply({
            embeds: [
                makeEmbed(
                    "Log Event Updated",
                    `**Event:** ${eventKey}\n**Status:** ${action.toUpperCase()}`
                )
            ]
        });
    }
});

// MEMBER JOIN LOG
client.on("guildMemberAdd", async member => {
    await sendServerLog(
        member.guild,
        "memberJoin",
        "Member Joined",
        `**Member:** ${member.user.tag}\n` +
        `**User ID:** \`${member.id}\`\n` +
        `**Account Created:** <t:${Math.floor(member.user.createdTimestamp / 1000)}:R>\n` +
        `**Member Count:** ${member.guild.memberCount}`
    );
});

// MEMBER LEAVE LOG
client.on("guildMemberRemove", async member => {
    await sendServerLog(
        member.guild,
        "memberLeave",
        "Member Left",
        `**Member:** ${member.user?.tag || member.id}\n` +
        `**User ID:** \`${member.id}\`\n` +
        `**Member Count:** ${member.guild.memberCount}`
    );
});

// MESSAGE DELETE LOG
client.on("messageDelete", async message => {
    if (!message.guild || message.author?.bot) return;

    const author = message.author
        ? `${message.author.tag} (\`${message.author.id}\`)`
        : "Unknown author";

    const content = shortenLogText(message.content);

    await sendServerLog(
        message.guild,
        "messageDelete",
        "Message Deleted",
        `**Author:** ${author}\n` +
        `**Channel:** ${message.channel}\n` +
        `**Message ID:** \`${message.id}\`\n\n` +
        `**Content:**\n${content}`
    );
});

// MESSAGE EDIT LOG
client.on("messageUpdate", async (oldMessage, newMessage) => {
    if (!newMessage.guild) return;

    if (oldMessage.partial || newMessage.partial) {
        return;
    }

    if (newMessage.author?.bot) return;

    if (oldMessage.content === newMessage.content) return;

    await sendServerLog(
        newMessage.guild,
        "messageEdit",
        "Message Edited",
        `**Author:** ${newMessage.author?.tag || "Unknown"}\n` +
        `**Channel:** ${newMessage.channel}\n` +
        `**Message:** [Jump to message](${newMessage.url})\n\n` +
        `**Before:**\n${shortenLogText(oldMessage.content)}\n\n` +
        `**After:**\n${shortenLogText(newMessage.content)}`
    );
});

// MEMBER BAN LOG
client.on("guildBanAdd", async ban => {
    await sendServerLog(
        ban.guild,
        "ban",
        "Member Banned",
        `**User:** ${ban.user.tag}\n` +
        `**User ID:** \`${ban.user.id}\``
    );
});

// CHANNEL CREATE LOG
client.on("channelCreate", async channel => {
    if (!channel.guild) return;

    await sendServerLog(
        channel.guild,
        "channelCreate",
        "Channel Created",
        `**Channel:** ${channel}\n` +
        `**Name:** ${channel.name}\n` +
        `**Channel ID:** \`${channel.id}\``
    );
});

// CHANNEL DELETE LOG
client.on("channelDelete", async channel => {
    if (!channel.guild) return;

    await sendServerLog(
        channel.guild,
        "channelDelete",
        "Channel Deleted",
        `**Name:** ${channel.name}\n` +
        `**Channel ID:** \`${channel.id}\``
    );
});

// ROLE CREATE LOG
client.on("roleCreate", async role => {
    await sendServerLog(
        role.guild,
        "roleCreate",
        "Role Created",
        `**Role:** ${role.name}\n` +
        `**Role ID:** \`${role.id}\``
    );
});

// ROLE DELETE LOG
client.on("roleDelete", async role => {
    await sendServerLog(
        role.guild,
        "roleDelete",
        "Role Deleted",
        `**Role:** ${role.name}\n` +
        `**Role ID:** \`${role.id}\``
    );
});

// PART 16 END — APPEND PART 17 BELOW// ==============================
// PART 17 — GIVEAWAY SYSTEM
// ==============================

function getGiveawayDatabase() {
    if (!database.giveaways || typeof database.giveaways !== "object") {
        database.giveaways = {};
    }

    return database.giveaways;
}

function parseGiveawayDuration(input) {
    if (!input) return null;

    const match = String(input)
        .trim()
        .match(/^(\d+)\s*(s|m|h|d)$/i);

    if (!match) return null;

    const amount = Number(match[1]);
    const unit = match[2].toLowerCase();

    const multipliers = {
        s: 1000,
        m: 60 * 1000,
        h: 60 * 60 * 1000,
        d: 24 * 60 * 60 * 1000
    };

    const duration = amount * multipliers[unit];

    // Minimum 10 seconds, maximum 30 days.
    if (duration < 10000 || duration > 30 * 86400000) {
        return null;
    }

    return duration;
}

function giveawayEmbed(giveaway, ended = false) {
    const entries = Array.isArray(giveaway.entries)
        ? giveaway.entries
        : [];

    const embed = makeEmbed(
        ended ? "Giveaway Ended" : "PYRR OFFICIAL 〢 Giveaway",
        `**Prize:** ${giveaway.prize}\n\n` +
        `**Host:** <@${giveaway.hostId}>\n` +
        `**Winners:** ${giveaway.winnerCount}\n` +
        `**Entries:** ${entries.length}\n` +
        (
            ended
                ? `**Status:** Ended`
                : `**Ends:** <t:${Math.floor(giveaway.endsAt / 1000)}:R>`
        )
    );

    if (ended && giveaway.winnerIds) {
        embed.addFields({
            name: "Winner(s)",
            value: giveaway.winnerIds.length
                ? giveaway.winnerIds.map(id => `<@${id}>`).join(", ")
                : "No eligible entries."
        });
    }

    return embed;
}

function giveawayRows(giveaway, disabled = false) {
    return [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`pyrr_giveaway_enter:${giveaway.id}`)
                .setLabel("Enter Giveaway")
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(disabled)
        )
    ];
}

function drawGiveawayWinners(giveaway) {
    const entries = Array.isArray(giveaway.entries)
        ? [...new Set(giveaway.entries)]
        : [];

    // Randomly select distinct eligible entrants.
    for (let i = entries.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [entries[i], entries[j]] = [entries[j], entries[i]];
    }

    return entries.slice(
        0,
        Math.min(giveaway.winnerCount, entries.length)
    );
}

async function finishGiveaway(guild, giveaway, reroll = false) {
    const channel = guild.channels.cache.get(giveaway.channelId);

    if (!channel || !channel.isTextBased()) {
        return {
            ok: false,
            message: "The giveaway channel could not be found."
        };
    }

    const message = await channel.messages
        .fetch(giveaway.messageId)
        .catch(() => null);

    if (!message) {
        return {
            ok: false,
            message: "The giveaway message could not be found."
        };
    }

    if (giveaway.ended && !reroll) {
        return {
            ok: false,
            message: "This giveaway has already ended."
        };
    }

    if (reroll && !giveaway.ended) {
        return {
            ok: false,
            message: "End the giveaway before rerolling."
        };
    }

    if (reroll && !giveaway.winnerIds?.length) {
        // A reroll can still select from current entries.
        if (!giveaway.entries?.length) {
            return {
                ok: false,
                message: "There are no entries to select from."
            };
        }
    }

    const winners = drawGiveawayWinners(giveaway);

    giveaway.winnerIds = winners;
    giveaway.ended = true;
    giveaway.endedAt = Date.now();

    saveDatabase();

    await message.edit({
        embeds: [giveawayEmbed(giveaway, true)],
        components: giveawayRows(giveaway, true)
    }).catch(error => {
        console.error("[GIVEAWAY MESSAGE UPDATE]", error);
    });

    if (winners.length) {
        await channel.send({
            content:
                `⟡ Giveaway ${reroll ? "rerolled" : "ended"}: **${giveaway.prize}**\n` +
                `Winner(s): ${winners.map(id => `<@${id}>`).join(", ")}`,
            allowedMentions: {
                parse: [],
                users: winners
            }
        }).catch(error => {
            console.error("[GIVEAWAY ANNOUNCEMENT]", error);
        });
    } else {
        await channel.send({
            embeds: [
                makeEmbed(
                    "Giveaway Ended",
                    `**Prize:** ${giveaway.prize}\nNo one entered this giveaway.`
                )
            ]
        }).catch(() => {});
    }

    return {
        ok: true,
        message: winners.length
            ? `Selected ${winners.length} winner(s).`
            : "Giveaway ended without any entries."
    };
}

// CREATE, END, AND REROLL GIVEAWAYS
registerCommand({
    name: "giveaway",
    description: "Manage giveaways",
    category: "Giveaway",
    aliases: ["gw"],
    slash: false,
    execute: async (ctx) => {
        if (!ctx.guild || !ctx.channel) {
            return ctx.reply({
                embeds: [
                    makeEmbed(
                        "Server Only",
                        "Use this command inside a server."
                    )
                ]
            });
        }

        const action = (ctx.args[0] || "").toLowerCase();
        const giveaways = getGiveawayDatabase();

        if (action === "create" || action === "start") {
            if (!canManageSettings(ctx)) {
                return ctx.reply({
                    embeds: [
                        makeEmbed(
                            "Access Denied",
                            "You need permission to manage server settings."
                        )
                    ]
                });
            }

            const durationInput = ctx.args[1];
            const winnerCount = Number(ctx.args[2]);
            const prize = ctx.args.slice(3).join(" ").trim();
            const duration = parseGiveawayDuration(durationInput);

            if (!duration || !Number.isInteger(winnerCount) ||
                winnerCount < 1 || winnerCount > 20 || !prize) {
                return ctx.reply({
                    embeds: [
                        makeEmbed(
                            "Giveaway Usage",
                            "Use:\n" +
                            "`,giveaway create <duration> <winners> <prize>`\n\n" +
                            "**Examples:**\n" +
                            "`,giveaway create 10m 1 Nitro`\n" +
                            "`,giveaway create 2h 3 Custom Roles`\n\n" +
                            "Duration: `10s`, `10m`, `2h`, `1d`.\n" +
                            "Allowed duration: 10 seconds to 30 days.\n" +
                            "Winners: 1–20."
                        )
                    ]
                });
            }

            const botMember = ctx.guild.members.me;

            if (
                !botMember ||
                !ctx.channel.permissionsFor(botMember)?.has([
                    PermissionsBitField.Flags.ViewChannel,
                    PermissionsBitField.Flags.SendMessages,
                    PermissionsBitField.Flags.EmbedLinks,
                    PermissionsBitField.Flags.ReadMessageHistory
                ])
            ) {
                return ctx.reply({
                    embeds: [
                        makeEmbed(
                            "Missing Permissions",
                            "The bot needs View Channel, Send Messages, Embed Links, and Read Message History."
                        )
                    ]
                });
            }

            const id = `${ctx.guild.id}_${Date.now()}_${Math.random()
                .toString(36).slice(2, 8)}`;

            const giveaway = {
                id,
                guildId: ctx.guild.id,
                channelId: ctx.channel.id,
                messageId: null,
                hostId: ctx.user.id,
                prize,
                winnerCount,
                endsAt: Date.now() + duration,
                ended: false,
                endedAt: null,
                entries: [],
                winnerIds: []
            };

            try {
                const message = await ctx.channel.send({
                    embeds: [giveawayEmbed(giveaway)],
                    components: [giveawayRows(giveaway)[0]],
                    allowedMentions: {
                        parse: []
                    }
                });

                giveaway.messageId = message.id;
                giveaways[id] = giveaway;
                saveDatabase();

                return ctx.reply({
                    embeds: [
                        makeEmbed(
                            "Giveaway Created",
                            `**Prize:** ${prize}\n` +
                            `**Duration:** ${durationInput}\n` +
                            `**Winners:** ${winnerCount}\n` +
                            `**Message:** [Open giveaway](${message.url})`
                        )
                    ]
                });
            } catch (error) {
                console.error("[GIVEAWAY CREATE]", error);

                return ctx.reply({
                    embeds: [
                        makeEmbed(
                            "Creation Failed",
                            "Could not create the giveaway. Check the bot's channel permissions."
                        )
                    ]
                });
            }
        }

        if (action === "end" || action === "reroll") {
            if (!canManageSettings(ctx)) {
                return ctx.reply({
                    embeds: [
                        makeEmbed(
                            "Access Denied",
                            "You need permission to manage giveaways."
                        )
                    ]
                });
            }

            const idInput = ctx.args[1];

            if (!idInput) {
                return ctx.reply({
                    embeds: [
                        makeEmbed(
                            "Giveaway ID Required",
                            `Use \`,giveaway ${action} <giveaway-id>\`.`
                        )
                    ]
                });
            }

            const giveaway = giveaways[idInput];

            if (!giveaway || giveaway.guildId !== ctx.guild.id) {
                return ctx.reply({
                    embeds: [
                        makeEmbed(
                            "Giveaway Not Found",
                            "That giveaway ID is invalid for this server."
                        )
                    ]
                });
            }

            const result = await finishGiveaway(
                ctx.guild,
                giveaway,
                action === "reroll"
            );

            return ctx.reply({
                embeds: [
                    makeEmbed(
                        result.ok ? "Giveaway Updated" : "Action Failed",
                        result.message
                    )
                ]
            });
        }

        if (action === "list") {
            const active = Object.values(giveaways).filter(
                giveaway =>
                    giveaway.guildId === ctx.guild.id &&
                    !giveaway.ended
            );

            const description = active.length
                ? active.map(giveaway =>
                    `▪ **${giveaway.prize}**\n` +
                    `ID: \`${giveaway.id}\`\n` +
                    `Ends: <t:${Math.floor(giveaway.endsAt / 1000)}:R>`
                ).join("\n\n")
                : "There are no active giveaways.";

            return ctx.reply({
                embeds: [
                    makeEmbed("Active Giveaways", description)
                ]
            });
        }

        return ctx.reply({
            embeds: [
                makeEmbed(
                    "Giveaway Commands",
                    "`,giveaway create 10m 1 Nitro`\n" +
                    "`,giveaway list`\n" +
                    "`,giveaway end <id>`\n" +
                    "`,giveaway reroll <id>`"
                )
            ]
        });
    }
});

// ENTER GIVEAWAY BUTTON
client.on("interactionCreate", async interaction => {
    if (!interaction.isButton()) return;

    const prefix = "pyrr_giveaway_enter:";

    if (!interaction.customId.startsWith(prefix)) return;

    const id = interaction.customId.slice(prefix.length);
    const giveaways = getGiveawayDatabase();
    const giveaway = giveaways[id];

    if (
        !giveaway ||
        giveaway.guildId !== interaction.guildId ||
        giveaway.messageId !== interaction.message.id
    ) {
        return interaction.reply({
            content: "This giveaway could not be found.",
            ephemeral: true
        });
    }

    if (giveaway.ended || Date.now() >= giveaway.endsAt) {
        return interaction.reply({
            content: "This giveaway has ended.",
            ephemeral: true
        });
    }

    if (interaction.user.bot) {
        return interaction.reply({
            content: "Bots cannot enter giveaways.",
            ephemeral: true
        });
    }

    if (!Array.isArray(giveaway.entries)) {
        giveaway.entries = [];
    }

    if (giveaway.entries.includes(interaction.user.id)) {
        return interaction.reply({
            content: "You have already entered this giveaway.",
            ephemeral: true
        });
    }

    giveaway.entries.push(interaction.user.id);
    saveDatabase();

    return interaction.reply({
        content: `You entered the giveaway for **${giveaway.prize}**.`,
        ephemeral: true
    });
});

// AUTOMATIC GIVEAWAY END CHECK
setInterval(async () => {
    try {
        const giveaways = getGiveawayDatabase();
        const now = Date.now();

        for (const giveaway of Object.values(giveaways)) {
            if (
                giveaway.ended ||
                !giveaway.messageId ||
                giveaway.endsAt > now
            ) {
                continue;
            }

            const guild = client.guilds.cache.get(giveaway.guildId);

            if (!guild) continue;

            await finishGiveaway(guild, giveaway).catch(error => {
                console.error("[GIVEAWAY AUTO END]", error);
            });
        }
    } catch (error) {
        console.error("[GIVEAWAY TIMER]", error);
    }
}, 15000);

// PART 17 END — APPEND PART 18 BELOW// ==============================
// PART 18 — SUGGESTION SYSTEM
// ==============================

function getSuggestionConfig(guildId) {
    const cfg = getConfig(guildId);

    if (!cfg.suggestions) {
        cfg.suggestions = {
            enabled: false,
            channelId: null
        };
    }

    return cfg.suggestions;
}

function getSuggestionDatabase() {
    if (!database.suggestions || typeof database.suggestions !== "object") {
        database.suggestions = {};
    }

    return database.suggestions;
}

function createSuggestionEmbed(suggestion, status = "Pending") {
    const statusText = {
        Pending: "〢 Pending Review",
        Approved: "◈ Approved",
        Rejected: "〢 Rejected"
    };

    return makeEmbed(
        "PYRR OFFICIAL 〢 Suggestion",
        `**Suggestion ID:** \`${suggestion.id}\`\n` +
        `**Submitted by:** <@${suggestion.userId}>\n` +
        `**Status:** ${statusText[status] || status}\n\n` +
        `**Suggestion:**\n${suggestion.text}`
    );
}

function createSuggestionButtons(suggestionId, disabled = false) {
    return [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`pyrr_suggestion_approve:${suggestionId}`)
                .setLabel("Approve")
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(disabled),
            new ButtonBuilder()
                .setCustomId(`pyrr_suggestion_reject:${suggestionId}`)
                .setLabel("Reject")
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(disabled)
        )
    ];
}

// CONFIGURE THE SUGGESTION CHANNEL
registerCommand({
    name: "suggestionset",
    description: "Set the suggestion channel",
    category: "Suggestions",
    aliases: ["setsuggestions"],
    slash: false,
    execute: async (ctx) => {
        if (!ctx.guild) {
            return ctx.reply({
                embeds: [
                    makeEmbed(
                        "Server Only",
                        "Use this command inside a server."
                    )
                ]
            });
        }

        if (!canManageSettings(ctx)) {
            return ctx.reply({
                embeds: [
                    makeEmbed(
                        "Access Denied",
                        "You need permission to manage server settings."
                    )
                ]
            });
        }

        const channel = ctx.source.mentions?.channels?.first();

        if (
            !channel ||
            !channel.isTextBased() ||
            channel.guild?.id !== ctx.guild.id
        ) {
            return ctx.reply({
                embeds: [
                    makeEmbed(
                        "Invalid Channel",
                        "Mention a text channel from this server.\n\nExample: `,suggestionset #suggestions`"
                    )
                ]
            });
        }

        const config = getSuggestionConfig(ctx.guild.id);

        config.channelId = channel.id;
        config.enabled = true;

        saveDatabase();

        return ctx.reply({
            embeds: [
                makeEmbed(
                    "Suggestions Enabled",
                    `Suggestion channel: ${channel}\n\nMembers can now use \`,suggest <your suggestion>\`.`
                )
            ]
        });
    }
});

// ENABLE, DISABLE, OR CHECK SUGGESTIONS
registerCommand({
    name: "suggestionconfig",
    description: "Manage the suggestion system",
    category: "Suggestions",
    aliases: ["suggestionstatus"],
    slash: false,
    execute: async (ctx) => {
        if (!ctx.guild) {
            return ctx.reply({
                embeds: [
                    makeEmbed(
                        "Server Only",
                        "Use this command inside a server."
                    )
                ]
            });
        }

        if (!canManageSettings(ctx)) {
            return ctx.reply({
                embeds: [
                    makeEmbed(
                        "Access Denied",
                        "You need permission to manage server settings."
                    )
                ]
            });
        }

        const config = getSuggestionConfig(ctx.guild.id);
        const action = (ctx.args[0] || "status").toLowerCase();

        if (action === "enable") {
            if (!config.channelId) {
                return ctx.reply({
                    embeds: [
                        makeEmbed(
                            "Channel Required",
                            "Set the channel first using `,suggestionset #suggestions`."
                        )
                    ]
                });
            }

            config.enabled = true;
            saveDatabase();

            return ctx.reply({
                embeds: [
                    makeEmbed(
                        "Suggestions Enabled",
                        "Members can submit suggestions again."
                    )
                ]
            });
        }

        if (action === "disable") {
            config.enabled = false;
            saveDatabase();

            return ctx.reply({
                embeds: [
                    makeEmbed(
                        "Suggestions Disabled",
                        "New suggestions are disabled."
                    )
                ]
            });
        }

        if (action !== "status") {
            return ctx.reply({
                embeds: [
                    makeEmbed(
                        "Usage",
                        "Use `,suggestionconfig status`, `,suggestionconfig enable`, or `,suggestionconfig disable`."
                    )
                ]
            });
        }

        const channel = config.channelId
            ? ctx.guild.channels.cache.get(config.channelId)
            : null;

        return ctx.reply({
            embeds: [
                makeEmbed(
                    "Suggestion Configuration",
                    `**Status:** ${config.enabled ? "Enabled" : "Disabled"}\n` +
                    `**Channel:** ${channel || "Not configured"}`
                )
            ]
        });
    }
});

// SUBMIT A SUGGESTION
registerCommand({
    name: "suggest",
    description: "Submit a suggestion to the server",
    category: "Suggestions",
    aliases: ["suggestion"],
    slash: false,
    execute: async (ctx) => {
        if (!ctx.guild) {
            return ctx.reply({
                embeds: [
                    makeEmbed(
                        "Server Only",
                        "Use this command inside a server."
                    )
                ]
            });
        }

        const config = getSuggestionConfig(ctx.guild.id);

        if (!config.enabled || !config.channelId) {
            return ctx.reply({
                embeds: [
                    makeEmbed(
                        "Suggestions Unavailable",
                        "The suggestion system is currently disabled or not configured."
                    )
                ]
            });
        }

        const text = ctx.args.join(" ").trim();

        if (text.length < 10) {
            return ctx.reply({
                embeds: [
                    makeEmbed(
                        "Suggestion Too Short",
                        "Please write at least 10 characters.\n\nExample: `,suggest Add more community events.`"
                    )
                ]
            });
        }

        if (text.length > 1500) {
            return ctx.reply({
                embeds: [
                    makeEmbed(
                        "Suggestion Too Long",
                        "Please keep your suggestion under 1500 characters."
                    )
                ]
            });
        }

        const channel = ctx.guild.channels.cache.get(config.channelId);

        if (!channel || !channel.isTextBased()) {
            return ctx.reply({
                embeds: [
                    makeEmbed(
                        "Configuration Error",
                        "The configured suggestion channel could not be found."
                    )
                ]
            });
        }

        const id = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

        const suggestion = {
            id,
            guildId: ctx.guild.id,
            userId: ctx.user.id,
            text,
            channelId: channel.id,
            messageId: null,
            status: "Pending",
            createdAt: Date.now(),
            reviewedBy: null,
            reviewedAt: null
        };

        try {
            const message = await channel.send({
                embeds: [createSuggestionEmbed(suggestion)],
                components: createSuggestionButtons(id),
                allowedMentions: {
                    parse: []
                }
            });

            suggestion.messageId = message.id;
            getSuggestionDatabase()[id] = suggestion;
            saveDatabase();

            return ctx.reply({
                embeds: [
                    makeEmbed(
                        "Suggestion Submitted",
                        `Your suggestion has been sent for review.\n**Suggestion ID:** \`${id}\``
                    )
                ]
            });
        } catch (error) {
            console.error("[SUGGESTION SUBMIT]", error);

            return ctx.reply({
                embeds: [
                    makeEmbed(
                        "Submission Failed",
                        "I couldn't send your suggestion. Check the bot's permissions in the suggestion channel."
                    )
                ]
            });
        }
    }
});

// APPROVE OR REJECT SUGGESTIONS
client.on("interactionCreate", async interaction => {
    if (!interaction.isButton()) return;

    const approvePrefix = "pyrr_suggestion_approve:";
    const rejectPrefix = "pyrr_suggestion_reject:";

    const isApprove = interaction.customId.startsWith(approvePrefix);
    const isReject = interaction.customId.startsWith(rejectPrefix);

    if (!isApprove && !isReject) return;

    if (!interaction.guild) {
        return interaction.reply({
            content: "This action must be used inside a server.",
            ephemeral: true
        });
    }

    const prefix = isApprove ? approvePrefix : rejectPrefix;
    const id = interaction.customId.slice(prefix.length);
    const suggestion = getSuggestionDatabase()[id];

    if (!suggestion || suggestion.guildId !== interaction.guild.id) {
        return interaction.reply({
            content: "Suggestion not found.",
            ephemeral: true
        });
    }

    if (suggestion.status !== "Pending") {
        return interaction.reply({
            content: `This suggestion has already been ${suggestion.status.toLowerCase()}.`,
            ephemeral: true
        });
    }

    const member = interaction.member;
    const canReview =
        member.permissions?.has(PermissionsBitField.Flags.ManageMessages) ||
        member.permissions?.has(PermissionsBitField.Flags.ManageGuild);

    if (!canReview) {
        return interaction.reply({
            content: "You need Manage Messages or Manage Server permission to review suggestions.",
            ephemeral: true
        });
    }

    suggestion.status = isApprove ? "Approved" : "Rejected";
    suggestion.reviewedBy = interaction.user.id;
    suggestion.reviewedAt = Date.now();

    saveDatabase();

    try {
        await interaction.update({
            embeds: [createSuggestionEmbed(suggestion, suggestion.status)],
            components: createSuggestionButtons(id, true),
            allowedMentions: {
                parse: []
            }
        });
    } catch (error) {
        console.error("[SUGGESTION REVIEW]", error);

        return interaction.followUp({
            content: "The suggestion status was saved, but the message could not be updated.",
            ephemeral: true
        }).catch(() => {});
    }

    const submitter = await interaction.guild.members
        .fetch(suggestion.userId)
        .catch(() => null);

    if (submitter) {
        await submitter.send({
            embeds: [
                makeEmbed(
                    `Suggestion ${suggestion.status}`,
                    `Your suggestion in **${interaction.guild.name}** was ${suggestion.status.toLowerCase()}.\n\n` +
                    `**Suggestion ID:** \`${suggestion.id}\`\n` +
                    `**Suggestion:** ${suggestion.text}`
                )
            ]
        }).catch(() => {});
    }
});

// PART 18 END — APPEND PART 19 BELOW// ==============================
// PART 19 — POLL SYSTEM
// ==============================

function getPollDatabase() {
    if (!database.polls || typeof database.polls !== "object") {
        database.polls = {};
    }

    return database.polls;
}

function createPollEmbed(poll) {
    const totalVotes = Object.values(poll.votes || {}).length;

    const results = poll.options.map((option, index) => {
        const count = Object.values(poll.votes || {})
            .filter(value => value === index).length;

        const percentage = totalVotes
            ? Math.round((count / totalVotes) * 100)
            : 0;

        return `**${index + 1}. ${option}**\n` +
            `Votes: ${count} (${percentage}%)`;
    }).join("\n\n");

    return makeEmbed(
        poll.ended ? "Poll Closed" : "PYRR OFFICIAL 〢 Poll",
        `**${poll.question}**\n\n` +
        `${results}\n\n` +
        `**Total Votes:** ${totalVotes}\n` +
        `**Created by:** <@${poll.hostId}>\n` +
        `**Status:** ${poll.ended ? "Closed" : "Open"}`
    );
}

function createPollRows(poll, disabled = false) {
    const buttons = poll.options.map((option, index) =>
        new ButtonBuilder()
            .setCustomId(`pyrr_poll:${poll.id}:${index}`)
            .setLabel(`${index + 1}. ${option}`.slice(0, 80))
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(disabled)
    );

    const rows = [];

    for (let i = 0; i < buttons.length; i += 5) {
        rows.push(
            new ActionRowBuilder().addComponents(
                buttons.slice(i, i + 5)
            )
        );
    }

    return rows;
}

// CREATE AND MANAGE POLLS
registerCommand({
    name: "poll",
    description: "Create and manage server polls",
    category: "Utility",
    aliases: ["vote"],
    slash: false,
    execute: async (ctx) => {
        if (!ctx.guild || !ctx.channel) {
            return ctx.reply({
                embeds: [
                    makeEmbed(
                        "Server Only",
                        "Use this command inside a server."
                    )
                ]
            });
        }

        const action = (ctx.args[0] || "").toLowerCase();
        const polls = getPollDatabase();

        // CREATE A POLL
        if (action === "create") {
            if (!canManageSettings(ctx)) {
                return ctx.reply({
                    embeds: [
                        makeEmbed(
                            "Access Denied",
                            "You need permission to manage server settings."
                        )
                    ]
                });
            }

            const input = ctx.args.slice(1).join(" ");
            const parts = input.split("|").map(item => item.trim());

            const question = parts.shift();
            const options = parts.filter(Boolean);

            if (
                !question ||
                question.length < 3 ||
                question.length > 200 ||
                options.length < 2 ||
                options.length > 5 ||
                options.some(option => option.length > 70)
            ) {
                return ctx.reply({
                    embeds: [
                        makeEmbed(
                            "Poll Usage",
                            "Use `|` to separate the question and options.\n\n" +
                            "**Example:**\n" +
                            "`,poll create Best event? | Tournament | Movie Night | Q&A`\n\n" +
                            "Rules: 2–5 options, question up to 200 characters, each option up to 70 characters."
                        )
                    ]
                });
            }

            const botMember = ctx.guild.members.me;

            if (
                !botMember ||
                !ctx.channel.permissionsFor(botMember)?.has([
                    PermissionsBitField.Flags.ViewChannel,
                    PermissionsBitField.Flags.SendMessages,
                    PermissionsBitField.Flags.EmbedLinks
                ])
            ) {
                return ctx.reply({
                    embeds: [
                        makeEmbed(
                            "Missing Permissions",
                            "The bot needs View Channel, Send Messages, and Embed Links."
                        )
                    ]
                });
            }

            const id = `${Date.now()}_${Math.random()
                .toString(36).slice(2, 7)}`;

            const poll = {
                id,
                guildId: ctx.guild.id,
                channelId: ctx.channel.id,
                messageId: null,
                hostId: ctx.user.id,
                question,
                options,
                votes: {},
                ended: false,
                createdAt: Date.now()
            };

            try {
                const message = await ctx.channel.send({
                    embeds: [createPollEmbed(poll)],
                    components: createPollRows(poll),
                    allowedMentions: {
                        parse: []
                    }
                });

                poll.messageId = message.id;
                polls[id] = poll;
                saveDatabase();

                return ctx.reply({
                    embeds: [
                        makeEmbed(
                            "Poll Created",
                            `Your poll is live.\n\n` +
                            `**Poll ID:** \`${id}\`\n` +
                            `[Jump to poll](${message.url})`
                        )
                    ]
                });
            } catch (error) {
                console.error("[POLL CREATE]", error);

                return ctx.reply({
                    embeds: [
                        makeEmbed(
                            "Poll Failed",
                            "Could not create the poll. Check the bot's channel permissions."
                        )
                    ]
                });
            }
        }

        // CLOSE A POLL
        if (action === "end" || action === "close") {
            if (!canManageSettings(ctx)) {
                return ctx.reply({
                    embeds: [
                        makeEmbed(
                            "Access Denied",
                            "You need permission to close polls."
                        )
                    ]
                });
            }

            const id = ctx.args[1];
            const poll = id ? polls[id] : null;

            if (!poll || poll.guildId !== ctx.guild.id) {
                return ctx.reply({
                    embeds: [
                        makeEmbed(
                            "Poll Not Found",
                            "Provide a valid poll ID from this server."
                        )
                    ]
                });
            }

            if (poll.ended) {
                return ctx.reply({
                    embeds: [
                        makeEmbed(
                            "Already Closed",
                            "This poll has already ended."
                        )
                    ]
                });
            }

            poll.ended = true;
            poll.endedAt = Date.now();
            saveDatabase();

            const channel = ctx.guild.channels.cache.get(
                poll.channelId
            );

            const message = channel?.isTextBased()
                ? await channel.messages.fetch(poll.messageId).catch(() => null)
                : null;

            if (message) {
                await message.edit({
                    embeds: [createPollEmbed(poll)],
                    components: createPollRows(poll, true)
                }).catch(error => {
                    console.error("[POLL CLOSE UPDATE]", error);
                });
            }

            return ctx.reply({
                embeds: [
                    makeEmbed(
                        "Poll Closed",
                        `Poll \`${id}\` has been closed.`
                    )
                ]
            });
        }

        // VIEW POLL RESULTS
        if (action === "results") {
            const id = ctx.args[1];
            const poll = id ? polls[id] : null;

            if (!poll || poll.guildId !== ctx.guild.id) {
                return ctx.reply({
                    embeds: [
                        makeEmbed(
                            "Poll Not Found",
                            "Provide a valid poll ID from this server."
                        )
                    ]
                });
            }

            return ctx.reply({
                embeds: [createPollEmbed(poll)]
            });
        }

        return ctx.reply({
            embeds: [
                makeEmbed(
                    "Poll Commands",
                    "`,poll create Question? | Option A | Option B`\n" +
                    "`,poll results <poll-id>`\n" +
                    "`,poll end <poll-id>`\n\n" +
                    "Poll creation and closing require server-management permission."
                )
            ]
        });
    }
});

// POLL VOTING BUTTON HANDLER
client.on("interactionCreate", async interaction => {
    if (!interaction.isButton()) return;

    const prefix = "pyrr_poll:";

    if (!interaction.customId.startsWith(prefix)) return;

    const parts = interaction.customId.split(":");
    const pollId = parts[1];
    const optionIndex = Number(parts[2]);

    const poll = getPollDatabase()[pollId];

    if (
        !poll ||
        poll.guildId !== interaction.guildId ||
        poll.messageId !== interaction.message.id
    ) {
        return interaction.reply({
            content: "This poll could not be found.",
            ephemeral: true
        });
    }

    if (poll.ended) {
        return interaction.reply({
            content: "This poll is closed.",
            ephemeral: true
        });
    }

    if (
        !Number.isInteger(optionIndex) ||
        optionIndex < 0 ||
        optionIndex >= poll.options.length
    ) {
        return interaction.reply({
            content: "That poll option is invalid.",
            ephemeral: true
        });
    }

    if (!poll.votes || typeof poll.votes !== "object") {
        poll.votes = {};
    }

    const previousVote = poll.votes[interaction.user.id];

    poll.votes[interaction.user.id] = optionIndex;
    saveDatabase();

    try {
        await interaction.update({
            embeds: [createPollEmbed(poll)],
            components: createPollRows(poll)
        });
    } catch (error) {
        console.error("[POLL VOTE UPDATE]", error);

        return interaction.followUp({
            content: "Your vote was saved, but the poll display could not be updated.",
            ephemeral: true
        }).catch(() => {});
    }

    // Let the voter know their vote was counted.
    await interaction.followUp({
        content: previousVote === undefined
            ? `Your vote for **${poll.options[optionIndex]}** was counted.`
            : `Your vote has been changed to **${poll.options[optionIndex]}**.`,
        ephemeral: true
    }).catch(() => {});
});

// PART 19 END — APPEND PART 20 BELOW// ============================================
// PART 20/20 — FINAL INTEGRATION & STARTUP
// PYRR OFFICIAL | Creator: _upyr
// ============================================

// PREFIX COMMAND HANDLER
client.on("messageCreate", async message => {
    try {
        if (!message.guild || message.author.bot) return;

        const prefix = getPrefix(message.guild.id);
        if (!message.content.startsWith(prefix)) return;

        const content = message.content
            .slice(prefix.length)
            .trim();

        if (!content) return;

        const args = content.split(/\s+/);
        const commandName = args.shift().toLowerCase();

        let command = commands.get(commandName);

        if (!command) {
            command = [...commands.values()].find(cmd =>
                cmd.name === commandName ||
                (Array.isArray(cmd.aliases) &&
                    cmd.aliases.includes(commandName))
            );
        }

        if (!command) return;

        const ctx = makeContext(message, false);
        ctx.args = args;

        await runCommand(command, ctx, args);
    } catch (error) {
        console.error("[PREFIX COMMAND ERROR]", error);
    }
});

// SLASH COMMAND HANDLER
client.on("interactionCreate", async interaction => {
    try {
        if (!interaction.isChatInputCommand()) return;

        let command = commands.get(interaction.commandName);

        if (!command) {
            command = [...commands.values()].find(cmd =>
                cmd.name === interaction.commandName
            );
        }

        if (!command) {
            const response = {
                content:
                    "⟡ This command is unavailable. Please try again later.",
                ephemeral: true
            };

            if (interaction.replied || interaction.deferred) {
                await interaction.followUp(response);
            } else {
                await interaction.reply(response);
            }

            return;
        }

        const ctx = makeContext(interaction, true);
        await runCommand(command, ctx, []);
    } catch (error) {
        console.error("[SLASH COMMAND ERROR]", error);

        if (
            interaction.isRepliable() &&
            !interaction.replied &&
            !interaction.deferred
        ) {
            await interaction.reply({
                content: "〢 Something went wrong while running that command.",
                ephemeral: true
            }).catch(() => {});
        }
    }
});

// REGISTER SLASH COMMANDS
async function registerPyrrSlashCommands() {
    if (!client.user) {
        throw new Error("Bot client is not ready.");
    }

    const applicationId = CLIENT_ID || client.user.id;

    const payload = slashCommands
        .filter(command =>
            command &&
            typeof command.toJSON === "function"
        )
        .map(command => command.toJSON());

    if (payload.length > 100) {
        console.warn(
            `[PYRR] ${payload.length} slash commands found. ` +
            "Discord permits a maximum of 100 global application commands. " +
            "Only the first 100 will be registered."
        );
    }

    const safePayload = payload.slice(0, 100);

    const rest = new REST({ version: "10" })
        .setToken(TOKEN);

    await rest.put(
        Routes.applicationCommands(applicationId),
        { body: safePayload }
    );

    console.log(
        `[PYRR] Registered ${safePayload.length} slash commands.`
    );

    if (payload.length > 100) {
        console.warn(
            "[PYRR] Some slash commands were not registered. " +
            "The prefix commands may still be available."
        );
    }
}

// BOT READY EVENT
client.once("ready", async () => {
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("⟡ PYRR OFFICIAL");
    console.log("〢 Creator: _upyr");
    console.log(`◈ Logged in as: ${client.user.tag}`);
    console.log(`⌬ Servers: ${client.guilds.cache.size}`);
    console.log(`⌘ Prefix: ${DEFAULT_PREFIX}`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    client.user.setPresence({
        activities: [
            {
                name: "PYRR OFFICIAL 〢 ,help",
                type: ActivityType.Watching
            }
        ],
        status: "online"
    });

    try {
        await registerPyrrSlashCommands();
        console.log("[PYRR] Startup completed.");
    } catch (error) {
        console.error(
            "[PYRR] Slash command registration failed:",
            error
        );
        console.error(
            "Check CLIENT_ID, DISCORD_TOKEN, and the slash command definitions."
        );
    }
});

// ERROR HANDLING
client.on("error", error => {
    console.error("[PYRR CLIENT ERROR]", error);
});

process.on("unhandledRejection", error => {
    console.error("[PYRR UNHANDLED REJECTION]", error);
});

// LOGIN
if (!TOKEN) {
    console.error(
        "[PYRR] Missing DISCORD_TOKEN environment variable."
    );
} else {
    client.login(TOKEN).catch(error => {
        console.error("[PYRR LOGIN FAILED]", error);
    });
}

// ============================================
// END OF PYRR OFFICIAL — PART 20/20
// ============================================
