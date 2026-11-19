import { z } from "zod";

const preferencesKey = "opspilot.war-room.preferences";
const themeSchema = z.enum(["system", "light", "dark"]);

export const apiBaseUrlSchema = z.string().trim().min(1).transform((value, context) => {
    try {
        const url = new URL(value);
        if (
            !["http:", "https:"].includes(url.protocol)
            || url.username
            || url.password
            || url.search
            || url.hash
        ) {
            context.addIssue({ code: "custom", message: "Use an absolute HTTP(S) URL without credentials, query, or fragment." });
            return z.NEVER;
        }
        return url.toString().replace(/\/+$/, "");
    } catch {
        context.addIssue({ code: "custom", message: "Enter a valid absolute HTTP(S) URL." });
        return z.NEVER;
    }
});

const preferencesSchema = z.object({
    apiBaseUrl: apiBaseUrlSchema,
    theme: themeSchema,
});

export type Preferences = z.infer<typeof preferencesSchema>;

export function getDefaultApiBaseUrl(): string {
    const configured = import.meta.env?.VITE_API_BASE_URL;
    return apiBaseUrlSchema.parse(configured || "http://localhost:3000");
}

export function readPreferences(storage: Storage | undefined = globalThis.localStorage): Preferences {
    if (!storage) {
        return { apiBaseUrl: getDefaultApiBaseUrl(), theme: "system" };
    }
    const raw = storage.getItem(preferencesKey);
    if (!raw) {
        return { apiBaseUrl: getDefaultApiBaseUrl(), theme: "system" };
    }
    let value: unknown;
    try {
        value = JSON.parse(raw) as unknown;
    } catch (error) {
        if (error instanceof SyntaxError) {
            throw new Error("Saved War Room settings are malformed. Review the API URL and theme before continuing.");
        }
        throw error;
    }
    const parsed = preferencesSchema.safeParse(value);
    if (!parsed.success) {
        throw new Error("Saved War Room settings are invalid. Review the API URL and theme before continuing.");
    }
    return parsed.data;
}

export function savePreferences(value: unknown, storage: Storage | undefined = globalThis.localStorage): Preferences {
    const parsed = preferencesSchema.parse(value);
    if (!storage) {
        throw new Error("Browser storage is not available; preferences were not saved.");
    }
    storage.setItem(preferencesKey, JSON.stringify(parsed));
    return parsed;
}

export function joinApiEndpoint(baseUrl: string, endpoint: string): string {
    const base = apiBaseUrlSchema.parse(baseUrl);
    const path = z.string().regex(/^\/[A-Za-z0-9/_-]*$/).parse(endpoint);
    return `${base}${path}`;
}

export function getCurrentApiBaseUrl(): string {
    return readPreferences().apiBaseUrl;
}
