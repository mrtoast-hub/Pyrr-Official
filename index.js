
"use strict";

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
    ChannelType,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require("discord.js");

const fs = require("node:fs");
const path = require("node:path");

// ==========================================
// PYRR OFFICIAL — CORE CONFIGURATION
// ==========================================

const BOT_NAME = "PYRR OFFICIAL";
const CREATOR = "_upyr";
const DEFAULT_PREFIX = ",";
const SUPPORT_SERVER = "https://discord.gg/TwDBvBmVdM";
const OWNER_IDS = ["1551635950432428162"];

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "pyrr-data.json");

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

// ==========================================
// DEFAULT SERVER CONFIGURATION
// ==========================================

function defaultGuildConfig() {
    return {
        prefix: DEFAULT_PREFIX,

        antinuke: {
            enabled: false,
            trusted: [],
            punishment: "kick",
            logChannel: null
        },

        antiraid: {
            enabled: false,
            joinLimit: 8,
            interval: 10000,
            punishment: "kick",
            logChannel: null
        },

        automod: {
            enabled: false,
            blockInvites: false,
            blockLinks: false,
            blockedWords: [],
            maxMentions: 5,
            maxMessages: 6,
            interval: 5000
        },

        welcome: {
            enabled: false,
            channelId: null,
            message: "Welcome {user} to {server}!"
        },

        leave: {
            enabled: false,
            channelId: null,
            message: "{username} has left {server}."
        },

        autorole: {
            enabled: false,
            roleId: null
        },

        verification: {
            enabled: false,
            channelId: null,
            roleId: null
        },

        tickets: {
            enabled: false,
            categoryId: null,
            supportRoleId: null,
            panelChannelId: null
        },

        logs: {
            enabled: false,
            channelId: null
        },

        leveling: {
            enabled: true,
            users: {},
            rewards: {}
        },

        suggestions: {
            enabled: false,
            channelId: null
        },

        utility: {
            autoReact: {},
            autoRespond: {},
            afkUsers: {}
        },

        disabledCommands: [],
        warnings: {},

        jail: {
            enabled: false,
            roleId: null,
            records: {}
        }
    };
}

// ==========================================
// DATABASE
// ==========================================

function loadDatabase() {
    try {
        fs.mkdirSync(DATA_DIR, { recursive: true });

        if (!fs.existsSync(DATA_FILE)) {
            fs.writeFileSync(
                DATA_FILE,
                JSON.stringify({ guilds: {} }, null, 2),
                "utf8"
            );
        }

        const data = JSON.parse(
            fs.readFileSync(DATA_FILE, "utf8")
        );

        if (!data.guilds || typeof data.guilds !== "object") {
            data.guilds = {};
        }

        return data;
    } catch (error) {
        console.error("[PYRR] Database load error:", error.message);
        return { guilds: {} };
    }
}

const database = loadDatabase();
let saveQueue = Promise.resolve();

function saveDatabase() {
    saveQueue = saveQueue
        .catch(() => {})
        .then(async () => {
            await fs.promises.mkdir(DATA_DIR, {
                recursive: true
            });

            const tempFile = `${DATA_FILE}.tmp`;

            await fs.promises.writeFile(
                tempFile,
                JSON.stringify(database, null, 2),
                "utf8"
            );

            await fs.promises.rename(tempFile, DATA_FILE);
        })
        .catch(error => {
            console.error("[PYRR] Database save error:", error.message);
        });

    return saveQueue;
}

function getConfig(guildId) {
    if (!guildId) return defaultGuildConfig();

    if (!database.guilds[guildId]) {
        database.guilds[guildId] = defaultGuildConfig();
        void saveDatabase();
    }

    const config = database.guilds[guildId];
    const defaults = defaultGuildConfig();

    for (const [key, value] of Object.entries(defaults)) {
        if (config[key] === undefined) {
            config[key] = structuredClone(value);
        }
    }

    return config;
}

// ==========================================
// EMBED HELPERS
// ==========================================

function makeEmbed(title, description, color = 0x202225) {
    return new EmbedBuilder()
        .setColor(color)
        .setTitle(String(title || BOT_NAME).slice(0, 256))
        .setDescription(
            String(description || "No description provided.").slice(0, 4000)
        )
        .setFooter({
            text: `${BOT_NAME} • by ${CREATOR}`
        })
        .setTimestamp();
}

function successEmbed(title, description) {
    return makeEmbed(title, description, 0x2ecc71);
}

function errorEmbed(title, description) {
    return makeEmbed(title, description, 0xe74c3c);
}

function infoEmbed(title, description) {
    return makeEmbed(title, description, 0x3498db);
}

// ==========================================
// COMMAND REGISTRY
// ==========================================

const commands = new Map();
const slashCommands = [];

function registerCommand({
    name,
    description = "No description provided.",
    category = "Utility",
    aliases = [],
    slash = true,
    options = [],
    execute
}) {
    if (!name || typeof execute !== "function") {
        throw new Error("Invalid command definition.");
    }

    const normalizedName = name.toLowerCase();

    if (commands.has(normalizedName)) {
        throw new Error(`Duplicate command name: ${normalizedName}`);
    }

    const command = {
        name: normalizedName,
        description,
        category,
        aliases: aliases.map(alias => alias.toLowerCase()),
        slash,
        execute
    };

    commands.set(normalizedName, command);

    for (const alias of command.aliases) {
        if (!commands.has(alias)) {
            commands.set(alias, command);
        }
    }

    if (slash) {
        const builder = new SlashCommandBuilder()
            .setName(normalizedName)
            .setDescription(description.slice(0, 100));

        for (const option of options) {
            const method = {
                string: "addStringOption",
                user: "addUserOption",
                integer: "addIntegerOption",
                number: "addNumberOption",
                boolean: "addBooleanOption",
                channel: "addChannelOption",
                role: "addRoleOption",
                mentionable: "addMentionableOption",
                attachment: "addAttachmentOption"
            }[option.type];

            if (!method) continue;

            builder[method](item => {
                item.setName(option.name)
                    .setDescription(
                        (option.description || option.name).slice(0, 100)
                    )
                    .setRequired(Boolean(option.required));

                if (
                    option.type === "string" &&
                    Array.isArray(option.choices)
                ) {
                    item.addChoices(...option.choices);
                }

                if (["integer", "number"].includes(option.type)) {
                    if (Number.isFinite(option.min)) {
                        item.setMinValue(option.min);
                    }

                    if (Number.isFinite(option.max)) {
                        item.setMaxValue(option.max);
                    }
                }

                if (
                    option.type === "channel" &&
                    Array.isArray(option.channelTypes)
                ) {
                    item.addChannelTypes(...option.channelTypes);
                }

                return item;
            });
        }

        slashCommands.push(builder);
    }

    return command;
}

// ==========================================
// GENERAL HELPERS
// ==========================================

function isOwner(userId) {
    return OWNER_IDS.includes(userId);
}

function hasPermission(member, permission) {
    if (!member) return false;
    if (isOwner(member.id)) return true;
    if (member.guild?.ownerId === member.id) return true;

    return Boolean(member.permissions?.has(permission));
}

async function requireGuild(ctx) {
    if (ctx.guild) return true;

    await ctx.reply({
        embeds: [
            errorEmbed(
                "Server Only",
                "This command can only be used inside a server."
            )
        ]
    });

    return false;
}

async function requireModerator(ctx, permission) {
    if (!ctx.guild || !ctx.member) {
        await ctx.reply({
            embeds: [
                errorEmbed("Server Only", "Use this command inside a server.")
            ]
        });

        return false;
    }

    if (
        !hasPermission(ctx.member, permission) &&
        !isOwner(ctx.user?.id)
    ) {
        await ctx.reply({
            embeds: [
                errorEmbed(
                    "Missing Permission",
                    `You need the **${permission}** permission.`
                )
            ]
        });

        return false;
    }

    return true;
}

async function requireBotPermission(ctx, permission) {
    const botMember = ctx.guild?.members?.me;

    if (!botMember?.permissions?.has(permission)) {
        await ctx.reply({
            embeds: [
                errorEmbed(
                    "Bot Missing Permission",
                    `Please give the bot the **${permission}** permission.`
                )
            ]
        });

        return false;
    }

    return true;
}

function canModerateTarget(ctx, target) {
    if (!target || !ctx.member || !ctx.guild) return false;

    if (
        isOwner(ctx.user?.id) ||
        ctx.guild.ownerId === ctx.user?.id
    ) {
        return true;
    }

    if (
        target.id === ctx.user?.id ||
        target.id === ctx.guild.ownerId
    ) {
        return false;
    }

    const actorPosition = ctx.member.roles.highest.position;
    const targetPosition = target.roles.highest.position;

    if (targetPosition >= actorPosition) {
        void ctx.reply({
            embeds: [
                errorEmbed(
                    "Role Hierarchy",
                    "Your highest role must be above the target member's role."
                )
            ]
        });

        return false;
    }

    const botMember = ctx.guild.members.me;

    if (
        botMember &&
        target.roles.highest.position >= botMember.roles.highest.position
    ) {
        void ctx.reply({
            embeds: [
                errorEmbed(
                    "Bot Role Hierarchy",
                    "Move the bot's highest role above the target member."
                )
            ]
        });

        return false;
    }

    return true;
}

// ==========================================
// DURATION HELPERS
// ==========================================

function parseDuration(input) {
    if (!input) return null;

    const match = String(input).match(/^(\d+)(s|m|h|d|w)$/i);
    if (!match) return null;

    const amount = Number(match[1]);
    const unit = match[2].toLowerCase();

    const multipliers = {
        s: 1000,
        m: 60000,
        h: 3600000,
        d: 86400000,
        w: 604800000
    };

    const duration = amount * multipliers[unit];

    if (!Number.isFinite(duration) || duration <= 0) return null;

    return duration;
}

function formatDuration(ms) {
    const units = [
        ["d", 86400000],
        ["h", 3600000],
        ["m", 60000],
        ["s", 1000]
    ];

    for (const [label, size] of units) {
        if (ms >= size) {
            return `${Math.floor(ms / size)}${label}`;
        }
    }

    return "0s";
}

// ==========================================
// LOGGING HELPER
// ==========================================

async function sendLog(guild, embed) {
    try {
        if (!guild) return;

        const config = getConfig(guild.id);
        const channelId = config.logs?.channelId;

        if (!channelId) return;

        const channel = await guild.channels.fetch(channelId).catch(() => null);

        if (channel?.isTextBased()) {
            await channel.send({ embeds: [embed] }).catch(() => {});
        }
    } catch (error) {
        console.error("[PYRR] Log error:", error.message);
    }
}

// ==========================================
// COMMAND CONTEXT
// ==========================================

function makeContext(source, isInteraction = false, args = []) {
    const guild = source.guild || null;
    const member = source.member || null;
    const user = source.user || source.author || null;
    const channel = source.channel || null;

    return {
        source,
        isInteraction,
        guild,
        member,
        user,
        channel,
        args,

        async reply(payload) {
            if (isInteraction) {
                if (source.deferred || source.replied) {
                    return source.followUp(payload);
                }

                return source.reply(payload);
            }

            return source.reply(payload);
        },

        async send(payload) {
            if (!channel) return null;
            return channel.send(payload);
        },

        getString(name) {
            return isInteraction
                ? source.options.getString(name)
                : null;
        },

        getInteger(name) {
            return isInteraction
                ? source.options.getInteger(name)
                : null;
        },

        getNumber(name) {
            return isInteraction
                ? source.options.getNumber(name)
                : null;
        },

        getBoolean(name) {
            return isInteraction
                ? source.options.getBoolean(name)
                : null;
        },

        getUser(name) {
            if (isInteraction) {
                return source.options.getUser(name);
            }

            return null;
        },

        getMember(name) {
            return isInteraction
                ? source.options.getMember(name)
                : null;
        },

        getRole(name) {
            return isInteraction
                ? source.options.getRole(name)
                : null;
        },

        getChannel(name) {
            return isInteraction
                ? source.options.getChannel(name)
                : null;
        },

        getAttachment(name) {
            return isInteraction
                ? source.options.getAttachment(name)
                : null;
        }
    };
}

// ==========================================
// COMMAND RUNNER
// ==========================================

async function runCommand(command, ctx) {
    if (!command || typeof command.execute !== "function") return;

    try {
        if (ctx.guild) {
            const config = getConfig(ctx.guild.id);

            if (
                config.disabledCommands.includes(command.name) &&
                !isOwner(ctx.user?.id)
            ) {
                await ctx.reply({
                    embeds: [
                        errorEmbed(
                            "Command Disabled",
                            "This command is disabled in this server."
                        )
                    ]
                });

                return;
            }
        }

        await command.execute(ctx);
    } catch (error) {
        console.error(
            `[PYRR] Command "${command.name}" failed:`,
            error
        );

        await ctx.reply({
            embeds: [
                errorEmbed(
                    "Command Error",
                    "An unexpected error occurred while running this command."
                )
            ]
        }).catch(() => {});
    }
}

// PART 2 WILL CONTINUE BELOW THIS LINE.
          
/* ==========================================
   PART 2/20 — BASIC COMMANDS
========================================== */

// ---------- PING ----------

registerCommand({
    name: "ping",
    description: "Check bot latency",
    category: "Utility",
    aliases: ["latency"],
    execute: async (ctx) => {
        const started = Date.now();

        const message = await ctx.reply({
            embeds: [
                infoEmbed("Pinging...", "Checking bot response time.")
            ],
            fetchReply: !ctx.isInteraction
        }).catch(() => null);

        const responseTime = Date.now() - started;
        const websocketPing = Math.round(client.ws.ping);

        return ctx.reply({
            embeds: [
                successEmbed(
                    "Pong!",
                    [
                        `**Response:** ${responseTime}ms`,
                        `**WebSocket:** ${websocketPing}ms`,
                        `**Status:** Online`
                    ].join("\n")
                )
            ]
        }).catch(() => message);
    }
});

// ---------- BOT INFO ----------

registerCommand({
    name: "botinfo",
    description: "View information about the bot",
    category: "Utility",
    aliases: ["about", "bot"],
    execute: async (ctx) => {
        const uptime = formatDuration(client.uptime || 0);
        const guildCount = client.guilds.cache.size;
        const userCount = client.guilds.cache.reduce(
            (total, guild) => total + (guild.memberCount || 0),
            0
        );

        const embed = makeEmbed(
            "PYRR OFFICIAL",
            "Your all-in-one Discord utility and moderation bot.",
            0x5865f2
        )
            .addFields(
                {
                    name: "Creator",
                    value: CREATOR,
                    inline: true
                },
                {
                    name: "Servers",
                    value: String(guildCount),
                    inline: true
                },
                {
                    name: "Members",
                    value: String(userCount),
                    inline: true
                },
                {
                    name: "Uptime",
                    value: uptime,
                    inline: true
                },
                {
                    name: "Prefix",
                    value: ctx.guild
                        ? getConfig(ctx.guild.id).prefix
                        : DEFAULT_PREFIX,
                    inline: true
                },
                {
                    name: "Commands",
                    value: String(
                        new Set(
                            [...commands.values()].map(command => command.name)
                        ).size
                    ),
                    inline: true
                },
                {
                    name: "Support",
                    value: `[Join the support server](${SUPPORT_SERVER})`,
                    inline: false
                }
            );

        return ctx.reply({ embeds: [embed] });
    }
});

// ---------- HELP ----------

registerCommand({
    name: "help",
    description: "View available bot commands",
    category: "Utility",
    aliases: ["commands"],
    options: [
        {
            type: "string",
            name: "command",
            description: "Command to get help for",
            required: false
        }
    ],
    execute: async (ctx) => {
        const config = ctx.guild
            ? getConfig(ctx.guild.id)
            : { prefix: DEFAULT_PREFIX };

        const prefix = config.prefix || DEFAULT_PREFIX;
        const requested = ctx.getString("command") ||
            ctx.args?.[0] ||
            null;

        if (requested) {
            const command = commands.get(
                String(requested).toLowerCase()
            );

            if (!command) {
                return ctx.reply({
                    embeds: [
                        errorEmbed(
                            "Command Not Found",
                            `No command named \`${requested}\` was found.`
                        )
                    ]
                });
            }

            return ctx.reply({
                embeds: [
                    makeEmbed(
                        `Help: ${command.name}`,
                        [
                            `**Description:** ${command.description}`,
                            `**Category:** ${command.category}`,
                            `**Prefix usage:** \`${prefix}${command.name}\``,
                            `**Slash usage:** \`/${command.name}\``,
                            `**Aliases:** ${
                                command.aliases.length
                                    ? command.aliases.join(", ")
                                    : "None"
                            }`
                        ].join("\n")
                    )
                ]
            });
        }

        const uniqueCommands = [
            ...new Map(
                [...commands.values()].map(command => [
                    command.name,
                    command
                ])
            ).values()
        ];

        const grouped = new Map();

        for (const command of uniqueCommands) {
            const category = command.category || "Other";

            if (!grouped.has(category)) {
                grouped.set(category, []);
            }

            grouped.get(category).push(command);
        }

        const embed = makeEmbed(
            "PYRR OFFICIAL — Help",
            [
                "Use slash commands or your server prefix.",
                `**Prefix:** \`${prefix}\``,
                "**Example:** `,help` or `/help`",
                "",
                "To view command details, use `/help command:<name>`."
            ].join("\n"),
            0x5865f2
        );

        for (const [category, list] of grouped) {
            const display = list
                .map(command => `\`${command.name}\``)
                .join(", ");

            embed.addFields({
                name: `${category} (${list.length})`,
                value: display.slice(0, 1024) || "No commands",
                inline: false
            });
        }

        embed.addFields({
            name: "Support Server",
            value: `[Click here to join](${SUPPORT_SERVER})`,
            inline: false
        });

        return ctx.reply({ embeds: [embed] });
    }
});

// ---------- PREFIX COMMAND ----------

registerCommand({
    name: "prefix",
    description: "View or change the server prefix",
    category: "Configuration",
    options: [
        {
            type: "string",
            name: "value",
            description: "New prefix (1–5 characters)",
            required: false
        }
    ],
    execute: async (ctx) => {
        if (!ctx.guild) {
            return ctx.reply({
                embeds: [
                    infoEmbed(
                        "Current Prefix",
                        `The default prefix is \`${DEFAULT_PREFIX}\`.`
                    )
                ]
            });
        }

        const config = getConfig(ctx.guild.id);
        const newPrefix = ctx.getString("value");

        if (!newPrefix) {
            return ctx.reply({
                embeds: [
                    infoEmbed(
                        "Server Prefix",
                        `Current prefix: \`${config.prefix}\``
                    )
                ]
            });
        }

        if (
            !hasPermission(ctx.member, "ManageGuild") &&
            !isOwner(ctx.user.id)
        ) {
            return ctx.reply({
                embeds: [
                    errorEmbed(
                        "Missing Permission",
                        "You need Manage Server permission to change the prefix."
                    )
                ]
            });
        }

        if (
            newPrefix.length > 5 ||
            newPrefix.length < 1 ||
            /\s/.test(newPrefix)
        ) {
            return ctx.reply({
                embeds: [
                    errorEmbed(
                        "Invalid Prefix",
                        "The prefix must be 1–5 characters without spaces."
                    )
                ]
            });
        }

        config.prefix = newPrefix;
        await saveDatabase();

        return ctx.reply({
            embeds: [
                successEmbed(
                    "Prefix Updated",
                    `The new prefix is \`${newPrefix}\`.`
                )
            ]
        });
    }
});

// ---------- SERVER INFO ----------

registerCommand({
    name: "serverinfo",
    description: "View information about this server",
    category: "Utility",
    aliases: ["guildinfo"],
    execute: async (ctx) => {
        if (!ctx.guild) {
            return ctx.reply({
                embeds: [
                    errorEmbed(
                        "Server Only",
                        "Use this command inside a server."
                    )
                ]
            });
        }

        const guild = ctx.guild;
        const owner = await guild.fetchOwner().catch(() => null);

        const embed = makeEmbed(
            guild.name,
            "Server information",
            0x5865f2
        ).addFields(
            {
                name: "Server ID",
                value: guild.id,
                inline: true
            },
            {
                name: "Owner",
                value: owner ? `${owner.user.tag}` : "Unknown",
                inline: true
            },
            {
                name: "Members",
                value: String(guild.memberCount),
                inline: true
            },
            {
                name: "Channels",
                value: String(guild.channels.cache.size),
                inline: true
            },
            {
                name: "Roles",
                value: String(guild.roles.cache.size),
                inline: true
            },
            {
                name: "Created",
                value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:D>`,
                inline: true
            }
        );

        if (guild.iconURL()) {
            embed.setThumbnail(guild.iconURL({ size: 256 }));
        }

        return ctx.reply({ embeds: [embed] });
    }
});

// ---------- USER INFO ----------

registerCommand({
    name: "userinfo",
    description: "View information about a user",
    category: "Utility",
    options: [
        {
            type: "user",
            name: "user",
            description: "User to inspect",
            required: false
        }
    ],
    execute: async (ctx) => {
        const user = ctx.getUser("user") || ctx.user;

        const member = ctx.guild
            ? await ctx.guild.members.fetch(user.id).catch(() => null)
            : null;

        const embed = makeEmbed(
            user.tag || user.username,
            "User information",
            0x5865f2
        ).addFields(
            {
                name: "User ID",
                value: user.id,
                inline: true
            },
            {
                name: "Account Created",
                value: `<t:${Math.floor(user.createdTimestamp / 1000)}:D>`,
                inline: true
            },
            {
                name: "Server Joined",
                value: member
                    ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:D>`
                    : "Not available",
                inline: true
            },
            {
                name: "Bot Account",
                value: user.bot ? "Yes" : "No",
                inline: true
            }
        );

        embed.setThumbnail(
            user.displayAvatarURL({ size: 256 })
        );

        if (member) {
            const roles = member.roles.cache
                .filter(role => role.id !== ctx.guild.id)
                .map(role => role.toString());

            embed.addFields({
                name: `Roles (${roles.length})`,
                value: roles.slice(0, 15).join(", ") || "No roles",
                inline: false
            });
        }

        return ctx.reply({ embeds: [embed] });
    }
});

// ---------- AVATAR ----------

registerCommand({
    name: "avatar",
    description: "Show a user's avatar",
    category: "Utility",
    options: [
        {
            type: "user",
            name: "user",
            description: "User whose avatar you want",
            required: false
        }
    ],
    execute: async (ctx) => {
        const user = ctx.getUser("user") || ctx.user;
        const avatar = user.displayAvatarURL({
            size: 1024,
            extension: "png"
        });

        const embed = makeEmbed(
            `${user.username}'s Avatar`,
            `[Open full-size avatar](${avatar})`,
            0x5865f2
        ).setImage(avatar);

        return ctx.reply({ embeds: [embed] });
    }
});

// ---------- USER BANNER ----------

registerCommand({
    name: "userbanner",
    description: "Show a user's profile banner",
    category: "Utility",
    options: [
        {
            type: "user",
            name: "user",
            description: "User whose banner you want",
            required: false
        }
    ],
    execute: async (ctx) => {
        const selected = ctx.getUser("user") || ctx.user;
        const user = await client.users.fetch(selected.id, {
            force: true
        }).catch(() => selected);

        if (!user.bannerURL()) {
            return ctx.reply({
                embeds: [
                    infoEmbed(
                        "No Banner",
                        "This user does not have a visible profile banner."
                    )
                ]
            });
        }

        const banner = user.bannerURL({
            size: 1024,
            extension: "png"
        });

        return ctx.reply({
            embeds: [
                makeEmbed(
                    `${user.username}'s Banner`,
                    `[Open banner](${banner})`
                ).setImage(banner)
            ]
        });
    }
});

// ---------- INVITE ----------

registerCommand({
    name: "support",
    description: "Get the bot support server link",
    category: "Utility",
    aliases: ["invite"],
    execute: async (ctx) => {
        return ctx.reply({
            embeds: [
                makeEmbed(
                    "PYRR OFFICIAL Support",
                    `[Join the support server](${SUPPORT_SERVER})`,
                    0x5865f2
                )
            ]
        });
    }
});

// PART 3 WILL CONTINUE BELOW THIS LINE.
                      // ============================================
// PART 3/20 — GENERAL UTILITY COMMANDS
// ============================================

registerCommand({
    name: "say",
    description: "Make the bot send a message",
    category: "Utility",
    usage: ",say <message>",
    execute: async (ctx) => {
        const message = String(ctx.args?.join(" ") || "").trim();

        if (!message) {
            return ctx.reply({
                content: "Usage: `,say <message>`"
            });
        }

        if (!ctx.member?.permissions?.has(PermissionsBitField.Flags.ManageMessages)) {
            return ctx.reply({
                content: "You need **Manage Messages** permission."
            });
        }

        if (message.length > 1900) {
            return ctx.reply({
                content: "Message is too long. Keep it under 1900 characters."
            });
        }

        await ctx.channel.send({
            content: message,
            allowedMentions: { parse: [] }
        });

        if (ctx.message) {
            await ctx.message.delete().catch(() => {});
        }

        if (ctx.interaction) {
            return ctx.reply({
                content: "Message sent.",
                ephemeral: true
            });
        }
    }
});

registerCommand({
    name: "embed",
    description: "Send a simple embed",
    category: "Utility",
    usage: ",embed <title> | <description>",
    execute: async (ctx) => {
        if (!ctx.member?.permissions?.has(PermissionsBitField.Flags.ManageMessages)) {
            return ctx.reply({
                content: "You need **Manage Messages** permission."
            });
        }

        const raw = String(ctx.args?.join(" ") || "");
        const sections = raw.split("|");
        const title = sections[0]?.trim();
        const description = sections.slice(1).join("|").trim();

        if (!title || !description) {
            return ctx.reply({
                content: "Usage: `,embed <title> | <description>`"
            });
        }

        const embed = new EmbedBuilder()
            .setColor(getConfig(ctx.guild.id).color || 0x5865f2)
            .setTitle(title.slice(0, 256))
            .setDescription(description.slice(0, 4000))
            .setFooter({
                text: `${ctx.client.user.username}`
            })
            .setTimestamp();

        await ctx.channel.send({ embeds: [embed] });

        if (ctx.interaction) {
            return ctx.reply({
                content: "Embed sent.",
                ephemeral: true
            });
        }

        return ctx.reply({
            content: "Embed sent."
        });
    }
});



        await poll.react("👍").catch(() => {});
        await poll.react("👎").catch(() => {});

        return ctx.reply({
            content: "Poll created."
        });
    }
});

registerCommand({
    name: "choose",
    description: "Choose randomly from your options",
    category: "Utility",
    usage: ",choose <option 1> | <option 2>",
    execute: async (ctx) => {
        const raw = String(ctx.args?.join(" ") || "");
        const choices = raw
            .split("|")
            .map((item) => item.trim())
            .filter(Boolean);

        if (choices.length < 2) {
            return ctx.reply({
                content: "Usage: `,choose option 1 | option 2`"
            });
        }

        const choice = choices[Math.floor(Math.random() * choices.length)];

        return ctx.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(0x57f287)
                    .setTitle("🎲 Random Choice")
                    .setDescription(`I choose: **${choice}**`)
                    .setFooter({
                        text: `Requested by ${ctx.user.username}`
                    })
            ]
        });
    }
});

