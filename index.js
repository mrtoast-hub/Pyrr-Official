
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

// ============================================
// PYRR OFFICIAL — CORE CONFIGURATION
// ============================================

const BOT_NAME = "PYRR OFFICIAL";
const CREATOR = "_upyr";
const DEFAULT_PREFIX = ",";
const SUPPORT_SERVER = "https://discord.gg/TwDBvBmVdM";

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

const OWNER_IDS = [
    "1551635950432428162"
];

const SYMBOL = {
    success: "✓",
    error: "✕",
    info: "◆",
    arrow: "›",
    loading: "◌"
};

const COLORS = {
    primary: 0x181818,
    secondary: 0x292929,
    success: 0x57F287,
    danger: 0xED4245,
    warning: 0xFEE75C,
    info: 0x5865F2
};

// ============================================
// DISCORD CLIENT
// ============================================

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildModeration,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildInvites,
        GatewayIntentBits.GuildVoiceStates
    ],
    partials: [
        Partials.User,
        Partials.GuildMember,
        Partials.Message,
        Partials.Channel
    ]
});

// ============================================
// EMBED HELPERS
// ============================================

function makeEmbed(title, description = "", color = COLORS.primary) {
    const embed = new EmbedBuilder()
        .setColor(color)
        .setTimestamp();

    if (title) embed.setTitle(String(title).slice(0, 256));
    if (description) {
        embed.setDescription(String(description).slice(0, 4000));
    }

    return embed;
}

function successEmbed(title, description = "") {
    return makeEmbed(
        `${SYMBOL.success} ${title}`,
        description,
        COLORS.success
    );
}

function errorEmbed(title, description = "") {
    return makeEmbed(
        `${SYMBOL.error} ${title}`,
        description,
        COLORS.danger
    );
}

function infoEmbed(title, description = "") {
    return makeEmbed(
        `${SYMBOL.info} ${title}`,
        description,
        COLORS.info
    );
}

function permissionEmbed(description = "You cannot use this command.") {
    return makeEmbed(
        `${SYMBOL.error} Permission Denied`,
        description,
        COLORS.danger
    );
}

// ============================================
// JSON DATABASE
// ============================================

const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "pyrr-data.json");
const TEMP_FILE = path.join(DATA_DIR, "pyrr-data.tmp");

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

function createDefaultDatabase() {
    return {
        guilds: {},
        users: {},
        premium: {},
        giveaways: {},
        suggestions: {},
        polls: {},
        partnerships: {}
    };
}

let database;

try {
    if (fs.existsSync(DATA_FILE)) {
        database = JSON.parse(
            fs.readFileSync(DATA_FILE, "utf8")
        );
    } else {
        database = createDefaultDatabase();
    }
} catch (error) {
    console.error("[PYRR] Database could not be loaded:", error);
    database = createDefaultDatabase();
}

database.guilds ||= {};
database.users ||= {};
database.premium ||= {};
database.giveaways ||= {};
database.suggestions ||= {};
database.polls ||= {};
database.partnerships ||= {};

let saveQueue = Promise.resolve();

function saveDatabase() {
    saveQueue = saveQueue
        .catch(() => {})
        .then(async () => {
            const json = JSON.stringify(database, null, 2);

            await fs.promises.writeFile(
                TEMP_FILE,
                json,
                "utf8"
            );

            await fs.promises.rename(
                TEMP_FILE,
                DATA_FILE
            );
        })
        .catch(error => {
            console.error("[PYRR] Database save failed:", error);
        });

    return saveQueue;
}

// ============================================
// DEFAULT GUILD CONFIGURATION
// ============================================

function defaultGuildConfig() {
    return {
        prefix: DEFAULT_PREFIX,

        antinuke: {
            enabled: false,
            action: "strip",
            thresholds: {}
        },

        antiraid: {
            enabled: false,
            threshold: 8,
            windowMs: 15000
        },

        automod: {
            enabled: false,
            antiSpam: false,
            linkFilter: false,
            inviteFilter: false,
            badWordFilter: false,
            badWords: [],
            logChannelId: null
        },

        welcome: {
            enabled: false,
            channelId: null,
            message: "Welcome {user} to **{server}**!"
        },

        leave: {
            enabled: false,
            channelId: null,
            message: "**{user}** has left {server}."
        },

        autorole: {
            enabled: false,
            roleId: null
        },

        verification: {
            enabled: false,
            channelId: null,
            verifiedRoleId: null
        },

        tickets: {
            enabled: false,
            categoryId: null,
            logChannelId: null,
            supportRoleId: null
        },

        logs: {
            channelId: null
        },

        serverLogs: {
            channelId: null
        },

        leveling: {
            enabled: false,
            channelId: null,
            users: {}
        },

        suggestions: {
            enabled: false,
            channelId: null
        },

        partnership: {
            enabled: false,
            channelId: null
        },

        utility: {
            autoReact: [],
            autoRespond: [],
            afkUsers: {}
        },

        disabledCommands: [],
        jail: {
            enabled: false,
            roleId: null
        }
    };
}

function getConfig(guildId) {
    if (!guildId) return defaultGuildConfig();

    database.guilds[guildId] ||= defaultGuildConfig();

    const current = database.guilds[guildId];
    const defaults = defaultGuildConfig();

    for (const [key, value] of Object.entries(defaults)) {
        if (current[key] === undefined || current[key] === null) {
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

// ============================================
// COMMAND REGISTRY
// ============================================

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
        name: name.toLowerCase(),
        description,
        category,
        aliases: aliases.map(alias => alias.toLowerCase()),
        options,
        slash,
        execute
    };

    commands.set(command.name, command);

    for (const alias of command.aliases) {
        commands.set(alias, command);
    }

    if (slash) {
        const builder = new SlashCommandBuilder()
            .setName(command.name)
            .setDescription(
                String(description || "No description").slice(0, 100)
            );

        for (const option of options) {
            const applyOption = item => {
                item
                    .setName(option.name)
                    .setDescription(
                        String(option.description || option.name).slice(0, 100)
                    )
                    .setRequired(Boolean(option.required));

                if (option.choices) {
                    item.addChoices(...option.choices);
                }

                if (option.minValue !== undefined) {
                    item.setMinValue(option.minValue);
                }

                if (option.maxValue !== undefined) {
                    item.setMaxValue(option.maxValue);
                }

                if (option.minLength !== undefined) {
                    item.setMinLength(option.minLength);
                }

                if (option.maxLength !== undefined) {
                    item.setMaxLength(option.maxLength);
                }

                return item;
            };

            switch (option.type) {
                case "user":
                    builder.addUserOption(applyOption);
                    break;

                case "integer":
                    builder.addIntegerOption(applyOption);
                    break;

                case "number":
                    builder.addNumberOption(applyOption);
                    break;

                case "boolean":
                    builder.addBooleanOption(applyOption);
                    break;

                case "channel":
                    builder.addChannel(applyOption);
                    break;

                case "role":
                    builder.addRoleOption(applyOption);
                    break;

                case "mentionable":
                    builder.addMentionableOption(applyOption);
                    break;

                case "attachment":
                    builder.addAttachmentOption(applyOption);
                    break;

                default:
                    builder.addStringOption(applyOption);
                    break;
            }
        }

        slashCommands.push(builder);
    }

    return command;
}

// ============================================
// COMMAND CONTEXT
// ============================================

function makeContext(source, isInteraction) {
    const guild = source.guild;
    const member = source.member;
    const user = source.user || source.author;

    const ctx = {
        source,
        isInteraction,
        guild,
        member,
        user,
        channel: source.channel,
        args: source.__pyrrArgs || [],

        getString(name) {
            return source.options?.getString(name) ?? null;
        },

        getInteger(name) {
            return source.options?.getInteger(name) ?? null;
        },

        getNumber(name) {
            return source.options?.getNumber(name) ?? null;
        },

        getBoolean(name) {
            return source.options?.getBoolean(name) ?? null;
        },

        getUser(name) {
            return source.options?.getUser(name) ?? null;
        },

        getMember(name) {
            return source.options?.getMember(name) ?? null;
        },

        getChannel(name) {
            return source.options?.getChannel(name) ?? null;
        },

        getRole(name) {
            return source.options?.getRole(name) ?? null;
        },

        getMentionedMember() {
            if (isInteraction) {
                return source.options?.getMember("user") ||
                    source.options?.getMember("member") ||
                    null;
            }

            return source.mentions?.members?.first() || null;
        },

        getMentionedRole() {
            if (isInteraction) {
                return source.options?.getRole("role") || null;
            }

            return source.mentions?.roles?.first() || null;
        },

        getMentionedChannel() {
            if (isInteraction) {
                return source.options?.getChannel("channel") || null;
            }

            return source.mentions?.channels?.first() || null;
        },

        async reply(payload) {
            if (isInteraction) {
                if (source.deferred) {
                    return source.editReply(payload);
                }

                if (source.replied) {
                    return source.followUp(payload);
                }

                return source.reply(payload);
            }

            return source.reply(payload);
        },

        async send(payload) {
            return source.channel.send(payload);
        },

        async embed(title, description, color = COLORS.primary) {
            return this.reply({
                embeds: [makeEmbed(title, description, color)]
            });
        }
    };

    return ctx;
}

// ============================================
// PERMISSION HELPERS
// ============================================

function isOwner(userId) {
    return OWNER_IDS.includes(String(userId));
}

function hasPermission(member, permission) {
    if (!member?.permissions) return false;

    return member.permissions.has(
        PermissionsBitField.Flags[permission]
    );
}

function canManageSettings(ctx) {
    if (!ctx.guild || !ctx.user) return false;

    if (isOwner(ctx.user.id)) return true;

    if (ctx.guild.ownerId === ctx.user.id) return true;

    return hasPermission(ctx.member, "Administrator");
}

function requireGuild(ctx) {
    if (ctx.guild) return true;

    ctx.reply({
        embeds: [
            errorEmbed(
                "Server Only",
                "This command can only be used inside a server."
            )
        ]
    }).catch(() => {});

    return false;
}

async function requireModerator(ctx) {
    if (!requireGuild(ctx)) return false;

    if (canManageSettings(ctx)) return true;

    if (hasPermission(ctx.member, "ManageMessages")) {
        return true;
    }

    await ctx.reply({
        embeds: [
            permissionEmbed(
                "You need Manage Messages or Administrator permission."
            )
        ]
    });

    return false;
}

// ============================================
// COMMAND EXECUTION
// ============================================

async function runCommand(command, ctx) {
    if (!command || typeof command.execute !== "function") {
        return;
    }

    try {
        if (ctx.guild) {
            const config = getConfig(ctx.guild.id);

            if (
                config.disabledCommands?.includes(command.name) &&
                !canManageSettings(ctx)
            ) {
                return ctx.reply({
                    embeds: [
                        errorEmbed(
                            "Command Disabled",
                            "This command is disabled in this server."
                        )
                    ]
                });
            }
        }

        await command.execute(ctx);
    } catch (error) {
        console.error(
            `[PYRR] Command "${command.name}" failed:`,
            error
        );

        const payload = {
            embeds: [
                errorEmbed(
                    "Command Error",
                    "Something went wrong while running this command."
                )
            ]
        };

        try {
            if (
                ctx.isInteraction &&
                ctx.source.deferred &&
                !ctx.source.replied
            ) {
                await ctx.source.editReply(payload);
            } else if (
                ctx.isInteraction &&
                !ctx.source.replied
            ) {
                await ctx.source.reply({
                    ...payload,
                    ephemeral: true
                });
            } else if (ctx.isInteraction) {
                await ctx.source.followUp({
                    ...payload,
                    ephemeral: true
                });
            } else {
                await ctx.source.reply(payload);
            }
        } catch (replyError) {
            console.error("[PYRR] Could not send error reply:", replyError);
        }
    }
}

// ============================================
// END OF PART 1/20
// Append Part 2 below this line.
// ============================================

 // ============================================
 // PART 2/20 — HELP & INFORMATION
 // ============================================

// ----- Unique command list -----

function getUniqueCommands() {
    const seen = new Set();
    const result = [];

    for (const command of commands.values()) {
        if (seen.has(command.name)) continue;

        seen.add(command.name);
        result.push(command);
    }

    return result;
}

function getCommandCategories() {
    const unique = getUniqueCommands();
    return [...new Set(unique.map(command => command.category))].sort();
}

function createHelpEmbed(category = "All") {
    const unique = getUniqueCommands();

    const filtered = category === "All"
        ? unique
        : unique.filter(command =>
            command.category.toLowerCase() === category.toLowerCase()
        );

    const grouped = {};

    for (const command of filtered) {
        grouped[command.category] ||= [];
        grouped[command.category].push(command);
    }

    const embed = makeEmbed(
        "PYRR OFFICIAL — Command Center",
        [
            "A complete collection of available commands.",
            "",
            `**Prefix:** \`${DEFAULT_PREFIX}\``,
            "**Slash commands:** Use `/`",
            `**Requested category:** ${category}`
        ].join("\n"),
        COLORS.primary
    );

    for (const [name, items] of Object.entries(grouped)) {
        const lines = items
            .sort((a, b) => a.name.localeCompare(b.name))
            .map(command =>
                `\`${command.name}\` — ${command.description}`
            );

        embed.addFields({
            name: `${name} (${items.length})`,
            value: lines.join("\n").slice(0, 1024)
        });
    }

    if (filtered.length === 0) {
        embed.setDescription(
            `No commands found for category **${category}**.`
        );
    }

    embed.setFooter({
        text: `${BOT_NAME} • Created by ${CREATOR}`
    });

    return embed;
}

function createHelpRows() {
    const categories = ["All", ...getCommandCategories()]
        .slice(0, 25);

    const menu = new StringSelectMenuBuilder()
        .setCustomId("pyrr_help_category")
        .setPlaceholder("Choose a command category")
        .addOptions(
            categories.map(category => ({
                label: category,
                value: category,
                description: `View ${category} commands`
            }))
        );

    return [
        new ActionRowBuilder().addComponents(menu)
    ];
}

// ----- Help command -----

registerCommand({
    name: "help",
    description: "View the PYRR command list.",
    category: "Information",
    aliases: ["commands", "cmds"],
    options: [
        {
            type: "string",
            name: "category",
            description: "Choose a command category",
            required: false,
            choices: [
                { name: "All", value: "All" },
                { name: "Information", value: "Information" },
                { name: "Moderation", value: "Moderation" },
                { name: "Utility", value: "Utility" },
                { name: "Security", value: "Security" },
                { name: "Leveling", value: "Leveling" },
                { name: "Tickets", value: "Tickets" }
            ]
        }
    ],
    execute: async ctx => {
        const category = ctx.isInteraction
            ? ctx.getString("category") || "All"
            : ctx.args[0] || "All";

        const embed = createHelpEmbed(category);

        if (ctx.isInteraction) {
            return ctx.reply({
                embeds: [embed],
                components: createHelpRows()
            });
        }

        return ctx.reply({
            embeds: [embed],
            components: createHelpRows()
        });
    }
});

// ----- Help category selector -----

client.on("interactionCreate", async interaction => {
    try {
        if (!interaction.isStringSelectMenu()) return;

        if (interaction.customId !== "pyrr_help_category") return;

        const category = interaction.values[0];

        await interaction.update({
            embeds: [createHelpEmbed(category)],
            components: createHelpRows()
        });
    } catch (error) {
        console.error("[PYRR Help Menu]", error);

        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
                embeds: [
                    errorEmbed(
                        "Menu Error",
                        "Unable to update the help menu."
                    )
                ],
                ephemeral: true
            }).catch(() => {});
        }
    }
});

// ----- Ping command -----

registerCommand({
    name: "ping",
    description: "Check bot latency.",
    category: "Information",
    aliases: ["latency"],
    execute: async ctx => {
        const roundTrip = Date.now() -
            (ctx.source.createdTimestamp || Date.now());

        const websocket = client.ws.ping;

        return ctx.reply({
            embeds: [
                makeEmbed(
                    "PYRR Latency",
                    [
                        `**WebSocket:** ${websocket}ms`,
                        `**Response time:** ${roundTrip}ms`,
                        `**Status:** Online`
                    ].join("\n"),
                    COLORS.primary
                )
            ]
        });
    }
});

// ----- Bot information -----

registerCommand({
    name: "botinfo",
    description: "View information about PYRR OFFICIAL.",
    category: "Information",
    aliases: ["aboutbot"],
    execute: async ctx => {
        const uptime = client.uptime || 0;

        const days = Math.floor(uptime / 86400000);
        const hours = Math.floor((uptime % 86400000) / 3600000);
        const minutes = Math.floor((uptime % 3600000) / 60000);
        const seconds = Math.floor((uptime % 60000) / 1000);

        const embed = makeEmbed(
            "PYRR OFFICIAL",
            [
                "**Bot Overview**",
                `**Creator:** ${CREATOR}`,
                `**Servers:** ${client.guilds.cache.size}`,
                `**Users cached:** ${client.users.cache.size}`,
                `**Commands registered:** ${getUniqueCommands().length}`,
                `**Uptime:** ${days}d ${hours}h ${minutes}m ${seconds}s`,
                "",
                `[Support Server](${SUPPORT_SERVER})`
            ].join("\n"),
            COLORS.primary
        );

        embed.setThumbnail(client.user.displayAvatarURL());

        return ctx.reply({ embeds: [embed] });
    }
});

// ----- Server information -----

registerCommand({
    name: "serverinfo",
    description: "View information about this server.",
    category: "Information",
    aliases: ["guildinfo"],
    execute: async ctx => {
        if (!requireGuild(ctx)) return;

        const guild = ctx.guild;
        const owner = await guild.fetchOwner().catch(() => null);

        const embed = makeEmbed(
            guild.name,
            [
                `**Owner:** ${owner || "Unknown"}`,
                `**Server ID:** \`${guild.id}\``,
                `**Members:** ${guild.memberCount}`,
                `**Text channels:** ${guild.channels.cache.filter(c => c.type === ChannelType.GuildText).size}`,
                `**Voice channels:** ${guild.channels.cache.filter(c => c.type === ChannelType.GuildVoice).size}`,
                `**Roles:** ${guild.roles.cache.size}`,
                `**Created:** <t:${Math.floor(guild.createdTimestamp / 1000)}:D>`
            ].join("\n"),
            COLORS.primary
        );

        if (guild.iconURL()) {
            embed.setThumbnail(guild.iconURL({ size: 256 }));
        }

        return ctx.reply({ embeds: [embed] });
    }
});

// ----- User information -----

registerCommand({
    name: "userinfo",
    description: "View information about a user.",
    category: "Information",
    options: [
        {
            type: "user",
            name: "user",
            description: "User to inspect",
            required: false
        }
    ],
    execute: async ctx => {
        const user = ctx.isInteraction
            ? ctx.getUser("user") || ctx.user
            : ctx.source.mentions?.users?.first() || ctx.user;

        const member = ctx.guild
            ? await ctx.guild.members.fetch(user.id).catch(() => null)
            : null;

        const embed = makeEmbed(
            "User Information",
            [
                `**Username:** ${user.username}`,
                `**User ID:** \`${user.id}\``,
                `**Bot account:** ${user.bot ? "Yes" : "No"}`,
                `**Account created:** <t:${Math.floor(user.createdTimestamp / 1000)}:D>`,
                member
                    ? `**Joined server:** <t:${Math.floor(member.joinedTimestamp / 1000)}:D>`
                    : ""
            ].filter(Boolean).join("\n"),
            COLORS.primary
        );

        embed.setThumbnail(user.displayAvatarURL({ size: 256 }));

        return ctx.reply({ embeds: [embed] });
    }
});

// ----- Avatar command -----

registerCommand({
    name: "avatar",
    description: "Display a user's avatar.",
    category: "Information",
    options: [
        {
            type: "user",
            name: "user",
            description: "User whose avatar to show",
            required: false
        }
    ],
    execute: async ctx => {
        const user = ctx.isInteraction
            ? ctx.getUser("user") || ctx.user
            : ctx.source.mentions?.users?.first() || ctx.user;

        const avatar = user.displayAvatarURL({
            size: 1024,
            extension: "png"
        });

        return ctx.reply({
            embeds: [
                makeEmbed(
                    `${user.username}'s Avatar`,
                    `[Open full-size image](${avatar})`,
                    COLORS.primary
                ).setImage(avatar)
            ]
        });
    }
});

// ----- Prefix settings -----

registerCommand({
    name: "prefix",
    description: "View this server's prefix.",
    category: "Utility",
    execute: async ctx => {
        const prefix = ctx.guild
            ? getConfig(ctx.guild.id).prefix || DEFAULT_PREFIX
            : DEFAULT_PREFIX;

        return ctx.reply({
            embeds: [
                infoEmbed(
                    "Current Prefix",
                    `The prefix is \`${prefix}\`.\nYou can also use slash commands.`
                )
            ]
        });
    }
});

