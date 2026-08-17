import type { CSSProperties } from "react";
import { BracesIcon, ClipboardIcon, FilterIcon, PanelRightIcon, RotateCcwIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
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
import { Switch } from "@/components/ui/switch";
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
  const detailSheetRef = useRef<HTMLDivElement>(null);
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
      <main
        aria-label={translate(explorer.lang, "appName")}
        className="mx-auto flex min-h-svh w-full max-w-5xl flex-col justify-center gap-6 p-6"
      >
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
      className="h-svh min-h-0 overflow-hidden"
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
        oxlintVersion={snapshot.oxlintVersion}
        packageVersion={snapshot.packageVersion}
      />
      <SidebarInset className="h-svh min-h-0 overflow-hidden">
        <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between gap-3 border-b bg-background/90 px-3 backdrop-blur-xl lg:px-5">
          <div className="flex min-w-0 items-center gap-2">
            <SidebarTrigger className="min-h-11 min-w-11 lg:min-h-0 lg:min-w-0" />
            <div className="hidden size-8 shrink-0 place-items-center rounded-lg bg-foreground text-background shadow-sm sm:grid lg:hidden">
              <BracesIcon className="size-4" />
            </div>
            <div className="min-w-0 lg:hidden">
              <h1 className="truncate font-heading text-sm font-semibold tracking-tight sm:text-base">
                {translate(explorer.lang, "appName")}
              </h1>
              <p className="flex items-center gap-1.5 truncate text-[11px] text-muted-foreground">
                <span className="hidden sm:inline">@amamo/oxlint-config</span>
                <span className="rounded border bg-muted px-1 font-mono text-[10px] leading-4">
                  v{snapshot.packageVersion}
                </span>
                <span className="truncate">Oxlint {snapshot.oxlintVersion}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <p
              aria-live="polite"
              className="hidden rounded-full border bg-muted/70 px-2.5 py-1 text-xs text-muted-foreground tabular-nums sm:block"
              role="status"
            >
              {resultText}
            </p>
            <ToggleGroup
              aria-label={translate(explorer.lang, "language")}
              onValueChange={handleLanguageChange}
              spacing={0}
              value={[explorer.lang]}
              variant="outline"
            >
              <ToggleGroupItem className="min-h-11 min-w-11 lg:min-h-0 lg:min-w-0" value="en">
                EN
              </ToggleGroupItem>
              <ToggleGroupItem className="min-h-11 min-w-11 lg:min-h-0 lg:min-w-0" value="zh">
                中文
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
        </header>

        <Tabs
          className="min-h-0 flex-1 gap-0 overflow-hidden"
          onValueChange={handleTabChange}
          value={explorer.tab}
        >
          <div className="flex h-12 shrink-0 items-center justify-between gap-3 border-b bg-background px-3 lg:px-5">
            <TabsList className="h-full gap-0 p-0" variant="line">
              {(
                [
                  ["rules", "tabRules"],
                  ["presets", "tabPresets"],
                  ["scopes", "tabScopes"],
                  ["config", "tabConfig"],
                ] as const
              ).map(([value, key]) => (
                <TabsTrigger
                  className="h-full min-h-11 rounded-none px-2 text-[13px] after:-bottom-px after:bg-primary sm:px-3 lg:min-h-0"
                  key={value}
                  value={value}
                >
                  {translate(explorer.lang, key)}
                </TabsTrigger>
              ))}
            </TabsList>

            <Sheet onOpenChange={setFiltersOpen} open={filtersOpen}>
              <SheetTrigger
                render={
                  <Button
                    className={
                      explorer.tab === "rules"
                        ? "inline-flex min-h-11 min-w-11 lg:hidden"
                        : "hidden"
                    }
                    size="sm"
                    variant="outline"
                  />
                }
              >
                <FilterIcon data-icon="inline-start" />
                <span className="sr-only sm:not-sr-only">
                  {translate(explorer.lang, "filtersTitle")}
                </span>
              </SheetTrigger>
              <SheetContent
                className="[&_[role=combobox]]:min-h-11 [&_[role=combobox]]:min-w-11 [&_button]:min-h-11 [&_button]:min-w-11 [&_input]:min-h-11"
                side="left"
              >
                <SheetHeader>
                  <SheetTitle>{translate(explorer.lang, "filtersTitle")}</SheetTitle>
                  <SheetDescription>{resultText}</SheetDescription>
                </SheetHeader>
                <div className="min-h-0 flex-1 overflow-auto overscroll-contain px-4 pb-4">
                  {isMobile ? filterPanel : null}
                </div>
              </SheetContent>
            </Sheet>
          </div>

          <TabsContent className="min-h-0 overflow-hidden" value="rules">
            <div className="grid h-full min-h-0 grid-cols-1 overflow-hidden lg:grid-cols-[minmax(0,1fr)_minmax(19rem,22rem)]">
              <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
                <aside
                  aria-label={translate(explorer.lang, "filtersTitle")}
                  className="hidden max-h-1/2 shrink-0 overflow-y-auto overscroll-contain border-b bg-card/70 p-4 lg:block"
                >
                  {isMobile ? null : filterPanel}
                </aside>
                <section
                  aria-label={translate(explorer.lang, "tabRules")}
                  className="min-h-0 min-w-0 flex-1 overflow-auto overscroll-contain [&_[data-slot=table-container]]:overflow-clip"
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
              <div className="hidden h-full min-h-0 min-w-0 overflow-x-hidden overflow-y-auto overscroll-contain border-l bg-background p-5 lg:block">
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

          <TabsContent className="min-h-0 overflow-y-auto overscroll-contain" value="presets">
            <section className="mx-auto flex min-h-full w-full max-w-4xl flex-col gap-6 p-4 sm:p-8 lg:p-10">
              <div>
                <p className="text-[11px] font-semibold tracking-[0.12em] text-primary uppercase">
                  {translate(explorer.lang, "tabPresets")}
                </p>
                <h2 className="font-heading text-2xl font-semibold tracking-tight">
                  {translate(explorer.lang, "configurationTitle")}
                </h2>
              </div>
              <div className="flex flex-col divide-y overflow-hidden rounded-xl border bg-card shadow-sm shadow-foreground/5">
                {presetKeys.map((preset) => {
                  const count = presetCounts.get(preset) ?? 0;
                  const active = isPresetEnabled(explorer.config, preset);
                  const countText = formatCount(count);
                  return (
                    <article
                      className="flex min-h-17 items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-muted/60"
                      key={preset}
                    >
                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-medium">
                          {translate(explorer.lang, presetNames[preset])}
                        </h3>
                        <div className="flex flex-wrap gap-1.5">
                          {preset === "base" ? (
                            <Badge variant="secondary">
                              {translate(explorer.lang, "stateEnabled")}
                            </Badge>
                          ) : null}
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
                          <Switch
                            aria-label={translate(explorer.lang, presetNames[preset])}
                            checked={active}
                            disabled={preset === "react" && explorer.config.nextjs}
                            onCheckedChange={(enabled) => handlePresetChange(preset, enabled)}
                            size="sm"
                          />
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

          <TabsContent className="min-h-0 overflow-y-auto overscroll-contain" value="scopes">
            <section className="mx-auto flex min-h-full w-full max-w-4xl flex-col gap-6 p-4 sm:p-8 lg:p-10">
              <div>
                <p className="text-[11px] font-semibold tracking-[0.12em] text-primary uppercase">
                  {translate(explorer.lang, "tabScopes")}
                </p>
                <h2 className="font-heading text-2xl font-semibold tracking-tight">
                  {translate(explorer.lang, "detailScopes")}
                </h2>
              </div>
              <div className="flex flex-col divide-y overflow-hidden rounded-xl border bg-card shadow-sm shadow-foreground/5">
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
                    <article
                      className="flex min-h-17 items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-muted/60"
                      key={scope.id}
                    >
                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-medium">{name}</h3>
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

          <TabsContent className="min-h-0 overflow-y-auto overscroll-contain" value="config">
            <section className="mx-auto flex min-h-full w-full max-w-4xl flex-col gap-6 p-4 sm:p-8 lg:p-10">
              <div>
                <p className="text-[11px] font-semibold tracking-[0.12em] text-primary uppercase">
                  {translate(explorer.lang, "tabConfig")}
                </p>
                <h2 className="font-heading text-2xl font-semibold tracking-tight">
                  {translate(explorer.lang, "configTitle")}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {translate(explorer.lang, "configInstruction")}
                </p>
              </div>
              <div className="overflow-hidden rounded-xl border border-neutral-800 bg-neutral-950 shadow-xl shadow-foreground/10">
                <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-neutral-900 px-4 py-2.5 text-neutral-400">
                  <div className="flex items-center gap-2.5">
                    <span className="size-2.5 rounded-full bg-primary" />
                    <span className="font-mono text-[11px]">oxlint.config.ts</span>
                  </div>
                  <Button
                    className="border-white/10 bg-white/5 text-neutral-200 hover:bg-white/10 hover:text-white"
                    onClick={handleCopy}
                    size="sm"
                    variant="outline"
                  >
                    <ClipboardIcon data-icon="inline-start" />
                    {translate(explorer.lang, "copyConfig")}
                  </Button>
                </div>
                <pre className="min-h-40 overflow-x-auto p-5 font-mono text-[13px] leading-6 text-neutral-100">
                  {configSnippet}
                </pre>
              </div>
              {copyStatus ? (
                <p aria-live="polite" className="text-sm text-muted-foreground" role="status">
                  {translate(explorer.lang, copyStatus === "copied" ? "copied" : "copyFailed")}
                </p>
              ) : null}
              {packages.length > 0 ? (
                <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm shadow-foreground/5">
                  <h3 className="text-sm font-medium">
                    {translate(explorer.lang, "installInstruction")}
                  </h3>
                  <code className="block w-fit max-w-full overflow-x-auto rounded-lg bg-foreground px-3 py-2.5 font-mono text-xs text-background">
                    <span className="text-background/45 select-none">$ </span>
                    pnpm add -D {packages.join(" ")}
                  </code>
                </div>
              ) : null}
            </section>
          </TabsContent>
        </Tabs>

        <Sheet onOpenChange={setDetailOpen} open={detailOpen}>
          <SheetTrigger
            disabled={!selectedRow}
            render={
              <Button
                className="fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] inline-flex min-h-11 min-w-11 shadow-lg disabled:hidden lg:hidden"
                size="sm"
                variant="secondary"
              />
            }
          >
            <PanelRightIcon data-icon="inline-start" />
            {translate(explorer.lang, "ruleDetailsTitle")}
          </SheetTrigger>
          <SheetContent
            className="[&_[role=combobox]]:min-h-11 [&_[role=combobox]]:min-w-11 [&_button]:min-h-11 [&_button]:min-w-11 [&_input]:min-h-11"
            initialFocus={detailSheetRef}
            ref={detailSheetRef}
            side="right"
          >
            <SheetHeader>
              <SheetTitle>{translate(explorer.lang, "ruleDetailsTitle")}</SheetTitle>
              <SheetDescription>{selectedRow?.rule ?? ""}</SheetDescription>
            </SheetHeader>
            <div className="min-h-0 flex-1 overflow-auto overscroll-contain px-4 pb-4">
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
