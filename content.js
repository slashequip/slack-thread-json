chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getThread") {
    extractThreadAsync().then(sendResponse);
    return true; // keep message channel open for async response
  }
});

function findThreadDrawer() {
  const selectors = [
    '[data-qa="threads_flexpane"]',
    '[data-qa="thread_view"]',
  ];

  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (el && isVisible(el)) {
      return el;
    }
  }

  return null;
}

function isVisible(el) {
  if (!el) return false;
  const style = window.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden") return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function getScrollContainer(drawer) {
  return drawer.querySelector(".c-scrollbar__hider");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function extractThreadAsync() {
  const drawer = findThreadDrawer();
  if (!drawer) {
    return { error: "no_drawer" };
  }

  const scrollContainer = getScrollContainer(drawer);
  if (!scrollContainer) {
    // No virtual list — just extract what's there
    return extractVisibleMessages(drawer);
  }

  // Find the element that actually scrolls (scrollHeight > clientHeight)
  const candidates = [
    scrollContainer,
    drawer.querySelector(".c-virtual_list"),
    drawer.querySelector(".c-virtual_list__scroll_container"),
    drawer.querySelector('[data-qa="slack_kit_scrollbar"]'),
  ].filter(Boolean);

  const scrollEl =
    candidates.find((el) => el.scrollHeight > el.clientHeight) ||
    scrollContainer;

  const messagesById = new Map();

  // Scroll to top first
  scrollEl.scrollTop = 0;
  scrollContainer.scrollTop = 0;
  await sleep(400);

  let stuckCount = 0;
  let iterations = 0;

  while (true) {
    iterations++;

    // Harvest currently visible messages
    const visible = drawer.querySelectorAll('[data-qa="message_container"]');
    for (const msgEl of visible) {
      const ts = msgEl.getAttribute("data-msg-ts");
      if (!ts || messagesById.has(ts)) continue;

      const author = extractAuthor(msgEl);
      const timestamp = extractTimestamp(msgEl);
      const text = extractText(msgEl);
      const reactions = extractReactions(msgEl);

      if (text) {
        const msg = { author, timestamp, text };
        if (reactions.length > 0) msg.reactions = reactions;
        messagesById.set(ts, msg);
      }
    }

    // Scroll down by a chunk
    const before = scrollEl.scrollTop;
    scrollEl.scrollTop += scrollEl.clientHeight * 0.7;
    await sleep(350);

    // Also try scrollContainer in case they differ
    if (scrollEl !== scrollContainer) {
      scrollContainer.scrollTop = scrollEl.scrollTop;
    }

    const after = scrollEl.scrollTop;
    if (after === before) {
      stuckCount++;
      if (stuckCount >= 3) break;
    } else {
      stuckCount = 0;
    }

    if (iterations > 100) break;
  }

  if (messagesById.size === 0) {
    return { error: "no_messages" };
  }

  // Sort chronologically by Slack ts
  const sorted = [...messagesById.entries()]
    .sort(([a], [b]) => parseFloat(a) - parseFloat(b))
    .map(([, msg]) => msg);

  // Fix author propagation for compact messages (sorted order)
  let runningAuthor = "Unknown";
  for (const msg of sorted) {
    if (msg.author !== "Unknown") {
      runningAuthor = msg.author;
    } else {
      msg.author = runningAuthor;
    }
  }

  return { thread: { messages: sorted } };
}

function extractVisibleMessages(drawer) {
  const messageElements = drawer.querySelectorAll(
    '[data-qa="message_container"]'
  );

  if (messageElements.length === 0) {
    return { error: "no_messages" };
  }

  const messages = [];
  let lastAuthor = "Unknown";

  for (const msgEl of messageElements) {
    const author = extractAuthor(msgEl);
    const timestamp = extractTimestamp(msgEl);
    const text = extractText(msgEl);
    const reactions = extractReactions(msgEl);

    if (author !== "Unknown") {
      lastAuthor = author;
    }

    if (text) {
      const msg = {
        author: author !== "Unknown" ? author : lastAuthor,
        timestamp,
        text,
      };
      if (reactions.length > 0) msg.reactions = reactions;
      messages.push(msg);
    }
  }

  if (messages.length === 0) {
    return { error: "no_text" };
  }

  return { thread: { messages } };
}

function extractAuthor(msgEl) {
  const authorSelectors = [
    '[data-qa="message_sender_name"]',
    'button[data-message-sender]',
  ];

  for (const selector of authorSelectors) {
    const el = msgEl.querySelector(selector);
    if (el && el.textContent.trim()) {
      return el.textContent.trim();
    }
  }

  return "Unknown";
}

function extractTimestamp(msgEl) {
  const tsEl = msgEl.querySelector("a.c-timestamp[data-ts]");
  if (tsEl) {
    const ts = parseFloat(tsEl.getAttribute("data-ts"));
    if (!isNaN(ts)) {
      return new Date(ts * 1000).toISOString();
    }
  }

  const anyTs = msgEl.querySelector("[data-ts]");
  if (anyTs) {
    const ts = parseFloat(anyTs.getAttribute("data-ts"));
    if (!isNaN(ts)) {
      return new Date(ts * 1000).toISOString();
    }
  }

  // Fall back to the data-msg-ts on the container itself
  const msgTs = msgEl.getAttribute("data-msg-ts");
  if (msgTs) {
    const ts = parseFloat(msgTs);
    if (!isNaN(ts)) {
      return new Date(ts * 1000).toISOString();
    }
  }

  return null;
}

function extractText(msgEl) {
  const textEl = msgEl.querySelector('[data-qa="message-text"]');
  if (textEl) {
    return cleanText(textEl);
  }

  const richText = msgEl.querySelector(".p-rich_text_section");
  if (richText) {
    return cleanText(richText);
  }

  return null;
}

function extractReactions(msgEl) {
  const reactions = [];
  const reactionButtons = msgEl.querySelectorAll('[data-qa="reactji"]');
  for (const btn of reactionButtons) {
    const img = btn.querySelector("img[data-stringify-emoji]");
    const countEl = btn.querySelector(".c-reaction__count");
    if (img && countEl) {
      const emoji = img.getAttribute("data-stringify-emoji") || img.alt || "";
      const count = parseInt(countEl.textContent.trim(), 10) || 0;
      if (emoji && count > 0) {
        reactions.push({ emoji, count });
      }
    }
  }
  return reactions;
}

function cleanText(el) {
  const clone = el.cloneNode(true);

  clone
    .querySelectorAll(".c-message__edited_label")
    .forEach((e) => e.remove());

  clone.querySelectorAll(".c-mrkdwn__br").forEach((e) => {
    e.replaceWith("\n\n");
  });

  clone.querySelectorAll('img[data-stringify-emoji]').forEach((e) => {
    e.replaceWith(e.getAttribute("data-stringify-emoji") || e.alt || "");
  });

  const text = clone.innerText.trim();
  return text || null;
}
