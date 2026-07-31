import type { HighlighterCore } from "shiki/types";
import { useEffect, useState } from "react";

interface IJsonCodeProps {
  code: string;
}

let highlighter: Promise<HighlighterCore> | undefined;

export function JsonCode({ code }: IJsonCodeProps) {
  const [highlighted, setHighlighted] = useState<{ code: string; html: string }>();

  async function highlightJson() {
    highlighter ??= Promise.all([
      import("shiki/core"),
      import("shiki/engine/javascript"),
      import("shiki/langs/json.mjs"),
      import("shiki/themes/github-light.mjs"),
    ]).then(([{ createHighlighterCore }, { createJavaScriptRegexEngine }, language, theme]) =>
      createHighlighterCore({
        engine: createJavaScriptRegexEngine(),
        langs: [language.default],
        themes: [theme.default],
      }),
    );

    return (await highlighter).codeToHtml(code, { lang: "json", theme: "github-light" });
  }

  useEffect(() => {
    let current = true;

    highlightJson()
      .then((html) => {
        if (current) setHighlighted({ code, html });
        return undefined;
      })
      .catch(() => {
        if (current) setHighlighted(undefined);
      });

    return () => {
      current = false;
    };
  }, [code]);

  const html = highlighted?.code === code ? highlighted.html : undefined;
  return html ? (
    <div className="json-code" dangerouslySetInnerHTML={{ __html: html }} />
  ) : (
    <pre>{code}</pre>
  );
}
