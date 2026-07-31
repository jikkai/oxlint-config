import { SearchIcon } from "lucide-react";

import type { Locale } from "@/lib/i18n";
import type { IRuleFilters, IRuleRow, IScopeSummary, RuleView } from "@/lib/rules";

import { Button } from "@/components/ui/button";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { translate } from "@/lib/i18n";

interface IRuleFiltersProps {
  filters: IRuleFilters;
  locale: Locale;
  onFiltersChange: (filters: IRuleFilters) => void;
  onReset: () => void;
  onViewChange: (view: RuleView) => void;
  rows: readonly IRuleRow[];
  scopes: readonly IScopeSummary[];
  view: RuleView;
}

const allValue = "__all";

export function RuleFilters({
  filters,
  locale,
  onFiltersChange,
  onReset,
  onViewChange,
  rows,
  scopes,
  view,
}: IRuleFiltersProps) {
  const plugins = [...new Set(rows.map((row) => row.plugin))];
  const presets = [...new Set(rows.flatMap((row) => (row.preset ? [row.preset] : [])))];
  const scopeItems = scopes.map((summary) => ({
    id: summary.id,
    label: summary.scopes.length === 0 ? translate(locale, "rootScope") : summary.scopes.join(", "),
  }));
  const selectedScope = scopeItems.find((item) => item.id === filters.scope)?.label ?? "";
  const selectItems = (values: readonly string[]) => [
    { label: translate(locale, "filterAll"), value: allValue },
    ...values.map((value) => ({ label: value, value })),
  ];

  return (
    <FieldGroup className="rule-filters gap-3">
      <div className="filter-primary">
        <Field>
          <FieldLabel className="sr-only" htmlFor="rule-search">
            {translate(locale, "filterSearch")}
          </FieldLabel>
          <InputGroup>
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput
              aria-label={translate(locale, "filterSearch")}
              id="rule-search"
              onChange={(event) =>
                onFiltersChange({ ...filters, query: event.currentTarget.value || undefined })
              }
              placeholder={translate(locale, "filterSearch")}
              type="search"
              value={filters.query ?? ""}
            />
          </InputGroup>
        </Field>

        <Field orientation="horizontal">
          <FieldLabel id="rule-view-label">{translate(locale, "detailState")}</FieldLabel>
          <ToggleGroup
            aria-labelledby="rule-view-label"
            onValueChange={(values) => {
              const next = values[0];
              if (next === "enabled" || next === "all") onViewChange(next);
            }}
            spacing={0}
            value={[view]}
            variant="outline"
          >
            <ToggleGroupItem value="enabled">{translate(locale, "filterEnabled")}</ToggleGroupItem>
            <ToggleGroupItem value="all">{translate(locale, "filterAll")}</ToggleGroupItem>
          </ToggleGroup>
        </Field>
      </div>

      <div className="filter-grid">
        {(
          [
            ["plugin", "filterPlugin", plugins],
            ["preset", "filterPreset", presets],
            ["severity", "filterSeverity", ["allow", "warn", "deny"]],
            ["state", "filterState", ["enabled", "disabled"]],
          ] as const
        ).map(([key, labelKey, values]) => {
          const items = selectItems(values);
          const label = translate(locale, labelKey);
          const controlId = `${key}-filter`;
          return (
            <Field key={key}>
              <FieldLabel htmlFor={controlId} id={`${key}-filter-label`}>
                {label}
              </FieldLabel>
              <Select
                items={items}
                onValueChange={(value) =>
                  onFiltersChange({
                    ...filters,
                    [key]: value === allValue || value === null ? undefined : value,
                  })
                }
                value={filters[key] ?? allValue}
              >
                <SelectTrigger
                  aria-labelledby={`${key}-filter-label`}
                  className="w-full"
                  id={controlId}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false}>
                  <SelectGroup>
                    {items.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.value === "allow"
                          ? translate(locale, "severityAllow")
                          : item.value === "warn"
                            ? translate(locale, "severityWarn")
                            : item.value === "deny"
                              ? translate(locale, "severityDeny")
                              : item.value === "enabled"
                                ? translate(locale, "stateEnabled")
                                : item.value === "disabled"
                                  ? translate(locale, "stateDisabled")
                                  : item.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          );
        })}

        <Field>
          <FieldLabel htmlFor="scope-filter" id="scope-filter-label">
            {translate(locale, "filterScope")}
          </FieldLabel>
          <Combobox
            items={scopeItems.map((item) => item.label)}
            onValueChange={(value) =>
              onFiltersChange({
                ...filters,
                scope: scopeItems.find((item) => item.label === value)?.id,
              })
            }
            value={selectedScope}
          >
            <ComboboxInput
              aria-labelledby="scope-filter-label"
              clearLabel={translate(locale, "clearScope")}
              id="scope-filter"
              placeholder={translate(locale, "filterAll")}
              showClear
            />
            <ComboboxContent>
              <ComboboxEmpty>{translate(locale, "noResults")}</ComboboxEmpty>
              <ComboboxList>
                <ComboboxGroup>
                  {scopeItems.map((item) => (
                    <ComboboxItem key={item.id} value={item.label}>
                      {item.label}
                    </ComboboxItem>
                  ))}
                </ComboboxGroup>
              </ComboboxList>
            </ComboboxContent>
          </Combobox>
        </Field>

        <Button className="filter-reset" onClick={onReset} size="sm" variant="ghost">
          {translate(locale, "resetFilters")}
        </Button>
      </div>
    </FieldGroup>
  );
}
