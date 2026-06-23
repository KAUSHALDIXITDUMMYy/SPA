"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { ProtectedRoute } from "@/components/auth/protected-route"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ArrowLeft, RefreshCw } from "lucide-react"
import { fetchWithAuth } from "@/lib/client/authenticated-fetch"

interface LogRow {
  id: string
  ip?: string
  host?: string
  href?: string
  referrer?: string
  userAgent?: string
  country?: string
  city?: string
  suspicious?: boolean
  createdAt?: any
}

export default function AccessLogsPage() {
  const router = useRouter()
  const [rows, setRows] = useState<LogRow[]>([])
  const [loading, setLoading] = useState(true)
  const [onlyForeign, setOnlyForeign] = useState(true)

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetchWithAuth("/api/access-logs?limit=500", { method: "GET" })
      if (res.ok) {
        const json = await res.json()
        setRows((json.logs || []) as LogRow[])
      } else {
        setRows([])
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const visible = onlyForeign ? rows.filter((r) => r.suspicious) : rows
  const fmt = (ts: any) => {
    try {
      const d = ts?.toDate ? ts.toDate() : new Date(ts)
      return d.toLocaleString()
    } catch {
      return "-"
    }
  }

  return (
    <ProtectedRoute allowedRoles={["admin"]}>
      <div className="min-h-screen bg-muted/30 py-6 px-4">
        <div className="max-w-6xl mx-auto space-y-4">
          <Button variant="ghost" size="sm" onClick={() => router.push("/admin")} className="-ml-2">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>

          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <CardTitle>Access Logs</CardTitle>
                  <CardDescription>
                    Visitors recorded by our own beacon. Rows marked <strong>foreign</strong> were served from a domain
                    that isn&apos;t yours — i.e. a clone/proxy of your site.
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setOnlyForeign((v) => !v)}>
                    {onlyForeign ? "Show all" : "Show foreign only"}
                  </Button>
                  <Button variant="outline" size="sm" onClick={load} disabled={loading}>
                    <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} />
                    Refresh
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p>
              ) : visible.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  {onlyForeign ? "No foreign (cloned-domain) hits recorded yet." : "No logs yet."}
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>When</TableHead>
                        <TableHead>Host (domain)</TableHead>
                        <TableHead>IP</TableHead>
                        <TableHead>Location</TableHead>
                        <TableHead>User agent</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visible.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="whitespace-nowrap text-xs">{fmt(r.createdAt)}</TableCell>
                          <TableCell className="text-xs">
                            <span className="break-all">{r.host || "-"}</span>
                            {r.suspicious && (
                              <Badge variant="destructive" className="ml-2">
                                foreign
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-xs font-mono">{r.ip || "-"}</TableCell>
                          <TableCell className="text-xs">{[r.city, r.country].filter(Boolean).join(", ") || "-"}</TableCell>
                          <TableCell className="text-xs max-w-[260px] truncate" title={r.userAgent}>
                            {r.userAgent || "-"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </ProtectedRoute>
  )
}
