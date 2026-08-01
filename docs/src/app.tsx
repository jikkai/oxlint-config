import type { CSSProperties } from "react";
import { useEffect, useRef, useState } from "react";
import { ClipboardIcon, FilterIcon, PanelRightIcon, RotateCcwIcon } from "lucide-react";

import type { PresetKey } from "@/lib/config-state";
import type { IRuleFilters, IRuleRow } from "@/lib/rules";
import type { IExplorerState } from "@/lib/url-state";

import { ConfigurationSidebar } from "@/components/configuration-sidebar";
import { RuleDetail } from "@/components/rule-detail";
import { RuleFilters } from "@/components/rule-filters";
import { RuleTable } from "@/components/rule-table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  activePresetKeys,
  allStableConfigState,
  isPresetEnabled,
  presetKeys,
  renderConfigSnippet,
  requiredPackages,
  setPreset,
} from "@/lib/config-state";
import { translate } from "@/lib/i18n";
import {
  buildRuleRows,
  buildScopeSummaries,
  filterRuleRows,
  loadRuleSnapshot,
  ruleRowId,
} from "@/lib/rules";
import {
  normalizeExplorerState,
  parseExplorerState,
  serializeExplorerState,
} from "@/lib/url-state";

const presetNames: Record<PresetKey, Parameters<typeof translate>[1]> = {
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

export function App() {
  const [explorer, setExplorer] = useState<IExplorerState>(() => {
    const parsed = parseExplorerState(window.location.search);
    if (new URLSearchParams(window.location.search).has("lang")) return parsed;
    try {
      const stored = window.localStorage?.getItem("oxlint-config-language");
      if (stored === "en" || stored === "zh") return { ...parsed, lang: stored };
    } catch {
      return parsed;
    }
    return parsed;
  });
  const [snapshot, setSnapshot] = useState<Awaited<ReturnType<typeof loadRuleSnapshot>>>();
  const [loadError, setLoadError] = useState(false);
  const [reload, setReload] = useState(0);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [copyStatus, setCopyStatus] = useState<"copied" | "failed">();
  const explorerRef = useRef(explorer);
  explorerRef.current = explorer;
  const isMobile = useIsMobile();
  const pathname = window.location.pathname;

  function normalizeState(state: IExplorerState): IExplorerState {
    if (!snapshot) return state;
    return normalizeExplorerState(
      state,
      buildRuleRows(snapshot, activePresetKeys(state.config), state.view),
    );
  }

  function historyUrl(state: IExplorerState): string {
    const search = serializeExplorerState(state);
    return `${pathname}${search ? `?${search}` : ""}`;
  }

  useEffect(() => {
    let cancelled = false;
    setLoadError(false);
    async function load() {
      try {
        const loaded = await loadRuleSnapshot(`${import.meta.env.BASE_URL}rules.json`);
        if (cancelled) return undefined;
        setSnapshot(loaded);
        const current = explorerRef.current;
        const next = normalizeExplorerState(
          current,
          buildRuleRows(loaded, activePresetKeys(current.config), current.view),
        );
        explorerRef.current = next;
        setExplorer(next);
        const url = historyUrl(next);
        if (`${window.location.pathname}${window.location.search}` !== url) {
          window.history.replaceState(null, "", url);
        }
        return loaded;
      } catch {
        if (!cancelled) setLoadError(true);
        return undefined;
      }
    }
    load().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [reload]);

  useEffect(() => {
    document.documentElement.lang = explorer.lang;
  }, [explorer.lang]);

  useEffect(() => {
    const onPopState = () => {
      const next = normalizeState(parseExplorerState(window.location.search));
      explorerRef.current = next;
      setExplorer(next);
      const url = historyUrl(next);
      if (`${window.location.pathname}${window.location.search}` !== url) {
        window.history.replaceState(null, "", url);
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [snapshot]);

  if (loadError) {
    return (
      <main className="grid min-h-svh place-items-center p-6">
        <Alert className="max-w-md" variant="destructive">
          <AlertTitle>{translate(explorer.lang, "loadError")}</AlertTitle>
          <AlertDescription>
            <Button
              className="mt-3"
              onClick={() => setReload((current) => current + 1)}
              variant="outline"
            >
              <RotateCcwIcon data-icon="inline-start" />
              {translate(explorer.lang, "retry")}
            </Button>
          </AlertDescription>
        </Alert>
      </main>
    );
  }

  if (!snapshot) {
    return (
      <main aria-label={translate(explorer.lang, "appName")} className="loading-shell">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-72 w-full" />
      </main>
    );
  }

  const activeRows = buildRuleRows(snapshot, activePresetKeys(explorer.config), "enabled");
  const allRows =
    explorer.view === "enabled"
      ? activeRows
      : buildRuleRows(snapshot, activePresetKeys(explorer.config), "all");
  const filteredRows = filterRuleRows(allRows, explorer.filters);
  const scopes = buildScopeSummaries(activeRows);
  const selectedRow = allRows.find((row) => ruleRowId(row) === explorer.selectedRule);
  const presetCounts = new Map(
    presetKeys.map((preset) => [preset, snapshot.presets[preset]?.length ?? 0]),
  );
  const configSnippet = renderConfigSnippet(explorer.config);
  const packages = requiredPackages(explorer.config);
  const formatCount = (count: number) =>
    translate(explorer.lang, count === 1 ? "resultCountOne" : "resultCount").replace(
      "{count}",
      String(count),
    );
  const resultText = formatCount(filteredRows.length);

  function updateExplorer(
    update: (current: IExplorerState) => IExplorerState,
    mode: "push" | "replace",
  ) {
    const next = normalizeState(update(explorerRef.current));
    explorerRef.current = next;
    setExplorer(next);
    const url = historyUrl(next);
    if (mode === "push") window.history.pushState(null, "", url);
    else window.history.replaceState(null, "", url);
  }

  function handlePresetChange(key: PresetKey, enabled: boolean) {
    updateExplorer(
      (current) => ({
        ...current,
        config: setPreset(current.config, key, enabled),
      }),
      "replace",
    );
  }

  function handleFiltersChange(filters: IRuleFilters) {
    updateExplorer((current) => ({ ...current, filters }), "replace");
  }

  function handleTabChange(value: string) {
    if (value !== "rules" && value !== "presets" && value !== "scopes" && value !== "config") {
      return;
    }
    updateExplorer((current) => ({ ...current, tab: value }), "push");
  }

  function handleLanguageChange(values: unknown[]) {
    const lang = values[0];
    if (lang !== "en" && lang !== "zh") return;
    updateExplorer((current) => ({ ...current, lang }), "replace");
    try {
      window.localStorage?.setItem("oxlint-config-language", lang);
    } catch {
      // URL state remains the source of truth when storage is unavailable.
    }
  }

  function handleRuleSelect(row: IRuleRow) {
    updateExplorer((current) => ({ ...current, selectedRule: ruleRowId(row) }), "push");
    if (isMobile) setDetailOpen(true);
  }

  function showPresetRules(preset: PresetKey) {
    updateExplorer(
      (current) => ({
        ...current,
        config: setPreset(current.config, preset, true),
        filters: { ...current.filters, preset },
        tab: "rules",
      }),
      "push",
    );
  }

  function showScopeRules(scope: string) {
    updateExplorer(
      (current) => ({
        ...current,
        filters: { ...current.filters, scope },
        tab: "rules",
      }),
      "push",
    );
  }

  async function handleCopy() {
    setCopyStatus(undefined);
    try {
      await navigator.clipboard.writeText(configSnippet);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
    }
  }

  const filterPanel = (
    <RuleFilters
      filters={explorer.filters}
      locale={explorer.lang}
      onFiltersChange={handleFiltersChange}
      onReset={() => handleFiltersChange({})}
      onViewChange={(view) => updateExplorer((current) => ({ ...current, view }), "replace")}
      rows={allRows}
      scopes={scopes}
      view={explorer.view}
    />
  );

  return (
    <SidebarProvider
      className="app-shell"
      style={
        {
          "--sidebar-width": "18rem",
        } as CSSProperties
      }
    >
      <ConfigurationSidebar
        config={explorer.config}
        locale={explorer.lang}
        onAllStable={() =>
          updateExplorer((current) => ({ ...current, config: allStableConfigState() }), "replace")
        }
        onPresetChange={handlePresetChange}
      />
      <SidebarInset className="app-inset">
        <header className="app-header">
          <div className="flex min-w-0 items-center gap-2">
            <SidebarTrigger className="touch-target" />
            <div className="min-w-0">
              <h1 className="truncate font-heading text-base font-semibold">
                {translate(explorer.lang, "appName")}
              </h1>
              <p className="truncate text-xs text-muted-foreground">
                @amamo/oxlint-config {snapshot.packageVersion} · Oxlint {snapshot.oxlintVersion}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <p aria-live="polite" className="result-status" role="status">
              {resultText}
            </p>
            <ToggleGroup
              aria-label={translate(explorer.lang, "language")}
              onValueChange={handleLanguageChange}
              spacing={0}
              value={[explorer.lang]}
              variant="outline"
            >
              <ToggleGroupItem className="touch-target" value="en">
                EN
              </ToggleGroupItem>
              <ToggleGroupItem className="touch-target" value="zh">
                中文
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
        </header>

        <Tabs className="app-tabs" onValueChange={handleTabChange} value={explorer.tab}>
          <div className="tab-toolbar">
            <TabsList variant="line">
              {(
                [
                  ["rules", "tabRules"],
                  ["presets", "tabPresets"],
                  ["scopes", "tabScopes"],
                  ["config", "tabConfig"],
                ] as const
              ).map(([value, key]) => (
                <TabsTrigger className="touch-target" key={value} value={value}>
                  {translate(explorer.lang, key)}
                </TabsTrigger>
              ))}
            </TabsList>

            <Sheet onOpenChange={setFiltersOpen} open={filtersOpen}>
              <SheetTrigger
                render={<Button className="mobile-only touch-target" size="sm" variant="outline" />}
              >
                <FilterIcon data-icon="inline-start" />
                {translate(explorer.lang, "filtersTitle")}
              </SheetTrigger>
              <SheetContent className="mobile-touch-surface" side="left">
                <SheetHeader>
                  <SheetTitle>{translate(explorer.lang, "filtersTitle")}</SheetTitle>
                  <SheetDescription>{resultText}</SheetDescription>
                </SheetHeader>
                <div className="app-scroll-region flex-1 px-4 pb-4">
                  {isMobile ? filterPanel : null}
                </div>
              </SheetContent>
            </Sheet>
          </div>

          <TabsContent className="view-content rules-view" value="rules">
            <div className="rules-layout">
              <div className="rules-primary">
                <aside
                  aria-label={translate(explorer.lang, "filtersTitle")}
                  className="desktop-filters"
                >
                  {isMobile ? null : filterPanel}
                </aside>
                <section
                  aria-label={translate(explorer.lang, "tabRules")}
                  className="rule-results app-scroll-region"
                >
                  {filteredRows.length === 0 ? (
                    <Empty>
                      <EmptyHeader>
                        <EmptyTitle>{translate(explorer.lang, "noResults")}</EmptyTitle>
                        <EmptyDescription>
                          {translate(explorer.lang, "filterSearch")}
                        </EmptyDescription>
                      </EmptyHeader>
                      <EmptyContent>
                        <Button onClick={() => handleFiltersChange({})} variant="outline">
                          {translate(explorer.lang, "resetFilters")}
                        </Button>
                      </EmptyContent>
                    </Empty>
                  ) : (
                    <RuleTable
                      locale={explorer.lang}
                      onSelect={handleRuleSelect}
                      rows={filteredRows}
                      selectedRule={explorer.selectedRule}
                    />
                  )}
                </section>
              </div>
              <div className="desktop-detail app-scroll-region">
                {isMobile ? null : (
                  <RuleDetail
                    locale={explorer.lang}
                    row={selectedRow}
                    schemaDefinitions={snapshot.schemaDefinitions}
                  />
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent className="view-content tab-scroll-region" value="presets">
            <section className="summary-view">
              <div>
                <p className="eyebrow">{translate(explorer.lang, "tabPresets")}</p>
                <h2>{translate(explorer.lang, "configurationTitle")}</h2>
              </div>
              <div className="summary-list">
                {presetKeys.map((preset) => {
                  const count = presetCounts.get(preset) ?? 0;
                  const active = isPresetEnabled(explorer.config, preset);
                  const countText = formatCount(count);
                  return (
                    <article className="summary-row" key={preset}>
                      <div className="min-w-0">
                        <h3>{translate(explorer.lang, presetNames[preset])}</h3>
                        <div className="flex flex-wrap gap-1.5">
                          <Badge variant={active ? "secondary" : "outline"}>
                            {active
                              ? translate(explorer.lang, "stateEnabled")
                              : translate(explorer.lang, "stateDisabled")}
                          </Badge>
                          {preset === "typeAware" ? (
                            <Badge variant="outline">
                              {translate(explorer.lang, "typeAwarePackage")}
                            </Badge>
                          ) : null}
                          {preset === "react" && explorer.config.nextjs ? (
                            <Badge variant="outline">
                              {translate(explorer.lang, "requiredByNextjs")}
                            </Badge>
                          ) : null}
                          {preset === "jsxA11y" && explorer.config.jsxA11y === "auto" && active ? (
                            <Badge variant="outline">
                              {translate(explorer.lang, "autoEnabled")}
                            </Badge>
                          ) : null}
                          {[
                            "cypress",
                            "mocha",
                            "playwright",
                            "regexp",
                            "sonarjs",
                            "storybook",
                            "tailwindcss",
                            "testingLibrary",
                          ].includes(preset) ? (
                            <Badge variant="outline">{translate(explorer.lang, "alpha")}</Badge>
                          ) : null}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {preset !== "base" ? (
                          <Button
                            aria-label={`${active ? translate(explorer.lang, "stateDisabled") : translate(explorer.lang, "stateEnabled")} ${translate(explorer.lang, presetNames[preset])}`}
                            onClick={() => handlePresetChange(preset, !active)}
                            size="sm"
                            variant="ghost"
                          >
                            {active
                              ? translate(explorer.lang, "stateEnabled")
                              : translate(explorer.lang, "stateDisabled")}
                          </Button>
                        ) : null}
                        <Button
                          aria-label={`${preset} — ${countText}`}
                          disabled={count === 0}
                          onClick={() => showPresetRules(preset)}
                          size="sm"
                          variant="outline"
                        >
                          {countText}
                        </Button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          </TabsContent>

          <TabsContent className="view-content tab-scroll-region" value="scopes">
            <section className="summary-view">
              <div>
                <p className="eyebrow">{translate(explorer.lang, "tabScopes")}</p>
                <h2>{translate(explorer.lang, "detailScopes")}</h2>
              </div>
              <div className="summary-list">
                {scopes.map((scope) => {
                  const typeScript = scope.scopes.some((item) => item.includes(".ts"));
                  const name =
                    scope.scopes.length === 0
                      ? translate(explorer.lang, "rootScope")
                      : typeScript
                        ? "TypeScript"
                        : scope.scopes.join(", ");
                  const countText = formatCount(scope.count);
                  return (
                    <article className="summary-row" key={scope.id}>
                      <div className="min-w-0">
                        <h3>{name}</h3>
                        <p className="font-mono text-xs wrap-break-word text-muted-foreground">
                          {scope.scopes.length === 0 ? "./" : scope.scopes.join(", ")}
                        </p>
                      </div>
                      <Button
                        aria-label={`${name} — ${countText}`}
                        onClick={() => showScopeRules(scope.id)}
                        size="sm"
                        variant="outline"
                      >
                        {countText}
                      </Button>
                    </article>
                  );
                })}
              </div>
            </section>
          </TabsContent>

          <TabsContent className="view-content tab-scroll-region" value="config">
            <section className="config-view">
              <div>
                <p className="eyebrow">{translate(explorer.lang, "tabConfig")}</p>
                <h2>{translate(explorer.lang, "configTitle")}</h2>
                <p className="text-sm text-muted-foreground">
                  {translate(explorer.lang, "configInstruction")}
                </p>
              </div>
              <pre className="config-code">{configSnippet}</pre>
              {packages.length > 0 ? (
                <div className="flex flex-col gap-2">
                  <h3 className="text-sm font-medium">
                    {translate(explorer.lang, "installInstruction")}
                  </h3>
                  <code className="install-command">pnpm add -D {packages.join(" ")}</code>
                </div>
              ) : null}
              <div className="flex items-center gap-3">
                <Button onClick={handleCopy}>
                  <ClipboardIcon data-icon="inline-start" />
                  {translate(explorer.lang, "copyConfig")}
                </Button>
                {copyStatus ? (
                  <p aria-live="polite" className="text-sm text-muted-foreground" role="status">
                    {translate(explorer.lang, copyStatus === "copied" ? "copied" : "copyFailed")}
                  </p>
                ) : null}
              </div>
            </section>
          </TabsContent>
        </Tabs>

        <Sheet onOpenChange={setDetailOpen} open={detailOpen}>
          <SheetTrigger
            disabled={!selectedRow}
            render={
              <Button
                className="detail-fab mobile-only touch-target"
                size="sm"
                variant="secondary"
              />
            }
          >
            <PanelRightIcon data-icon="inline-start" />
            {translate(explorer.lang, "ruleDetailsTitle")}
          </SheetTrigger>
          <SheetContent className="mobile-touch-surface" side="right">
            <SheetHeader>
              <SheetTitle>{translate(explorer.lang, "ruleDetailsTitle")}</SheetTitle>
              <SheetDescription>{selectedRow?.rule ?? ""}</SheetDescription>
            </SheetHeader>
            <div className="app-scroll-region flex-1 px-4 pb-4">
              {isMobile ? (
                <RuleDetail
                  locale={explorer.lang}
                  row={selectedRow}
                  schemaDefinitions={snapshot.schemaDefinitions}
                />
              ) : null}
            </div>
          </SheetContent>
        </Sheet>
      </SidebarInset>
    </SidebarProvider>
  );
}
