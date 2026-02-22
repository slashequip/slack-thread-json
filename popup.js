const statusEl = document.getElementById("status");
const copyBtn = document.getElementById("copy-btn");
const feedbackEl = document.getElementById("feedback");
const reactionsToggle = document.getElementById("reactions-toggle");

let threadData = null;

// Restore toggle state
chrome.storage.local.get({ includeReactions: true }, (result) => {
  reactionsToggle.checked = result.includeReactions;
});

reactionsToggle.addEventListener("change", () => {
  chrome.storage.local.set({ includeReactions: reactionsToggle.checked });
});

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function ensureContentScript(tabId) {
  // Check if content script is already loaded
  try {
    await chrome.tabs.sendMessage(tabId, { action: "ping" });
    return true;
  } catch {
    // Not loaded — try programmatic injection
  }

  if (chrome.scripting && chrome.scripting.executeScript) {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"],
    });
    return true;
  }

  return false;
}

async function checkForThread() {
  const tab = await getActiveTab();

  if (!tab || !tab.url || !tab.url.includes("slack.com")) {
    statusEl.textContent = "Not on a Slack page.";
    return;
  }

  const injected = await ensureContentScript(tab.id);
  if (!injected) {
    statusEl.textContent = "Please refresh the Slack page, then try again.";
    return;
  }

  try {
    statusEl.textContent = "Scanning thread…";
    const response = await chrome.tabs.sendMessage(tab.id, {
      action: "getThread",
    });

    if (response && response.thread && response.thread.messages.length > 0) {
      const count = response.thread.messages.length;
      statusEl.textContent = `Thread found (${count} message${count !== 1 ? "s" : ""})`;
      statusEl.classList.add("found");
      copyBtn.disabled = false;
      threadData = response;
    } else {
      statusEl.textContent = "No thread detected.";
    }
  } catch (err) {
    statusEl.textContent = `Error: ${err.message}`;
  }
}

copyBtn.addEventListener("click", async () => {
  if (!threadData) return;

  try {
    let output = threadData;
    if (!reactionsToggle.checked) {
      output = {
        thread: {
          messages: threadData.thread.messages.map(({ reactions, ...rest }) => rest),
        },
      };
    }
    const json = JSON.stringify(output, null, 2);
    await navigator.clipboard.writeText(json);
    showFeedback("Copied to clipboard!", "success");
  } catch {
    showFeedback("Failed to copy.", "error");
  }
});

function showFeedback(message, type) {
  feedbackEl.textContent = message;
  feedbackEl.className = `feedback ${type}`;
  feedbackEl.hidden = false;
  setTimeout(() => {
    feedbackEl.hidden = true;
  }, 2000);
}

checkForThread();
