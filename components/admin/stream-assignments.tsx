"use client"

import { useEffect, useMemo, useState, useCallback, memo } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { 
  getUsersByRole, 
  getAllStreams, 
  createStreamAssignment, 
  deleteStreamAssignment, 
  updateStreamAssignment,
  getStreamAssignments,
  type StreamAssignment 
} from "@/lib/admin"
import { getAllStreams as getAllStreamSessions, type StreamSession } from "@/lib/streaming"
import type { UserProfile } from "@/lib/auth"
import { Radio, Users, Loader2, CheckCircle2, Search, X, ChevronDown, ChevronUp, Mail, Grid3x3 } from "lucide-react"

// Memoized matrix cell to prevent unnecessary re-renders
const MatrixCell = memo(({ 
  assigned, 
  onToggle 
}: { 
  assigned: boolean
  onToggle: () => void 
}) => (
  <td className="border p-1 text-center">
    <Checkbox
      checked={assigned}
      onCheckedChange={onToggle}
      className="h-4 w-4"
    />
  </td>
))

MatrixCell.displayName = "MatrixCell"

export function StreamAssignments() {
  const [subscribers, setSubscribers] = useState<(UserProfile & { id: string })[]>([])
  const [streams, setStreams] = useState<StreamSession[]>([])
  const [selectedSubscribers, setSelectedSubscribers] = useState<Set<string>>(new Set())
  const [selectedStreams, setSelectedStreams] = useState<Set<string>>(new Set())
  const [searchSubs, setSearchSubs] = useState("")
  const [searchStreams, setSearchStreams] = useState("")
  const [loading, setLoading] = useState(true)
  const [bulkLoading, setBulkLoading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [allAssignments, setAllAssignments] = useState<Map<string, StreamAssignment[]>>(new Map())
  const [matrixExpanded, setMatrixExpanded] = useState(false)
  const [bulkEmailDialogOpen, setBulkEmailDialogOpen] = useState(false)
  const [bulkEmailSearch, setBulkEmailSearch] = useState("")
  const [bulkEmailSelectedStreams, setBulkEmailSelectedStreams] = useState<Set<string>>(new Set())

  // Load data only once
  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const [subs, allStreams] = await Promise.all([
          getUsersByRole("subscriber"),
          getAllStreamSessions()
        ])
        setSubscribers(subs as any)
        setStreams(allStreams)
        
        const assignments = await getStreamAssignments()
        const assignmentsMap = new Map<string, StreamAssignment[]>()
        assignments.forEach((assignment) => {
          const existing = assignmentsMap.get(assignment.subscriberId) || []
          assignmentsMap.set(assignment.subscriberId, [...existing, assignment])
        })
        setAllAssignments(assignmentsMap)
      } catch (err: any) {
        setError(err.message || "Failed to load data")
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  // Only refresh assignments when needed (not every 5 seconds)
  const refreshAssignments = useCallback(async () => {
    const assignments = await getStreamAssignments()
    const assignmentsMap = new Map<string, StreamAssignment[]>()
    assignments.forEach((assignment) => {
      const existing = assignmentsMap.get(assignment.subscriberId) || []
      assignmentsMap.set(assignment.subscriberId, [...existing, assignment])
    })
    setAllAssignments(assignmentsMap)
  }, [])

  const filteredSubscribers = useMemo(() => {
    const q = searchSubs.trim().toLowerCase()
    const filtered = q ? subscribers.filter((s) => 
      (s.displayName || s.email).toLowerCase().includes(q)
    ) : subscribers
    return filtered.sort((a, b) => {
      const nameA = (a.displayName || a.email).toLowerCase()
      const nameB = (b.displayName || b.email).toLowerCase()
      return nameA.localeCompare(nameB)
    })
  }, [searchSubs, subscribers])

  const filteredStreams = useMemo(() => {
    // Only show active/live streams
    const activeStreams = streams.filter((s) => s.isActive === true)
    const q = searchStreams.trim().toLowerCase()
    const filtered = q ? activeStreams.filter((s) => 
      (s.title || s.publisherName || s.roomId).toLowerCase().includes(q)
    ) : activeStreams
    return filtered.sort((a, b) => {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    })
  }, [searchStreams, streams])

  // Check if subscriber has stream assigned
  const isAssigned = useCallback((subscriberId: string, streamId: string) => {
    const assignments = allAssignments.get(subscriberId) || []
    return assignments.some((a) => a.streamSessionId === streamId && a.isActive)
  }, [allAssignments])

  // Get assignment for subscriber-stream pair
  const getAssignment = useCallback((subscriberId: string, streamId: string) => {
    const assignments = allAssignments.get(subscriberId) || []
    return assignments.find((a) => a.streamSessionId === streamId)
  }, [allAssignments])

  // Toggle single assignment
  const toggleAssignment = useCallback(async (subscriberId: string, streamId: string, nextAssigned: boolean) => {
    setError("")
    setSuccess("")

    const assignment = getAssignment(subscriberId, streamId)
    try {
      if (nextAssigned) {
        if (!assignment) {
          await createStreamAssignment({
            subscriberId,
            streamSessionId: streamId,
            isActive: true,
          })
          setSuccess("Assignment created successfully")
        } else if (!assignment.isActive) {
          await updateStreamAssignment(assignment.id!, { isActive: true })
          setSuccess("Assignment reactivated")
        }
      } else {
        if (assignment) {
          await deleteStreamAssignment(assignment.id!)
          setSuccess("Assignment removed")
        }
      }
      
      await refreshAssignments()
    } catch (e: any) {
      setError(e?.message || "Operation failed")
    }
  }, [getAssignment, refreshAssignments])

  // Parse bulk emails from textarea
  const parseBulkEmails = useCallback((text: string): string[] => {
    return text
      .split(/[,\n]/)
      .map((email) => email.trim().toLowerCase())
      .filter((email) => email.length > 0 && email.includes("@"))
  }, [])

  // Find subscribers by emails
  const findSubscribersByEmails = useCallback((emails: string[]): string[] => {
    return subscribers
      .filter((sub) => emails.includes(sub.email.toLowerCase()))
      .map((sub) => sub.id)
  }, [subscribers])

  // Bulk assign from email search
  const bulkAssignFromEmails = useCallback(async () => {
    if (!bulkEmailSearch.trim()) {
      setError("Please enter email addresses")
      return
    }

    const emails = parseBulkEmails(bulkEmailSearch)
    if (emails.length === 0) {
      setError("No valid email addresses found")
      return
    }

    const subscriberIds = findSubscribersByEmails(emails)
    if (subscriberIds.length === 0) {
      setError("No subscribers found with those email addresses")
      return
    }

    if (bulkEmailSelectedStreams.size === 0) {
      setError("Please select at least one stream")
      return
    }

    setBulkLoading(true)
    setError("")
    setSuccess("")

    try {
      const promises: Promise<any>[] = []
      let newAssignments = 0
      let reactivated = 0
      let alreadyAssigned = 0

      subscriberIds.forEach((subId) => {
        bulkEmailSelectedStreams.forEach((streamId) => {
          const assignment = getAssignment(subId, streamId)
          if (!assignment) {
            promises.push(
              createStreamAssignment({
                subscriberId: subId,
                streamSessionId: streamId,
                isActive: true,
              })
            )
            newAssignments++
          } else if (!assignment.isActive) {
            promises.push(updateStreamAssignment(assignment.id!, { isActive: true }))
            reactivated++
          } else {
            alreadyAssigned++
          }
        })
      })

      await Promise.all(promises)

      let successMsg = `Assigned ${subscriberIds.length} subscriber(s) to ${bulkEmailSelectedStreams.size} stream(s). `
      if (newAssignments > 0) successMsg += `Created ${newAssignments} new assignment(s). `
      if (reactivated > 0) successMsg += `Reactivated ${reactivated} assignment(s). `
      if (alreadyAssigned > 0) successMsg += `Skipped ${alreadyAssigned} already active assignment(s).`

      setSuccess(successMsg)
      setBulkEmailSearch("")
      setBulkEmailSelectedStreams(new Set())
      setBulkEmailDialogOpen(false)
      
      await refreshAssignments()
    } catch (e: any) {
      setError(e?.message || "Bulk assignment failed")
    } finally {
      setBulkLoading(false)
    }
  }, [bulkEmailSearch, bulkEmailSelectedStreams, parseBulkEmails, findSubscribersByEmails, getAssignment, refreshAssignments])

  // Bulk assign selected subscribers to selected streams
  const bulkAssign = useCallback(async () => {
    if (selectedSubscribers.size === 0 || selectedStreams.size === 0) {
      setError("Please select at least one subscriber and one stream")
      return
    }

    setBulkLoading(true)
    setError("")
    setSuccess("")

    try {
      const promises: Promise<any>[] = []
      let newAssignments = 0
      let reactivated = 0
      let alreadyAssigned = 0

      selectedSubscribers.forEach((subId) => {
        selectedStreams.forEach((streamId) => {
          const assignment = getAssignment(subId, streamId)
          if (!assignment) {
            promises.push(
              createStreamAssignment({
                subscriberId: subId,
                streamSessionId: streamId,
                isActive: true,
              })
            )
            newAssignments++
          } else if (!assignment.isActive) {
            promises.push(updateStreamAssignment(assignment.id!, { isActive: true }))
            reactivated++
          } else {
            alreadyAssigned++
          }
        })
      })

      await Promise.all(promises)

      let successMsg = ""
      if (newAssignments > 0) successMsg += `Created ${newAssignments} new assignment(s). `
      if (reactivated > 0) successMsg += `Reactivated ${reactivated} assignment(s). `
      if (alreadyAssigned > 0) successMsg += `Skipped ${alreadyAssigned} already active assignment(s).`

      setSuccess(successMsg || "No changes needed - all already assigned!")
      setSelectedSubscribers(new Set())
      setSelectedStreams(new Set())
      
      await refreshAssignments()
    } catch (e: any) {
      setError(e?.message || "Bulk assignment failed")
    } finally {
      setBulkLoading(false)
    }
  }, [selectedSubscribers, selectedStreams, getAssignment, refreshAssignments])

  // Bulk unassign
  const bulkUnassign = useCallback(async () => {
    if (selectedSubscribers.size === 0 || selectedStreams.size === 0) {
      setError("Please select at least one subscriber and one stream")
      return
    }

    setBulkLoading(true)
    setError("")
    setSuccess("")

    try {
      const promises: Promise<any>[] = []
      selectedSubscribers.forEach((subId) => {
        selectedStreams.forEach((streamId) => {
          const assignment = getAssignment(subId, streamId)
          if (assignment) {
            promises.push(deleteStreamAssignment(assignment.id!))
          }
        })
      })

      await Promise.all(promises)
      setSuccess(`Unassigned ${selectedSubscribers.size} subscriber(s) from ${selectedStreams.size} stream(s)`)
      setSelectedSubscribers(new Set())
      setSelectedStreams(new Set())
      
      await refreshAssignments()
    } catch (e: any) {
      setError(e?.message || "Bulk unassignment failed")
    } finally {
      setBulkLoading(false)
    }
  }, [selectedSubscribers, selectedStreams, getAssignment, refreshAssignments])

  // Toggle subscriber selection
  const toggleSubscriberSelection = useCallback((id: string) => {
    setSelectedSubscribers((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(id)) {
        newSet.delete(id)
      } else {
        newSet.add(id)
      }
      return newSet
    })
  }, [])

  // Toggle stream selection
  const toggleStreamSelection = useCallback((id: string) => {
    setSelectedStreams((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(id)) {
        newSet.delete(id)
      } else {
        newSet.add(id)
      }
      return newSet
    })
  }, [])

  // Toggle bulk email stream selection
  const toggleBulkEmailStreamSelection = useCallback((id: string) => {
    setBulkEmailSelectedStreams((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(id)) {
        newSet.delete(id)
      } else {
        newSet.add(id)
      }
      return newSet
    })
  }, [])

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin mr-2" />
          <span>Loading streams and subscribers...</span>
        </CardContent>
      </Card>
    )
  }

  const parsedEmails = parseBulkEmails(bulkEmailSearch)
  const foundSubscribers = findSubscribersByEmails(parsedEmails)

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Stream Assignments</CardTitle>
          <CardDescription>
            Assign subscribers directly to streams. Subscribers will have access to the assigned streams.
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Alerts */}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {success && (
        <Alert>
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      )}

      {/* Quick Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Bulk Email Assignment Dialog */}
        <Dialog open={bulkEmailDialogOpen} onOpenChange={setBulkEmailDialogOpen}>
          <DialogTrigger asChild>
            <Button className="w-full h-auto py-6 flex flex-col items-center gap-2">
              <Mail className="h-6 w-6" />
              <div className="text-center">
                <div className="font-semibold">Bulk Email Assignment</div>
                <div className="text-xs text-muted-foreground">Assign multiple subscribers by email</div>
              </div>
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Bulk Email Assignment</DialogTitle>
              <DialogDescription>
                Enter email addresses and select streams to assign them to
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="bulkEmails">Email Addresses</Label>
                <Textarea
                  id="bulkEmails"
                  placeholder="user1@example.com, user2@example.com&#10;user3@example.com"
                  value={bulkEmailSearch}
                  onChange={(e) => setBulkEmailSearch(e.target.value)}
                  rows={4}
                  className="font-mono text-sm"
                />
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>Found: {parsedEmails.length} email(s)</span>
                  {foundSubscribers.length > 0 && (
                    <Badge variant="secondary">{foundSubscribers.length} subscriber(s) found</Badge>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Select Streams</Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[300px] overflow-y-auto p-2 border rounded-lg">
                  {filteredStreams.map((stream) => (
                    <div
                      key={stream.id}
                      className={`flex items-center gap-2 p-2 rounded border cursor-pointer transition-colors ${
                        bulkEmailSelectedStreams.has(stream.id!)
                          ? "bg-primary/10 border-primary"
                          : "hover:bg-muted"
                      }`}
                      onClick={() => toggleBulkEmailStreamSelection(stream.id!)}
                    >
                      <Checkbox
                        checked={bulkEmailSelectedStreams.has(stream.id!)}
                        onCheckedChange={() => toggleBulkEmailStreamSelection(stream.id!)}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">
                          {stream.title || stream.publisherName}
                        </div>
                        <div className="text-xs text-muted-foreground flex items-center gap-2">
                          {stream.isActive ? (
                            <Badge variant="destructive" className="text-xs">LIVE</Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs">Ended</Badge>
                          )}
                          <span className="truncate">{stream.publisherName}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="text-xs text-muted-foreground">
                  {bulkEmailSelectedStreams.size} stream(s) selected
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setBulkEmailDialogOpen(false)
                  setBulkEmailSearch("")
                  setBulkEmailSelectedStreams(new Set())
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={bulkAssignFromEmails}
                disabled={bulkLoading || !bulkEmailSearch.trim() || bulkEmailSelectedStreams.size === 0}
              >
                {bulkLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Assigning...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Assign {foundSubscribers.length > 0 ? `${foundSubscribers.length} ` : ""}Subscriber(s)
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Matrix View Toggle */}
        <Button
          variant="outline"
          className="w-full h-auto py-6 flex flex-col items-center gap-2"
          onClick={() => setMatrixExpanded(!matrixExpanded)}
        >
          <Grid3x3 className="h-6 w-6" />
          <div className="text-center">
            <div className="font-semibold">Matrix View</div>
            <div className="text-xs text-muted-foreground">
              {matrixExpanded ? "Collapse" : "Expand"} assignment matrix
            </div>
          </div>
        </Button>
      </div>

      {/* Bulk Actions Bar */}
      <Card className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950/20 dark:to-purple-950/20">
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="secondary" className="text-sm sm:text-base px-2 sm:px-3 py-1">
                <Users className="h-4 w-4 mr-1" />
                {selectedSubscribers.size} Subscribers
              </Badge>
              <Badge variant="secondary" className="text-sm sm:text-base px-2 sm:px-3 py-1">
                <Radio className="h-4 w-4 mr-1" />
                {selectedStreams.size} Streams
              </Badge>
            </div>

            <div className="flex-1 hidden sm:block" />

            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
              <Button
                onClick={bulkAssign}
                disabled={bulkLoading || selectedSubscribers.size === 0 || selectedStreams.size === 0}
                className="bg-green-600 hover:bg-green-700 flex-1 sm:flex-initial"
                size="sm"
              >
                {bulkLoading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                )}
                <span className="hidden xs:inline">Assign Selected</span>
                <span className="xs:hidden">Assign</span>
              </Button>

              <Button
                onClick={bulkUnassign}
                disabled={bulkLoading || selectedSubscribers.size === 0 || selectedStreams.size === 0}
                variant="destructive"
                className="flex-1 sm:flex-initial"
                size="sm"
              >
                {bulkLoading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <X className="h-4 w-4 mr-2" />
                )}
                <span className="hidden xs:inline">Unassign Selected</span>
                <span className="xs:hidden">Unassign</span>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Collapsible Matrix View */}
      <Collapsible open={matrixExpanded} onOpenChange={setMatrixExpanded}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Assignment Matrix</CardTitle>
                  <CardDescription>
                    Rows = Subscribers, Columns = Streams. Click checkboxes to toggle assignments.
                  </CardDescription>
                </div>
                {matrixExpanded ? (
                  <ChevronUp className="h-5 w-5" />
                ) : (
                  <ChevronDown className="h-5 w-5" />
                )}
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent>
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search subscribers..."
                      value={searchSubs}
                      onChange={(e) => setSearchSubs(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search streams..."
                      value={searchStreams}
                      onChange={(e) => setSearchStreams(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                </div>

                <div className="border rounded-lg overflow-hidden">
                  <div className="overflow-auto max-h-[500px]" style={{ scrollbarWidth: 'thin' }}>
                    <div className="inline-block min-w-full">
                      <table className="w-full border-collapse">
                        <thead className="sticky top-0 bg-background z-10">
                          <tr>
                            <th className="border p-2 text-left bg-muted font-semibold min-w-[200px] sticky left-0 z-20 bg-muted">
                              <div className="flex items-center justify-between">
                                <span className="truncate text-xs sm:text-sm">Subscriber \ Stream</span>
                                <Checkbox
                                  checked={selectedSubscribers.size === filteredSubscribers.length && filteredSubscribers.length > 0}
                                  onCheckedChange={() => {
                                    if (selectedSubscribers.size === filteredSubscribers.length) {
                                      setSelectedSubscribers(new Set())
                                    } else {
                                      setSelectedSubscribers(new Set(filteredSubscribers.map((s) => s.id)))
                                    }
                                  }}
                                />
                              </div>
                            </th>
                            {filteredStreams.slice(0, 50).map((stream) => (
                              <th
                                key={stream.id}
                                className="border p-2 text-left bg-muted font-medium min-w-[150px]"
                              >
                                <div className="flex flex-col gap-1">
                                  <div className="flex items-center justify-between">
                                    <div className="truncate text-xs" title={stream.title || stream.publisherName}>
                                      {stream.title || stream.publisherName}
                                    </div>
                                    <Checkbox
                                      checked={selectedStreams.has(stream.id!)}
                                      onCheckedChange={() => toggleStreamSelection(stream.id!)}
                                      className="h-3 w-3"
                                    />
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                    {stream.isActive ? (
                                      <Badge variant="destructive" className="text-xs">LIVE</Badge>
                                    ) : (
                                      <Badge variant="outline" className="text-xs">Ended</Badge>
                                    )}
                                  </div>
                                </div>
                              </th>
                            ))}
                            {filteredStreams.length > 50 && (
                              <th className="border p-2 text-center bg-muted text-xs text-muted-foreground">
                                +{filteredStreams.length - 50} more
                              </th>
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {filteredSubscribers.slice(0, 100).map((sub) => (
                            <tr key={sub.id} className="hover:bg-muted/50">
                              <td className="border p-2 font-medium bg-muted/50 sticky left-0 z-10 bg-muted/50">
                                <div className="flex items-center justify-between gap-2">
                                  <div className="truncate text-xs sm:text-sm" title={sub.displayName || sub.email}>
                                    {sub.displayName || sub.email}
                                  </div>
                                  <Checkbox
                                    checked={selectedSubscribers.has(sub.id)}
                                    onCheckedChange={() => toggleSubscriberSelection(sub.id)}
                                    className="h-4 w-4"
                                  />
                                </div>
                              </td>
                              {filteredStreams.slice(0, 50).map((stream) => (
                                <MatrixCell
                                  key={stream.id}
                                  assigned={isAssigned(sub.id, stream.id!)}
                                  onToggle={() => toggleAssignment(sub.id, stream.id!, !isAssigned(sub.id, stream.id!))}
                                />
                              ))}
                              {filteredStreams.length > 50 && (
                                <td className="border p-2 text-center text-xs text-muted-foreground">
                                  ...
                                </td>
                              )}
                            </tr>
                          ))}
                          {filteredSubscribers.length > 100 && (
                            <tr>
                              <td colSpan={filteredStreams.length + 1} className="border p-2 text-center text-xs text-muted-foreground bg-muted/50">
                                Showing first 100 subscribers. Use search to find specific ones.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>
    </div>
  )
}
