"use client";

import { useEffect } from "react";
import { installClipboardFallback } from "@/lib/clipboard-fallback";

/**
 * Mounted once in the root layout: installs the legacy-copy fallback so copy
 * buttons keep working when the site is served over plain http (intranet).
 * Renders nothing.
 */
export function ClipboardFallback() {
  useEffect(() => {
    installClipboardFallback();
  }, []);
  return null;
}
