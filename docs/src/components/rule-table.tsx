import type { Locale } from "@/lib/i18n";
import type { IRuleRow } from "@/lib/rules";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useIsMobile } from "@/hooks/use-mobile";
import { translate } from "@/lib/i18n";
import { ruleRowId } from "@/lib/rules";

interface IRuleTableProps {
  locale: Locale;
  onSelect: (row: IRuleRow) => void;
  rows: readonly IRuleRow[];
  selectedRule?: string;
}

export function RuleTable({ locale, onSelect, rows, selectedRule }: IRuleTableProps) {
  const isMobile = useIsMobile();
  const inspectLabel = (row: IRuleRow) =>
    translate(locale, "inspectRule").replace("{rule}", row.rule);
  const severityBadge = (row: IRuleRow) => {
    if (!row.enabled) {
      return {
        className: "border-border bg-muted text-neutral-700 dark:text-neutral-300",
        label: translate(locale, "stateDisabled"),
      };
    }
    if (row.severity === "allow") {
      return {
        className:
          "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
        label: translate(locale, "severityAllow"),
      };
    }
    if (row.severity === "warn") {
      return {
        className:
          "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300",
        label: translate(locale, "severityWarn"),
      };
    }
    return {
      className:
        "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-300",
      label: translate(locale, "severityDeny"),
    };
  };

  if (isMobile) {
    return (
      <ul aria-label={translate(locale, "tabRules")} className="rule-mobile-list">
        {rows.map((row) => {
          const id = ruleRowId(row);
          const badge = severityBadge(row);
          return (
            <li className="rule-render-item" key={id}>
              <Button
                aria-label={inspectLabel(row)}
                aria-pressed={selectedRule === id}
                className="rule-mobile-button"
                onClick={() => onSelect(row)}
                variant="ghost"
              >
                <span className="min-w-0 flex-1 text-left">
                  <span className="block truncate font-mono text-sm">{row.rule}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {row.plugin} · {row.preset ?? "—"}
                  </span>
                </span>
                <Badge className={badge.className} variant="outline">
                  {badge.label}
                </Badge>
              </Button>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{translate(locale, "ruleTableRule")}</TableHead>
          <TableHead>{translate(locale, "detailPlugin")}</TableHead>
          <TableHead>{translate(locale, "detailPreset")}</TableHead>
          <TableHead>{translate(locale, "detailSeverity")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => {
          const id = ruleRowId(row);
          const badge = severityBadge(row);
          return (
            <TableRow
              aria-label={inspectLabel(row)}
              aria-selected={selectedRule === id}
              className="rule-render-item cursor-pointer focus-visible:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
              data-state={selectedRule === id ? "selected" : undefined}
              key={id}
              onClick={() => onSelect(row)}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                onSelect(row);
              }}
              tabIndex={0}
            >
              <TableCell>
                <span className="block max-w-full truncate font-mono">{row.rule}</span>
              </TableCell>
              <TableCell className="font-mono text-xs">{row.plugin}</TableCell>
              <TableCell className="font-mono text-xs">{row.preset ?? "—"}</TableCell>
              <TableCell>
                <Badge className={badge.className} variant="outline">
                  {badge.label}
                </Badge>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
