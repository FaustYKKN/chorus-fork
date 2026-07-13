// Clipboard fallback for insecure contexts.
//
// `navigator.clipboard` only exists on secure origins (HTTPS or localhost).
// Intranet deployments are typically reached over plain http://<ip>:<port>,
// where the API is undefined — every copy button on the site (including the
// markdown code-block button that Streamdown renders) silently does nothing.
//
// installClipboardFallback() defines a minimal `navigator.clipboard.writeText`
// backed by the legacy textarea + document.execCommand("copy") path, which
// still works on insecure origins as long as it runs inside a user gesture
// (all our call sites are click handlers). On secure origins the native API
// is present and this is a no-op.

function legacyCopyText(text: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    // Keep it out of view without display:none (which would make it unselectable).
    textarea.style.position = "fixed";
    textarea.style.top = "0";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);

    const selection = document.getSelection();
    const previousRange =
      selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;

    textarea.select();
    textarea.setSelectionRange(0, text.length);

    let succeeded = false;
    try {
      succeeded = document.execCommand("copy");
    } finally {
      textarea.remove();
      if (previousRange && selection) {
        selection.removeAllRanges();
        selection.addRange(previousRange);
      }
    }

    if (succeeded) resolve();
    else reject(new Error("document.execCommand('copy') failed"));
  });
}

export function installClipboardFallback(): void {
  if (typeof navigator === "undefined" || typeof document === "undefined") return;
  // lib.dom types clipboard as always-present; at runtime it is undefined on
  // insecure origins, which is exactly the case this fallback exists for.
  const clipboard = (navigator as Navigator & { clipboard?: Clipboard }).clipboard;
  if (clipboard && typeof clipboard.writeText === "function") return; // secure context — native API wins

  try {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: legacyCopyText },
      configurable: true,
    });
  } catch {
    // Navigator refused the property — callers using optional chaining degrade
    // as before; nothing else we can do without a secure origin.
  }
}