registerCommand({
    name: "setprefix",
    description: "Change this server's prefix.",
    category: "Utility",
    slash: false,
    execute: async ctx => {
        if (!requireGuild(ctx)) return;

        if (!canManageSettings(ctx)) {
            return ctx.reply({
                embeds: [
                    permissionEmbed("Administrator permission required.")
                ]
            });
        }

        const prefix = ctx.args[0];

        if (!prefix || prefix.length > 5 || /\s/.test(prefix)) {
            return ctx.reply({
                embeds: [
                    errorEmbed(
                        "Invalid Prefix",
                        "Choose a prefix of 1–5 characters without spaces."
                    )
                ]
            });
        }

        getConfig(ctx.guild.id).prefix = prefix;
        saveDatabase();

        return ctx.reply({
            embeds: [
                successEmbed(
                    "Prefix Updated",
                    `The new prefix is \`${prefix}\`.`
                )
            ]
        });
    }
});

// ----- Sticky message command -----

const pyrrStickyMessages = new Map();

registerCommand({
    name: "stick",
    description: "Create a sticky message in this channel.",
    category: "Utility",
    options: [
        {
            type: "string",
            name: "message",
            description: "Message to keep at the bottom",
            required: true,
            maxLength: 1800
        }
    ],
    execute: async ctx => {
        if (!requireGuild(ctx)) return;

        if (
            !canManageSettings(ctx) &&
            !hasPermission(ctx.member, "ManageMessages")
        ) {
            return ctx.reply({
                embeds: [
                    permissionEmbed("Manage Messages permission required.")
                ]
            });
        }

        const text = ctx.isInteraction
            ? ctx.getString("message")
            : ctx.args.join(" ");

        if (!text) {
            return ctx.reply({
                embeds: [
                    errorEmbed(
                        "Missing Message",
                        "Provide the text you want to stick."
                    )
                ]
            });
        }

        const previous = pyrrStickyMessages.get(ctx.channel.id);

        if (previous?.messageId) {
            const oldMessage = await ctx.channel.messages
                .fetch(previous.messageId)
                .catch(() => null);

            if (oldMessage) {
                await oldMessage.delete().catch(() => {});
            }
        }

        const sticky = await ctx.channel.send({
            embeds: [
                makeEmbed(
                    "📌 Sticky Message",
                    text,
                    COLORS.primary
                ).setFooter({ text: `Set by ${ctx.user.username}` })
            ]
        });

        pyrrStickyMessages.set(ctx.channel.id, {
            messageId: sticky.id,
            text,
            ownerId: ctx.user.id
        });

        return ctx.reply({
            embeds: [
                successEmbed(
                    "Sticky Created",
                    `Your sticky message is active in ${ctx.channel}.`
                )
            ]
        });
    }
});

// ----- Sticky message updater -----

client.on("messageCreate", async message => {
    try {
        if (!message.guild || message.author.bot) return;

        const sticky = pyrrStickyMessages.get(message.channel.id);
        if (!sticky) return;

        if (message.id === sticky.messageId) return;

        const previous = await message.channel.messages
            .fetch(sticky.messageId)
            .catch(() => null);

        if (previous) {
            await previous.delete().catch(() => {});
        }

        const nextSticky = await message.channel.send({
            embeds: [
                makeEmbed(
                    "📌 Sticky Message",
                    sticky.text,
                    COLORS.primary
                ).setFooter({ text: "PYRR OFFICIAL • Sticky" })
            ]
        });

        sticky.messageId = nextSticky.id;
        pyrrStickyMessages.set(message.channel.id, sticky);
    } catch (error) {
        console.error("[PYRR Sticky]", error);
    }
});

// ============================================
// END OF PART 2/20
// Append Part 3 below this line.
// ============================================

// ============================================
// PART 3/20 — MODERATION SYSTEM
// ============================================

function parseDuration(input) {
    if (!input) return null;

    const match = String(input)
        .trim()
        .toLowerCase()
        .match(/^(\d+)(s|m|h|d)$/);

    if (!match) return null;

    const amount = Number(match[1]);
    const unit = match[2];

    const multipliers = {
        s: 1000,
        m: 60000,
        h: 3600000,
        d: 86400000
    };

    const duration = amount * multipliers[unit];

    if (!Number.isFinite(duration) || duration <= 0) return null;

    return duration;
}

function formatDuration(ms) {
    if (!Number.isFinite(ms) || ms <= 0) return "Unknown";

    const units = [
        ["day", 86400000],
        ["hour", 3600000],
        ["minute", 60000],
        ["second", 1000]
    ];

    for (const [name, size] of units) {
        if (ms >= size) {
            const amount = Math.floor(ms / size);
            return `${amount} ${name}${amount === 1 ? "" : "s"}`;
        }
    }

    return `${ms}ms`;
}

function getReason(ctx, startIndex = 1) {
    if (ctx.isInteraction) {
        return ctx.getString("reason") || "No reason provided";
    }

    return ctx.args.slice(startIndex).join(" ") ||
        "No reason provided";
}

async function resolveMember(ctx, optionName = "user") {
    if (!ctx.guild) return null;

    if (ctx.isInteraction) {
        const selected = ctx.getMember(optionName);

        if (selected) return selected;

        const user = ctx.getUser(optionName);

        if (user) {
            return ctx.guild.members.fetch(user.id).catch(() => null);
        }

        return null;
    }

    const mentioned = ctx.source.mentions?.members?.first();

    if (mentioned) return mentioned;

    const raw = ctx.args[0]?.replace(/[<@!>]/g, "");

    if (!raw) return null;

    return ctx.guild.members.fetch(raw).catch(() => null);
}

function canModerateTarget(ctx, target) {
    if (!target || !ctx.member || !ctx.guild) return false;

    if (target.id === ctx.user.id) return false;
    if (target.id === ctx.guild.ownerId) return false;
    if (target.id === client.user?.id) return false;

    if (isOwner(ctx.user.id)) return true;

    if (ctx.user.id === ctx.guild.ownerId) return true;

    return ctx.member.roles.highest.position >
        target.roles.highest.position;
}

async function requireBotPermission(ctx, permission) {
    if (!ctx.guild) return false;

    const botMember = ctx.guild.members.me;

    if (
        botMember &&
        botMember.permissions.has(PermissionsBitField.Flags[permission])
    ) {
        return true;
    }

    await ctx.reply({
        embeds: [
            errorEmbed(
                "Missing Bot Permission",
                `I need the **${permission}** permission to do that.`
            )
        ]
    });

    return false;
}

async function sendLog(guild, embed) {
    if (!guild || !embed) return;

    const config = getConfig(guild.id);

    const channelId =
        config.serverLogs?.channelId ||
        config.logs?.channelId ||
        config.antinuke?.logChannelId ||
        config.automod?.logChannelId;

    if (!channelId) return;

    const channel = guild.channels.cache.get(channelId);

    if (!channel?.isTextBased()) return;

    await channel.send({
        embeds: [embed]
    }).catch(error => {
        console.error("[PYRR Logs]", error);
    });
}

async function moderationResult(ctx, action, target, reason) {
    const embed = successEmbed(
        `${action} Successful`,
        [
            `**Target:** ${target.user.tag}`,
            `**Moderator:** ${ctx.user.tag}`,
            `**Reason:** ${reason}`
        ].join("\n")
    );

    await ctx.reply({ embeds: [embed] });

    await sendLog(
        ctx.guild,
        makeEmbed(
            `Moderation: ${action}`,
            [
                `**Target:** ${target.user.tag} (\`${target.id}\`)`,
                `**Moderator:** ${ctx.user.tag}`,
                `**Reason:** ${reason}`
            ].join("\n"),
            COLORS.secondary
        )
    );
}

async function checkModerationPermission(ctx, permission) {
    if (!requireGuild(ctx)) return false;

    if (
        canManageSettings(ctx) ||
        hasPermission(ctx.member, permission)
    ) {
        return true;
    }

    await ctx.reply({
        embeds: [
            permissionEmbed(
                `You need the **${permission}** permission.`
            )
        ]
    });

    return false;
}

// ----- WARN -----

registerCommand({
    name: "warn",
    description: "Warn a server member.",
    category: "Moderation",
    options: [
        {
            type: "user",
            name: "user",
            description: "Member to warn",
            required: true
        },
        {
            type: "string",
            name: "reason",
            description: "Reason for the warning",
            required: false
        }
    ],
    execute: async ctx => {
        if (!await checkModerationPermission(ctx, "ModerateMembers")) {
            return;
        }

        const target = await resolveMember(ctx);

        if (!target) {
            return ctx.reply({
                embeds: [
                    errorEmbed("Member Not Found", "Mention a valid server member.")
                ]
            });
        }

        if (!canModerateTarget(ctx, target)) {
            return ctx.reply({
                embeds: [
                    errorEmbed(
                        "Invalid Target",
                        "You cannot warn this member because of role hierarchy."
                    )
                ]
            });
        }

        const reason = getReason(ctx, 1);
        const config = getConfig(ctx.guild.id);

        config.warnings ||= {};
        config.warnings[target.id] ||= [];

        config.warnings[target.id].push({
            moderatorId: ctx.user.id,
            reason,
            timestamp: Date.now()
        });

        saveDatabase();

        await target.send({
            embeds: [
                errorEmbed(
                    `Warning from ${ctx.guild.name}`,
                    `**Reason:** ${reason}`
                )
            ]
        }).catch(() => {});

        await moderationResult(ctx, "Warn", target, reason);
    }
});

// ----- WARNINGS LIST -----

registerCommand({
    name: "warnings",
    description: "View a member's warnings.",
    category: "Moderation",
    options: [
        {
            type: "user",
            name: "user",
            description: "Member to check",
            required: true
        }
    ],
    execute: async ctx => {
        if (!await checkModerationPermission(ctx, "ModerateMembers")) {
            return;
        }

        const target = await resolveMember(ctx);
        if (!target) {
            return ctx.reply({
                embeds: [
                    errorEmbed("Member Not Found", "Choose a valid member.")
                ]
            });
        }

        const config = getConfig(ctx.guild.id);
        const warnings = config.warnings?.[target.id] || [];

        const description = warnings.length
            ? warnings.slice(-15).map((warning, index) =>
                `**${index + 1}.** ${warning.reason}\n` +
                `Moderator: <@${warning.moderatorId}> • ` +
                `<t:${Math.floor(warning.timestamp / 1000)}:R>`
            ).join("\n\n")
            : "This member has no recorded warnings.";

        return ctx.reply({
            embeds: [
                makeEmbed(
                    `Warnings — ${target.user.tag}`,
                    description,
                    COLORS.primary
                )
            ]
        });
    }
});

// ----- CLEAR WARNINGS -----

registerCommand({
    name: "clearwarnings",
    description: "Clear a member's warning history.",
    category: "Moderation",
    options: [
        {
            type: "user",
            name: "user",
            description: "Member whose warnings will be cleared",
            required: true
        }
    ],
    execute: async ctx => {
        if (!await checkModerationPermission(ctx, "ModerateMembers")) {
            return;
        }

        const target = await resolveMember(ctx);
        if (!target) {
            return ctx.reply({
                embeds: [
                    errorEmbed("Member Not Found", "Choose a valid member.")
                ]
            });
        }

        const config = getConfig(ctx.guild.id);
        const oldCount = config.warnings?.[target.id]?.length || 0;

        if (config.warnings) {
            delete config.warnings[target.id];
        }

        saveDatabase();

        return ctx.reply({
            embeds: [
                successEmbed(
                    "Warnings Cleared",
                    `Cleared **${oldCount}** warning(s) for ${target.user.tag}.`
                )
            ]
        });
    }
});

// ----- BAN -----

registerCommand({
    name: "ban",
    description: "Ban a member from the server.",
    category: "Moderation",
    options: [
        {
            type: "user",
            name: "user",
            description: "Member to ban",
            required: true
        },
        {
            type: "string",
            name: "reason",
            description: "Reason for the ban",
            required: false
        }
    ],
    execute: async ctx => {
        if (!await checkModerationPermission(ctx, "BanMembers")) {
            return;
        }

        if (!await requireBotPermission(ctx, "BanMembers")) return;

        const target = await resolveMember(ctx);

        if (!target) {
            return ctx.reply({
                embeds: [
                    errorEmbed("Member Not Found", "Choose a valid member.")
                ]
            });
        }

        if (!canModerateTarget(ctx, target) || !target.bannable) {
            return ctx.reply({
                embeds: [
                    errorEmbed(
                        "Cannot Ban",
                        "Check the member's role hierarchy and my Ban Members permission."
                    )
                ]
            });
        }

        const reason = getReason(ctx, 1);

        await target.send({
            embeds: [
                errorEmbed(
                    `Banned from ${ctx.guild.name}`,
                    `**Reason:** ${reason}`
                )
            ]
        }).catch(() => {});

        await target.ban({
            reason: `${ctx.user.tag}: ${reason}`
        });

        await moderationResult(ctx, "Ban", target, reason);
    }
});

// ----- KICK -----

registerCommand({
    name: "kick",
    description: "Kick a member from the server.",
    category: "Moderation",
    options: [
        {
            type: "user",
            name: "user",
            description: "Member to kick",
            required: true
        },
        {
            type: "string",
            name: "reason",
            description: "Reason for the kick",
            required: false
        }
    ],
    execute: async ctx => {
        if (!await checkModerationPermission(ctx, "KickMembers")) {
            return;
        }

        if (!await requireBotPermission(ctx, "KickMembers")) return;

        const target = await resolveMember(ctx);

        if (!target) {
            return ctx.reply({
                embeds: [
                    errorEmbed("Member Not Found", "Choose a valid member.")
                ]
            });
        }

        if (!canModerateTarget(ctx, target) || !target.kickable) {
            return ctx.reply({
                embeds: [
                    errorEmbed(
                        "Cannot Kick",
                        "Check the member's role hierarchy and my Kick Members permission."
                    )
                ]
            });
        }

        const reason = getReason(ctx, 1);

        await target.send({
            embeds: [
                errorEmbed(
                    `Kicked from ${ctx.guild.name}`,
                    `**Reason:** ${reason}`
                )
            ]
        }).catch(() => {});

        await target.kick(`${ctx.user.tag}: ${reason}`);

        await moderationResult(ctx, "Kick", target, reason);
    }
});

// ----- TIMEOUT -----

registerCommand({
    name: "timeout",
    description: "Temporarily timeout a member.",
    category: "Moderation",
    options: [
        {
            type: "user",
            name: "user",
            description: "Member to timeout",
            required: true
        },
        {
            type: "string",
            name: "duration",
            description: "Example: 10m, 2h, 1d",
            required: true
        },
        {
            type: "string",
            name: "reason",
            description: "Reason for timeout",
            required: false
        }
    ],
    execute: async ctx => {
        if (!await checkModerationPermission(ctx, "ModerateMembers")) {
            return;
        }

        if (!await requireBotPermission(ctx, "ModerateMembers")) return;

        const target = await resolveMember(ctx);
        const durationInput = ctx.isInteraction
            ? ctx.getString("duration")
            : ctx.args[1];

        const duration = parseDuration(durationInput);

        if (!target) {
            return ctx.reply({
                embeds: [
                    errorEmbed("Member Not Found", "Choose a valid member.")
                ]
            });
        }

        if (!duration || duration > 28 * 86400000) {
            return ctx.reply({
                embeds: [
                    errorEmbed(
                        "Invalid Duration",
                        "Use `10m`, `2h`, or `1d`. Maximum: 28 days."
                    )
                ]
            });
        }

        if (!canModerateTarget(ctx, target) || !target.moderatable) {
            return ctx.reply({
                embeds: [
                    errorEmbed("Cannot Timeout", "Check role hierarchy and bot permissions.")
                ]
            });
        }

        const reason = ctx.isInteraction
            ? ctx.getString("reason") || "No reason provided"
            : ctx.args.slice(2).join(" ") || "No reason provided";

        await target.timeout(
            duration,
            `${ctx.user.tag}: ${reason}`
        );

        await ctx.reply({
            embeds: [
                successEmbed(
                    "Timeout Applied",
                    [
                        `**Member:** ${target.user.tag}`,
                        `**Duration:** ${formatDuration(duration)}`,
                        `**Reason:** ${reason}`
                    ].join("\n")
                )
            ]
        });

        await sendLog(
            ctx.guild,
            makeEmbed(
                "Moderation: Timeout",
                `**Member:** ${target.user.tag}\n` +
                `**Moderator:** ${ctx.user.tag}\n` +
                `**Duration:** ${formatDuration(duration)}\n` +
                `**Reason:** ${reason}`,
                COLORS.warning
            )
        );
    }
});

// ----- REMOVE TIMEOUT -----

registerCommand({
    name: "untimeout",
    description: "Remove a member's timeout.",
    category: "Moderation",
    options: [
        {
            type: "user",
            name: "user",
            description: "Member to untimeout",
            required: true
        }
    ],
    execute: async ctx => {
        if (!await checkModerationPermission(ctx, "ModerateMembers")) {
            return;
        }

        if (!await requireBotPermission(ctx, "ModerateMembers")) return;

        const target = await resolveMember(ctx);

        if (!target) {
            return ctx.reply({
                embeds: [
                    errorEmbed("Member Not Found", "Choose a valid member.")
                ]
            });
        }

        if (!canModerateTarget(ctx, target) || !target.moderatable) {
            return ctx.reply({
                embeds: [
                    errorEmbed("Cannot Remove Timeout", "Check role hierarchy.")
                ]
            });
        }

        await target.timeout(null, `Timeout removed by ${ctx.user.tag}`);

        return ctx.reply({
            embeds: [
                successEmbed(
                    "Timeout Removed",
                    `${target.user.tag} can now send messages normally.`
                )
            ]
        });
    }
});

// ----- PURGE -----

registerCommand({
    name: "purge",
    description: "Delete recent messages in this channel.",
    category: "Moderation",
    options: [
        {
            type: "integer",
            name: "amount",
            description: "Number of messages to delete (1–100)",
            required: true,
            minValue: 1,
            maxValue: 100
        }
    ],
    execute: async ctx => {
        if (!await checkModerationPermission(ctx, "ManageMessages")) {
            return;
        }

        if (!await requireBotPermission(ctx, "ManageMessages")) return;

        const amount = ctx.isInteraction
            ? ctx.getInteger("amount")
            : Number(ctx.args[0]);

        if (!Number.isInteger(amount) || amount < 1 || amount > 100) {
            return ctx.reply({
                embeds: [
                    errorEmbed("Invalid Amount", "Choose a number from 1 to 100.")
                ]
            });
        }

        if (!ctx.channel?.bulkDelete) {
            return ctx.reply({
                embeds: [
                    errorEmbed("Unsupported Channel", "This channel cannot bulk-delete messages.")
                ]
            });
        }

        if (ctx.isInteraction) {
            await ctx.source.deferReply({ ephemeral: true });
        }

        const deleted = await ctx.channel.bulkDelete(amount, true);

        const result = {
            embeds: [
                successEmbed(
                    "Purge Complete",
                    `Deleted **${deleted.size}** recent message(s).`
                )
            ]
        };

        if (ctx.isInteraction) {
            return ctx.source.editReply(result);
        }

        return ctx.channel.send(result);
    }
});

// ----- LOCK CHANNEL -----

registerCommand({
    name: "lock",
    description: "Lock the current text channel.",
    category: "Moderation",
    execute: async ctx => {
        if (!await checkModerationPermission(ctx, "ManageChannels")) {
            return;
        }

        if (!await requireBotPermission(ctx, "ManageChannels")) return;

        if (!ctx.channel?.permissionOverwrites) {
            return ctx.reply({
                embeds: [
                    errorEmbed("Unsupported Channel", "This channel cannot be locked.")
                ]
            });
        }

        await ctx.channel.permissionOverwrites.edit(
            ctx.guild.roles.everyone,
            { SendMessages: false }
        );

        return ctx.reply({
            embeds: [
                successEmbed(
                    "Channel Locked",
                    `${ctx.channel} has been locked.`
                )
            ]
        });
    }
});

// ----- UNLOCK CHANNEL -----

