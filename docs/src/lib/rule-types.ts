export type RuleSeverity = "allow" | "warn" | "deny";

export interface IRuleApplication {
  description?: string;
  docsUrl: string;
  external: boolean;
  options: unknown[];
  plugin: string;
  preset: string;
  rule: string;
  scopes: string[];
  severity: RuleSeverity;
}

export interface IRuleInventoryItem {
  configurationSchema?: unknown;
  docsUrl: string;
  plugin: string;
  rule: string;
}

export interface IRuleSnapshot {
  inventory: IRuleInventoryItem[];
  oxlintVersion: string;
  packageVersion: string;
  presets: Record<string, IRuleApplication[]>;
  schemaDefinitions: Record<string, unknown>;
}
