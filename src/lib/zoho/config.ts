// Zoho settings come from environment variables only. Values are never logged, shown, or sent to the browser.

export type ZohoEnv = Record<string, string | undefined>;

export const ZOHO_VARS = ["ZOHO_CLIENT_ID", "ZOHO_CLIENT_SECRET", "ZOHO_REFRESH_TOKEN", "ZOHO_ORGANIZATION_ID"] as const;

/** Zoho data centres. India is "in". */
export const DATA_CENTRES = ["in", "com", "eu", "com.au", "jp", "ca"] as const;

export type ZohoConfig = {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  organizationId: string;
  accountsBase: string; // e.g. https://accounts.zoho.in
  apiBase: string; // e.g. https://www.zohoapis.in/inventory/v1
};

export function missingVars(env: ZohoEnv = process.env): string[] {
  return ZOHO_VARS.filter((v) => !env[v]?.trim());
}

/** The only place secrets are read. Returns null while Zoho is not (fully) set up. */
export function getZohoConfig(env: ZohoEnv = process.env): ZohoConfig | null {
  if (missingVars(env).length) return null;
  const dc = (env.ZOHO_DC?.trim() || "in").toLowerCase();
  return {
    clientId: env.ZOHO_CLIENT_ID!.trim(),
    clientSecret: env.ZOHO_CLIENT_SECRET!.trim(),
    refreshToken: env.ZOHO_REFRESH_TOKEN!.trim(),
    organizationId: env.ZOHO_ORGANIZATION_ID!.trim(),
    // The two overrides exist so tests and the practice server can stand in for Zoho.
    accountsBase: env.ZOHO_ACCOUNTS_BASE?.trim() || `https://accounts.zoho.${dc}`,
    apiBase: env.ZOHO_API_BASE?.trim() || `https://www.zohoapis.${dc}/inventory/v1`,
  };
}

/** Which variables are set, as yes/no only. Safe to show on screen. */
export function configStatus(env: ZohoEnv = process.env): { name: string; set: boolean }[] {
  return [...ZOHO_VARS].map((name) => ({ name, set: Boolean(env[name]?.trim()) }));
}
