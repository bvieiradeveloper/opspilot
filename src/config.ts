import { z } from "zod";

const originSchema = z.string().trim().min(1).refine((value) => {
    try {
        const url = new URL(value);
        return (url.protocol === "http:" || url.protocol === "https:") && url.origin === value;
    } catch {
        return false;
    }
}, "Each OPSPILOT_WEB_ORIGINS entry must be an exact absolute HTTP(S) origin.");

export type WarRoomConfig = {
    userId: string;
    webOrigins: string[];
};

export function parseWarRoomConfig(env: Record<string, string | undefined>): WarRoomConfig {
    const userId = z.string({
        error: "OPSPILOT_USER_ID is required for War Room mode.",
    }).trim().min(1, "OPSPILOT_USER_ID must not be empty.");
    const origins = z.string({
        error: "OPSPILOT_WEB_ORIGINS is required for War Room mode.",
    }).trim().min(1, "OPSPILOT_WEB_ORIGINS must not be empty.");
    const parsedUserId = userId.safeParse(env.OPSPILOT_USER_ID);
    if (!parsedUserId.success) {
        throw new Error(parsedUserId.error.issues[0]?.message ?? "Invalid OPSPILOT_USER_ID.");
    }

    const parsedOrigins = origins.safeParse(env.OPSPILOT_WEB_ORIGINS);
    if (!parsedOrigins.success) {
        throw new Error(parsedOrigins.error.issues[0]?.message ?? "Invalid OPSPILOT_WEB_ORIGINS.");
    }

    const webOrigins = parsedOrigins.data.split(",").map((origin) => origin.trim());
    if (webOrigins.some((origin) => !origin)) {
        throw new Error("OPSPILOT_WEB_ORIGINS must contain only non-empty HTTP(S) origins.");
    }
    const parsedOriginList = z.array(originSchema).min(1).safeParse(webOrigins);
    if (!parsedOriginList.success) {
        throw new Error(`Invalid OPSPILOT_WEB_ORIGINS: ${parsedOriginList.error.issues[0]?.message ?? "invalid origin."}`);
    }

    return {
        userId: parsedUserId.data,
        webOrigins: [...new Set(parsedOriginList.data)],
    };
}

export function readOptionalWarRoomConfig(env: Record<string, string | undefined>): WarRoomConfig | undefined {
    if (env.OPSPILOT_USER_ID === undefined && env.OPSPILOT_WEB_ORIGINS === undefined) {
        return undefined;
    }
    return parseWarRoomConfig(env);
}
