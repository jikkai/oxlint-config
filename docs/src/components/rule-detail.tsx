import { ExternalLinkIcon } from "lucide-react";

import type { Locale } from "@/lib/i18n";
import type { IRuleRow } from "@/lib/rules";

import { JsonCode } from "@/components/json-code";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { translate } from "@/lib/i18n";

interface IRuleDetailProps {
  locale: Locale;
  row?: IRuleRow;
  schemaDefinitions: Record<string, unknown>;
}

export function RuleDetail({ locale, row, schemaDefinitions }: IRuleDetailProps) {
  if (!row) {
    return (
      <aside aria-label={translate(locale, "ruleDetailsTitle")} className="rule-detail-panel">
        <p className="text-sm text-muted-foreground">{translate(locale, "selectRule")}</p>
      </aside>
    );
  }

  const disabledBadgeClassName = "border-border bg-muted text-neutral-700 dark:text-neutral-300";
  const enabledBadgeClassName =
    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300";
  const severityBadge = !row.enabled
    ? { className: disabledBadgeClassName, label: translate(locale, "stateDisabled") }
    : row.severity === "allow"
      ? { className: enabledBadgeClassName, label: translate(locale, "severityAllow") }
      : row.severity === "warn"
        ? {
            className:
              "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300",
            label: translate(locale, "severityWarn"),
          }
        : {
            className:
              "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-300",
            label: translate(locale, "severityDeny"),
          };
  const scopes = row.scopes.length === 0 ? [translate(locale, "rootScope")] : row.scopes;
  const referencedDefinitions = new Map<string, unknown>();
  const pending: unknown[] = row.configurationSchema ? [row.configurationSchema] : [];
  while (pending.length > 0) {
    const value = pending.pop();
    if (Array.isArray(value)) {
      pending.push(...value);
      continue;
    }
    if (value === null || typeof value !== "object") continue;
    const record = value as Record<string, unknown>;
    const reference = record.$ref;
    if (typeof reference === "string" && reference.startsWith("#/definitions/")) {
      const key = reference
        .slice("#/definitions/".length)
        .replaceAll("~1", "/")
        .replaceAll("~0", "~");
      const definition = schemaDefinitions[key];
      if (definition !== undefined && !referencedDefinitions.has(key)) {
        referencedDefinitions.set(key, definition);
        pending.push(definition);
      }
    }
    pending.push(...Object.values(record));
  }
  const definitions = Object.fromEntries(referencedDefinitions);
  const schema = row.configurationSchema
    ? {
        ...(referencedDefinitions.size > 0 ? { definitions } : {}),
        schema: row.configurationSchema,
      }
    : undefined;

  return (
    <aside aria-label={translate(locale, "ruleDetailsTitle")} className="rule-detail-panel">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{translate(locale, "ruleDetailsTitle")}</p>
          <h2 className="break-words font-mono text-base font-semibold">{row.rule}</h2>
        </div>
        {row.external ? <Badge variant="outline">{translate(locale, "alpha")}</Badge> : null}
      </div>

      <dl className="detail-grid">
        <dt>{translate(locale, "detailState")}</dt>
        <dd>
          <Badge
            className={row.enabled ? enabledBadgeClassName : disabledBadgeClassName}
            variant="outline"
          >
            {row.enabled ? translate(locale, "stateEnabled") : translate(locale, "stateDisabled")}
          </Badge>
        </dd>
        <dt>{translate(locale, "detailSeverity")}</dt>
        <dd>
          <Badge className={severityBadge.className} variant="outline">
            {severityBadge.label}
          </Badge>
        </dd>
        <dt>{translate(locale, "detailPlugin")}</dt>
        <dd className="font-mono">{row.plugin}</dd>
        <dt>{translate(locale, "detailPreset")}</dt>
        <dd className="font-mono">{row.preset ?? "—"}</dd>
      </dl>

      <Separator />
      <section className="detail-section">
        <h3>{translate(locale, "detailScopes")}</h3>
        <div className="flex flex-wrap gap-1.5">
          {scopes.map((scope) => (
            <Badge className="font-mono" key={scope} variant="outline">
              {scope}
            </Badge>
          ))}
        </div>
      </section>

      <section className="detail-section">
        <h3>{translate(locale, "detailOptions")}</h3>
        <pre>{JSON.stringify(row.options, null, 2)}</pre>
      </section>

      {schema ? (
        <section className="detail-section">
          <h3>{translate(locale, "detailSchema")}</h3>
          <JsonCode code={JSON.stringify(schema, null, 2)} />
        </section>
      ) : null}

      {row.description ? (
        <section className="detail-section">
          <h3>{translate(locale, "detailDescription")}</h3>
          <p className="text-sm text-muted-foreground">{row.description}</p>
        </section>
      ) : null}

      <a
        className={buttonVariants({ variant: "outline" })}
        href={row.docsUrl}
        rel="noreferrer"
        target="_blank"
      >
        {translate(locale, "detailDocs")}
        <ExternalLinkIcon data-icon="inline-end" />
      </a>
    </aside>
  );
}
