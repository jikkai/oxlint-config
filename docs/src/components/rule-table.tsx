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
      <ul aria-label={translate(locale, "tabRules")} className="m-0 flex list-none flex-col p-0">
        {rows.map((row) => {
          const id = ruleRowId(row);
          const badge = severityBadge(row);
          return (
            <li className="[contain-intrinsic-size:0_56px] [content-visibility:auto]" key={id}>
              <Button
                aria-label={inspectLabel(row)}
                aria-pressed={selectedRule === id}
                className="min-h-14 w-full justify-between rounded-none border-b border-border/70 px-4 py-2.5 aria-pressed:bg-accent/70 aria-pressed:[box-shadow:inset_3px_0_0_var(--primary)]"
                onClick={() => onSelect(row)}
                variant="ghost"
              >
                <span className="min-w-0 flex-1 text-left">
                  <span className="block truncate font-mono text-[13px] font-medium">
                    {row.rule}
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                    {row.plugin} · {row.preset ?? "—"}
                  </span>
                </span>
                <Badge className={`${badge.className} font-mono text-[10px]`} variant="outline">
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
    <Table className="min-w-[42rem] table-fixed">
      <TableHeader className="sticky top-0 z-10 bg-muted/90 backdrop-blur-md">
        <TableRow>
          <TableHead className="w-[48%] px-4 text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
            {translate(locale, "ruleTableRule")}
          </TableHead>
          <TableHead className="w-[19%] px-3 text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
            {translate(locale, "detailPlugin")}
          </TableHead>
          <TableHead className="w-[19%] px-3 text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
            {translate(locale, "detailPreset")}
          </TableHead>
          <TableHead className="w-[14%] px-3 text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
            {translate(locale, "detailSeverity")}
          </TableHead>
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
              className="cursor-pointer border-border/70 [contain-intrinsic-size:0_41px] [content-visibility:auto] hover:bg-accent/40 focus-visible:bg-muted focus-visible:outline-2 focus-visible:outline-ring data-[state=selected]:bg-accent/70 data-[state=selected]:[box-shadow:inset_3px_0_0_var(--primary)]"
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
              <TableCell className="px-4 py-2.5 text-[13px]">
                <span className="block max-w-full truncate font-mono font-medium">{row.rule}</span>
              </TableCell>
              <TableCell className="px-3 py-2.5 font-mono text-xs text-muted-foreground">
                {row.plugin}
              </TableCell>
              <TableCell className="px-3 py-2.5 font-mono text-xs text-muted-foreground">
                {row.preset ?? "—"}
              </TableCell>
              <TableCell className="px-3 py-2.5">
                <Badge className={`${badge.className} font-mono text-[10px]`} variant="outline">
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
