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
import { Separator } from "@/components/ui/separator";
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
}: IConfigurationSidebarProps) {
  return (
    <TooltipProvider>
      <Sidebar className="border-r" collapsible="offcanvas">
        <SidebarHeader className="gap-3 p-4">
          <div>
            <p className="text-xs font-medium tracking-wide text-muted-foreground">
              @amamo/oxlint-config
            </p>
            <h2 className="font-heading text-base font-semibold">
              {translate(locale, "configurationTitle")}
            </h2>
          </div>
          <Button onClick={onAllStable} size="sm" variant="outline">
            {translate(locale, "allStable")}
          </Button>
        </SidebarHeader>
        <Separator />
        <SidebarContent className="gap-5 p-4">
          {groups.map((group) => (
            <FieldSet className="gap-2" key={group.label}>
              <FieldLegend className="text-xs tracking-wide text-muted-foreground" variant="label">
                {translate(locale, group.label)}
              </FieldLegend>
              <FieldGroup className="gap-3">
                {group.keys.map((key) => {
                  const lockedByNext = key === "react" && config.nextjs;
                  const disabled = key === "base" || lockedByNext;
                  const experimental = group.label === "groupExperimental" || key === "tailwindcss";
                  const checked = isPresetEnabled(config, key);

                  return (
                    <Field data-disabled={disabled || undefined} key={key} orientation="horizontal">
                      <FieldContent>
                        <FieldLabel htmlFor={`preset-${key}`}>
                          {translate(locale, presetLabels[key])}
                          {experimental ? (
                            <Badge variant="outline">{translate(locale, "alpha")}</Badge>
                          ) : null}
                        </FieldLabel>
                        {key === "base" ? (
                          <FieldDescription>{translate(locale, "locked")}</FieldDescription>
                        ) : null}
                        {lockedByNext ? (
                          <FieldDescription>
                            {translate(locale, "requiredByNextjs")}
                          </FieldDescription>
                        ) : null}
                        {key === "jsxA11y" && config.jsxA11y === "auto" && checked ? (
                          <FieldDescription>{translate(locale, "autoEnabled")}</FieldDescription>
                        ) : null}
                        {key === "typeAware" ? (
                          <Tooltip>
                            <TooltipTrigger render={<Badge variant="secondary" />}>
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