registerCommand({
    name: "roll",
    description: "Roll a six-sided dice",
    category: "Fun",
    execute: async (ctx) => {
        const number = Math.floor(Math.random() * 6) + 1;

        return ctx.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(0x5865f2)
                    .setTitle("🎲 Dice Roll")
                    .setDescription(`You rolled **${number}**.`)
                    .setFooter({
                        text: `Requested by ${ctx.user.username}`
                    })
            ]
        });
    }
});

registerCommand({
    name: "coinflip",
    description: "Flip a coin",
    category: "Fun",
    execute: async (ctx) => {
        const result = Math.random() < 0.5 ? "Heads" : "Tails";

        return ctx.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(0x5865f2)
                    .setTitle("🪙 Coin Flip")
                    .setDescription(`Result: **${result}**`)
            ]
        });
    }
});

registerCommand({
    name: "8ball",
    description: "Ask the magic 8-ball a question",
    category: "Fun",
    usage: ",8ball <question>",
    execute: async (ctx) => {
        const question = String(ctx.args?.join(" ") || "").trim();

        if (!question) {
            return ctx.reply({
                content: "Usage: `,8ball <question>`"
            });
        }

        const answers = [
            "Yes, definitely.",
            "It is likely.",
            "Signs point to yes.",
            "Ask again later.",
            "Cannot predict that right now.",
            "Probably not.",
            "My answer is no.",
            "The outlook is uncertain."
        ];

        const answer = answers[
            Math.floor(Math.random() * answers.length)
        ];

        return ctx.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(0x5865f2)
                    .setTitle("🎱 Magic 8-Ball")
                    .addFields(
                        { name: "Question", value: question.slice(0, 1000) },
                        { name: "Answer", value: answer }
                    )
            ]
        });
    }
});

registerCommand({
    name: "howgay",
    description: "Random joke percentage",
    category: "Fun",
    usage: ",howgay [user]",
    execute: async (ctx) => {
        const target = ctx.message?.mentions?.users?.first() || ctx.user;
        const percent = Math.floor(Math.random() * 101);

        return ctx.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(0xeb459e)
                    .setTitle("🌈 Random Percentage")
                    .setDescription(
                        `${target} got **${percent}%** on this random joke meter.`
                    )
                    .setFooter({
                        text: "For fun only — not a real assessment."
                    })
            ]
        });
    }
});

registerCommand({
    name: "ship",
    description: "Generate a random compatibility score",
    category: "Fun",
    usage: ",ship <user 1> <user 2>",
    execute: async (ctx) => {
        const users = ctx.message?.mentions?.users;

        if (!users || users.size < 2) {
            return ctx.reply({
                content: "Usage: `,ship @user1 @user2`"
            });
        }

        const pair = [...users.values()].slice(0, 2);
        const percent = Math.floor(Math.random() * 101);

        return ctx.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(0xeb459e)
                    .setTitle("💞 Compatibility Meter")
                    .setDescription(
                        `${pair[0]} + ${pair[1]}\n\n**${percent}%**`
                    )
                    .setFooter({
                        text: "Random fun score, not a real compatibility test."
                    })
            ]
        });
    }
});

registerCommand({
    name: "reverse",
    description: "Reverse text",
    category: "Utility",
    usage: ",reverse <text>",
    execute: async (ctx) => {
        const input = String(ctx.args?.join(" ") || "");

        if (!input.trim()) {
            return ctx.reply({
                content: "Usage: `,reverse <text>`"
            });
        }

        return ctx.reply({
            content: input.split("").reverse().join("").slice(0, 1900)
        });
    }
});

registerCommand({
    name: "uppercase",
    description: "Convert text to uppercase",
    category: "Utility",
    usage: ",uppercase <text>",
    execute: async (ctx) => {
        const input = String(ctx.args?.join(" ") || "");

        if (!input.trim()) {
            return ctx.reply({
                content: "Usage: `,uppercase <text>`"
            });
        }

        return ctx.reply({
            content: input.toUpperCase().slice(0, 1900)
        });
    }
});

registerCommand({
    name: "lowercase",
    description: "Convert text to lowercase",
    category: "Utility",
    usage: ",lowercase <text>",
    execute: async (ctx) => {
        const input = String(ctx.args?.join(" ") || "");

        if (!input.trim()) {
            return ctx.reply({
                content: "Usage: `,lowercase <text>`"
            });
        }

        return ctx.reply({
            content: input.toLowerCase().slice(0, 1900)
        });
    }
});

registerCommand({
    name: "charcount",
    description: "Count characters in text",
    category: "Utility",
    usage: ",charcount <text>",
    execute: async (ctx) => {
        const input = String(ctx.args?.join(" ") || "");

        if (!input.trim()) {
            return ctx.reply({
                content: "Usage: `,charcount <text>`"
            });
        }

        return ctx.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(0x5865f2)
                    .setTitle("📝 Character Counter")
                    .addFields(
                        { name: "Characters", value: String(input.length), inline: true },
                        { name: "Words", value: String(input.trim().split(/\s+/).length), inline: true },
                        { name: "Lines", value: String(input.split("\n").length), inline: true }
                    )
            ]
        });
    }
});

registerCommand({
    name: "timestamp",
    description: "Show the current Discord timestamp",
    category: "Utility",
    execute: async (ctx) => {
        const now = Math.floor(Date.now() / 1000);

        return ctx.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(0x5865f2)
                    .setTitle("🕒 Current Timestamp")
                    .setDescription(
                        `Unix: \`${now}\`\n` +
                        `Discord: <t:${now}:F>\n` +
                        `Relative: <t:${now}:R>`
                    )
            ]
        });
    }
});



// END PART 3/20// ============================================
// PART 4/20 — MODERATION COMMANDS
// ============================================

registerCommand({
    name: "clear",
    description: "Delete a number of recent messages",
    category: "Moderation",
    usage: ",clear <1-100>",
    slash: false,
    execute: async (ctx) => {
        if (!ctx.guild) {
            return ctx.reply({ content: "This command only works in a server." });
        }

        if (!ctx.member?.permissions?.has(PermissionsBitField.Flags.ManageMessages)) {
            return ctx.reply({ content: "You need **Manage Messages** permission." });
        }

        if (!ctx.guild.members.me?.permissions?.has(PermissionsBitField.Flags.ManageMessages)) {
            return ctx.reply({ content: "I need **Manage Messages** permission." });
        }

        const amount = Number(ctx.args?.[0]);

        if (!Number.isInteger(amount) || amount < 1 || amount > 100) {
            return ctx.reply({ content: "Usage: `,clear <1-100>`" });
        }

        try {
            const deleted = await ctx.channel.bulkDelete(amount, true);

            return ctx.reply({
                content: `Deleted **${deleted.size}** recent message(s).`,
                ephemeral: Boolean(ctx.interaction)
            });
        } catch (error) {
            console.error("[clear]", error);

            return ctx.reply({
                content: "I couldn't delete those messages. Older messages may not be bulk-deletable."
            });
        }
    }
});

registerCommand({
    name: "purge",
    description: "Delete recent messages",
    category: "Moderation",
    usage: ",purge <1-100>",
    slash: false,
    execute: async (ctx) => {
        if (!ctx.guild) {
            return ctx.reply({ content: "This command only works in a server." });
        }

        if (!ctx.member?.permissions?.has(PermissionsBitField.Flags.ManageMessages)) {
            return ctx.reply({ content: "You need **Manage Messages** permission." });
        }

        if (!ctx.guild.members.me?.permissions?.has(PermissionsBitField.Flags.ManageMessages)) {
            return ctx.reply({ content: "I need **Manage Messages** permission." });
        }

        const amount = Number(ctx.args?.[0]);

        if (!Number.isInteger(amount) || amount < 1 || amount > 100) {
            return ctx.reply({ content: "Usage: `,purge <1-100>`" });
        }

        try {
            const deleted = await ctx.channel.bulkDelete(amount, true);

            return ctx.reply({
                content: `Purged **${deleted.size}** message(s).`,
                ephemeral: Boolean(ctx.interaction)
            });
        } catch (error) {
            console.error("[purge]", error);

            return ctx.reply({
                content: "Purge failed. Check my permissions and try again."
            });
        }
    }
});

registerCommand({
    name: "kick",
    description: "Kick a member",
    category: "Moderation",
    usage: ",kick @user [reason]",
    slash: false,
    execute: async (ctx) => {
        if (!ctx.guild) {
            return ctx.reply({ content: "This command only works in a server." });
        }

        if (!ctx.member?.permissions?.has(PermissionsBitField.Flags.KickMembers)) {
            return ctx.reply({ content: "You need **Kick Members** permission." });
        }

        if (!ctx.guild.members.me?.permissions?.has(PermissionsBitField.Flags.KickMembers)) {
            return ctx.reply({ content: "I need **Kick Members** permission." });
        }

        const target = ctx.message?.mentions?.members?.first();
        const reason = ctx.args?.slice(1).join(" ") || "No reason provided";

        if (!target) {
            return ctx.reply({ content: "Usage: `,kick @user [reason]`" });
        }

        if (target.id === ctx.user.id) {
            return ctx.reply({ content: "You can't kick yourself." });
        }

        if (!target.kickable) {
            return ctx.reply({
                content: "I can't kick that member. Check role hierarchy and permissions."
            });
        }

        try {
            await target.kick(reason.slice(0, 400));

            return ctx.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0xed4245)
                        .setTitle("Member Kicked")
                        .setDescription(`**Member:** ${target.user.tag}\n**Reason:** ${reason}`)
                        .setTimestamp()
                ]
            });
        } catch (error) {
            console.error("[kick]", error);
            return ctx.reply({ content: "Failed to kick that member." });
        }
    }
});

registerCommand({
    name: "ban",
    description: "Ban a member",
    category: "Moderation",
    usage: ",ban @user [reason]",
    slash: false,
    execute: async (ctx) => {
        if (!ctx.guild) {
            return ctx.reply({ content: "This command only works in a server." });
        }

        if (!ctx.member?.permissions?.has(PermissionsBitField.Flags.BanMembers)) {
            return ctx.reply({ content: "You need **Ban Members** permission." });
        }

        if (!ctx.guild.members.me?.permissions?.has(PermissionsBitField.Flags.BanMembers)) {
            return ctx.reply({ content: "I need **Ban Members** permission." });
        }

        const target = ctx.message?.mentions?.members?.first();
        const reason = ctx.args?.slice(1).join(" ") || "No reason provided";

        if (!target) {
            return ctx.reply({ content: "Usage: `,ban @user [reason]`" });
        }

        if (target.id === ctx.user.id) {
            return ctx.reply({ content: "You can't ban yourself." });
        }

        if (!target.bannable) {
            return ctx.reply({
                content: "I can't ban that member. Check role hierarchy and permissions."
            });
        }

        try {
            await target.ban({ reason: reason.slice(0, 400) });

            return ctx.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0xed4245)
                        .setTitle("Member Banned")
                        .setDescription(`**Member:** ${target.user.tag}\n**Reason:** ${reason}`)
                        .setTimestamp()
                ]
            });
        } catch (error) {
            console.error("[ban]", error);
            return ctx.reply({ content: "Failed to ban that member." });
        }
    }
});

registerCommand({
    name: "unban",
    description: "Unban a user by ID",
    category: "Moderation",
    usage: ",unban <user ID>",
    slash: false,
    execute: async (ctx) => {
        if (!ctx.guild) {
            return ctx.reply({ content: "This command only works in a server." });
        }

        if (!ctx.member?.permissions?.has(PermissionsBitField.Flags.BanMembers)) {
            return ctx.reply({ content: "You need **Ban Members** permission." });
        }

        if (!ctx.guild.members.me?.permissions?.has(PermissionsBitField.Flags.BanMembers)) {
            return ctx.reply({ content: "I need **Ban Members** permission." });
        }

        const userId = String(ctx.args?.[0] || "");

        if (!/^\d{17,20}$/.test(userId)) {
            return ctx.reply({ content: "Usage: `,unban <user ID>`" });
        }

        try {
            await ctx.guild.members.unban(userId, `Unbanned by ${ctx.user.tag}`);

            return ctx.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0x57f287)
                        .setTitle("User Unbanned")
                        .setDescription(`Successfully unbanned user ID \`${userId}\`.`)
                ]
            });
        } catch (error) {
            console.error("[unban]", error);
            return ctx.reply({
                content: "Couldn't unban that user. They may not be banned."
            });
        }
    }
});

registerCommand({
    name: "timeout",
    description: "Timeout a member for a number of minutes",
    category: "Moderation",
    usage: ",timeout @user <minutes> [reason]",
    slash: false,
    execute: async (ctx) => {
        if (!ctx.guild) {
            return ctx.reply({ content: "This command only works in a server." });
        }

        if (!ctx.member?.permissions?.has(PermissionsBitField.Flags.ModerateMembers)) {
            return ctx.reply({ content: "You need **Moderate Members** permission." });
        }

        if (!ctx.guild.members.me?.permissions?.has(PermissionsBitField.Flags.ModerateMembers)) {
            return ctx.reply({ content: "I need **Moderate Members** permission." });
        }

        const target = ctx.message?.mentions?.members?.first();
        const minutes = Number(ctx.args?.[1]);
        const reason = ctx.args?.slice(2).join(" ") || "No reason provided";

        if (!target || !Number.isInteger(minutes) || minutes < 1 || minutes > 40320) {
            return ctx.reply({
                content: "Usage: `,timeout @user <minutes> [reason]` — maximum 28 days."
            });
        }

        if (target.id === ctx.user.id) {
            return ctx.reply({ content: "You can't timeout yourself." });
        }

        if (!target.moderatable) {
            return ctx.reply({
                content: "I can't timeout that member. Check role hierarchy."
            });
        }

        try {
            await target.timeout(minutes * 60 * 1000, reason.slice(0, 400));

            return ctx.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0xed4245)
                        .setTitle("Member Timed Out")
                        .setDescription(
                            `**Member:** ${target.user.tag}\n` +
                            `**Duration:** ${minutes} minute(s)\n` +
                            `**Reason:** ${reason}`
                        )
                        .setTimestamp()
                ]
            });
        } catch (error) {
            console.error("[timeout]", error);
            return ctx.reply({ content: "Failed to timeout that member." });
        }
    }
});

registerCommand({
    name: "untimeout",
    description: "Remove a member's timeout",
    category: "Moderation",
    usage: ",untimeout @user",
    slash: false,
    execute: async (ctx) => {
        if (!ctx.guild) {
            return ctx.reply({ content: "This command only works in a server." });
        }

        if (!ctx.member?.permissions?.has(PermissionsBitField.Flags.ModerateMembers)) {
            return ctx.reply({ content: "You need **Moderate Members** permission." });
        }

        if (!ctx.guild.members.me?.permissions?.has(PermissionsBitField.Flags.ModerateMembers)) {
            return ctx.reply({ content: "I need **Moderate Members** permission." });
        }

        const target = ctx.message?.mentions?.members?.first();

        if (!target) {
            return ctx.reply({ content: "Usage: `,untimeout @user`" });
        }

        if (!target.moderatable) {
            return ctx.reply({ content: "I can't modify that member's timeout." });
        }

        try {
            await target.timeout(null, `Timeout removed by ${ctx.user.tag}`);

            return ctx.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0x57f287)
                        .setTitle("Timeout Removed")
                        .setDescription(`Removed timeout for ${target.user.tag}.`)
                ]
            });
        } catch (error) {
            console.error("[untimeout]", error);
            return ctx.reply({ content: "Failed to remove timeout." });
        }
    }
});

registerCommand({
    name: "warn",
    description: "Warn a member",
    category: "Moderation",
    usage: ",warn @user [reason]",
    slash: false,
    execute: async (ctx) => {
        if (!ctx.guild) {
            return ctx.reply({ content: "This command only works in a server." });
        }

        if (!ctx.member?.permissions?.has(PermissionsBitField.Flags.ModerateMembers)) {
            return ctx.reply({ content: "You need **Moderate Members** permission." });
        }

        const target = ctx.message?.mentions?.users?.first();
        const reason = ctx.args?.slice(1).join(" ") || "No reason provided";

        if (!target) {
            return ctx.reply({ content: "Usage: `,warn @user [reason]`" });
        }

        if (target.id === ctx.user.id) {
            return ctx.reply({ content: "You can't warn yourself." });
        }

        const database = getConfig(ctx.guild.id);

        if (!Array.isArray(database.warnings)) {
            database.warnings = [];
        }

        database.warnings.push({
            userId: target.id,
            moderatorId: ctx.user.id,
            reason: reason.slice(0, 500),
            timestamp: Date.now()
        });

        saveDatabase();

        return ctx.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(0xfee75c)
                    .setTitle("Member Warned")
                    .setDescription(
                        `**Member:** ${target.tag}\n` +
                        `**Reason:** ${reason}\n` +
                        `**Moderator:** ${ctx.user.tag}`
                    )
                    .setTimestamp()
            ]
        });
    }
});

registerCommand({
    name: "warnings",
    description: "View warnings for a member",
    category: "Moderation",
    usage: ",warnings @user",
    slash: false,
    execute: async (ctx) => {
        if (!ctx.guild) {
            return ctx.reply({ content: "This command only works in a server." });
        }

        if (!ctx.member?.permissions?.has(PermissionsBitField.Flags.ModerateMembers)) {
            return ctx.reply({ content: "You need **Moderate Members** permission." });
        }

        const target = ctx.message?.mentions?.users?.first();

        if (!target) {
            return ctx.reply({ content: "Usage: `,warnings @user`" });
        }

        const database = getConfig(ctx.guild.id);
        const warnings = (database.warnings || []).filter(
            (warning) => warning.userId === target.id
        );

        if (!warnings.length) {
            return ctx.reply({ content: `No warnings found for ${target.tag}.` });
        }

        const description = warnings
            .slice(-10)
            .map((warning, index) =>
                `**${index + 1}.** ${warning.reason}\n` +
                `Moderator ID: \`${warning.moderatorId}\``
            )
            .join("\n\n");

        return ctx.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(0xfee75c)
                    .setTitle(`Warnings — ${target.tag}`)
                    .setDescription(description.slice(0, 4000))
                    .setFooter({ text: `Total warnings: ${warnings.length}` })
            ]
        });
    }
});

// END PART 4/20// ============================================
// PART 5/20 — CHANNEL MANAGEMENT
// ============================================

registerCommand({
    name: "lock",
    description: "Lock the current text channel",
    category: "Moderation",
    usage: ",lock [reason]",
    slash: false,
    execute: async (ctx) => {
        if (!ctx.guild) {
            return ctx.reply({ content: "This command only works in a server." });
        }

        if (!ctx.member?.permissions?.has(PermissionsBitField.Flags.ManageChannels)) {
            return ctx.reply({ content: "You need **Manage Channels** permission." });
        }

        if (!ctx.guild.members.me?.permissions?.has(PermissionsBitField.Flags.ManageChannels)) {
            return ctx.reply({ content: "I need **Manage Channels** permission." });
        }

        if (!ctx.channel.isTextBased() || !ctx.channel.permissionOverwrites) {
            return ctx.reply({ content: "This channel cannot be locked with this command." });
        }

        try {
            await ctx.channel.permissionOverwrites.edit(
                ctx.guild.roles.everyone,
                { SendMessages: false },
                { reason: ctx.args?.join(" ") || `Locked by ${ctx.user.tag}` }
            );

            return ctx.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0xed4245)
                        .setTitle("🔒 Channel Locked")
                        .setDescription(`${ctx.channel} has been locked.`)
                        .setTimestamp()
                ]
            });
        } catch (error) {
            console.error("[lock]", error);
            return ctx.reply({ content: "Failed to lock this channel. Check my permissions." });
        }
    }
});

registerCommand({
    name: "unlock",
    description: "Unlock the current text channel",
    category: "Moderation",
    usage: ",unlock",
    slash: false,
    execute: async (ctx) => {
        if (!ctx.guild) {
            return ctx.reply({ content: "This command only works in a server." });
        }

        if (!ctx.member?.permissions?.has(PermissionsBitField.Flags.ManageChannels)) {
            return ctx.reply({ content: "You need **Manage Channels** permission." });
        }

        if (!ctx.guild.members.me?.permissions?.has(PermissionsBitField.Flags.ManageChannels)) {
            return ctx.reply({ content: "I need **Manage Channels** permission." });
        }

        if (!ctx.channel.isTextBased() || !ctx.channel.permissionOverwrites) {
            return ctx.reply({ content: "This channel cannot be unlocked with this command." });
        }

        try {
            await ctx.channel.permissionOverwrites.edit(
                ctx.guild.roles.everyone,
                { SendMessages: null },
                { reason: `Unlocked by ${ctx.user.tag}` }
            );

            return ctx.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0x57f287)
                        .setTitle("🔓 Channel Unlocked")
                        .setDescription(`${ctx.channel} has been unlocked.`)
                        .setTimestamp()
                ]
            });
        } catch (error) {
            console.error("[unlock]", error);
            return ctx.reply({ content: "Failed to unlock this channel. Check my permissions." });
        }
    }
});

registerCommand({
    name: "slowmode",
    description: "Set the channel slowmode in seconds",
    category: "Moderation",
    usage: ",slowmode <seconds>",
    slash: false,
    execute: async (ctx) => {
        if (!ctx.guild) {
            return ctx.reply({ content: "This command only works in a server." });
        }

        if (!ctx.member?.permissions?.has(PermissionsBitField.Flags.ManageChannels)) {
            return ctx.reply({ content: "You need **Manage Channels** permission." });
        }

        if (!ctx.guild.members.me?.permissions?.has(PermissionsBitField.Flags.ManageChannels)) {
            return ctx.reply({ content: "I need **Manage Channels** permission." });
        }

        const seconds = Number(ctx.args?.[0]);

        if (!Number.isInteger(seconds) || seconds < 0 || seconds > 21600) {
            return ctx.reply({ content: "Usage: `,slowmode <0-21600>` seconds." });
        }

        try {
            await ctx.channel.setRateLimitPerUser(
                seconds,
                `Slowmode changed by ${ctx.user.tag}`
            );

            return ctx.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0x5865f2)
                        .setTitle("⏱️ Slowmode Updated")
                        .setDescription(
                            seconds === 0
                                ? "Slowmode has been disabled."
                                : `Slowmode is now **${seconds} seconds**.`
                        )
                ]
            });
        } catch (error) {
            console.error("[slowmode]", error);
            return ctx.reply({ content: "Failed to change slowmode." });
        }
    }
});

registerCommand({
    name: "renamechannel",
    description: "Rename the current channel",
    category: "Moderation",
    usage: ",renamechannel <new name>",
    slash: false,
    execute: async (ctx) => {
        if (!ctx.guild) {
            return ctx.reply({ content: "This command only works in a server." });
        }

        if (!ctx.member?.permissions?.has(PermissionsBitField.Flags.ManageChannels)) {
            return ctx.reply({ content: "You need **Manage Channels** permission." });
        }

        if (!ctx.guild.members.me?.permissions?.has(PermissionsBitField.Flags.ManageChannels)) {
            return ctx.reply({ content: "I need **Manage Channels** permission." });
        }

        const name = String(ctx.args?.join(" ") || "").trim();

        if (!name) {
            return ctx.reply({ content: "Usage: `,renamechannel <new name>`" });
        }

        try {
            await ctx.channel.setName(
                name.toLowerCase().replace(/\s+/g, "-").slice(0, 100),
                `Renamed by ${ctx.user.tag}`
            );

            return ctx.reply({
                content: `Channel renamed to **${ctx.channel.name}**.`
            });
        } catch (error) {
            console.error("[renamechannel]", error);
            return ctx.reply({ content: "Failed to rename the channel." });
        }
    }
});

registerCommand({
    name: "topic",
    description: "Set the current channel topic",
    category: "Moderation",
    usage: ",topic <topic text>",
    slash: false,
    execute: async (ctx) => {
        if (!ctx.guild) {
            return ctx.reply({ content: "This command only works in a server." });
        }

        if (!ctx.member?.permissions?.has(PermissionsBitField.Flags.ManageChannels)) {
            return ctx.reply({ content: "You need **Manage Channels** permission." });
        }

        if (!ctx.guild.members.me?.permissions?.has(PermissionsBitField.Flags.ManageChannels)) {
            return ctx.reply({ content: "I need **Manage Channels** permission." });
        }

        if (!ctx.channel.setTopic) {
            return ctx.reply({ content: "This channel doesn't support topics." });
        }

        const topic = String(ctx.args?.join(" ") || "").trim();

        if (!topic) {
            return ctx.reply({ content: "Usage: `,topic <topic text>`" });
        }

        try {
            await ctx.channel.setTopic(topic.slice(0, 1024));

            return ctx.reply({ content: "Channel topic updated." });
        } catch (error) {
            console.error("[topic]", error);
            return ctx.reply({ content: "Failed to update the topic." });
        }
    }
});

registerCommand({
    name: "clonechannel",
    description: "Clone the current channel",
    category: "Moderation",
    usage: ",clonechannel",
    slash: false,
    execute: async (ctx) => {
        if (!ctx.guild) {
            return ctx.reply({ content: "This command only works in a server." });
        }

        if (!ctx.member?.permissions?.has(PermissionsBitField.Flags.ManageChannels)) {
            return ctx.reply({ content: "You need **Manage Channels** permission." });
        }

        if (!ctx.guild.members.me?.permissions?.has(PermissionsBitField.Flags.ManageChannels)) {
            return ctx.reply({ content: "I need **Manage Channels** permission." });
        }

        try {
            const clone = await ctx.channel.clone({
                reason: `Cloned by ${ctx.user.tag}`
            });

            await clone.setPosition(ctx.channel.position + 1).catch(() => {});

            return ctx.reply({
                content: `Created channel ${clone}.`
            });
        } catch (error) {
            console.error("[clonechannel]", error);
            return ctx.reply({ content: "Failed to clone this channel." });
        }
    }
});

registerCommand({
    name: "deletechannel",
    description: "Delete the current channel",
    category: "Moderation",
    usage: ",deletechannel",
    slash: false,
    execute: async (ctx) => {
        if (!ctx.guild) {
            return ctx.reply({ content: "This command only works in a server." });
        }

        if (!ctx.member?.permissions?.has(PermissionsBitField.Flags.ManageChannels)) {
            return ctx.reply({ content: "You need **Manage Channels** permission." });
        }

        if (!ctx.guild.members.me?.permissions?.has(PermissionsBitField.Flags.ManageChannels)) {
            return ctx.reply({ content: "I need **Manage Channels** permission." });
        }

        const channelName = ctx.channel.name;

        const confirmEmbed = new EmbedBuilder()
            .setColor(0xed4245)
            .setTitle("⚠️ Delete Channel?")
            .setDescription(
                `This will delete **#${channelName}**.\n` +
                "This action cannot be undone. React with 🗑️ within 15 seconds to confirm."
            );

        const prompt = await ctx.reply({ embeds: [confirmEmbed] });

        if (!prompt?.react) {
            return ctx.reply({
                content: "This confirmation is only supported for prefix commands."
            });
        }

        await prompt.react("🗑️").catch(() => {});

        const filter = (reaction, user) =>
            reaction.emoji.name === "🗑️" &&
            user.id === ctx.user.id;

        try {
            const collected = await prompt.awaitReactions({
                filter,
                max: 1,
                time: 15000,
                errors: ["time"]
            });

            if (!collected.size) {
                return ctx.channel.send("Channel deletion cancelled.");
            }

            await ctx.channel.delete(`Deleted by ${ctx.user.tag}`);
        } catch {
            await prompt.edit({
                content: "Deletion cancelled.",
                embeds: []
            }).catch(() => {});
        }
    }
});