registerCommand({
    name: "unlock",
    description: "Unlock the current text channel.",
    category: "Moderation",
    execute: async ctx => {
        if (!await checkModerationPermission(ctx, "ManageChannels")) {
            return;
        }

        if (!await requireBotPermission(ctx, "ManageChannels")) return;

        if (!ctx.channel?.permissionOverwrites) {
            return ctx.reply({
                embeds: [
                    errorEmbed("Unsupported Channel", "This channel cannot be unlocked.")
                ]
            });
        }

        await ctx.channel.permissionOverwrites.edit(
            ctx.guild.roles.everyone,
            { SendMessages: nu
ll
        }
    );

    return ctx.reply({
        embeds: [
            successEmbed(
                "Channel Locked",
                `🔒 ${ctx.channel} has been locked.`
            )
        ]
    });
});

registerCommand({
    name: "unlock",
    description: "Unlock the current channel",
    category: "Moderation",
    execute: async (ctx) => {
        if (!requireGuild(ctx)) return;
        if (!requireModerator(ctx, "ManageChannels")) return;
        if (!requireBotPermission(ctx, "ManageChannels")) return;

        await ctx.channel.permissionOverwrites.edit(
            ctx.guild.roles.everyone,
            { SendMessages: null }
        );

        return ctx.reply({
            embeds: [
                successEmbed(
                    "Channel Unlocked",
                    `🔓 ${ctx.channel} has been unlocked.`
                )
            ]
        });
    }
});

registerCommand({
    name: "slowmode",
    description: "Set the channel slowmode",
    category: "Moderation",
    options: [
        {
            name: "seconds",
            description: "Slowmode seconds (0-21600)",
            type: "integer",
            required: true,
            min: 0,
            max: 21600
        }
    ],
    execute: async (ctx) => {
        if (!requireGuild(ctx)) return;
        if (!requireModerator(ctx, "ManageChannels")) return;
        if (!requireBotPermission(ctx, "ManageChannels")) return;

        const seconds = ctx.isInteraction
            ? ctx.getInteger("seconds")
            : Number(ctx.args[0]);

        if (
            !Number.isInteger(seconds) ||
            seconds < 0 ||
            seconds > 21600
        ) {
            return ctx.reply({
                embeds: [
                    errorEmbed(
                        "Invalid Slowmode",
                        "Use a number from 0 to 21600 seconds."
                    )
                ]
            });
        }

        await ctx.channel.setRateLimitPerUser(
            seconds,
            `Slowmode changed by ${ctx.user.tag}`
        );

        return ctx.reply({
            embeds: [
                successEmbed(
                    "Slowmode Updated",
                    seconds === 0
                        ? "Slowmode has been disabled."
                        : `Slowmode is now **${seconds} seconds**.`
                )
            ]
        });
    }
});

registerCommand({
    name: "role",
    description: "Add or remove a role from a member",
    category: "Moderation",
    options: [
        {
            name: "action",
            description: "Choose add or remove",
            type: "string",
            required: true,
            choices: [
                { name: "Add", value: "add" },
                { name: "Remove", value: "remove" }
            ]
        },
        {
            name: "user",
            description: "Member to edit",
            type: "user",
            required: true
        },
        {
            name: "role",
            description: "Role to add or remove",
            type: "role",
            required: true
        }
    ],
    execute: async (ctx) => {
        if (!requireGuild(ctx)) return;
        if (!requireModerator(ctx, "ManageRoles")) return;
        if (!requireBotPermission(ctx, "ManageRoles")) return;

        let action;
        let member;
        let role;

        if (ctx.isInteraction) {
            action = ctx.getString("action");
            member = ctx.getMember("user");
            role = ctx.getRole("role");
        } else {
            action = (ctx.args[0] || "").toLowerCase();

            const userId = ctx.args[1]
                ? ctx.args[1].replace(/[<@!>]/g, "")
                : null;

            const roleId = ctx.args[2]
                ? ctx.args[2].replace(/[<@&>]/g, "")
                : null;

            if (userId) {
                member = await ctx.guild.members
                    .fetch(userId)
                    .catch(() => null);
            }

            if (roleId) {
                role = await ctx.guild.roles
                    .fetch(roleId)
                    .catch(() => null);
            }
        }

        if (!["add", "remove"].includes(action)) {
            return ctx.reply({
                embeds: [
                    errorEmbed(
                        "Usage",
                        "Use `,role add @user @role` or `,role remove @user @role`."
                    )
                ]
            });
        }

        if (!member || !role) {
            return ctx.reply({
                embeds: [
                    errorEmbed(
                        "Missing Target",
                        "Please provide a valid member and role."
                    )
                ]
            });
        }

        if (!canModerateTarget(ctx, member)) return;

        if (
            role.managed ||
            role.position >= ctx.guild.members.me.roles.highest.position
        ) {
            return ctx.reply({
                embeds: [
                    errorEmbed(
                        "Role Hierarchy",
                        "I cannot manage that role because of its position or settings."
                    )
                ]
            });
        }

        if (
            role.position >= ctx.member.roles.highest.position &&
            ctx.guild.ownerId !== ctx.user.id
        ) {
            return ctx.reply({
                embeds: [
                    errorEmbed(
                        "Role Hierarchy",
                        "You cannot manage a role equal to or higher than your highest role."
                    )
                ]
            });
        }

        if (action === "add") {
            await member.roles.add(role);
        } else {
            await member.roles.remove(role);
        }

        return ctx.reply({
            embeds: [
                successEmbed(
                    "Role Updated",
                    `${action === "add" ? "Added" : "Removed"} ${role} ${
                        action === "add" ? "to" : "from"
                    } ${member}.`
                )
            ]
        });
    }
});

// Append Part 4 below this line.

/* =========================================
   PART 4/20 — SECURITY CONFIGURATION
========================================= */

function getSecurityConfig(guildId) {
    const config = getConfig(guildId);

    config.antinuke ||= {
        enabled: false,
        punishment: "strip",
        trustedUsers: [],
        limit: 3,
        interval: 10000
    };

    config.antiraid ||= {
        enabled: false,
        accountAgeDays: 7,
        joinLimit: 8,
        interval: 10000,
        action: "kick"
    };

    config.securityLogs ||= {
        enabled: false,
        channelId: null
    };

    config.trustedUsers ||= [];

    return config;
}

function isTrustedSecurityUser(guild, userId) {
    const config = getSecurityConfig(guild.id);

    if (OWNER_IDS.includes(userId)) return true;
    if (guild.ownerId === userId) return true;

    return config.trustedUsers.includes(userId) ||
        config.antinuke.trustedUsers.includes(userId);
}

async function sendSecurityLog(guild, title, description) {
    try {
        const config = getSecurityConfig(guild.id);
        const channelId = config.securityLogs.channelId;

        if (!config.securityLogs.enabled || !channelId) return;

        const channel = await guild.channels
            .fetch(channelId)
            .catch(() => null);

        if (!channel || !channel.isTextBased()) return;

        const embed = makeEmbed(title, description, COLORS.orange);
        embed.setTimestamp();

        await channel.send({ embeds: [embed] });
    } catch (error) {
        console.error("Security log error:", error.message);
    }
}

function parseOnOff(value) {
    const input = String(value || "").toLowerCase();

    if (["on", "enable", "enabled", "true"].includes(input)) {
        return true;
    }

    if (["off", "disable", "disabled", "false"].includes(input)) {
        return false;
    }

    return null;
}

registerCommand({
    name: "antinuke",
    description: "Configure antinuke protection",
    category: "Security",
    options: [
        {
            name: "action",
            description: "Choose a configuration action",
            type: "string",
            required: true,
            choices: [
                { name: "Enable", value: "enable" },
                { name: "Disable", value: "disable" },
                { name: "Status", value: "status" }
            ]
        }
    ],
    execute: async (ctx) => {
        if (!requireGuild(ctx)) return;

        if (!canManageSettings(ctx)) {
            return ctx.reply({
                embeds: [
                    permissionEmbed(
                        "Only the server owner or an authorized administrator can configure this."
                    )
                ]
            });
        }

        const action = ctx.isInteraction
            ? ctx.getString("action")
            : (ctx.args[0] || "status").toLowerCase();

        const config = getSecurityConfig(ctx.guild.id);

        if (action === "enable") {
            config.antinuke.enabled = true;
            await saveDatabase();

            await sendSecurityLog(
                ctx.guild,
                "Antinuke Enabled",
                `Antinuke was enabled by ${ctx.user.tag}.`
            );

            return ctx.reply({
                embeds: [
                    successEmbed(
                        "Antinuke Enabled",
                        "Antinuke configuration is enabled. Detection actions will only work when implemented and properly configured."
                    )
                ]
            });
        }

        if (action === "disable") {
            config.antinuke.enabled = false;
            await saveDatabase();

            return ctx.reply({
                embeds: [
                    successEmbed(
                        "Antinuke Disabled",
                        "Antinuke configuration has been disabled."
                    )
                ]
            });
        }

        if (action !== "status") {
            return ctx.reply({
                embeds: [
                    errorEmbed(
                        "Invalid Action",
                        "Use `,antinuke enable`, `,antinuke disable`, or `,antinuke status`."
                    )
                ]
            });
        }

        return ctx.reply({
            embeds: [
                makeEmbed(
                    "Antinuke Status",
                    [
                        `**Enabled:** ${config.antinuke.enabled ? "Yes" : "No"}`,
                        `**Trusted users:** ${config.antinuke.trustedUsers.length}`,
                        `**Action limit:** ${config.antinuke.limit}`,
                        `**Interval:** ${config.antinuke.interval / 1000}s`,
                        "",
                        "Status shows the saved configuration; it does not guarantee that every destructive action is automatically detected."
                    ].join("\n"),
                    COLORS.orange
                )
            ]
        });
    }
});

registerCommand({
    name: "antiraid",
    description: "Configure antiraid protection",
    category: "Security",
    options: [
        {
            name: "action",
            description: "Choose a configuration action",
            type: "string",
            required: true,
            choices: [
                { name: "Enable", value: "enable" },
                { name: "Disable", value: "disable" },
                { name: "Status", value: "status" }
            ]
        }
    ],
    execute: async (ctx) => {
        if (!requireGuild(ctx)) return;

        if (!canManageSettings(ctx)) {
            return ctx.reply({
                embeds: [
                    permissionEmbed(
                        "Only the server owner or an authorized administrator can configure this."
                    )
                ]
            });
        }

        const action = ctx.isInteraction
            ? ctx.getString("action")
            : (ctx.args[0] || "status").toLowerCase();

        const config = getSecurityConfig(ctx.guild.id);

        if (action === "enable") {
            config.antiraid.enabled = true;
            await saveDatabase();

            return ctx.reply({
                embeds: [
                    successEmbed(
                        "Antiraid Enabled",
                        "Antiraid settings are enabled. Join detection is added separately."
                    )
                ]
            });
        }

        if (action === "disable") {
            config.antiraid.enabled = false;
            await saveDatabase();

            return ctx.reply({
                embeds: [
                    successEmbed(
                        "Antiraid Disabled",
                        "Antiraid configuration has been disabled."
                    )
                ]
            });
        }

        if (action !== "status") {
            return ctx.reply({
                embeds: [
                    errorEmbed(
                        "Invalid Action",
                        "Use `,antiraid enable`, `,antiraid disable`, or `,antiraid status`."
                    )
                ]
            });
        }

        return ctx.reply({
            embeds: [
                makeEmbed(
                    "Antiraid Status",
                    [
                        `**Enabled:** ${config.antiraid.enabled ? "Yes" : "No"}`,
                        `**Minimum account age:** ${config.antiraid.accountAgeDays} days`,
                        `**Join limit:** ${config.antiraid.joinLimit}`,
                        `**Interval:** ${config.antiraid.interval / 1000}s`,
                        `**Configured action:** ${config.antiraid.action}`
                    ].join("\n"),
                    COLORS.orange
                )
            ]
        });
    }
});

registerCommand({
    name: "securitylog",
    description: "Set the security log channel",
    category: "Security",
    options: [
        {
            name: "channel",
            description: "Channel for security logs",
            type: "channel",
            required: true
        }
    ],
    execute: async (ctx) => {
        if (!requireGuild(ctx)) return;

        if (!canManageSettings(ctx)) {
            return ctx.reply({
                embeds: [
                    permissionEmbed(
                        "Only the server owner or an authorized administrator can configure security logs."
                    )
                ]
            });
        }

        const channel = ctx.isInteraction
            ? ctx.getChannel("channel")
            : ctx.channel;

        if (!channel || !channel.isTextBased()) {
            return ctx.reply({
                embeds: [
                    errorEmbed(
                        "Invalid Channel",
                        "Please select a text channel."
                    )
                ]
            });
        }

        const config = getSecurityConfig(ctx.guild.id);

        config.securityLogs.enabled = true;
        config.securityLogs.channelId = channel.id;

        await saveDatabase();

        return ctx.reply({
            embeds: [
                successEmbed(
                    "Security Logs Configured",
                    `Security log channel set to ${channel}.`
                )
            ]
        });
    }
});

registerCommand({
    name: "trust",
    description: "Add a trusted user to security settings",
    category: "Security",
    options: [
        {
            name: "user",
            description: "User to trust",
            type: "user",
            required: true
        }
    ],
    execute: async (ctx) => {
        if (!requireGuild(ctx)) return;

        if (
            ctx.guild.ownerId !== ctx.user.id &&
            !OWNER_IDS.includes(ctx.user.id)
        ) {
            return ctx.reply({
                embeds: [
                    permissionEmbed(
                        "Only the server owner can add trusted users."
                    )
                ]
            });
        }

        const user = ctx.isInteraction
            ? ctx.getUser("user")
            : await ctx.client.users.fetch(
                (ctx.args[0] || "").replace(/[<@!>]/g, "")
            ).catch(() => null);

        if (!user) {
            return ctx.reply({
                embeds: [
                    errorEmbed(
                        "User Not Found",
                        "Mention a valid user or provide their ID."
                    )
                ]
            });
        }

        if (user.id === ctx.guild.ownerId) {
            return ctx.reply({
                embeds: [
                    infoEmbed(
                        "Already Trusted",
                        "The server owner is already trusted."
                    )
                ]
            });
        }

        const config = getSecurityConfig(ctx.guild.id);

        if (!config.trustedUsers.includes(user.id)) {
            config.trustedUsers.push(user.id);
        }

        if (!config.antinuke.trustedUsers.includes(user.id)) {
            config.antinuke.trustedUsers.push(user.id);
        }

        await saveDatabase();

        return ctx.reply({
            embeds: [
                successEmbed(
                    "Trusted User Added",
                    `${user.tag} is now on the trusted-user list.`
                )
            ]
        });
    }
});

registerCommand({
    name: "untrust",
    description: "Remove a trusted user",
    category: "Security",
    options: [
        {
            name: "user",
            description: "User to remove from trusted users",
            type: "user",
            required: true
        }
    ],
    execute: async (ctx) => {
        if (!requireGuild(ctx)) return;

        if (
            ctx.guild.ownerId !== ctx.user.id &&
            !OWNER_IDS.includes(ctx.user.id)
        ) {
            return ctx.reply({
                embeds: [
                    permissionEmbed(
                        "Only the server owner can remove trusted users."
                    )
                ]
            });
        }

        const user = ctx.isInteraction
            ? ctx.getUser("user")
            : await ctx.client.users.fetch(
                (ctx.args[0] || "").replace(/[<@!>]/g, "")
            ).catch(() => null);

        if (!user) {
            return ctx.reply({
                embeds: [
                    errorEmbed(
                        "User Not Found",
                        "Mention a valid user or provide their ID."
                    )
                ]
            });
        }

        const config = getSecurityConfig(ctx.guild.id);

        config.trustedUsers = config.trustedUsers.filter(
            (id) => id !== user.id
        );

        config.antinuke.trustedUsers =
            config.antinuke.trustedUsers.filter(
                (id) => id !== user.id
            );

        await saveDatabase();

        return ctx.reply({
            embeds: [
                successEmbed(
                    "Trusted User Removed",
                    `${user.tag} has been removed from the trusted-user list.`
                )
            ]
        });
    }
});

// Append Part 5 below this line.

/* =========================================
   PART 5/20 — ANTIRAID DETECTION
========================================= */

const pyrrJoinTracker = new Map();

function getJoinTracker(guildId) {
    if (!pyrrJoinTracker.has(guildId)) {
        pyrrJoinTracker.set(guildId, []);
    }

    return pyrrJoinTracker.get(guildId);
}

function cleanJoinTracker(guildId, interval) {
    const now = Date.now();
    const tracker = getJoinTracker(guildId);

    const recent = tracker.filter(
        (timestamp) => now - timestamp <= interval
    );

    pyrrJoinTracker.set(guildId, recent);

    return recent;
}

async function handleAntiraidJoin(member) {
    if (!member.guild) return;

    const guild = member.guild;
    const config = getSecurityConfig(guild.id);

    if (!config.antiraid.enabled) return;

    const settings = config.antiraid;
    const now = Date.now();

    const tracker = getJoinTracker(guild.id);
    tracker.push(now);

    cleanJoinTracker(guild.id, settings.interval);

    const recentJoins = getJoinTracker(guild.id);
    const accountAge =
        now - member.user.createdTimestamp;

    const minimumAge =
        Math.max(0, settings.accountAgeDays) *
        24 * 60 * 60 * 1000;

    const accountTooNew = accountAge < minimumAge;

    const joinSpike =
        recentJoins.length >= settings.joinLimit;

    if (!accountTooNew && !joinSpike) return;

    const reasons = [];

    if (accountTooNew) {
        reasons.push(
            `Account is younger than ${settings.accountAgeDays} days`
        );
    }

    if (joinSpike) {
        reasons.push(
            `${recentJoins.length} members joined within ${
                settings.interval / 1000
            } seconds`
        );
    }

    const reason = reasons.join("; ");

    await sendSecurityLog(
        guild,
        "Antiraid Alert",
        [
            `**Member:** ${member.user.tag}`,
            `**User ID:** ${member.id}`,
            `**Reason:** ${reason}`,
            `**Account created:** <t:${Math.floor(
                member.user.createdTimestamp / 1000
            )}:R>`,
            "",
            "Review the alert before taking further action."
        ].join("\n")
    );

    // Do not automatically punish every member during a join spike.
    // Only apply the configured action to an account that is too new.
    if (!accountTooNew) return;

    if (isTrustedSecurityUser(guild, member.id)) return;

    const action = String(settings.action || "alert")
        .toLowerCase();

    if (action === "kick") {
        const botMember = guild.members.me;

        if (
            !botMember ||
            !botMember.permissions.has(
                PermissionsBitField.Flags.KickMembers
            ) ||
            !member.kickable
        ) {
            await sendSecurityLog(
                guild,
                "Antiraid Action Failed",
                `Could not kick ${member.user.tag}. Check bot permissions and role hierarchy.`
            );

            return;
        }

        await member.kick(
            "PYRR Antiraid: account age below configured minimum"
        ).catch(async (error) => {
            await sendSecurityLog(
                guild,
                "Antiraid Action Failed",
                `Could not kick ${member.user.tag}: ${error.message}`
            );
        });

        return;
    }

    if (action === "timeout") {
        const botMember = guild.members.me;

        if (
            !botMember ||
            !botMember.permissions.has(
                PermissionsBitField.Flags.ModerateMembers
            ) ||
            !member.moderatable
        ) {
            await sendSecurityLog(
                guild,
                "Antiraid Action Failed",
                `Could not timeout ${member.user.tag}. Check bot permissions and role hierarchy.`
            );

            return;
        }

        await member.timeout(
            10 * 60 * 1000,
            "PYRR Antiraid: review required for a new account"
        ).catch(async (error) => {
            await sendSecurityLog(
                guild,
                "Antiraid Action Failed",
                `Could not timeout ${member.user.tag}: ${error.message}`
            );
        });
    }
}

client.on("guildMemberAdd", async (member) => {
    try {
        await handleAntiraidJoin(member);
    } catch (error) {
        console.error(
            "PYRR antiraid error:",
            error.message
        );
    }
});

registerCommand({
    name: "antiraidage",
    description: "Set the minimum account age for antiraid",
    category: "Security",
    options: [
        {
            name: "days",
            description: "Minimum account age in days",
            type: "integer",
            required: true,
            min: 0,
            max: 365
        }
    ],
    execute: async (ctx) => {
        if (!requireGuild(ctx)) return;

        if (!canManageSettings(ctx)) {
            return ctx.reply({
                embeds: [
                    permissionEmbed(
                        "Only an authorized administrator can change antiraid settings."
                    )
                ]
            });
        }

        const days = ctx.isInteraction
            ? ctx.getInteger("days")
            : Number(ctx.args[0]);

        if (
            !Number.isInteger(days) ||
            days < 0 ||
            days > 365
        ) {
            return ctx.reply({
                embeds: [
                    errorEmbed(
                        "Invalid Age",
                        "Enter a whole number from 0 to 365."
                    )
                ]
            });
        }

        const config = getSecurityConfig(ctx.guild.id);

        config.antiraid.accountAgeDays = days;

        await saveDatabase();

        return ctx.reply({
            embeds: [
                successEmbed(
                    "Antiraid Age Updated",
                    `Minimum account age is now **${days} days**.`
                )
            ]
        });
    }
});

registerCommand({
    name: "antiraidlimit",
    description: "Set the join-spike detection limit",
    category: "Security",
    options: [
        {
            name: "members",
            description: "Number of joins that triggers an alert",
            type: "integer",
            required: true,
            min: 2,
            max: 100
        },
        {
            name: "seconds",
            description: "Time window in seconds",
            type: "integer",
            required: true,
            min: 5,
            max: 300
        }
    ],
    execute: async (ctx) => {
        if (!requireGuild(ctx)) return;

        if (!canManageSettings(ctx)) {
            return ctx.reply({
                embeds: [
                    permissionEmbed(
                        "You need authorized administrator access."
                    )
                ]
            });
        }

        const members = ctx.isInteraction
            ? ctx.getInteger("members")
            : Number(ctx.args[0]);

        const seconds = ctx.isInteraction
            ? ctx.getInteger("seconds")
            : Number(ctx.args[1]);

        if (
            !Number.isInteger(members) ||
            members < 2 ||
            members > 100 ||
            !Number.isInteger(seconds) ||
            seconds < 5 ||
            seconds > 300
        ) {
            return ctx.reply({
                embeds: [
                    errorEmbed(
                        "Invalid Settings",
                        "Members must be 2–100 and seconds must be 5–300."
                    )
                ]
            });
        }

        const config = getSecurityConfig(ctx.guild.id);

        config.antiraid.joinLimit = members;
        config.antiraid.interval = seconds * 1000;

        await saveDatabase();

        return ctx.reply({
            embeds: [
                successEmbed(
                    "Antiraid Limit Updated",
                    `Alert threshold: **${members} joins** within **${seconds} seconds**.`
                )
            ]
        });
    }
});

// Append Part 6 below this line.

/* =========================================
   PART 6/20 — AUTOMOD
========================================= */

function getAutoModConfig(guildId) {
    const config = getConfig(guildId);

    config.automod ||= {
        enabled: false,
        antiSpam: true,
        antiLinks: false,
        antiInvite: true,
        badWords: [],
        maxMentions: 5,
        maxMessages: 6,
        spamInterval: 5000,
        ignoredChannels: []
    };

    return config.automod;
}

const pyrrMessageTracker = new Map();

function getUserMessageTracker(guildId, userId) {
    const key = `${guildId}:${userId}`;

    if (!pyrrMessageTracker.has(key)) {
        pyrrMessageTracker.set(key, []);
    }

    return pyrrMessageTracker.get(key);
}

function isDiscordInvite(text) {
    return /(?:discord\.gg\/|discord(?:app)?\.com\/invite\/)/i.test(
        text
    );
}

function containsBlockedLink(text) {
    return /https?:\/\/\S+/i.test(text);
}

function containsBlockedWord(text, words) {
    const lowerText = text.toLowerCase();

    return words.find((word) => {
        const cleanWord = String(word || "")
            .trim()
            .toLowerCase();

        if (!cleanWord) return false;

        return lowerText.includes(cleanWord);
    }) || null;
}

async function handleAutoModMessage(message) {
    if (!message.guild) return;
    if (message.author.bot) return;
    if (!message.member) return;

    const config = getAutoModConfig(message.guild.id);

    if (!config.enabled) return;

    if (
        config.ignoredChannels.includes(message.channel.id)
    ) {
        return;
    }

    if (
        message.member.permissions.has(
            PermissionsBitField.Flags.ManageMessages
        )
    ) {
        return;
    }

    const content = message.content || "";
    let reason = null;

    if (
        config.antiInvite &&
        isDiscordInvite(content)
    ) {
        reason = "Discord invite links are not allowed";
    }

    if (
        !reason &&
        config.antiLinks &&
        containsBlockedLink(content)
    ) {
        reason = "Links are not allowed";
    }

    if (
        !reason &&
        Array.isArray(config.badWords) &&
        config.badWords.length
    ) {
        const blocked = containsBlockedWord(
            content,
            config.badWords
        );

        if (blocked) {
            reason = "Blocked word detected";
        }
    }

    if (
        !reason &&
        config.maxMentions > 0
    ) {
        const mentionCount =
            message.mentions.users.size +
            message.mentions.roles.size;

        if (mentionCount > config.maxMentions) {
            reason = "Too many mentions";
        }
    }

    if (!reason && config.antiSpam) {
        const tracker = getUserMessageTracker(
            message.guild.id,
            message.author.id
        );

        const now = Date.now();

        tracker.push(now);

        const recent = tracker.filter(
            (time) => now - time <= config.spamInterval
        );

        pyrrMessageTracker.set(
            `${message.guild.id}:${message.author.id}`,
            recent
        );

        if (recent.length > config.maxMessages) {
            reason = "Message spam detected";
        }
    }

    if (!reason) return;

    try {
        await message.delete();
    } catch (error) {
        console.error(
            "AutoMod delete error:",
            error.message
        );
    }

    await sendLog(
        message.guild,
        makeEmbed(
            "AutoMod Action",
            [
                `**User:** ${message.author.tag}`,
                `**Channel:** ${message.channel}`,
                `**Reason:** ${reason}`
            ].join("\n"),
            COLORS.orange
        )
    );

    const warning = await message.channel.send({
        content: `${message.author}, your message was removed: **${reason}**.`
    }).catch(() => null);

    if (warning) {
        setTimeout(() => {
            warning.delete().catch(() => {});
        }, 5000);
    }
}

client.on("messageCreate", async (message) => {
    try {
        await handleAutoModMessage(message);
    } catch (error) {
        console.error(
            "PYRR AutoMod error:",
            error.message
        );
    }
});

registerCommand({
    name: "automod",
    description: "Enable, disable, or view AutoMod",
    category: "Security",
    options: [
        {
            name: "action",
            description: "Choose a setting",
            type: "string",
            required: true,
            choices: [
                { name: "Enable", value: "enable" },
                { name: "Disable", value: "disable" },
                { name: "Status", value: "status" }
            ]
        }
    ],
    execute: async (ctx) => {
        if (!requireGuild(ctx)) return;

        if (!canManageSettings(ctx)) {
            return ctx.reply({
                embeds: [
                    permissionEmbed(
                        "You need authorized administrator access."
                    )
                ]
            });
        }

        const action = ctx.isInteraction
            ? ctx.getString("action")
            : (ctx.args[0] || "status").toLowerCase();

        const config = getAutoModConfig(ctx.guild.id);

        if (action === "enable") {
            config.enabled = true;
        } else if (action === "disable") {
            config.enabled = false;
        } else if (action !== "status") {
            return ctx.reply({
                embeds: [
                    errorEmbed(
                        "Invalid Action",
                        "Use `,automod enable`, `,automod disable`, or `,automod status`."
                    )
                ]
            });
        }

        await saveDatabase();

        return ctx.reply({
            embeds: [
                makeEmbed(
                    "AutoMod",
                    [
                        `**Enabled:** ${config.enabled ? "Yes" : "No"}`,
                        `**Anti-spam:** ${config.antiSpam ? "On" : "Off"}`,
                        `**Anti-invite:** ${config.antiInvite ? "On" : "Off"}`,
                        `**Anti-links:** ${config.antiLinks ? "On" : "Off"}`,
                        `**Maximum mentions:** ${config.maxMentions}`
                    ].join("\n"),
                    COLORS.orange
                )
            ]
        });
    }
});

registerCommand({
    name: "automodsetting",
    description: "Change an AutoMod setting",
    category: "Security",
    options: [
        {
            name: "setting",
            description: "Setting to change",
            type: "string",
            required: true,
            choices: [
                { name: "Anti-spam", value: "antispam" },
                { name: "Anti-links", value: "antilinks" },
                { name: "Anti-invite", value: "antiinvite" }
            ]
        },
        {
            name: "state",
            description: "Turn the setting on or off",
            type: "string",
            required: true,
            choices: [
                { name: "On", value: "on" },
                { name: "Off", value: "off" }
            ]
        }
    ],
    execute: async (ctx) => {
        if (!requireGuild(ctx)) return;

        if (!canManageSettings(ctx)) {
            return ctx.reply({
                embeds: [
                    permissionEmbed(
                        "You need authorized administrator access."
                    )
                ]
            });
        }

        const setting = ctx.isInteraction
            ? ctx.getString("setting")
            : (ctx.args[0] || "").toLowerCase();

        const state = ctx.isInteraction
            ? ctx.getString("state")
            : (ctx.args[1] || "").toLowerCase();

        const enabled = parseOnOff(state);

        if (
            enabled === null ||
            !["antispam", "antilinks", "antiinvite"].includes(setting)
        ) {
            return ctx.reply({
                embeds: [
                    errorEmbed(
                        "Invalid Setting",
                        "Choose antispam, antilinks, or antiinvite, followed by on or off."
                    )
                ]
            });
        }

        const config = getAutoModConfig(ctx.guild.id);

        const settingMap = {
            antispam: "antiSpam",
            antilinks: "antiLinks",
            antiinvite: "antiInvite"
        };

        config[settingMap[setting]] = enabled;

        await saveDatabase();

        return ctx.reply({
            embeds: [
                successEmbed(
                    "AutoMod Updated",
                    `**${setting}** is now **${enabled ? "ON" : "OFF"}**.`
                )
            ]
        });
    }
});

registerCommand({
    name: "automodword",
    description: "Add a word to the AutoMod blocklist",
    category: "Security",
    options: [
        {
            name: "word",
            description: "Word or phrase to block",
            type: "string",
            required: true
        }
    ],
    execute: async (ctx) => {
        if (!requireGuild(ctx)) return;

        if (!canManageSettings(ctx)) {
            return ctx.reply({
                embeds: [
                    permissionEmbed(
                        "You need authorized administrator access."
                    )
                ]
            });
        }

        const word = (
            ctx.isInteraction
                ? ctx.getString("word")
                : ctx.args.join(" ")
        ).trim().toLowerCase();

        if (!word || word.length > 80) {
            return ctx.reply({
                embeds: [
                    errorEmbed(
                        "Invalid Word",
                        "Provide a word or phrase up to 80 characters."
                    )
                ]
            });
        }

        const config = getAutoModConfig(ctx.guild.id);

        if (
            config.badWords.some(
                (item) => item.toLowerCase() === word
            )
        ) {
            return ctx.reply({
                embeds: [
                    infoEmbed(
                        "Already Added",
                        "That word is already on the blocklist."
                    )
                ]
            });
        }

        config.badWords.push(word);

        await saveDatabase();

        return ctx.reply({
            embeds: [
                successEmbed(
                    "Word Added",
                    `Added **${word}** to the AutoMod blocklist.`
                )
            ]
        });
    }
});

registerCommand({
    name: "automodwordremove",
    description: "Remove a word from the AutoMod blocklist",
    category: "Security",
    options: [
        {
            name: "word",
            description: "Word or phrase to remove",
            type: "string",
            required: true
        }
    ],
    execute: async (ctx) => {
        if (!requireGuild(ctx)) return;

        if (!canManageSettings(ctx)) {
            return ctx.reply({
                embeds: [
                    permissionEmbed(
                        "You need authorized administrator access."
                    )
                ]
            });
        }

        const word = (
            ctx.isInteraction
                ? ctx.getString("word")
                : ctx.args.join(" ")
        ).trim().toLowerCase();

        const config = getAutoModConfig(ctx.guild.id);
        const before = config.badWords.length;

        config.badWords = config.badWords.filter(
            (item) => item.toLowerCase() !== word
        );

        if (config.badWords.length === before) {
            return ctx.reply({
                embeds: [
                    infoEmbed(
                        "Word Not Found",
                        "That word is not on the blocklist."
                    )
                ]
            });
        }

        await saveDatabase();

        return ctx.reply({
            embeds: [
                successEmbed(
                    "Word Removed",
                    `Removed **${word}** from the AutoMod blocklist.`
                )
            ]
        });
    }
});

// Append Part 7 below this line.

/* =========================================
   PART 7/20 — WELCOME / LEAVE / AUTOROLE
========================================= */

function getWelcomeConfig(guildId) {
    const config = getConfig(guildId);

    config.welcome ||= {
        enabled: false,
        channelId: null,
        message: "Welcome {user} to {server}!",
        useEmbed: true
    };

    config.leave ||= {
        enabled: false,
        channelId: null,
        message: "{username} has left {server}."
    };

    config.autorole ||= {
        enabled: false,
        roleId: null
    };

    return config;
}

function replaceWelcomeVariables(text, member) {
    return String(text || "")
        .replaceAll("{user}", `<@${member.id}>`)
        .replaceAll("{username}", member.user.username)
        .replaceAll("{tag}", member.user.tag)
        .replaceAll("{server}", member.guild.name)
        .replaceAll("{count}", String(member.guild.memberCount))
        .replaceAll("{id}", member.id);
}

async function sendWelcomeMessage(member) {
    const config = getWelcomeConfig(member.guild.id);
    const settings = config.welcome;

    if (!settings.enabled || !settings.channelId) return;

    const channel = await member.guild.channels
        .fetch(settings.channelId)
        .catch(() => null);

    if (!channel || !channel.isTextBased()) return;

    const content = replaceWelcomeVariables(
        settings.message,
        member
    );

    if (settings.useEmbed) {
        const embed = makeEmbed(
            "Welcome!",
            content,
            COLORS.green
        );

        embed.setThumbnail(
            member.user.displayAvatarURL({ size: 256 })
        );

        embed.setFooter({
            text: `Member #${member.guild.memberCount}`
        });

        await channel.send({ embeds: [embed] });
    } else {
        await channel.send({ content });
    }
}

async function sendLeaveMessage(member) {
    const config = getWelcomeConfig(member.guild.id);
    const settings = config.leave;

    if (!settings.enabled || !settings.channelId) return;

    const channel = await member.guild.channels
        .fetch(settings.channelId)
        .catch(() => null);

    if (!channel || !channel.isTextBased()) return;

    const content = replaceWelcomeVariables(
        settings.message,
        member
    );

    await channel.send({ content }).catch(() => {});
}

async function assignAutoRole(member) {
    const config = getWelcomeConfig(member.guild.id);
    const settings = config.autorole;

    if (!settings.enabled || !settings.roleId) return;

    const role = await member.guild.roles
        .fetch(settings.roleId)
        .catch(() => null);

    if (!role || role.managed) return;

    const botMember = member.guild.members.me;

    if (
        !botMember ||
        !botMember.permissions.has(
            PermissionsBitField.Flags.ManageRoles
        ) ||
        role.position >= botMember.roles.highest.position
    ) {
        return;
    }

    await member.roles.add(
        role,
        "PYRR Auto Role"
    ).catch((error) => {
        console.error(
            "Autorole error:",
            error.message
        );
    });
}

client.on("guildMemberAdd", async (member) => {
    try {
        await sendWelcomeMessage(member);
        await assignAutoRole(member);
    } catch (error) {
        console.error(
            "Welcome/autorole error:",
            error.message
        );
    }
});

client.on("guildMemberRemove", async (member) => {
    try {
        await sendLeaveMessage(member);
    } catch (error) {
        console.error(
            "Leave message error:",
            error.message
        );
    }
});

registerCommand({
    name: "setwelcome",
    description: "Configure the welcome channel",
    category: "Utility",
    options: [
        {
            name: "channel",
            description: "Channel for welcome messages",
            type: "channel",
            required: true
        }
    ],
    execute: async (ctx) => {
        if (!requireGuild(ctx)) return;

        if (!canManageSettings(ctx)) {
            return ctx.reply({
                embeds: [
                    permissionEmbed(
                        "You need authorized administrator access."
                    )
                ]
            });
        }

        const channel = ctx.isInteraction
            ? ctx.getChannel("channel")
            : ctx.channel;

        if (!channel || !channel.isTextBased()) {
            return ctx.reply({
                embeds: [
                    errorEmbed(
                        "Invalid Channel",
                        "Choose a text channel."
                    )
                ]
            });
        }

        const config = getWelcomeConfig(ctx.guild.id);

        config.welcome.channelId = channel.id;
        config.welcome.enabled = true;

        await saveDatabase();

        return ctx.reply({
            embeds: [
                successEmbed(
                    "Welcome Channel Set",
                    `Welcome messages will be sent to ${channel}.`
                )
            ]
        });
    }
});

registerCommand({
    name: "welcomemessage",
    description: "Set the welcome message",
    category: "Utility",
    options: [
        {
            name: "message",
            description: "Use {user}, {username}, {server}, {count}, or {id}",
            type: "string",
            required: true
        }
    ],
    execute: async (ctx) => {
        if (!requireGuild(ctx)) return;

        if (!canManageSettings(ctx)) {
            return ctx.reply({
                embeds: [
                    permissionEmbed(
                        "You need authorized administrator access."
                    )
                ]
            });
        }

        const message = (
            ctx.isInteraction
                ? ctx.getString("message")
                : ctx.args.join(" ")
        ).trim();

        if (!message || message.length > 1800) {
            return ctx.reply({
                embeds: [
                    errorEmbed(
                        "Invalid Message",
                        "The message must be between 1 and 1800 characters."
                    )
                ]
            });
        }

        const config = getWelcomeConfig(ctx.guild.id);

        config.welcome.message = message;
        config.welcome.enabled = true;

        await saveDatabase();

        return ctx.reply({
            embeds: [
                successEmbed(
                    "Welcome Message Updated",
                    "The welcome message has been saved."
                )
            ]
        });
    }
});

registerCommand({
    name: "disablewelcome",
    description: "Disable welcome messages",
    category: "Utility",
    execute: async (ctx) => {
        if (!requireGuild(ctx)) return;

        if (!canManageSettings(ctx)) {
            return ctx.reply({
                embeds: [
                    permissionEmbed(
                        "You need authorized administrator access."
                    )
                ]
            });
        }

        const config = getWelcomeConfig(ctx.guild.id);

        config.welcome.enabled = false;

        await saveDatabase();

        return ctx.reply({
            embeds: [
                successEmbed(
                    "Welcome Disabled",
                    "Welcome messages are now disabled."
                )
            ]
        });
    }
});

registerCommand({
    name: "setleave",
    description: "Configure the leave-message channel",
    category: "Utility",
    options: [
        {
            name: "channel",
            description: "Channel for leave messages",
            type: "channel",
            required: true
        }
    ],
    execute: async (ctx) => {
        if (!requireGuild(ctx)) return;

        if (!canManageSettings(ctx)) {
            return ctx.reply({
                embeds: [
                    permissionEmbed(
                        "You need authorized administrator access."
                    )
                ]
            });
        }

        const channel = ctx.isInteraction
            ? ctx.getChannel("channel")
            : ctx.channel;

        if (!channel || !channel.isTextBased()) {
            return ctx.reply({
                embeds: [
                    errorEmbed(
                        "Invalid Channel",
                        "Choose a text channel."
                    )
                ]
            });
        }

        const config = getWelcomeConfig(ctx.guild.id);

        config.leave.channelId = channel.id;
        config.leave.enabled = true;

        await saveDatabase();

        return ctx.reply({
            embeds: [
                successEmbed(
                    "Leave Channel Set",
                    `Leave messages will be sent to ${channel}.`
                )
            ]
        });
    }
});

registerCommand({
    name: "leavemessage",
    description: "Set the leave message",
    category: "Utility",
    options: [
        {
            name: "message",
            description: "Use {user}, {username}, {server}, {count}, or {id}",
            type: "string",
            required: true
        }
    ],
    execute: async (ctx) => {
        if (!requireGuild(ctx)) return;

        if (!canManageSettings(ctx)) {
            return ctx.reply({
                embeds: [
                    permissionEmbed(
                        "You need authorized administrator access."
                    )
                ]
            });
        }

        const message = (
            ctx.isInteraction
                ? ctx.getString("message")
                : ctx.args.join(" ")
        ).trim();

        if (!message || message.length > 1800) {
            return ctx.reply({
                embeds: [
                    errorEmbed(
                        "Invalid Message",
                        "The message must be between 1 and 1800 characters."
                    )
                ]
            });
        }

        const config = getWelcomeConfig(ctx.guild.id);

        config.leave.message = message;
        config.leave.enabled = true;

        await saveDatabase();

        return ctx.reply({
            embeds: [
                successEmbed(
                    "Leave Message Updated",
                    "The leave message has been saved."
                )
            ]
        });
    }
});

registerCommand({
    name: "disableleave",
    description: "Disable leave messages",
    category: "Utility",
    execute: async (ctx) => {
        if (!requireGuild(ctx)) return;

        if (!canManageSettings(ctx)) {
            return ctx.reply({
                embeds: [
                    permissionEmbed(
                        "You need authorized administrator access."
                    )
                ]
            });
        }

        const config = getWelcomeConfig(ctx.guild.id);

        config.leave.enabled = false;

        await saveDatabase();

        return ctx.reply({
            embeds: [
                successEmbed(
                    "Leave Messages Disabled",
                    "Leave messages are now disabled."
                )
            ]
        });
    }
});

registerCommand({
    name: "setautorole",
    description: "Set the role automatically assigned to new members",
    category: "Utility",
    options: [
        {
            name: "role",
            description: "Role to assign",
            type: "role",
            required: true
        }
    ],
    execute: async (ctx) => {
        if (!requireGuild(ctx)) return;

        if (!canManageSettings(ctx)) {
            return ctx.reply({
                embeds: [
                    permissionEmbed(
                        "You need authorized administrator access."
                    )
                ]
            });
        }

        const role = ctx.isInteraction
            ? ctx.getRole("role")
            : await ctx.guild.roles.fetch(
                (ctx.args[0] || "").replace(/[<@&>]/g, "")
            ).catch(() => null);

        if (!role || role.managed) {
            return ctx.reply({
                embeds: [
                    errorEmbed(
                        "Invalid Role",
                        "Choose a valid, assignable role."
                    )
                ]
            });
        }

        const botMember = ctx.guild.members.me;

        if (
            !botMember ||
            role.position >= botMember.roles.highest.position
        ) {
            return ctx.reply({
                embeds: [
                    errorEmbed(
                        "Role Hierarchy",
                        "Move the bot's highest role above the selected role."
                    )
                ]
            });
        }

        const config = getWelcomeConfig(ctx.guild.id);

        config.autorole.roleId = role.id;
        config.autorole.enabled = true;

        await saveDatabase();

        return ctx.reply({
            embeds: [
                successEmbed(
                    "Auto Role Enabled",
                    `New members will receive ${role}.`
                )
            ]
        });
    }
});

registerCommand({
    name: "disableautorole",
    description: "Disable automatic role assignment",
    category: "Utility",
    execute: async (ctx) => {
        if (!requireGuild(ctx)) return;

        if (!canManageSettings(ctx)) {
            return ctx.reply({
                embeds: [
                    permissionEmbed(
                        "You need authorized administrator access."
                    )
                ]
            });
        }

        const config = getWelcomeConfig(ctx.guild.id);

        config.autorole.enabled = false;

        await saveDatabase();

        return ctx.reply({
            embeds: [
                successEmbed(
                    "Auto Role Disabled",
                    "Automatic role assignment is now disabled."
                )
            ]
        });
    }
});

// Append Part 8 below this line.

/* =========================================
   PART 8/20 — TICKET SYSTEM
========================================= */

function getTicketConfig(guildId) {
    const config = getConfig(guildId);

    config.tickets ||= {
        enabled: false,
        categoryId: null,
        supportRoleId: null,
        logChannelId: null,
        openTickets: {}
    };

    config.tickets.openTickets ||= {};

    return config.tickets;
}

function buildTicketEmbed(guild, user) {
    return makeEmbed(
        "PYRR Support",
        [
            `Hello ${user}, welcome to support.`,
            "",
            "Please describe your issue clearly.",
            "A support team member will assist you soon.",
            "",
            "Use the buttons below to manage this ticket."
        ].join("\n"),
        COLORS.orange
    ).setFooter({
        text: `${BOT_NAME} • ${guild.name}`
    });
}

async function createTicketChannel(guild, user) {
    const config = getTicketConfig(guild.id);

    if (!config.enabled) {
        throw new Error("The ticket system is disabled.");
    }

    const existingId = config.openTickets[user.id];

    if (existingId) {
        const existing = await guild.channels
            .fetch(existingId)
            .catch(() => null);

        if (existing) {
            return {
                channel: existing,
                created: false
            };
        }

        delete config.openTickets[user.id];
    }

    const botMember = guild.members.me;

    if (
        !botMember ||
        !botMember.permissions.has(
            PermissionsBitField.Flags.ManageChannels
        )
    ) {
        throw new Error(
            "The bot needs Manage Channels permission."
        );
    }

    const overwrites = [
        {
            id: guild.roles.everyone.id,
            deny: [
                PermissionsBitField.Flags.ViewChannel
            ]
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
                PermissionsBitField.Flags.ManageChannels
            ]
        }
    ];

    if (config.supportRoleId) {
        const supportRole = await guild.roles
            .fetch(config.supportRoleId)
            .catch(() => null);

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

    const channelOptions = {
        name: `ticket-${user.username}`
            .toLowerCase()
            .replace(/[^a-z0-9-]/g, "")
            .slice(0, 90),
        type: ChannelType.GuildText,
        permissionOverwrites: overwrites,
        topic: `PYRR ticket | User ID: ${user.id}`
    };

    if (config.categoryId) {
        const category = await guild.channels
            .fetch(config.categoryId)
            .catch(() => null);

        if (
            category &&
            category.type === ChannelType.GuildCategory
        ) {
            channelOptions.parent = category.id;
        }
    }

    const channel = await guild.channels.create(
        channelOptions
    );

    config.openTickets[user.id] = channel.id;

    await saveDatabase();

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId("pyrr_ticket_close")
            .setLabel("Close Ticket")
            .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
            .setCustomId("pyrr_ticket_claim")
            .setLabel("Claim Ticket")
            .setStyle(ButtonStyle.Primary)
    );

    await channel.send({
        content: `${user}`,
        embeds: [buildTicketEmbed(guild, user)],
        components: [row]
    });

    return {
        channel,
        created: true
    };
}

