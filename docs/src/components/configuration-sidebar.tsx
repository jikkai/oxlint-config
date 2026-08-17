import { BracesIcon } from "lucide-react";
import type { IConfigState, PresetKey } from "@/lib/config-state";
import type { Locale } from "@/lib/i18n";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Sidebar, SidebarContent, SidebarHeader } from "@/components/ui/sidebar";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { isPresetEnabled } from "@/lib/config-state";
import { translate } from "@/lib/i18n";

interface IConfigurationSidebarProps {
  config: IConfigState;
  locale: Locale;
  onAllStable: () => void;
  onPresetChange: (key: PresetKey, enabled: boolean) => void;
  oxlintVersion: string;
  packageVersion: string;
}

const presetLabels: Record<PresetKey, Parameters<typeof translate>[1]> = {
  base: "presetBase",
  cypress: "presetCypress",
  imports: "presetImports",
  jest: "presetJest",
  jsdoc: "presetJsdoc",
  jsxA11y: "presetJsxA11y",
  mocha: "presetMocha",
  nextjs: "presetNextjs",
  node: "presetNode",
  playwright: "presetPlaywright",
  promise: "presetPromise",
  react: "presetReact",
  reactPerf: "presetReactPerf",
  regexp: "presetRegexp",
  sonarjs: "presetSonarjs",
  storybook: "presetStorybook",
  tailwindcss: "presetTailwindcss",
  testingLibrary: "presetTestingLibrary",
  typeAware: "presetTypeAware",
  typescript: "presetTypescript",
  vitest: "presetVitest",
  vue: "presetVue",
};

const groups: ReadonlyArray<{
  keys: readonly PresetKey[];
  label: Parameters<typeof translate>[1];
}> = [
  { keys: ["base", "typescript", "imports", "promise"], label: "groupDefaults" },
  {
    keys: ["react", "reactPerf", "nextjs", "jsxA11y", "vue", "tailwindcss"],
    label: "groupFrameworks",
  },
  { keys: ["jest", "vitest"], label: "groupTests" },
  { keys: ["node", "jsdoc", "typeAware"], label: "groupAdvanced" },
  {
    keys: ["cypress", "mocha", "playwright", "regexp", "sonarjs", "storybook", "testingLibrary"],
    label: "groupExperimental",
  },
];

export function ConfigurationSidebar({
  config,
  locale,
  onAllStable,
  onPresetChange,
  oxlintVersion,
  packageVersion,
}: IConfigurationSidebarProps) {
  return (
    <TooltipProvider>
      <Sidebar className="border-r border-sidebar-border/80" collapsible="offcanvas">
        <SidebarHeader className="gap-4 border-b border-sidebar-border/80 p-5">
          <div className="flex min-w-0 items-start gap-3">
            <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-foreground text-background shadow-sm">
              <BracesIcon className="size-4" />
            </div>
            <div className="min-w-0">
              <h2 className="truncate font-heading text-base font-semibold tracking-tight">
                {translate(locale, "appName")}
              </h2>
              <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10px] text-muted-foreground">
                <span>@amamo/oxlint-config</span>
                <span className="rounded border bg-muted px-1 font-mono leading-4">
                  v{packageVersion}
                </span>
                <span>Oxlint {oxlintVersion}</span>
              </p>
            </div>
          </div>
          <Button
            className="w-full justify-between bg-background/70"
            onClick={onAllStable}
            size="sm"
            variant="outline"
          >
            {translate(locale, "allStable")}
            <span className="size-1.5 rounded-full bg-emerald-500" />
          </Button>
        </SidebarHeader>
        <SidebarContent className="gap-6 px-4 py-5">
          {groups.map((group) => (
            <FieldSet className="gap-1.5" key={group.label}>
              <FieldLegend
                className="px-2 text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase"
                variant="label"
              >
                {translate(locale, group.label)}
              </FieldLegend>
              <FieldGroup className="gap-0.5">
                {group.keys.map((key) => {
                  const lockedByNext = key === "react" && config.nextjs;
                  const disabled = key === "base" || lockedByNext;
                  const experimental = group.label === "groupExperimental" || key === "tailwindcss";
                  const checked = isPresetEnabled(config, key);

                  return (
                    <Field
                      className="-mx-2 min-h-10 rounded-lg px-2 py-2 transition-colors hover:bg-sidebar-accent/70"
                      data-disabled={disabled || undefined}
                      key={key}
                      orientation="horizontal"
                    >
                      <FieldContent>
                        <FieldLabel className="text-[13px] font-medium" htmlFor={`preset-${key}`}>
                          {translate(locale, presetLabels[key])}
                          {experimental ? (
                            <Badge className="h-4 px-1.5 text-[10px]" variant="outline">
                              {translate(locale, "alpha")}
                            </Badge>
                          ) : null}
                        </FieldLabel>
                        {key === "base" ? (
                          <FieldDescription className="text-[11px]">
                            {translate(locale, "locked")}
                          </FieldDescription>
                        ) : null}
                        {lockedByNext ? (
                          <FieldDescription className="text-[11px]">
                            {translate(locale, "requiredByNextjs")}
                          </FieldDescription>
                        ) : null}
                        {key === "jsxA11y" && config.jsxA11y === "auto" && checked ? (
                          <FieldDescription className="text-[11px]">
                            {translate(locale, "autoEnabled")}
                          </FieldDescription>
                        ) : null}
                        {key === "typeAware" ? (
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <Badge className="h-4 px-1.5 text-[10px]" variant="secondary" />
                              }
                            >
                              {translate(locale, "typeAwarePackage")}
                            </TooltipTrigger>
                            <TooltipContent>{translate(locale, "typeAwarePackage")}</TooltipContent>
                          </Tooltip>
                        ) : null}
                      </FieldContent>
                      <Switch
                        aria-label={translate(locale, presetLabels[key])}
                        checked={checked}
                        disabled={disabled}
                        id={`preset-${key}`}
                        onCheckedChange={(enabled) => onPresetChange(key, enabled)}
                        size="sm"
                      />
                    </Field>
                  );
                })}
              </FieldGroup>
            </FieldSet>
          ))}
        </SidebarContent>
      </Sidebar>
    </TooltipProvider>
  );
}