// END PART 5/20// ============================================
// PART 6/20 — ROLE MANAGEMENT
// ============================================

registerCommand({
    name: "addrole",
    description: "Give a role to a member",
    category: "Moderation",
    usage: ",addrole @user @role",
    slash: false,
    execute: async (ctx) => {
        if (!ctx.guild) {
            return ctx.reply({ content: "This command only works in a server." });
        }

        if (!ctx.member?.permissions?.has(PermissionsBitField.Flags.ManageRoles)) {
            return ctx.reply({ content: "You need **Manage Roles** permission." });
        }

        if (!ctx.guild.members.me?.permissions?.has(PermissionsBitField.Flags.ManageRoles)) {
            return ctx.reply({ content: "I need **Manage Roles** permission." });
        }

        const target = ctx.message?.mentions?.members?.first();
        const role = ctx.message?.mentions?.roles?.first();

        if (!target || !role) {
            return ctx.reply({ content: "Usage: `,addrole @user @role`" });
        }

        if (role.managed || role.position >= ctx.guild.members.me.roles.highest.position) {
            return ctx.reply({
                content: "I can't assign that role. Check role hierarchy."
            });
        }

        try {
            await target.roles.add(role, `Role added by ${ctx.user.tag}`);

            return ctx.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0x57f287)
                        .setTitle("Role Added")
                        .setDescription(`Added ${role} to ${target}.`)
                        .setTimestamp()
                ]
            });
        } catch (error) {
            console.error("[addrole]", error);
            return ctx.reply({ content: "Failed to add that role." });
        }
    }
});

registerCommand({
    name: "removerole",
    description: "Remove a role from a member",
    category: "Moderation",
    usage: ",removerole @user @role",
    slash: false,
    execute: async (ctx) => {
        if (!ctx.guild) {
            return ctx.reply({ content: "This command only works in a server." });
        }

        if (!ctx.member?.permissions?.has(PermissionsBitField.Flags.ManageRoles)) {
            return ctx.reply({ content: "You need **Manage Roles** permission." });
        }

        if (!ctx.guild.members.me?.permissions?.has(PermissionsBitField.Flags.ManageRoles)) {
            return ctx.reply({ content: "I need **Manage Roles** permission." });
        }

        const target = ctx.message?.mentions?.members?.first();
        const role = ctx.message?.mentions?.roles?.first();

        if (!target || !role) {
            return ctx.reply({ content: "Usage: `,removerole @user @role`" });
        }

        if (role.managed || role.position >= ctx.guild.members.me.roles.highest.position) {
            return ctx.reply({
                content: "I can't remove that role. Check role hierarchy."
            });
        }

        try {
            await target.roles.remove(role, `Role removed by ${ctx.user.tag}`);

            return ctx.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0x57f287)
                        .setTitle("Role Removed")
                        .setDescription(`Removed ${role} from ${target}.`)
                        .setTimestamp()
                ]
            });
        } catch (error) {
            console.error("[removerole]", error);
            return ctx.reply({ content: "Failed to remove that role." });
        }
    }
});

registerCommand({
    name: "roleinfo",
    description: "Show information about a role",
    category: "Utility",
    usage: ",roleinfo @role",
    slash: false,
    execute: async (ctx) => {
        if (!ctx.guild) {
            return ctx.reply({ content: "This command only works in a server." });
        }

        const role = ctx.message?.mentions?.roles?.first();

        if (!role) {
            return ctx.reply({ content: "Usage: `,roleinfo @role`" });
        }

        return ctx.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(role.color || 0x5865f2)
                    .setTitle("Role Information")
                    .addFields(
                        { name: "Name", value: role.name, inline: true },
                        { name: "ID", value: `\`${role.id}\``, inline: true },
                        { name: "Members", value: String(role.members.size), inline: true },
                        { name: "Position", value: String(role.position), inline: true },
                        { name: "Mentionable", value: role.mentionable ? "Yes" : "No", inline: true },
                        { name: "Hoisted", value: role.hoist ? "Yes" : "No", inline: true },
                        { name: "Created", value: `<t:${Math.floor(role.createdTimestamp / 1000)}:F>` }
                    )
            ]
        });
    }
});

registerCommand({
    name: "roles",
    description: "List server roles",
    category: "Utility",
    slash: false,
    execute: async (ctx) => {
        if (!ctx.guild) {
            return ctx.reply({ content: "This command only works in a server." });
        }

        const roles = [...ctx.guild.roles.cache.values()]
            .filter((role) => role.id !== ctx.guild.id)
            .sort((a, b) => b.position - a.position);

        if (!roles.length) {
            return ctx.reply({ content: "This server has no additional roles." });
        }

        const description = roles
            .slice(0, 40)
            .map((role) => `${role} — \`${role.id}\``)
            .join("\n");

        return ctx.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(0x5865f2)
                    .setTitle(`Server Roles (${roles.length})`)
                    .setDescription(description.slice(0, 4000))
                    .setFooter({
                        text: roles.length > 40
                            ? "Showing the first 40 roles."
                            : "All roles shown."
                    })
            ]
        });
    }
});

registerCommand({
    name: "nick",
    description: "Change a member's nickname",
    category: "Moderation",
    usage: ",nick @user <nickname>",
    slash: false,
    execute: async (ctx) => {
        if (!ctx.guild) {
            return ctx.reply({ content: "This command only works in a server." });
        }

        if (!ctx.member?.permissions?.has(PermissionsBitField.Flags.ManageNicknames)) {
            return ctx.reply({ content: "You need **Manage Nicknames** permission." });
        }

        if (!ctx.guild.members.me?.permissions?.has(PermissionsBitField.Flags.ManageNicknames)) {
            return ctx.reply({ content: "I need **Manage Nicknames** permission." });
        }

        const target = ctx.message?.mentions?.members?.first();
        const nickname = ctx.args?.slice(1).join(" ").trim();

        if (!target || !nickname) {
            return ctx.reply({ content: "Usage: `,nick @user <nickname>`" });
        }

        if (!target.manageable) {
            return ctx.reply({
                content: "I can't change that member's nickname because of role hierarchy."
            });
        }

        try {
            await target.setNickname(
                nickname.slice(0, 32),
                `Nickname changed by ${ctx.user.tag}`
            );

            return ctx.reply({
                content: `Changed ${target}'s nickname to **${nickname.slice(0, 32)}**.`
            });
        } catch (error) {
            console.error("[nick]", error);
            return ctx.reply({ content: "Failed to change the nickname." });
        }
    }
});

registerCommand({
    name: "resetnick",
    description: "Reset a member's nickname",
    category: "Moderation",
    usage: ",resetnick @user",
    slash: false,
    execute: async (ctx) => {
        if (!ctx.guild) {
            return ctx.reply({ content: "This command only works in a server." });
        }

        if (!ctx.member?.permissions?.has(PermissionsBitField.Flags.ManageNicknames)) {
            return ctx.reply({ content: "You need **Manage Nicknames** permission." });
        }

        if (!ctx.guild.members.me?.permissions?.has(PermissionsBitField.Flags.ManageNicknames)) {
            return ctx.reply({ content: "I need **Manage Nicknames** permission." });
        }

        const target = ctx.message?.mentions?.members?.first();

        if (!target) {
            return ctx.reply({ content: "Usage: `,resetnick @user`" });
        }

        if (!target.manageable) {
            return ctx.reply({ content: "I can't manage that member's nickname." });
        }

        try {
            await target.setNickname(null, `Nickname reset by ${ctx.user.tag}`);

            return ctx.reply({
                content: `Reset ${target}'s nickname.`
            });
        } catch (error) {
            console.error("[resetnick]", error);
            return ctx.reply({ content: "Failed to reset the nickname." });
        }
    }
});

registerCommand({
    name: "rolecreate",
    description: "Create a new server role",
    category: "Moderation",
    usage: ",rolecreate <name>",
    slash: false,
    execute: async (ctx) => {
        if (!ctx.guild) {
            return ctx.reply({ content: "This command only works in a server." });
        }

        if (!ctx.member?.permissions?.has(PermissionsBitField.Flags.ManageRoles)) {
            return ctx.reply({ content: "You need **Manage Roles** permission." });
        }

        if (!ctx.guild.members.me?.permissions?.has(PermissionsBitField.Flags.ManageRoles)) {
            return ctx.reply({ content: "I need **Manage Roles** permission." });
        }

        const name = String(ctx.args?.join(" ") || "").trim();

        if (!name) {
            return ctx.reply({ content: "Usage: `,rolecreate <name>`" });
        }

        try {
            const role = await ctx.guild.roles.create({
                name: name.slice(0, 100),
                reason: `Created by ${ctx.user.tag}`
            });

            return ctx.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0x57f287)
                        .setTitle("Role Created")
                        .setDescription(`Created ${role}.`)
                        .setTimestamp()
                ]
            });
        } catch (error) {
            console.error("[rolecreate]", error);
            return ctx.reply({ content: "Failed to create the role." });
        }
    }
});

registerCommand({
    name: "roledelete",
    description: "Delete a server role",
    category: "Moderation",
    usage: ",roledelete @role",
    slash: false,
    execute: async (ctx) => {
        if (!ctx.guild) {
            return ctx.reply({ content: "This command only works in a server." });
        }

        if (!ctx.member?.permissions?.has(PermissionsBitField.Flags.ManageRoles)) {
            return ctx.reply({ content: "You need **Manage Roles** permission." });
        }

        if (!ctx.guild.members.me?.permissions?.has(PermissionsBitField.Flags.ManageRoles)) {
            return ctx.reply({ content: "I need **Manage Roles** permission." });
        }

        const role = ctx.message?.mentions?.roles?.first();

        if (!role) {
            return ctx.reply({ content: "Usage: `,roledelete @role`" });
        }

        if (
            role.id === ctx.guild.id ||
            role.managed ||
            role.position >= ctx.guild.members.me.roles.highest.position
        ) {
            return ctx.reply({
                content: "I can't delete that role. Check role hierarchy."
            });
        }

        try {
            const roleName = role.name;

            await role.delete(`Deleted by ${ctx.user.tag}`);

            return ctx.reply({
                content: `Deleted role **${roleName}**.`
            });
        } catch (error) {
            console.error("[roledelete]", error);
            return ctx.reply({ content: "Failed to delete the role." });
        }
    }
});

// END PART 6/20// ============================================
// PART 7/20 — SERVER & MEMBER INFORMATION
// ============================================

registerCommand({
    name: "membercount",
    description: "Show the server member count",
    category: "Utility",
    slash: false,
    execute: async (ctx) => {
        if (!ctx.guild) {
            return ctx.reply({ content: "This command only works in a server." });
        }

        await ctx.guild.members.fetch().catch(() => {});

        return ctx.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(0x5865f2)
                    .setTitle("👥 Member Count")
                    .setDescription(
                        `**Total members:** ${ctx.guild.memberCount}`
                    )
                    .setTimestamp()
            ]
        });
    }
});

registerCommand({
    name: "servericon",
    description: "Show the server icon",
    category: "Utility",
    slash: false,
    execute: async (ctx) => {
        if (!ctx.guild) {
            return ctx.reply({ content: "This command only works in a server." });
        }

        const iconUrl = ctx.guild.iconURL({
            extension: "png",
            size: 1024
        });

        if (!iconUrl) {
            return ctx.reply({ content: "This server has no custom icon." });
        }

        return ctx.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(0x5865f2)
                    .setTitle(`${ctx.guild.name} — Server Icon`)
                    .setImage(iconUrl)
                    .setURL(iconUrl)
            ]
        });
    }
});

registerCommand({
    name: "serverbanner",
    description: "Show the server banner",
    category: "Utility",
    slash: false,
    execute: async (ctx) => {
        if (!ctx.guild) {
            return ctx.reply({ content: "This command only works in a server." });
        }

        const guild = await ctx.client.guilds.fetch(ctx.guild.id).catch(() => null);
        const bannerUrl = guild?.bannerURL({
            extension: "png",
            size: 1024
        });

        if (!bannerUrl) {
            return ctx.reply({
                content: "This server has no banner, or the banner isn't available."
            });
        }

        return ctx.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(0x5865f2)
                    .setTitle(`${ctx.guild.name} — Server Banner`)
                    .setImage(bannerUrl)
                    .setURL(bannerUrl)
            ]
        });
    }
});

registerCommand({
    name: "created",
    description: "Show when a user account was created",
    category: "Utility",
    usage: ",created [@user]",
    slash: false,
    execute: async (ctx) => {
        const target =
            ctx.message?.mentions?.users?.first() || ctx.user;

        return ctx.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(0x5865f2)
                    .setTitle("📅 Account Creation")
                    .setDescription(
                        `**User:** ${target.tag}\n` +
                        `**Created:** <t:${Math.floor(target.createdTimestamp / 1000)}:F>\n` +
                        `**Relative:** <t:${Math.floor(target.createdTimestamp / 1000)}:R>`
                    )
                    .setThumbnail(target.displayAvatarURL({ size: 256 }))
            ]
        });
    }
});

registerCommand({
    name: "joined",
    description: "Show when a member joined this server",
    category: "Utility",
    usage: ",joined [@user]",
    slash: false,
    execute: async (ctx) => {
        if (!ctx.guild) {
            return ctx.reply({ content: "This command only works in a server." });
        }

        const targetUser =
            ctx.message?.mentions?.users?.first() || ctx.user;

        const member = await ctx.guild.members
            .fetch(targetUser.id)
            .catch(() => null);

        if (!member) {
            return ctx.reply({ content: "That user isn't a member of this server." });
        }

        const joinedAt = member.joinedTimestamp;

        if (!joinedAt) {
            return ctx.reply({ content: "Join date isn't available." });
        }

        return ctx.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(0x5865f2)
                    .setTitle("📥 Server Join Date")
                    .setDescription(
                        `**Member:** ${member.user.tag}\n` +
                        `**Joined:** <t:${Math.floor(joinedAt / 1000)}:F>\n` +
                        `**Relative:** <t:${Math.floor(joinedAt / 1000)}:R>`
                    )
                    .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
            ]
        });
    }
});

registerCommand({
    name: "permissions",
    description: "Show a member's server permissions",
    category: "Utility",
    usage: ",permissions [@user]",
    slash: false,
    execute: async (ctx) => {
        if (!ctx.guild) {
            return ctx.reply({ content: "This command only works in a server." });
        }

        const targetUser =
            ctx.message?.mentions?.users?.first() || ctx.user;

        const member = await ctx.guild.members
            .fetch(targetUser.id)
            .catch(() => null);

        if (!member) {
            return ctx.reply({ content: "Member not found in this server." });
        }

        const permissionNames = member.permissions.toArray();

        const description = permissionNames.length
            ? permissionNames
                .slice(0, 35)
                .map((permission) =>
                    `• ${permission
                        .replace(/([A-Z])/g, " $1")
                        .trim()}`
                )
                .join("\n")
            : "No server permissions.";

        return ctx.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(0x5865f2)
                    .setTitle(`🔑 Permissions — ${member.user.tag}`)
                    .setDescription(description.slice(0, 4000))
                    .setFooter({
                        text: permissionNames.length > 35
                            ? "Showing the first 35 permissions."
                            : `Total permissions: ${permissionNames.length}`
                    })
            ]
        });
    }
});

registerCommand({
    name: "boosters",
    description: "List server boosters",
    category: "Utility",
    slash: false,
    execute: async (ctx) => {
        if (!ctx.guild) {
            return ctx.reply({ content: "This command only works in a server." });
        }

        await ctx.guild.members.fetch().catch(() => {});

        const boosters = ctx.guild.members.cache
            .filter((member) => member.premiumSinceTimestamp)
            .sort(
                (a, b) =>
                    (a.premiumSinceTimestamp || 0) -
                    (b.premiumSinceTimestamp || 0)
            );

        if (!boosters.size) {
            return ctx.reply({
                content: "There are currently no server boosters."
            });
        }

        const description = [...boosters.values()]
            .slice(0, 40)
            .map((member, index) =>
                `**${index + 1}.** ${member.user.tag}`
            )
            .join("\n");

        return ctx.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(0xeb459e)
                    .setTitle(`💎 Server Boosters (${boosters.size})`)
                    .setDescription(description)
                    .setFooter({
                        text: boosters.size > 40
                            ? "Showing the first 40 boosters."
                            : "Thank you to all boosters!"
                    })
            ]
        });
    }
});

registerCommand({
    name: "emojis",
    description: "List custom server emojis",
    category: "Utility",
    slash: false,
    execute: async (ctx) => {
        if (!ctx.guild) {
            return ctx.reply({ content: "This command only works in a server." });
        }

        const emojis = [...ctx.guild.emojis.cache.values()];

        if (!emojis.length) {
            return ctx.reply({
                content: "This server has no custom emojis."
            });
        }

        const description = emojis
            .slice(0, 50)
            .map((emoji) => `${emoji} \`:${emoji.name}:\``)
            .join("\n");

        return ctx.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(0x5865f2)
                    .setTitle(`😀 Server Emojis (${emojis.length})`)
                    .setDescription(description.slice(0, 4000))
                    .setFooter({
                        text: emojis.length > 50
                            ? "Showing the first 50 emojis."
                            : "All emojis shown."
                    })
            ]
        });
    }
});

registerCommand({
    name: "channels",
    description: "List server channels",
    category: "Utility",
    slash: false,
    execute: async (ctx) => {
        if (!ctx.guild) {
            return ctx.reply({ content: "This command only works in a server." });
        }

        const channels = [...ctx.guild.channels.cache.values()]
            .sort((a, b) => a.rawPosition - b.rawPosition);

        if (!channels.length) {
            return ctx.reply({ content: "No channels found." });
        }

        const description = channels
            .slice(0, 40)
            .map((channel) => {
                const typeName = {
                    0: "Text",
                    2: "Voice",
                    4: "Category",
                    5: "Announcement",
                    13: "Stage",
                    15: "Forum",
                    16: "Media"
                }[channel.type] || "Other";

                return `• ${channel.name} — ${typeName}`;
            })
            .join("\n");

        return ctx.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(0x5865f2)
                    .setTitle(`📚 Channels (${channels.length})`)
                    .setDescription(description.slice(0, 4000))
                    .setFooter({
                        text: channels.length > 40
                            ? "Showing the first 40 channels."
                            : "All channels shown."
                    })
            ]
        });
    }
});

registerCommand({
    name: "botstats",
    description: "Show bot runtime statistics",
    category: "Utility",
    slash: false,
    execute: async (ctx) => {
        const client = ctx.client;
        const uptime = Math.floor(client.uptime || 0);

        const days = Math.floor(uptime / 86400000);
        const hours = Math.floor((uptime % 86400000) / 3600000);
        const minutes = Math.floor((uptime % 3600000) / 60000);
        const seconds = Math.floor((uptime % 60000) / 1000);

        return ctx.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(0x5865f2)
                    .setTitle("📊 PYRR OFFICIAL Statistics")
                    .addFields(
                        {
                            name: "Servers",
                            value: String(client.guilds.cache.size),
                            inline: true
                        },
                        {
                            name: "Users Cached",
                            value: String(client.users.cache.size),
                            inline: true
                        },
                        {
                            name: "Channels Cached",
                            value: String(client.channels.cache.size),
                            inline: true
                        },
                        {
                            name: "Ping",
                            value: `${client.ws.ping} ms`,
                            inline: true
                        },
                        {
                            name: "Uptime",
                            value: `${days}d ${hours}h ${minutes}m ${seconds}s`,
                            inline: true
                        },
                        {
                            name: "Node.js",
                            value: process.version,
                            inline: true
                        }
                    )
                    .setTimestamp()
            ]
        });
    }
});

// END PART 7/20// ============================================
// PART 8/20 — WELCOME, GOODBYE & AUTO-ROLE
// ============================================

registerCommand({
    name: "setwelcome",
    description: "Set the welcome channel",
    category: "Configuration",
    usage: ",setwelcome #channel",
    slash: false,
    execute: async (ctx) => {
        if (!ctx.guild) {
            return ctx.reply({ content: "This command only works in a server." });
        }

        if (!ctx.member?.permissions?.has(PermissionsBitField.Flags.ManageGuild)) {
            return ctx.reply({ content: "You need **Manage Server** permission." });
        }

        const channel = ctx.message?.mentions?.channels?.first();

        if (!channel || !channel.isTextBased()) {
            return ctx.reply({ content: "Usage: `,setwelcome #channel`" });
        }

        const config = getConfig(ctx.guild.id);
        config.welcomeChannel = channel.id;
        saveDatabase();

        return ctx.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(0x57f287)
                    .setTitle("Welcome Channel Updated")
                    .setDescription(`Welcome messages will use ${channel}.`)
            ]
        });
    }
});

registerCommand({
    name: "setgoodbye",
    description: "Set the goodbye channel",
    category: "Configuration",
    usage: ",setgoodbye #channel",
    slash: false,
    execute: async (ctx) => {
        if (!ctx.guild) {
            return ctx.reply({ content: "This command only works in a server." });
        }

        if (!ctx.member?.permissions?.has(PermissionsBitField.Flags.ManageGuild)) {
            return ctx.reply({ content: "You need **Manage Server** permission." });
        }

        const channel = ctx.message?.mentions?.channels?.first();

        if (!channel || !channel.isTextBased()) {
            return ctx.reply({ content: "Usage: `,setgoodbye #channel`" });
        }

        const config = getConfig(ctx.guild.id);
        config.goodbyeChannel = channel.id;
        saveDatabase();

        return ctx.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(0x5865f2)
                    .setTitle("Goodbye Channel Updated")
                    .setDescription(`Goodbye messages will use ${channel}.`)
            ]
        });
    }
});

registerCommand({
    name: "setautorole",
    description: "Set the role automatically given to new members",
    category: "Configuration",
    usage: ",setautorole @role",
    slash: false,
    execute: async (ctx) => {
        if (!ctx.guild) {
            return ctx.reply({ content: "This command only works in a server." });
        }

        if (!ctx.member?.permissions?.has(PermissionsBitField.Flags.ManageRoles)) {
            return ctx.reply({ content: "You need **Manage Roles** permission." });
        }

        if (!ctx.guild.members.me?.permissions?.has(PermissionsBitField.Flags.ManageRoles)) {
            return ctx.reply({ content: "I need **Manage Roles** permission." });
        }

        const role = ctx.message?.mentions?.roles?.first();

        if (!role) {
            return ctx.reply({ content: "Usage: `,setautorole @role`" });
        }

        if (
            role.managed ||
            role.id === ctx.guild.id ||
            role.position >= ctx.guild.members.me.roles.highest.position
        ) {
            return ctx.reply({
                content: "I can't assign that role. Check role hierarchy."
            });
        }

        const config = getConfig(ctx.guild.id);
        config.autoRole = role.id;
        saveDatabase();

        return ctx.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(0x57f287)
                    .setTitle("Auto-Role Enabled")
                    .setDescription(`New members will receive ${role} when they join.`)
            ]
        });
    }
});

registerCommand({
    name: "disableautorole",
    description: "Disable automatic role assignment",
    category: "Configuration",
    slash: false,
    execute: async (ctx) => {
        if (!ctx.guild) {
            return ctx.reply({ content: "This command only works in a server." });
        }

        if (!ctx.member?.permissions?.has(PermissionsBitField.Flags.ManageRoles)) {
            return ctx.reply({ content: "You need **Manage Roles** permission." });
        }

        const config = getConfig(ctx.guild.id);
        config.autoRole = null;
        saveDatabase();

        return ctx.reply({
            content: "Automatic role assignment has been disabled."
        });
    }
});

registerCommand({
    name: "welcomeconfig",
    description: "Show the welcome and goodbye configuration",
    category: "Configuration",
    slash: false,
    execute: async (ctx) => {
        if (!ctx.guild) {
            return ctx.reply({ content: "This command only works in a server." });
        }

        if (!ctx.member?.permissions?.has(PermissionsBitField.Flags.ManageGuild)) {
            return ctx.reply({ content: "You need **Manage Server** permission." });
        }

        const config = getConfig(ctx.guild.id);

        return ctx.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(0x5865f2)
                    .setTitle("Welcome Configuration")
                    .addFields(
                        {
                            name: "Welcome Channel",
                            value: config.welcomeChannel
                                ? `<#${config.welcomeChannel}>`
                                : "Not configured",
                            inline: false
                        },
                        {
                            name: "Goodbye Channel",
                            value: config.goodbyeChannel
                                ? `<#${config.goodbyeChannel}>`
                                : "Not configured",
                            inline: false
                        },
                        {
                            name: "Auto-Role",
                            value: config.autoRole
                                ? `<@&${config.autoRole}>`
                                : "Disabled",
                            inline: false
                        }
                    )
            ]
        });
    }
});

// ============================================
// WELCOME & GOODBYE EVENT HANDLERS
// ============================================

client.on("guildMemberAdd", async (member) => {
    try {
        const config = getConfig(member.guild.id);

        if (config.autoRole) {
            const role = await member.guild.roles
                .fetch(config.autoRole)
                .catch(() => null);

            if (
                role &&
                !role.managed &&
                role.position < member.guild.members.me?.roles.highest.position
            ) {
                await member.roles.add(role, "Configured automatic role")
                    .catch((error) => {
                        console.error("[autorole]", error.message);
                    });
            }
        }

        if (config.welcomeChannel) {
            const channel = await member.guild.channels
                .fetch(config.welcomeChannel)
                .catch(() => null);

            if (channel?.isTextBased()) {
                await channel.send({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0x57f287)
                            .setTitle("👋 Welcome!")
                            .setDescription(
                                `Welcome ${member} to **${member.guild.name}**!\n` +
                                `You are member **#${member.guild.memberCount}**.`
                            )
                            .setThumbnail(
                                member.user.displayAvatarURL({ size: 256 })
                            )
                            .setFooter({
                                text: `Member ID: ${member.id}`
                            })
                            .setTimestamp()
                    ],
                    allowedMentions: {
                        users: [member.id]
                    }
                });
            }
        }
    } catch (error) {
        console.error("[guildMemberAdd]", error);
    }
});

client.on("guildMemberRemove", async (member) => {
    try {
        const config = getConfig(member.guild.id);

        if (!config.goodbyeChannel) return;

        const channel = await member.guild.channels
            .fetch(config.goodbyeChannel)
            .catch(() => null);

        if (!channel?.isTextBased()) return;

        await channel.send({
            embeds: [
                new EmbedBuilder()
                    .setColor(0xed4245)
                    .setTitle("👋 Member Left")
                    .setDescription(
                        `**${member.user.tag}** has left **${member.guild.name}**.`
                    )
                    .setThumbnail(
                        member.user.displayAvatarURL({ size: 256 })
                    )
                    .setTimestamp()
            ],
            allowedMentions: {
                parse: []
            }
        });
    } catch (error) {
        console.error("[guildMemberRemove]", error);
    }
});

