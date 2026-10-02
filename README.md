# AiSave - Chrome Extension

**AiSave** is a Edge/Chrome extension that writes Markdown captures, plus
**unambiguous per-turn markers**, so tools can split a saved
conversation into turns exactly.

## Why

AiSave writes each turn as `## Human` / `## Assistant` and joins turns with `---`. A reply converted
from HTML can contain those same lines (an `<h2>Assistant</h2>` or an `<hr>`), so a reader cannot always
tell where a reply really starts. AiSave adds marker lines that a reply cannot contain.

## Format (`format: aisave-dev/1`)

```markdown
---
title: "Code review findings"
date: 2026-09-28
url: https://chatgpt.com/c/...
platform: chatgpt
format: aisave-dev/1
nonce: 9f2c41d7e0b3
---

# Code review findings

<!-- aisave:9f2c41d7e0b3 turn=1 role=human -->
## Human

...

---

<!-- aisave:9f2c41d7e0b3 turn=2 role=assistant -->
## Assistant

...

<!-- aisave:9f2c41d7e0b3 end -->
```

- `nonce` is 12 random hex characters, generated per save after the page text exists, so no saved text
  can contain its own file's markers.
- Each turn starts with `<!-- aisave:<nonce> turn=<n> role=<label in lower case> -->` on its own line,
  followed by the usual `## <Label>` heading. The file ends with `<!-- aisave:<nonce> end -->`.
- Everything else is exactly AiSave's output, so the file still reads the same, and the markers are
  invisible in rendered Markdown.

AiSave and AiSave can be installed side by side; each runs in its own isolated world.

## Tests

An offline regression suite runs the real, unmodified `content.js` in jsdom against a real saved
ChatGPT page and checks the `aisave-dev/1` markdown it produces.

```
npm install
npm test
```

- `test/fixtures/chatgpt-code-review-findings.html` is a real saved ChatGPT conversation page
  (originally `https://chatgpt.com/c/6aba80f6-f520-83ed-9f0b-bb7ddcd0564f`), used to exercise
  `scrapeChatGPT()` end to end.
- `test/fixtures/live-capture-code-review-findings.md` is a real capture the live extension
  produced from that same conversation, used as a cross-check (not an exact oracle - the nonce
  and date differ per save) for the Assistant turn's text.
- `test/scrape.test.js` covers the fixture end to end (frontmatter, turn markers, end marker,
  nonce count, the cross-check). `test/format.test.js` covers the marker writer alone against a
  tiny synthetic DOM, including a reply whose own text fakes a turn separator and heading.

## Features

- **Multi-Platform Support**: Tailored scraping logic for major AI services.
- **Clean Markdown Export**: Converts complex HTML structures into readable Markdown.
- **Privacy First**: All scraping and processing happen locally in your browser. No data is sent to external servers.
- **Smart Detection**: Automatically detects the AI platform you are using.
- **Metadata Inclusion**: Saves date, URL, and platform information in a Markdown frontmatter block.
- **Sanitized Filenames**: Automatically generates safe and descriptive filenames based on the conversation title and date.

## Supported Platforms

AiSave (like AiSave) includes specialized support for:

- **ChatGPT** (`chatgpt.com`, `chat.openai.com`)
- **Claude.ai**
- **Google Gemini**
- **Perplexity AI**
- **Microsoft Copilot** (including Bing Chat)
- **OpenAI Playground** (Chat and Assistants modes)
- **Character.AI**
- **HuggingFace Chat**
- **Meta AI**
- **Grok** (x.com/twitter.com integration)
- **DuckDuckGo AI**
- **Qwen Studio** (`chat.qwen.ai`, `qwen.ai`)
- **Merlin** (`getmerlin.in`)
- **Generic Support**: A fallback scraper for other sites using common web patterns.

## Installation

### From Source (Developer Mode)

1. Clone or download this repository.
2. Open Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer mode** (toggle in the top right).
4. Click **Load unpacked** and select the directory containing the extension files.

## Usage

1. Navigate to a supported AI chat platform.
2. Start or open a conversation.
3. Click the **AiSave** icon in your browser's extension toolbar.
4. The popup will display the detected platform.
5. Click **Save Conversation**.
6. The conversation will be downloaded as a `.md` file to your default downloads folder.

## Technical Details

- **Manifest V3**: Built using the latest Chrome Extension standards.
- **Content Script Injection**: Injects logic only when needed to minimize browser overhead.
- **HTML-to-Markdown Engine**: Custom-built recursive walker to handle paragraphs, code blocks (with language detection), tables, lists, and more.
- **Idempotent Injection**: Guards against multiple injections in the same tab session.

## Permissions

- `activeTab`: To read the content of the current AI conversation.
- `downloads`: To save the Markdown file to your computer.
- `scripting`: To inject the scraping logic into the page.

---

*Note: This extension is intended for personal use and archival purposes. Please respect the terms of service of the AI platforms you use.*
