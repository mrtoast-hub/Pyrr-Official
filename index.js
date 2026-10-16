'use strict';

// PYRR OFFICIAL — rebuilt single-file Discord bot
// Node.js 22 | discord.js v14 | prefix commands only
// Creator: YOW Jhay
// Configure DISCORD_TOKEN and BOT_OWNER_ID in your host environment.

const {
  Client, GatewayIntentBits, Partials, PermissionsBitField, EmbedBuilder,
  ActivityType, ChannelType, AuditLogEvent
} = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');

// ----------------------------- CONFIG -----------------------------
const BOT_NAME = 'PYRR OFFICIAL';
const CREATOR = 'YOW Jhay';
const PREFIX = ',';
const OWNER_ID = process.env.BOT_OWNER_ID || '';
const TWITCH_URL = 'https://m.twitch.tv/noctis_official01/home';
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'pyrr-data.json');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildInvites
  ],
  partials: [Partials.Channel, Partials.Message, Partials.Reaction]
});

// ----------------------------- STORAGE ----------------------------
let db = {};
function loadDb() {
  try {
    if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '{}');
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const parsed = raw.trim() ? JSON.parse(raw) : {};
    db = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (err) {
    console.error('[PYRR] Could not load database:', err.message);
    db = {};
  }
}
function saveDb() {
  try {
    const temp = DATA_FILE + '.tmp';
    fs.writeFileSync(temp, JSON.stringify(db, null, 2));
    fs.renameSync(temp, DATA_FILE);
  } catch (err) {
    console.error('[PYRR] Could not save database:', err.message);
  }
}
function guildData(guildId) {
  if (!db[guildId]) {
    db[guildId] = {
      logChannel: null, welcomeChannel: null, leaveChannel: null, autorole: null,
      mutedRole: null, welcomeText: 'Welcome {user} to {server}!',
      leaveText: '{user} left {server}.', antinuke: false, antiraid: false,
      automod: false, automodInvites: false, automodSpam: true,
      raidJoinLimit: 8, raidWindowMs: 15000, raidJoinTimestamps: [],
      disabled: [], warnings: {}, tickets: {}, ticketCategory: null,
      ticketPanelChannel: null, starboard: null, autoReact: false,
      autoReactEmoji: '✨', autoReactChannel: null, giveaways: {},
      economy: {}, levels: {}, custom: {}
    };
    saveDb();
  }
  // Add missing fields to older databases safely.
  const defaults = {
    logChannel: null, welcomeChannel: null, leaveChannel: null, autorole: null,
    mutedRole: null, welcomeText: 'Welcome {user} to {server}!',
    leaveText: '{user} left {server}.', antinuke: false, antiraid: false,
    automod: false, automodInvites: false, automodSpam: true,
    raidJoinLimit: 8, raidWindowMs: 15000, raidJoinTimestamps: [],
    disabled: [], warnings: {}, tickets: {}, ticketCategory: null,
    ticketPanelChannel: null, starboard: null, autoReact: false,
    autoReactEmoji: '✨', autoReactChannel: null, giveaways: {}, economy: {},
    levels: {}, custom: {}
  };
  for (const [key, value] of Object.entries(defaults)) {
    if (db[guildId][key] === undefined) db[guildId][key] = value;
  }
  return db[guildId];
}
loadDb();

// -------------------------- COMMAND SYSTEM -------------------------
const commands = new Map();
const aliases = new Map();
const cooldowns = new Map();
function register(name, description, category, run, options = {}) {
  const key = String(name || '').toLowerCase().trim();
  if (!/^[a-z0-9_-]+$/.test(key)) throw new Error('Invalid command name: ' + key);
  if (commands.has(key) || aliases.has(key)) {
    console.warn('[PYRR] Duplicate command skipped:', key);
    return false;
  }
  const command = {
    name: key, description: description || 'PYRR command.',
    category: category || 'General', run,
    aliases: Array.isArray(options.aliases) ? options.aliases : [],
    admin: Boolean(options.admin), mod: Boolean(options.mod), owner: Boolean(options.owner),
    cooldown: Number(options.cooldown) || 0
  };
  commands.set(key, command);
  for (const aliasValue of command.aliases) {
    const alias = String(aliasValue).toLowerCase().trim();
    if (!/^[a-z0-9_-]+$/.test(alias) || commands.has(alias) || aliases.has(alias)) {
      console.warn('[PYRR] Duplicate/invalid alias skipped:', alias);
      continue;
    }
    aliases.set(alias, key);
  }
  return true;
}