// END PART 8/20// ============================================
// PYRR OFFICIAL — PART 9/20
// AUTOMOD & ANTI-SPAM
// ============================================

registerCommand({
  name: "automod",
  description: "Enable or disable basic automod",
  usage: ",automod <on/off>",
  slash: false,
  execute: async (ctx) => {
    if (!ctx.guild) return ctx.reply("❌ Server only.");
    if (!(await requireModerator(ctx))) return;

    const action = (ctx.args[0] || "").toLowerCase();

    if (!["on", "off"].includes(action)) {
      return ctx.reply("Usage: `,automod on` or `,automod off`");
    }

    const config = getConfig(ctx.guild.id);
    config.automodEnabled = action === "on";
    saveDatabase();

    return ctx.reply(
      `🛡️ Automod is now **${action.toUpperCase()}**.`
    );
  }
});

registerCommand({
  name: "antispam",
  description: "Configure anti-spam protection",
  usage: ",antispam <on/off>",
  slash: false,
  execute: async (ctx) => {
    if (!ctx.guild) return ctx.reply("❌ Server only.");
    if (!(await requireModerator(ctx))) return;

    const action = (ctx.args[0] || "").toLowerCase();

    if (!["on", "off"].includes(action)) {
      return ctx.reply("Usage: `,antispam on` or `,antispam off`");
    }

    const config = getConfig(ctx.guild.id);
    config.antiSpamEnabled = action === "on";
    saveDatabase();

    return ctx.reply(
      `🚦 Anti-spam is now **${action.toUpperCase()}**.`
    );
  }
});

registerCommand({
  name: "capsfilter",
  description: "Enable or disable excessive caps filtering",
  usage: ",capsfilter <on/off>",
  slash: false,
  execute: async (ctx) => {
    if (!ctx.guild) return ctx.reply("❌ Server only.");
    if (!(await requireModerator(ctx))) return;

    const action = (ctx.args[0] || "").toLowerCase();

    if (!["on", "off"].includes(action)) {
      return ctx.reply("Usage: `,capsfilter on` or `,capsfilter off`");
    }

    const config = getConfig(ctx.guild.id);
    config.capsFilterEnabled = action === "on";
    saveDatabase();

    return ctx.reply(
      `🔠 Caps filter is now **${action.toUpperCase()}**.`
    );
  }
});

registerCommand({
  name: "linkfilter",
  description: "Enable or disable link filtering",
  usage: ",linkfilter <on/off>",
  slash: false,
  execute: async (ctx) => {
    if (!ctx.guild) return ctx.reply("❌ Server only.");
    if (!(await requireModerator(ctx))) return;

    const action = (ctx.args[0] || "").toLowerCase();

    if (!["on", "off"].includes(action)) {
      return ctx.reply("Usage: `,linkfilter on` or `,linkfilter off`");
    }

    const config = getConfig(ctx.guild.id);
    config.linkFilterEnabled = action === "on";
    saveDatabase();

    return ctx.reply(
      `🔗 Link filter is now **${action.toUpperCase()}**.`
    );
  }
});

registerCommand({
  name: "invitefilter",
  description: "Enable or disable Discord invite filtering",
  usage: ",invitefilter <on/off>",
  slash: false,
  execute: async (ctx) => {
    if (!ctx.guild) return ctx.reply("❌ Server only.");
    if (!(await requireModerator(ctx))) return;

    const action = (ctx.args[0] || "").toLowerCase();

    if (!["on", "off"].includes(action)) {
      return ctx.reply("Usage: `,invitefilter on` or `,invitefilter off`");
    }

    const config = getConfig(ctx.guild.id);
    config.inviteFilterEnabled = action === "on";
    saveDatabase();

    return ctx.reply(
      `📨 Invite filter is now **${action.toUpperCase()}**.`
    );
  }
});

registerCommand({
  name: "badwordfilter",
  description: "Enable or disable configured word filtering",
  usage: ",badwordfilter <on/off>",
  slash: false,
  execute: async (ctx) => {
    if (!ctx.guild) return ctx.reply("❌ Server only.");
    if (!(await requireModerator(ctx))) return;

    const action = (ctx.args[0] || "").toLowerCase();

    if (!["on", "off"].includes(action)) {
      return ctx.reply("Usage: `,badwordfilter on` or `,badwordfilter off`");
    }

    const config = getConfig(ctx.guild.id);
    config.badWordFilterEnabled = action === "on";
    saveDatabase();

    return ctx.reply(
      `🤬 Word filter is now **${action.toUpperCase()}**.`
    );
  }
});

registerCommand({
  name: "automodconfig",
  description: "View the server automod settings",
  usage: ",automodconfig",
  slash: false,
  execute: async (ctx) => {
    if (!ctx.guild) return ctx.reply("❌ Server only.");

    const config = getConfig(ctx.guild.id);

    const status = (value) =>
      value ? "✅ Enabled" : "❌ Disabled";

    const embed = new EmbedBuilder()
      .setColor(0x202020)
      .setTitle("🛡️ PYRR AUTOMOD CONFIG")
      .setDescription(
        [
          `**Automod:** ${status(config.automodEnabled)}`,
          `**Anti-spam:** ${status(config.antiSpamEnabled)}`,
          `**Caps filter:** ${status(config.capsFilterEnabled)}`,
          `**Link filter:** ${status(config.linkFilterEnabled)}`,
          `**Invite filter:** ${status(config.inviteFilterEnabled)}`,
          `**Word filter:** ${status(config.badWordFilterEnabled)}`
        ].join("\n")
      )
      .setFooter({ text: "PYRR OFFICIAL • Server protection" });

    return ctx.reply({ embeds: [embed] });
  }
});

// --------------------------------------------
// AUTOMOD MESSAGE EVENT
// --------------------------------------------

client.on("messageCreate", async (message) => {
  try {
    if (!message.guild) return;
    if (message.author.bot) return;

    const config = getConfig(message.guild.id);

    if (!config.automodEnabled) return;

    const content = message.content || "";
    const lower = content.toLowerCase();

    const isModerator =
      message.member?.permissions?.has(
        PermissionsBitField.Flags.ManageMessages
      ) ||
      message.member?.permissions?.has(
        PermissionsBitField.Flags.Administrator
      );

    if (isModerator) return;

    // Anti-spam: track recent messages per user.
    if (!client.pyrrSpamTracker) {
      client.pyrrSpamTracker = new Map();
    }

    if (config.antiSpamEnabled) {
      const key = `${message.guild.id}:${message.author.id}`;
      const now = Date.now();
      const previous = client.pyrrSpamTracker.get(key) || [];

      const recent = previous.filter(
        (timestamp) => now - timestamp < 6000
      );

      recent.push(now);
      client.pyrrSpamTracker.set(key, recent);

      if (recent.length >= 6) {
        await message.delete().catch(() => null);

        await message.channel.send({
          content: `⚠️ ${message.author}, slow down! Anti-spam detected repeated messages.`
        }).then((warning) => {
          setTimeout(() => {
            warning.delete().catch(() => null);
          }, 5000);
        }).catch(() => null);

        client.pyrrSpamTracker.set(key, []);
        return;
      }
    }

    // Caps filter: applies only to longer messages.
    if (config.capsFilterEnabled && content.length >= 12) {
      const letters = content.replace(/[^a-z]/gi, "");
      const uppercase = letters.replace(/[^A-Z]/g, "").length;

      if (
        letters.length >= 12 &&
        uppercase / letters.length >= 0.8
      ) {
        await message.delete().catch(() => null);

        return message.channel.send({
          content: `🔠 ${message.author}, please avoid excessive caps.`
        }).then((warning) => {
          setTimeout(() => {
            warning.delete().catch(() => null);
          }, 5000);
        }).catch(() => null);
      }
    }

    // Link filter.
    if (
      config.linkFilterEnabled &&
      /https?:\/\/|www\./i.test(content)
    ) {
      await message.delete().catch(() => null);

      return message.channel.send({
        content: `🔗 ${message.author}, links are disabled in this server.`
      }).then((warning) => {
        setTimeout(() => {
          warning.delete().catch(() => null);
        }, 5000);
      }).catch(() => null);
    }

    // Discord invite filter.
    if (
      config.inviteFilterEnabled &&
      /(discord\.gg\/|discord\.com\/invite\/|discordapp\.com\/invite\/)/i.test(
        lower
      )
    ) {
      await message.delete().catch(() => null);

      return message.channel.send({
        content: `📨 ${message.author}, Discord invites are not allowed here.`
      }).then((warning) => {
        setTimeout(() => {
          warning.delete().catch(() => null);
        }, 5000);
      }).catch(() => null);
    }

    // Configurable word filter.
    const blockedWords = Array.isArray(config.blockedWords)
      ? config.blockedWords
      : [];

    if (
      config.badWordFilterEnabled &&
      blockedWords.some((word) =>
        typeof word === "string" &&
        word.trim() &&
        lower.includes(word.toLowerCase())
      )
    ) {
      await message.delete().catch(() => null);

      return message.channel.send({
        content: `🚫 ${message.author}, your message contains a blocked word.`
      }).then((warning) => {
        setTimeout(() => {
          warning.delete().catch(() => null);
        }, 5000);
      }).catch(() => null);
    }
  } catch (error) {
    console.error("[PYRR AUTOMOD ERROR]", error);
  }
});

// --------------------------------------------
// BLOCKED WORD MANAGEMENT
// --------------------------------------------

registerCommand({
  name: "blockword",
  description: "Add a word to the server blocklist",
  usage: ",blockword <word>",
  slash: false,
  execute: async (ctx) => {
    if (!ctx.guild) return ctx.reply("❌ Server only.");
    if (!(await requireModerator(ctx))) return;

    const word = ctx.args.join(" ").trim().toLowerCase();

    if (!word) {
      return ctx.reply("Usage: `,blockword <word>`");
    }

    if (word.length > 50) {
      return ctx.reply("❌ Word or phrase must be 50 characters or fewer.");
    }

    const config = getConfig(ctx.guild.id);

    if (!Array.isArray(config.blockedWords)) {
      config.blockedWords = [];
    }

    if (config.blockedWords.includes(word)) {
      return ctx.reply("⚠️ That word is already blocked.");
    }

    config.blockedWords.push(word);
    saveDatabase();

    return ctx.reply(`✅ Added \`${word}\` to the blocked-word list.`);
  }
});

registerCommand({
  name: "unblockword",
  description: "Remove a word from the server blocklist",
  usage: ",unblockword <word>",
  slash: false,
  execute: async (ctx) => {
    if (!ctx.guild) return ctx.reply("❌ Server only.");
    if (!(await requireModerator(ctx))) return;

    const word = ctx.args.join(" ").trim().toLowerCase();

    if (!word) {
      return ctx.reply("Usage: `,unblockword <word>`");
    }

    const config = getConfig(ctx.guild.id);

    if (!Array.isArray(config.blockedWords)) {
      config.blockedWords = [];
    }

    const index = config.blockedWords.indexOf(word);

    if (index === -1) {
      return ctx.reply("❌ That word is not in the blocklist.");
    }

    config.blockedWords.splice(index, 1);
    saveDatabase();

    return ctx.reply(`✅ Removed \`${word}\` from the blocklist.`);
  }
});

registerCommand({
  name: "blockedwords",
  description: "List blocked words for this server",
  usage: ",blockedwords",
  slash: false,
  execute: async (ctx) => {
    if (!ctx.guild) return ctx.reply("❌ Server only.");

    const config = getConfig(ctx.guild.id);
    const words = Array.isArray(config.blockedWords)
      ? config.blockedWords
      : [];

    if (!words.length) {
      return ctx.reply("📭 No blocked words have been configured.");
    }

    const display = words
      .slice(0, 50)
      .map((word, index) => `**${index + 1}.** \`${word}\``)
      .join("\n");

    return ctx.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x202020)
          .setTitle("🚫 BLOCKED WORDS")
          .setDescription(display)
          .setFooter({
            text: `${words.length} blocked word(s) configured`
          })
      ]
    });
  }
});

// END PART 9/20// ============================================
// PYRR OFFICIAL — PART 10/20
// LOGGING SYSTEM & MODERATION LOGS
// ============================================

registerCommand({
  name: "setmodlog",
  description: "Set the moderation log channel",
  usage: ",setmodlog #channel",
  slash: false,
  execute: async (ctx) => {
    if (!ctx.guild) return ctx.reply("❌ Server only.");
    if (!(await requireModerator(ctx))) return;

    const channel =
      ctx.message?.mentions?.channels?.first() ||
      ctx.guild.channels.cache.get(ctx.args[0]);

    if (!channel || !channel.isTextBased()) {
      return ctx.reply("Usage: `,setmodlog #channel`");
    }

    const config = getConfig(ctx.guild.id);
    config.modLogChannel = channel.id;
    saveDatabase();

    return ctx.reply(`✅ Moderation logs will be sent to ${channel}.`);
  }
});

registerCommand({
  name: "setserverlog",
  description: "Set the server event log channel",
  usage: ",setserverlog #channel",
  slash: false,
  execute: async (ctx) => {
    if (!ctx.guild) return ctx.reply("❌ Server only.");
    if (!(await requireModerator(ctx))) return;

    const channel =
      ctx.message?.mentions?.channels?.first() ||
      ctx.guild.channels.cache.get(ctx.args[0]);

    if (!channel || !channel.isTextBased()) {
      return ctx.reply("Usage: `,setserverlog #channel`");
    }

    const config = getConfig(ctx.guild.id);
    config.serverLogChannel = channel.id;
    saveDatabase();

    return ctx.reply(`✅ Server event logs will be sent to ${channel}.`);
  }
});

registerCommand({
  name: "setmessagelog",
  description: "Set the message edit/delete log channel",
  usage: ",setmessagelog #channel",
  slash: false,
  execute: async (ctx) => {
    if (!ctx.guild) return ctx.reply("❌ Server only.");
    if (!(await requireModerator(ctx))) return;

    const channel =
      ctx.message?.mentions?.channels?.first() ||
      ctx.guild.channels.cache.get(ctx.args[0]);

    if (!channel || !channel.isTextBased()) {
      return ctx.reply("Usage: `,setmessagelog #channel`");
    }

    const config = getConfig(ctx.guild.id);
    config.messageLogChannel = channel.id;
    saveDatabase();

    return ctx.reply(`✅ Message logs will be sent to ${channel}.`);
  }
});

registerCommand({
  name: "logconfig",
  description: "View configured logging channels",
  usage: ",logconfig",
  slash: false,
  execute: async (ctx) => {
    if (!ctx.guild) return ctx.reply("❌ Server only.");

    const config = getConfig(ctx.guild.id);

    const modChannel = config.modLogChannel
      ? `<#${config.modLogChannel}>`
      : "Not configured";

    const serverChannel = config.serverLogChannel
      ? `<#${config.serverLogChannel}>`
      : "Not configured";

    const messageChannel = config.messageLogChannel
      ? `<#${config.messageLogChannel}>`
      : "Not configured";

    const embed = new EmbedBuilder()
      .setColor(0x202020)
      .setTitle("🧾 PYRR LOG CONFIG")
      .addFields(
        {
          name: "Moderation Logs",
          value: modChannel,
          inline: false
        },
        {
          name: "Server Event Logs",
          value: serverChannel,
          inline: false
        },
        {
          name: "Message Logs",
          value: messageChannel,
          inline: false
        }
      )
      .setFooter({ text: "PYRR OFFICIAL" });

    return ctx.reply({ embeds: [embed] });
  }
});

registerCommand({
  name: "clearlogs",
  description: "Remove all configured log channels",
  usage: ",clearlogs",
  slash: false,
  execute: async (ctx) => {
    if (!ctx.guild) return ctx.reply("❌ Server only.");
    if (!(await requireModerator(ctx))) return;

    const config = getConfig(ctx.guild.id);

    delete config.modLogChannel;
    delete config.serverLogChannel;
    delete config.messageLogChannel;

    saveDatabase();

    return ctx.reply("✅ All logging channels have been unset.");
  }
});

// --------------------------------------------
// LOGGING HELPER
// --------------------------------------------

async function pyrrSendLog(guild, configKey, embed) {
  try {
    if (!guild) return;

    const config = getConfig(guild.id);
    const channelId = config[configKey];

    if (!channelId) return;

    const channel =
      guild.channels.cache.get(channelId) ||
      await guild.channels.fetch(channelId).catch(() => null);

    if (!channel || !channel.isTextBased()) return;

    await channel.send({ embeds: [embed] }).catch(() => null);
  } catch (error) {
    console.error("[PYRR LOG ERROR]", error);
  }
}

function pyrrLogEmbed(title, description, color = 0x202020) {
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(description || "No additional details.")
    .setTimestamp()
    .setFooter({ text: "PYRR OFFICIAL • Audit Logs" });
}

// --------------------------------------------
// MEMBER JOIN / LEAVE LOGS
// --------------------------------------------

client.on("guildMemberAdd", async (member) => {
  const embed = pyrrLogEmbed(
    "📥 Member Joined",
    [
      `**User:** ${member.user.tag}`,
      `**ID:** \`${member.id}\``,
      `**Account Created:** <t:${Math.floor(
        member.user.createdTimestamp / 1000
      )}:R>`,
      `**Members:** ${member.guild.memberCount}`
    ].join("\n"),
    0x2ecc71
  );

  await pyrrSendLog(member.guild, "serverLogChannel", embed);
});

client.on("guildMemberRemove", async (member) => {
  const embed = pyrrLogEmbed(
    "📤 Member Left",
    [
      `**User:** ${member.user?.tag || "Unknown user"}`,
      `**ID:** \`${member.id}\``,
      `**Members:** ${member.guild.memberCount}`
    ].join("\n"),
    0xe74c3c
  );

  await pyrrSendLog(member.guild, "serverLogChannel", embed);
});

// --------------------------------------------
// MESSAGE DELETE LOGS
// --------------------------------------------

client.on("messageDelete", async (message) => {
  try {
    if (!message.guild || message.author?.bot) return;

    const embed = pyrrLogEmbed(
      "🗑️ Message Deleted",
      [
        `**Author:** ${message.author?.tag || "Unknown"}`,
        `**User ID:** \`${message.author?.id || "Unknown"}\``,
        `**Channel:** ${message.channel}`,
        `**Message ID:** \`${message.id}\``,
        "",
        "**Content:**",
        (message.content || "*Unavailable or empty*").slice(0, 1500)
      ].join("\n"),
      0xe74c3c
    );

    await pyrrSendLog(message.guild, "messageLogChannel", embed);
  } catch (error) {
    console.error("[PYRR DELETE LOG ERROR]", error);
  }
});

// --------------------------------------------
// MESSAGE EDIT LOGS
// --------------------------------------------

client.on("messageUpdate", async (oldMessage, newMessage) => {
  try {
    if (!newMessage.guild || newMessage.author?.bot) return;

    if (oldMessage.partial) {
      await oldMessage.fetch().catch(() => null);
    }

    if (newMessage.partial) {
      await newMessage.fetch().catch(() => null);
    }

    if (oldMessage.content === newMessage.content) return;

    const embed = pyrrLogEmbed(
      "✏️ Message Edited",
      [
        `**Author:** ${newMessage.author?.tag || "Unknown"}`,
        `**User ID:** \`${newMessage.author?.id || "Unknown"}\``,
        `**Channel:** ${newMessage.channel}`,
        `**Message:** https://discord.com/channels/${newMessage.guild.id}/${newMessage.channel.id}/${newMessage.id}`,
        "",
        "**Before:**",
        (oldMessage.content || "*Unavailable*").slice(0, 700),
        "",
        "**After:**",
        (newMessage.content || "*Unavailable*").slice(0, 700)
      ].join("\n"),
      0xf1c40f
    );

    await pyrrSendLog(newMessage.guild, "messageLogChannel", embed);
  } catch (error) {
    console.error("[PYRR EDIT LOG ERROR]", error);
  }
});

// --------------------------------------------
// CHANNEL CREATE / DELETE LOGS
// --------------------------------------------

client.on("channelCreate", async (channel) => {
  if (!channel.guild) return;

  const embed = pyrrLogEmbed(
    "📁 Channel Created",
    [
      `**Channel:** ${channel}`,
      `**Name:** ${channel.name}`,
      `**ID:** \`${channel.id}\``,
      `**Type:** ${channel.type}`
    ].join("\n"),
    0x2ecc71
  );

  await pyrrSendLog(channel.guild, "serverLogChannel", embed);
});

client.on("channelDelete", async (channel) => {
  if (!channel.guild) return;

  const embed = pyrrLogEmbed(
    "🗑️ Channel Deleted",
    [
      `**Name:** ${channel.name || "Unknown"}`,
      `**ID:** \`${channel.id}\``,
      `**Type:** ${channel.type}`
    ].join("\n"),
    0xe74c3c
  );

  await pyrrSendLog(channel.guild, "serverLogChannel", embed);
});

// --------------------------------------------
// ROLE CREATE / DELETE LOGS
// --------------------------------------------

client.on("roleCreate", async (role) => {
  const embed = pyrrLogEmbed(
    "🆕 Role Created",
    [
      `**Role:** ${role.name}`,
      `**ID:** \`${role.id}\``,
      `**Color:** ${role.hexColor}`
    ].join("\n"),
    0x2ecc71
  );

  await pyrrSendLog(role.guild, "serverLogChannel", embed);
});

client.on("roleDelete", async (role) => {
  const embed = pyrrLogEmbed(
    "🗑️ Role Deleted",
    [
      `**Role:** ${role.name}`,
      `**ID:** \`${role.id}\``
    ].join("\n"),
    0xe74c3c
  );

  await pyrrSendLog(role.guild, "serverLogChannel", embed);
});

// --------------------------------------------
// MODERATION COMMAND AUDIT HELPER
// Other parts can call this function.
// --------------------------------------------

async function pyrrModerationLog(guild, action, moderator, target, reason) {
  const embed = pyrrLogEmbed(
    `🛡️ Moderation: ${action}`,
    [
      `**Moderator:** ${moderator?.tag || moderator?.user?.tag || "Unknown"}`,
      `**Target:** ${target?.tag || target?.user?.tag || target?.id || "Unknown"}`,
      `**Reason:** ${reason || "No reason provided"}`
    ].join("\n"),
    0xe67e22
  );

  await pyrrSendLog(guild, "modLogChannel", embed);
}

// END PART 10/20// ============================================
// PYRR OFFICIAL — PART 11/20
// TICKETS & SUPPORT SYSTEM
// ============================================

registerCommand({
  name: "ticketsetup",
  description: "Create a ticket support panel",
  usage: ",ticketsetup",
  slash: false,
  execute: async (ctx) => {
    if (!ctx.guild) return ctx.reply("❌ Server only.");
    if (!(await requireModerator(ctx))) return;

    const embed = new EmbedBuilder()
      .setColor(0x202020)
      .setTitle("🎫 PYRR SUPPORT CENTER")
      .setDescription(
        "Need help or want to contact the staff team?\n\n" +
        "Press **Create Ticket** below to open a private support channel."
      )
      .setFooter({ text: "PYRR OFFICIAL • Support System" });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("pyrr_ticket_create")
        .setLabel("Create Ticket")
        .setEmoji("🎫")
        .setStyle(ButtonStyle.Primary)
    );

    return ctx.reply({ embeds: [embed], components: [row] });
  }
});

registerCommand({
  name: "ticketcategory",
  description: "Set the category for ticket channels",
  usage: ",ticketcategory <category ID>",
  slash: false,
  execute: async (ctx) => {
    if (!ctx.guild) return ctx.reply("❌ Server only.");
    if (!(await requireModerator(ctx))) return;

    const categoryId = ctx.args[0];
    if (!categoryId) {
      return ctx.reply("Usage: `,ticketcategory <category ID>`");
    }

    const category = ctx.guild.channels.cache.get(categoryId);

    if (!category || category.type !== ChannelType.GuildCategory) {
      return ctx.reply("❌ Please provide a valid category ID.");
    }

    const config = getConfig(ctx.guild.id);
    config.ticketCategory = category.id;
    saveDatabase();

    return ctx.reply(`✅ Ticket category set to **${category.name}**.`);
  }
});

registerCommand({
  name: "ticketstaff",
  description: "Set the staff role for tickets",
  usage: ",ticketstaff <role ID or mention>",
  slash: false,
  execute: async (ctx) => {
    if (!ctx.guild) return ctx.reply("❌ Server only.");
    if (!(await requireModerator(ctx))) return;

    const role =
      ctx.message?.mentions?.roles?.first() ||
      ctx.guild.roles.cache.get(ctx.args[0]);

    if (!role) {
      return ctx.reply("Usage: `,ticketstaff @Staff` or `,ticketstaff ROLE_ID`");
    }

    const config = getConfig(ctx.guild.id);
    config.ticketStaffRole = role.id;
    saveDatabase();

    return ctx.reply(`✅ Ticket staff role set to ${role}.`);
  }
});

registerCommand({
  name: "ticketclose",
  description: "Close the current ticket channel",
  usage: ",ticketclose",
  slash: false,
  execute: async (ctx) => {
    if (!ctx.guild || !ctx.channel) {
      return ctx.reply("❌ Server only.");
    }

    const config = getConfig(ctx.guild.id);
    const isTicket =
      ctx.channel.topic?.includes("PYRR_TICKET_OWNER:") ||
      ctx.channel.name?.startsWith("ticket-");

    if (!isTicket) {
      return ctx.reply("❌ This does not appear to be a ticket channel.");
    }

    const isStaff =
      ctx.member?.permissions?.has(
        PermissionsBitField.Flags.ManageChannels
      ) ||
      (config.ticketStaffRole &&
        ctx.member?.roles?.cache?.has(config.ticketStaffRole));

    const ownerId = ctx.channel.topic?.match(
      /PYRR_TICKET_OWNER:(\d+)/
    )?.[1];

    if (!isStaff && ownerId !== ctx.user.id) {
      return ctx.reply("❌ Only the ticket owner or ticket staff can close this.");
    }

    await ctx.reply("🔒 Closing this ticket in 5 seconds...");

    setTimeout(async () => {
      await ctx.channel.delete("Ticket closed").catch(() => null);
    }, 5000);
  }
});

registerCommand({
  name: "ticketadd",
  description: "Add a member to the current ticket",
  usage: ",ticketadd @member",
  slash: false,
  execute: async (ctx) => {
    if (!ctx.guild || !ctx.channel) {
      return ctx.reply("❌ Server only.");
    }

    const config = getConfig(ctx.guild.id);
    const isTicket =
      ctx.channel.topic?.includes("PYRR_TICKET_OWNER:") ||
      ctx.channel.name?.startsWith("ticket-");

    if (!isTicket) {
      return ctx.reply("❌ Use this command inside a ticket channel.");
    }

    const isStaff =
      ctx.member?.permissions?.has(
        PermissionsBitField.Flags.ManageChannels
      ) ||
      (config.ticketStaffRole &&
        ctx.member?.roles?.cache?.has(config.ticketStaffRole));

    if (!isStaff) {
      return ctx.reply("❌ Ticket staff only.");
    }

    const member =
      ctx.message?.mentions?.members?.first() ||
      await ctx.guild.members.fetch(ctx.args[0]).catch(() => null);

    if (!member) {
      return ctx.reply("Usage: `,ticketadd @member`");
    }

    await ctx.channel.permissionOverwrites.edit(member.id, {
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true
    });

    return ctx.reply(`✅ Added ${member} to this ticket.`);
  }
});

