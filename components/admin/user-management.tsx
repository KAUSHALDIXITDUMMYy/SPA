"use client"

import type React from "react"

import { useState, useEffect, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { createUser, getAllUsers, updateUserStatus, resetUserPassword } from "@/lib/admin"
import type { UserProfile, UserRole } from "@/lib/auth"
import { Plus, Users, UserCheck, UserX, Shield, Video, Eye, ChevronDown, ChevronUp, KeyRound } from "lucide-react"
import { db } from "@/lib/firebase"
import { collection, onSnapshot } from "firebase/firestore"
import { toast } from "@/hooks/use-toast"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { useIsMobile } from "@/hooks/use-mobile"
import { useAuth } from "@/hooks/use-auth"

// Utility function to convert Firestore Timestamp to Date
const convertTimestampToDate = (timestamp: any): Date | null => {
  if (!timestamp) return null
  
  // If it's already a Date object
  if (timestamp instanceof Date) {
    return timestamp
  }
  
  // If it's a Firestore Timestamp with toDate method
  if (timestamp && typeof timestamp.toDate === 'function') {
    return timestamp.toDate()
  }
  
  // If it's a Firestore Timestamp object with seconds and nanoseconds
  if (timestamp && typeof timestamp.seconds === 'number') {
    return new Date(timestamp.seconds * 1000)
  }
  
  // Try to parse as string or number
  try {
    const date = new Date(timestamp)
    if (!isNaN(date.getTime())) {
      return date
    }
  } catch (e) {
    console.error('Error converting timestamp:', timestamp, e)
  }
  
  return null
}

// Utility function to sort users alphabetically
const sortUsersAlphabetically = (users: (UserProfile & { id: string })[]) => {
  return [...users].sort((a, b) => {
    const nameA = (a.displayName || a.email).toLowerCase()
    const nameB = (b.displayName || b.email).toLowerCase()
    return nameA.localeCompare(nameB)
  })
}

export function UserManagement() {
  const { user, userProfile } = useAuth()
  const [users, setUsers] = useState<(UserProfile & { id: string })[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [createLoading, setCreateLoading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [statsOpen, setStatsOpen] = useState(false)
  const isMobile = useIsMobile()

  // Create user form state
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [role, setRole] = useState<UserRole>("subscriber")
  const [displayName, setDisplayName] = useState("")

  // Password reset state
  const [resetPasswordUserId, setResetPasswordUserId] = useState<string | null>(null)
  const [resetPasswordEmail, setResetPasswordEmail] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [resetPasswordLoading, setResetPasswordLoading] = useState(false)

  useEffect(() => {
    loadUsers()
    
    // Set up real-time listener for users
    const usersRef = collection(db, "users")
    const unsubscribe = onSnapshot(usersRef, (snapshot) => {
      const usersData = snapshot.docs.map((doc) => {
        const data = doc.data()
        return {
          id: doc.id,
          ...data,
          // Convert Firestore Timestamps to JS Date objects
          createdAt: convertTimestampToDate(data.createdAt) || new Date(),
          lastLoginAt: convertTimestampToDate(data.lastLoginAt) || undefined,
        }
      }) as (UserProfile & { id: string })[]
      
      // Sort by createdAt
      const sorted = usersData.sort((a: any, b: any) => {
        const dateA = a.createdAt instanceof Date ? a.createdAt : new Date(a.createdAt)
        const dateB = b.createdAt instanceof Date ? b.createdAt : new Date(b.createdAt)
        return dateB.getTime() - dateA.getTime()
      })
      
      setUsers(sorted)
      setLoading(false)
    })
    
    return () => unsubscribe()
  }, [])

  const loadUsers = async () => {
    setLoading(true)
    const usersData = await getAllUsers()
    setUsers(usersData as (UserProfile & { id: string })[])
    setLoading(false)
  }

  const emailExists = useMemo(
    () => users.some((u) => u.email.toLowerCase() === email.trim().toLowerCase()) && email.trim(),
    [users, email]
  )

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault()
    if (emailExists) {
      setError("A user with this email already exists")
      return
    }
    setCreateLoading(true)
    setError("")
    setSuccess("")

    const result = await createUser(email, password, role, displayName)

    if (result.error) {
      setError(result.error)
    } else if (result.user) {
      setSuccess(`User created successfully! ${email} can now log in with their credentials.`)
      setEmail("")
      setPassword("")
      setDisplayName("")
      setRole("subscriber")
      setShowCreateForm(false)
      loadUsers()
    }

    setCreateLoading(false)
  }

  const handleToggleUserStatus = async (userId: string, currentStatus: boolean) => {
    const result = await updateUserStatus(userId, !currentStatus)
    if (result.success) {
      // Don't call loadUsers() - the real-time listener will automatically update the state
      // This prevents page refresh and scroll position reset
      const user = users.find(u => u.id === userId)
      toast({
        title: "Status Updated",
        description: `${user?.email || "User"} has been ${!currentStatus ? "activated" : "deactivated"}.`,
      })
    } else {
      const errorMessage = result.error || "Failed to update user status"
      setError(errorMessage)
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      })
    }
  }

  const handleResetPassword = async () => {
    if (!resetPasswordUserId || !user?.uid) {
      toast({
        title: "Error",
        description: "Missing required information",
        variant: "destructive",
      })
      return
    }

    if (!newPassword || newPassword.length < 6) {
      toast({
        title: "Error",
        description: "Password must be at least 6 characters long",
        variant: "destructive",
      })
      return
    }

    if (newPassword !== confirmPassword) {
      toast({
        title: "Error",
        description: "Passwords do not match",
        variant: "destructive",
      })
      return
    }

    setResetPasswordLoading(true)

    try {
      const result = await resetUserPassword(resetPasswordUserId, newPassword, user.uid)

      if (result.success) {
        toast({
          title: "Success",
          description: result.message || `Password reset successfully for ${resetPasswordEmail}`,
        })
        setResetPasswordUserId(null)
        setResetPasswordEmail("")
        setNewPassword("")
        setConfirmPassword("")
      } else {
        toast({
          title: "Error",
          description: result.error || "Failed to reset password",
          variant: "destructive",
        })
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to reset password",
        variant: "destructive",
      })
    } finally {
      setResetPasswordLoading(false)
    }
  }

  const openResetPasswordDialog = (userId: string, userEmail: string) => {
    setResetPasswordUserId(userId)
    setResetPasswordEmail(userEmail)
    setNewPassword("")
    setConfirmPassword("")
  }

  const getRoleBadgeVariant = (role: UserRole) => {
    switch (role) {
      case "admin":
        return "destructive"
      case "publisher":
        return "default"
      case "subscriber":
        return "secondary"
      default:
        return "outline"
    }
  }

  // Separate and sort users by role
  const usersByRole = useMemo(() => {
    const admins = sortUsersAlphabetically(users.filter((u) => u.role === "admin"))
    const publishers = sortUsersAlphabetically(users.filter((u) => u.role === "publisher"))
    const subscribers = sortUsersAlphabetically(users.filter((u) => u.role === "subscriber"))
    return { admins, publishers, subscribers }
  }, [users])

  const getStats = () => {
    const total = users.length
    const active = users.filter((u) => u.isActive).length
    const byRole = users.reduce(
      (acc, user) => {
        acc[user.role] = (acc[user.role] || 0) + 1
        return acc
      },
      {} as Record<UserRole, number>,
    )

    return { total, active, byRole }
  }

  const stats = getStats()

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards - Collapsible on Mobile */}
      <Collapsible 
        open={isMobile ? statsOpen : true} 
        onOpenChange={setStatsOpen}
        className="md:!block"
      >
        <CollapsibleTrigger asChild className="md:hidden w-full mb-2">
          <Button variant="outline" className="w-full justify-between">
            <span className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Statistics
            </span>
            {statsOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="md:!block">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center space-x-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Total Users</p>
                    <p className="text-2xl font-bold">{stats.total}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center space-x-2">
                  <UserCheck className="h-4 w-4 text-green-600" />
                  <div>
                    <p className="text-sm font-medium">Active Users</p>
                    <p className="text-2xl font-bold">{stats.active}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div>
                  <p className="text-sm font-medium">Publishers</p>
                  <p className="text-2xl font-bold">{stats.byRole.publisher || 0}</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div>
                  <p className="text-sm font-medium">Subscribers</p>
                  <p className="text-2xl font-bold">{stats.byRole.subscriber || 0}</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Create User Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>User Management</CardTitle>
              <CardDescription>Create and manage user accounts for Sportsmagician Audio</CardDescription>
            </div>
            <Button onClick={() => setShowCreateForm(!showCreateForm)}>
              <Plus className="h-4 w-4 mr-2" />
              Create User
            </Button>
          </div>
        </CardHeader>

        {showCreateForm && (
          <CardContent className="border-t">
            <form onSubmit={handleCreateUser} className="space-y-4 max-w-md">
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className={emailExists ? "border-destructive" : ""}
                  />
                  {emailExists && (
                    <p className="text-xs text-destructive">This email is already registered</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="displayName">Display Name</Label>
                  <Input
                    id="displayName"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Optional"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="role">Role</Label>
                  <Select value={role} onValueChange={(value: UserRole) => setRole(value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="publisher">Publisher</SelectItem>
                      <SelectItem value="subscriber">Subscriber</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-2">
                <Button type="submit" disabled={createLoading || emailExists}>
                  {createLoading ? "Creating..." : "Create User"}
                </Button>
                <Button type="button" variant="outline" onClick={() => setShowCreateForm(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        )}
      </Card>

      {/* Users Table with Tabs by Role */}
      <Card>
        <CardHeader>
          <CardTitle>Users by Role</CardTitle>
          <CardDescription>View and manage users organized by their roles (sorted alphabetically)</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="all" className="space-y-4">
            <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 h-auto overflow-x-auto">
              <TabsTrigger value="all" className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 py-2 sm:py-1.5 text-xs sm:text-sm">
                <Users className="h-3 w-3 sm:h-4 sm:w-4" />
                <span className="hidden xs:inline">All Users</span>
                <span className="xs:hidden">All</span>
                <span className="text-xs">({users.length})</span>
              </TabsTrigger>
              <TabsTrigger value="admins" className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 py-2 sm:py-1.5 text-xs sm:text-sm">
                <Shield className="h-3 w-3 sm:h-4 sm:w-4" />
                <span className="hidden xs:inline">Admins</span>
                <span className="xs:hidden">Admin</span>
                <span className="text-xs">({usersByRole.admins.length})</span>
              </TabsTrigger>
              <TabsTrigger value="publishers" className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 py-2 sm:py-1.5 text-xs sm:text-sm">
                <Video className="h-3 w-3 sm:h-4 sm:w-4" />
                <span className="hidden xs:inline">Publishers</span>
                <span className="xs:hidden">Pub</span>
                <span className="text-xs">({usersByRole.publishers.length})</span>
              </TabsTrigger>
              <TabsTrigger value="subscribers" className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 py-2 sm:py-1.5 text-xs sm:text-sm">
                <Eye className="h-3 w-3 sm:h-4 sm:w-4" />
                <span className="hidden xs:inline">Subscribers</span>
                <span className="xs:hidden">Sub</span>
                <span className="text-xs">({usersByRole.subscribers.length})</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="all">
              <UserTable 
                users={sortUsersAlphabetically(users)} 
                onToggleStatus={handleToggleUserStatus} 
                getRoleBadgeVariant={getRoleBadgeVariant}
                onResetPassword={openResetPasswordDialog}
              />
            </TabsContent>

            <TabsContent value="admins">
              {usersByRole.admins.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No admins found</div>
              ) : (
                <UserTable 
                  users={usersByRole.admins} 
                  onToggleStatus={handleToggleUserStatus} 
                  getRoleBadgeVariant={getRoleBadgeVariant}
                  onResetPassword={openResetPasswordDialog}
                />
              )}
            </TabsContent>

            <TabsContent value="publishers">
              {usersByRole.publishers.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No publishers found</div>
              ) : (
                <UserTable 
                  users={usersByRole.publishers} 
                  onToggleStatus={handleToggleUserStatus} 
                  getRoleBadgeVariant={getRoleBadgeVariant}
                  onResetPassword={openResetPasswordDialog}
                />
              )}
            </TabsContent>

            <TabsContent value="subscribers">
              {usersByRole.subscribers.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No subscribers found</div>
              ) : (
                <UserTable 
                  users={usersByRole.subscribers} 
                  onToggleStatus={handleToggleUserStatus} 
                  getRoleBadgeVariant={getRoleBadgeVariant}
                  onResetPassword={openResetPasswordDialog}
                />
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Password Reset Dialog */}
      <Dialog open={resetPasswordUserId !== null} onOpenChange={(open) => !open && setResetPasswordUserId(null)}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Reset Password</DialogTitle>
            <DialogDescription>
              Reset password for {resetPasswordEmail}. The new password must be at least 6 characters long.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="newPassword">New Password</Label>
              <Input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new password"
                disabled={resetPasswordLoading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
                disabled={resetPasswordLoading}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setResetPasswordUserId(null)
                setNewPassword("")
                setConfirmPassword("")
              }}
              disabled={resetPasswordLoading}
            >
              Cancel
            </Button>
            <Button onClick={handleResetPassword} disabled={resetPasswordLoading}>
              {resetPasswordLoading ? "Resetting..." : "Reset Password"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// Reusable User Table Component
function UserTable({
  users,
  onToggleStatus,
  getRoleBadgeVariant,
  onResetPassword,
}: {
  users: (UserProfile & { id: string })[]
  onToggleStatus: (userId: string, currentStatus: boolean) => void
  getRoleBadgeVariant: (role: UserRole) => any
  onResetPassword: (userId: string, userEmail: string) => void
}) {
  return (
    <div className="overflow-x-auto -mx-4 sm:mx-0">
      <div className="inline-block min-w-full align-middle px-4 sm:px-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[150px]">Email</TableHead>
              <TableHead className="hidden sm:table-cell min-w-[120px]">Display Name</TableHead>
              <TableHead className="min-w-[80px]">Role</TableHead>
              <TableHead className="min-w-[100px]">Status</TableHead>
              <TableHead className="hidden md:table-cell min-w-[120px]">Created</TableHead>
              <TableHead className="min-w-[80px]">Active</TableHead>
              <TableHead className="min-w-[100px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.id}>
                <TableCell className="font-medium">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-1 sm:gap-2">
                    <span className="break-words">{user.email}</span>
                    {(user as any).isPending && (
                      <Badge variant="outline" className="text-xs bg-yellow-50 text-yellow-700 border-yellow-300 whitespace-nowrap">
                        Pending
                      </Badge>
                    )}
                  </div>
                  <div className="sm:hidden text-xs text-muted-foreground mt-1">
                    {user.displayName || "No name"}
                  </div>
                </TableCell>
                <TableCell className="hidden sm:table-cell">{user.displayName || "-"}</TableCell>
                <TableCell>
                  <Badge variant={getRoleBadgeVariant(user.role)} className="text-xs">{user.role}</Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center space-x-1 sm:space-x-2">
                    {(user as any).isPending ? (
                      <>
                        <div className="h-3 w-3 sm:h-4 sm:w-4 rounded-full bg-yellow-400 animate-pulse flex-shrink-0" />
                        <span className="text-xs sm:text-sm text-yellow-600 hidden sm:inline">Pending Login</span>
                        <span className="text-xs text-yellow-600 sm:hidden">Pending</span>
                      </>
                    ) : user.isActive ? (
                      <>
                        <UserCheck className="h-3 w-3 sm:h-4 sm:w-4 text-green-600 flex-shrink-0" />
                        <span className="text-xs sm:text-sm text-green-600">Active</span>
                      </>
                    ) : (
                      <>
                        <UserX className="h-3 w-3 sm:h-4 sm:w-4 text-red-600 flex-shrink-0" />
                        <span className="text-xs sm:text-sm text-red-600">Inactive</span>
                      </>
                    )}
                  </div>
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  {(() => {
                    const date = convertTimestampToDate(user.createdAt)
                    if (!date) return "-"
                    try {
                      return (
                        <div className="flex flex-col">
                          <span className="font-medium text-xs sm:text-sm">{date.toLocaleDateString()}</span>
                          <span className="text-xs text-muted-foreground">{date.toLocaleTimeString()}</span>
                        </div>
                      )
                    } catch (e) {
                      return "-"
                    }
                  })()}
                </TableCell>
                <TableCell>
                  {(user as any).isPending ? (
                    <span className="text-xs text-muted-foreground">
                      Waiting
                    </span>
                  ) : (
                    <Switch
                      checked={user.isActive}
                      onCheckedChange={() => onToggleStatus(user.id, user.isActive)}
                    />
                  )}
                </TableCell>
                <TableCell>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onResetPassword(user.id, user.email)}
                    className="h-8 text-xs"
                  >
                    <KeyRound className="h-3 w-3 mr-1" />
                    <span className="hidden sm:inline">Reset Password</span>
                    <span className="sm:hidden">Reset</span>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

