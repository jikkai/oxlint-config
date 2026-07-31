import type {
  IRuleApplication,
  IRuleInventoryItem,
  IRuleSnapshot,
  RuleSeverity,
} from "./rule-types";

export type RuleStateFilter = "enabled" | "disabled";
export type RuleView = "enabled" | "all";

export interface IRuleFilters {
  plugin?: string;
  preset?: string;
  query?: string;
  scope?: string;
  severity?: RuleSeverity;
  state?: RuleStateFilter;
}

export interface IRuleRow {
  configurationSchema?: unknown;
  description?: string;
  docsUrl: string;
  enabled: boolean;
  external: boolean;
  options: unknown[];
  plugin: string;
  preset?: string;
  rule: string;
  scopes: string[];
  severity?: RuleSeverity;
}

export interface IPresetSummary {
  count: number;
  preset: string;
}

export interface IScopeSummary {
  count: number;
  id: string;
  scopes: string[];
}

interface IDisabledRuleIdentity {
  enabled: false;
  plugin: string;
  rule: string;
}

function canonicalScopes(scopes: readonly string[]): string[] {
  return stableSort([...new Set(scopes)], compareText);
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      stableSort(Object.entries(value as Record<string, unknown>), ([left], [right]) =>
        compareText(left, right),
      ).map(([key, item]) => [key, canonicalValue(item)]),
    );
  }
  return value;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function stableSort<T>(values: readonly T[], compare: (left: T, right: T) => number): T[] {
  const sorted = [...values];
  Reflect.apply(Array.prototype.sort, sorted, [compare]);
  return sorted;
}

function scopeId(scopes: readonly string[]): string {
  return JSON.stringify(canonicalScopes(scopes));
}

function compareScopes(left: readonly string[], right: readonly string[]): number {
  return compareText(canonicalScopes(left).join("\0"), canonicalScopes(right).join("\0"));
}

function applicationId(application: IRuleApplication): string {
  return JSON.stringify([
    application.plugin,
    application.rule,
    canonicalScopes(application.scopes),
  ]);
}

function inventoryId(item: Pick<IRuleInventoryItem, "plugin" | "rule">): string {
  return JSON.stringify([item.plugin, item.rule]);
}

function sortRows(rows: readonly IRuleRow[]): IRuleRow[] {
  return stableSort(
    rows,
    (left, right) =>
      compareText(left.rule, right.rule) ||
      compareScopes(left.scopes, right.scopes) ||
      compareText(left.preset ?? "", right.preset ?? "") ||
      compareText(left.plugin, right.plugin),
  );
}

export function composeRuleApplications(
  snapshot: IRuleSnapshot,
  activePresets: readonly string[],
): IRuleApplication[] {
  const applications = new Map<string, IRuleApplication>();
  for (const preset of activePresets) {
    for (const application of snapshot.presets[preset] ?? []) {
      const normalized = { ...application, scopes: canonicalScopes(application.scopes) };
      applications.set(applicationId(normalized), normalized);
    }
  }
  return [...applications.values()];
}

export function buildRuleRows(
  snapshot: IRuleSnapshot,
  activePresets: readonly string[],
  view: RuleView,
): IRuleRow[] {
  const inventory = new Map(snapshot.inventory.map((item) => [inventoryId(item), item] as const));
  const applications = composeRuleApplications(snapshot, activePresets);
  const activeRules = new Set(applications.map(inventoryId));
  const rows: IRuleRow[] = [];
  for (const application of applications) {
    rows.push({
      ...application,
      configurationSchema: inventory.get(inventoryId(application))?.configurationSchema,
      enabled: true,
    });
  }

  if (view === "all") {
    for (const item of snapshot.inventory) {
      if (activeRules.has(inventoryId(item))) continue;
      rows.push({
        ...item,
        enabled: false,
        external: false,
        options: [],
        scopes: [],
      });
    }
  }

  return sortRows(rows);
}

