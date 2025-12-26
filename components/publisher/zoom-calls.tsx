"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { useAuth } from "@/hooks/use-auth"
import { db } from "@/lib/firebase"
import { collection, onSnapshot, query, where, orderBy, updateDoc, doc, deleteDoc } from "firebase/firestore"
import { createZoomCall, type ZoomCall } from "@/lib/zoom"
import { ExternalLink } from "lucide-react"

export function PublisherZoomCalls() {
  const { user } = useAuth()
  const [title, setTitle] = useState("")
  const [url, setUrl] = useState("")
  const [description, setDescription] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [calls, setCalls] = useState<ZoomCall[]>([])
  const [endingOthers, setEndingOthers] = useState(false)

  useEffect(() => {
    if (!user) return
    const qCalls = query(
      collection(db, "zoomCalls"),
      where("publisherId", "==", user.uid),
      orderBy("createdAt", "desc"),
    )
    const unsub = onSnapshot(
      qCalls,
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as ZoomCall[]
        setCalls(rows)
      },
      (e) => setError(e?.message || "Failed to load Zoom calls"),
    )
    return () => unsub()
  }, [user])

  const canCreate = Boolean(user && title.trim())

  const handleCreate = async () => {
    if (!user) return
    setLoading(true)
    setError("")
    try {
      const res = await fetch("/api/zoom/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          publisherId: user.uid,
          title: title.trim(),
          description: description.trim() || undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || "Failed to create meeting")
      setTitle("")
      setUrl("")
      setDescription("")
    } catch (e: any) {
      setError(e?.message || "Failed to create Zoom call")
    }
    setLoading(false)
  }

  const endOtherMeetings = async () => {
    setEndingOthers(true)
    setError("")
    try {
      await fetch("/api/zoom/end-live", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: "me" }),
      })
    } catch (e: any) {
      setError(e?.message || "Failed to end other meetings")
    }
    setEndingOthers(false)
  }

  const toggleActive = async (call: ZoomCall) => {
    if (!call.id) return
    try {
      await updateDoc(doc(db, "zoomCalls", call.id), { isActive: !call.isActive } as any)
    } catch (e: any) {
      setError(e?.message || "Failed to update call")
    }
  }

  const removeCall = async (call: ZoomCall) => {
    if (!call.id) return
    try {
      await deleteDoc(doc(db, "zoomCalls", call.id))
    } catch (e: any) {
      setError(e?.message || "Failed to delete call")
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Zoom Calls</CardTitle>
        <CardDescription className="flex items-center justify-between">
          <span>Create a Zoom call entry. Admin can assign subscribers; subscribers can join quickly.</span>
          <Button variant="outline" size="sm" onClick={endOtherMeetings} disabled={endingOthers}>
            {endingOthers ? "Ending…" : "End other meetings"}
          </Button>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <div className="hidden md:block"></div>
          <Button onClick={handleCreate} disabled={!canCreate || loading}>{loading ? "Creating..." : "Create Meeting"}</Button>
        </div>
        <Textarea rows={3} placeholder="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} />

        <div className="space-y-3">
          {calls.length === 0 ? (
            <div className="text-sm text-muted-foreground">No Zoom calls yet.</div>
          ) : (
            calls.map((c) => (
              <div key={c.id} className="flex items-center justify-between p-3 border rounded">
                <div className="min-w-0">
                  <div className="font-medium truncate">{c.title}</div>
                  {c.description && <div className="text-xs text-muted-foreground truncate">{c.description}</div>}
                  {c.meetingNumber && (
                    <div className="text-xs text-muted-foreground truncate">Meeting ID: {c.meetingNumber}</div>
                  )}
                  <div className="mt-1">
                    <Badge variant={c.isActive ? "default" : "outline"}>{c.isActive ? "Active" : "Inactive"}</Badge>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button asChild variant="outline" size="sm">
                    <a href={`/zoom/${c.id}`}>
                      <ExternalLink className="h-4 w-4 mr-2" /> Join
                    </a>
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => toggleActive(c)}>
                    {c.isActive ? "Deactivate" : "Activate"}
                  </Button>
                  <Button variant="destructive" size="sm" onClick={() => removeCall(c)}>Delete</Button>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  )
}