registerCommand({
  name: "ticketremove",
  description: "Remove a member from the current ticket",
  usage: ",ticketremove @member",
  slash: false,
  execute: async (ctx) => {
    if (!ctx.guild || !ctx.channel) {
      return ctx.reply("❌ Server only.");
    }

    const config = getConfig(ctx.guild.id);
    const isTicket =
      ctx.channel.topic?.includes("PYRR_TICKET_OWNER:") ||
      ctx.channel.name?.startsWith("ticket-");

    if (!isTicket) {
      return ctx.reply("❌ Use this command inside a ticket channel.");
    }

    const isStaff =
      ctx.member?.permissions?.has(
        PermissionsBitField.Flags.ManageChannels
      ) ||
      (config.ticketStaffRole &&
        ctx.member?.roles?.cache?.has(config.ticketStaffRole));

    if (!isStaff) {
      return ctx.reply("❌ Ticket staff only.");
    }

    const member =
      ctx.message?.mentions?.members?.first() ||
      await ctx.guild.members.fetch(ctx.args[0]).catch(() => null);

    if (!member) {
      return ctx.reply("Usage: `,ticketremove @member`");
    }

    await ctx.channel.permissionOverwrites.delete(member.id)
      .catch(() => null);

    return ctx.reply(`✅ Removed ${member} from this ticket.`);
  }
});

registerCommand({
  name: "ticketconfig",
  description: "View ticket system configuration",
  usage: ",ticketconfig",
  slash: false,
  execute: async (ctx) => {
    if (!ctx.guild) return ctx.reply("❌ Server only.");

    const config = getConfig(ctx.guild.id);

    const category = config.ticketCategory
      ? `<#${config.ticketCategory}>`
      : "Not configured";

    const staffRole = config.ticketStaffRole
      ? `<@&${config.ticketStaffRole}>`
      : "Not configured";

    const embed = new EmbedBuilder()
      .setColor(0x202020)
      .setTitle("🎫 TICKET CONFIGURATION")
      .addFields(
        { name: "Ticket Category", value: category },
        { name: "Staff Role", value: staffRole }
      )
      .setFooter({ text: "PYRR OFFICIAL" });

    return ctx.reply({ embeds: [embed] });
  }
});

// --------------------------------------------
// TICKET BUTTON INTERACTION HANDLER
// --------------------------------------------

client.on("interactionCreate", async (interaction) => {
  try {
    if (!interaction.isButton()) return;

    if (interaction.customId !== "pyrr_ticket_create") return;

    const guild = interaction.guild;
    const user = interaction.user;

    if (!guild) {
      return interaction.reply({
        content: "❌ This button only works inside a server.",
        ephemeral: true
      });
    }

    const config = getConfig(guild.id);

    const existing = guild.channels.cache.find((channel) => {
      if (!channel.name?.startsWith("ticket-")) return false;

      return channel.topic?.includes(
        `PYRR_TICKET_OWNER:${user.id}`
      );
    });

    if (existing) {
      return interaction.reply({
        content: `⚠️ You already have an open ticket: ${existing}`,
        ephemeral: true
      });
    }

    const safeName = user.username
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "")
      .slice(0, 20) || "user";

    const permissionOverwrites = [
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
          PermissionsBitField.Flags.AttachFiles
        ]
      },
      {
        id: client.user.id,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ReadMessageHistory,
          PermissionsBitField.Flags.ManageChannels
        ]
      }
    ];

    if (config.ticketStaffRole) {
      const staffRole = guild.roles.cache.get(
        config.ticketStaffRole
      );

      if (staffRole) {
        permissionOverwrites.push({
          id: staffRole.id,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ReadMessageHistory
          ]
        });
      }
    }

    const channelOptions = {
      name: `ticket-${safeName}`.slice(0, 90),
      type: ChannelType.GuildText,
      topic: `PYRR_TICKET_OWNER:${user.id}`,
      permissionOverwrites
    };

    if (config.ticketCategory) {
      const category = guild.channels.cache.get(
        config.ticketCategory
      );

      if (category && category.type === ChannelType.GuildCategory) {
        channelOptions.parent = category.id;
      }
    }

    const ticket = await guild.channels.create(channelOptions);

    const embed = new EmbedBuilder()
      .setColor(0x202020)
      .setTitle("🎫 SUPPORT TICKET")
      .setDescription(
        `Welcome ${user}!\n\n` +
        "Please explain your issue clearly. A staff member will assist you soon."
      )
      .addFields(
        { name: "Opened By", value: `${user}`, inline: true },
        { name: "Ticket ID", value: `\`${ticket.id}\``, inline: true }
      )
      .setTimestamp()
      .setFooter({ text: "PYRR OFFICIAL SUPPORT" });

    const closeRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("pyrr_ticket_close")
        .setLabel("Close Ticket")
        .setEmoji("🔒")
        .setStyle(ButtonStyle.Danger)
    );

    await ticket.send({
      content: `${user}`,
      embeds: [embed],
      components: [closeRow]
    });

    return interaction.reply({
      content: `✅ Your ticket has been created: ${ticket}`,
      ephemeral: true
    });
  } catch (error) {
    console.error("[PYRR TICKET CREATE ERROR]", error);

    if (interaction.isRepliable() && !interaction.replied) {
      await interaction.reply({
        content: "❌ Could not create your ticket. Check the bot permissions.",
        ephemeral: true
      }).catch(() => null);
    }
  }
});

// --------------------------------------------
// TICKET CLOSE BUTTON
// --------------------------------------------

client.on("interactionCreate", async (interaction) => {
  try {
    if (!interaction.isButton()) return;
    if (interaction.customId !== "pyrr_ticket_close") return;

    const channel = interaction.channel;
    const guild = interaction.guild;
    const config = guild ? getConfig(guild.id) : {};

    if (!channel || !guild) {
      return interaction.reply({
        content: "❌ Ticket channel not found.",
        ephemeral: true
      });
    }

    const ownerId = channel.topic?.match(
      /PYRR_TICKET_OWNER:(\d+)/
    )?.[1];

    const member = await guild.members.fetch(interaction.user.id)
      .catch(() => null);

    const isStaff =
      member?.permissions?.has(
        PermissionsBitField.Flags.ManageChannels
      ) ||
      (config.ticketStaffRole &&
        member?.roles?.cache?.has(config.ticketStaffRole));

    if (!isStaff && ownerId !== interaction.user.id) {
      return interaction.reply({
        content: "❌ Only the ticket owner or staff can close this.",
        ephemeral: true
      });
    }

    await interaction.reply({
      content: "🔒 Ticket will close in 5 seconds."
    });

    setTimeout(async () => {
      await channel.delete("Ticket closed by button").catch(() => null);
    }, 5000);
  } catch (error) {
    console.error("[PYRR TICKET CLOSE ERROR]", error);
  }
});

// END PART 11/20// ============================================
// PYRR OFFICIAL — PART 12/20
// GIVEAWAYS & POLLS
// ============================================

// --------------------------------------------
// GIVEAWAY COMMAND
// Usage: ,giveaway <duration> <winners> <prize>
// Example: ,giveaway 10m 1 Nitro
// Durations: s, m, h, d
// --------------------------------------------

function pyrrParseDuration(input) {
  const match = /^(\d+)(s|m|h|d)$/i.exec(input || "");
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

  if (!Number.isFinite(duration) || duration < 10000) return null;
  if (duration > 30 * 24 * 60 * 60 * 1000) return null;

  return duration;
}

registerCommand({
  name: "giveaway",
  description: "Start a giveaway",
  usage: ",giveaway <duration> <winners> <prize>",
  slash: false,
  execute: async (ctx) => {
    if (!ctx.guild) return ctx.reply("❌ Server only.");
    if (!(await requireModerator(ctx))) return;

    const duration = pyrrParseDuration(ctx.args[0]);
    const winnerCount = Number(ctx.args[1]);
    const prize = ctx.args.slice(2).join(" ").trim();

    if (
      !duration ||
      !Number.isInteger(winnerCount) ||
      winnerCount < 1 ||
      winnerCount > 20 ||
      !prize
    ) {
      return ctx.reply(
        "Usage: `,giveaway <duration> <winners> <prize>`\n" +
        "Example: `,giveaway 10m 1 Nitro`\n" +
        "Duration: `10s`, `10m`, `2h`, or `1d`."
      );
    }

    const endsAt = Date.now() + duration;

    const embed = new EmbedBuilder()
      .setColor(0x202020)
      .setTitle("🎉 GIVEAWAY")
      .setDescription(
        `**Prize:** ${prize}\n\n` +
        `**Hosted by:** ${ctx.user}\n` +
        `**Winners:** ${winnerCount}\n` +
        `**Ends:** <t:${Math.floor(endsAt / 1000)}:R>\n\n` +
        "React with 🎉 to enter!"
      )
      .setTimestamp(endsAt)
      .setFooter({ text: "PYRR OFFICIAL GIVEAWAY" });

    const giveawayMessage = await ctx.channel.send({
      embeds: [embed]
    }).catch(() => null);

    if (!giveawayMessage) {
      return ctx.reply("❌ Could not create the giveaway.");
    }

    await giveawayMessage.react("🎉").catch(() => null);

    if (!client.pyrrGiveaways) {
      client.pyrrGiveaways = new Map();
    }

    client.pyrrGiveaways.set(giveawayMessage.id, {
      guildId: ctx.guild.id,
      channelId: ctx.channel.id,
      messageId: giveawayMessage.id,
      prize,
      winnerCount,
      hostId: ctx.user.id,
      endsAt,
      ended: false
    });

    await ctx.reply(
      `✅ Giveaway started in ${ctx.channel}: **${prize}**`
    );

    setTimeout(async () => {
      await pyrrEndGiveaway(giveawayMessage.id);
    }, duration);
  }
});

// --------------------------------------------
// END GIVEAWAY
// --------------------------------------------

async function pyrrEndGiveaway(messageId) {
  try {
    const giveaways = client.pyrrGiveaways;
    if (!giveaways) return;

    const giveaway = giveaways.get(messageId);
    if (!giveaway || giveaway.ended) return;

    giveaway.ended = true;

    const guild = client.guilds.cache.get(giveaway.guildId);
    const channel = guild?.channels.cache.get(giveaway.channelId);
    const message = channel
      ? await channel.messages.fetch(messageId).catch(() => null)
      : null;

    if (!message) {
      giveaways.delete(messageId);
      return;
    }

    const reaction = message.reactions.cache.get("🎉");
    const users = reaction
      ? await reaction.users.fetch().catch(() => null)
      : null;

    const entrants = users
      ? [...users.values()].filter(
          (user) => !user.bot
        )
      : [];

    // Shuffle entrants for random selection.
    for (let i = entrants.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [entrants[i], entrants[j]] = [entrants[j], entrants[i]];
    }

    const winners = entrants.slice(
      0,
      Math.min(giveaway.winnerCount, entrants.length)
    );

    const winnerText = winners.length
      ? winners.map((user) => `${user}`).join(", ")
      : "No valid entries.";

    const embed = new EmbedBuilder()
      .setColor(0x202020)
      .setTitle("🏆 GIVEAWAY ENDED")
      .setDescription(
        `**Prize:** ${giveaway.prize}\n\n` +
        `**Winner(s):** ${winnerText}\n` +
        `**Total entries:** ${entrants.length}`
      )
      .setTimestamp()
      .setFooter({ text: "PYRR OFFICIAL GIVEAWAY" });

    await message.edit({ embeds: [embed] }).catch(() => null);

    if (winners.length) {
      await channel.send({
        content: `🎉 Congratulations ${winnerText}! You won **${giveaway.prize}**.`
      }).catch(() => null);
    }

    giveaways.delete(messageId);
  } catch (error) {
    console.error("[PYRR GIVEAWAY ERROR]", error);
  }
}

// --------------------------------------------
// REROLL GIVEAWAY
// Usage: ,reroll <message ID>
// --------------------------------------------

registerCommand({
  name: "reroll",
  description: "Choose a new giveaway winner",
  usage: ",reroll <giveaway message ID>",
  slash: false,
  execute: async (ctx) => {
    if (!ctx.guild) return ctx.reply("❌ Server only.");
    if (!(await requireModerator(ctx))) return;

    const messageId = ctx.args[0];

    if (!messageId) {
      return ctx.reply("Usage: `,reroll <giveaway message ID>`");
    }

    const channel = ctx.channel;
    const message = await channel.messages.fetch(messageId)
      .catch(() => null);

    if (!message) {
      return ctx.reply("❌ Giveaway message not found in this channel.");
    }

    const reaction = message.reactions.cache.get("🎉");
    const users = reaction
      ? await reaction.users.fetch().catch(() => null)
      : null;

    const entrants = users
      ? [...users.values()].filter((user) => !user.bot)
      : [];

    if (!entrants.length) {
      return ctx.reply("❌ No participants found.");
    }

    const winner = entrants[
      Math.floor(Math.random() * entrants.length)
    ];

    return ctx.reply(
      `🎉 New winner: ${winner}!\nPrize: Check the original giveaway.`
    );
  }
});

// --------------------------------------------
// POLL COMMAND
// Usage: ,poll Question | Option 1 | Option 2
// --------------------------------------------

registerCommand({
  name: "poll",
  description: "Create a reaction poll",
  usage: ",poll <question> | <option 1> | <option 2>",
  slash: false,
  execute: async (ctx) => {
    if (!ctx.guild) return ctx.reply("❌ Server only.");

    const raw = ctx.args.join(" ");
    const parts = raw.split("|").map((part) => part.trim());
    const question = parts.shift();

    if (!question || parts.length < 2 || parts.length > 10) {
      return ctx.reply(
        "Usage: `,poll Question | Option 1 | Option 2`\n" +
        "You can add 2–10 options."
      );
    }

    const emojis = [
      "1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣",
      "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"
    ];

    const description = parts
      .map((option, index) => `${emojis[index]} ${option}`)
      .join("\n\n");

    const embed = new EmbedBuilder()
      .setColor(0x202020)
      .setTitle("📊 POLL")
      .setDescription(`**${question}**\n\n${description}`)
      .setFooter({ text: `Poll by ${ctx.user.username}` })
      .setTimestamp();

    const pollMessage = await ctx.channel.send({
      embeds: [embed]
    }).catch(() => null);

    if (!pollMessage) {
      return ctx.reply("❌ Could not create the poll.");
    }

    for (let i = 0; i < parts.length; i++) {
      await pollMessage.react(emojis[i]).catch(() => null);
    }

    return ctx.reply("✅ Poll created successfully.");
  }
});

// --------------------------------------------
// SUGGESTION SYSTEM
// --------------------------------------------

registerCommand({
  name: "suggest",
  description: "Submit a server suggestion",
  usage: ",suggest <your suggestion>",
  slash: false,
  execute: async (ctx) => {
    if (!ctx.guild) return ctx.reply("❌ Use this command in a server.");

    const suggestion = ctx.args.join(" ").trim();

    if (!suggestion) {
      return ctx.reply("Usage: `,suggest <your suggestion>`");
    }

    if (suggestion.length > 1500) {
      return ctx.reply("❌ Keep suggestions under 1500 characters.");
    }

    const config = getConfig(ctx.guild.id);
    const targetId = config.suggestionChannel;

    const target = targetId
      ? ctx.guild.channels.cache.get(targetId)
      : null;

    if (!target || !target.isTextBased()) {
      return ctx.reply(
        "❌ Suggestions are not configured. Ask an administrator to set the channel."
      );
    }

    const embed = new EmbedBuilder()
      .setColor(0x202020)
      .setTitle("💡 New Suggestion")
      .setDescription(suggestion)
      .addFields({
        name: "Submitted By",
        value: `${ctx.user}`,
        inline: true
      })
      .setTimestamp()
      .setFooter({ text: "PYRR OFFICIAL SUGGESTIONS" });

    const suggestionMessage = await target.send({
      embeds: [embed]
    }).catch(() => null);

    if (!suggestionMessage) {
      return ctx.reply("❌ Could not submit your suggestion.");
    }

    await suggestionMessage.react("👍").catch(() => null);
    await suggestionMessage.react("👎").catch(() => null);

    return ctx.reply("✅ Your suggestion has been submitted.");
  }
});

registerCommand({
  name: "setsuggestions",
  description: "Set the suggestion channel",
  usage: ",setsuggestions #channel",
  slash: false,
  execute: async (ctx) => {
    if (!ctx.guild) return ctx.reply("❌ Server only.");
    if (!(await requireModerator(ctx))) return;

    const channel =
      ctx.message?.mentions?.channels?.first() ||
      ctx.guild.channels.cache.get(ctx.args[0]);

    if (!channel || !channel.isTextBased()) {
      return ctx.reply("Usage: `,setsuggestions #channel`");
    }

    const config = getConfig(ctx.guild.id);
    config.suggestionChannel = channel.id;
    saveDatabase();

    return ctx.reply(`✅ Suggestion channel set to ${channel}.`);
  }
});

// --------------------------------------------
// SUGGESTION MODERATION
// --------------------------------------------

registerCommand({
  name: "approve",
  description: "Mark a suggestion as approved",
  usage: ",approve <message ID>",
  slash: false,
  execute: async (ctx) => {
    if (!ctx.guild) return ctx.reply("❌ Server only.");
    if (!(await requireModerator(ctx))) return;

    const messageId = ctx.args[0];

    if (!messageId) {
      return ctx.reply("Usage: `,approve <message ID>`");
    }

    const message = await ctx.channel.messages.fetch(messageId)
      .catch(() => null);

    if (!message || !message.embeds.length) {
      return ctx.reply("❌ Suggestion message not found.");
    }

    const original = message.embeds[0];

    const updated = EmbedBuilder.from(original)
      .setColor(0x2ecc71)
      .addFields({
        name: "Status",
        value: "✅ Approved",
        inline: true
      });

    await message.edit({ embeds: [updated] });

    return ctx.reply("✅ Suggestion marked as approved.");
  }
});

registerCommand({
  name: "deny",
  description: "Mark a suggestion as denied",
  usage: ",deny <message ID>",
  slash: false,
  execute: async (ctx) => {
    if (!ctx.guild) return ctx.reply("❌ Server only.");
    if (!(await requireModerator(ctx))) return;

    const messageId = ctx.args[0];

    if (!messageId) {
      return ctx.reply("Usage: `,deny <message ID>`");
    }

    const message = await ctx.channel.messages.fetch(messageId)
      .catch(() => null);

    if (!message || !message.embeds.length) {
      return ctx.reply("❌ Suggestion message not found.");
    }

    const original = message.embeds[0];

    const updated = EmbedBuilder.from(original)
      .setColor(0xe74c3c)
      .addFields({
        name: "Status",
        value: "❌ Denied",
        inline: true
      });

    await message.edit({ embeds: [updated] });

    return ctx.reply("✅ Suggestion marked as denied.");
  }
});

// END PART 12/20// ============================================
// PYRR OFFICIAL — PART 13/20
// LEVELING, XP & LEADERBOARD
// ============================================

function pyrrGetLevelFromXP(xp) {
  return Math.floor(Math.sqrt(Math.max(0, xp) / 100));
}

function pyrrXPForNextLevel(level) {
  return (level + 1) * (level + 1) * 100;
}

function pyrrGetLevelData(guildId, userId) {
  const config = getConfig(guildId);

  if (!config.leveling || typeof config.leveling !== "object") {
    config.leveling = {};
  }

  if (!config.leveling[userId]) {
    config.leveling[userId] = {
      xp: 0,
      level: 0,
      messages: 0,
      lastXPAt: 0
    };
  }

  return config.leveling[userId];
}

// --------------------------------------------
// LEVELING SETTINGS
// --------------------------------------------

registerCommand({
  name: "leveling",
  description: "Enable or disable the leveling system",
  usage: ",leveling <on/off>",
  slash: false,
  execute: async (ctx) => {
    if (!ctx.guild) return ctx.reply("❌ Server only.");
    if (!(await requireModerator(ctx))) return;

    const action = (ctx.args[0] || "").toLowerCase();

    if (!["on", "off"].includes(action)) {
      return ctx.reply("Usage: `,leveling on` or `,leveling off`");
    }

    const config = getConfig(ctx.guild.id);
    config.levelingEnabled = action === "on";
    saveDatabase();

    return ctx.reply(
      `🏆 Leveling is now **${action.toUpperCase()}**.`
    );
  }
});

registerCommand({
  name: "setlevelchannel",
  description: "Set the level-up announcement channel",
  usage: ",setlevelchannel #channel",
  slash: false,
  execute: async (ctx) => {
    if (!ctx.guild) return ctx.reply("❌ Server only.");
    if (!(await requireModerator(ctx))) return;

    const channel =
      ctx.message?.mentions?.channels?.first() ||
      ctx.guild.channels.cache.get(ctx.args[0]);

    if (!channel || !channel.isTextBased()) {
      return ctx.reply("Usage: `,setlevelchannel #channel`");
    }

    const config = getConfig(ctx.guild.id);
    config.levelChannel = channel.id;
    saveDatabase();

    return ctx.reply(`✅ Level-up announcements will go to ${channel}.`);
  }
});

// --------------------------------------------
// LEVEL / RANK COMMAND
// --------------------------------------------

registerCommand({
  name: "rank",
  description: "View your or another member's rank",
  usage: ",rank [@member]",
  slash: false,
  execute: async (ctx) => {
    if (!ctx.guild) return ctx.reply("❌ Server only.");

    const target =
      ctx.message?.mentions?.users?.first() ||
      ctx.user;

    const data = pyrrGetLevelData(ctx.guild.id, target.id);
    const level = pyrrGetLevelFromXP(data.xp);
    const nextXP = pyrrXPForNextLevel(level);
    const previousXP = level * level * 100;
    const progress = Math.max(
      0,
      Math.min(100, Math.floor(
        ((data.xp - previousXP) / Math.max(1, nextXP - previousXP)) * 100
      ))
    );

    const filled = Math.floor(progress / 10);
    const bar = "█".repeat(filled) + "░".repeat(10 - filled);

    const embed = new EmbedBuilder()
      .setColor(0x202020)
      .setTitle("🏆 MEMBER RANK")
      .setThumbnail(target.displayAvatarURL({ size: 256 }))
      .setDescription(
        `**Member:** ${target}\n` +
        `**Level:** ${level}\n` +
        `**Total XP:** ${data.xp}\n\n` +
        `**Progress:** ${bar} ${progress}%\n` +
        `**Next Level:** ${nextXP} XP`
      )
      .setFooter({ text: "PYRR OFFICIAL • Level System" });

    return ctx.reply({ embeds: [embed] });
  }
});

registerCommand({
  name: "level",
  description: "Check your current level",
  usage: ",level [@member]",
  slash: false,
  execute: async (ctx) => {
    if (!ctx.guild) return ctx.reply("❌ Server only.");

    const target =
      ctx.message?.mentions?.users?.first() ||
      ctx.user;

    const data = pyrrGetLevelData(ctx.guild.id, target.id);
    const level = pyrrGetLevelFromXP(data.xp);

    return ctx.reply(
      `🏆 **${target.username}** is Level **${level}** with **${data.xp} XP**.`
    );
  }
});

// --------------------------------------------
// LEADERBOARD
// --------------------------------------------

registerCommand({
  name: "leaderboard",
  description: "Show the server XP leaderboard",
  usage: ",leaderboard",
  slash: false,
  execute: async (ctx) => {
    if (!ctx.guild) return ctx.reply("❌ Server only.");

    const config = getConfig(ctx.guild.id);
    const leveling = config.leveling || {};

    const entries = Object.entries(leveling)
      .map(([userId, data]) => ({
        userId,
        xp: Number(data?.xp) || 0,
        level: pyrrGetLevelFromXP(Number(data?.xp) || 0)
      }))
      .sort((a, b) => b.xp - a.xp)
      .slice(0, 10);

    if (!entries.length) {
      return ctx.reply("📭 No XP records yet. Start chatting to earn XP!");
    }

    const lines = entries.map((entry, index) => {
      const medal = ["🥇", "🥈", "🥉"][index] || `**${index + 1}.**`;

      return `${medal} <@${entry.userId}> — Level **${entry.level}** · **${entry.xp} XP**`;
    });

    const embed = new EmbedBuilder()
      .setColor(0x202020)
      .setTitle("🏆 SERVER LEADERBOARD")
      .setDescription(lines.join("\n"))
      .setFooter({ text: "PYRR OFFICIAL • Top 10 Members" })
      .setTimestamp();

    return ctx.reply({ embeds: [embed] });
  }
});

// --------------------------------------------
// RESET XP
// --------------------------------------------

registerCommand({
  name: "resetxp",
  description: "Reset a member's XP",
  usage: ",resetxp @member",
  slash: false,
  execute: async (ctx) => {
    if (!ctx.guild) return ctx.reply("❌ Server only.");
    if (!(await requireModerator(ctx))) return;

    const target =
      ctx.message?.mentions?.users?.first() ||
      ctx.client.users.cache.get(ctx.args[0]);

    if (!target) {
      return ctx.reply("Usage: `,resetxp @member`");
    }

    const config = getConfig(ctx.guild.id);

    if (!config.leveling) config.leveling = {};

    config.leveling[target.id] = {
      xp: 0,
      level: 0,
      messages: 0,
      lastXPAt: 0
    };

    saveDatabase();

    return ctx.reply(`✅ Reset XP for **${target.username}**.`);
  }
});

// --------------------------------------------
// XP MESSAGE HANDLER
// --------------------------------------------

client.on("messageCreate", async (message) => {
  try {
    if (!message.guild || message.author.bot) return;

    const config = getConfig(message.guild.id);
    if (!config.levelingEnabled) return;

    const data = pyrrGetLevelData(
      message.guild.id,
      message.author.id
    );

    const now = Date.now();

    // Award XP at most once every 60 seconds per member.
    if (now - (Number(data.lastXPAt) || 0) < 60000) return;

    const oldLevel = pyrrGetLevelFromXP(data.xp);

    const earnedXP = Math.floor(Math.random() * 11) + 15;

    data.xp = (Number(data.xp) || 0) + earnedXP;
    data.messages = (Number(data.messages) || 0) + 1;
    data.lastXPAt = now;

    const newLevel = pyrrGetLevelFromXP(data.xp);
    data.level = newLevel;

    saveDatabase();

    if (newLevel > oldLevel) {
      const levelChannel = config.levelChannel
        ? message.guild.channels.cache.get(config.levelChannel)
        : message.channel;

      if (levelChannel && levelChannel.isTextBased()) {
        await levelChannel.send({
          content:
            `🎉 Congratulations ${message.author}! ` +
            `You reached **Level ${newLevel}**!`
        }).catch(() => null);
      }
    }
  } catch (error) {
    console.error("[PYRR LEVEL ERROR]", error);
  }
});

// --------------------------------------------
// XP SETTINGS INFO
// --------------------------------------------

