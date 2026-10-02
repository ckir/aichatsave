'use strict';

// Offline regression test: runs the REAL, unmodified content.js against a real saved
// ChatGPT page and checks the aisave-dev/1 markdown format (see README.md, "Format
// (`format: aisave-dev/1`)"). Cross-checks the Assistant turn against a real capture the
// live extension produced from the same conversation.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const {
  installAiSave,
  extractFrontmatter,
  extractTurnMarkers,
  extractEndMarker,
  extractAssistantTurnContent,
  collapseWhitespace,
  firstDifferingLine,
} = require('./helpers');

const FIXTURE_URL = 'https://chatgpt.com/c/6aba80f6-f520-83ed-9f0b-bb7ddcd0564f';
const FIXTURE_HTML_PATH = path.join(__dirname, 'fixtures', 'chatgpt-code-review-findings.html');
const LIVE_CAPTURE_PATH = path.join(__dirname, 'fixtures', 'live-capture-code-review-findings.md');
const HUMAN_TAG = 'review-relay tag: capstone-r2/round-04';
const FIRST_FINDING_HEADING = '### Findings';

// The fixture is a 2.8 MB real saved page with inline <style> blocks jsdom's CSS parser
// cannot fully handle; by default it forwards those as noisy jsdomError console events
// (dumping the whole stylesheet). None of this affects scrape() - it only walks the DOM,
// not computed CSS from those sheets - so silence just that channel.
const { VirtualConsole } = require('jsdom');
const quietVirtualConsole = new VirtualConsole();
quietVirtualConsole.on('error', () => {});
quietVirtualConsole.on('jsdomError', () => {});

function scrapeFixture() {
  const html = fs.readFileSync(FIXTURE_HTML_PATH, 'utf8');
  const dom = new JSDOM(html, {
    url: FIXTURE_URL,
    runScripts: 'outside-only',
    virtualConsole: quietVirtualConsole,
  });
  const AiSave = installAiSave(dom.window);
  const result = AiSave.scrape();
  dom.window.close();
  return result;
}

test('scrape() returns no error and a markdown string', () => {
  const result = scrapeFixture();
  assert.equal(result.error, undefined);
  assert.equal(typeof result.markdown, 'string');
});

test('frontmatter has the expected aisave-dev/1 keys', () => {
  const { markdown } = scrapeFixture();
  const fm = extractFrontmatter(markdown);
  assert.ok(fm, 'expected a parsable frontmatter block');
  assert.equal(fm.platform, 'chatgpt');
  assert.equal(fm.format, 'aisave-dev/1');
  assert.match(fm.nonce, /^[0-9a-f]{12}$/);
  assert.equal(fm.url, FIXTURE_URL);
});

test('exactly 2 turn markers, in order, both carrying the frontmatter nonce, ' +
     'each immediately followed by its ## heading', () => {
  const { markdown } = scrapeFixture();
  const fm = extractFrontmatter(markdown);
  const markers = extractTurnMarkers(markdown);

  assert.equal(markers.length, 2, `expected exactly 2 turn markers, found ${markers.length}`);

  assert.equal(markers[0].turn, 1);
  assert.equal(markers[0].role, 'human');
  assert.equal(markers[0].nonce, fm.nonce);

  assert.equal(markers[1].turn, 2);
  assert.equal(markers[1].role, 'assistant');
  assert.equal(markers[1].nonce, fm.nonce);

  assert.ok(
    markdown.includes(`<!-- aisave:${fm.nonce} turn=1 role=human -->\n## Human`),
    'turn=1 marker must be immediately followed by "## Human" on the next line'
  );
  assert.ok(
    markdown.includes(`<!-- aisave:${fm.nonce} turn=2 role=assistant -->\n## Assistant`),
    'turn=2 marker must be immediately followed by "## Assistant" on the next line'
  );
});

test('the file ends with the end marker, preceded by VERDICT: NOT READY', () => {
  const { markdown } = scrapeFixture();
  const fm = extractFrontmatter(markdown);
  const lines = markdown.split('\n').map(l => l.trim());
  const nonEmpty = lines.filter(l => l.length > 0);

  const last = nonEmpty[nonEmpty.length - 1];
  const beforeLast = nonEmpty[nonEmpty.length - 2];

  assert.equal(last, `<!-- aisave:${fm.nonce} end -->`);
  assert.equal(beforeLast, 'VERDICT: NOT READY');
});

test('the Human turn contains the review-relay round tag', () => {
  const { markdown } = scrapeFixture();
  const fm = extractFrontmatter(markdown);
  const markers = extractTurnMarkers(markdown);
  const humanEnd = markers[1].index; // start of the turn=2 marker
  const humanSection = markdown.slice(markers[0].index, humanEnd);
  assert.ok(
    humanSection.includes(HUMAN_TAG),
    `expected the Human turn to contain "${HUMAN_TAG}"`
  );
});

test('the nonce appears exactly 4 times: frontmatter + 2 turn markers + end marker', () => {
  const { markdown } = scrapeFixture();
  const fm = extractFrontmatter(markdown);
  const occurrences = markdown.split(fm.nonce).length - 1;
  assert.equal(occurrences, 4, `expected the nonce to occur exactly 4 times, found ${occurrences}`);
});

test('cross-check: Assistant turn text matches the real live capture (or the report ' +
     'names the first differing line and both share VERDICT + first finding heading)', () => {
  const { markdown } = scrapeFixture();
  const scrapedAssistant = extractAssistantTurnContent(markdown);
  assert.ok(scrapedAssistant, 'could not locate the scraped Assistant turn content');

  const liveMarkdown = fs.readFileSync(LIVE_CAPTURE_PATH, 'utf8');
  const liveAssistant = extractAssistantTurnContent(liveMarkdown);
  assert.ok(liveAssistant, 'could not locate the Assistant turn content in the live capture');

  const scrapedCollapsed = collapseWhitespace(scrapedAssistant);
  const liveCollapsed = collapseWhitespace(liveAssistant);

  if (scrapedCollapsed === liveCollapsed) {
    // Exact match after whitespace-collapsing: nothing further to assert.
    return;
  }

  const diff = firstDifferingLine(scrapedAssistant.trim(), liveAssistant.trim());
  if (diff) {
    // eslint-disable-next-line no-console
    console.log(
      `[cross-check] first differing line (#${diff.index}):\n` +
      `  scraped: ${JSON.stringify(diff.lineA)}\n` +
      `  live:    ${JSON.stringify(diff.lineB)}`
    );
  }

  assert.ok(scrapedCollapsed.includes('VERDICT: NOT READY'), 'scraped Assistant turn must contain VERDICT: NOT READY');
  assert.ok(liveCollapsed.includes('VERDICT: NOT READY'), 'live capture Assistant turn must contain VERDICT: NOT READY');
  assert.ok(scrapedCollapsed.includes(FIRST_FINDING_HEADING), `scraped Assistant turn must contain "${FIRST_FINDING_HEADING}"`);
  assert.ok(liveCollapsed.includes(FIRST_FINDING_HEADING), `live capture Assistant turn must contain "${FIRST_FINDING_HEADING}"`);
});
