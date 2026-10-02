'use strict';

// Shared helpers for the AiSaveDev offline regression tests. This file does NOT modify
// content.js; it only loads and evaluates the real, unmodified source inside a jsdom window
// and parses the aisave-dev/1 markdown it produces.

const fs = require('node:fs');
const path = require('node:path');

const CONTENT_JS_PATH = path.join(__dirname, '..', 'content.js');

function loadContentJsSource() {
  return fs.readFileSync(CONTENT_JS_PATH, 'utf8');
}

// Evaluates the unmodified content.js source inside the given jsdom window and returns
// window.__aiSaveDev. Throws if the guard somehow left it undefined.
function installAiSaveDev(window) {
  if (typeof window.crypto?.getRandomValues !== 'function') {
    // jsdom (Node 20+) ships window.crypto with getRandomValues natively; this is a
    // defensive fallback only, not exercised on the versions this repo targets.
    const nodeCrypto = require('node:crypto');
    window.crypto = window.crypto || {};
    window.crypto.getRandomValues = arr => nodeCrypto.webcrypto.getRandomValues(arr);
  }
  window.eval(loadContentJsSource());
  if (!window.__aiSaveDev) {
    throw new Error('content.js did not install window.__aiSaveDev');
  }
  return window.__aiSaveDev;
}

// Parses the `---\n...\n---` frontmatter block into a plain object of raw string values
// (values are not unquoted/unescaped beyond stripping a single pair of surrounding quotes).
function extractFrontmatter(markdown) {
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) return null;
  const out = {};
  for (const line of match[1].split('\n')) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    out[key] = value;
  }
  return out;
}

// Returns an ordered array of { nonce, turn, role, index, markerLine } for every
// `<!-- aisave:<nonce> turn=<n> role=<role> -->` marker found in the markdown.
function extractTurnMarkers(markdown) {
  const re = /<!-- aisave:([0-9a-f]{12}) turn=(\d+) role=(\w+) -->/g;
  const out = [];
  let m;
  while ((m = re.exec(markdown)) !== null) {
    out.push({
      nonce: m[1],
      turn: Number(m[2]),
      role: m[3],
      index: m.index,
      markerLine: m[0],
    });
  }
  return out;
}

// Returns { nonce, index, markerLine } for the `<!-- aisave:<nonce> end -->` marker, or null.
function extractEndMarker(markdown) {
  const m = markdown.match(/<!-- aisave:([0-9a-f]{12}) end -->/);
  if (!m) return null;
  return { nonce: m[1], index: m.index, markerLine: m[0] };
}

// Extracts the raw (untrimmed-further) content of the assistant turn (`turn=2 role=assistant`)
// from a full aisave-dev/1 markdown document, independent of its nonce value.
function extractAssistantTurnContent(markdown) {
  const m = markdown.match(
    /<!-- aisave:([0-9a-f]{12}) turn=2 role=assistant -->\n## Assistant\n\n([\s\S]*?)\n\n<!-- aisave:\1 end -->/
  );
  return m ? m[2] : null;
}

function collapseWhitespace(text) {
  return text.replace(/\s+/g, ' ').trim();
}

// Returns the index of the first line at which `a` and `b` differ (by line, after a
// tolerant trim of trailing \r), or -1 if one is a prefix of the other with no diff found
// within the shared length (in which case the length difference is the "difference").
function firstDifferingLine(a, b) {
  const linesA = a.split(/\r?\n/);
  const linesB = b.split(/\r?\n/);
  const len = Math.min(linesA.length, linesB.length);
  for (let i = 0; i < len; i++) {
    if (linesA[i] !== linesB[i]) {
      return { index: i, lineA: linesA[i], lineB: linesB[i] };
    }
  }
  if (linesA.length !== linesB.length) {
    return { index: len, lineA: linesA[len] ?? '(end of A)', lineB: linesB[len] ?? '(end of B)' };
  }
  return null;
}

module.exports = {
  CONTENT_JS_PATH,
  loadContentJsSource,
  installAiSaveDev,
  extractFrontmatter,
  extractTurnMarkers,
  extractEndMarker,
  extractAssistantTurnContent,
  collapseWhitespace,
  firstDifferingLine,
};