registerCommand({
    name: "ticketsetup",
    description: "Enable the ticket system",
    category: "Tickets",
    options: [
        {
            name: "category",
            description: "Optional category for new tickets",
            type: "channel",
            required: false
        },
        {
            name: "supportrole",
            description: "Optional support team role",
            type: "role",
            required: false
        }
    ],
    execute: async (ctx) => {
        if (!requireGuild(ctx)) return;

        if (!canManageSettings(ctx)) {
            return ctx.reply({
                embeds: [
                    permissionEmbed(
                        "You need authorized administrator access."
                    )
                ]
            });
        }

        const category = ctx.isInteraction
            ? ctx.getChannel("category")
            : null;

        const supportRole = ctx.isInteraction
            ? ctx.getRole("supportrole")
            : null;

        if (
            category &&
            category.type !== ChannelType.GuildCategory
        ) {
            return ctx.reply({
                embeds: [
                    errorEmbed(
                        "Invalid Category",
                        "Select a category channel."
                    )
                ]
            });
        }

        const config = getTicketConfig(ctx.guild.id);

        config.enabled = true;

        if (category) {
            config.categoryId = category.id;
        }

        if (supportRole) {
            config.supportRoleId = supportRole.id;
        }

        await saveDatabase();

        return ctx.reply({
            embeds: [
                successEmbed(
                    "Ticket System Enabled",
                    [
                        "**Enabled:** Yes",
                        `**Category:** ${category || "Not set"}`,
                        `**Support role:** ${supportRole || "Not set"}`,
                        "",
                        "Use `,ticketpanel` to create a ticket panel."
                    ].join("\n")
                )
            ]
        });
    }
});

