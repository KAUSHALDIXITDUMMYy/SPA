"use client"

import { useEffect } from "react"

/**
 * Phones home to our own /api/track endpoint with the hostname the page is
 * actually being served from. On our real domain this logs our own host; if the
 * site is cloned/proxied onto another domain, this reports that foreign host
 * along with the visitor's IP (captured server-side). All first-party.
 */
export function SiteBeacon() {
  useEffect(() => {
    try {
      const body = JSON.stringify({
        host: window.location.host,
        href: window.location.href,
        referrer: document.referrer || null,
      })
      // Relative URL: if the page is reverse-proxied through another domain, the
      // request is forwarded to our server and we still see it (with their host).
      fetch("/api/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      }).catch(() => {})
    } catch {
      // ignore
    }
  }, [])

  return null
}
