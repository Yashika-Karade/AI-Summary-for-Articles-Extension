document.getElementById("summarize").addEventListener("click", async () => {
  const resultDiv = document.getElementById("result");
  resultDiv.innerHTML = '<div class="loading"><div class="loader"></div></div>';

  const summaryType = document.getElementById("summary-type").value;

  try {
    const { geminiApiKey } = await new Promise((resolve, reject) => {
      chrome.storage.sync.get(["geminiApiKey"], (result) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(result);
      });
    });

    if (!geminiApiKey) {
      resultDiv.innerText =
        "API key not found. Please set your API key in the extension options.";
      return;
    }

    const [tab] = await new Promise((resolve, reject) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(tabs);
      });
    });
    if (!tab?.id) {
      throw new Error("Could not find the active tab.");
    }

    const articleText = await getArticleText(tab.id);
    if (!articleText) {
      resultDiv.innerText =
        "No readable article text was found. Open a page with an article and try again.";
      return;
    }

    resultDiv.innerText = await getGeminiSummary(
      articleText,
      summaryType,
      geminiApiKey
    );
  } catch (error) {
    resultDiv.innerText = `Error: ${
      error.message || "Failed to read this page."
    }`;
  }
});

function sendArticleRequest(tabId) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, { type: "GET_ARTICLE_TEXT" }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response?.text || "");
    });
  });
}

async function getArticleText(tabId) {
  try {
    return await sendArticleRequest(tabId);
  } catch (error) {
    if (!error.message.includes("Receiving end does not exist")) {
      throw error;
    }

    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"],
    });
    return sendArticleRequest(tabId);
  }
}

document.getElementById("copy-btn").addEventListener("click", () => {
  const summaryText = document.getElementById("result").innerText;

  if (summaryText && summaryText.trim() !== "") {
    navigator.clipboard
      .writeText(summaryText)
      .then(() => {
        const copyBtn = document.getElementById("copy-btn");
        const originalText = copyBtn.innerText;

        copyBtn.innerText = "Copied!";
        setTimeout(() => {
          copyBtn.innerText = originalText;
        }, 2000);
      })
      .catch((err) => {
        console.error("Failed to copy text: ", err);
      });
  }
});

async function getGeminiSummary(text, summaryType, apiKey) {
  // Truncate very long texts to avoid API limits (typically around 30K tokens)
  const maxLength = 20000;
  const truncatedText =
    text.length > maxLength ? text.substring(0, maxLength) + "..." : text;

  let prompt;
  switch (summaryType) {
    case "brief":
      prompt = `Provide a brief summary of the following article in 2-3 sentences:\n\n${truncatedText}`;
      break;
    case "detailed":
      prompt = `Provide a detailed summary of the following article, covering all main points and key details:\n\n${truncatedText}`;
      break;
    case "bullets":
      prompt = `Summarize the following article in 5-7 key points. Format each point as a line starting with "- " (dash followed by a space). Do not use asterisks or other bullet symbols, only use the dash. Keep each point concise and focused on a single key insight from the article:\n\n${truncatedText}`;
      break;
    default:
      prompt = `Summarize the following article:\n\n${truncatedText}`;
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${encodeURIComponent(
      apiKey
    )}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: 0.2,
        },
      }),
    }
  );

  const responseBody = await res.text();
  let data;
  try {
    data = responseBody ? JSON.parse(responseBody) : {};
  } catch {
    throw new Error(
      `Gemini returned an unreadable response (HTTP ${res.status}).`
    );
  }

  if (!res.ok) {
    const message = data.error?.message || responseBody || res.statusText;
    throw new Error(`Gemini API error (HTTP ${res.status}): ${message}`);
  }

  const summary = data?.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || "")
    .join("")
    .trim();
  if (summary) return summary;

  const reason =
    data?.promptFeedback?.blockReason ||
    data?.candidates?.[0]?.finishReason ||
    "The API response did not contain summary text.";
  throw new Error(`Gemini returned no summary text: ${reason}`);
}