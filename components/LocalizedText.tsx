"use client";

import { useLocalization } from "./LocalizationProvider";

export function LocalizedText({ text }: { text: string }) {
  const { t } = useLocalization();
  return <>{t(text)}</>;
}
