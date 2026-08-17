import { ExternalLinkIcon, PanelRightIcon } from "lucide-react";
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
      <aside
        aria-label={translate(locale, "ruleDetailsTitle")}
        className="flex h-full min-w-0 flex-col gap-5"
      >
        <div className="grid min-h-40 place-items-center p-6 text-center">
          <div className="flex max-w-48 flex-col items-center gap-3 text-muted-foreground">
            <span className="grid size-9 place-items-center rounded-lg border bg-background">
              <PanelRightIcon className="size-4" />
            </span>
            <p className="text-sm leading-5">{translate(locale, "selectRule")}</p>
          </div>
        </div>
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
    <aside
      aria-label={translate(locale, "ruleDetailsTitle")}
      className="flex h-full min-w-0 flex-col gap-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold tracking-[0.12em] text-primary uppercase">
            {translate(locale, "ruleDetailsTitle")}
          </p>
          <h2 className="mt-1 font-mono text-base font-semibold wrap-break-word">{row.rule}</h2>
        </div>
        {row.external ? <Badge variant="outline">{translate(locale, "alpha")}</Badge> : null}
      </div>

      <dl className="grid min-w-0 grid-cols-[6rem_minmax(0,1fr)] gap-x-3 gap-y-3 text-[13px] [&_dd]:m-0 [&_dd]:min-w-0 [&_dd]:wrap-anywhere [&_dt]:text-[11px] [&_dt]:font-medium [&_dt]:text-muted-foreground">
        <dt>{translate(locale, "detailState")}</dt>
        <dd>
          <Badge
            className={`${row.enabled ? enabledBadgeClassName : disabledBadgeClassName} font-mono text-[10px]`}
            variant="outline"
          >
            {row.enabled ? translate(locale, "stateEnabled") : translate(locale, "stateDisabled")}
          </Badge>
        </dd>
        <dt>{translate(locale, "detailSeverity")}</dt>
        <dd>
          <Badge className={`${severityBadge.className} font-mono text-[10px]`} variant="outline">
            {severityBadge.label}
          </Badge>
        </dd>
        <dt>{translate(locale, "detailPlugin")}</dt>
        <dd className="font-mono">{row.plugin}</dd>
        <dt>{translate(locale, "detailPreset")}</dt>
        <dd className="font-mono">{row.preset ?? "—"}</dd>
      </dl>

      <Separator />
      <section className="flex min-w-0 flex-col gap-2">
        <h3 className="text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
          {translate(locale, "detailScopes")}
        </h3>
        <div className="flex flex-wrap gap-1.5">
          {scopes.map((scope) => (
            <Badge
              className="max-w-full font-mono wrap-anywhere whitespace-normal"
              key={scope}
              variant="outline"
            >
              {scope}
            </Badge>
          ))}
        </div>
      </section>

      <section className="flex min-w-0 flex-col gap-2">
        <h3 className="text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
          {translate(locale, "detailOptions")}
        </h3>
        <pre className="w-full min-w-0 overflow-hidden rounded-lg border bg-muted/60 p-3 font-mono text-xs leading-5 wrap-anywhere whitespace-pre-wrap">
          {JSON.stringify(row.options, null, 2)}
        </pre>
      </section>

      {schema ? (
        <section className="flex min-w-0 flex-col gap-2">
          <h3 className="text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
            {translate(locale, "detailSchema")}
          </h3>
          <JsonCode code={JSON.stringify(schema, null, 2)} />
        </section>
      ) : null}

      {row.description ? (
        <section className="flex min-w-0 flex-col gap-2">
          <h3 className="text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
            {translate(locale, "detailDescription")}
          </h3>
          <p className="text-sm leading-6 text-muted-foreground">{row.description}</p>
        </section>
      ) : null}

      <a
        className={buttonVariants({
          className: "mt-auto w-full justify-between",
          variant: "outline",
        })}
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