registerCommand({
    name: "ticketpanel",
    description: "Post a panel that members can use to open tickets",
    category: "Tickets",
    execute: async (ctx) => {
        if (!requireGuild(ctx)) return;

        if (!canManageSettings(ctx)) {
            return ctx.reply({
                embeds: [
                    permissionEmbed(
                        "You need authorized administrator access."
                    )
                ]
            });
        }

        const config = getTicketConfig(ctx.guild.id);

        if (!config.enabled) {
            return ctx.reply({
                embeds: [
                    errorEmbed(
                        "Ticket System Disabled",
                        "Run `,ticketsetup` first."
                    )
                ]
            });
        }

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId("pyrr_ticket_create")
                .setLabel("Create Ticket")
                .setStyle(ButtonStyle.Primary)
        );

        await ctx.channel.send({
            embeds: [
                makeEmbed(
                    "PYRR Support Center",
                    "Need help? Press **Create Ticket** to open a private support channel.",
                    COLORS.orange
                )
            ],
            components: [row]
        });

        return ctx.reply({
            embeds: [
                successEmbed(
                    "Ticket Panel Posted",
                    "The ticket panel has been sent."
                )
            ],
            ephemeral: true
        });
    }
});

registerCommand({
    name: "ticketclose",
    description: "Close the current ticket",
    category: "Tickets",
    execute: async (ctx) => {
        if (!requireGuild(ctx)) return;

        const config = getTicketConfig(ctx.guild.id);
        const ownerId = Object.keys(
            config.openTickets
        ).find(
            (id) => config.openTickets[id] === ctx.channel.id
        );

        const isSupport =
            canManageSettings(ctx) ||
            (
                config.supportRoleId &&
                ctx.member.roles.cache.has(
                    config.supportRoleId
                )
            );

        if (
            !ownerId ||
            (ownerId !== ctx.user.id && !isSupport)
        ) {
            return ctx.reply({
                embeds: [
                    permissionEmbed(
                        "Only the ticket owner or support team can close this ticket."
                    )
                ]
            });
        }

        delete config.openTickets[ownerId];

        await saveDatabase();

        await ctx.channel.send({
            embeds: [
                infoEmbed(
                    "Ticket Closed",
                    `Closed by ${ctx.user.tag}. This channel will be deleted in 5 seconds.`
                )
            ]
        });

        setTimeout(() => {
            ctx.channel.delete("PYRR ticket closed").catch(() => {});
        }, 5000);

        return;
    }
});

client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton()) return;

    if (
        ![
            "pyrr_ticket_create",
            "pyrr_ticket_close",
            "pyrr_ticket_claim"
        ].includes(interaction.customId)
    ) {
        return;
    }

    if (!interaction.guild) {
        return interaction.reply({
            content: "This button only works inside a server.",
            ephemeral: true
        });
    }

    const config = getTicketConfig(interaction.guild.id);

    if (!config.enabled) {
        return interaction.reply({
            content: "The ticket system is currently disabled.",
            ephemeral: true
        });
    }

    if (interaction.customId === "pyrr_ticket_create") {
        await interaction.deferReply({
            ephemeral: true
        });

        try {
            const result = await createTicketChannel(
                interaction.guild,
                interaction.user
            );

            return interaction.editReply({
                content: result.created
                    ? `Your ticket has been created: ${result.channel}`
                    : `You already have an open ticket: ${result.channel}`
            });
        } catch (error) {
            console.error("Ticket creation error:", error.message);

            return interaction.editReply({
                content: `Unable to create a ticket: ${error.message}`
            });
        }
    }

    const ownerId = Object.keys(
        config.openTickets
    ).find(
        (id) => config.openTickets[id] === interaction.channelId
    );

    const isSupport =
        interaction.guild.ownerId === interaction.user.id ||
        OWNER_IDS.includes(interaction.user.id) ||
        (
            config.supportRoleId &&
            interaction.member.roles?.cache?.has(
                config.supportRoleId
            )
        );

    if (
        !ownerId ||
        (ownerId !== interaction.user.id && !isSupport)
    ) {
        return interaction.reply({
            content: "You don't have permission to use this ticket button.",
            ephemeral: true
        });
    }

    if (interaction.customId === "pyrr_ticket_claim") {
        if (!isSupport) {
            return interaction.reply({
                content: "Only the support team can claim tickets.",
                ephemeral: true
            });
        }

        await interaction.reply({
            content: `Ticket claimed by ${interaction.user}.`
        });

        return;
    }

    delete config.openTickets[ownerId];

    await saveDatabase();

    await interaction.reply({
        content: `Ticket closed by ${interaction.user.tag}. Deleting this channel in 5 seconds.`
    });

    setTimeout(() => {
        interaction.channel
            ?.delete("PYRR ticket closed")
            .catch(() => {});
    }, 5000);
});

// Append Part 9 below this line.

/* =========================================
   PART 9/20 — LEVELING SYSTEM
========================================= */

function getLevelingConfig(guildId) {
    const config = getConfig(guildId);

    config.leveling ||= {
        enabled: true,
        announceLevelUp: true,
        ignoredChannels: [],
        users: {}
    };

    config.leveling.users ||= {};

    return config.leveling;
}

function getLevelingUser(config, userId) {
    if (!config.users[userId]) {
        config.users[userId] = {
            xp: 0,
            level: 0,
            messages: 0
        };
    }

    return config.users[userId];
}

function xpForLevel(level) {
    return 5 * level * level + 50 * level + 100;
}

function getTotalXpForLevel(level) {
    let total = 0;

    for (let current = 0; current < level; current++) {
        total += xpForLevel(current);
    }

    return total;
}

function calculateLevel(totalXp) {
    let level = 0;
    let remainingXp = Math.max(0, totalXp);

    while (remainingXp >= xpForLevel(level)) {
        remainingXp -= xpForLevel(level);
        level++;

        if (level > 10000) break;
    }

    return {
        level,
        currentXp: remainingXp,
        nextLevelXp: xpForLevel(level)
    };
}

const pyrrXpCooldown = new Map();

async function handleLevelingMessage(message) {
    if (!message.guild || message.author.bot) return;

    const config = getLevelingConfig(message.guild.id);

    if (!config.enabled) return;

    if (
        config.ignoredChannels.includes(message.channel.id)
    ) {
        return;
    }

    const cooldownKey =
        `${message.guild.id}:${message.author.id}`;

    const now = Date.now();
    const previous = pyrrXpCooldown.get(cooldownKey) || 0;

    // One XP award per user every 60 seconds.
    if (now - previous < 60000) return;

    pyrrXpCooldown.set(cooldownKey, now);

    const userData = getLevelingUser(
        config,
        message.author.id
    );

    const previousLevel = userData.level;

    const earnedXp =
        Math.floor(Math.random() * 11) + 15;

    userData.xp += earnedXp;
    userData.messages += 1;

    const result = calculateLevel(userData.xp);

    userData.level = result.level;

    if (
        result.level > previousLevel &&
        config.announceLevelUp
    ) {
        await message.channel.send({
            embeds: [
                makeEmbed(
                    "Level Up!",
                    `Congratulations ${message.author}! You reached **Level ${result.level}**.`,
                    COLORS.green
                ).setThumbnail(
                    message.author.displayAvatarURL({
                        size: 256
                    })
                )
            ]
        }).catch(() => {});
    }

    if (userData.messages % 10 === 0) {
        await saveDatabase();
    }
}

client.on("messageCreate", async (message) => {
    try {
        await handleLevelingMessage(message);
    } catch (error) {
        console.error(
            "PYRR leveling error:",
            error.message
        );
    }
});

registerCommand({
    name: "rank",
    description: "View your or another member's rank",
    category: "Leveling",
    options: [
        {
            name: "user",
            description: "Member to check",
            type: "user",
            required: false
        }
    ],
    execute: async (ctx) => {
        if (!requireGuild(ctx)) return;

        const user = ctx.isInteraction
            ? ctx.getUser("user") || ctx.user
            : ctx.user;

        const config = getLevelingConfig(ctx.guild.id);
        const data = getLevelingUser(config, user.id);
        const result = calculateLevel(data.xp);

        const sorted = Object.entries(config.users)
            .sort((a, b) => b[1].xp - a[1].xp);

        const position = sorted.findIndex(
            ([id]) => id === user.id
        ) + 1;

        const progressLength = 10;
        const progressCount = Math.floor(
            (
                result.currentXp /
                result.nextLevelXp
            ) * progressLength
        );

        const progressBar =
            "█".repeat(Math.max(0, progressCount)) +
            "░".repeat(
                Math.max(0, progressLength - progressCount)
            );

        return ctx.reply({
            embeds: [
                makeEmbed(
                    `${user.username}'s Rank`,
                    [
                        `**Level:** ${result.level}`,
                        `**Total XP:** ${data.xp}`,
                        `**XP Progress:** ${result.currentXp}/${result.nextLevelXp}`,
                        `**Progress:** ${progressBar}`,
                        `**Messages:** ${data.messages}`,
                        `**Leaderboard Position:** #${position || "N/A"}`
                    ].join("\n"),
                    COLORS.orange
                ).setThumbnail(
                    user.displayAvatarURL({ size: 256 })
                )
            ]
        });
    }
});

registerCommand({
    name: "leaderboard",
    description: "Show the server XP leaderboard",
    category: "Leveling",
    aliases: ["lb", "topxp"],
    execute: async (ctx) => {
        if (!requireGuild(ctx)) return;

        const config = getLevelingConfig(ctx.guild.id);

        const sorted = Object.entries(config.users)
            .sort((a, b) => b[1].xp - a[1].xp)
            .slice(0, 10);

        if (!sorted.length) {
            return ctx.reply({
                embeds: [
                    infoEmbed(
                        "Leaderboard",
                        "No XP data yet. Start chatting to earn XP!"
                    )
                ]
            });
        }

        const lines = await Promise.all(
            sorted.map(async ([userId, data], index) => {
                const user = await ctx.client.users
                    .fetch(userId)
                    .catch(() => null);

                const username = user
                    ? user.username
                    : `User ${userId}`;

                return `**${index + 1}.** ${username} — Level **${data.level}** • **${data.xp} XP**`;
            })
        );

        return ctx.reply({
            embeds: [
                makeEmbed(
                    "XP Leaderboard",
                    lines.join("\n"),
                    COLORS.orange
                )
            ]
        });
    }
});

registerCommand({
    name: "leveling",
    description: "Enable or disable server leveling",
    category: "Leveling",
    options: [
        {
            name: "state",
            description: "Choose the leveling state",
            type: "string",
            required: true,
            choices: [
                { name: "Enable", value: "on" },
                { name: "Disable", value: "off" }
            ]
        }
    ],
    execute: async (ctx) => {
        if (!requireGuild(ctx)) return;

        if (!canManageSettings(ctx)) {
            return ctx.reply({
                embeds: [
                    permissionEmbed(
                        "You need authorized administrator access."
                    )
                ]
            });
        }

        const state = ctx.isInteraction
            ? ctx.getString("state")
            : (ctx.args[0] || "").toLowerCase();

        const enabled = parseOnOff(state);

        if (enabled === null) {
            return ctx.reply({
                embeds: [
                    errorEmbed(
                        "Invalid State",
                        "Use `,leveling on` or `,leveling off`."
                    )
                ]
            });
        }

        const config = getLevelingConfig(ctx.guild.id);

        config.enabled = enabled;

        await saveDatabase();

        return ctx.reply({
            embeds: [
                successEmbed(
                    "Leveling Updated",
                    `Leveling is now **${enabled ? "enabled" : "disabled"}**.`
                )
            ]
        });
    }
});

registerCommand({
    name: "levelreset",
    description: "Reset a member's XP",
    category: "Leveling",
    options: [
        {
            name: "user",
            description: "Member whose XP should be reset",
            type: "user",
            required: true
        }
    ],
    execute: async (ctx) => {
        if (!requireGuild(ctx)) return;

        if (!canManageSettings(ctx)) {
            return ctx.reply({
                embeds: [
                    permissionEmbed(
                        "You need authorized administrator access."
                    )
                ]
            });
        }

        const user = ctx.isInteraction
            ? ctx.getUser("user")
            : await ctx.client.users.fetch(
                (ctx.args[0] || "").replace(/[<@!>]/g, "")
            ).catch(() => null);

        if (!user) {
            return ctx.reply({
                embeds: [
                    errorEmbed(
                        "User Not Found",
                        "Mention a valid user or provide their ID."
                    )
                ]
            });
        }

        const config = getLevelingConfig(ctx.guild.id);

        delete config.users[user.id];

        await saveDatabase();

        return ctx.reply({
            embeds: [
                successEmbed(
                    "XP Reset",
                    `The leveling data for ${user.tag} has been reset.`
                )
            ]
        });
    }
});

// Append Part 10 below this line.

/* =========================================================
   PART 10/20 — SUGGESTIONS + UTILITY SETTINGS
========================================================= */

function getSuggestionConfig(guildId) {
    const config = getConfig(guildId);
    config.suggestions ||= {
        enabled: false,
        channelId: null,
        requireApproval: false
    };
    return config.suggestions;
}