registerCommand({
  name: "levelconfig",
  description: "View leveling configuration",
  usage: ",levelconfig",
  slash: false,
  execute: async (ctx) => {
    if (!ctx.guild) return ctx.reply("❌ Server only.");

    const config = getConfig(ctx.guild.id);

    const enabled = config.levelingEnabled
      ? "✅ Enabled"
      : "❌ Disabled";

    const channel = config.levelChannel
      ? `<#${config.levelChannel}>`
      : "Current channel";

    const embed = new EmbedBuilder()
      .setColor(0x202020)
      .setTitle("⚙️ LEVELING CONFIG")
      .addFields(
        { name: "Leveling", value: enabled, inline: true },
        { name: "Announcement Channel", value: channel, inline: true }
      )
      .setFooter({ text: "PYRR OFFICIAL" });

    return ctx.reply({ embeds: [embed] });
  }
});

// END PART 13/20// ============================================
// PYRR OFFICIAL — PART 14/20
// ECONOMY & VIRTUAL SHOP
// ============================================

function pyrrGetEconomy(guildId, userId) {
  const config = getConfig(guildId);

  if (!config.economy || typeof config.economy !== "object") {
    config.economy = {};
  }

  if (!config.economy[userId]) {
    config.economy[userId] = {
      wallet: 0,
      bank: 0,
      lastDaily: 0,
      lastWork: 0,
      inventory: []
    };
  }

  const data = config.economy[userId];

  if (!Number.isFinite(data.wallet)) data.wallet = 0;
  if (!Number.isFinite(data.bank)) data.bank = 0;
  if (!Array.isArray(data.inventory)) data.inventory = [];

  return data;
}

function pyrrFormatCoins(amount) {
  return `${Math.max(0, Math.floor(Number(amount) || 0)).toLocaleString("en-US")} coins`;
}

// --------------------------------------------
// BALANCE
// --------------------------------------------

registerCommand({
  name: "balance",
  description: "Check your wallet and bank balance",
  usage: ",balance [@member]",
  slash: false,
  execute: async (ctx) => {
    if (!ctx.guild) return ctx.reply("❌ Server only.");

    const target =
      ctx.message?.mentions?.users?.first() || ctx.user;

    const data = pyrrGetEconomy(ctx.guild.id, target.id);

    const embed = new EmbedBuilder()
      .setColor(0x202020)
      .setTitle("💰 ACCOUNT BALANCE")
      .setThumbnail(target.displayAvatarURL({ size: 256 }))
      .addFields(
        {
          name: "👛 Wallet",
          value: pyrrFormatCoins(data.wallet),
          inline: true
        },
        {
          name: "🏦 Bank",
          value: pyrrFormatCoins(data.bank),
          inline: true
        },
        {
          name: "💎 Total",
          value: pyrrFormatCoins(data.wallet + data.bank),
          inline: false
        }
      )
      .setFooter({ text: `Account: ${target.username}` });

    return ctx.reply({ embeds: [embed] });
  }
});

// --------------------------------------------
// DAILY REWARD
// --------------------------------------------

registerCommand({
  name: "daily",
  description: "Claim your daily virtual coins",
  usage: ",daily",
  slash: false,
  execute: async (ctx) => {
    if (!ctx.guild) return ctx.reply("❌ Server only.");

    const data = pyrrGetEconomy(ctx.guild.id, ctx.user.id);
    const now = Date.now();
    const cooldown = 24 * 60 * 60 * 1000;

    if (now - data.lastDaily < cooldown) {
      const remaining = cooldown - (now - data.lastDaily);

      return ctx.reply(
        `⏳ You already claimed your daily reward. Try again <t:${Math.ceil((now + remaining) / 1000)}:R>.`
      );
    }

    const reward = 500;
    data.wallet += reward;
    data.lastDaily = now;

    saveDatabase();

    return ctx.reply(
      `🎁 You claimed **${pyrrFormatCoins(reward)}**!\n` +
      `New wallet balance: **${pyrrFormatCoins(data.wallet)}**`
    );
  }
});

// --------------------------------------------
// WORK
// --------------------------------------------

registerCommand({
  name: "work",
  description: "Earn virtual coins by working",
  usage: ",work",
  slash: false,
  execute: async (ctx) => {
    if (!ctx.guild) return ctx.reply("❌ Server only.");

    const data = pyrrGetEconomy(ctx.guild.id, ctx.user.id);
    const now = Date.now();
    const cooldown = 60 * 60 * 1000;

    if (now - data.lastWork < cooldown) {
      return ctx.reply(
        `⏳ You can work again <t:${Math.ceil((data.lastWork + cooldown) / 1000)}:R>.`
      );
    }

    const jobs = [
      "helped a developer",
      "designed a server banner",
      "moderated a community",
      "built a virtual shop",
      "completed a coding task",
      "organized a gaming event"
    ];

    const job = jobs[Math.floor(Math.random() * jobs.length)];
    const reward = Math.floor(Math.random() * 201) + 100;

    data.wallet += reward;
    data.lastWork = now;

    saveDatabase();

    return ctx.reply(
      `💼 You ${job} and earned **${pyrrFormatCoins(reward)}**!`
    );
  }
});

// --------------------------------------------
// DEPOSIT
// --------------------------------------------

registerCommand({
  name: "deposit",
  description: "Deposit wallet coins into your bank",
  usage: ",deposit <amount|all>",
  slash: false,
  execute: async (ctx) => {
    if (!ctx.guild) return ctx.reply("❌ Server only.");

    const data = pyrrGetEconomy(ctx.guild.id, ctx.user.id);
    const input = (ctx.args[0] || "").toLowerCase();

    const amount = input === "all"
      ? data.wallet
      : Number(input);

    if (!Number.isSafeInteger(amount) || amount <= 0) {
      return ctx.reply("Usage: `,deposit <amount>` or `,deposit all`");
    }

    if (amount > data.wallet) {
      return ctx.reply("❌ You don't have enough coins in your wallet.");
    }

    data.wallet -= amount;
    data.bank += amount;

    saveDatabase();

    return ctx.reply(
      `🏦 Deposited **${pyrrFormatCoins(amount)}** into your bank.`
    );
  }
});

// --------------------------------------------
// WITHDRAW
// --------------------------------------------

registerCommand({
  name: "withdraw",
  description: "Withdraw bank coins into your wallet",
  usage: ",withdraw <amount|all>",
  slash: false,
  execute: async (ctx) => {
    if (!ctx.guild) return ctx.reply("❌ Server only.");

    const data = pyrrGetEconomy(ctx.guild.id, ctx.user.id);
    const input = (ctx.args[0] || "").toLowerCase();

    const amount = input === "all"
      ? data.bank
      : Number(input);

    if (!Number.isSafeInteger(amount) || amount <= 0) {
      return ctx.reply("Usage: `,withdraw <amount>` or `,withdraw all`");
    }

    if (amount > data.bank) {
      return ctx.reply("❌ You don't have enough coins in your bank.");
    }

    data.bank -= amount;
    data.wallet += amount;

    saveDatabase();

    return ctx.reply(
      `💵 Withdrew **${pyrrFormatCoins(amount)}** from your bank.`
    );
  }
});

// --------------------------------------------
// TRANSFER COINS
// --------------------------------------------

registerCommand({
  name: "pay",
  description: "Transfer virtual coins to another member",
  usage: ",pay @member <amount>",
  slash: false,
  execute: async (ctx) => {
    if (!ctx.guild) return ctx.reply("❌ Server only.");

    const target =
      ctx.message?.mentions?.users?.first() ||
      ctx.client.users.cache.get(ctx.args[0]);

    const amount = Number(
      ctx.message?.mentions?.users?.first()
        ? ctx.args[0]
        : ctx.args[1]
    );

    if (!target || target.bot || target.id === ctx.user.id) {
      return ctx.reply("Usage: `,pay @member <amount>`");
    }

    if (!Number.isSafeInteger(amount) || amount <= 0) {
      return ctx.reply("❌ Enter a valid positive amount.");
    }

    const sender = pyrrGetEconomy(ctx.guild.id, ctx.user.id);

    if (sender.wallet < amount) {
      return ctx.reply("❌ You don't have enough wallet coins.");
    }

    const receiver = pyrrGetEconomy(ctx.guild.id, target.id);

    sender.wallet -= amount;
    receiver.wallet += amount;

    saveDatabase();

    return ctx.reply(
      `💸 ${ctx.user} sent **${pyrrFormatCoins(amount)}** to ${target}.`
    );
  }
});

// --------------------------------------------
// SHOP
// --------------------------------------------

const PYRR_SHOP_ITEMS = [
  {
    id: "vip",
    name: "VIP",
    price: 5000,
    description: "A virtual VIP badge for your economy profile."
  },
  {
    id: "elite",
    name: "Elite",
    price: 12000,
    description: "A virtual Elite badge for your economy profile."
  },
  {
    id: "legend",
    name: "Legend",
    price: 25000,
    description: "A virtual Legend badge for your economy profile."
  },
  {
    id: "color",
    name: "Color Pass",
    price: 2500,
    description: "A virtual collectible color pass."
  }
];

registerCommand({
  name: "shop",
  description: "View the virtual economy shop",
  usage: ",shop",
  slash: false,
  execute: async (ctx) => {
    const lines = PYRR_SHOP_ITEMS.map(
      (item) =>
        `**${item.name}** — ${pyrrFormatCoins(item.price)}\n` +
        `${item.description}\nItem ID: \`${item.id}\``
    );

    const embed = new EmbedBuilder()
      .setColor(0x202020)
      .setTitle("🛒 PYRR VIRTUAL SHOP")
      .setDescription(lines.join("\n\n"))
      .setFooter({
        text: "Purchase with ,buy <item ID>"
      });

    return ctx.reply({ embeds: [embed] });
  }
});

// --------------------------------------------
// BUY ITEM
// --------------------------------------------

registerCommand({
  name: "buy",
  description: "Purchase a virtual shop item",
  usage: ",buy <item ID>",
  slash: false,
  execute: async (ctx) => {
    if (!ctx.guild) return ctx.reply("❌ Server only.");

    const itemId = (ctx.args[0] || "").toLowerCase();

    const item = PYRR_SHOP_ITEMS.find(
      (entry) => entry.id === itemId
    );

    if (!item) {
      return ctx.reply("❌ Item not found. Use `,shop` to view items.");
    }

    const data = pyrrGetEconomy(ctx.guild.id, ctx.user.id);

    if (data.inventory.includes(item.id)) {
      return ctx.reply("⚠️ You already own this item.");
    }

    if (data.wallet < item.price) {
      return ctx.reply(
        `❌ You need **${pyrrFormatCoins(item.price - data.wallet)}** more.`
      );
    }

    data.wallet -= item.price;
    data.inventory.push(item.id);

    saveDatabase();

    return ctx.reply(
      `✅ You purchased **${item.name}** for **${pyrrFormatCoins(item.price)}**!`
    );
  }
});

// --------------------------------------------
// INVENTORY
// --------------------------------------------

registerCommand({
  name: "inventory",
  description: "View your virtual shop inventory",
  usage: ",inventory [@member]",
  slash: false,
  execute: async (ctx) => {
    if (!ctx.guild) return ctx.reply("❌ Server only.");

    const target =
      ctx.message?.mentions?.users?.first() ||
      ctx.user;

    const data = pyrrGetEconomy(ctx.guild.id, target.id);

    const items = data.inventory.map((itemId) => {
      const item = PYRR_SHOP_ITEMS.find(
        (entry) => entry.id === itemId
      );

      return item ? `• **${item.name}**` : `• ${itemId}`;
    });

    const embed = new EmbedBuilder()
      .setColor(0x202020)
      .setTitle(`🎒 ${target.username}'s Inventory`)
      .setDescription(
        items.length ? items.join("\n") : "Your inventory is empty."
      )
      .setFooter({ text: "PYRR OFFICIAL • Virtual Economy" });

    return ctx.reply({ embeds: [embed] });
  }
});

// --------------------------------------------
// ECONOMY LEADERBOARD
// --------------------------------------------

registerCommand({
  name: "richest",
  description: "Show the richest members in this server",
  usage: ",richest",
  slash: false,
  execute: async (ctx) => {
    if (!ctx.guild) return ctx.reply("❌ Server only.");

    const config = getConfig(ctx.guild.id);
    const economy = config.economy || {};

    const entries = Object.entries(economy)
      .map(([userId, data]) => ({
        userId,
        total:
          (Number(data?.wallet) || 0) +
          (Number(data?.bank) || 0)
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);

    if (!entries.length) {
      return ctx.reply("📭 No economy accounts yet.");
    }

    const lines = entries.map((entry, index) => {
      const medal = ["🥇", "🥈", "🥉"][index] || `**${index + 1}.**`;

      return `${medal} <@${entry.userId}> — **${pyrrFormatCoins(entry.total)}**`;
    });

    const embed = new EmbedBuilder()
      .setColor(0x202020)
      .setTitle("💎 RICHEST MEMBERS")
      .setDescription(lines.join("\n"))
      .setFooter({ text: "PYRR OFFICIAL • Economy" });

    return ctx.reply({ embeds: [embed] });
  }
});

// --------------------------------------------
// ADMIN ECONOMY ADJUSTMENT
// --------------------------------------------

registerCommand({
  name: "addcoins",
  description: "Give virtual coins to a member",
  usage: ",addcoins @member <amount>",
  slash: false,
  execute: async (ctx) => {
    if (!ctx.guild) return ctx.reply("❌ Server only.");
    if (!(await requireModerator(ctx))) return;

    const target =
      ctx.message?.mentions?.users?.first() ||
      ctx.client.users.cache.get(ctx.args[0]);

    const amount = Number(
      ctx.message?.mentions?.users?.first()
        ? ctx.args[0]
        : ctx.args[1]
    );

    if (
      !target ||
      !Number.isSafeInteger(amount) ||
      amount <= 0 ||
      amount > 1000000000
    ) {
      return ctx.reply("Usage: `,addcoins @member <amount>`");
    }

    const data = pyrrGetEconomy(ctx.guild.id, target.id);
    data.wallet += amount;

    saveDatabase();

    return ctx.reply(
      `✅ Added **${pyrrFormatCoins(amount)}** to ${target}'s wallet.`
    );
  }
});

registerCommand({
  name: "removecoins",
  description: "Remove virtual coins from a member",
  usage: ",removecoins @member <amount>",
  slash: false,
  execute: async (ctx) => {
    if (!ctx.guild) return ctx.reply("❌ Server only.");
    if (!(await requireModerator(ctx))) return;

    const target =
      ctx.message?.mentions?.users?.first() ||
      ctx.client.users.cache.get(ctx.args[0]);

    const amount = Number(
      ctx.message?.mentions?.users?.first()
        ? ctx.args[0]
        : ctx.args[1]
    );

    if (
      !target ||
      !Number.isSafeInteger(amount) ||
      amount <= 0
    ) {
      return ctx.reply("Usage: `,removecoins @member <amount>`");
    }

    const data = pyrrGetEconomy(ctx.guild.id, target.id);
    const removed = Math.min(data.wallet, amount);

    data.wallet -= removed;
    saveDatabase();

    return ctx.reply(
      `✅ Removed **${pyrrFormatCoins(removed)}** from ${target}'s wallet.`
    );
  }
});

// --------------------------------------------
// ECONOMY HELP
// --------------------------------------------

registerCommand({
  name: "economy",
  description: "Show economy commands",
  usage: ",economy",
  slash: false,
  execute: async (ctx) => {
    return ctx.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x202020)
          .setTitle("💰 PYRR ECONOMY COMMANDS")
          .setDescription(
            [
              "`,balance [@member]` — Check balance",
              "`,daily` — Claim daily reward",
              "`,work` — Earn virtual coins",
              "`,deposit <amount|all>` — Deposit coins",
              "`,withdraw <amount|all>` — Withdraw coins",
              "`,pay @member <amount>` — Transfer coins",
              "`,shop` — Browse virtual shop",
              "`,buy <item ID>` — Buy an item",
              "`,inventory [@member]` — View inventory",
              "`,richest` — Economy leaderboard",
              "`,addcoins @member <amount>` — Admin: add coins",
              "`,removecoins @member <amount>` — Admin: remove coins"
            ].join("\n")
          )
          .setFooter({ text: "Virtual coins only; no real-money value." })
      ]
    });
  }
});

// END PART 14/20// ======================================================
// PYRR OFFICIAL — PART 15/20
// FUN, ENTERTAINMENT & SOCIAL COMMANDS
// All responses and descriptions are in English.
// ======================================================

const PYRR_EIGHTBALL = [
    "Yes, there is a strong possibility.",
    "It looks like yes.",
    "Maybe. Stay tuned.",
    "The answer is uncertain.",
    "Try asking again later.",
    "It doesn't look likely.",
    "My prediction says no.",
    "It is possible, but not guaranteed.",
    "Only time will tell.",
    "Yes, but think it through first."
];

const PYRR_FORTUNES = [
    "A new opportunity may be waiting for you.",
    "Sometimes, taking a break helps you move forward.",
    "You may learn something valuable today.",
    "Never be afraid to start again.",
    "Small progress is still progress.",
    "Some questions can only be answered with time.",
    "Trust the process and keep learning.",
    "Consistency matters more than rushing.",
    "Not every plan needs to happen immediately.",
    "A small act of kindness can brighten someone's day."
];

const PYRR_ROASTS = [
    "Your personality is still loading.",
    "You're like Wi-Fi: sometimes connected, sometimes missing.",
    "Your confidence is premium, but your logic is on a free trial.",
    "You're not late. You're just in another timeline.",
    "You're like a software update: lots of promises, endless waiting.",
    "Your energy is at 1% battery with no charger.",
    "You're the main character, but you're still on the loading screen.",
    "You're like homework: always causing problems."
];

const PYRR_COMPLIMENTS = [
    "Your energy is amazing today!",
    "You have strengths worth being proud of.",
    "Keep going. You're making progress even when you don't notice it.",
    "You're bringing good vibes today.",
    "Your effort matters. Keep it up!",
    "You have plenty of reasons to be proud of yourself.",
    "I hope your day is as positive as your energy."
];

function pyrrRandomItem(items) {
    return items[Math.floor(Math.random() * items.length)];
}

function pyrrPickUser(ctx, index = 0) {
    const mention = ctx.args?.[index];
    if (!mention) return null;

    const id = mention.replace(/[<@!>]/g, "");
    if (!/^\d{17,20}$/.test(id)) return null;

    return ctx.guild?.members?.cache?.get(id) || null;
}

registerCommand({
    name: "8ball",
    description: "Ask the magic 8-ball a question.",
    usage: ",8ball <question>",
    slash: false,
    execute: async (ctx) => {
        const question = ctx.args.join(" ");

        if (!question) {
            return ctx.reply("Usage: `,8ball <question>`");
        }

        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle("🎱 PYRR Magic 8-Ball")
            .addFields(
                { name: "Question", value: question.slice(0, 1000) },
                { name: "Answer", value: pyrrRandomItem(PYRR_EIGHTBALL) }
            )
            .setFooter({
                text: "Entertainment only — not a real prediction."
            })
            .setTimestamp();

        return ctx.reply({ embeds: [embed] });
    }
});

registerCommand({
    name: "fortune",
    description: "Get a random fortune.",
    usage: ",fortune",
    slash: false,
    execute: async (ctx) => {
        const embed = new EmbedBuilder()
            .setColor(0xF1C40F)
            .setTitle("🔮 Your Fortune")
            .setDescription(pyrrRandomItem(PYRR_FORTUNES))
            .setFooter({
                text: "PYRR OFFICIAL • Fortune of the moment"
            });

        return ctx.reply({ embeds: [embed] });
    }
});

registerCommand({
    name: "roast",
    description: "Give someone a friendly random roast.",
    usage: ",roast [@member]",
    slash: false,
    execute: async (ctx) => {
        const target = pyrrPickUser(ctx) || ctx.member;

        const embed = new EmbedBuilder()
            .setColor(0xE74C3C)
            .setTitle("🔥 Friendly Roast")
            .setDescription(
                `${target.user.username}, ${pyrrRandomItem(PYRR_ROASTS)}`
            )
            .setFooter({
                text: "Just for fun. Keep it friendly."
            });

        return ctx.reply({ embeds: [embed] });
    }
});

registerCommand({
    name: "compliment",
    description: "Give someone a friendly compliment.",
    usage: ",compliment [@member]",
    slash: false,
    execute: async (ctx) => {
        const target = pyrrPickUser(ctx) || ctx.member;

        const embed = new EmbedBuilder()
            .setColor(0x2ECC71)
            .setTitle("💚 A Little Positivity")
            .setDescription(
                `${target.user.username}, ${pyrrRandomItem(PYRR_COMPLIMENTS)}`
            )
            .setFooter({
                text: "PYRR OFFICIAL • Spread good vibes"
            });

        return ctx.reply({ embeds: [embed] });
    }
});

registerCommand({
    name: "coinflip",
    description: "Flip a virtual coin.",
    usage: ",coinflip",
    slash: false,
    execute: async (ctx) => {
        const result = Math.random() < 0.5 ? "Heads" : "Tails";

        return ctx.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(0xF1C40F)
                    .setTitle("🪙 Coin Flip")
                    .setDescription(`Result: **${result}**`)
                    .setFooter({ text: "Virtual coin only." })
            ]
        });
    }
});

registerCommand({
    name: "dice",
    description: "Roll a virtual dice.",
    usage: ",dice [sides]",
    slash: false,
    execute: async (ctx) => {
        const sides = Number(ctx.args[0] || 6);

        if (!Number.isInteger(sides) || sides < 2 || sides > 100) {
            return ctx.reply(
                "Choose a number between 2 and 100. Example: `,dice 20`"
            );
        }

        const result = Math.floor(Math.random() * sides) + 1;

        return ctx.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(0x3498DB)
                    .setTitle("🎲 Dice Roll")
                    .setDescription(
                        `${ctx.user.username} rolled **${result}** on a ${sides}-sided die.`
                    )
            ]
        });
    }
});

registerCommand({
    name: "choose",
    description: "Choose randomly from a list of options.",
    usage: ",choose option 1 | option 2",
    slash: false,
    execute: async (ctx) => {
        const text = ctx.args.join(" ");
        const choices = text
            .split("|")
            .map(item => item.trim())
            .filter(Boolean);

        if (choices.length < 2) {
            return ctx.reply(
                "Provide at least two options.\n" +
                "Example: `,choose Basketball | Gaming | Music`"
            );
        }

        if (choices.length > 20) {
            return ctx.reply("You can provide up to 20 options.");
        }

        const choice = pyrrRandomItem(choices);

        return ctx.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(0x9B59B6)
                    .setTitle("🤔 PYRR Has Chosen")
                    .setDescription(`**Selected:** ${choice.slice(0, 500)}`)
            ]
        });
    }
});

registerCommand({
    name: "rate",
    description: "Give something a random fun rating.",
    usage: ",rate <subject>",
    slash: false,
    execute: async (ctx) => {
        const subject = ctx.args.join(" ");

        if (!subject) {
            return ctx.reply("Usage: `,rate <subject>`");
        }

        const rating = Math.floor(Math.random() * 101);

        return ctx.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(0xE91E63)
                    .setTitle("📊 PYRR Rating")
                    .addFields(
                        {
                            name: "Subject",
                            value: subject.slice(0, 500)
                        },
                        {
                            name: "Rating",
                            value: `**${rating}/100**`
                        }
                    )
                    .setFooter({
                        text: "Random rating for entertainment only."
                    })
            ]
        });
    }
});

registerCommand({
    name: "ship",
    description: "Generate a random compatibility rating for two members.",
    usage: ",ship @member1 @member2",
    slash: false,
    execute: async (ctx) => {
        const first = pyrrPickUser(ctx, 0);
        const second = pyrrPickUser(ctx, 1);

        if (!first || !second) {
            return ctx.reply(
                "Mention two server members.\n" +
                "Example: `,ship @member1 @member2`"
            );
        }

        const score = Math.floor(Math.random() * 101);
        const filled = Math.round(score / 10);
        const bar = "❤️".repeat(filled) + "🤍".repeat(10 - filled);

        const embed = new EmbedBuilder()
            .setColor(0xFF69B4)
            .setTitle("💞 PYRR Compatibility")
            .setDescription(
                `${first.user.username} + ${second.user.username}\n\n` +
                `${bar}\n**${score}% compatibility**`
            )
            .setFooter({
                text: "Random result — for fun only."
            });

        return ctx.reply({ embeds: [embed] });
    }
});

registerCommand({
    name: "hug",
    description: "Send someone a friendly virtual hug.",
    usage: ",hug @member",
    slash: false,
    execute: async (ctx) => {
        const target = pyrrPickUser(ctx);

        if (!target) {
            return ctx.reply(
                "Mention a server member to send a virtual hug."
            );
        }

        return ctx.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(0xFFB6C1)
                    .setTitle("🫂 Virtual Hug")
                    .setDescription(
                        `**${ctx.user.username}** sends a friendly virtual hug to **${target.user.username}**!`
                    )
            ]
        });
    }
});

registerCommand({
    name: "highfive",
    description: "Give someone a virtual high-five.",
    usage: ",highfive @member",
    slash: false,
    execute: async (ctx) => {
        const target = pyrrPickUser(ctx);

        if (!target) {
            return ctx.reply(
                "Mention a member to give them a high-five."
            );
        }

        return ctx.reply(
            `🙌 **${ctx.user.username}** gives **${target.user.username}** a high-five!`
        );
    }
});

registerCommand({
    name: "joke",
    description: "Get a random joke.",
    usage: ",joke",
    slash: false,
    execute: async (ctx) => {
        const jokes = [
            "Why was the math book sad? It had too many problems.",
            "Why don't keyboards fight? They prefer to keep their space.",
            "What did the zero say to the eight? Nice belt!",
            "Why was the computer calm? It knew how to process things.",
            "Why don't skeletons fight each other? They don't have the guts.",
            "Why did the computer go to the doctor? It caught a virus.",
            "What do you call a fake noodle? An impasta."
        ];

        return ctx.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(0xF39C12)
                    .setTitle("😂 PYRR Joke")
                    .setDescription(pyrrRandomItem(jokes))
            ]
        });
    }
});

registerCommand({
    name: "fact",
    description: "Get a random general knowledge fact.",
    usage: ",fact",
    slash: false,
    execute: async (ctx) => {
        const facts = [
            "An octopus has three hearts.",
            "The Sun is a star.",
            "The Pacific Ocean is the largest ocean on Earth.",
            "A day on Venus is longer than its year.",
            "Penguins are birds that cannot fly.",
            "Giraffes have seven neck vertebrae, just like humans.",
            "Honey can last a very long time when properly stored."
        ];

        return ctx.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(0x1ABC9C)
                    .setTitle("🧠 Random Fact")
                    .setDescription(pyrrRandomItem(facts))
            ]
        });
    }
});

registerCommand({
    name: "reverse",
    description: "Reverse a piece of text.",
    usage: ",reverse <text>",
    slash: false,
    execute: async (ctx) => {
        const input = ctx.args.join(" ");

        if (!input) {
            return ctx.reply("Usage: `,reverse <text>`");
        }

        const reversed = Array.from(input).reverse().join("");

        return ctx.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(0x5865F2)
                    .setTitle("🔄 Reversed Text")
                    .setDescription(reversed.slice(0, 4000))
            ]
        });
    }
});

