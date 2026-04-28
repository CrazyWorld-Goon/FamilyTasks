import en from "../../languages/en/i18n.json";
import ru from "../../languages/ru/i18n.json";

export type Locale = "en" | "ru";

export const MESSAGES = { en, ru } as const;

export type MessageBundle = (typeof MESSAGES)[Locale];