export function filterRuleRows(rows: readonly IRuleRow[], filters: IRuleFilters): IRuleRow[] {
  const query = filters.query?.trim().toLowerCase();
  return sortRows(
    rows.filter((row) => {
      if (query) {
        const searchable = [row.rule, row.plugin, row.preset ?? "", ...row.scopes]
          .join("\n")
          .toLowerCase();
        if (!searchable.includes(query)) return false;
      }
      if (filters.plugin && row.plugin !== filters.plugin) return false;
      if (filters.preset && row.preset !== filters.preset) return false;
      if (filters.severity && row.severity !== filters.severity) return false;
      if (filters.state && row.enabled !== (filters.state === "enabled")) return false;
      if (filters.scope && scopeId(row.scopes) !== filters.scope) return false;
      return true;
    }),
  );
}

export function buildPresetSummaries(rows: readonly IRuleRow[]): IPresetSummary[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (!row.enabled || !row.preset) continue;
    counts.set(row.preset, (counts.get(row.preset) ?? 0) + 1);
  }
  return [...counts].map(([preset, count]) => ({ count, preset }));
}

export function buildScopeSummaries(rows: readonly IRuleRow[]): IScopeSummary[] {
  const summaries = new Map<string, IScopeSummary>();
  for (const row of rows) {
    if (!row.enabled) continue;
    const id = scopeId(row.scopes);
    const existing = summaries.get(id);
    if (existing) existing.count += 1;
    else summaries.set(id, { count: 1, id, scopes: canonicalScopes(row.scopes) });
  }
  return [...summaries.values()];
}

export function ruleRowId(row: IRuleApplication | IRuleRow | IDisabledRuleIdentity): string {
  if ("enabled" in row && !row.enabled) {
    return JSON.stringify(["disabled", row.plugin, row.rule]);
  }
  return JSON.stringify([
    "active",
    row.preset,
    row.plugin,
    row.rule,
    canonicalScopes(row.scopes),
    row.severity,
    canonicalValue(row.options),
  ]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isRuleApplication(value: unknown): value is IRuleApplication {
  if (!isRecord(value)) return false;
  return (
    typeof value.docsUrl === "string" &&
    typeof value.external === "boolean" &&
    Array.isArray(value.options) &&
    typeof value.plugin === "string" &&
    typeof value.preset === "string" &&
    typeof value.rule === "string" &&
    Array.isArray(value.scopes) &&
    value.scopes.every((scope) => typeof scope === "string") &&
    (value.severity === "allow" || value.severity === "warn" || value.severity === "deny") &&
    (value.description === undefined || typeof value.description === "string")
  );
}

function isRuleInventoryItem(value: unknown): value is IRuleInventoryItem {
  return (
    isRecord(value) &&
    typeof value.docsUrl === "string" &&
    typeof value.plugin === "string" &&
    typeof value.rule === "string"
  );
}

function isRuleSnapshot(value: unknown): value is IRuleSnapshot {
  if (
    !isRecord(value) ||
    !Array.isArray(value.inventory) ||
    typeof value.oxlintVersion !== "string" ||
    typeof value.packageVersion !== "string" ||
    !isRecord(value.presets) ||
    !isRecord(value.schemaDefinitions)
  ) {
    return false;
  }
  return (
    value.inventory.every(isRuleInventoryItem) &&
    Object.values(value.presets).every(
      (applications) => Array.isArray(applications) && applications.every(isRuleApplication),
    )
  );
}

export async function loadRuleSnapshot(
  input: RequestInfo | URL,
  fetchSnapshot: typeof fetch = fetch,
): Promise<IRuleSnapshot> {
  const response = await fetchSnapshot(input);
  if (!response.ok) throw new Error(`Failed to load rule snapshot: HTTP ${response.status}`);
  const snapshot: unknown = await response.json();
  if (!isRuleSnapshot(snapshot)) throw new Error("Invalid rule snapshot");
  if (snapshot.inventory.length === 0) {
    throw new Error("Invalid rule snapshot: inventory must not be empty");
  }
  const inventoryRules = new Set<string>();
  for (const item of snapshot.inventory) {
    const identity = inventoryId(item);
    if (inventoryRules.has(identity)) {
      throw new Error(
        `Invalid rule snapshot: duplicate inventory rule ${item.plugin}/${item.rule}`,
      );
    }
    inventoryRules.add(identity);
  }
  return snapshot;
}