registerCommand({
    name: "suggest",
    description: "Submit a server suggestion",
    category: "Utility",
    aliases: ["suggestion"],
    options: [
        {
            name: "text",
            description: "Your suggestion",
            type: "string",
            required: true
        }
    ],
    execute: async (ctx) => {
        if (!requireGuild(ctx)) return;

        const suggestion = ctx.getString("text") ||
            ctx.args.join(" ");

        if (!suggestion || suggestion.length < 5) {
            return ctx.reply({
                embeds: [
                    errorEmbed("Write a suggestion with at least 5 characters.")
                ],
                ephemeral: true
            });
        }

        const settings = getSuggestionConfig(ctx.guild.id);

        if (!settings.enabled || !settings.channelId) {
            return ctx.reply({
                embeds: [
                    errorEmbed("The suggestion system is not configured.")
                ],
                ephemeral: true
            });
        }

        const channel = ctx.guild.channels.cache.get(
            settings.channelId
        );

        if (!channel || !channel.isTextBased()) {
            return ctx.reply({
                embeds: [
                    errorEmbed("The configured suggestion channel is unavailable.")
                ],
                ephemeral: true
            });
        }

        const embed = makeEmbed({
            title: "💡 New Suggestion",
            description: suggestion,
            color: COLORS.primary,
            fields: [
                {
                    name: "Submitted by",
                    value: `${ctx.user}`,
                    inline: true
                },
                {
                    name: "Status",
                    value: settings.requireApproval
                        ? "⏳ Pending review"
                        : "🟡 Under consideration",
                    inline: true
                }
            ],
            footer: {
                text: `User ID: ${ctx.user.id}`
            },
            timestamp: new Date()
        });

        try {
            const message = await channel.send({ embeds: [embed] });

            await message.react("👍").catch(() => {});
            await message.react("👎").catch(() => {});

            return ctx.reply({
                embeds: [
                    successEmbed(
                        `Your suggestion was submitted: ${message.url}`
                    )
                ],
                ephemeral: true
            });
        } catch {
            return ctx.reply({
                embeds: [
                    errorEmbed("I cannot post in that channel. Check my permissions.")
                ],
                ephemeral: true
            });
        }
    }
});

registerCommand({
    name: "suggestionsetup",
    description: "Configure the suggestions channel",
    category: "Moderation",
    slash: false,
    aliases: ["setsuggest"],
    execute: async (ctx) => {
        if (!requireGuild(ctx)) return;
        if (!canManageSettings(ctx)) {
            return ctx.reply({
                embeds: [permissionEmbed()]
            });
        }

        const channel = ctx.message?.mentions?.channels?.first();
        if (!channel) {
            return ctx.reply({
                embeds: [
                    infoEmbed(
                        "Usage",
                        "`,suggestionsetup #channel`"
                    )
                ]
            });
        }

        if (!channel.isTextBased()) {
            return ctx.reply({
                embeds: [
                    errorEmbed("Choose a text channel.")
                ]
            });
        }

        const settings = getSuggestionConfig(ctx.guild.id);
        settings.enabled = true;
        settings.channelId = channel.id;

        await saveDatabase();

        return ctx.reply({
            embeds: [
                successEmbed(
                    `Suggestions are now enabled in ${channel}.`
                )
            ]
        });
    }
});

registerCommand({
    name: "suggestiontoggle",
    description: "Enable or disable suggestions",
    category: "Moderation",
    slash: false,
    aliases: ["suggesttoggle"],
    execute: async (ctx) => {
        if (!requireGuild(ctx)) return;
        if (!canManageSettings(ctx)) {
            return ctx.reply({
                embeds: [permissionEmbed()]
            });
        }

        const settings = getSuggestionConfig(ctx.guild.id);
        const value = (ctx.args[0] || "").toLowerCase();

        if (!["on", "off", "enable", "disable"].includes(value)) {
            return ctx.reply({
                embeds: [
                    infoEmbed(
                        "Usage",
                        "`,suggestiontoggle on` or `,suggestiontoggle off`"
                    )
                ]
            });
        }

        settings.enabled = ["on", "enable"].includes(value);
        await saveDatabase();

        return ctx.reply({
            embeds: [
                successEmbed(
                    `Suggestions ${settings.enabled ? "enabled" : "disabled"}.`
                )
            ]
        });
    }
});

registerCommand({
    name: "autoreact",
    description: "Configure automatic reactions",
    category: "Utility",
    slash: false,
    aliases: ["setautoreact"],
    execute: async (ctx) => {
        if (!requireGuild(ctx)) return;
        if (!canManageSettings(ctx)) {
            return ctx.reply({
                embeds: [permissionEmbed()]
            });
        }

        const [action, emoji, ...triggerParts] = ctx.args;
        const trigger = triggerParts.join(" ").toLowerCase();
        const config = getConfig(ctx.guild.id);

        config.utility ||= {};
        config.utility.autoReact ||= {};

        if (action === "add") {
            if (!emoji || !trigger) {
                return ctx.reply({
                    embeds: [
                        infoEmbed(
                            "Usage",
                            "`,autoreact add 😀 hello`"
                        )
                    ]
                });
            }

            config.utility.autoReact[trigger] = emoji;
        } else if (action === "remove") {
            if (!emoji) {
                return ctx.reply({
                    embeds: [
                        infoEmbed(
                            "Usage",
                            "`,autoreact remove hello`"
                        )
                    ]
                });
            }

            delete config.utility.autoReact[
                [emoji, ...triggerParts].join(" ").toLowerCase()
            ];
        } else {
            return ctx.reply({
                embeds: [
                    infoEmbed(
                        "AutoReact",
                        "`,autoreact add 😀 hello`\n`,autoreact remove hello`"
                    )
                ]
            });
        }

        await saveDatabase();

        return ctx.reply({
            embeds: [
                successEmbed("AutoReact settings updated.")
            ]
        });
    }
});

registerCommand({
    name: "autorespond",
    description: "Configure automatic replies",
    category: "Utility",
    slash: false,
    aliases: ["setautorespond"],
    execute: async (ctx) => {
        if (!requireGuild(ctx)) return;
        if (!canManageSettings(ctx)) {
            return ctx.reply({
                embeds: [permissionEmbed()]
            });
        }

        const action = (ctx.args[0] || "").toLowerCase();
        const config = getConfig(ctx.guild.id);

        config.utility ||= {};
        config.utility.autoRespond ||= {};

        if (action === "add") {
            const separator = ctx.args.indexOf("|");
            if (separator < 2 || separator >= ctx.args.length - 1) {
                return ctx.reply({
                    embeds: [
                        infoEmbed(
                            "Usage",
                            "`,autorespond add hello | Hello there!`"
                        )
                    ]
                });
            }

            const trigger = ctx.args
                .slice(1, separator)
                .join(" ")
                .toLowerCase();

            const response = ctx.args
                .slice(separator + 1)
                .join(" ");

            config.utility.autoRespond[trigger] = response;
        } else if (action === "remove") {
            const trigger = ctx.args.slice(1).join(" ").toLowerCase();

            if (!trigger) {
                return ctx.reply({
                    embeds: [
                        infoEmbed(
                            "Usage",
                            "`,autorespond remove hello`"
                        )
                    ]
                });
            }

            delete config.utility.autoRespond[trigger];
        } else {
            return ctx.reply({
                embeds: [
                    infoEmbed(
                        "AutoRespond",
                        "`,autorespond add hello | Hello there!`\n`,autorespond remove hello`"
                    )
                ]
            });
        }

        await saveDatabase();

        return ctx.reply({
            embeds: [
                successEmbed("AutoRespond settings updated.")
            ]
        });
    }
});

registerCommand({
    name: "utilitysettings",
    description: "View utility settings",
    category: "Utility",
    slash: false,
    aliases: ["utilityconfig"],
    execute: async (ctx) => {
        if (!requireGuild(ctx)) return;

        const config = getConfig(ctx.guild.id);
        const utility = config.utility || {};

        const embed = makeEmbed({
            title: "Utility Settings",
            color: COLORS.primary,
            fields: [
                {
                    name: "AutoReact Rules",
                    value: String(
                        Object.keys(utility.autoReact || {}).length
                    ),
                    inline: true
                },
                {
                    name: "AutoRespond Rules",
                    value: String(
                        Object.keys(utility.autoRespond || {}).length
                    ),
                    inline: true
                },
                {
                    name: "AFK Users",
                    value: String(
                        Object.keys(utility.afkUsers || {}).length
                    ),
                    inline: true
                }
            ]
        });

        return ctx.reply({ embeds: [embed] });
    }
});

/* Append Part 11 below this line. */

/* =========================================================
   PART 11/20 — AFK + AUTOREACT + AUTORESPOND
========================================================= */

async function handlePyrrUtilityMessage(message) {
    if (!message.guild || message.author.bot) return;

    const config = getConfig(message.guild.id);
    config.utility ||= {};
    config.utility.afkUsers ||= {};
    config.utility.autoReact ||= {};
    config.utility.autoRespond ||= {};

    const userId = message.author.id;
    const afkUsers = config.utility.afkUsers;

    // Remove AFK status when the user sends a message.
    if (afkUsers[userId]) {
        const oldAfk = afkUsers[userId];
        delete afkUsers[userId];

        await saveDatabase();

        await message.reply({
            embeds: [
                successEmbed(
                    `Welcome back, ${message.author}. Your AFK status has been removed.`
                )
            ]
        }).catch(() => {});

        if (oldAfk.reason) {
            await message.channel.send({
                content: `AFK reason cleared: ${oldAfk.reason}`
            }).catch(() => {});
        }
    }

    // Notify when someone mentions an AFK user.
    const mentionedAfk = message.mentions.users.filter(
        user => afkUsers[user.id] && user.id !== userId
    );

    for (const [id, user] of mentionedAfk) {
        const afk = afkUsers[id];
        const since = Math.floor((afk.timestamp || Date.now()) / 1000);

        await message.reply({
            embeds: [
                infoEmbed(
                    `${user.username} is AFK`,
                    `**Reason:** ${afk.reason || "No reason provided"}\n` +
                    `**Since:** <t:${since}:R>`
                )
            ]
        }).catch(() => {});
    }

    // AutoReact rules.
    const lowerMessage = message.content.toLowerCase();

    for (const [trigger, emoji] of Object.entries(
        config.utility.autoReact
    )) {
        if (!trigger || !lowerMessage.includes(trigger)) continue;

        await message.react(emoji).catch(() => {});
        break;
    }

    // AutoRespond rules.
    for (const [trigger, response] of Object.entries(
        config.utility.autoRespond
    )) {
        if (!trigger || !lowerMessage.includes(trigger)) continue;
        if (typeof response !== "string" || !response.length) continue;

        await message.reply({
            content: response.slice(0, 1900),
            allowedMentions: {
                parse: [],
                repliedUser: false
            }
        }).catch(() => {});

        break;
    }
}

client.on("messageCreate", async (message) => {
    try {
        await handlePyrrUtilityMessage(message);
    } catch (error) {
        console.error("[PYRR Utility Error]", error);
    }
});

registerCommand({
    name: "afk",
    description: "Set your AFK status",
    category: "Utility",
    aliases: ["away"],
    options: [
        {
            name: "reason",
            description: "Why you are AFK",
            type: "string",
            required: false
        }
    ],
    execute: async (ctx) => {
        if (!requireGuild(ctx)) return;

        const reason = (
            ctx.getString("reason") || ctx.args.join(" ")
        ).slice(0, 300);

        const config = getConfig(ctx.guild.id);
        config.utility ||= {};
        config.utility.afkUsers ||= {};

        config.utility.afkUsers[ctx.user.id] = {
            reason: reason || "No reason provided",
            timestamp: Date.now()
        };

        await saveDatabase();

        return ctx.reply({
            embeds: [
                successEmbed(
                    `AFK status enabled.\n**Reason:** ${reason || "No reason provided"}`
                )
            ]
        });
    }
});

registerCommand({
    name: "afklist",
    description: "List members currently marked AFK",
    category: "Utility",
    slash: false,
    aliases: ["awaylist"],
    execute: async (ctx) => {
        if (!requireGuild(ctx)) return;

        const config = getConfig(ctx.guild.id);
        const afkUsers = config.utility?.afkUsers || {};
        const entries = Object.entries(afkUsers);

        if (!entries.length) {
            return ctx.reply({
                embeds: [
                    infoEmbed("AFK List", "Nobody is currently marked AFK.")
                ]
            });
        }

        const lines = entries.slice(0, 20).map(([id, afk]) => {
            const since = Math.floor(
                (afk.timestamp || Date.now()) / 1000
            );

            return `<@${id}> — ${afk.reason || "No reason"} · <t:${since}:R>`;
        });

        return ctx.reply({
            embeds: [
                makeEmbed({
                    title: "AFK Members",
                    description: lines.join("\n"),
                    color: COLORS.primary,
                    footer: {
                        text: `${entries.length} AFK user(s)`
                    }
                })
            ]
        });
    }
});

registerCommand({
    name: "clearafk",
    description: "Clear your own AFK status",
    category: "Utility",
    slash: false,
    aliases: ["unafk"],
    execute: async (ctx) => {
        if (!requireGuild(ctx)) return;

        const config = getConfig(ctx.guild.id);
        config.utility ||= {};
        config.utility.afkUsers ||= {};

        if (!config.utility.afkUsers[ctx.user.id]) {
            return ctx.reply({
                embeds: [
                    infoEmbed("AFK", "You are not currently marked AFK.")
                ]
            });
        }

        delete config.utility.afkUsers[ctx.user.id];
        await saveDatabase();

        return ctx.reply({
            embeds: [
                successEmbed("Your AFK status has been cleared.")
            ]
        });
    }
});

/* Append Part 12 below this line. */

/* =========================================================
   PART 12/20 — VERIFICATION SYSTEM
========================================================= */

function getVerificationConfig(guildId) {
    const config = getConfig(guildId);

    config.verification ||= {
        enabled: false,
        channelId: null,
        verifiedRoleId: null,
        message: "Click the button below to verify.",
        logChannelId: null
    };

    return config.verification;
}

function buildVerificationEmbed(guild) {
    const settings = getVerificationConfig(guild.id);

    return makeEmbed({
        title: "PYRR Verification",
        description:
            `${settings.message}\n\n` +
            "Press **Verify** below to receive access to the server.",
        color: COLORS.primary,
        footer: {
            text: BOT_NAME
        }
    });
}

registerCommand({
    name: "verifysetup",
    description: "Configure the verification system",
    category: "Security",
    slash: false,
    aliases: ["setverify"],
    execute: async (ctx) => {
        if (!requireGuild(ctx)) return;

        if (!canManageSettings(ctx)) {
            return ctx.reply({
                embeds: [permissionEmbed()]
            });
        }

        const role = ctx.message.mentions.roles.first();
        const channel = ctx.message.mentions.channels.first();

        if (!role || !channel || !channel.isTextBased()) {
            return ctx.reply({
                embeds: [
                    infoEmbed(
                        "Verification Setup",
                        "Usage: `,verifysetup @VerifiedRole #verification-channel`"
                    )
                ]
            });
        }

        const settings = getVerificationConfig(ctx.guild.id);

        settings.enabled = true;
        settings.verifiedRoleId = role.id;
        settings.channelId = channel.id;

        await saveDatabase();

        return ctx.reply({
            embeds: [
                successEmbed(
                    `Verification enabled.\n**Role:** ${role}\n**Channel:** ${channel}`
                )
            ]
        });
    }
});

registerCommand({
    name: "verifypanel",
    description: "Post the verification panel",
    category: "Security",
    slash: false,
    aliases: ["verificationpanel"],
    execute: async (ctx) => {
        if (!requireGuild(ctx)) return;

        if (!canManageSettings(ctx)) {
            return ctx.reply({
                embeds: [permissionEmbed()]
            });
        }

        const settings = getVerificationConfig(ctx.guild.id);

        if (
            !settings.enabled ||
            !settings.verifiedRoleId ||
            !settings.channelId
        ) {
            return ctx.reply({
                embeds: [
                    errorEmbed(
                        "Run `,verifysetup @VerifiedRole #channel` first."
                    )
                ]
            });
        }

        const channel = ctx.guild.channels.cache.get(
            settings.channelId
        );

        if (!channel || !channel.isTextBased()) {
            return ctx.reply({
                embeds: [
                    errorEmbed("The verification channel is unavailable.")
                ]
            });
        }

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId("pyrr_verify_member")
                .setLabel("Verify")
                .setEmoji("✅")
                .setStyle(ButtonStyle.Success)
        );

        await channel.send({
            embeds: [buildVerificationEmbed(ctx.guild)],
            components: [row]
        });

        return ctx.reply({
            embeds: [
                successEmbed(`Verification panel posted in ${channel}.`)
            ]
        });
    }
});

registerCommand({
    name: "verifysettings",
    description: "View verification configuration",
    category: "Security",
    slash: false,
    aliases: ["verifyconfig"],
    execute: async (ctx) => {
        if (!requireGuild(ctx)) return;

        const settings = getVerificationConfig(ctx.guild.id);

        return ctx.reply({
            embeds: [
                makeEmbed({
                    title: "Verification Settings",
                    color: COLORS.primary,
                    fields: [
                        {
                            name: "Status",
                            value: settings.enabled ? "Enabled" : "Disabled",
                            inline: true
                        },
                        {
                            name: "Verified Role",
                            value: settings.verifiedRoleId
                                ? `<@&${settings.verifiedRoleId}>`
                                : "Not set",
                            inline: true
                        },
                        {
                            name: "Channel",
                            value: settings.channelId
                                ? `<#${settings.channelId}>`
                                : "Not set",
                            inline: true
                        }
                    ]
                })
            ]
        });
    }
});

client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton()) return;
    if (interaction.customId !== "pyrr_verify_member") return;

    if (!interaction.guild || !interaction.member) {
        return interaction.reply({
            content: "Use this button inside a server.",
            ephemeral: true
        }).catch(() => {});
    }

    const settings = getVerificationConfig(interaction.guild.id);

    if (!settings.enabled || !settings.verifiedRoleId) {
        return interaction.reply({
            content: "Verification is not configured.",
            ephemeral: true
        }).catch(() => {});
    }

    const role = interaction.guild.roles.cache.get(
        settings.verifiedRoleId
    );

    const member = await interaction.guild.members.fetch(
        interaction.user.id
    ).catch(() => null);

    if (!role || !member) {
        return interaction.reply({
            content: "The verification role or member could not be found.",
            ephemeral: true
        }).catch(() => {});
    }

    if (
        !interaction.guild.members.me?.permissions.has(
            PermissionsBitField.Flags.ManageRoles
        )
    ) {
        return interaction.reply({
            content: "I need the Manage Roles permission.",
            ephemeral: true
        }).catch(() => {});
    }

    if (
        role.position >= interaction.guild.members.me.roles.highest.position
    ) {
        return interaction.reply({
            content: "Move my highest role above the verification role.",
            ephemeral: true
        }).catch(() => {});
    }

    if (member.roles.cache.has(role.id)) {
        return interaction.reply({
            content: "You are already verified.",
            ephemeral: true
        }).catch(() => {});
    }

    try {
        await member.roles.add(role, "Completed server verification");

        return interaction.reply({
            content: "✅ Verification successful! Welcome!",
            ephemeral: true
        });
    } catch (error) {
        console.error("[PYRR Verification Error]", error);

        return interaction.reply({
            content: "Could not assign the role. Check my role hierarchy.",
            ephemeral: true
        }).catch(() => {});
    }
});

/* Append Part 13 below this line. */

/* =========================================================
   PART 13/20 — SERVER LOGS
========================================================= */

function getServerLogConfig(guildId) {
    const config = getConfig(guildId);

    config.serverLogs ||= {
        enabled: false,
        channelId: null
    };

    return config.serverLogs;
}

async function sendServerLog(guild, title, description) {
    if (!guild) return;

    const settings = getServerLogConfig(guild.id);
    if (!settings.enabled || !settings.channelId) return;

    const channel = guild.channels.cache.get(settings.channelId);

    if (!channel || !channel.isTextBased()) return;

    const embed = makeEmbed({
        title,
        description: String(description || "No details available.")
            .slice(0, 4000),
        color: COLORS.primary,
        timestamp: new Date(),
        footer: { text: BOT_NAME }
    });

    await channel.send({ embeds: [embed] }).catch(() => {});
}

registerCommand({
    name: "setserverlogs",
    description: "Set the server event log channel",
    category: "Moderation",
    slash: false,
    aliases: ["setlogs"],
    execute: async (ctx) => {
        if (!requireGuild(ctx)) return;

        if (!canManageSettings(ctx)) {
            return ctx.reply({
                embeds: [permissionEmbed()]
            });
        }

        const channel = ctx.message.mentions.channels.first();

        if (!channel || !channel.isTextBased()) {
            return ctx.reply({
                embeds: [
                    infoEmbed(
                        "Usage",
                        "`,setserverlogs #log-channel`"
                    )
                ]
            });
        }

        const settings = getServerLogConfig(ctx.guild.id);

        settings.enabled = true;
        settings.channelId = channel.id;

        await saveDatabase();

        return ctx.reply({
            embeds: [
                successEmbed(`Server logs enabled in ${channel}.`)
            ]
        });
    }
});

