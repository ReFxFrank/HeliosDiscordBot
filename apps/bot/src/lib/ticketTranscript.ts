/**
 * Renders a ticket's messages as one self-contained HTML file: readable in any
 * browser, no network needed for the text. Everything a member typed is
 * escaped, so opening a transcript can never run something a member wrote.
 *
 * Pure functions only (no Discord, no I/O), so the output is unit tested.
 */

export interface TranscriptAttachment {
  name: string;
  url: string;
  isImage: boolean;
  /** Image bytes inlined as a data: URI so they survive the channel's deletion. */
  dataUri?: string;
}

export interface TranscriptEmbed {
  title?: string;
  description?: string;
  fields: { name: string; value: string }[];
}

export interface TranscriptMessage {
  authorId: string;
  authorName: string;
  authorAvatarUrl: string | null;
  bot: boolean;
  /** Milliseconds since the epoch. */
  timestamp: number;
  content: string;
  attachments: TranscriptAttachment[];
  embeds: TranscriptEmbed[];
}

export interface TranscriptMeta {
  guildName: string;
  channelName: string;
  ticketNumber: number;
  typeLabel: string | null;
  openerName: string;
  claimedByName: string | null;
  closedByName: string | null;
  closeReason: string | null;
  openedAt: number;
  closedAt: number | null;
  /** True when the ticket had more messages than the transcript holds. */
  truncated: boolean;
}

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => ESCAPES[char] ?? char);
}

/** Only web links become clickable; anything else (javascript:, data:) stays text. */
function isWebUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

/**
 * Message text → safe HTML. Handles the Discord formatting people actually use
 * in tickets: code blocks, inline code, bold, italics, underline, strikethrough,
 * links and line breaks. Code and links are lifted out first so formatting
 * characters inside them (an underscore in a URL) are left alone.
 */
