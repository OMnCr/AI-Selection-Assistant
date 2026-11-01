(() => {
  function t(key, substitutions, fallback) {
    try {
      const args =
        substitutions === undefined
          ? undefined
          : Array.isArray(substitutions)
            ? substitutions
            : [String(substitutions)];
      const message = chrome.i18n.getMessage(key, args);
      if (message) {
        return message;
      }
    } catch {
      // Fall through to the caller-provided default.
    }
    return fallback || key;
  }

  function defaultPrompts() {
    return [
      {
        id: "prompt-1",
        name: t("promptSummaryName", undefined, "Summarize"),
        enabled: true,
        prompt: t(
          "promptSummaryText",
          undefined,
          "Summarize the following content concisely:\n\n{{selection}}"
        )
      },
      {
        id: "prompt-2",
        name: t("promptTranslateName", undefined, "Translate"),
        enabled: true,
        prompt: t(
          "promptTranslateText",
          undefined,
          "Translate the following content into English:\n\n{{selection}}"
        )
      },
      {
        id: "prompt-3",
        name: t("promptExplainName", undefined, "Explain"),
        enabled: true,
        prompt: t(
          "promptExplainText",
          undefined,
          "Explain the following content in clear, plain language:\n\n{{selection}}"
        )
      },
      {
        id: "prompt-4",
        name: t("promptPolishName", undefined, "Polish"),
        enabled: true,
        prompt: t(
          "promptPolishText",
          undefined,
          "Polish the following text without changing its meaning:\n\n{{selection}}"
        )
      },
      {
        id: "prompt-5",
        name: t("promptKeyPointsName", undefined, "Key points"),
        enabled: true,
        prompt: t(
          "promptKeyPointsText",
          undefined,
          "Extract the key points from the following content and output them as a bulleted list:\n\n{{selection}}"
        )
      },
      {
        id: "prompt-6",
        name: t("promptRewriteName", undefined, "Rewrite"),
        enabled: true,
        prompt: t(
          "promptRewriteText",
          undefined,
          "Rewrite the following content in a different way:\n\n{{selection}}"
        )
      },
      {
        id: "prompt-7",
        name: t("promptAnswerName", undefined, "Answer"),
        enabled: true,
        prompt: t(
          "promptAnswerText",
          undefined,
          "Answer the question based on the following content:\n\n{{selection}}"
        )
      },
      {
        id: "prompt-8",
        name: t("promptTitlesName", undefined, "Titles"),
        enabled: true,
        prompt: t(
          "promptTitlesText",
          undefined,
          "Generate 3 compelling titles for the following content:\n\n{{selection}}"
        )
      },
      {
        id: "prompt-9",
        name: t("promptCustomName", undefined, "Custom"),
        enabled: true,
        prompt: "{{selection}}"
      }
    ];
  }

  let locale = "en";
  try {
    locale = chrome.i18n.getUILanguage() || "en";
  } catch {
    // Keep the English fallback outside extension environments.
  }

  globalThis.AIInlineI18n = { t, defaultPrompts, locale };
})();
