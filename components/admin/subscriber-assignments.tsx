"use client"

import { useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Checkbox } from "@/components/ui/checkbox"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { getUsersByRole, getStreamPermissions, createStreamPermission, deleteStreamPermission, updateStreamPermission, type StreamPermission } from "@/lib/admin"
import type { UserProfile } from "@/lib/auth"
import { permissionsManager } from "@/lib/permissions"
import { Video, Volume2, X, Users, Link2, Unlink, CheckSquare, Square, Grid3x3, List, ArrowRightLeft, Loader2, CheckCircle2 } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

export function SubscriberAssignments() {
  const [subscribers, setSubscribers] = useState<(UserProfile & { id: string })[]>([])
  const [publishers, setPublishers] = useState<(UserProfile & { id: string })[]>([])
  const [selectedSubscribers, setSelectedSubscribers] = useState<Set<string>>(new Set())
  const [selectedPublishers, setSelectedPublishers] = useState<Set<string>>(new Set())
  const [searchSubs, setSearchSubs] = useState("")
  const [searchPubs, setSearchPubs] = useState("")
  const [loading, setLoading] = useState(true)
  const [bulkLoading, setBulkLoading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [allPermissions, setAllPermissions] = useState<Map<string, StreamPermission[]>>(new Map())
  const [viewMode, setViewMode] = useState<"list" | "matrix">("matrix")

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const [subs, pubs] = await Promise.all([getUsersByRole("subscriber"), getUsersByRole("publisher")])
      setSubscribers(subs as any)
      setPublishers(pubs as any)
      setLoading(false)
    }
    load()
  }, [])

  // Load all permissions for all subscribers
  useEffect(() => {
    const unsubscribes: (() => void)[] = []
    
    subscribers.forEach((sub) => {
      const unsubscribe = permissionsManager.subscribeToUserPermissions(sub.id, (perms) => {
        setAllPermissions((prev) => new Map(prev).set(sub.id, perms))
      })
      unsubscribes.push(unsubscribe)
    })

    return () => unsubscribes.forEach((u) => u())
  }, [subscribers])

  const filteredSubscribers = useMemo(() => {
    const q = searchSubs.trim().toLowerCase()
    const filtered = q ? subscribers.filter((s) => (s.displayName || s.email).toLowerCase().includes(q)) : subscribers
    // Sort alphabetically
    return filtered.sort((a, b) => {
      const nameA = (a.displayName || a.email).toLowerCase()
      const nameB = (b.displayName || b.email).toLowerCase()
      return nameA.localeCompare(nameB)
    })
  }, [searchSubs, subscribers])

  const filteredPublishers = useMemo(() => {
    const q = searchPubs.trim().toLowerCase()
    const filtered = q ? publishers.filter((p) => (p.displayName || p.email).toLowerCase().includes(q)) : publishers
    // Sort alphabetically
    return filtered.sort((a, b) => {
      const nameA = (a.displayName || a.email).toLowerCase()
      const nameB = (b.displayName || b.email).toLowerCase()
      return nameA.localeCompare(nameB)
    })
  }, [searchPubs, publishers])

  // Check if subscriber has publisher assigned
  const isAssigned = (subscriberId: string, publisherId: string) => {
    const perms = allPermissions.get(subscriberId) || []
    return perms.some((p) => p.publisherId === publisherId)
  }

  // Get permission for subscriber-publisher pair
  const getPermission = (subscriberId: string, publisherId: string) => {
    const perms = allPermissions.get(subscriberId) || []
    return perms.find((p) => p.publisherId === publisherId)
  }

  // Toggle single assignment
  const toggleAssignment = async (subscriberId: string, publisherId: string, nextAssigned: boolean) => {
    setError("")
    setSuccess("")

    const perm = getPermission(subscriberId, publisherId)
    try {
      if (nextAssigned) {
        if (!perm) {
          await createStreamPermission({
            publisherId,
            subscriberId,
            allowVideo: true,
            allowAudio: true,
            isActive: true,
          })
        } else if (!perm.isActive) {
          await updateStreamPermission(perm.id!, { isActive: true })
        }
      } else {
        if (perm) {
          await deleteStreamPermission(perm.id!)
        }
      }
    } catch (e: any) {
      setError(e?.message || "Operation failed")
    }
  }

  // Bulk assign selected subscribers to selected publishers
  const bulkAssign = async () => {
    if (selectedSubscribers.size === 0 || selectedPublishers.size === 0) {
      setError("Please select at least one subscriber and one publisher")
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
        selectedPublishers.forEach((pubId) => {
          const perm = getPermission(subId, pubId)
          if (!perm) {
            promises.push(
              createStreamPermission({
                publisherId: pubId,
                subscriberId: subId,
                allowVideo: true,
                allowAudio: true,
                isActive: true,
              })
            )
            newAssignments++
          } else if (!perm.isActive) {
            promises.push(updateStreamPermission(perm.id!, { isActive: true }))
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
      setSelectedPublishers(new Set())
    } catch (e: any) {
      setError(e?.message || "Bulk assignment failed")
    } finally {
      setBulkLoading(false)
    }
  }

  // Bulk unassign
  const bulkUnassign = async () => {
    if (selectedSubscribers.size === 0 || selectedPublishers.size === 0) {
      setError("Please select at least one subscriber and one publisher")
      return
    }

    setBulkLoading(true)
    setError("")
    setSuccess("")
    
    try {
      const promises: Promise<any>[] = []
      selectedSubscribers.forEach((subId) => {
        selectedPublishers.forEach((pubId) => {
          const perm = getPermission(subId, pubId)
          if (perm) {
            promises.push(deleteStreamPermission(perm.id!))
          }
        })
      })
      
      await Promise.all(promises)
      setSuccess(`Unassigned ${selectedSubscribers.size} subscriber(s) from ${selectedPublishers.size} publisher(s)`)
      setSelectedSubscribers(new Set())
      setSelectedPublishers(new Set())
    } catch (e: any) {
      setError(e?.message || "Bulk unassignment failed")
    } finally {
      setBulkLoading(false)
    }
  }

  // Assign ALL subscribers to ALL publishers
  const assignAllToAll = async () => {
    if (!confirm(`This will assign ALL ${subscribers.length} subscribers to ALL ${publishers.length} publishers. Continue?`)) {
      return
    }

    setBulkLoading(true)
    setError("")
    setSuccess("")
    
    try {
      const promises: Promise<any>[] = []
      subscribers.forEach((sub) => {
        publishers.forEach((pub) => {
          const perm = getPermission(sub.id, pub.id)
          if (!perm) {
            promises.push(
              createStreamPermission({
                publisherId: pub.id,
                subscriberId: sub.id,
                allowVideo: true,
                allowAudio: true,
                isActive: true,
              })
            )
          } else if (!perm.isActive) {
            promises.push(updateStreamPermission(perm.id!, { isActive: true }))
          }
        })
      })
      
      await Promise.all(promises)
      setSuccess(`Assigned all ${subscribers.length} subscribers to all ${publishers.length} publishers!`)
    } catch (e: any) {
      setError(e?.message || "Operation failed")
    } finally {
      setBulkLoading(false)
    }
  }

  // Toggle subscriber selection
  const toggleSubscriberSelection = (id: string) => {
    const newSet = new Set(selectedSubscribers)
    if (newSet.has(id)) {
      newSet.delete(id)
    } else {
      newSet.add(id)
    }
    setSelectedSubscribers(newSet)
  }

  // Toggle publisher selection
  const togglePublisherSelection = (id: string) => {
    const newSet = new Set(selectedPublishers)
    if (newSet.has(id)) {
      newSet.delete(id)
    } else {
      newSet.add(id)
    }
    setSelectedPublishers(newSet)
  }

  // Select/deselect all filtered subscribers
  const toggleAllSubscribers = () => {
    if (selectedSubscribers.size === filteredSubscribers.length) {
      setSelectedSubscribers(new Set())
    } else {
      setSelectedSubscribers(new Set(filteredSubscribers.map((s) => s.id)))
    }
  }

  // Select/deselect all filtered publishers
  const toggleAllPublishers = () => {
    if (selectedPublishers.size === filteredPublishers.length) {
      setSelectedPublishers(new Set())
    } else {
      setSelectedPublishers(new Set(filteredPublishers.map((p) => p.id)))
    }
  }

  // Get assigned publishers for a subscriber
  const getAssignedPublishersForSubscriber = (subscriberId: string) => {
    const perms = allPermissions.get(subscriberId) || []
    return perms.filter((p) => p.isActive).map((p) => p.publisherId)
  }

  // Get assigned subscribers for a publisher
  const getAssignedSubscribersForPublisher = (publisherId: string) => {
    const assignedSubIds: string[] = []
    allPermissions.forEach((perms, subId) => {
      if (perms.some((p) => p.publisherId === publisherId && p.isActive)) {
        assignedSubIds.push(subId)
      }
    })
    return assignedSubIds
  }

  // Get publisher name by ID
  const getPublisherName = (publisherId: string) => {
    const pub = publishers.find((p) => p.id === publisherId)
    return pub?.displayName || pub?.email || "Unknown"
  }

  // Get subscriber name by ID
  const getSubscriberName = (subscriberId: string) => {
    const sub = subscribers.find((s) => s.id === subscriberId)
    return sub?.displayName || sub?.email || "Unknown"
  }

  // Check if publisher is already assigned to ANY selected subscriber
  const isPublisherAssignedToSelectedSubs = (publisherId: string) => {
    if (selectedSubscribers.size === 0) return 0
    let assignedCount = 0
    selectedSubscribers.forEach((subId) => {
      if (isAssigned(subId, publisherId)) {
        assignedCount++
      }
    })
    return assignedCount
  }

  // Check if subscriber is already assigned to ANY selected publisher
  const isSubscriberAssignedToSelectedPubs = (subscriberId: string) => {
    if (selectedPublishers.size === 0) return 0
    let assignedCount = 0
    selectedPublishers.forEach((pubId) => {
      if (isAssigned(subscriberId, pubId)) {
        assignedCount++
      }
    })
    return assignedCount
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">Loading...</CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* View Mode Switcher */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Stream Assignments</CardTitle>
              <CardDescription>Assign subscribers to publishers with bulk operations</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant={viewMode === "list" ? "default" : "outline"}
                size="sm"
                onClick={() => setViewMode("list")}
              >
                <List className="h-4 w-4 mr-2" />
                List View
              </Button>
              <Button
                variant={viewMode === "matrix" ? "default" : "outline"}
                size="sm"
                onClick={() => setViewMode("matrix")}
              >
                <Grid3x3 className="h-4 w-4 mr-2" />
                Matrix View
              </Button>
            </div>
          </div>
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
                <Video className="h-4 w-4 mr-1" />
                {selectedPublishers.size} Publishers
              </Badge>
            </div>
            
            <div className="flex-1 hidden sm:block" />
            
            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
              <Button
                onClick={bulkAssign}
                disabled={bulkLoading || selectedSubscribers.size === 0 || selectedPublishers.size === 0}
                className="bg-green-600 hover:bg-green-700 flex-1 sm:flex-initial"
                size="sm"
              >
                {bulkLoading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Link2 className="h-4 w-4 mr-2" />
                )}
                <span className="hidden xs:inline">Assign Selected</span>
                <span className="xs:hidden">Assign</span>
              </Button>
              
              <Button
                onClick={bulkUnassign}
                disabled={bulkLoading || selectedSubscribers.size === 0 || selectedPublishers.size === 0}
                variant="destructive"
                className="flex-1 sm:flex-initial"
                size="sm"
              >
                {bulkLoading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Unlink className="h-4 w-4 mr-2" />
                )}
                <span className="hidden xs:inline">Unassign Selected</span>
                <span className="xs:hidden">Unassign</span>
              </Button>

              <Button
                onClick={assignAllToAll}
                disabled={bulkLoading}
                variant="outline"
                className="border-2 border-orange-500 text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950/20 w-full sm:w-auto"
                size="sm"
              >
                {bulkLoading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <ArrowRightLeft className="h-4 w-4 mr-2" />
                )}
                <span className="hidden sm:inline">Assign All to All</span>
                <span className="sm:hidden">Assign All</span>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* List View */}
      {viewMode === "list" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Subscribers Panel */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Subscribers</CardTitle>
                  <CardDescription>Select subscribers for bulk assignment</CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={toggleAllSubscribers}
                >
                  {selectedSubscribers.size === filteredSubscribers.length ? (
                    <>
                      <Square className="h-4 w-4 mr-2" />
                      Deselect All
                    </>
                  ) : (
                    <>
                      <CheckSquare className="h-4 w-4 mr-2" />
                      Select All
                    </>
                  )}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input
                placeholder="Search subscribers..."
                value={searchSubs}
                onChange={(e) => setSearchSubs(e.target.value)}
              />
              <ScrollArea className="h-[500px]">
                <div className="space-y-2">
                  {filteredSubscribers.map((s) => {
                    const assignedPubs = getAssignedPublishersForSubscriber(s.id)
                    const assignedToSelectedPubs = isSubscriberAssignedToSelectedPubs(s.id)
                    return (
                      <div
                        key={s.id}
                        className={`flex items-start gap-3 p-3 rounded border cursor-pointer transition-all ${
                          selectedSubscribers.has(s.id)
                            ? "bg-primary/10 border-primary shadow-sm"
                            : "hover:bg-muted"
                        }`}
                        onClick={() => toggleSubscriberSelection(s.id)}
                      >
                        <Checkbox
                          checked={selectedSubscribers.has(s.id)}
                          onCheckedChange={() => toggleSubscriberSelection(s.id)}
                          className="mt-1"
                        />
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <div className="font-medium truncate">{s.displayName || s.email}</div>
                              {assignedToSelectedPubs > 0 && selectedPublishers.size > 0 && (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <div className="flex items-center gap-1">
                                        <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0" />
                                        {assignedToSelectedPubs === selectedPublishers.size ? (
                                          <Badge variant="default" className="bg-green-600 text-xs shrink-0">
                                            All Assigned
                                          </Badge>
                                        ) : (
                                          <Badge variant="secondary" className="text-xs shrink-0">
                                            {assignedToSelectedPubs}/{selectedPublishers.size}
                                          </Badge>
                                        )}
                                      </div>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p>Already assigned to {assignedToSelectedPubs} of {selectedPublishers.size} selected publisher(s)</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}
                            </div>
                            <Badge variant={s.isActive ? "default" : "outline"} className="shrink-0">
                              {s.isActive ? "Active" : "Inactive"}
                            </Badge>
                          </div>
                          <div className="text-xs text-muted-foreground truncate">{s.email}</div>
                          {assignedPubs.length > 0 ? (
                            <div className="flex flex-wrap gap-1 mt-2">
                              <span className="text-xs font-medium text-green-600 dark:text-green-400">
                                Assigned to {assignedPubs.length} publisher{assignedPubs.length > 1 ? "s" : ""}:
                              </span>
                              {assignedPubs.slice(0, 2).map((pubId) => (
                                <Badge key={pubId} variant="secondary" className="text-xs">
                                  {getPublisherName(pubId)}
                                </Badge>
                              ))}
                              {assignedPubs.length > 2 && (
                                <Badge variant="secondary" className="text-xs">
                                  +{assignedPubs.length - 2} more
                                </Badge>
                              )}
                            </div>
                          ) : (
                            <div className="text-xs text-muted-foreground italic mt-1">
                              No publishers assigned
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Publishers Panel */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Publishers</CardTitle>
                  <CardDescription>Select publishers for bulk assignment</CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={toggleAllPublishers}
                >
                  {selectedPublishers.size === filteredPublishers.length ? (
                    <>
                      <Square className="h-4 w-4 mr-2" />
                      Deselect All
                    </>
                  ) : (
                    <>
                      <CheckSquare className="h-4 w-4 mr-2" />
                      Select All
                    </>
                  )}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input
                placeholder="Search publishers..."
                value={searchPubs}
                onChange={(e) => setSearchPubs(e.target.value)}
              />
              <ScrollArea className="h-[500px]">
                <div className="space-y-2">
                  {filteredPublishers.map((p) => {
                    const assignedSubs = getAssignedSubscribersForPublisher(p.id)
                    const assignedToSelectedSubs = isPublisherAssignedToSelectedSubs(p.id)
                    return (
                      <div
                        key={p.id}
                        className={`flex items-start gap-3 p-3 rounded border cursor-pointer transition-all ${
                          selectedPublishers.has(p.id)
                            ? "bg-primary/10 border-primary shadow-sm"
                            : "hover:bg-muted"
                        }`}
                        onClick={() => togglePublisherSelection(p.id)}
                      >
                        <Checkbox
                          checked={selectedPublishers.has(p.id)}
                          onCheckedChange={() => togglePublisherSelection(p.id)}
                          className="mt-1"
                        />
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <div className="font-medium truncate">{p.displayName || p.email}</div>
                              {assignedToSelectedSubs > 0 && selectedSubscribers.size > 0 && (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <div className="flex items-center gap-1">
                                        <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0" />
                                        {assignedToSelectedSubs === selectedSubscribers.size ? (
                                          <Badge variant="default" className="bg-green-600 text-xs shrink-0">
                                            All Assigned
                                          </Badge>
                                        ) : (
                                          <Badge variant="secondary" className="text-xs shrink-0">
                                            {assignedToSelectedSubs}/{selectedSubscribers.size}
                                          </Badge>
                                        )}
                                      </div>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p>Already assigned to {assignedToSelectedSubs} of {selectedSubscribers.size} selected subscriber(s)</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}
                            </div>
                            <Badge variant={p.isActive ? "default" : "outline"} className="shrink-0">
                              {p.isActive ? "Active" : "Inactive"}
                            </Badge>
                          </div>
                          <div className="text-xs text-muted-foreground truncate">{p.email}</div>
                          {assignedSubs.length > 0 ? (
                            <div className="flex flex-wrap gap-1 mt-2">
                              <span className="text-xs font-medium text-blue-600 dark:text-blue-400">
                                Has {assignedSubs.length} subscriber{assignedSubs.length > 1 ? "s" : ""}:
                              </span>
                              {assignedSubs.slice(0, 2).map((subId) => (
                                <Badge key={subId} variant="secondary" className="text-xs">
                                  {getSubscriberName(subId)}
                                </Badge>
                              ))}
                              {assignedSubs.length > 2 && (
                                <Badge variant="secondary" className="text-xs">
                                  +{assignedSubs.length - 2} more
                                </Badge>
                              )}
                            </div>
                          ) : (
                            <div className="text-xs text-muted-foreground italic mt-1">
                              No subscribers assigned
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Matrix View */}
      {viewMode === "matrix" && (
        <Card>
          <CardHeader>
            <CardTitle>Assignment Matrix</CardTitle>
            <CardDescription>
              Click checkboxes to toggle individual assignments. Rows = Subscribers, Columns = Publishers
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row gap-3">
                <Input
                  placeholder="Search subscribers..."
                  value={searchSubs}
                  onChange={(e) => setSearchSubs(e.target.value)}
                  className="flex-1"
                />
                <Input
                  placeholder="Search publishers..."
                  value={searchPubs}
                  onChange={(e) => setSearchPubs(e.target.value)}
                  className="flex-1"
                />
              </div>
              
              <div className="border rounded-lg overflow-hidden">
                <div className="overflow-auto max-h-[600px]" style={{ scrollbarWidth: 'thin' }}>
                  <div className="inline-block min-w-full">
                    <table className="w-full border-collapse">
                      <thead className="sticky top-0 bg-background z-10">
                        <tr>
                          <th className="border p-2 text-left bg-muted font-semibold min-w-[200px] sticky left-0 z-20 bg-muted">
                            <div className="truncate text-xs sm:text-sm">Subscriber \ Publisher</div>
                          </th>
                          {filteredPublishers.map((p) => (
                            <th
                              key={p.id}
                              className="border p-2 text-left bg-muted font-medium min-w-[150px]"
                            >
                              <div className="truncate text-xs" title={p.displayName || p.email}>
                                {p.displayName || p.email}
                              </div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filteredSubscribers.map((s) => (
                          <tr key={s.id} className="hover:bg-muted/50">
                            <td className="border p-2 font-medium bg-muted/50 sticky left-0 z-10 bg-muted/50">
                              <div className="truncate text-xs sm:text-sm" title={s.displayName || s.email}>
                                {s.displayName || s.email}
                              </div>
                            </td>
                            {filteredPublishers.map((p) => {
                              const assigned = isAssigned(s.id, p.id)
                              return (
                                <td key={p.id} className="border p-2 text-center">
                                  <div className="flex items-center justify-center">
                                    <Checkbox
                                      checked={assigned}
                                      onCheckedChange={(v) => toggleAssignment(s.id, p.id, Boolean(v))}
                                    />
                                  </div>
                                </td>
                              )
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}


