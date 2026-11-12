import { describe, expect, it } from 'vitest';
import {
  escapeHtml,
  formatTicketDuration,
  renderMarkup,
  renderTranscriptHtml,
  type TranscriptMessage,
  type TranscriptMeta,
} from './ticketTranscript';

const meta: TranscriptMeta = {
  guildName: 'Ribbit Retreat',
  channelName: 'support-frank',
  ticketNumber: 7,
  typeLabel: 'Support',
  openerName: 'Frank',
  claimedByName: 'Mod Mia',
  closedByName: 'Mod Mia',
  closeReason: 'Sorted in voice',
  openedAt: Date.UTC(2026, 10, 12, 4, 0),
  closedAt: Date.UTC(2026, 10, 12, 5, 30),
  truncated: false,
};

function message(overrides: Partial<TranscriptMessage>): TranscriptMessage {
  return {
    authorId: '1',
    authorName: 'Frank',
    authorAvatarUrl: null,
    bot: false,
    timestamp: Date.UTC(2026, 10, 12, 4, 1),
    content: 'hello',
    attachments: [],
    embeds: [],
    ...overrides,
  };
}

describe('escapeHtml', () => {
  it('escapes every character that could start markup or break an attribute', () => {
    expect(escapeHtml(`<a href="x" onclick='y'>&`)).toBe(
      '&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;',
    );
  });
});

describe('renderMarkup', () => {
  it('never lets message text become markup', () => {
    const html = renderMarkup('<script>alert(1)</script> <img src=x onerror=alert(1)>');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;script&gt;');
  });

  it('links web addresses and leaves other schemes as plain text', () => {
    const html = renderMarkup('see https://example.com/a_b_c?x=1&y=2. and javascript:alert(1)');
    expect(html).toContain('<a href="https://example.com/a_b_c?x=1&amp;y=2"');
    // The sentence's full stop is not part of the link; underscores are not italics.
    expect(html).toContain('</a>.');
    expect(html).not.toContain('<em>');
    expect(html).not.toContain('href="javascript');
  });

  it('cannot break out of the link attribute', () => {
    const html = renderMarkup('https://example.com/"onmouseover="alert(1)');
    expect(html).not.toContain('"onmouseover="');
    expect(html).toContain('&quot;onmouseover=&quot;');
  });

  it('renders the common Discord formatting', () => {
    expect(renderMarkup('**bold** *it* __under__ ~~gone~~ `code`')).toBe(
      '<strong>bold</strong> <em>it</em> <u>under</u> <s>gone</s> <code>code</code>',
    );
    expect(renderMarkup('one\ntwo')).toBe('one<br>two');
  });

  it('keeps code blocks verbatim and escaped', () => {
    const html = renderMarkup('```js\nconst a = "<b>**x**</b>";\n```');
    expect(html).toBe('<pre>const a = &quot;&lt;b&gt;**x**&lt;/b&gt;&quot;;</pre>');
  });

  it('shows custom emoji by name', () => {
    expect(renderMarkup('nice <:frog:123456789012345678>')).toBe('nice :frog:');
  });
});

describe('formatTicketDuration', () => {
  it('reads naturally at each scale', () => {
    expect(formatTicketDuration(5 * 60_000)).toBe('5 min');
    expect(formatTicketDuration(90 * 60_000)).toBe('1 h 30 min');
    expect(formatTicketDuration(50 * 3_600_000)).toBe('2 d 2 h');
  });
});

describe('renderTranscriptHtml', () => {
  it('summarises the ticket in the header', () => {
    const html = renderTranscriptHtml(meta, [message({})]);
    expect(html).toContain('Ticket #7 · Support');
    expect(html).toContain('<dt>Handled by</dt><dd>Mod Mia</dd>');
    expect(html).toContain('<dt>Reason</dt><dd>Sorted in voice</dd>');
    expect(html).toContain('<dt>Open for</dt><dd>1 h 30 min</dd>');
    expect(html).toContain('<dt>Messages</dt><dd>1</dd>');
  });

  it('escapes names, reasons and the server name', () => {
    const html = renderTranscriptHtml(
      { ...meta, guildName: '<b>Guild</b>', closeReason: '<i>why</i>' },
      [message({ authorName: '<script>x</script>' })],
    );
    expect(html).not.toContain('<script>x</script>');
    expect(html).not.toContain('<b>Guild</b>');
    expect(html).not.toContain('<i>why</i>');
  });

  it('groups a run of messages from one person under one header', () => {
    const html = renderTranscriptHtml(meta, [
      message({ content: 'first' }),
      message({ content: 'second', timestamp: Date.UTC(2026, 10, 12, 4, 2) }),
      message({ content: 'reply', authorId: '2', authorName: 'Mod Mia' }),
    ]);
    expect(html.match(/class="msg"/g)).toHaveLength(2);
    expect(html).toContain('<div class="more">');
  });

  it('inlines images and links other files', () => {
    const html = renderTranscriptHtml(meta, [
      message({
        content: '',
        attachments: [
          {
            name: 'shot.png',
            url: 'https://cdn.example/shot.png',
            isImage: true,
            dataUri: 'data:image/png;base64,AAAA',
          },
          { name: 'log.txt', url: 'https://cdn.example/log.txt', isImage: false },
          { name: 'odd', url: 'javascript:alert(1)', isImage: false },
        ],
      }),
    ]);
    expect(html).toContain('<img src="data:image/png;base64,AAAA" alt="shot.png"');
    expect(html).toContain('<a href="https://cdn.example/log.txt"');
    expect(html).not.toContain('javascript:alert');
  });

  it('renders embeds and flags a cut-off transcript', () => {
    const html = renderTranscriptHtml({ ...meta, truncated: true }, [
      message({
        bot: true,
        content: '',
        embeds: [
          { title: 'Ticket #7', description: 'Welcome', fields: [{ name: 'Q', value: 'A' }] },
        ],
      }),
    ]);
    expect(html).toContain('<span class="tag">BOT</span>');
    expect(html).toContain('<div class="embed-title">Ticket #7</div>');
    expect(html).toContain('only the most recent messages');
  });

  it('handles an empty ticket', () => {
    expect(renderTranscriptHtml(meta, [])).toContain('No messages.');
  });
});