registerCommand({
    name: "count",
    description: "Count the characters and words in a text.",
    usage: ",count <text>",
    slash: false,
    execute: async (ctx) => {
        const input = ctx.args.join(" ");

        if (!input) {
            return ctx.reply("Usage: `,count <text>`");
        }

        const words = input.trim().split(/\s+/).filter(Boolean).length;
        const characters = Array.from(input).length;
        const noSpaces = Array.from(input.replace(/\s/g, "")).length;

        return ctx.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(0x3498DB)
                    .setTitle("🔢 Text Counter")
                    .addFields(
                        {
                            name: "Characters",
                            value: String(characters),
                            inline: true
                        },
                        {
                            name: "Without Spaces",
                            value: String(noSpaces),
                            inline: true
                        },
                        {
                            name: "Words",
                            value: String(words),
                            inline: true
                        }
                    )
            ]
        });
    }
});

registerCommand({
    name: "mock",
    description: "Convert text to alternating uppercase and lowercase.",
    usage: ",mock <text>",
    slash: false,
    execute: async (ctx) => {
        const input = ctx.args.join(" ");

        if (!input) {
            return ctx.reply("Usage: `,mock <text>`");
        }

        let upper = false;

        const output = Array.from(input).map(char => {
            if (!/[a-z]/i.test(char)) return char;

            upper = !upper;
            return upper ? char.toUpperCase() : char.toLowerCase();
        }).join("");

        return ctx.reply(output.slice(0, 1900));
    }
});

registerCommand({
    name: "clap",
    description: "Insert clapping emojis between words.",
    usage: ",clap <text>",
    slash: false,
    execute: async (ctx) => {
        const input = ctx.args.join(" ");

        if (!input) {
            return ctx.reply("Usage: `,clap <text>`");
        }

        const output = input.split(/\s+/).join(" 👏 ");

        return ctx.reply(output.slice(0, 1900));
    }
});

registerCommand({
    name: "spoiler",
    description: "Hide text behind Discord spoiler formatting.",
    usage: ",spoiler <text>",
    slash: false,
    execute: async (ctx) => {
        const input = ctx.args.join(" ");

        if (!input) {
            return ctx.reply("Usage: `,spoiler <text>`");
        }

        const safeText = input.replace(/\|/g, "｜");

        return ctx.reply(`||${safeText.slice(0, 1800)}||`);
    }
});

registerCommand({
    name: "serverage",
    description: "Check how many days the server has existed.",
    usage: ",serverage",
    slash: false,
    execute: async (ctx) => {
        const created = ctx.guild?.createdTimestamp;

        if (!created) {
            return ctx.reply("Unable to retrieve the server creation date.");
        }

        const days = Math.floor((Date.now() - created) / 86400000);

        return ctx.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(0x5865F2)
                    .setTitle("📅 Server Age")
                    .setDescription(
                        `**${ctx.guild.name}** is **${days.toLocaleString()} days** old.`
                    )
                    .setTimestamp(new Date(created))
                    .setFooter({ text: "Server creation date" })
            ]
        });
    }
});

registerCommand({
    name: "avatar",
    description: "Display a member's avatar.",
    usage: ",avatar [@member]",
    slash: false,
    execute: async (ctx) => {
        const target = pyrrPickUser(ctx) || ctx.member;
        const avatar = target.user.displayAvatarURL({
            size: 1024,
            extension: "png"
        });

        return ctx.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(0x5865F2)
                    .setTitle(`${target.user.username}'s Avatar`)
                    .setImage(avatar)
                    .setURL(avatar)
            ]
        });
    }
});

registerCommand({
    name: "userinfo",
    description: "Display basic information about a member.",
    usage: ",userinfo [@member]",
    slash: false,
    execute: async (ctx) => {
        const target = pyrrPickUser(ctx) || ctx.member;

        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle(`👤 ${target.user.username}`)
            .setThumbnail(
                target.user.displayAvatarURL({ size: 256 })
            )
            .addFields(
                {
                    name: "User ID",
                    value: target.id,
                    inline: true
                },
                {
                    name: "Account Created",
                    value: `<t:${Math.floor(target.user.createdTimestamp / 1000)}:D>`,
                    inline: true
                },
                {
                    name: "Joined Server",
                    value: target.joinedTimestamp
                        ? `<t:${Math.floor(target.joinedTimestamp / 1000)}:D>`
                        : "Unknown",
                    inline: true
                },
                {
                    name: "Bot Account",
                    value: target.user.bot ? "Yes" : "No",
                    inline: true
                }
            )
            .setTimestamp();

        return ctx.reply({ embeds: [embed] });
    }
});

// END PART 15/20// ======================================================
// PYRR OFFICIAL — PART 16/20
// GAMES & INTERACTIVE COMMANDS
// ======================================================

registerCommand({
    name: "rps",
    description: "Play Rock Paper Scissors against PYRR.",
    usage: ",rps <rock|paper|scissors>",
    slash: false,
    execute: async (ctx) => {
        const valid = ["rock", "paper", "scissors"];
        const choice = (ctx.args[0] || "").toLowerCase();

        if (!valid.includes(choice)) {
            return ctx.reply(
                "Choose your move: `,rps rock`, `,rps paper`, or `,rps scissors`."
            );
        }

        const botChoice = pyrrRandomItem(valid);
        let result;

        if (choice === botChoice) {
            result = "It's a tie!";
        } else if (
            (choice === "rock" && botChoice === "scissors") ||
            (choice === "paper" && botChoice === "rock") ||
            (choice === "scissors" && botChoice === "paper")
        ) {
            result = "You win!";
        } else {
            result = "PYRR wins!";
        }

        const emoji = {
            rock: "🪨",
            paper: "📄",
            scissors: "✂️"
        };

        return ctx.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(0x5865F2)
                    .setTitle("🎮 Rock Paper Scissors")
                    .addFields(
                        {
                            name: "Your Choice",
                            value: `${emoji[choice]} ${choice}`,
                            inline: true
                        },
                        {
                            name: "PYRR's Choice",
                            value: `${emoji[botChoice]} ${botChoice}`,
                            inline: true
                        },
                        {
                            name: "Result",
                            value: `**${result}**`
                        }
                    )
                    .setFooter({
                        text: "PYRR OFFICIAL • Game result"
                    })
            ]
        });
    }
});

registerCommand({
    name: "guess",
    description: "Guess a number between 1 and 10.",
    usage: ",guess <number>",
    slash: false,
    execute: async (ctx) => {
        const guess = Number(ctx.args[0]);

        if (
            !ctx.args[0] ||
            !Number.isInteger(guess) ||
            guess < 1 ||
            guess > 10
        ) {
            return ctx.reply(
                "Enter a whole number from 1 to 10. Example: `,guess 7`."
            );
        }

        const answer = Math.floor(Math.random() * 10) + 1;
        const won = guess === answer;

        return ctx.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(won ? 0x2ECC71 : 0xE74C3C)
                    .setTitle("🔢 Number Guessing Game")
                    .setDescription(
                        `Your guess: **${guess}**\n` +
                        `Correct number: **${answer}**\n\n` +
                        (won
                            ? "🎉 Correct! You guessed the number!"
                            : "Not quite! Better luck next time.")
                    )
            ]
        });
    }
});

registerCommand({
    name: "trivia",
    description: "Answer a random trivia question.",
    usage: ",trivia",
    slash: false,
    execute: async (ctx) => {
        const questions = [
            {
                question: "Which planet is known as the Red Planet?",
                answers: ["mars", "Mars"],
                display: "Mars"
            },
            {
                question: "How many sides does a hexagon have?",
                answers: ["6", "six"],
                display: "6"
            },
            {
                question: "What is the largest ocean on Earth?",
                answers: ["pacific ocean", "pacific"],
                display: "The Pacific Ocean"
            },
            {
                question: "What is the chemical symbol for gold?",
                answers: ["au"],
                display: "Au"
            },
            {
                question: "How many days are there in a leap year?",
                answers: ["366"],
                display: "366"
            },
            {
                question: "Which star is closest to Earth?",
                answers: ["the sun", "sun"],
                display: "The Sun"
            },
            {
                question: "What is 12 multiplied by 12?",
                answers: ["144"],
                display: "144"
            }
        ];

        const item = pyrrRandomItem(questions);

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId("pyrr_trivia_reveal")
                .setLabel("Reveal Answer")
                .setStyle(ButtonStyle.Primary)
        );

        const message = await ctx.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(0x3498DB)
                    .setTitle("🧠 PYRR Trivia")
                    .setDescription(item.question)
                    .setFooter({
                        text: "Think carefully, then reveal the answer."
                    })
            ],
            components: [row],
            fetchReply: true
        });

        if (!message || !message.createMessageComponentCollector) {
            return;
        }

        const collector = message.createMessageComponentCollector({
            time: 30000
        });

        collector.on("collect", async (interaction) => {
            if (interaction.customId !== "pyrr_trivia_reveal") return;

            await interaction.reply({
                content: `Correct answer: **${item.display}**`,
                ephemeral: true
            });
        });

        collector.on("end", async () => {
            try {
                await message.edit({ components: [] });
            } catch (_) {}
        });
    }
});

registerCommand({
    name: "number",
    description: "Generate a random number within a range.",
    usage: ",number <minimum> <maximum>",
    slash: false,
    execute: async (ctx) => {
        const min = Number(ctx.args[0]);
        const max = Number(ctx.args[1]);

        if (
            ctx.args.length < 2 ||
            !Number.isSafeInteger(min) ||
            !Number.isSafeInteger(max) ||
            min > max ||
            max - min > 1000000000
        ) {
            return ctx.reply(
                "Usage: `,number <minimum> <maximum>`\n" +
                "Both values must be whole numbers, and the minimum cannot exceed the maximum."
            );
        }

        const result = Math.floor(Math.random() * (max - min + 1)) + min;

        return ctx.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(0x5865F2)
                    .setTitle("🎲 Random Number")
                    .setDescription(`Generated number: **${result}**`)
            ]
        });
    }
});

registerCommand({
    name: "fliptext",
    description: "Flip text upside down using Unicode characters.",
    usage: ",fliptext <text>",
    slash: false,
    execute: async (ctx) => {
        const input = ctx.args.join(" ");

        if (!input) {
            return ctx.reply("Usage: `,fliptext <text>`");
        }

        const map = {
            a: "ɐ", b: "q", c: "ɔ", d: "p", e: "ǝ",
            f: "ɟ", g: "ƃ", h: "ɥ", i: "ᴉ", j: "ɾ",
            k: "ʞ", l: "l", m: "ɯ", n: "u", o: "o",
            p: "d", q: "b", r: "ɹ", s: "s", t: "ʇ",
            u: "n", v: "ʌ", w: "ʍ", x: "x", y: "ʎ",
            z: "z",
            ".": "˙", ",": "'", "?": "¿", "!": "¡",
            "'": ",", "(": ")", ")": "(", "[": "]",
            "]": "[", "{": "}", "}": "{"
        };

        const output = Array.from(input)
            .reverse()
            .map(char => map[char.toLowerCase()] || char)
            .join("");

        return ctx.reply(output.slice(0, 1900));
    }
});

registerCommand({
    name: "emojify",
    description: "Convert letters into regional indicator emojis.",
    usage: ",emojify <text>",
    slash: false,
    execute: async (ctx) => {
        const input = ctx.args.join(" ").toLowerCase();

        if (!input) {
            return ctx.reply("Usage: `,emojify <text>`");
        }

        const output = Array.from(input).map(char => {
            if (char >= "a" && char <= "z") {
                return String.fromCodePoint(
                    0x1F1E6 + char.charCodeAt(0) - 97
                );
            }

            if (char === " ") return "   ";
            if (/[0-9]/.test(char)) return char;

            return char;
        }).join(" ");

        if (output.length > 1900) {
            return ctx.reply("That text is too long to emojify.");
        }

        return ctx.reply(output);
    }
});

registerCommand({
    name: "randomcolor",
    description: "Generate a random hexadecimal color.",
    usage: ",randomcolor",
    slash: false,
    execute: async (ctx) => {
        const hex = Math.floor(Math.random() * 16777216)
            .toString(16)
            .padStart(6, "0")
            .toUpperCase();

        const embed = new EmbedBuilder()
            .setColor(parseInt(hex, 16))
            .setTitle("🎨 Random Color")
            .setDescription(`Hex color: **#${hex}**`)
            .setFooter({
                text: "Use this hexadecimal value in your designs."
            });

        return ctx.reply({ embeds: [embed] });
    }
});

registerCommand({
    name: "percentage",
    description: "Calculate what percentage one number is of another.",
    usage: ",percentage <part> <total>",
    slash: false,
    execute: async (ctx) => {
        const part = Number(ctx.args[0]);
        const total = Number(ctx.args[1]);

        if (
            ctx.args.length < 2 ||
            !Number.isFinite(part) ||
            !Number.isFinite(total) ||
            total === 0
        ) {
            return ctx.reply(
                "Usage: `,percentage <part> <total>`\n" +
                "The total must be a valid non-zero number."
            );
        }

        const result = (part / total) * 100;

        return ctx.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(0x2ECC71)
                    .setTitle("📊 Percentage Calculator")
                    .setDescription(
                        `**${part}** is **${result.toFixed(2)}%** of **${total}**.`
                    )
            ]
        });
    }
});

registerCommand({
    name: "math",
    description: "Calculate a basic mathematical expression.",
    usage: ",math <number> <operator> <number>",
    slash: false,
    execute: async (ctx) => {
        const a = Number(ctx.args[0]);
        const operator = ctx.args[1];
        const b = Number(ctx.args[2]);

        if (
            ctx.args.length < 3 ||
            !Number.isFinite(a) ||
            !Number.isFinite(b) ||
            !["+", "-", "*", "/", "%"].includes(operator)
        ) {
            return ctx.reply(
                "Usage: `,math <number> <operator> <number>`\n" +
                "Supported operators: `+`, `-`, `*`, `/`, `%`.\n" +
                "Example: `,math 12 * 5`"
            );
        }

        if ((operator === "/" || operator === "%") && b === 0) {
            return ctx.reply("Division by zero is not allowed.");
        }

        let result;

        switch (operator) {
            case "+":
                result = a + b;
                break;
            case "-":
                result = a - b;
                break;
            case "*":
                result = a * b;
                break;
            case "/":
                result = a / b;
                break;
            case "%":
                result = a % b;
                break;
        }

        if (!Number.isFinite(result)) {
            return ctx.reply("The result is outside the supported numeric range.");
        }

        return ctx.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(0x3498DB)
                    .setTitle("🧮 Calculator")
                    .setDescription(
                        `**${a} ${operator} ${b} = ${result}**`
                    )
            ]
        });
    }
});

// END PART 16/20// ============================================================
// PART 17/20 — PROFILE, SERVER UTILITIES & INFORMATION
// Bot: PYRR OFFICIAL
// Creator: _upyr
// Prefix: ,
// ============================================================

// BOT INVITE
registerCommand({
    name: "invite",
    description: "Get the official PYRR OFFICIAL invite link.",
    usage: ",invite",
    slash: false,
    execute: async (ctx) => {
        const inviteUrl =
            "https://discord.com/oauth2/authorize?client_id=1560200028193165363&permissions=8&integration_type=0&scope=applications.commands+bot";

        return ctx.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(0x5865F2)
                    .setTitle("🤖 Invite PYRR OFFICIAL")
                    .setDescription(
                        `[Click here to invite PYRR OFFICIAL](${inviteUrl})`
                    )
                    .addFields({
                        name: "Requested Permissions",
                        value:
                            "This invite requests Administrator permissions. " +
                            "Review the permissions before authorizing the bot."
                    })
                    .setFooter({
                        text: "PYRR OFFICIAL • Created by _upyr"
                    })
                    .setTimestamp()
            ]
        });
    }
});

// SUPPORT SERVER
registerCommand({
    name: "support",
    description: "Get the official support server link.",
    usage: ",support",
    slash: false,
    execute: async (ctx) => {
        return ctx.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(0x5865F2)
                    .setTitle("🛠️ PYRR OFFICIAL Support")
                    .setDescription(
                        "Need help or want to report a problem?\n\n" +
                        "[Join the Official Support Server](https://discord.gg/TwDBvBmVdM)"
                    )
                    .addFields(
                        {
                            name: "Bot",
                            value: "PYRR OFFICIAL",
                            inline: true
                        },
                        {
                            name: "Creator",
                            value: "_upyr",
                            inline: true
                        }
                    )
                    .setFooter({
                        text: "PYRR OFFICIAL Support"
                    })
                    .setTimestamp()
            ]
        });
    }
});

// BOT INFORMATION
registerCommand({
    name: "botinfo",
    description: "View information about the bot.",
    usage: ",botinfo",
    slash: false,
    execute: async (ctx) => {
        const bot = ctx.client.user;
        const guildCount = ctx.client.guilds.cache.size;
        const userCount = ctx.client.guilds.cache.reduce(
            (total, guild) => total + guild.memberCount,
            0
        );

        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle("🤖 PYRR OFFICIAL")
            .setThumbnail(bot.displayAvatarURL({ size: 512 }))
            .setDescription(
                "Your all-in-one Discord server assistant."
            )
            .addFields(
                {
                    name: "Bot Name",
                    value: bot.tag,
                    inline: true
                },
                {
                    name: "Creator",
                    value: "_upyr",
                    inline: true
                },
                {
                    name: "Servers",
                    value: String(guildCount),
                    inline: true
                },
                {
                    name: "Cached Members",
                    value: String(userCount),
                    inline: true
                },
                {
                    name: "Library",
                    value: "discord.js",
                    inline: true
                },
                {
                    name: "Prefix",
                    value: "` , `".replaceAll(" ", ""),
                    inline: true
                }
            )
            .setFooter({
                text: "PYRR OFFICIAL • Information"
            })
            .setTimestamp();

        return ctx.reply({ embeds: [embed] });
    }
});

// BOT LATENCY
registerCommand({
    name: "ping",
    description: "Check the bot response and gateway latency.",
    usage: ",ping",
    slash: false,
    execute: async (ctx) => {
        const sent = await ctx.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(0xF1C40F)
                    .setTitle("🏓 Checking Latency...")
                    .setDescription("Please wait...")
            ],
            fetchReply: true
        });

        const messageLatency =
            sent.createdTimestamp - ctx.message.createdTimestamp;

        const gatewayLatency = Math.round(
            ctx.client.ws.ping
        );

        const embed = new EmbedBuilder()
            .setColor(0x57F287)
            .setTitle("🏓 PYRR OFFICIAL Latency")
            .addFields(
                {
                    name: "Message Latency",
                    value: `${messageLatency} ms`,
                    inline: true
                },
                {
                    name: "Gateway Latency",
                    value: `${gatewayLatency} ms`,
                    inline: true
                }
            )
            .setTimestamp();

        return ctx.reply({ embeds: [embed] });
    }
});

// SERVER INFORMATION
registerCommand({
    name: "serverinfo",
    description: "Display information about this server.",
    usage: ",serverinfo",
    slash: false,
    execute: async (ctx) => {
        if (!ctx.guild) {
            return ctx.reply(
                "This command can only be used inside a server."
            );
        }

        const guild = ctx.guild;

        let ownerText = "Unknown";

        try {
            const owner = await guild.fetchOwner();
            ownerText = `${owner.user.tag} (${owner.id})`;
        } catch {
            ownerText = "Unable to fetch server owner";
        }

        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle(`📊 ${guild.name}`)
            .setThumbnail(
                guild.iconURL({ size: 512 }) || null
            )
            .addFields(
                {
                    name: "Server ID",
                    value: guild.id,
                    inline: true
                },
                {
                    name: "Owner",
                    value: ownerText,
                    inline: true
                },
                {
                    name: "Members",
                    value: String(guild.memberCount),
                    inline: true
                },
                {
                    name: "Text Channels",
                    value: String(
                        guild.channels.cache.filter(
                            channel => channel.type === ChannelType.GuildText
                        ).size
                    ),
                    inline: true
                },
                {
                    name: "Voice Channels",
                    value: String(
                        guild.channels.cache.filter(
                            channel => channel.type === ChannelType.GuildVoice
                        ).size
                    ),
                    inline: true
                },
                {
                    name: "Roles",
                    value: String(guild.roles.cache.size),
                    inline: true
                },
                {
                    name: "Created",
                    value: `<t:${Math.floor(
                        guild.createdTimestamp / 1000
                    )}:F>`,
                    inline: false
                }
            )
            .setFooter({
                text: "PYRR OFFICIAL • Server Information"
            })
            .setTimestamp();

        return ctx.reply({ embeds: [embed] });
    }
});

// CHANNEL INFORMATION
registerCommand({
    name: "channelinfo",
    description: "Display information about a channel.",
    usage: ",channelinfo [#channel]",
    slash: false,
    execute: async (ctx) => {
        const channel =
            ctx.message.mentions.channels.first() ||
            ctx.guild?.channels.cache.get(ctx.args[0]) ||
            ctx.channel;

        if (!channel) {
            return ctx.reply("Channel not found.");
        }

        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle("📺 Channel Information")
            .addFields(
                {
                    name: "Name",
                    value: channel.name || "Unknown",
                    inline: true
                },
                {
                    name: "Channel ID",
                    value: channel.id,
                    inline: true
                },
                {
                    name: "Type",
                    value: String(channel.type),
                    inline: true
                },
                {
                    name: "Created",
                    value: `<t:${Math.floor(
                        channel.createdTimestamp / 1000
                    )}:F>`,
                    inline: false
                }
            )
            .setTimestamp();

        return ctx.reply({ embeds: [embed] });
    }
});

// ROLE LIST
registerCommand({
    name: "rolelist",
    description: "Show the roles in this server.",
    usage: ",rolelist",
    slash: false,
    execute: async (ctx) => {
        if (!ctx.guild) {
            return ctx.reply(
                "This command can only be used inside a server."
            );
        }

        const roles = ctx.guild.roles.cache
            .filter(role => role.id !== ctx.guild.id)
            .sort((a, b) => b.position - a.position)
            .map(role => `${role} — ${role.members.size} members`);

        if (!roles.length) {
            return ctx.reply("This server has no additional roles.");
        }

        const description = roles.slice(0, 40).join("\n");

        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle(`📋 Roles in ${ctx.guild.name}`)
            .setDescription(description.slice(0, 4000))
            .setFooter({
                text: `Showing ${Math.min(roles.length, 40)} of ${roles.length} roles`
            })
            .setTimestamp();

        return ctx.reply({ embeds: [embed] });
    }
});

// MEMBER LIST
registerCommand({
    name: "memberlist",
    description: "Show a list of cached server members.",
    usage: ",memberlist",
    slash: false,
    execute: async (ctx) => {
        if (!ctx.guild) {
            return ctx.reply(
                "This command can only be used inside a server."
            );
        }

        const members = ctx.guild.members.cache
            .first(25)
            .map(member =>
                `${member.user.bot ? "🤖" : "👤"} ${member.user.tag}`
            );

        if (!members.length) {
            return ctx.reply(
                "No cached members were found. Try again after the bot has loaded member data."
            );
        }

        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle(`👥 Members — ${ctx.guild.name}`)
            .setDescription(members.join("\n"))
            .setFooter({
                text: "Showing up to 25 cached members"
            })
            .setTimestamp();

        return ctx.reply({ embeds: [embed] });
    }
});

// SERVER BANNER
registerCommand({
    name: "serverbanner",
    description: "Show this server's banner.",
    usage: ",serverbanner",
    slash: false,
    execute: async (ctx) => {
        if (!ctx.guild) {
            return ctx.reply(
                "This command can only be used inside a server."
            );
        }

        try {
            const guild = await ctx.client.guilds.fetch({
                guild: ctx.guild.id,
                force: true
            });

            const bannerUrl = guild.bannerURL({
                size: 2048,
                extension: "png"
            });

            if (!bannerUrl) {
                return ctx.reply(
                    "This server does not have a banner set."
                );
            }

            const embed = new EmbedBuilder()
                .setColor(0x5865F2)
                .setTitle(`🖼️ ${guild.name} Banner`)
                .setImage(bannerUrl)
                .setTimestamp();

            return ctx.reply({ embeds: [embed] });
        } catch (error) {
            return ctx.reply(
                "Unable to retrieve the server banner."
            );
        }
    }
});

// USER BANNER
registerCommand({
    name: "banner",
    description: "Show a user's profile banner.",
    usage: ",banner [@user or user ID]",
    slash: false,
    execute: async (ctx) => {
        const target =
            ctx.message.mentions.users.first() ||
            (ctx.args[0]
                ? await ctx.client.users.fetch(ctx.args[0]).catch(() => null)
                : ctx.user);

        if (!target) {
            return ctx.reply("User not found.");
        }

        try {
            const user = await ctx.client.users.fetch(
                target.id,
                { force: true }
            );

            const bannerUrl = user.bannerURL({
                size: 2048,
                extension: "png"
            });

            if (!bannerUrl) {
                return ctx.reply(
                    `${user.tag} does not have a profile banner set.`
                );
            }

            const embed = new EmbedBuilder()
                .setColor(0x5865F2)
                .setTitle(`🖼️ ${user.tag}'s Banner`)
                .setImage(bannerUrl)
                .setTimestamp();

            return ctx.reply({ embeds: [embed] });
        } catch {
            return ctx.reply(
                "Unable to retrieve that user's banner."
            );
        }
    }
});

// ROLE INFORMATION
// NOTE: This command may already exist in Part 6.
// Keep only one command named "roleinfo" in the entire file.
registerCommand({
    name: "roleinfo",
    description: "Display information about a server role.",
    usage: ",roleinfo @role",
    slash: false,
    execute: async (ctx) => {
        if (!ctx.guild) {
            return ctx.reply(
                "This command can only be used inside a server."
            );
        }

        const role =
            ctx.message.mentions.roles.first() ||
            ctx.guild.roles.cache.get(ctx.args[0]);

        if (!role) {
            return ctx.reply(
                "Please mention a role or provide a valid role ID."
            );
        }

        const embed = new EmbedBuilder()
            .setColor(role.color || 0x5865F2)
            .setTitle(`🏷️ ${role.name}`)
            .addFields(
                {
                    name: "Role ID",
                    value: role.id,
                    inline: true
                },
                {
                    name: "Color",
                    value: role.hexColor,
                    inline: true
                },
                {
                    name: "Members",
                    value: String(role.members.size),
                    inline: true
                },
                {
                    name: "Mentionable",
                    value: role.mentionable ? "Yes" : "No",
                    inline: true
                },
                {
                    name: "Hoisted",
                    value: role.hoist ? "Yes" : "No",
                    inline: true
                },
                {
                    name: "Created",
                    value: `<t:${Math.floor(
                        role.createdTimestamp / 1000
                    )}:F>`,
                    inline: false
                }
            )
            .setTimestamp();

        return ctx.reply({ embeds: [embed] });
    }
});

