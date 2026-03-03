"use client"

import { useEffect, useState } from "react"
import {
  getReports,
  getBlockEvents,
  resolveReport,
  updateUserStatus,
  type Report,
  type BlockEvent,
} from "@/lib/admin"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { useAuth } from "@/hooks/use-auth"
import { Flag, UserX, Ban, RefreshCw, Clock } from "lucide-react"
import { toast } from "@/hooks/use-toast"

export function ReportsModeration() {
  const { userProfile } = useAuth()
  const [reports, setReports] = useState<Report[]>([])
  const [blockEvents, setBlockEvents] = useState<BlockEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [actingId, setActingId] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    const [r, b] = await Promise.all([getReports(), getBlockEvents()])
    setReports(r)
    setBlockEvents(b)
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const handleResolve = async (reportId: string) => {
    if (!userProfile?.uid) return
    setActingId(reportId)
    const { success, error } = await resolveReport(reportId, userProfile.uid)
    setActingId(null)
    if (success) {
      setReports((prev) => prev.map((x) => (x.id === reportId ? { ...x, status: "resolved" as const } : x)))
      toast({ title: "Report resolved" })
    } else {
      toast({ title: "Error", description: error, variant: "destructive" })
    }
  }

  const handleDeactivateUser = async (report: Report) => {
    const uid = report.reportedUserId
    if (!uid) return
    setActingId(report.id!)
    const { success, error } = await updateUserStatus(uid, false)
    setActingId(null)
    if (success) {
      toast({ title: "User deactivated", description: "Consider resolving the report after taking action." })
    } else {
      toast({ title: "Error", description: error, variant: "destructive" })
    }
  }

  const formatDate = (d: Date | undefined) => {
    if (!d) return "—"
    const date = d instanceof Date ? d : new Date(d)
    return date.toLocaleString()
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Loading reports and block events...
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <Alert className="border-amber-500/50 bg-amber-500/10">
        <Clock className="h-4 w-4" />
        <AlertDescription>
          <strong>Moderation process:</strong> We act on reports within <strong>24 hours</strong>. Remove objectionable content, deactivate or remove offending accounts as appropriate, then mark the report resolved.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Flag className="h-5 w-5" />
              Reports (flagged content / users)
            </CardTitle>
            <CardDescription>Review and act on user reports. Deactivate users or remove content, then mark resolved.</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </CardHeader>
        <CardContent>
          {reports.length === 0 ? (
            <p className="text-muted-foreground text-center py-6">No reports yet.</p>
          ) : (
            <ScrollArea className="h-[320px] pr-4">
              <div className="space-y-3">
                {reports.map((r) => (
                  <Card key={r.id} className={r.status === "pending" ? "border-l-4 border-l-destructive" : ""}>
                    <CardHeader className="py-3 px-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="font-medium">{r.reason}</p>
                          <p className="text-xs text-muted-foreground">
                            By {r.reporterName} {r.reporterEmail && `(${r.reporterEmail})`} · {formatDate(r.createdAt)}
                          </p>
                          {r.reportedUserName && (
                            <p className="text-sm mt-1">
                              Reported: <strong>{r.reportedUserName}</strong>
                              {r.reportedUserId && (
                                <span className="text-muted-foreground"> ({r.reportedUserId})</span>
                              )}
                            </p>
                          )}
                          {r.contentType !== "user" && r.contentId && (
                            <p className="text-xs text-muted-foreground">Content: {r.contentType} · {r.contentId}</p>
                          )}
                          {r.details && (
                            <p className="text-sm text-muted-foreground mt-1">{r.details}</p>
                          )}
                        </div>
                        <Badge variant={r.status === "resolved" ? "secondary" : "destructive"}>
                          {r.status}
                        </Badge>
                      </div>
                    </CardHeader>
                    {r.status === "pending" && (
                      <CardContent className="py-0 px-4 pb-3 flex flex-wrap gap-2">
                        {r.reportedUserId && (
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleDeactivateUser(r)}
                            disabled={!!actingId}
                          >
                            <UserX className="h-3 w-3 mr-1" />
                            Deactivate user
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleResolve(r.id!)}
                          disabled={!!actingId}
                        >
                          Mark resolved
                        </Button>
                      </CardContent>
                    )}
                  </Card>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Ban className="h-5 w-5" />
            Block events (when a user blocks another)
          </CardTitle>
          <CardDescription>You are notified when someone blocks a user. No action required unless you also receive a report.</CardDescription>
        </CardHeader>
        <CardContent>
          {blockEvents.length === 0 ? (
            <p className="text-muted-foreground text-center py-6">No block events yet.</p>
          ) : (
            <ScrollArea className="h-[240px] pr-4">
              <div className="space-y-2">
                {blockEvents.map((e) => (
                  <div
                    key={e.id}
                    className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"
                  >
                    <span>
                      <strong>{e.blockerName}</strong> blocked <strong>{e.blockedUserName}</strong>
                    </span>
                    <span className="text-muted-foreground text-xs">{formatDate(e.createdAt)}</span>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
