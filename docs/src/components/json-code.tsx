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
    <div
      className="w-full min-w-0 overflow-hidden [&_.shiki]:m-0 [&_.shiki]:w-full [&_.shiki]:max-w-full [&_.shiki]:overflow-hidden [&_.shiki]:rounded-lg [&_.shiki]:border [&_.shiki]:bg-muted! [&_.shiki]:p-3 [&_.shiki]:font-mono [&_.shiki]:text-xs [&_.shiki]:leading-5 [&_code]:wrap-anywhere [&_code]:whitespace-pre-wrap"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  ) : (
    <pre className="w-full min-w-0 overflow-hidden rounded-lg border bg-muted/60 p-3 font-mono text-xs leading-5 wrap-anywhere whitespace-pre-wrap">
      {code}
    </pre>
  );
}