registerCommand({
    name: "serverlogstoggle",
    description: "Enable or disable server event logs",
    category: "Moderation",
    slash: false,
    aliases: ["logs-toggle"],
    execute: async (ctx) => {
        if (!requireGuild(ctx)) return;

        if (!canManageSettings(ctx)) {
            return ctx.reply({
                embeds: [permissionEmbed()]
            });
        }

        const value = (ctx.args[0] || "").toLowerCase();

        if (!["on", "off"].includes(value)) {
            return ctx.reply({
                embeds: [
                    infoEmbed(
                        "Usage",
                        "`,serverlogstoggle on` or `,serverlogstoggle off`"
                    )
                ]
            });
        }

        const settings = getServerLogConfig(ctx.guild.id);
        settings.enabled = value === "on";

        await saveDatabase();

        return ctx.reply({
            embeds: [
                successEmbed(
                    `Server logs ${settings.enabled ? "enabled" : "disabled"}.`
                )
            ]
        });
    }
});

registerCommand({
    name: "serverlogsettings",
    description: "View server log settings",
    category: "Moderation",
    slash: false,
    aliases: ["logsettings"],
    execute: async (ctx) => {
        if (!requireGuild(ctx)) return;

        const settings = getServerLogConfig(ctx.guild.id);

        return ctx.reply({
            embeds: [
                makeEmbed({
                    title: "Server Log Settings",
                    color: COLORS.primary,
                    fields: [
                        {
                            name: "Status",
                            value: settings.enabled ? "Enabled" : "Disabled",
                            inline: true
                        },
                        {
                            name: "Log Channel",
                            value: settings.channelId
                                ? `<#${settings.channelId}>`
                                : "Not configured",
                            inline: true
                        }
                    ]
                })
            ]
        });
    }
});

// Member join events.
client.on("guildMemberAdd", async (member) => {
    await sendServerLog(
        member.guild,
        "Member Joined",
        `**Member:** ${member.user.tag}\n` +
        `**ID:** ${member.id}\n` +
        `**Account Created:** <t:${Math.floor(
            member.user.createdTimestamp / 1000
        )}:R>`
    );
});

// Member leave events.
client.on("guildMemberRemove", async (member) => {
    await sendServerLog(
        member.guild,
        "Member Left",
        `**Member:** ${member.user.tag}\n**ID:** ${member.id}`
    );
});

// Channel creation events.
client.on("channelCreate", async (channel) => {
    if (!channel.guild) return;

    await sendServerLog(
        channel.guild,
        "Channel Created",
        `**Channel:** ${channel.name}\n**ID:** ${channel.id}`
    );
});

// Channel deletion events.
client.on("channelDelete", async (channel) => {
    if (!channel.guild) return;

    await sendServerLog(
        channel.guild,
        "Channel Deleted",
        `**Channel:** ${channel.name}\n**ID:** ${channel.id}`
    );
});

// Role creation events.
client.on("roleCreate", async (role) => {
    await sendServerLog(
        role.guild,
        "Role Created",
        `**Role:** ${role.name}\n**ID:** ${role.id}`
    );
});

// Role deletion events.
client.on("roleDelete", async (role) => {
    await sendServerLog(
        role.guild,
        "Role Deleted",
        `**Role:** ${role.name}\n**ID:** ${role.id}`
    );
});

// Role update events.
client.on("roleUpdate", async (oldRole, newRole) => {
    const changes = [];

    if (oldRole.name !== newRole.name) {
        changes.push(`Name: ${oldRole.name} → ${newRole.name}`);
    }

    if (oldRole.color !== newRole.color) {
        changes.push("Role color changed.");
    }

    if (oldRole.permissions.bitfield !== newRole.permissions.bitfield) {
        changes.push("Role permissions changed.");
    }

    if (!changes.length) return;

    await sendServerLog(
        newRole.guild,
        "Role Updated",
        `**Role:** ${newRole}\n${changes.join("\n")}`
    );
});

// Message deletion events.
client.on("messageDelete", async (message) => {
    if (!message.guild || message.author?.bot) return;

    await sendServerLog(
        message.guild,
        "Message Deleted",
        `**Author:** ${message.author?.tag || "Unknown"}\n` +
        `**Channel:** ${message.channel}\n` +
        `**Content:** ${(message.content || "Unavailable").slice(0, 1500)}`
    );
});

// Message edit events.
client.on("messageUpdate", async (oldMessage, newMessage) => {
    if (!newMessage.guild || newMessage.author?.bot) return;
    if (oldMessage.content === newMessage.content) return;

    await sendServerLog(
        newMessage.guild,
        "Message Edited",
        `**Author:** ${newMessage.author?.tag || "Unknown"}\n` +
        `**Channel:** ${newMessage.channel}\n` +
        `**Before:** ${(oldMessage.content || "Unavailable").slice(0, 700)}\n` +
        `**After:** ${(newMessage.content || "Unavailable").slice(0, 700)}`
    );
});

/* Append Part 14 below this line. */

/* =========================================================
   PART 14/20 — LEVEL ROLES
========================================================= */

function getLevelRoleConfig(guildId) {
    const config = getConfig(guildId);
    config.leveling ||= {
        enabled: true,
        xpMin: 10,
        xpMax: 20,
        cooldown: 60000,
        users: {}
    };

    config.leveling.levelRoles ||= {};

    return config.leveling;
}

async function syncLevelRoles(member, level) {
    if (!member || !member.guild) return;

    const settings = getLevelRoleConfig(member.guild.id);
    const rewards = settings.levelRoles || {};

    const rewardEntries = Object.entries(rewards)
        .map(([levelValue, roleId]) => ({
            level: Number(levelValue),
            roleId
        }))
        .filter(item =>
            Number.isInteger(item.level) &&
            item.level > 0 &&
            typeof item.roleId === "string"
        )
        .sort((a, b) => a.level - b.level);

    if (!rewardEntries.length) return;

    const eligible = rewardEntries.filter(
        item => level >= item.level
    );

    const highestReward = eligible.length
        ? eligible[eligible.length - 1]
        : null;

    if (!highestReward) return;

    const role = member.guild.roles.cache.get(
        highestReward.roleId
    );

    if (!role) return;

    const botMember = member.guild.members.me;
    if (!botMember) return;

    if (
        !botMember.permissions.has(
            PermissionsBitField.Flags.ManageRoles
        ) ||
        role.position >= botMember.roles.highest.position
    ) {
        return;
    }

    if (member.roles.cache.has(role.id)) return;

    await member.roles.add(
        role,
        `Reached level ${level}`
    ).catch(error => {
        console.error("[PYRR Level Role Error]", error);
    });
}

registerCommand({
    name: "levelroleadd",
    description: "Set a role reward for a level",
    category: "Leveling",
    slash: false,
    aliases: ["setlevelrole"],
    execute: async (ctx) => {
        if (!requireGuild(ctx)) return;

        if (!canManageSettings(ctx)) {
            return ctx.reply({
                embeds: [permissionEmbed()]
            });
        }

        const level = Number(ctx.args[0]);
        const role = ctx.message.mentions.roles.first();

        if (
            !Number.isInteger(level) ||
            level < 1 ||
            level > 10000 ||
            !role
        ) {
            return ctx.reply({
                embeds: [
                    infoEmbed(
                        "Usage",
                        "`,levelroleadd 5 @Role`"
                    )
                ]
            });
        }

        const settings = getLevelRoleConfig(ctx.guild.id);
        settings.levelRoles[String(level)] = role.id;

        await saveDatabase();

        return ctx.reply({
            embeds: [
                successEmbed(
                    `${role} is now a reward for reaching level ${level}.`
                )
            ]
        });
    }
});

registerCommand({
    name: "levelroleremove",
    description: "Remove a level role reward",
    category: "Leveling",
    slash: false,
    aliases: ["removelevelrole"],
    execute: async (ctx) => {
        if (!requireGuild(ctx)) return;

        if (!canManageSettings(ctx)) {
            return ctx.reply({
                embeds: [permissionEmbed()]
            });
        }

        const level = Number(ctx.args[0]);

        if (!Number.isInteger(level) || level < 1) {
            return ctx.reply({
                embeds: [
                    infoEmbed(
                        "Usage",
                        "`,levelroleremove 5`"
                    )
                ]
            });
        }

        const settings = getLevelRoleConfig(ctx.guild.id);

        if (!settings.levelRoles[String(level)]) {
            return ctx.reply({
                embeds: [
                    errorEmbed("There is no role reward for that level.")
                ]
            });
        }

        delete settings.levelRoles[String(level)];
        await saveDatabase();

        return ctx.reply({
            embeds: [
                successEmbed(`Removed the reward for level ${level}.`)
            ]
        });
    }
});

registerCommand({
    name: "levelroles",
    description: "Show configured level role rewards",
    category: "Leveling",
    slash: false,
    aliases: ["levelrolelist"],
    execute: async (ctx) => {
        if (!requireGuild(ctx)) return;

        const settings = getLevelRoleConfig(ctx.guild.id);
        const entries = Object.entries(settings.levelRoles || {})
            .sort((a, b) => Number(a[0]) - Number(b[0]));

        if (!entries.length) {
            return ctx.reply({
                embeds: [
                    infoEmbed(
                        "Level Rewards",
                        "No level role rewards are configured."
                    )
                ]
            });
        }

        const lines = entries.slice(0, 25).map(
            ([level, roleId]) => `**Level ${level}:** <@&${roleId}>`
        );

        return ctx.reply({
            embeds: [
                makeEmbed({
                    title: "Level Role Rewards",
                    description: lines.join("\n"),
                    color: COLORS.primary
                })
            ]
        });
    }
});

/* Append Part 15 below this line. */

/* =========================================================
   PART 15/20 — JAIL SYSTEM
========================================================= */

function getJailConfig(guildId) {
    const config = getConfig(guildId);

    config.jail ||= {
        enabled: false,
        roleId: null,
        logChannelId: null,
        members: {}
    };

    config.jail.members ||= {};

    return config.jail;
}

async function releaseJailedMember(guild, userId, reason = "Jail time completed") {
    const settings = getJailConfig(guild.id);
    const record = settings.members[userId];

    if (!record) return false;

    const member = await guild.members.fetch(userId).catch(() => null);
    const jailRole = settings.roleId
        ? guild.roles.cache.get(settings.roleId)
        : null;

    if (member && jailRole && member.roles.cache.has(jailRole.id)) {
        await member.roles.remove(jailRole, reason).catch(error => {
            console.error("[PYRR Jail Release Error]", error);
        });
    }

    delete settings.members[userId];
    await saveDatabase();

    await sendServerLog(
        guild,
        "Member Released",
        `**Member:** <@${userId}>\n**Reason:** ${reason}`
    );

    return true;
}

registerCommand({
    name: "jailsetup",
    description: "Configure the jail role",
    category: "Moderation",
    slash: false,
    aliases: ["setjail"],
    execute: async (ctx) => {
        if (!requireGuild(ctx)) return;

        if (!canManageSettings(ctx)) {
            return ctx.reply({
                embeds: [permissionEmbed()]
            });
        }

        const role = ctx.message.mentions.roles.first();

        if (!role) {
            return ctx.reply({
                embeds: [
                    infoEmbed("Usage", "`,jailsetup @JailRole`")
                ]
            });
        }

        const botMember = ctx.guild.members.me;

        if (
            !botMember ||
            !botMember.permissions.has(
                PermissionsBitField.Flags.ManageRoles
            ) ||
            role.position >= botMember.roles.highest.position
        ) {
            return ctx.reply({
                embeds: [
                    errorEmbed(
                        "I need Manage Roles, and my highest role must be above the jail role."
                    )
                ]
            });
        }

        const settings = getJailConfig(ctx.guild.id);
        settings.enabled = true;
        settings.roleId = role.id;

        await saveDatabase();

        return ctx.reply({
            embeds: [
                successEmbed(`Jail role configured: ${role}`)
            ]
        });
    }
});

registerCommand({
    name: "jail",
    description: "Place a member in jail",
    category: "Moderation",
    slash: false,
    aliases: ["jaill"],
    execute: async (ctx) => {
        if (!requireGuild(ctx)) return;
        if (!requireModerator(ctx)) return;

        const target = ctx.message.mentions.members.first();
        const durationInput = ctx.args[1];
        const reason = ctx.args.slice(2).join(" ") || "No reason provided";

        if (!target || !durationInput) {
            return ctx.reply({
                embeds: [
                    infoEmbed(
                        "Usage",
                        "`,jail @member 10m reason`\n" +
                        "Units: `s`, `m`, `h`, `d`"
                    )
                ]
            });
        }

        if (!canModerateTarget(ctx, target)) return;

        const settings = getJailConfig(ctx.guild.id);

        if (!settings.enabled || !settings.roleId) {
            return ctx.reply({
                embeds: [
                    errorEmbed("Run `,jailsetup @JailRole` first.")
                ]
            });
        }

        const role = ctx.guild.roles.cache.get(settings.roleId);
        const botMember = ctx.guild.members.me;
        const duration = parseDuration(durationInput);

        if (!role || !botMember) {
            return ctx.reply({
                embeds: [errorEmbed("Jail role or bot member not found.")]
            });
        }

        if (
            !botMember.permissions.has(
                PermissionsBitField.Flags.ManageRoles
            ) ||
            role.position >= botMember.roles.highest.position
        ) {
            return ctx.reply({
                embeds: [
                    errorEmbed("Check my Manage Roles permission and role hierarchy.")
                ]
            });
        }

        if (!duration || duration < 1000 || duration > 28 * 24 * 60 * 60 * 1000) {
            return ctx.reply({
                embeds: [
                    errorEmbed("Duration must be between 1 second and 28 days.")
                ]
            });
        }

        try {
            await target.roles.add(role, `Jail: ${reason}`);

            settings.members[target.id] = {
                moderatorId: ctx.user.id,
                reason,
                startedAt: Date.now(),
                expiresAt: Date.now() + duration
            };

            await saveDatabase();

            await sendServerLog(
                ctx.guild,
                "Member Jailed",
                `**Member:** ${target.user.tag}\n` +
                `**Moderator:** ${ctx.user.tag}\n` +
                `**Duration:** ${formatDuration(duration)}\n` +
                `**Reason:** ${reason}`
            );

            return ctx.reply({
                embeds: [
                    successEmbed(
                        `${target.user.tag} has been jailed for ${formatDuration(duration)}.`
                    )
                ]
            });
        } catch (error) {
            console.error("[PYRR Jail Error]", error);

            return ctx.reply({
                embeds: [
                    errorEmbed("Could not assign the jail role.")
                ]
            });
        }
    }
});

registerCommand({
    name: "unjail",
    description: "Release a jailed member",
    category: "Moderation",
    slash: false,
    aliases: ["release"],
    execute: async (ctx) => {
        if (!requireGuild(ctx)) return;
        if (!requireModerator(ctx)) return;

        const target = ctx.message.mentions.members.first();

        if (!target) {
            return ctx.reply({
                embeds: [
                    infoEmbed("Usage", "`,unjail @member`")
                ]
            });
        }

        const settings = getJailConfig(ctx.guild.id);

        if (!settings.members[target.id]) {
            return ctx.reply({
                embeds: [
                    errorEmbed("That member is not recorded as jailed.")
                ]
            });
        }

        const released = await releaseJailedMember(
            ctx.guild,
            target.id,
            `Released by ${ctx.user.tag}`
        );

        return ctx.reply({
            embeds: [
                released
                    ? successEmbed(`${target.user.tag} has been released.`)
                    : errorEmbed("Could not release that member.")
            ]
        });
    }
});

registerCommand({
    name: "jaillist",
    description: "List jailed members",
    category: "Moderation",
    slash: false,
    aliases: ["jailed"],
    execute: async (ctx) => {
        if (!requireGuild(ctx)) return;

        const settings = getJailConfig(ctx.guild.id);
        const entries = Object.entries(settings.members);

        if (!entries.length) {
            return ctx.reply({
                embeds: [
                    infoEmbed("Jail List", "No members are recorded as jailed.")
                ]
            });
        }

        const lines = entries.slice(0, 20).map(([id, item]) => {
            const expiry = Math.floor(item.expiresAt / 1000);

            return `<@${id}> — <t:${expiry}:R>\nReason: ${item.reason}`;
        });

        return ctx.reply({
            embeds: [
                makeEmbed({
                    title: "Jailed Members",
                    description: lines.join("\n\n"),
                    color: COLORS.primary
                })
            ]
        });
    }
});

// Periodic jail expiry check.
const pyrrJailExpiryTimer = setInterval(async () => {
    for (const [guildId, guildData] of Object.entries(database.guilds || {})) {
        const settings = guildData.jail;
        if (!settings?.members) continue;

        const guild = client.guilds.cache.get(guildId);
        if (!guild) continue;

        for (const [userId, record] of Object.entries(settings.members)) {
            if (record.expiresAt > Date.now()) continue;

            await releaseJailedMember(
                guild,
                userId,
                "Jail duration expired"
            );
        }
    }
}, 30000);

pyrrJailExpiryTimer.unref?.();

/* Append Part 16 below this line. */

/* =========================================================
   PART 16/20 — LEVELING INTEGRATION
========================================================= */

// Grant the highest eligible level reward when a member levels up.
async function handlePyrrLevelReward(member, level) {
    if (!member || !member.guild) return;

    const settings = getLevelRoleConfig(member.guild.id);
    const rewards = Object.entries(settings.levelRoles || {})
        .map(([levelText, roleId]) => ({
            level: Number(levelText),
            roleId
        }))
        .filter(item =>
            Number.isInteger(item.level) &&
            item.level > 0 &&
            item.level <= level &&
            typeof item.roleId === "string"
        )
        .sort((a, b) => b.level - a.level);

    if (!rewards.length) return;

    const reward = rewards[0];
    const role = member.guild.roles.cache.get(reward.roleId);
    const botMember = member.guild.members.me;

    if (!role || !botMember) return;

    if (
        !botMember.permissions.has(
            PermissionsBitField.Flags.ManageRoles
        ) ||
        role.position >= botMember.roles.highest.position
    ) {
        return;
    }

    if (member.roles.cache.has(role.id)) return;

    try {
        await member.roles.add(
            role,
            `Reached level ${level}`
        );

        await sendServerLog(
            member.guild,
            "Level Reward Granted",
            `**Member:** ${member.user.tag}\n` +
            `**Level:** ${level}\n` +
            `**Reward:** ${role.name}`
        );
    } catch (error) {
        console.error("[PYRR Level Reward Error]", error);
    }
}

// Optional command to enable or disable leveling.
registerCommand({
    name: "levelingtoggle",
    description: "Enable or disable the leveling system",
    category: "Leveling",
    slash: false,
    aliases: ["leveltoggle"],
    execute: async (ctx) => {
        if (!requireGuild(ctx)) return;

        if (!canManageSettings(ctx)) {
            return ctx.reply({
                embeds: [permissionEmbed()]
            });
        }

        const value = (ctx.args[0] || "").toLowerCase();

        if (!["on", "off"].includes(value)) {
            return ctx.reply({
                embeds: [
                    infoEmbed(
                        "Usage",
                        "`,levelingtoggle on` or `,levelingtoggle off`"
                    )
                ]
            });
        }

        const settings = getLevelingConfig(ctx.guild.id);
        settings.enabled = value === "on";

        await saveDatabase();

        return ctx.reply({
            embeds: [
                successEmbed(
                    `Leveling ${settings.enabled ? "enabled" : "disabled"}.`
                )
            ]
        });
    }
});

// Show a member's current XP and level.
registerCommand({
    name: "levelinfo",
    description: "View leveling information for a member",
    category: "Leveling",
    slash: false,
    aliases: ["xpinfo"],
    execute: async (ctx) => {
        if (!requireGuild(ctx)) return;

        const target = ctx.message.mentions.members.first() || ctx.member;

        if (!target) {
            return ctx.reply({
                embeds: [
                    errorEmbed("Could not find that member.")
                ]
            });
        }

        const settings = getLevelingConfig(ctx.guild.id);
        const userData = getLevelingUser(
            ctx.guild.id,
            target.id
        );

        const level = calculateLevel(userData.xp || 0);
        const nextLevelXp = xpForLevel(level + 1);
        const currentLevelXp = xpForLevel(level);
        const progress = Math.max(
            0,
            (userData.xp || 0) - currentLevelXp
        );
        const required = Math.max(
            1,
            nextLevelXp - currentLevelXp
        );

        return ctx.reply({
            embeds: [
                makeEmbed({
                    title: `${target.user.username}'s Level`,
                    description:
                        `**Level:** ${level}\n` +
                        `**Total XP:** ${userData.xp || 0}\n` +
                        `**Progress:** ${progress}/${required} XP`,
                    color: COLORS.primary,
                    thumbnail: target.user.displayAvatarURL()
                })
            ]
        });
    }
});

