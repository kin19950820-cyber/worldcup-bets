"use client";

import { useEffect } from "react";

/**
 * Intercepts window.fetch and encodes any header values that contain
 * non-ISO-8859-1 code points (> 255), which the browser Fetch API rejects.
 * Also logs the offending header to the console so we can identify the source.
 */
export function FetchSanitizer() {
  useEffect(() => {
    const originalFetch = window.fetch.bind(window);

    window.fetch = function patchedFetch(
      input: RequestInfo | URL,
      init?: RequestInit
    ): Promise<Response> {
      if (init?.headers) {
        const raw = init.headers;
        const sanitized: Record<string, string> = {};
        let dirty = false;

        const entries: [string, string][] = raw instanceof Headers
          ? Array.from(raw.entries())
          : Array.isArray(raw)
          ? raw as [string, string][]
          : Object.entries(raw as Record<string, string>);

        for (const [name, value] of entries) {
          let hasNonLatin = false;
          for (let i = 0; i < value.length; i++) {
            if (value.charCodeAt(i) > 255) {
              hasNonLatin = true;
              break;
            }
          }
          if (hasNonLatin) {
            dirty = true;
            console.warn(
              `[FetchSanitizer] Header "${name}" contains non-ISO-8859-1 characters — encoding. Value: ${value.substring(0, 80)}`
            );
            sanitized[name] = encodeURIComponent(value);
          } else {
            sanitized[name] = value;
          }
        }

        if (dirty) {
          init = { ...init, headers: sanitized };
        }
      }
      return originalFetch(input, init);
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  return null;
}