export function renderMarkup(raw: string): string {
  // Placeholders use private-use characters, which are stripped from the input
  // first so a message can never forge one.
  const held: string[] = [];
  const hold = (html: string): string => {
    held.push(html);
    return `${held.length - 1}`;
  };

  let text = raw.replace(/[]/g, '');
  text = text.replace(/```(?:[a-z0-9+#-]*\n)?([\s\S]*?)```/gi, (_match, code: string) =>
    hold(`<pre>${escapeHtml(code.replace(/\n$/, ''))}</pre>`),
  );
  text = text.replace(/`([^`\n]+)`/g, (_match, code: string) =>
    hold(`<code>${escapeHtml(code)}</code>`),
  );
  text = text.replace(/https?:\/\/[^\s<>]+/gi, (url) => {
    // Trailing punctuation belongs to the sentence, not the link.
    const trimmed = url.replace(/[.,!?)\]]+$/, '');
    const rest = url.slice(trimmed.length);
    const safe = escapeHtml(trimmed);
    return hold(`<a href="${safe}" target="_blank" rel="noopener noreferrer">${safe}</a>`) + rest;
  });

  text = escapeHtml(text);
  // Custom emoji arrive as <:name:id>; show the name, as Discord does without the image.
  text = text.replace(/&lt;a?:(\w+):\d+&gt;/g, ':$1:');
  text = text
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_\n]+)__/g, '<u>$1</u>')
    .replace(/~~([^~\n]+)~~/g, '<s>$1</s>')
    .replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
    .replace(/(^|[\s(])_([^_\n]+)_(?=$|[\s).,!?])/g, '$1<em>$2</em>');
  text = text.replace(/\n/g, '<br>');
  return text.replace(/(\d+)/g, (_match, index: string) => held[Number(index)] ?? '');
}

function utcStamp(ms: number): string {
  return `${new Date(ms).toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

function timeTag(ms: number): string {
  return `<time datetime="${new Date(ms).toISOString()}">${utcStamp(ms)}</time>`;
}

export function formatTicketDuration(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} h ${minutes % 60} min`;
  return `${Math.floor(hours / 24)} d ${hours % 24} h`;
}

function renderAttachment(attachment: TranscriptAttachment): string {
  const name = escapeHtml(attachment.name);
  const link = isWebUrl(attachment.url) ? escapeHtml(attachment.url) : '';
  if (attachment.isImage && (attachment.dataUri || link)) {
    // A data: URI is produced by us from fetched bytes, never from message text.
    const src = attachment.dataUri ?? link;
    const image = `<img src="${src}" alt="${name}" loading="lazy">`;
    return `<div class="file">${link ? `<a href="${link}" target="_blank" rel="noopener noreferrer">${image}</a>` : image}</div>`;
  }
  return `<div class="file">📎 ${link ? `<a href="${link}" target="_blank" rel="noopener noreferrer">${name}</a>` : name}</div>`;
}

function renderEmbed(embed: TranscriptEmbed): string {
  const parts: string[] = [];
  if (embed.title) parts.push(`<div class="embed-title">${renderMarkup(embed.title)}</div>`);
  if (embed.description) parts.push(`<div>${renderMarkup(embed.description)}</div>`);
  for (const field of embed.fields) {
    parts.push(
      `<div class="embed-field"><div class="embed-name">${renderMarkup(field.name)}</div><div>${renderMarkup(field.value)}</div></div>`,
    );
  }
  return parts.length > 0 ? `<div class="embed">${parts.join('')}</div>` : '';
}

function renderBody(message: TranscriptMessage): string {
  const parts: string[] = [];
  if (message.content) parts.push(`<div class="text">${renderMarkup(message.content)}</div>`);
  for (const embed of message.embeds) parts.push(renderEmbed(embed));
  for (const attachment of message.attachments) parts.push(renderAttachment(attachment));
  if (parts.length === 0) parts.push('<div class="text muted">(no text)</div>');
  return parts.join('');
}

/** Consecutive messages from one person within this window share a header, as in Discord. */
const GROUP_WINDOW_MS = 7 * 60_000;

function renderMessages(messages: TranscriptMessage[]): string {
  const out: string[] = [];
  let previous: TranscriptMessage | null = null;
  for (const message of messages) {
    const grouped =
      previous !== null &&
      previous.authorId === message.authorId &&
      message.timestamp - previous.timestamp < GROUP_WINDOW_MS;
    if (grouped) {
      out.push(`<div class="more">${renderBody(message)}</div>`);
    } else {
      if (previous !== null) out.push('</div></div>');
      const avatar =
        message.authorAvatarUrl && isWebUrl(message.authorAvatarUrl)
          ? `<img class="avatar" src="${escapeHtml(message.authorAvatarUrl)}" alt="">`
          : `<div class="avatar letter">${escapeHtml(message.authorName.slice(0, 1).toUpperCase())}</div>`;
      out.push(
        `<div class="msg">${avatar}<div class="col"><div class="head"><span class="name">${escapeHtml(message.authorName)}</span>${message.bot ? '<span class="tag">BOT</span>' : ''}${timeTag(message.timestamp)}</div>${renderBody(message)}`,
      );
    }
    previous = message;
  }
  if (previous !== null) out.push('</div></div>');
  return out.join('\n');
}

const STYLE = `
:root{color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;background:#313338;color:#dbdee1;font:15px/1.45 "gg sans","Segoe UI",system-ui,sans-serif}
main{max-width:900px;margin:0 auto;padding:24px 16px 48px}
header{background:#2b2d31;border:1px solid #1e1f22;border-radius:10px;padding:18px 20px;margin-bottom:20px}
h1{font-size:19px;margin:0 0 4px;color:#f2f3f5}
.sub{color:#949ba4;font-size:13px;margin-bottom:12px}
dl{display:grid;grid-template-columns:max-content 1fr;gap:4px 16px;margin:0;font-size:14px}
dt{color:#949ba4}dd{margin:0;color:#f2f3f5;overflow-wrap:anywhere}
.note{margin-top:12px;color:#f0b232;font-size:13px}
.msg{display:flex;gap:14px;padding:8px 4px;border-radius:6px}
.msg:hover{background:#2e3035}
.avatar{width:40px;height:40px;border-radius:50%;flex:none;object-fit:cover}
.letter{display:grid;place-items:center;background:#5865f2;color:#fff;font-weight:600}
.col{min-width:0;flex:1}
.head{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}
.name{font-weight:600;color:#f2f3f5}
.tag{background:#5865f2;color:#fff;font-size:10px;font-weight:600;border-radius:3px;padding:1px 4px}
time{color:#949ba4;font-size:12px}
.text{overflow-wrap:anywhere}
.more{margin-top:3px}
.muted{color:#949ba4;font-style:italic}
a{color:#00a8fc}
code{background:#1e1f22;border-radius:3px;padding:1px 4px;font:13px Consolas,monospace}
pre{background:#1e1f22;border:1px solid #1a1b1e;border-radius:5px;padding:8px 10px;overflow-x:auto;font:13px Consolas,monospace;white-space:pre-wrap;margin:4px 0}
.embed{background:#2b2d31;border-left:4px solid #4e5058;border-radius:4px;padding:8px 12px;margin-top:4px;max-width:560px;overflow-wrap:anywhere}
.embed-title{font-weight:600;color:#f2f3f5;margin-bottom:4px}
.embed-field{margin-top:6px}
.embed-name{font-weight:600;font-size:13px;color:#f2f3f5}
.file{margin-top:4px}
.file img{max-width:min(420px,100%);max-height:340px;border-radius:6px;display:block}
footer{margin-top:28px;color:#949ba4;font-size:12px;text-align:center}
`;

/** Rewrites the UTC times to the reader's own time zone when the file is opened. */
const LOCAL_TIME_SCRIPT =
  'document.querySelectorAll("time[datetime]").forEach(function(t){var d=new Date(t.getAttribute("datetime"));if(!isNaN(d))t.textContent=d.toLocaleString()});';

export function renderTranscriptHtml(meta: TranscriptMeta, messages: TranscriptMessage[]): string {
  const title = `Ticket #${meta.ticketNumber}${meta.typeLabel ? ` · ${meta.typeLabel}` : ''}`;
  const rows: [string, string][] = [
    ['Opened by', escapeHtml(meta.openerName)],
    ['Opened', timeTag(meta.openedAt)],
  ];
  if (meta.claimedByName) rows.push(['Handled by', escapeHtml(meta.claimedByName)]);
  if (meta.closedByName) rows.push(['Closed by', escapeHtml(meta.closedByName)]);
  if (meta.closedAt !== null) {
    rows.push(['Closed', timeTag(meta.closedAt)]);
    rows.push(['Open for', formatTicketDuration(meta.closedAt - meta.openedAt)]);
  }
  if (meta.closeReason) rows.push(['Reason', escapeHtml(meta.closeReason)]);
  rows.push(['Messages', String(messages.length)]);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)} · ${escapeHtml(meta.guildName)}</title>
<style>${STYLE}</style>
</head>
<body>
<main>
<header>
<h1>${escapeHtml(title)}</h1>
<div class="sub">${escapeHtml(meta.guildName)} · #${escapeHtml(meta.channelName)}</div>
<dl>${rows.map(([name, value]) => `<dt>${name}</dt><dd>${value}</dd>`).join('')}</dl>
${meta.truncated ? '<div class="note">This ticket was very long: only the most recent messages are included.</div>' : ''}
</header>
${messages.length > 0 ? renderMessages(messages) : '<p class="muted">No messages.</p>'}
<footer>Transcript of ${escapeHtml(title)} · ${escapeHtml(meta.guildName)}</footer>
</main>
<script>${LOCAL_TIME_SCRIPT}</script>
</body>
</html>
`;
}