// List all configured level rewards.
registerCommand({
    name: "levelrewardinfo",
    description: "View configured level rewards",
    category: "Leveling",
    slash: false,
    aliases: ["levelrewards"],
    execute: async (ctx) => {
        if (!requireGuild(ctx)) return;

        const settings = getLevelRoleConfig(ctx.guild.id);
        const entries = Object.entries(settings.levelRoles || {})
            .sort((a, b) => Number(a[0]) - Number(b[0]));

        if (!entries.length) {
            return ctx.reply({
                embeds: [
                    infoEmbed(
                        "Level Rewards",
                        "No level rewards are configured yet."
                    )
                ]
            });
        }

        return ctx.reply({
            embeds: [
                makeEmbed({
                    title: "PYRR Level Rewards",
                    description: entries.slice(0, 25).map(
                        ([level, roleId]) =>
                            `**Level ${level}:** <@&${roleId}>`
                    ).join("\n"),
                    color: COLORS.primary
                })
            ]
        });
    }
});

/* Append Part 17 below this line. */

/* =========================================================
   PART 17/20 — GIVEAWAY SYSTEM
========================================================= */

const pyrrGiveaways = new Map();

function parseGiveawayDuration(input) {
    if (!input) return null;

    const match = String(input).match(
        /^(\d+)(s|m|h|d)$/i
    );

    if (!match) return null;

    const amount = Number(match[1]);
    const unit = match[2].toLowerCase();

    const multiplier = {
        s: 1000,
        m: 60 * 1000,
        h: 60 * 60 * 1000,
        d: 24 * 60 * 60 * 1000
    }[unit];

    const duration = amount * multiplier;

    if (
        !Number.isFinite(duration) ||
        duration < 10000 ||
        duration > 30 * 24 * 60 * 60 * 1000
    ) {
        return null;
    }

    return duration;
}

function getGiveawayEntries(message) {
    return message.reactions.cache
        .filter(reaction => reaction.emoji.name === "🎉")
        .first();
}

async function finishGiveaway(giveaway) {
    if (giveaway.ended) return;
    giveaway.ended = true;

    const channel = client.channels.cache.get(
        giveaway.channelId
    );

    if (!channel || !channel.isTextBased()) return;

    const message = await channel.messages.fetch(
        giveaway.messageId
    ).catch(() => null);

    if (!message) return;

    const reaction = getGiveawayEntries(message);

    let entrants = [];

    if (reaction) {
        const users = await reaction.users.fetch().catch(() => null);

        if (users) {
            entrants = [...users.values()].filter(
                user => !user.bot
            );
        }
    }

    const embed = makeEmbed({
        title: "🎉 Giveaway Ended",
        description:
            `**Prize:** ${giveaway.prize}\n` +
            `**Hosted by:** <@${giveaway.hostId}>`,
        color: COLORS.primary,
        timestamp: new Date()
    });

    if (!entrants.length) {
        embed.addFields({
            name: "Result",
            value: "No valid entries. No winner was selected."
        });
    } else {
        const winner = entrants[
            Math.floor(Math.random() * entrants.length)
        ];

        embed.addFields({
            name: "Winner",
            value: `${winner}`
        });

        await channel.send({
            content: `🎉 Congratulations ${winner}! You won **${giveaway.prize}**!`,
            allowedMentions: {
                users: [winner.id]
            }
        }).catch(() => {});
    }

    await message.edit({
        embeds: [embed]
    }).catch(() => {});

    pyrrGiveaways.delete(giveaway.messageId);
}

registerCommand({
    name: "giveaway",
    description: "Start a giveaway",
    category: "Utility",
    slash: false,
    aliases: ["gstart"],
    execute: async (ctx) => {
        if (!requireGuild(ctx)) return;

        if (!canManageSettings(ctx)) {
            return ctx.reply({
                embeds: [permissionEmbed()]
            });
        }

        const duration = parseGiveawayDuration(ctx.args[0]);
        const prize = ctx.args.slice(1).join(" ");

        if (!duration || !prize) {
            return ctx.reply({
                embeds: [
                    infoEmbed(
                        "Giveaway Usage",
                        "`,giveaway 10m Nitro Gift`\n" +
                        "Duration: 10 seconds to 30 days."
                    )
                ]
            });
        }

        const endAt = Date.now() + duration;

        const embed = makeEmbed({
            title: "🎉 Giveaway",
            description:
                `**Prize:** ${prize}\n` +
                `**Hosted by:** ${ctx.user}\n` +
                `**Ends:** <t:${Math.floor(endAt / 1000)}:R>\n\n` +
                "React with 🎉 to enter!",
            color: COLORS.primary,
            timestamp: new Date()
        });

        const message = await ctx.channel.send({
            embeds: [embed]
        });

        await message.react("🎉").catch(() => {});

        const giveaway = {
            messageId: message.id,
            channelId: message.channel.id,
            guildId: ctx.guild.id,
            hostId: ctx.user.id,
            prize,
            endAt,
            ended: false
        };

        pyrrGiveaways.set(message.id, giveaway);

        const timer = setTimeout(
            () => finishGiveaway(giveaway),
            duration
        );

        timer.unref?.();

        return ctx.reply({
            embeds: [
                successEmbed(
                    `Giveaway started in ${ctx.channel}.\nMessage ID: ${message.id}`
                )
            ]
        });
    }
});

registerCommand({
    name: "giveawayend",
    description: "End a giveaway early",
    category: "Utility",
    slash: false,
    aliases: ["gend"],
    execute: async (ctx) => {
        if (!requireGuild(ctx)) return;

        if (!canManageSettings(ctx)) {
            return ctx.reply({
                embeds: [permissionEmbed()]
            });
        }

        const messageId = ctx.args[0];

        if (!messageId) {
            return ctx.reply({
                embeds: [
                    infoEmbed(
                        "Usage",
                        "`,giveawayend MESSAGE_ID`"
                    )
                ]
            });
        }

        const giveaway = pyrrGiveaways.get(messageId);

        if (!giveaway || giveaway.guildId !== ctx.guild.id) {
            return ctx.reply({
                embeds: [
                    errorEmbed(
                        "Giveaway not found. It may have ended or the bot may have restarted."
                    )
                ]
            });
        }

        await finishGiveaway(giveaway);

        return ctx.reply({
            embeds: [
                successEmbed("Giveaway ended.")
            ]
        });
    }
});

registerCommand({
    name: "giveawayreroll",
    description: "Choose a new giveaway winner",
    category: "Utility",
    slash: false,
    aliases: ["greroll"],
    execute: async (ctx) => {
        if (!requireGuild(ctx)) return;

        if (!canManageSettings(ctx)) {
            return ctx.reply({
                embeds: [permissionEmbed()]
            });
        }

        const messageId = ctx.args[0];

        if (!messageId) {
            return ctx.reply({
                embeds: [
                    infoEmbed(
                        "Usage",
                        "`,giveawayreroll MESSAGE_ID`"
                    )
                ]
            });
        }

        const channel = ctx.channel;
        const message = await channel.messages.fetch(
            messageId
        ).catch(() => null);

        if (!message) {
            return ctx.reply({
                embeds: [
                    errorEmbed("Could not find that message in this channel.")
                ]
            });
        }

        const reaction = getGiveawayEntries(message);
        const users = reaction
            ? await reaction.users.fetch().catch(() => null)
            : null;

        const entrants = users
            ? [...users.values()].filter(user => !user.bot)
            : [];

        if (!entrants.length) {
            return ctx.reply({
                embeds: [
                    errorEmbed("There are no eligible entrants to reroll.")
                ]
            });
        }

        const winner = entrants[
            Math.floor(Math.random() * entrants.length)
        ];

        return ctx.reply({
            content: `🎉 New winner: ${winner}`,
            allowedMentions: {
                users: [winner.id]
            }
        });
    }
});

/* Append Part 18 below this line. */

/* =========================================================
   PART 18/20 — EXTRA UTILITY COMMANDS
========================================================= */

registerCommand({
    name: "poll",
    description: "Create a simple yes/no poll",
    category: "Utility",
    slash: false,
    aliases: ["vote"],
    execute: async (ctx) => {
        if (!requireGuild(ctx)) return;

        const question = ctx.args.join(" ");

        if (!question || question.length < 3) {
            return ctx.reply({
                embeds: [
                    infoEmbed(
                        "Poll Usage",
                        "`,poll Should we host an event tonight?`"
                    )
                ]
            });
        }

        const embed = makeEmbed({
            title: "📊 Community Poll",
            description: question.slice(0, 3500),
            color: COLORS.primary,
            footer: {
                text: `Poll by ${ctx.user.tag}`
            },
            timestamp: new Date()
        });

        const message = await ctx.channel.send({
            embeds: [embed]
        });

        await message.react("👍").catch(() => {});
        await message.react("👎").catch(() => {});

        return ctx.reply({
            embeds: [
                successEmbed("Poll created successfully.")
            ]
        });
    }
});

registerCommand({
    name: "choose",
    description: "Choose randomly from your options",
    category: "Utility",
    slash: false,
    aliases: ["pick"],
    execute: async (ctx) => {
        const input = ctx.args.join(" ");
        const options = input
            .split("|")
            .map(item => item.trim())
            .filter(Boolean);

        if (options.length < 2) {
            return ctx.reply({
                embeds: [
                    infoEmbed(
                        "Choose Usage",
                        "`,choose Pizza | Burger | Chicken`"
                    )
                ]
            });
        }

        const choice = options[
            Math.floor(Math.random() * options.length)
        ];

        return ctx.reply({
            embeds: [
                makeEmbed({
                    title: "🎯 PYRR Choice",
                    description: `I choose: **${choice}**`,
                    color: COLORS.primary
                })
            ]
        });
    }
});

registerCommand({
    name: "coinflip",
    description: "Flip a virtual coin",
    category: "Utility",
    aliases: ["coin"],
    execute: async (ctx) => {
        const result = Math.random() < 0.5 ? "Heads" : "Tails";

        return ctx.reply({
            embeds: [
                makeEmbed({
                    title: "🪙 Coin Flip",
                    description: `Result: **${result}**`,
                    color: COLORS.primary
                })
            ]
        });
    }
});

registerCommand({
    name: "roll",
    description: "Roll a virtual dice",
    category: "Utility",
    aliases: ["dice"],
    options: [
        {
            name: "sides",
            description: "Number of dice sides",
            type: "integer",
            required: false,
            minValue: 2,
            maxValue: 100
        }
    ],
    execute: async (ctx) => {
        const sides = Number(ctx.getInteger("sides") || ctx.args[0] || 6);

        if (!Number.isInteger(sides) || sides < 2 || sides > 100) {
            return ctx.reply({
                embeds: [
                    errorEmbed("Dice sides must be between 2 and 100.")
                ]
            });
        }

        const result = Math.floor(Math.random() * sides) + 1;

        return ctx.reply({
            embeds: [
                makeEmbed({
                    title: "🎲 Dice Roll",
                    description: `You rolled **${result}** on a ${sides}-sided die.`,
                    color: COLORS.primary
                })
            ]
        });
    }
});

registerCommand({
    name: "8ball",
    description: "Ask the magic 8-ball a question",
    category: "Fun",
    slash: false,
    aliases: ["magic8ball"],
    execute: async (ctx) => {
        const question = ctx.args.join(" ");

        if (!question) {
            return ctx.reply({
                embeds: [
                    infoEmbed(
                        "8Ball Usage",
                        "`,8ball Will our server reach 1,000 members?`"
                    )
                ]
            });
        }

        const answers = [
            "Yes, definitely.",
            "It looks likely.",
            "The outlook is good.",
            "Ask again later.",
            "Cannot tell right now.",
            "Probably not.",
            "The outlook is uncertain.",
            "No, not this time."
        ];

        const answer = answers[
            Math.floor(Math.random() * answers.length)
        ];

        return ctx.reply({
            embeds: [
                makeEmbed({
                    title: "🔮 Magic 8-Ball",
                    description:
                        `**Question:** ${question.slice(0, 800)}\n\n` +
                        `**Answer:** ${answer}`,
                    color: COLORS.primary
                })
            ]
        });
    }
});

registerCommand({
    name: "servericon",
    description: "Show the server icon",
    category: "Information",
    aliases: ["guildicon"],
    execute: async (ctx) => {
        if (!requireGuild(ctx)) return;

        const iconURL = ctx.guild.iconURL({
            size: 1024,
            extension: "png"
        });

        if (!iconURL) {
            return ctx.reply({
                embeds: [
                    infoEmbed(
                        "Server Icon",
                        "This server does not have an icon."
                    )
                ]
            });
        }

        return ctx.reply({
            embeds: [
                makeEmbed({
                    title: `${ctx.guild.name} — Icon`,
                    color: COLORS.primary,
                    image: iconURL
                })
            ]
        });
    }
});

registerCommand({
    name: "membercount",
    description: "Show the server member count",
    category: "Information",
    aliases: ["members"],
    execute: async (ctx) => {
        if (!requireGuild(ctx)) return;

        return ctx.reply({
            embeds: [
                makeEmbed({
                    title: "Server Members",
                    description:
                        `**Total Members:** ${ctx.guild.memberCount}`,
                    color: COLORS.primary
                })
            ]
        });
    }
});

registerCommand({
    name: "support",
    description: "Get the PYRR support server link",
    category: "Information",
    aliases: ["supportserver"],
    execute: async (ctx) => {
        return ctx.reply({
            embeds: [
                makeEmbed({
                    title: "PYRR OFFICIAL Support",
                    description:
                        `[Join the support server](${SUPPORT_SERVER})`,
                    color: COLORS.primary,
                    footer: {
                        text: `Created by ${CREATOR}`
                    }
                })
            ]
        });
    }
});

/* Append Part 19 below this line. */

/* =========================================================
   PART 19/20 — COMMAND DISPATCHER
========================================================= */

function getGuildPrefix(guildId) {
    if (!guildId) return DEFAULT_PREFIX;

    const config = getConfig(guildId);
    return config.prefix || DEFAULT_PREFIX;
}

function splitCommandInput(content, prefix) {
    const body = content.slice(prefix.length).trim();

    if (!body) {
        return {
            name: "",
            args: []
        };
    }

    const parts = body.match(/"[^"]*"|'[^']*'|\S+/g) || [];

    const cleaned = parts.map(part =>
        part.replace(/^["']|["']$/g, "")
    );

    return {
        name: (cleaned.shift() || "").toLowerCase(),
        args: cleaned
    };
}

client.on("messageCreate", async (message) => {
    try {
        if (message.author.bot) return;
        if (!message.guild) return;

        const prefix = getGuildPrefix(message.guild.id);

        if (!message.content.startsWith(prefix)) return;

        const parsed = splitCommandInput(message.content, prefix);

        if (!parsed.name) return;

        const command = commands.get(parsed.name);

        if (!command) return;

        const ctx = makeContext(
            {
                message,
                guild: message.guild,
                member: message.member,
                user: message.author,
                channel: message.channel,
                args: parsed.args
            },
            false
        );

        ctx.message = message;
        ctx.args = parsed.args;

        await runCommand(command, ctx);
    } catch (error) {
        console.error("[PYRR Prefix Command Error]", error);

        if (message.channel?.isTextBased()) {
            await message.channel.send({
                embeds: [
                    errorEmbed("An unexpected error occurred while running that command.")
                ]
            }).catch(() => {});
        }
    }
});

// Slash command dispatcher.
client.on("interactionCreate", async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    try {
        const command = commands.get(interaction.commandName);

        if (!command || !command.slash) {
            return interaction.reply({
                content: "That command is unavailable.",
                ephemeral: true
            }).catch(() => {});
        }

        const ctx = makeContext(interaction, true);

        await runCommand(command, ctx);
    } catch (error) {
        console.error("[PYRR Slash Command Error]", error);

        const response = {
            embeds: [
                errorEmbed("An unexpected error occurred while running that command.")
            ],
            ephemeral: true
        };

        if (interaction.replied || interaction.deferred) {
            await interaction.followUp(response).catch(() => {});
        } else {
            await interaction.reply(response).catch(() => {});
        }
    }
});

// Prefix command help fallback.
registerCommand({
    name: "commands",
    description: "Show the available prefix commands",
    category: "Information",
    slash: false,
    aliases: ["commandlist", "cmdlist"],
    execute: async (ctx) => {
        const unique = getUniqueCommands();

        const lines = unique
            .filter(command => command.name !== "commands")
            .slice(0, 40)
            .map(command => `\`${getGuildPrefix(ctx.guild?.id)}${command.name}\``);

        return ctx.reply({
            embeds: [
                makeEmbed({
                    title: "PYRR Commands",
                    description: lines.join(" • ") ||
                        "No commands are currently available.",
                    color: COLORS.primary,
                    footer: {
                        text: `Use ${getGuildPrefix(ctx.guild?.id)}help for the help menu`
                    }
                })
            ]
        });
    }
});

/* Append Part 20 below this line. */

/* =========================================================
   PART 20/20 — FINAL STARTUP
========================================================= */

// Prevent duplicate slash-command names and respect Discord's
// maximum of 100 global application commands.
function buildSlashCommandPayload() {
    const unique = new Map();

    for (const builder of slashCommands) {
        try {
            const json = typeof builder.toJSON === "function"
                ? builder.toJSON()
                : builder;

            if (!json || !json.name) continue;
            if (unique.has(json.name)) continue;

            unique.set(json.name, json);
        } catch (error) {
            console.error(
                "[PYRR Slash Builder Error]",
                error
            );
        }
    }

    const payload = [...unique.values()];

    if (payload.length > 100) {
        console.warn(
            `[PYRR] ${payload.length} slash commands found. ` +
            "Only the first 100 will be registered."
        );
    }

    return payload.slice(0, 100);
}

async function registerPyrrSlashCommands() {
    if (!TOKEN) {
        throw new Error(
            "DISCORD_TOKEN is missing from the environment."
        );
    }

    if (!CLIENT_ID) {
        throw new Error(
            "CLIENT_ID is missing from the environment."
        );
    }

    const rest = new REST({ version: "10" }).setToken(TOKEN);
    const payload = buildSlashCommandPayload();

    console.log(
        `[PYRR] Registering ${payload.length} slash commands...`
    );

    await rest.put(
        Routes.applicationCommands(CLIENT_ID),
        { body: payload }
    );

    console.log(
        `[PYRR] Successfully registered ${payload.length} slash commands.`
    );
}

// Bot ready event.
client.once("ready", async () => {
    console.log("======================================");
    console.log(`       ${BOT_NAME}`);
    console.log("======================================");
    console.log(`Logged in as: ${client.user.tag}`);
    console.log(`Creator: ${CREATOR}`);
    console.log(`Servers: ${client.guilds.cache.size}`);
    console.log(`Prefix: ${DEFAULT_PREFIX}`);
    console.log(`Commands: ${getUniqueCommands().length}`);

    try {
        await client.user.setPresence({
            activities: [
                {
                    name: `${DEFAULT_PREFIX}help | ${BOT_NAME}`,
                    type: ActivityType.Watching
                }
            ],
            status: "online"
        });
    } catch (error) {
        console.error("[PYRR Presence Error]", error);
    }

    try {
        await registerPyrrSlashCommands();
    } catch (error) {
        console.error(
            "[PYRR Slash Registration Error]",
            error.message
        );
    }

    console.log("[PYRR] Startup complete.");
});

client.on("warn", (warning) => {
    console.warn("[PYRR Warning]", warning);
});

client.on("error", (error) => {
    console.error("[PYRR Client Error]", error);
});

process.on("unhandledRejection", (reason) => {
    console.error("[PYRR Unhandled Rejection]", reason);
});

process.on("uncaughtException", (error) => {
    console.error("[PYRR Uncaught Exception]", error);
});

// Start the bot.
if (!TOKEN) {
    console.error(
        "[PYRR] ERROR: Set DISCORD_TOKEN before starting the bot."
    );
} else {
    client.login(TOKEN).catch((error) => {
        console.error(
            "[PYRR Login Failed]",
            error.message
        );
    });
}

/* =========================================================
   END OF PYRR OFFICIAL — PART 20/20
========================================================= */
