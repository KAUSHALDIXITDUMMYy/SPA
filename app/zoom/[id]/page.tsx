"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { db } from "@/lib/firebase"
import { doc, getDoc } from "firebase/firestore"
import { useAuth } from "@/hooks/use-auth"

function parseZoomUrl(url: string): { meetingNumber: string | null; password: string | null } {
  try {
    const u = new URL(url)
    const pathParts = u.pathname.split("/").filter(Boolean)
    // common: /j/{mn}
    let meetingNumber: string | null = null
    const jIdx = pathParts.findIndex((p) => p === "j")
    if (jIdx !== -1 && pathParts[jIdx + 1]) meetingNumber = pathParts[jIdx + 1]

    const password = u.searchParams.get("pwd") || null
    // fallback: sometimes number is in last segment
    if (!meetingNumber && pathParts.length > 0) {
      const last = pathParts[pathParts.length - 1]
      if (/^\d{9,12}$/.test(last)) meetingNumber = last
    }
    return { meetingNumber, password }
  } catch {
    return { meetingNumber: null, password: null }
  }
}

export default function ZoomMeetingPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { user, userProfile } = useAuth()
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [callTitle, setCallTitle] = useState("")
  const [meetingNumber, setMeetingNumber] = useState<string>("")
  const [password, setPassword] = useState<string>("")
  const [joined, setJoined] = useState(false)
  const [hostId, setHostId] = useState<string>("")

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        if (!id) return
        const ref = doc(db, "zoomCalls", id)
        const snap = await getDoc(ref)
        if (!snap.exists()) {
          setError("Zoom call not found")
          setLoading(false)
          return
        }
        const data = snap.data() as any
        setCallTitle(data?.title || "Zoom Call")
        const storedMeetingNumber: string | undefined = data?.meetingNumber
        const storedPassword: string | undefined = data?.password
        const storedHostId: string | undefined = data?.hostId
        if (storedHostId) setHostId(storedHostId)
        // If not present, try to use publisher mapping
        if (!storedHostId && data?.publisherId) {
          try {
            const pubSnap = await getDoc(doc(db, "users", data.publisherId))
            const pub = pubSnap.exists() ? (pubSnap.data() as any) : null
            if (pub?.zoomUserId) setHostId(pub.zoomUserId)
            else if (pub?.zoomUserEmail) setHostId(pub.zoomUserEmail)
          } catch {}
        }
        if (storedMeetingNumber) {
          if (cancelled) return
          setMeetingNumber(String(storedMeetingNumber))
          setPassword(storedPassword || "")
        } else {
          const parsed = parseZoomUrl(data?.url || data?.joinUrl || "")
          if (!parsed.meetingNumber) {
            setError("Unable to determine meeting number")
            setLoading(false)
            return
          }
          if (cancelled) return
          setMeetingNumber(parsed.meetingNumber)
          setPassword(parsed.password || "")
        }
        setLoading(false)
      } catch (e: any) {
        setError(e?.message || "Failed to load Zoom call")
        setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [id])

  const displayName = useMemo(() => {
    return userProfile?.displayName || userProfile?.email || user?.email || "Guest"
  }, [user, userProfile])

  useEffect(() => {
    let client: any
    let mounted = true
    const join = async () => {
      if (!containerRef.current || !meetingNumber) return
      try {
        const res = await fetch("/api/zoom/signature", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ meetingNumber, role: (userProfile?.role === "publisher" || userProfile?.role === "admin") ? 1 : 0 }),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json?.error || "Failed to get signature")

        const { default: ZoomMtgEmbedded } = await import("@zoom/meetingsdk/embedded")
        client = ZoomMtgEmbedded.createClient()

        await client.init({
          zoomAppRoot: containerRef.current,
          language: "en-US",
          patchJsMedia: true,
        })

        const joinOptions: any = {
          sdkKey: json.sdkKey,
          signature: json.signature,
          meetingNumber,
          password: password || undefined,
          userName: displayName,
          userEmail: user?.email || undefined,
        }
        if (userProfile?.role === "publisher" || userProfile?.role === "admin") {
          try {
            const zakRes = await fetch("/api/zoom/zak", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: hostId || "me" }) })
            const zakJson = await zakRes.json()
            if (zakRes.ok && zakJson?.zak) joinOptions.zak = zakJson.zak
          } catch {}
        }

        await client.join(joinOptions)
        if (mounted) setJoined(true)
      } catch (e: any) {
        const message: string = e?.message || "Failed to join meeting"
        // Handle 'other meetings in progress' by ending and retrying once for hosts
        if ((userProfile?.role === "publisher" || userProfile?.role === "admin") && /other meetings in progress/i.test(message)) {
          try {
            await fetch("/api/zoom/end-live", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: hostId || "me" }) })
            // brief delay then retry once
            await new Promise((r) => setTimeout(r, 1200))
            return await join()
          } catch {}
        }
        if (mounted) setError(message)
      }
    }

    join()
    return () => {
      mounted = false
      try { client?.leave?.() } catch {}
    }
  }, [meetingNumber, password, displayName, user])

  const handleFullscreen = async () => {
    try {
      if (!containerRef.current) return
      if (document.fullscreenElement) {
        await document.exitFullscreen()
      } else {
        await containerRef.current.requestFullscreen()
      }
    } catch {}
  }

  return (
    <div className="flex flex-col h-screen w-screen">
      <div className="flex items-center justify-between px-4 py-2 border-b bg-card">
        <div className="min-w-0">
          <div className="font-semibold truncate">{callTitle || "Zoom Call"}</div>
          <div className="text-xs text-muted-foreground">In-app Zoom meeting</div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => router.back()}>Back</Button>
          <Button variant="outline" onClick={handleFullscreen}>Fullscreen</Button>
        </div>
      </div>

      {error && (
        <div className="px-4 pt-3">
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </div>
      )}

      <div className="relative flex-1 bg-black">
        {loading ? (
          <div className="absolute inset-0 grid place-items-center text-muted-foreground">Loading meeting…</div>
        ) : (
          <div ref={containerRef} className="absolute inset-0" />
        )}
      </div>

      {!joined && !loading && !error && (
        <div className="px-4 py-2 text-xs text-muted-foreground">If the meeting does not load, please refresh this page.</div>
      )}
    </div>
  )
}


