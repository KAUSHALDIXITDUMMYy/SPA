"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Switch } from "@/components/ui/switch"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { permissionsManager, getPermissionSummary } from "@/lib/permissions"
import { updateStreamPermission, deleteStreamPermission, getUsersByRole, type StreamPermission } from "@/lib/admin"
import type { UserProfile } from "@/lib/auth"
import { Users, Shield, Trash2, Activity } from "lucide-react"

export function RealTimePermissions() {
  const [permissions, setPermissions] = useState<StreamPermission[]>([])
  const [publishers, setPublishers] = useState<(UserProfile & { id: string })[]>([])
  const [subscribers, setSubscribers] = useState<(UserProfile & { id: string })[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")

  useEffect(() => {
    loadUsers()

    // Set up real-time permissions listener
    const unsubscribe = permissionsManager.subscribeToAllPermissions((updatedPermissions) => {
      setPermissions(updatedPermissions)
      setLoading(false)
    })

    return () => {
      unsubscribe()
    }
  }, [])

  const loadUsers = async () => {
    const [publishersData, subscribersData] = await Promise.all([
      getUsersByRole("publisher"),
      getUsersByRole("subscriber"),
    ])

    // Sort alphabetically
    const sortUsers = (users: any[]) => {
      return users.sort((a, b) => {
        const nameA = (a.displayName || a.email).toLowerCase()
        const nameB = (b.displayName || b.email).toLowerCase()
        return nameA.localeCompare(nameB)
      })
    }

    setPublishers(sortUsers(publishersData as (UserProfile & { id: string })[]))
    setSubscribers(sortUsers(subscribersData as (UserProfile & { id: string })[]))
  }

  const getPublisherName = (publisherId: string) => {
    const publisher = publishers.find((p) => p.id === publisherId)
    return publisher?.displayName || publisher?.email || "Unknown"
  }

  const getSubscriberName = (subscriberId: string) => {
    const subscriber = subscribers.find((s) => s.id === subscriberId)
    return subscriber?.displayName || subscriber?.email || "Unknown"
  }

  const handleTogglePermissionStatus = async (permissionId: string, currentStatus: boolean) => {
    const result = await updateStreamPermission(permissionId, { isActive: !currentStatus })
    if (result.success) {
      setSuccess("Permission status updated")
      setTimeout(() => setSuccess(""), 3000)
    } else {
      setError(result.error || "Failed to update permission")
      setTimeout(() => setError(""), 5000)
    }
  }

  const handleToggleVideo = async (permissionId: string, currentValue: boolean) => {
    const result = await updateStreamPermission(permissionId, { allowVideo: !currentValue })
    if (result.success) {
      setSuccess("Video permission updated")
      setTimeout(() => setSuccess(""), 3000)
    } else {
      setError(result.error || "Failed to update video permission")
      setTimeout(() => setError(""), 5000)
    }
  }

  const handleToggleAudio = async (permissionId: string, currentValue: boolean) => {
    const result = await updateStreamPermission(permissionId, { allowAudio: !currentValue })
    if (result.success) {
      setSuccess("Audio permission updated")
      setTimeout(() => setSuccess(""), 3000)
    } else {
      setError(result.error || "Failed to update audio permission")
      setTimeout(() => setError(""), 5000)
    }
  }

  const handleDeletePermission = async (permissionId: string) => {
    if (confirm("Are you sure you want to delete this permission?")) {
      const result = await deleteStreamPermission(permissionId)
      if (result.success) {
        setSuccess("Permission deleted")
        setTimeout(() => setSuccess(""), 3000)
      } else {
        setError(result.error || "Failed to delete permission")
        setTimeout(() => setError(""), 5000)
      }
    }
  }

  const getStats = () => {
    const total = permissions.length
    const active = permissions.filter((p) => p.isActive).length
    const videoEnabled = permissions.filter((p) => p.allowVideo && p.isActive).length
    const audioEnabled = permissions.filter((p) => p.allowAudio && p.isActive).length
    return { total, active, videoEnabled, audioEnabled }
  }

  const stats = getStats()

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center p-8">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading permissions...</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Real-time Status Indicator */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Activity className="h-5 w-5 text-green-500" />
              <CardTitle>Real-Time Permissions Monitor</CardTitle>
              <Badge variant="outline" className="animate-pulse">
                Live Updates
              </Badge>
            </div>
          </div>
          <CardDescription>Permissions are updated in real-time across all connected clients</CardDescription>
        </CardHeader>
      </Card>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Shield className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Total Permissions</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Users className="h-4 w-4 text-green-600" />
              <div>
                <p className="text-sm font-medium">Active</p>
                <p className="text-2xl font-bold">{stats.active}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div>
              <p className="text-sm font-medium">Video Enabled</p>
              <p className="text-2xl font-bold">{stats.videoEnabled}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div>
              <p className="text-sm font-medium">Audio Enabled</p>
              <p className="text-2xl font-bold">{stats.audioEnabled}</p>
            </div>
          </CardContent>
        </Card>

      </div>

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

      {/* Permissions Table */}
      <Card>
        <CardHeader>
          <CardTitle>Live Permissions Management</CardTitle>
          <CardDescription>All changes are applied instantly to connected users</CardDescription>
        </CardHeader>
        <CardContent>
          {permissions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Shield className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No permissions configured</p>
              <p className="text-sm">Create permissions in the Stream Permissions tab</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Publisher</TableHead>
                  <TableHead>Subscriber</TableHead>
                  <TableHead>Access Level</TableHead>
                  <TableHead>Video</TableHead>
                  <TableHead>Audio</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {permissions.map((permission) => (
                  <TableRow key={permission.id}>
                    <TableCell className="font-medium">{getPublisherName(permission.publisherId)}</TableCell>
                    <TableCell>{getSubscriberName(permission.subscriberId)}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{getPermissionSummary(permission)}</Badge>
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={permission.allowVideo}
                        onCheckedChange={() => handleToggleVideo(permission.id!, permission.allowVideo)}
                      />
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={permission.allowAudio}
                        onCheckedChange={() => handleToggleAudio(permission.id!, permission.allowAudio)}
                      />
                    </TableCell>
                    <TableCell>
                      <Badge variant={permission.isActive ? "default" : "secondary"}>
                        {permission.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-2">
                        <Switch
                          checked={permission.isActive}
                          onCheckedChange={() => handleTogglePermissionStatus(permission.id!, permission.isActive)}
                        />
                        <Button variant="outline" size="sm" onClick={() => handleDeletePermission(permission.id!)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
