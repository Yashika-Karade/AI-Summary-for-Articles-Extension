function getArticleText() {
  const selectors = ["article", "main", '[role="main"]'];
  const candidates = selectors
    .flatMap((selector) => Array.from(document.querySelectorAll(selector)))
    .map((element) => element.innerText.trim())
    .filter((text) => text.length > 0);

  if (candidates.length > 0) {
    return candidates.reduce((longest, text) =>
      text.length > longest.length ? text : longest
    );
  }

  const paragraphs = Array.from(document.querySelectorAll("p"))
    .map((paragraph) => paragraph.innerText.trim())
    .filter((text) => text.length >= 40);
  if (paragraphs.length > 0) return paragraphs.join("\n\n");

  const pageText = document.body?.innerText.trim() || "";
  return pageText.length >= 100 ? pageText : "";
}

chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
  if (req.type === "GET_ARTICLE_TEXT") {
    const text = getArticleText();
    sendResponse({ text });
  }
});