// PERMISSIONS CHECK
// NOTE: This command may already exist in Part 7.
// Keep only one command named "permissions" in the entire file.
registerCommand({
    name: "permissions",
    description: "Check a member's server permissions.",
    usage: ",permissions [@user]",
    slash: false,
    execute: async (ctx) => {
        if (!ctx.guild) {
            return ctx.reply(
                "This command can only be used inside a server."
            );
        }

        const target =
            ctx.message.mentions.members.first() ||
            ctx.member;

        if (!target) {
            return ctx.reply("Member not found.");
        }

        const permissions = target.permissions.toArray();

        const readable = permissions.length
            ? permissions
                .slice(0, 30)
                .map(permission =>
                    `• ${permission
                        .replace(/([A-Z])/g, " $1")
                        .replace(/^./, character => character.toUpperCase())}`
                )
                .join("\n")
            : "No server permissions found.";

        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle(`🔐 Permissions — ${target.user.tag}`)
            .setDescription(readable)
            .setFooter({
                text: `Showing up to 30 permissions`
            })
            .setTimestamp();

        return ctx.reply({ embeds: [embed] });
    }
});

// ACCOUNT CREATION DATE
registerCommand({
    name: "created",
    description: "Check when a Discord account was created.",
    usage: ",created [@user]",
    slash: false,
    execute: async (ctx) => {
        const target =
            ctx.message.mentions.users.first() ||
            ctx.user;

        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle("📅 Account Creation")
            .setDescription(
                `**User:** ${target.tag}\n` +
                `**Created:** <t:${Math.floor(
                    target.createdTimestamp / 1000
                )}:F>\n` +
                `**Relative:** <t:${Math.floor(
                    target.createdTimestamp / 1000
                )}:R>`
            )
            .setThumbnail(
                target.displayAvatarURL({ size: 256 })
            )
            .setTimestamp();

        return ctx.reply({ embeds: [embed] });
    }
});

// BOT UPTIME
registerCommand({
    name: "uptime",
    description: "Check how long the bot has been online.",
    usage: ",uptime",
    slash: false,
    execute: async (ctx) => {
        const totalSeconds = Math.floor(
            ctx.client.uptime / 1000
        );

        const days = Math.floor(totalSeconds / 86400);
        const hours = Math.floor(
            (totalSeconds % 86400) / 3600
        );
        const minutes = Math.floor(
            (totalSeconds % 3600) / 60
        );
        const seconds = totalSeconds % 60;

        const embed = new EmbedBuilder()
            .setColor(0x57F287)
            .setTitle("⏱️ PYRR OFFICIAL Uptime")
            .setDescription(
                `**${days}** days, **${hours}** hours, ` +
                `**${minutes}** minutes, **${seconds}** seconds`
            )
            .setTimestamp();

        return ctx.reply({ embeds: [embed] });
    }
});

// END OF PART 17/20// ============================================================
// PART 18/20 — PYRR OFFICIAL ANTINUKE PROTECTION
// Defensive monitoring, trusted users, audit logs and alerts
// Prefix: ,
// ============================================================

// These settings are stored in memory and reset when the bot restarts.
// Persistent configuration can be connected in a later integration step.

const pyrrAntiNukeSettings = new Map();
const pyrrAntiNukeCooldowns = new Map();

const PYRR_ANTINUKE_OWNER_ID = "1551635950432428162";
const PYRR_ANTINUKE_AUDIT_WINDOW = 15000;
const PYRR_ANTINUKE_ALERT_COOLDOWN = 8000;

function pyrrAntiNukeGetSettings(guildId) {
    if (!pyrrAntiNukeSettings.has(guildId)) {
        pyrrAntiNukeSettings.set(guildId, {
            enabled: false,
            logChannelId: null,
            trustedUsers: [],
            threshold: 3,
            windowMs: 10000,
            actionCounts: {}
        });
    }

    return pyrrAntiNukeSettings.get(guildId);
}

function pyrrAntiNukeIsTrusted(guild, userId, settings) {
    if (!userId) return false;

    if (userId === PYRR_ANTINUKE_OWNER_ID) {
        return true;
    }

    if (userId === guild.ownerId) {
        return true;
    }

    return settings.trustedUsers.includes(userId);
}

function pyrrAntiNukeCanManage(ctx) {
    if (!ctx.guild || !ctx.member) return false;

    return (
        ctx.member.permissions.has(
            PermissionsBitField.Flags.Administrator
        ) ||
        ctx.user.id === PYRR_ANTINUKE_OWNER_ID
    );
}

async function pyrrAntiNukeSendAlert(guild, embed) {
    const settings = pyrrAntiNukeGetSettings(guild.id);

    if (!settings.logChannelId) return false;

    const channel = guild.channels.cache.get(
        settings.logChannelId
    );

    if (
        !channel ||
        !channel.isTextBased() ||
        !channel.permissionsFor(guild.members.me)?.has(
            PermissionsBitField.Flags.SendMessages
        )
    ) {
        return false;
    }

    try {
        await channel.send({ embeds: [embed] });
        return true;
    } catch (error) {
        console.error(
            "[PYRR ANTINUKE] Unable to send alert:",
            error.message
        );
        return false;
    }
}

function pyrrAntiNukeBuildAlert({
    guild,
    executor,
    action,
    target,
    trusted,
    count
}) {
    const embed = new EmbedBuilder()
        .setColor(trusted ? 0x57F287 : 0xED4245)
        .setTitle(
            trusted
                ? "🛡️ AntiNuke Activity Log"
                : "🚨 AntiNuke Security Alert"
        )
        .addFields(
            {
                name: "Server",
                value: guild.name,
                inline: true
            },
            {
                name: "Detected Action",
                value: action,
                inline: true
            },
            {
                name: "Executor",
                value: executor
                    ? `${executor.tag || executor.username || "Unknown"}\n\`${executor.id}\``
                    : "Unknown executor",
                inline: false
            },
            {
                name: "Target",
                value: target
                    ? String(target).slice(0, 1000)
                    : "Unknown target",
                inline: false
            },
            {
                name: "Recent Actions",
                value: String(count || 1),
                inline: true
            },
            {
                name: "Trusted Executor",
                value: trusted ? "Yes" : "No",
                inline: true
            }
        )
        .setFooter({
            text: "PYRR OFFICIAL • Defensive Monitoring"
        })
        .setTimestamp();

    return embed;
}

function pyrrAntiNukeGetCooldownKey(guildId, executorId, action) {
    return `${guildId}:${executorId}:${action}`;
}

function pyrrAntiNukeCountAction(guildId, executorId, action, settings) {
    const key = `${guildId}:${executorId}:${action}`;
    const now = Date.now();

    if (!settings.actionCounts[key]) {
        settings.actionCounts[key] = [];
    }

    settings.actionCounts[key] =
        settings.actionCounts[key].filter(
            timestamp => now - timestamp < settings.windowMs
        );

    settings.actionCounts[key].push(now);

    return settings.actionCounts[key].length;
}

async function pyrrAntiNukeCheckAudit({
    guild,
    auditType,
    action,
    targetId,
    targetLabel
}) {
    const settings = pyrrAntiNukeGetSettings(guild.id);

    if (!settings.enabled) return;
    if (!settings.logChannelId) return;

    let auditLogs;

    try {
        auditLogs = await guild.fetchAuditLogs({
            type: auditType,
            limit: 5
        });
    } catch (error) {
        console.warn(
            `[PYRR ANTINUKE] Cannot read audit logs in ${guild.name}:`,
            error.message
        );
        return;
    }

    const now = Date.now();

    const entry = auditLogs.entries.find(item => {
        const createdAt = item.createdTimestamp || 0;

        if (now - createdAt > PYRR_ANTINUKE_AUDIT_WINDOW) {
            return false;
        }

        if (!item.executorId) return false;

        if (
            targetId &&
            item.targetId &&
            item.targetId !== targetId
        ) {
            return false;
        }

        return true;
    });

    if (!entry || !entry.executorId) {
        // Never punish or accuse an unknown executor.
        return;
    }

    const executorId = entry.executorId;

    const trusted = pyrrAntiNukeIsTrusted(
        guild,
        executorId,
        settings
    );

    const count = pyrrAntiNukeCountAction(
        guild.id,
        executorId,
        action,
        settings
    );

    const cooldownKey = pyrrAntiNukeGetCooldownKey(
        guild.id,
        executorId,
        action
    );

    const lastAlert = pyrrAntiNukeCooldowns.get(cooldownKey) || 0;

    if (
        !trusted &&
        count >= settings.threshold &&
        now - lastAlert >= PYRR_ANTINUKE_ALERT_COOLDOWN
    ) {
        pyrrAntiNukeCooldowns.set(cooldownKey, now);
    }

    let executor = entry.executor;

    if (!executor) {
        try {
            executor = await guild.client.users.fetch(executorId);
        } catch {
            executor = null;
        }
    }

    const embed = pyrrAntiNukeBuildAlert({
        guild,
        executor,
        action,
        target: targetLabel,
        trusted,
        count
    });

    // The system logs suspicious actions. It does not automatically
    // ban users, delete channels, or alter roles.
    await pyrrAntiNukeSendAlert(guild, embed);

    if (!trusted && count >= settings.threshold) {
        console.warn(
            `[PYRR ANTINUKE] Threshold reached: ${action} in ${guild.name} by ${executorId}`
        );
    }
}

// ------------------------------------------------------------
// ANTINUKE STATUS AND CONFIGURATION
// ------------------------------------------------------------

registerCommand({
    name: "antinuke",
    description: "View or enable/disable AntiNuke monitoring.",
    usage: ",antinuke [on/off/status]",
    slash: false,
    execute: async (ctx) => {
        if (!ctx.guild) {
            return ctx.reply(
                "This command can only be used inside a server."
            );
        }

        const settings = pyrrAntiNukeGetSettings(ctx.guild.id);
        const option = (ctx.args[0] || "status").toLowerCase();

        if (option === "status") {
            const embed = new EmbedBuilder()
                .setColor(settings.enabled ? 0x57F287 : 0x747F8D)
                .setTitle("🛡️ PYRR AntiNuke Status")
                .addFields(
                    {
                        name: "Monitoring",
                        value: settings.enabled ? "Enabled" : "Disabled",
                        inline: true
                    },
                    {
                        name: "Alert Channel",
                        value: settings.logChannelId
                            ? `<#${settings.logChannelId}>`
                            : "Not configured",
                        inline: true
                    },
                    {
                        name: "Action Threshold",
                        value: `${settings.threshold} actions`,
                        inline: true
                    },
                    {
                        name: "Detection Window",
                        value: `${settings.windowMs / 1000} seconds`,
                        inline: true
                    },
                    {
                        name: "Trusted Users",
                        value: String(settings.trustedUsers.length),
                        inline: true
                    }
                )
                .setDescription(
                    "AntiNuke monitors selected destructive server actions " +
                    "and sends alerts when audit-log data is available."
                )
                .setFooter({
                    text: "Settings reset when the bot restarts"
                })
                .setTimestamp();

            return ctx.reply({ embeds: [embed] });
        }

        if (!pyrrAntiNukeCanManage(ctx)) {
            return ctx.reply(
                "You need Administrator permission to change AntiNuke settings."
            );
        }

        if (option === "on") {
            if (!settings.logChannelId) {
                return ctx.reply(
                    "Set an alert channel first using `,antinukelog #channel`."
                );
            }

            settings.enabled = true;

            return ctx.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0x57F287)
                        .setTitle("🛡️ AntiNuke Enabled")
                        .setDescription(
                            "AntiNuke monitoring is now enabled.\n\n" +
                            "Suspicious actions will be logged when matching audit-log entries are available. " +
                            "No automatic punishments are enabled."
                        )
                        .setTimestamp()
                ]
            });
        }

        if (option === "off") {
            settings.enabled = false;

            return ctx.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0xED4245)
                        .setTitle("AntiNuke Disabled")
                        .setDescription(
                            "AntiNuke monitoring has been disabled."
                        )
                        .setTimestamp()
                ]
            });
        }

        return ctx.reply(
            "Usage: `,antinuke on`, `,antinuke off`, or `,antinuke status`"
        );
    }
});

// ------------------------------------------------------------
// CONFIGURE THE ALERT CHANNEL
// ------------------------------------------------------------

registerCommand({
    name: "antinukelog",
    description: "Set the channel for AntiNuke security alerts.",
    usage: ",antinukelog #channel",
    slash: false,
    execute: async (ctx) => {
        if (!ctx.guild) {
            return ctx.reply(
                "This command can only be used inside a server."
            );
        }

        if (!pyrrAntiNukeCanManage(ctx)) {
            return ctx.reply(
                "You need Administrator permission to configure the alert channel."
            );
        }

        const channel =
            ctx.message.mentions.channels.first() ||
            ctx.guild.channels.cache.get(ctx.args[0]);

        if (!channel || !channel.isTextBased()) {
            return ctx.reply(
                "Please mention a valid text channel. Example: `,antinukelog #security-logs`"
            );
        }

        const botMember = ctx.guild.members.me;

        if (
            !botMember ||
            !channel.permissionsFor(botMember)?.has(
                PermissionsBitField.Flags.SendMessages
            ) ||
            !channel.permissionsFor(botMember)?.has(
                PermissionsBitField.Flags.EmbedLinks
            )
        ) {
            return ctx.reply(
                "I need permission to Send Messages and Embed Links in that channel."
            );
        }

        const settings = pyrrAntiNukeGetSettings(ctx.guild.id);
        settings.logChannelId = channel.id;

        return ctx.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(0x57F287)
                    .setTitle("✅ AntiNuke Alert Channel Set")
                    .setDescription(
                        `Security alerts will be sent to ${channel}.`
                    )
                    .setTimestamp()
            ]
        });
    }
});

// ------------------------------------------------------------
// ADD A TRUSTED USER
// ------------------------------------------------------------

registerCommand({
    name: "antinukeallow",
    description: "Add a trusted user to the AntiNuke allowlist.",
    usage: ",antinukeallow @user",
    slash: false,
    execute: async (ctx) => {
        if (!ctx.guild) {
            return ctx.reply(
                "This command can only be used inside a server."
            );
        }

        if (!pyrrAntiNukeCanManage(ctx)) {
            return ctx.reply(
                "You need Administrator permission to manage the allowlist."
            );
        }

        const user =
            ctx.message.mentions.users.first() ||
            (ctx.args[0]
                ? await ctx.client.users.fetch(ctx.args[0]).catch(() => null)
                : null);

        if (!user) {
            return ctx.reply(
                "Mention a valid user or provide their user ID."
            );
        }

        const settings = pyrrAntiNukeGetSettings(ctx.guild.id);

        if (user.id === ctx.guild.ownerId) {
            return ctx.reply(
                "The server owner is already trusted automatically."
            );
        }

        if (user.id === PYRR_ANTINUKE_OWNER_ID) {
            return ctx.reply(
                "The bot owner is already trusted automatically."
            );
        }

        if (settings.trustedUsers.includes(user.id)) {
            return ctx.reply(
                "That user is already on the AntiNuke allowlist."
            );
        }

        settings.trustedUsers.push(user.id);

        return ctx.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(0x57F287)
                    .setTitle("✅ Trusted User Added")
                    .setDescription(
                        `${user.tag} (\`${user.id}\`) was added to the AntiNuke allowlist.`
                    )
                    .setFooter({
                        text: "Only add people you trust."
                    })
                    .setTimestamp()
            ]
        });
    }
});

// ------------------------------------------------------------
// REMOVE A TRUSTED USER
// ------------------------------------------------------------

registerCommand({
    name: "antinukeunallow",
    description: "Remove a user from the AntiNuke allowlist.",
    usage: ",antinukeunallow @user",
    slash: false,
    execute: async (ctx) => {
        if (!ctx.guild) {
            return ctx.reply(
                "This command can only be used inside a server."
            );
        }

        if (!pyrrAntiNukeCanManage(ctx)) {
            return ctx.reply(
                "You need Administrator permission to manage the allowlist."
            );
        }

        const user =
            ctx.message.mentions.users.first() ||
            (ctx.args[0]
                ? await ctx.client.users.fetch(ctx.args[0]).catch(() => null)
                : null);

        if (!user) {
            return ctx.reply(
                "Mention a valid user or provide their user ID."
            );
        }

        if (
            user.id === ctx.guild.ownerId ||
            user.id === PYRR_ANTINUKE_OWNER_ID
        ) {
            return ctx.reply(
                "This user is trusted automatically and cannot be removed through this command."
            );
        }

        const settings = pyrrAntiNukeGetSettings(ctx.guild.id);
        const index = settings.trustedUsers.indexOf(user.id);

        if (index === -1) {
            return ctx.reply(
                "That user is not on the AntiNuke allowlist."
            );
        }

        settings.trustedUsers.splice(index, 1);

        return ctx.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(0xED4245)
                    .setTitle("Trusted User Removed")
                    .setDescription(
                        `${user.tag} (\`${user.id}\`) was removed from the allowlist.`
                    )
                    .setTimestamp()
            ]
        });
    }
});

// ------------------------------------------------------------
// VIEW THE TRUSTED USER LIST
// ------------------------------------------------------------

registerCommand({
    name: "antinukelist",
    description: "View the AntiNuke trusted-user allowlist.",
    usage: ",antinukelist",
    slash: false,
    execute: async (ctx) => {
        if (!ctx.guild) {
            return ctx.reply(
                "This command can only be used inside a server."
            );
        }

        const settings = pyrrAntiNukeGetSettings(ctx.guild.id);

        const users = settings.trustedUsers.length
            ? settings.trustedUsers.map(
                (id, index) => `${index + 1}. <@${id}> — \`${id}\``
            )
            : ["No additional trusted users configured."];

        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle("🛡️ AntiNuke Allowlist")
            .setDescription(users.join("\n").slice(0, 4000))
            .setFooter({
                text: "Server owner and bot owner are trusted automatically."
            })
            .setTimestamp();

        return ctx.reply({ embeds: [embed] });
    }
});

// ------------------------------------------------------------
// SET THE ALERT THRESHOLD
// ------------------------------------------------------------

registerCommand({
    name: "antinukethreshold",
    description: "Set the suspicious-action alert threshold.",
    usage: ",antinukethreshold <2-10>",
    slash: false,
    execute: async (ctx) => {
        if (!ctx.guild) {
            return ctx.reply(
                "This command can only be used inside a server."
            );
        }

        if (!pyrrAntiNukeCanManage(ctx)) {
            return ctx.reply(
                "You need Administrator permission to change this setting."
            );
        }

        const amount = Number(ctx.args[0]);

        if (
            !Number.isInteger(amount) ||
            amount < 2 ||
            amount > 10
        ) {
            return ctx.reply(
                "Choose a whole number between 2 and 10. Example: `,antinukethreshold 3`"
            );
        }

        const settings = pyrrAntiNukeGetSettings(ctx.guild.id);
        settings.threshold = amount;

        return ctx.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(0x57F287)
                    .setTitle("AntiNuke Threshold Updated")
                    .setDescription(
                        `The alert threshold is now **${amount} actions** within **${settings.windowMs / 1000} seconds** for the same action type and executor.`
                    )
                    .setTimestamp()
            ]
        });
    }
});

// ------------------------------------------------------------
// DETECT CHANNEL DELETIONS
// Audit event type 12 = Channel Delete
// ------------------------------------------------------------

client.on("channelDelete", async (channel) => {
    try {
        if (!channel.guild) return;

        await pyrrAntiNukeCheckAudit({
            guild: channel.guild,
            auditType: 12,
            action: "Channel Delete",
            targetId: channel.id,
            targetLabel: `#${channel.name || "unknown"} (${channel.id})`
        });
    } catch (error) {
        console.error(
            "[PYRR ANTINUKE] Channel deletion listener error:",
            error.message
        );
    }
});

// ------------------------------------------------------------
// DETECT ROLE DELETIONS
// Audit event type 32 = Role Delete
// ------------------------------------------------------------

client.on("roleDelete", async (role) => {
    try {
        await pyrrAntiNukeCheckAudit({
            guild: role.guild,
            auditType: 32,
            action: "Role Delete",
            targetId: role.id,
            targetLabel: `${role.name} (${role.id})`
        });
    } catch (error) {
        console.error(
            "[PYRR ANTINUKE] Role deletion listener error:",
            error.message
        );
    }
});

// ------------------------------------------------------------
// DETECT SERVER BANS
// Audit event type 22 = Member Ban Add
// ------------------------------------------------------------

client.on("guildBanAdd", async (ban) => {
    try {
        await pyrrAntiNukeCheckAudit({
            guild: ban.guild,
            auditType: 22,
            action: "Member Ban",
            targetId: ban.user.id,
            targetLabel: `${ban.user.tag} (${ban.user.id})`
        });
    } catch (error) {
        console.error(
            "[PYRR ANTINUKE] Ban listener error:",
            error.message
        );
    }
});

// ------------------------------------------------------------
// DETECT BOT ADDITIONS
// Audit event type 28 = Bot Add
// ------------------------------------------------------------

client.on("guildMemberAdd", async (member) => {
    try {
        if (!member.user.bot) return;

        await pyrrAntiNukeCheckAudit({
            guild: member.guild,
            auditType: 28,
            action: "Bot Added",
            targetId: member.id,
            targetLabel: `${member.user.tag} (${member.id})`
        });
    } catch (error) {
        console.error(
            "[PYRR ANTINUKE] Bot addition listener error:",
            error.message
        );
    }
});

// ------------------------------------------------------------
// DETECT WEBHOOK CREATION OR UPDATES
// Audit event type 50 = Webhook Create
// ------------------------------------------------------------

client.on("webhookUpdate", async (channel) => {
    try {
        if (!channel.guild) return;

        await pyrrAntiNukeCheckAudit({
            guild: channel.guild,
            auditType: 50,
            action: "Webhook Update / Possible Creation",
            targetId: null,
            targetLabel: `Channel: ${channel.name || channel.id}`
        });
    } catch (error) {
        console.error(
            "[PYRR ANTINUKE] Webhook listener error:",
            error.message
        );
    }
});

// ------------------------------------------------------------
// END OF PART 18/20
// ============================================================
 // ------------------------------------------------------------
// PYRR ANTINUKE — DETECT CHANNEL CREATION
// Audit event type 10 = Channel Create
// ------------------------------------------------------------

client.on("channelCreate", async (channel) => {
    try {
        if (!channel.guild) return;

        await pyrrAntiNukeCheckAudit({
            guild: channel.guild,
            auditType: 10,
            action: "Channel Create",
            targetId: channel.id,
            targetLabel: `#${channel.name || "unknown"} (${channel.id})`
        });
    } catch (error) {
        console.error(
            "[PYRR ANTINUKE] Channel creation listener error:",
            error.message
        );
    }
});

// ------------------------------------------------------------
// DETECT ROLE CREATION
// Audit event type 30 = Role Create
// ------------------------------------------------------------

client.on("roleCreate", async (role) => {
    try {
        await pyrrAntiNukeCheckAudit({
            guild: role.guild,
            auditType: 30,
            action: "Role Create",
            targetId: role.id,
            targetLabel: `${role.name} (${role.id})`
        });
    } catch (error) {
        console.error(
            "[PYRR ANTINUKE] Role creation listener error:",
            error.message
        );
    }
});

// ------------------------------------------------------------
// DETECT MEMBER KICKS
// Audit event type 20 = Member Kick
// ------------------------------------------------------------

client.on("guildMemberRemove", async (member) => {
    try {
        const guild = member.guild;
        if (!guild) return;

        await pyrrAntiNukeCheckAudit({
            guild,
            auditType: 20,
            action: "Member Kick",
            targetId: member.id,
            targetLabel: `${member.user?.tag || member.id} (${member.id})`
        });
    } catch (error) {
        console.error(
            "[PYRR ANTINUKE] Member removal listener error:",
            error.message
        );
    }
});

// ------------------------------------------------------------
// DETECT MASS ROLE PERMISSION CHANGES
// Audit event type 31 = Role Update
// ------------------------------------------------------------

client.on("roleUpdate", async (oldRole, newRole) => {
    try {
        const dangerousPermissions = [
            "Administrator",
            "ManageGuild",
            "ManageRoles",
            "ManageChannels",
            "BanMembers",
            "KickMembers",
            "ManageWebhooks"
        ];

        const gainedDangerousPermission =
            dangerousPermissions.some((permission) =>
                !oldRole.permissions.has(permission) &&
                newRole.permissions.has(permission)
            );

        if (!gainedDangerousPermission) return;

        await pyrrAntiNukeCheckAudit({
            guild: newRole.guild,
            auditType: 31,
            action: "Dangerous Role Permission Added",
            targetId: newRole.id,
            targetLabel: `${newRole.name} (${newRole.id})`
        });
    } catch (error) {
        console.error(
            "[PYRR ANTINUKE] Role update listener error:",
            error.message
        );
    }
});

// ------------------------------------------------------------
// END OF PART 19/20
// ------------------------------------------------------------

 // ============================================================
// PYRR BOT — PART 20/20
// SERVER UPDATE DETECTION + ANTINUKE AUDIT ALERTS
// Requires: discord.js v14
// Requires: pyrrAntiNukeCheckAudit()
// ============================================================

// ------------------------------------------------------------
// DETECT SERVER SETTINGS / NAME CHANGES
// Audit event type 1 = Guild Update
// ------------------------------------------------------------

client.on("guildUpdate", async (oldGuild, newGuild) => {
    try {
        const changed =
            oldGuild.name !== newGuild.name ||
            oldGuild.icon !== newGuild.icon ||
            oldGuild.vanityURLCode !== newGuild.vanityURLCode;

        if (!changed) return;

        await pyrrAntiNukeCheckAudit({
            guild: newGuild,
            auditType: 1,
            action: "Server Settings Update",
            targetId: newGuild.id,
            targetLabel: `${newGuild.name} (${newGuild.id})`
        });
    } catch (error) {
        console.error(
            "[PYRR ANTINUKE] Guild update listener error:",
            error.message
        );
    }
});

// ------------------------------------------------------------
// DETECT MEMBER ROLE CHANGES
// Audit event type 25 = Member Role Update
// ------------------------------------------------------------

client.on("guildMemberUpdate", async (oldMember, newMember) => {
    try {
        const oldRoles = new Set(oldMember.roles.cache.keys());
        const newRoles = new Set(newMember.roles.cache.keys());

        const addedRoles = [...newRoles].filter(
            (roleId) => !oldRoles.has(roleId)
        );

        const removedRoles = [...oldRoles].filter(
            (roleId) => !newRoles.has(roleId)
        );

        if (addedRoles.length === 0 && removedRoles.length === 0) {
            return;
        }

        await pyrrAntiNukeCheckAudit({
            guild: newMember.guild,
            auditType: 25,
            action: "Member Role Update",
            targetId: newMember.id,
            targetLabel:
                `${newMember.user.tag} (${newMember.id})`
        });
    } catch (error) {
        console.error(
            "[PYRR ANTINUKE] Member role update listener error:",
            error.message
        );
    }
});

// ------------------------------------------------------------
// READY CHECK — ANTINUKE MODULE
// ------------------------------------------------------------

client.once("ready", () => {
    console.log("------------------------------------");
    console.log("PYRR ANTINUKE EVENT LISTENERS READY");
    console.log("Channel Create / Delete: Enabled");
    console.log("Role Create / Update / Delete: Enabled");
    console.log("Member Ban / Kick: Detection enabled");
    console.log("Bot Additions: Detection enabled");
    console.log("Webhook Updates: Detection enabled");
    console.log("Guild Settings: Detection enabled");
    console.log("Member Role Updates: Detection enabled");
    console.log("------------------------------------");
});

// ============================================================
// END OF PART 20/20
// ============================================================