// ------------------------------ HELPERS ----------------------------
const Colors = { primary: 0x5865F2, success: 0x2ECC71, error: 0xED4245, warning: 0xF1C40F, neutral: 0x747F8D };
function makeEmbed(title, description, color = Colors.primary) {
  const e = new EmbedBuilder().setColor(color).setTitle(String(title || BOT_NAME).slice(0, 256)).setTimestamp();
  if (description !== undefined && description !== null && String(description).length) e.setDescription(String(description).slice(0, 4096));
  return e;
}
const ok = text => makeEmbed('✅ Done', text, Colors.success);
const fail = text => makeEmbed('❌ Error', text, Colors.error);
const info = text => makeEmbed('ℹ️ PYRR OFFICIAL', text, Colors.primary);
const clean = (value, max = 1800) => String(value ?? '').slice(0, max);
const isOwner = user => Boolean(OWNER_ID && user?.id === OWNER_ID);
const hasPerm = (member, perm) => Boolean(member?.permissions?.has(perm));
const isAdmin = member => hasPerm(member, PermissionsBitField.Flags.Administrator);
const isModerator = member => isAdmin(member) || hasPerm(member, PermissionsBitField.Flags.ModerateMembers) || hasPerm(member, PermissionsBitField.Flags.ManageMessages);
function durationMs(raw) {
  const m = String(raw || '').toLowerCase().match(/^(\d+)(s|m|h|d)$/);
  if (!m) return null;
  const amount = Number(m[1]);
  const ms = amount * ({ s: 1000, m: 60000, h: 3600000, d: 86400000 })[m[2]];
  return Number.isSafeInteger(ms) && ms > 0 && ms <= 2419200000 ? ms : null;
}
function durationLabel(ms) {
  let left = Math.max(0, Math.floor(ms / 1000));
  const parts = [];
  for (const [name, size] of [['d', 86400], ['h', 3600], ['m', 60], ['s', 1]]) {
    const n = Math.floor(left / size);
    if (n) { parts.push(`${n}${name}`); left -= n * size; }
  }
  return parts.join(' ') || '0s';
}
function parseArgs(text) {
  return String(text || '').match(/"[^\"]*"|'[^']*'|\S+/g)?.map(x => x.replace(/^(?:"([\s\S]*)"|'([\s\S]*)')$/, (_, a, b) => a ?? b)) || [];
}
function memberFrom(ctx, token) {
  const mentioned = ctx.message?.mentions?.members?.first();
  if (mentioned) return mentioned;
  const id = String(token || '').replace(/[<@!>]/g, '');
  if (!/^\d{17,20}$/.test(id)) return null;
  return ctx.guild?.members?.cache?.get(id) || null;
}
function channelFrom(ctx, token) {
  const mentioned = ctx.message?.mentions?.channels?.first();
  if (mentioned) return mentioned;
  const id = String(token || '').replace(/[<#>]/g, '');
  if (!/^\d{17,20}$/.test(id)) return null;
  return ctx.guild?.channels?.cache?.get(id) || null;
}
function roleFrom(ctx, token) {
  const mentioned = ctx.message?.mentions?.roles?.first();
  if (mentioned) return mentioned;
  const id = String(token || '').replace(/[<@&>]/g, '');
  if (!/^\d{17,20}$/.test(id)) return null;
  return ctx.guild?.roles?.cache?.get(id) || null;
}
function ctxForMessage(message, args) {
  return {
    message, guild: message.guild, channel: message.channel, member: message.member,
    author: message.author, args,
    reply: payload => message.reply(typeof payload === 'string'
      ? { content: payload, allowedMentions: { repliedUser: false } }
      : { ...payload, allowedMentions: payload?.allowedMentions || { repliedUser: false } })
  };
}
function requireGuild(ctx) {
  if (ctx.guild) return true;
  ctx.reply({ embeds: [fail('Use this command inside a Discord server.')] }).catch(() => {});
  return false;
}
async function sendLog(guild, text, color = Colors.neutral) {
  if (!guild) return;
  const d = guildData(guild.id);
  if (!d.logChannel) return;
  const ch = guild.channels.cache.get(d.logChannel);
  if (!ch?.isTextBased() || !ch.isSendable()) return;
  await ch.send({ embeds: [makeEmbed('Server Log', text, color)] }).catch(() => {});
}
function formatUser(user) { return user ? `${user.tag || user.username || 'Unknown'} (${user.id})` : 'Unknown user'; }
function resolveText(ctx) { return ctx.args.join(' ').trim(); }
function warningList(guildId, userId) {
  const d = guildData(guildId);
  if (!Array.isArray(d.warnings[userId])) d.warnings[userId] = [];
  return d.warnings[userId];
}
function addWarning(guildId, userId, reason, moderatorId) {
  const list = warningList(guildId, userId);
  list.push({ reason: clean(reason || 'No reason given', 500), moderatorId, at: Date.now() });
  saveDb(); return list.length;
}
function userTarget(ctx, index = 0) { return memberFrom(ctx, ctx.args[index]); }
function checkTarget(ctx, target) {
  if (!target) return 'Member not found. Mention them or provide a valid user ID.';
  if (target.id === ctx.author.id) return 'You cannot use this command on yourself.';
  if (target.id === client.user?.id) return 'You cannot use this command on the bot.';
  if (ctx.guild?.ownerId === target.id) return 'You cannot moderate the server owner.';
  if (ctx.member && target.roles.highest.position >= ctx.member.roles.highest.position && ctx.guild?.ownerId !== ctx.author.id && !isOwner(ctx.author)) return 'Your highest role must be above the target member.';
  return null;
}

// ----------------------- INFORMATION COMMANDS ----------------------
register('help', 'Show command categories or details for one command.', 'Information', async ctx => {
  const query = (ctx.args[0] || '').toLowerCase();
  const resolved = aliases.get(query) || query;
  if (query && commands.has(resolved)) {
    const c = commands.get(resolved);
    return ctx.reply({ embeds: [makeEmbed(`${PREFIX}${c.name}`, `${c.description}\n**Category:** ${c.category}\n**Usage:** \`${PREFIX}${c.name}${c.name === 'help' ? ' [command]' : ''}\`${c.aliases.length ? `\n**Aliases:** ${c.aliases.map(a => `\`${a}\``).join(', ')}` : ''}`)] });
  }
  const groups = new Map();
  for (const c of commands.values()) groups.set(c.category, (groups.get(c.category) || 0) + 1);
  const lines = [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([name, count]) => `**${name}** — ${count} commands`);
  return ctx.reply({ embeds: [makeEmbed('PYRR OFFICIAL • Help', `Prefix: \`${PREFIX}\`\nExample: \`${PREFIX}help moderation\`\n\n${lines.join('\n')}\n\nTotal unique commands: **${commands.size}**\nCreator: **${CREATOR}**`)] });
}, { aliases: ['commands', 'cmds'] });
register('ping', 'Show bot latency.', 'Utility', async ctx => ctx.reply({ embeds: [makeEmbed('🏓 Pong!', `Gateway: ${Math.max(0, Math.round(client.ws.ping))} ms`)] }), { aliases: ['latency'] });
register('botinfo', 'Show bot runtime information.', 'Information', async ctx => ctx.reply({ embeds: [makeEmbed(BOT_NAME, `Creator: **${CREATOR}**\nServers: **${client.guilds.cache.size}**\nUnique commands: **${commands.size}**\nNode.js: **${process.version}**\nPrefix: \`${PREFIX}\``)] }), { aliases: ['about', 'stats'] });
register('uptime', 'Show bot uptime.', 'Utility', async ctx => ctx.reply({ embeds: [makeEmbed('⏱️ Uptime', durationLabel(client.uptime || 0))] }));
register('invite', 'Create an invite link for the bot.', 'Information', async ctx => {
  if (!client.user) return ctx.reply({ embeds: [fail('Bot is not ready yet.')] });
  const url = `https://discord.com/oauth2/authorize?client_id=${client.user.id}&scope=bot&permissions=0`;
  return ctx.reply({ embeds: [makeEmbed('Invite PYRR OFFICIAL', `[Add the bot to a server](${url})\nAsk a server administrator to grant only the permissions the bot needs.`)] });
});
register('support', 'Show support information.', 'Information', async ctx => ctx.reply({ embeds: [makeEmbed('PYRR Support', `Creator: **${CREATOR}**\nTwitch: ${TWITCH_URL}\nFor help, contact the server administrator.`)] }));
register('serverinfo', 'Show server information.', 'Information', async ctx => {
  if (!requireGuild(ctx)) return;
  const g = ctx.guild;
  return ctx.reply({ embeds: [makeEmbed(g.name, `ID: \`${g.id}\`\nOwner: <@${g.ownerId}>\nMembers: **${g.memberCount}**\nChannels: **${g.channels.cache.size}**\nRoles: **${g.roles.cache.size}**\nCreated: <t:${Math.floor(g.createdTimestamp / 1000)}:F>`)] });
}, { aliases: ['guildinfo'] });
register('membercount', 'Show server member count.', 'Information', async ctx => { if (!requireGuild(ctx)) return; return ctx.reply({ embeds: [info(`Members: **${ctx.guild.memberCount}**`)] }); }, { aliases: ['members'] });
register('userinfo', 'Show information about a member.', 'Information', async ctx => {
  if (!requireGuild(ctx)) return;
  const m = userTarget(ctx) || ctx.member;
  if (!m) return ctx.reply({ embeds: [fail('Member not found.')] });
  return ctx.reply({ embeds: [makeEmbed(m.user.tag, `ID: \`${m.id}\`\nBot: **${m.user.bot ? 'Yes' : 'No'}**\nJoined: ${m.joinedTimestamp ? `<t:${Math.floor(m.joinedTimestamp / 1000)}:R>` : 'Unknown'}\nAccount created: <t:${Math.floor(m.user.createdTimestamp / 1000)}:F>\nTop role: ${m.roles.highest}`)] });
}, { aliases: ['whois'] });
register('avatar', 'Show a member avatar.', 'Information', async ctx => {
  const m = userTarget(ctx);
  const user = m?.user || ctx.author;
  const url = user.displayAvatarURL({ size: 1024, extension: 'png' });
  return ctx.reply({ embeds: [new EmbedBuilder().setColor(Colors.primary).setTitle(`${user.tag || user.username} avatar`).setImage(url).setURL(url)] });
}, { aliases: ['pfp'] });
register('rolelist', 'List server roles.', 'Information', async ctx => {
  if (!requireGuild(ctx)) return;
  const roles = ctx.guild.roles.cache.filter(r => r.id !== ctx.guild.id).sort((a, b) => b.position - a.position).first(35);
  const text = roles.map(r => `${r} — ${r.members.size} members`).join('\n') || 'No roles found.';
  return ctx.reply({ embeds: [makeEmbed('Server Roles', text)] });
});
register('channellist', 'List text and voice channels.', 'Information', async ctx => {
  if (!requireGuild(ctx)) return;
  const channels = ctx.guild.channels.cache.filter(c => [ChannelType.GuildText, ChannelType.GuildVoice, ChannelType.GuildAnnouncement, ChannelType.GuildForum].includes(c.type)).first(45);
  return ctx.reply({ embeds: [makeEmbed('Server Channels', channels.map(c => `${c} — ${ChannelType[c.type] || 'Channel'}`).join('\n') || 'No channels found.')] });
});
register('roleinfo', 'Show details for a role.', 'Information', async ctx => {
  if (!requireGuild(ctx)) return;
  const role = roleFrom(ctx, ctx.args[0]);
  if (!role) return ctx.reply({ embeds: [fail(`Usage: ${PREFIX}roleinfo @role`)] });
  return ctx.reply({ embeds: [makeEmbed(role.name, `ID: \`${role.id}\`\nMembers: **${role.members.size}**\nPosition: **${role.position}**\nMentionable: **${role.mentionable ? 'Yes' : 'No'}**\nManaged: **${role.managed ? 'Yes' : 'No'}**`)] });
});
register('channelinfo', 'Show details for a channel.', 'Information', async ctx => {
  if (!requireGuild(ctx)) return;
  const ch = channelFrom(ctx, ctx.args[0]) || ctx.channel;
  return ctx.reply({ embeds: [makeEmbed(ch.name || 'Channel', `ID: \`${ch.id}\`\nType: **${ChannelType[ch.type] || ch.type}**\nCreated: <t:${Math.floor(ch.createdTimestamp / 1000)}:F>`)] });
});

// ------------------------- MODERATION COMMANDS ---------------------
register('warn', 'Warn a member and save the warning.', 'Moderation', async ctx => {
  if (!requireGuild(ctx)) return;
  const target = userTarget(ctx);
  const issue = checkTarget(ctx, target);
  if (issue) return ctx.reply({ embeds: [fail(issue)] });
  if (!hasPerm(ctx.member, PermissionsBitField.Flags.ModerateMembers) && !isAdmin(ctx.member)) return ctx.reply({ embeds: [fail('You need Moderate Members permission.')] });
  const reason = ctx.args.slice(1).join(' ') || 'No reason given';
  const count = addWarning(ctx.guild.id, target.id, reason, ctx.author.id);
  await sendLog(ctx.guild, `${formatUser(ctx.author)} warned ${formatUser(target.user)}. Reason: ${clean(reason, 500)} (warning #${count})`, Colors.warning);
  return ctx.reply({ embeds: [ok(`Warned ${target.user.tag}. Total warnings: **${count}**.\nReason: ${clean(reason, 500)}`)] });
}, { mod: true });
register('warnings', 'View saved warnings for a member.', 'Moderation', async ctx => {
  if (!requireGuild(ctx)) return;
  if (!isModerator(ctx.member)) return ctx.reply({ embeds: [fail('Moderation permission required.')] });
  const target = userTarget(ctx);
  if (!target) return ctx.reply({ embeds: [fail(`Usage: ${PREFIX}warnings @member`)] });
  const list = warningList(ctx.guild.id, target.id);
  const body = list.slice(-10).map((w, i) => `**${Math.max(1, list.length - Math.min(10, list.length) + i + 1)}.** ${clean(w.reason, 250)} — <@${w.moderatorId}> (<t:${Math.floor(w.at / 1000)}:R>)`).join('\n');
  return ctx.reply({ embeds: [makeEmbed(`Warnings: ${target.user.tag}`, body || 'No warnings saved.')] });
}, { aliases: ['warns'], mod: true });
register('clearwarnings', 'Clear warnings for a member.', 'Moderation', async ctx => {
  if (!requireGuild(ctx)) return;
  if (!isAdmin(ctx.member)) return ctx.reply({ embeds: [fail('Administrator permission required.')] });
  const target = userTarget(ctx);
  if (!target) return ctx.reply({ embeds: [fail(`Usage: ${PREFIX}clearwarnings @member`)] });
  guildData(ctx.guild.id).warnings[target.id] = []; saveDb();
  await sendLog(ctx.guild, `${formatUser(ctx.author)} cleared warnings for ${formatUser(target.user)}.`);
  return ctx.reply({ embeds: [ok(`Cleared warnings for ${target.user.tag}.`)] });
}, { admin: true });
register('kick', 'Kick a member from the server.', 'Moderation', async ctx => {
  if (!requireGuild(ctx)) return;
  const target = userTarget(ctx); const issue = checkTarget(ctx, target);
  if (issue) return ctx.reply({ embeds: [fail(issue)] });
  if (!hasPerm(ctx.member, PermissionsBitField.Flags.KickMembers)) return ctx.reply({ embeds: [fail('Kick Members permission required.')] });
  if (!target.kickable) return ctx.reply({ embeds: [fail('I cannot kick this member. Check my role position and permissions.')] });
  const reason = ctx.args.slice(1).join(' ') || `Kicked by ${ctx.author.tag}`;
  await target.kick(clean(reason, 450));
  await sendLog(ctx.guild, `${formatUser(ctx.author)} kicked ${formatUser(target.user)}. Reason: ${clean(reason, 500)}`, Colors.warning);
  return ctx.reply({ embeds: [ok(`Kicked **${target.user.tag}**. Reason: ${clean(reason, 500)}`)] });
}, { mod: true });
register('ban', 'Ban a member from the server.', 'Moderation', async ctx => {
  if (!requireGuild(ctx)) return;
  const target = userTarget(ctx); const issue = checkTarget(ctx, target);
  if (issue) return ctx.reply({ embeds: [fail(issue)] });
  if (!hasPerm(ctx.member, PermissionsBitField.Flags.BanMembers)) return ctx.reply({ embeds: [fail('Ban Members permission required.')] });
  if (!target.bannable) return ctx.reply({ embeds: [fail('I cannot ban this member. Check my role position and permissions.')] });
  const reason = ctx.args.slice(1).join(' ') || `Banned by ${ctx.author.tag}`;
  await target.ban({ reason: clean(reason, 450) });
  await sendLog(ctx.guild, `${formatUser(ctx.author)} banned ${formatUser(target.user)}. Reason: ${clean(reason, 500)}`, Colors.error);
  return ctx.reply({ embeds: [ok(`Banned **${target.user.tag}**. Reason: ${clean(reason, 500)}`)] });
}, { mod: true });
register('unban', 'Unban a user by ID.', 'Moderation', async ctx => {
  if (!requireGuild(ctx)) return;
  if (!hasPerm(ctx.member, PermissionsBitField.Flags.BanMembers)) return ctx.reply({ embeds: [fail('Ban Members permission required.')] });
  const id = String(ctx.args[0] || '').replace(/\D/g, '');
  if (!/^\d{17,20}$/.test(id)) return ctx.reply({ embeds: [fail(`Usage: ${PREFIX}unban <user ID>`)] });
  await ctx.guild.members.unban(id, `Unbanned by ${ctx.author.tag}`);
  await sendLog(ctx.guild, `${formatUser(ctx.author)} unbanned user ID ${id}.`);
  return ctx.reply({ embeds: [ok(`Unbanned user ID ${id}.`)] });
}, { mod: true });
register('timeout', 'Timeout a member. Duration format: 10m, 2h, 1d.', 'Moderation', async ctx => {
  if (!requireGuild(ctx)) return;
  const target = userTarget(ctx); const issue = checkTarget(ctx, target);
  if (issue) return ctx.reply({ embeds: [fail(issue)] });
  if (!hasPerm(ctx.member, PermissionsBitField.Flags.ModerateMembers)) return ctx.reply({ embeds: [fail('Moderate Members permission required.')] });
  const duration = durationMs(ctx.args[1]);
  if (!duration) return ctx.reply({ embeds: [fail(`Usage: ${PREFIX}timeout @member 10m [reason]`)] });
  if (!target.moderatable) return ctx.reply({ embeds: [fail('I cannot timeout this member.')] });
  const reason = ctx.args.slice(2).join(' ') || `Timed out by ${ctx.author.tag}`;
  await target.timeout(duration, clean(reason, 450));
  await sendLog(ctx.guild, `${formatUser(ctx.author)} timed out ${formatUser(target.user)} for ${durationLabel(duration)}. Reason: ${clean(reason, 400)}`, Colors.warning);
  return ctx.reply({ embeds: [ok(`Timed out ${target.user.tag} for ${durationLabel(duration)}.`)] });
}, { mod: true, aliases: ['mute'] });
register('untimeout', 'Remove timeout from a member.', 'Moderation', async ctx => {
  if (!requireGuild(ctx)) return;
  const target = userTarget(ctx); const issue = checkTarget(ctx, target);
  if (issue) return ctx.reply({ embeds: [fail(issue)] });
  if (!hasPerm(ctx.member, PermissionsBitField.Flags.ModerateMembers)) return ctx.reply({ embeds: [fail('Moderate Members permission required.')] });
  if (!target.moderatable) return ctx.reply({ embeds: [fail('I cannot edit this member.')] });
  await target.timeout(null, `Timeout removed by ${ctx.author.tag}`);
  await sendLog(ctx.guild, `${formatUser(ctx.author)} removed timeout from ${formatUser(target.user)}.`);
  return ctx.reply({ embeds: [ok(`Removed timeout from ${target.user.tag}.`)] });
}, { mod: true, aliases: ['unmute'] });
register('purge', 'Delete recent messages. Usage: ,purge 10', 'Moderation', async ctx => {
  if (!requireGuild(ctx)) return;
  if (!hasPerm(ctx.member, PermissionsBitField.Flags.ManageMessages)) return ctx.reply({ embeds: [fail('Manage Messages permission required.')] });
  if (!hasPerm(ctx.guild.members.me, PermissionsBitField.Flags.ManageMessages)) return ctx.reply({ embeds: [fail('I need Manage Messages permission.')] });
  const count = Number(ctx.args[0]);
  if (!Number.isInteger(count) || count < 1 || count > 100) return ctx.reply({ embeds: [fail(`Usage: ${PREFIX}purge <1-100>`)] });
  const deleted = await ctx.channel.bulkDelete(count, true);
  const notice = await ctx.channel.send({ embeds: [ok(`Deleted ${deleted.size} recent messages.`)] }).catch(() => null);
  if (notice) setTimeout(() => notice.delete().catch(() => {}), 5000);
  await sendLog(ctx.guild, `${formatUser(ctx.author)} purged ${deleted.size} messages in <#${ctx.channel.id}>.`);
}, { mod: true, aliases: ['clear'] });
register('slowmode', 'Set channel slowmode in seconds (0-21600).', 'Moderation', async ctx => {
  if (!requireGuild(ctx)) return;
  if (!hasPerm(ctx.member, PermissionsBitField.Flags.ManageChannels)) return ctx.reply({ embeds: [fail('Manage Channels permission required.')] });
  const seconds = Number(ctx.args[0]);
  if (!Number.isInteger(seconds) || seconds < 0 || seconds > 21600) return ctx.reply({ embeds: [fail(`Usage: ${PREFIX}slowmode <0-21600>`)] });
  await ctx.channel.setRateLimitPerUser(seconds, `Set by ${ctx.author.tag}`);
  return ctx.reply({ embeds: [ok(`Slowmode set to ${seconds} seconds.`)] });
}, { mod: true });
register('lock', 'Lock the current text channel.', 'Moderation', async ctx => {
  if (!requireGuild(ctx)) return;
  if (!hasPerm(ctx.member, PermissionsBitField.Flags.ManageChannels)) return ctx.reply({ embeds: [fail('Manage Channels permission required.')] });
  await ctx.channel.permissionOverwrites.edit(ctx.guild.roles.everyone, { SendMessages: false }, { reason: `Locked by ${ctx.author.tag}` });
  return ctx.reply({ embeds: [ok('Channel locked for @everyone.')] });
}, { mod: true });
register('unlock', 'Unlock the current text channel.', 'Moderation', async ctx => {
  if (!requireGuild(ctx)) return;
  if (!hasPerm(ctx.member, PermissionsBitField.Flags.ManageChannels)) return ctx.reply({ embeds: [fail('Manage Channels permission required.')] });
  await ctx.channel.permissionOverwrites.edit(ctx.guild.roles.everyone, { SendMessages: null }, { reason: `Unlocked by ${ctx.author.tag}` });
  return ctx.reply({ embeds: [ok('Channel unlocked for @everyone.')] });
}, { mod: true });
register('nickname', 'Set a member nickname.', 'Moderation', async ctx => {
  if (!requireGuild(ctx)) return;
  const target = userTarget(ctx); const issue = checkTarget(ctx, target);
  if (issue) return ctx.reply({ embeds: [fail(issue)] });
  if (!hasPerm(ctx.member, PermissionsBitField.Flags.ManageNicknames)) return ctx.reply({ embeds: [fail('Manage Nicknames permission required.')] });
  if (!target.manageable) return ctx.reply({ embeds: [fail('I cannot change this member nickname.')] });
  const nick = ctx.args.slice(1).join(' ').trim();
  await target.setNickname(nick || null, `Changed by ${ctx.author.tag}`);
  return ctx.reply({ embeds: [ok(`Nickname ${nick ? `set to **${clean(nick, 32)}**` : 'cleared'} for ${target.user.tag}.`)] });
}, { mod: true, aliases: ['nick'] });
register('roleadd', 'Give a role to a member.', 'Moderation', async ctx => {
  if (!requireGuild(ctx)) return;
  if (!hasPerm(ctx.member, PermissionsBitField.Flags.ManageRoles)) return ctx.reply({ embeds: [fail('Manage Roles permission required.')] });
  const target = userTarget(ctx); const role = roleFrom(ctx, ctx.args[1]);
  if (!target || !role) return ctx.reply({ embeds: [fail(`Usage: ${PREFIX}roleadd @member @role`)] });
  if (role.managed || role.position >= ctx.guild.members.me.roles.highest.position) return ctx.reply({ embeds: [fail('I cannot assign that role due to its position or managed status.')] });
  await target.roles.add(role, `Role added by ${ctx.author.tag}`);
  return ctx.reply({ embeds: [ok(`Added ${role} to ${target.user.tag}.`)] });
}, { mod: true });
register('roleremove', 'Remove a role from a member.', 'Moderation', async ctx => {
  if (!requireGuild(ctx)) return;
  if (!hasPerm(ctx.member, PermissionsBitField.Flags.ManageRoles)) return ctx.reply({ embeds: [fail('Manage Roles permission required.')] });
  const target = userTarget(ctx); const role = roleFrom(ctx, ctx.args[1]);
  if (!target || !role) return ctx.reply({ embeds: [fail(`Usage: ${PREFIX}roleremove @member @role`)] });
  if (role.managed || role.position >= ctx.guild.members.me.roles.highest.position) return ctx.reply({ embeds: [fail('I cannot remove that role due to its position or managed status.')] });
  await target.roles.remove(role, `Role removed by ${ctx.author.tag}`);
  return ctx.reply({ embeds: [ok(`Removed ${role} from ${target.user.tag}.`)] });
}, { mod: true });

// ---------------------- SERVER CONFIGURATION -----------------------
register('setlog', 'Set server log channel.', 'Configuration', async ctx => {
  if (!requireGuild(ctx)) return;
  if (!isAdmin(ctx.member)) return ctx.reply({ embeds: [fail('Administrator permission required.')] });
  const ch = channelFrom(ctx, ctx.args[0]);
  if (!ch || !ch.isTextBased()) return ctx.reply({ embeds: [fail(`Usage: ${PREFIX}setlog #channel`)] });
  guildData(ctx.guild.id).logChannel = ch.id; saveDb();
  return ctx.reply({ embeds: [ok(`Server logs will be sent to ${ch}.`)] });
}, { admin: true, aliases: ['logchannel'] });
register('welcome', 'Set welcome channel. Usage: ,welcome #channel', 'Configuration', async ctx => {
  if (!requireGuild(ctx)) return;
  if (!isAdmin(ctx.member)) return ctx.reply({ embeds: [fail('Administrator permission required.')] });
  const ch = channelFrom(ctx, ctx.args[0]);
  if (!ch || !ch.isTextBased()) return ctx.reply({ embeds: [fail(`Usage: ${PREFIX}welcome #channel`)] });
  guildData(ctx.guild.id).welcomeChannel = ch.id; saveDb();
  return ctx.reply({ embeds: [ok(`Welcome messages will be sent to ${ch}.`)] });
}, { admin: true, aliases: ['setwelcome'] });
register('leave', 'Set leave channel. Usage: ,leave #channel', 'Configuration', async ctx => {
  if (!requireGuild(ctx)) return;
  if (!isAdmin(ctx.member)) return ctx.reply({ embeds: [fail('Administrator permission required.')] });
  const ch = channelFrom(ctx, ctx.args[0]);
  if (!ch || !ch.isTextBased()) return ctx.reply({ embeds: [fail(`Usage: ${PREFIX}leave #channel`)] });
  guildData(ctx.guild.id).leaveChannel = ch.id; saveDb();
  return ctx.reply({ embeds: [ok(`Leave messages will be sent to ${ch}.`)] });
}, { admin: true, aliases: ['setleave'] });
register('setwelcome-text', 'Set welcome text. Tokens: {user}, {server}.', 'Configuration', async ctx => {
  if (!requireGuild(ctx)) return;
  if (!isAdmin(ctx.member)) return ctx.reply({ embeds: [fail('Administrator permission required.')] });
  const text = resolveText(ctx);
  if (!text) return ctx.reply({ embeds: [fail(`Usage: ${PREFIX}setwelcome-text Welcome {user} to {server}!`)] });
  guildData(ctx.guild.id).welcomeText = clean(text, 1000); saveDb();
  return ctx.reply({ embeds: [ok('Welcome message updated.')] });
}, { admin: true });
register('setleave-text', 'Set leave text. Tokens: {user}, {server}.', 'Configuration', async ctx => {
  if (!requireGuild(ctx)) return;
  if (!isAdmin(ctx.member)) return ctx.reply({ embeds: [fail('Administrator permission required.')] });
  const text = resolveText(ctx);
  if (!text) return ctx.reply({ embeds: [fail(`Usage: ${PREFIX}setleave-text {user} left {server}.`)] });
  guildData(ctx.guild.id).leaveText = clean(text, 1000); saveDb();
  return ctx.reply({ embeds: [ok('Leave message updated.')] });
}, { admin: true });
register('autorole', 'Set autorole for new members.', 'Configuration', async ctx => {
  if (!requireGuild(ctx)) return;
  if (!isAdmin(ctx.member)) return ctx.reply({ embeds: [fail('Administrator permission required.')] });
  const role = roleFrom(ctx, ctx.args[0]);
  if (!role) return ctx.reply({ embeds: [fail(`Usage: ${PREFIX}autorole @role`)] });
  if (role.managed || role.position >= ctx.guild.members.me.roles.highest.position) return ctx.reply({ embeds: [fail('Move my bot role above the autorole first.')] });
  guildData(ctx.guild.id).autorole = role.id; saveDb();
  return ctx.reply({ embeds: [ok(`Autorole set to ${role}.`)] });
}, { admin: true });
register('setmuterole', 'Set a role to use as the server mute role.', 'Configuration', async ctx => {
  if (!requireGuild(ctx)) return;
  if (!isAdmin(ctx.member)) return ctx.reply({ embeds: [fail('Administrator permission required.')] });
  const role = roleFrom(ctx, ctx.args[0]);
  if (!role) return ctx.reply({ embeds: [fail(`Usage: ${PREFIX}setmuterole @role`)] });
  guildData(ctx.guild.id).mutedRole = role.id; saveDb();
  return ctx.reply({ embeds: [ok(`Muted role saved as ${role}. This setting does not automatically assign the role.`)] });
}, { admin: true });
register('config', 'Show current PYRR server configuration.', 'Configuration', async ctx => {
  if (!requireGuild(ctx)) return;
  if (!isAdmin(ctx.member)) return ctx.reply({ embeds: [fail('Administrator permission required.')] });
  const d = guildData(ctx.guild.id);
  return ctx.reply({ embeds: [makeEmbed('PYRR Configuration', `Log channel: ${d.logChannel ? `<#${d.logChannel}>` : 'Not set'}\nWelcome channel: ${d.welcomeChannel ? `<#${d.welcomeChannel}>` : 'Not set'}\nLeave channel: ${d.leaveChannel ? `<#${d.leaveChannel}>` : 'Not set'}\nAutorole: ${d.autorole ? `<@&${d.autorole}>` : 'Not set'}\nAntiNuke alerts: **${d.antinuke ? 'ON' : 'OFF'}**\nAntiRaid alerts: **${d.antiraid ? 'ON' : 'OFF'}**\nAutoMod: **${d.automod ? 'ON' : 'OFF'}**\nAuto-reaction: **${d.autoReact ? 'ON' : 'OFF'}**`)] });
}, { admin: true, aliases: ['settings'] });

// -------------------------- PROTECTION TOOLS -----------------------
register('automod', 'Toggle basic automod alerts: ,automod on|off', 'Protection', async ctx => {
  if (!requireGuild(ctx)) return;
  if (!isAdmin(ctx.member)) return ctx.reply({ embeds: [fail('Administrator permission required.')] });
  const mode = (ctx.args[0] || '').toLowerCase();
  if (!['on', 'off'].includes(mode)) return ctx.reply({ embeds: [fail(`Usage: ${PREFIX}automod on|off`)] });
  guildData(ctx.guild.id).automod = mode === 'on'; saveDb();
  return ctx.reply({ embeds: [ok(`AutoMod alerts ${mode.toUpperCase()}. This basic mode logs invite/spam-like messages; it does not promise to catch everything.`)] });
}, { admin: true });
register('antinuke', 'Toggle anti-nuke audit alerts: ,antinuke on|off', 'Protection', async ctx => {
  if (!requireGuild(ctx)) return;
  if (!isAdmin(ctx.member)) return ctx.reply({ embeds: [fail('Administrator permission required.')] });
  const mode = (ctx.args[0] || '').toLowerCase();
  if (!['on', 'off'].includes(mode)) return ctx.reply({ embeds: [fail(`Usage: ${PREFIX}antinuke on|off`)] });
  guildData(ctx.guild.id).antinuke = mode === 'on'; saveDb();
  return ctx.reply({ embeds: [ok(`AntiNuke audit alerts ${mode.toUpperCase()}. Alerts only; the bot will not automatically punish audit-log actors.`)] });
}, { admin: true });
register('antiraid', 'Toggle join-spike alerts: ,antiraid on|off', 'Protection', async ctx => {
  if (!requireGuild(ctx)) return;
  if (!isAdmin(ctx.member)) return ctx.reply({ embeds: [fail('Administrator permission required.')] });
  const mode = (ctx.args[0] || '').toLowerCase();
  if (!['on', 'off'].includes(mode)) return ctx.reply({ embeds: [fail(`Usage: ${PREFIX}antiraid on|off`)] });
  guildData(ctx.guild.id).antiraid = mode === 'on'; saveDb();
  return ctx.reply({ embeds: [ok(`AntiRaid join-spike alerts ${mode.toUpperCase()}.`)] });
}, { admin: true });
register('autoreact', 'Enable or disable opt-in automatic reactions. Usage: ,autoreact on ✨ [#channel]', 'Configuration', async ctx => {
  if (!requireGuild(ctx)) return;
  if (!isAdmin(ctx.member)) return ctx.reply({ embeds: [fail('Administrator permission required.')] });
  const mode = (ctx.args[0] || '').toLowerCase();
  if (!['on', 'off'].includes(mode)) return ctx.reply({ embeds: [fail(`Usage: ${PREFIX}autoreact on ✨ [#channel]`)] });
  const d = guildData(ctx.guild.id);
  d.autoReact = mode === 'on';
  if (ctx.args[1] && !ctx.args[1].startsWith('<#')) d.autoReactEmoji = ctx.args[1];
  const ch = ctx.args.find(a => /^<#\d{17,20}>$/.test(a));
  if (ch) d.autoReactChannel = ch.replace(/[<#>]/g, '');
  saveDb();
  return ctx.reply({ embeds: [ok(`Automatic reactions ${mode.toUpperCase()}${d.autoReact ? ` using ${d.autoReactEmoji}${d.autoReactChannel ? ` in <#${d.autoReactChannel}>` : ' in all text channels'}` : ''}.`)] });
}, { admin: true });

// ------------------------------ TICKETS ----------------------------
register('ticketpanel', 'Post a support ticket panel in this channel.', 'Tickets', async ctx => {
  if (!requireGuild(ctx)) return;
  if (!isAdmin(ctx.member)) return ctx.reply({ embeds: [fail('Administrator permission required.')] });
  const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
  const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('pyrr_ticket_open').setLabel('Open Ticket').setStyle(ButtonStyle.Primary));
  const sent = await ctx.channel.send({ embeds: [makeEmbed('PYRR Support Tickets', 'Press **Open Ticket** to create a private support channel.')], components: [row] });
  guildData(ctx.guild.id).ticketPanelChannel = ctx.channel.id; saveDb();
  return ctx.reply({ embeds: [ok(`Ticket panel posted: ${sent.url}`)] });
}, { admin: true });
register('ticketclose', 'Close the current ticket channel.', 'Tickets', async ctx => {
  if (!requireGuild(ctx)) return;
  if (!ctx.channel.name?.startsWith('ticket-')) return ctx.reply({ embeds: [fail('This command only works in a ticket channel.')] });
  if (!isModerator(ctx.member) && !ctx.channel.name.endsWith(ctx.author.id)) return ctx.reply({ embeds: [fail('Only ticket owner or staff can close this ticket.')] });
  await ctx.reply({ embeds: [ok('Closing ticket in 3 seconds.')] });
  setTimeout(() => ctx.channel.delete(`Ticket closed by ${ctx.author.tag}`).catch(() => {}), 3000);
}, { aliases: ['close-ticket'] });

// ------------------------------ GIVEAWAYS --------------------------
register('giveaway', 'Start a simple reaction giveaway: ,giveaway 10m 1 Prize name', 'Giveaways', async ctx => {
  if (!requireGuild(ctx)) return;
  if (!isModerator(ctx.member)) return ctx.reply({ embeds: [fail('Moderation permission required.')] });
  const duration = durationMs(ctx.args[0]);
  const winners = Number(ctx.args[1]);
  const prize = ctx.args.slice(2).join(' ');
  if (!duration || !Number.isInteger(winners) || winners < 1 || winners > 10 || !prize) return ctx.reply({ embeds: [fail(`Usage: ${PREFIX}giveaway 10m 1 Prize name`)] });
  const post = await ctx.channel.send({ embeds: [makeEmbed('🎉 Giveaway', `**Prize:** ${clean(prize, 200)}\n**Winners:** ${winners}\n**Ends:** <t:${Math.floor((Date.now() + duration) / 1000)}:R>\nReact with 🎉 to enter.`)] });
  await post.react('🎉').catch(() => {});
  setTimeout(async () => {
    try {
      const fetched = await ctx.channel.messages.fetch(post.id);
      const reaction = fetched.reactions.cache.get('🎉');
      const users = reaction ? await reaction.users.fetch() : null;
      const entries = users ? [...users.values()].filter(u => !u.bot) : [];
      const picked = [];
      while (entries.length && picked.length < winners) picked.push(entries.splice(Math.floor(Math.random() * entries.length), 1)[0]);
      await ctx.channel.send({ embeds: [makeEmbed('🎉 Giveaway Ended', `**Prize:** ${clean(prize, 200)}\n${picked.length ? `Winner${picked.length > 1 ? 's' : ''}: ${picked.map(u => `<@${u.id}>`).join(', ')}` : 'No valid entries.'}`, Colors.success)] });
    } catch (err) { console.error('[PYRR] Giveaway end error:', err.message); }
  }, duration);
  return ctx.reply({ embeds: [ok('Giveaway created. Keep the bot online until it ends.')] });
}, { mod: true });

// ------------------------------ POLLS ------------------------------
register('poll', 'Create a yes/no poll.', 'Fun', async ctx => {
  const question = resolveText(ctx);
  if (!question) return ctx.reply({ embeds: [fail(`Usage: ${PREFIX}poll <question>`)] });
  const message = await ctx.channel.send({ embeds: [makeEmbed('📊 Poll', question)] });
  await message.react('👍').catch(() => {}); await message.react('👎').catch(() => {});
  return ctx.reply({ embeds: [ok('Poll created.')] });
});
register('pollmulti', 'Create a poll with 2–5 options separated by |.', 'Fun', async ctx => {
  const parts = resolveText(ctx).split('|').map(s => s.trim()).filter(Boolean);
  if (parts.length < 3 || parts.length > 6) return ctx.reply({ embeds: [fail(`Usage: ${PREFIX}pollmulti Question | Option 1 | Option 2 (up to 5 options)`)] });
  const [question, ...options] = parts;
  const emojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣'];
  const message = await ctx.channel.send({ embeds: [makeEmbed(`📊 ${clean(question, 200)}`, options.map((o, i) => `${emojis[i]} ${clean(o, 200)}`).join('\n'))] });
  for (let i = 0; i < options.length; i++) await message.react(emojis[i]).catch(() => {});
  return ctx.reply({ embeds: [ok('Poll created.')] });
});

// ----------------------------- FUN COMMANDS ------------------------
register('8ball', 'Ask the magic 8-ball a question.', 'Fun', async ctx => {
  const question = resolveText(ctx);
  if (!question) return ctx.reply({ embeds: [fail(`Usage: ${PREFIX}8ball <question>`)] });
  const answers = ['Yes, definitely.', 'It is likely.', 'Signs point to yes.', 'Ask again later.', 'Cannot predict that right now.', 'Probably not.', 'My answer is no.', 'The outlook is uncertain.'];
  const answer = answers[Math.floor(Math.random() * answers.length)];
  return ctx.reply({ embeds: [makeEmbed('🎱 PYRR Magic 8-Ball', `**Question:** ${clean(question, 1000)}\n**Answer:** ${answer}\n\n*Entertainment only — not a real prediction.*`)] });
});
register('coinflip', 'Flip a coin.', 'Fun', async ctx => ctx.reply({ embeds: [makeEmbed('🪙 Coin Flip', Math.random() < 0.5 ? 'Heads!' : 'Tails!')] }));
register('roll', 'Roll a die. Usage: ,roll [sides]', 'Fun', async ctx => {
  const sides = ctx.args[0] === undefined ? 6 : Number(ctx.args[0]);
  if (!Number.isInteger(sides) || sides < 2 || sides > 1000) return ctx.reply({ embeds: [fail(`Usage: ${PREFIX}roll [2-1000]`)] });
  return ctx.reply({ embeds: [makeEmbed('🎲 Dice Roll', `You rolled **${Math.floor(Math.random() * sides) + 1}** (d${sides}).`)] });
});
register('choose', 'Choose one option separated by |.', 'Fun', async ctx => {
  const options = resolveText(ctx).split('|').map(s => s.trim()).filter(Boolean);
  if (options.length < 2) return ctx.reply({ embeds: [fail(`Usage: ${PREFIX}choose option 1 | option 2`)] });
  return ctx.reply({ embeds: [makeEmbed('🤔 I choose…', clean(options[Math.floor(Math.random() * options.length)], 1000))] });
});
register('reverse', 'Reverse text.', 'Fun', async ctx => { const t = resolveText(ctx); if (!t) return ctx.reply({ embeds: [fail(`Usage: ${PREFIX}reverse <text>`)] }); return ctx.reply({ content: clean([...t].reverse().join(' '), 1900) }); });
register('uppercase', 'Convert text to uppercase.', 'Fun', async ctx => ctx.reply({ content: clean(resolveText(ctx).toUpperCase(), 1900) || 'Provide some text.' }));
register('lowercase', 'Convert text to lowercase.', 'Fun', async ctx => ctx.reply({ content: clean(resolveText(ctx).toLowerCase(), 1900) || 'Provide some text.' }));
register('charcount', 'Count characters in text.', 'Utility', async ctx => { const t = resolveText(ctx); return ctx.reply({ embeds: [info(`Characters: **${t.length}**\nWords: **${t.trim() ? t.trim().split(/\s+/).length : 0}**`)] }); });
register('randomnumber', 'Generate a random integer: ,randomnumber 1 100', 'Fun', async ctx => {
  const min = Number(ctx.args[0]); const max = Number(ctx.args[1]);
  if (!Number.isInteger(min) || !Number.isInteger(max) || max < min || max - min > 1000000000) return ctx.reply({ embeds: [fail(`Usage: ${PREFIX}randomnumber 1 100`)] });
  return ctx.reply({ embeds: [makeEmbed('🎲 Random Number', String(Math.floor(Math.random() * (max - min + 1)) + min))] });
});
register('mockcase', 'Convert text to alternating case.', 'Fun', async ctx => { const t = resolveText(ctx); return ctx.reply({ content: clean([...t].map((c, i) => i % 2 ? c.toLowerCase() : c.toUpperCase()).join(''), 1900) || 'Provide some text.' }); });

// --------------------------- UTILITY COMMANDS ----------------------
register('say', 'Make the bot repeat a message (Manage Messages required).', 'Utility', async ctx => {
  if (!hasPerm(ctx.member, PermissionsBitField.Flags.ManageMessages) && !isOwner(ctx.author)) return ctx.reply({ embeds: [fail('Manage Messages permission required.')] });
  const text = resolveText(ctx);
  if (!text) return ctx.reply({ embeds: [fail(`Usage: ${PREFIX}say <message>`)] });
  await ctx.channel.send({ content: clean(text, 1900), allowedMentions: { parse: [] } });
  return null;
}, { aliases: ['echo'] });
register('embed', 'Send an embed with a title and description separated by |.', 'Utility', async ctx => {
  if (!hasPerm(ctx.member, PermissionsBitField.Flags.ManageMessages) && !isOwner(ctx.author)) return ctx.reply({ embeds: [fail('Manage Messages permission required.')] });
  const [title, ...rest] = resolveText(ctx).split('|');
  const description = rest.join('|').trim();
  if (!title?.trim() || !description) return ctx.reply({ embeds: [fail(`Usage: ${PREFIX}embed Title | Description`)] });
  return ctx.channel.send({ embeds: [makeEmbed(title.trim(), description)] });
}, { mod: true });
register('remindme', 'Set an in-memory reminder: ,remindme 10m take a break', 'Utility', async ctx => {
  const duration = durationMs(ctx.args[0]); const text = ctx.args.slice(1).join(' ');
  if (!duration || !text) return ctx.reply({ embeds: [fail(`Usage: ${PREFIX}remindme 10m <reminder>`)] });
  if (duration > 604800000) return ctx.reply({ embeds: [fail('Maximum reminder duration is 7 days.')] });
  await ctx.reply({ embeds: [ok(`I will remind you in ${durationLabel(duration)}.`)] });
  setTimeout(() => ctx.author.send({ embeds: [makeEmbed('⏰ Reminder', text)] }).catch(() => {}), duration);
});
register('pollhelp', 'Show poll command usage.', 'Utility', async ctx => ctx.reply({ embeds: [info(`Yes/no: \`${PREFIX}poll question\`\nMultiple choice: \`${PREFIX}pollmulti Question | Option A | Option B\``)] }));

// -------------------------- ECONOMY COMMANDS -----------------------
function economyUser(guildId, userId) {
  const d = guildData(guildId);
  if (!d.economy[userId]) d.economy[userId] = { coins: 0, bank: 0, lastDaily: 0, lastWork: 0 };
  return d.economy[userId];
}
register('balance', 'Check your coins and bank balance.', 'Economy', async ctx => {
  if (!requireGuild(ctx)) return;
  const target = userTarget(ctx); const user = target?.user || ctx.author;
  const data = economyUser(ctx.guild.id, user.id);
  return ctx.reply({ embeds: [makeEmbed(`💰 ${user.username}'s Balance`, `Wallet: **${data.coins}** coins\nBank: **${data.bank}** coins`)] });
}, { aliases: ['bal', 'wallet'] });
register('daily', 'Claim daily coins once every 24 hours.', 'Economy', async ctx => {
  if (!requireGuild(ctx)) return;
  const data = economyUser(ctx.guild.id, ctx.author.id); const now = Date.now();
  const wait = 86400000 - (now - data.lastDaily);
  if (wait > 0) return ctx.reply({ embeds: [fail(`You can claim again in ${durationLabel(wait)}.`)] });
  const amount = 250 + Math.floor(Math.random() * 251);
  data.coins += amount; data.lastDaily = now; saveDb();
  return ctx.reply({ embeds: [ok(`You claimed **${amount}** coins. Wallet: **${data.coins}**.`)] });
});
register('work', 'Earn coins by working. Cooldown: 1 minute.', 'Economy', async ctx => {
  if (!requireGuild(ctx)) return;
  const data = economyUser(ctx.guild.id, ctx.author.id); const wait = 60000 - (Date.now() - data.lastWork);
  if (wait > 0) return ctx.reply({ embeds: [fail(`Try again in ${durationLabel(wait)}.`)] });
  const amount = 25 + Math.floor(Math.random() * 76); data.coins += amount; data.lastWork = Date.now(); saveDb();
  return ctx.reply({ embeds: [ok(`You worked and earned **${amount}** coins.`)] });
});
register('pay', 'Pay coins to another member.', 'Economy', async ctx => {
  if (!requireGuild(ctx)) return;
  const target = userTarget(ctx); const amount = Number(ctx.args[1]);
  if (!target || target.id === ctx.author.id || !Number.isSafeInteger(amount) || amount < 1) return ctx.reply({ embeds: [fail(`Usage: ${PREFIX}pay @member <amount>`)] });
  const sender = economyUser(ctx.guild.id, ctx.author.id); const recipient = economyUser(ctx.guild.id, target.id);
  if (sender.coins < amount) return ctx.reply({ embeds: [fail('You do not have enough coins.')] });
  sender.coins -= amount; recipient.coins += amount; saveDb();
  return ctx.reply({ embeds: [ok(`Paid **${amount}** coins to ${target.user.tag}.`)] });
});
register('deposit', 'Deposit wallet coins into your bank.', 'Economy', async ctx => {
  if (!requireGuild(ctx)) return;
  const amount = Number(ctx.args[0]); const data = economyUser(ctx.guild.id, ctx.author.id);
  if (!Number.isSafeInteger(amount) || amount < 1 || amount > data.coins) return ctx.reply({ embeds: [fail(`Usage: ${PREFIX}deposit <amount> (wallet: ${data.coins})`)] });
  data.coins -= amount; data.bank += amount; saveDb();
  return ctx.reply({ embeds: [ok(`Deposited ${amount} coins. Bank: ${data.bank}.`)] });
});
register('withdraw', 'Withdraw bank coins into your wallet.', 'Economy', async ctx => {
  if (!requireGuild(ctx)) return;
  const amount = Number(ctx.args[0]); const data = economyUser(ctx.guild.id, ctx.author.id);
  if (!Number.isSafeInteger(amount) || amount < 1 || amount > data.bank) return ctx.reply({ embeds: [fail(`Usage: ${PREFIX}withdraw <amount> (bank: ${data.bank})`)] });
  data.bank -= amount; data.coins += amount; saveDb();
  return ctx.reply({ embeds: [ok(`Withdrew ${amount} coins. Wallet: ${data.coins}.`)] });
});

// ------------------------------ OWNER ------------------------------
register('commandcount', 'Show unique command and alias counts.', 'Information', async ctx => ctx.reply({ embeds: [info(`Unique commands: **${commands.size}**\nAliases: **${aliases.size}**`)] }));
register('disablecmd', 'Disable a command in this server.', 'Configuration', async ctx => {
  if (!requireGuild(ctx)) return;
  if (!isAdmin(ctx.member)) return ctx.reply({ embeds: [fail('Administrator permission required.')] });
  const name = (ctx.args[0] || '').toLowerCase(); const canonical = aliases.get(name) || name;
  if (!commands.has(canonical) || ['help', 'disablecmd', 'enablecmd'].includes(canonical)) return ctx.reply({ embeds: [fail('That command cannot be disabled or does not exist.')] });
  const d = guildData(ctx.guild.id); if (!d.disabled.includes(canonical)) d.disabled.push(canonical); saveDb();
  return ctx.reply({ embeds: [ok(`Disabled \`${canonical}\` in this server.`)] });
}, { admin: true });
register('enablecmd', 'Enable a command disabled in this server.', 'Configuration', async ctx => {
  if (!requireGuild(ctx)) return;
  if (!isAdmin(ctx.member)) return ctx.reply({ embeds: [fail('Administrator permission required.')] });
  const name = (ctx.args[0] || '').toLowerCase(); const canonical = aliases.get(name) || name; const d = guildData(ctx.guild.id);
  d.disabled = d.disabled.filter(x => x !== canonical); saveDb();
  return ctx.reply({ embeds: [ok(`Enabled \`${canonical}\` in this server if it was disabled.`)] });
}, { admin: true });
register('reloadconfig', 'Reload JSON database from disk.', 'Owner', async ctx => {
  if (!isOwner(ctx.author)) return ctx.reply({ embeds: [fail('Bot owner only. Set BOT_OWNER_ID in the host environment.')] });
  loadDb();
  return ctx.reply({ embeds: [ok('Database reloaded from disk.')] });
}, { owner: true });

// ----------------------------- MESSAGE EVENTS ----------------------
client.on('messageCreate', async message => {
  if (!message.guild || message.author.bot) return;
  const d = guildData(message.guild.id);

  // Opt-in automatic reaction, limited to configured channel if selected.
  if (d.autoReact && (!d.autoReactChannel || d.autoReactChannel === message.channel.id)) {
    await message.react(d.autoReactEmoji || '✨').catch(() => {});
  }

  // Basic automod alerts; intentionally avoids deleting user messages automatically.
  if (d.automod) {
    const content = message.content || '';
    const hasInvite = d.automodInvites && /discord\.gg\//i.test(content);
    const repeated = d.automodSpam && /(.)\1{18,}/u.test(content);
    const oversized = content.length > 1800;
    if (hasInvite || repeated || oversized) {
      await sendLog(message.guild, `AutoMod alert: ${formatUser(message.author)} in <#${message.channel.id}>. Reason: ${hasInvite ? 'invite link' : repeated ? 'repeated characters' : 'oversized message'}. No automatic deletion was performed.`, Colors.warning);
    }
  }

  if (!message.content.startsWith(PREFIX)) return;
  const body = message.content.slice(PREFIX.length).trim();
  if (!body) return;
  const args = parseArgs(body);
  const input = (args.shift() || '').toLowerCase();
  const name = aliases.get(input) || input;
  const cmd = commands.get(name);
  if (!cmd) return;
  if (d.disabled.includes(name)) return message.reply({ embeds: [fail('This command is disabled in this server.')] }).catch(() => {});
  if (cmd.admin && !isAdmin(message.member)) return message.reply({ embeds: [fail('Administrator permission required.')] }).catch(() => {});
  if (cmd.mod && !isModerator(message.member)) return message.reply({ embeds: [fail('Moderation permission required.')] }).catch(() => {});
  if (cmd.owner && !isOwner(message.author)) return message.reply({ embeds: [fail('Bot owner only.')] }).catch(() => {});
  if (cmd.cooldown) {
    const key = `${message.author.id}:${name}`; const previous = cooldowns.get(key) || 0;
    if (Date.now() - previous < cmd.cooldown) return message.reply({ embeds: [fail(`Wait ${Math.ceil((cmd.cooldown - (Date.now() - previous)) / 1000)} seconds.`)] }).catch(() => {});
    cooldowns.set(key, Date.now());
  }
  try {
    await cmd.run(ctxForMessage(message, args));
  } catch (err) {
    console.error(`[PYRR] Command ${name} failed:`, err);
    await message.reply({ embeds: [fail('The command failed. Check bot permissions and try again.')] }).catch(() => {});
  }
});

// -------------------------- MEMBER EVENTS --------------------------
client.on('guildMemberAdd', async member => {
  const d = guildData(member.guild.id);
  if (d.autorole) {
    const role = member.guild.roles.cache.get(d.autorole);
    if (role && !role.managed && role.position < member.guild.members.me.roles.highest.position) await member.roles.add(role, 'PYRR autorole').catch(err => console.error('[PYRR] Autorole failed:', err.message));
  }
  if (d.welcomeChannel) {
    const ch = member.guild.channels.cache.get(d.welcomeChannel);
    if (ch?.isTextBased() && ch.isSendable()) {
      const text = d.welcomeText.replaceAll('{user}', `<@${member.id}>`).replaceAll('{server}', member.guild.name);
      await ch.send({ embeds: [makeEmbed('👋 Welcome!', text)], allowedMentions: { users: [member.id] } }).catch(() => {});
    }
  }
  if (d.antiraid) {
    const now = Date.now(); d.raidJoinTimestamps = (d.raidJoinTimestamps || []).filter(t => now - t < d.raidWindowMs);
    d.raidJoinTimestamps.push(now); saveDb();
    if (d.raidJoinTimestamps.length >= d.raidJoinLimit) await sendLog(member.guild, `AntiRaid alert: ${d.raidJoinTimestamps.length} joins in the configured time window. Review server security manually.`, Colors.warning);
  }
});
client.on('guildMemberRemove', async member => {
  const d = guildData(member.guild.id);
  if (d.leaveChannel) {
    const ch = member.guild.channels.cache.get(d.leaveChannel);
    if (ch?.isTextBased() && ch.isSendable()) {
      const text = d.leaveText.replaceAll('{user}', member.user.tag).replaceAll('{server}', member.guild.name);
      await ch.send({ embeds: [makeEmbed('👋 Goodbye', text)] }).catch(() => {});
    }
  }
});

// ----------------------- ANTINUKE AUDIT ALERTS ---------------------
const destructiveEvents = new Map([
  [AuditLogEvent.ChannelDelete, 'channel deleted'],
  [AuditLogEvent.ChannelCreate, 'channel created'],
  [AuditLogEvent.RoleDelete, 'role deleted'],
  [AuditLogEvent.RoleCreate, 'role created'],
  [AuditLogEvent.WebhookCreate, 'webhook created'],
  [AuditLogEvent.WebhookUpdate, 'webhook updated'],
  [AuditLogEvent.MemberBanAdd, 'member banned'],
  [AuditLogEvent.MemberKick, 'member kicked'],
  [AuditLogEvent.BotAdd, 'bot added'],
  [AuditLogEvent.GuildUpdate, 'server settings updated'],
  [AuditLogEvent.MemberRoleUpdate, 'member roles updated']
]);
client.on('guildAuditLogEntryCreate', async (entry, guild) => {
  try {
    const d = guildData(guild.id);
    if (!d.antinuke || !destructiveEvents.has(entry.action)) return;
    const label = destructiveEvents.get(entry.action);
    const actor = entry.executor ? formatUser(entry.executor) : 'Unknown actor';
    await sendLog(guild, `AntiNuke alert: **${label}**. Actor: ${actor}. Target: ${entry.target?.id || 'Unknown'}. This is an alert only; no automatic punishment was taken.`, Colors.warning);
  } catch (err) { console.error('[PYRR] Audit alert error:', err.message); }
});

// -------------------------- INTERACTION EVENTS ---------------------
client.on('interactionCreate', async interaction => {
  if (!interaction.isButton()) return;
  try {
    if (interaction.customId !== 'pyrr_ticket_open') return;
    if (!interaction.guild) return interaction.reply({ content: 'Server only.', ephemeral: true });
    const existing = interaction.guild.channels.cache.find(ch => ch.name === `ticket-${interaction.user.id}`);
    if (existing) return interaction.reply({ content: `You already have a ticket: ${existing}`, ephemeral: true });
    const botMember = interaction.guild.members.me;
    if (!botMember?.permissions.has(PermissionsBitField.Flags.ManageChannels)) return interaction.reply({ content: 'The bot needs Manage Channels permission.', ephemeral: true });
    const overwrites = [
      { id: interaction.guild.roles.everyone.id, deny: [PermissionsBitField.Flags.ViewChannel] },
      { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] },
      { id: client.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ManageChannels, PermissionsBitField.Flags.ReadMessageHistory] }
    ];
    const d = guildData(interaction.guild.id);
    const options = { name: `ticket-${interaction.user.id}`, type: ChannelType.GuildText, permissionOverwrites: overwrites, reason: `Ticket opened by ${interaction.user.tag}` };
    if (d.ticketCategory && interaction.guild.channels.cache.has(d.ticketCategory)) options.parent = d.ticketCategory;
    const ch = await interaction.guild.channels.create(options);
    await ch.send({ content: `<@${interaction.user.id}>`, embeds: [makeEmbed('Support Ticket', 'Describe your issue here. Staff can use `,ticketclose` to close this ticket.')], allowedMentions: { users: [interaction.user.id] } });
    return interaction.reply({ content: `Your ticket has been created: ${ch}`, ephemeral: true });
  } catch (err) {
    console.error('[PYRR] Ticket interaction failed:', err);
    if (interaction.isRepliable() && !interaction.replied) await interaction.reply({ content: 'Could not create ticket. Check bot permissions.', ephemeral: true }).catch(() => {});
  }
});

// ------------------------------- READY -----------------------------
client.once('ready', () => {
  console.log('==================================================');
  console.log(`${BOT_NAME} online as ${client.user.tag}`);
  console.log(`Creator: ${CREATOR}`);
  console.log(`Servers: ${client.guilds.cache.size}`);
  console.log(`Unique commands: ${commands.size}`);
  console.log(`Aliases: ${aliases.size}`);
  console.log(`Prefix: ${PREFIX}`);
  console.log('==================================================');
  client.user.setPresence({
    activities: [{ name: 'Noctis Official on Twitch', type: ActivityType.Streaming, url: TWITCH_URL }],
    status: 'online'
  });
});
client.on('error', err => console.error('[PYRR] Client error:', err));
process.on('unhandledRejection', reason => console.error('[PYRR] Unhandled rejection:', reason));
process.on('uncaughtException', err => console.error('[PYRR] Uncaught exception:', err));

if (!process.env.DISCORD_TOKEN) {
  console.error('[PYRR] Missing DISCORD_TOKEN environment variable. Set it in your hosting panel; do not paste tokens into public files.');
} else {
  client.login(process.env.DISCORD_TOKEN).catch(err => {
    console.error('[PYRR] Login failed:', err.message);
    process.exitCode = 1;
  });
}
