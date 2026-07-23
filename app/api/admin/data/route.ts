import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/server/api-auth"
import { resolveUserTenant } from "@/lib/tenant"
import * as adminData from "@/lib/server/admin-data"

/**
 * Admin-only data operations. Dispatches on `action`. The browser calls this via
 * fetchWithAuth; the Admin SDK does the actual Firestore work so the client never
 * touches the database directly.
 */
export async function POST(req: NextRequest) {
  const profile = await requireAdmin(req)
  if (profile instanceof NextResponse) return profile

  const viewer = { role: profile.role, email: profile.email }
  const creator = { tenant: resolveUserTenant(viewer), role: profile.role }

  let body: { action?: string; payload?: any }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const { action, payload = {} } = body

  try {
    switch (action) {
      case "createUser":
        return NextResponse.json(
          await adminData.createUser({
            email: payload.email,
            password: payload.password,
            role: payload.role,
            displayName: payload.displayName,
            creator,
          }),
        )
      case "getAllUsers":
        return NextResponse.json(
          await adminData.getAllUsersPage(viewer, {
            limit: payload.limit,
            cursor: payload.cursor,
          }),
        )
      case "getUsersByRole":
        return NextResponse.json(
          await adminData.getUsersByRolePage(payload.role, viewer, {
            limit: payload.limit,
            cursor: payload.cursor,
          }),
        )
      case "searchUsersByRole":
        return NextResponse.json(
          await adminData.searchUsersByRole(payload.role, payload.query || "", viewer, {
            limit: payload.limit,
          }),
        )
      case "updateUserStatus":
        return NextResponse.json(await adminData.updateUserStatus(payload.userId, payload.isActive))
      case "updateUserChatPermission":
        return NextResponse.json(
          await adminData.updateUserChatPermission(payload.userId, payload.allowChat),
        )
      case "updatePublisherZoomMapping":
        return NextResponse.json(
          await adminData.updatePublisherZoomMapping(payload.userId, payload.updates),
        )
      case "logoutAllUsers":
        return NextResponse.json(await adminData.logoutAllUsers(viewer))
      case "createStreamPermission":
        return NextResponse.json(await adminData.createStreamPermission(payload.permission))
      case "getStreamPermissions":
        return NextResponse.json(
          await adminData.getStreamPermissionsPage(viewer, {
            limit: payload.limit,
            cursor: payload.cursor,
          }),
        )
      case "getStreamPermissionsForSubscriberIds":
        return NextResponse.json({
          permissions: await adminData.getStreamPermissionsForSubscriberIds(
            payload.subscriberIds || [],
            viewer,
          ),
        })
      case "updateStreamPermission":
        return NextResponse.json(
          await adminData.updateStreamPermission(payload.permissionId, payload.updates),
        )
      case "deleteStreamPermission":
        return NextResponse.json(await adminData.deleteStreamPermission(payload.permissionId))
      case "createStreamAssignment":
        return NextResponse.json(await adminData.createStreamAssignment(payload.assignment))
      case "bulkCreateStreamAssignments":
        return NextResponse.json(
          await adminData.bulkCreateStreamAssignments({
            subscriberIds: payload.subscriberIds || [],
            streamSessionIds: payload.streamSessionIds || [],
          }),
        )
      case "bulkDeleteStreamAssignments":
        return NextResponse.json(
          await adminData.bulkDeleteStreamAssignments({
            subscriberIds: payload.subscriberIds || [],
            streamSessionIds: payload.streamSessionIds || [],
            clearAllActiveStreams: payload.clearAllActiveStreams === true,
          }),
        )
      case "getStreamAssignments":
        return NextResponse.json({ assignments: await adminData.getStreamAssignments(viewer) })
      case "getStreamAssignmentsForSubscriberIds":
        return NextResponse.json({
          assignments: await adminData.getStreamAssignmentsForSubscriberIds(
            payload.subscriberIds || [],
            viewer,
          ),
        })
      case "getStreamAssignmentsBootstrap":
        return NextResponse.json(
          await adminData.getStreamAssignmentsBootstrap(viewer, {
            limit: payload.limit,
            cursor: payload.cursor,
          }),
        )
      case "deleteStreamAssignment":
        return NextResponse.json(await adminData.deleteStreamAssignment(payload.assignmentId))
      case "updateStreamAssignment":
        return NextResponse.json(
          await adminData.updateStreamAssignment(payload.assignmentId, payload.updates),
        )
      case "getContactMessages":
        return NextResponse.json(
          await adminData.getContactMessagesPage({
            limit: payload.limit,
            cursor: payload.cursor,
          }),
        )
      case "markContactMessageRead":
        return NextResponse.json(await adminData.markContactMessageRead(payload.messageId))
      case "createAdminBroadcast":
        return NextResponse.json(
          await adminData.createAdminBroadcast({
            message: payload.message,
            createdByUid: profile.uid,
            createdByName: payload.createdByName,
            targetTenant: payload.targetTenant,
          }),
        )
      case "getReports":
        return NextResponse.json(
          await adminData.getReportsPage({
            limit: payload.limit,
            cursor: payload.cursor,
          }),
        )
      case "resolveReport":
        return NextResponse.json(await adminData.resolveReport(payload.reportId, profile.uid))
      case "getBlockEvents":
        return NextResponse.json(
          await adminData.getBlockEventsPage({
            limit: payload.limit,
            cursor: payload.cursor,
          }),
        )
      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
    }
  } catch (error: any) {
    console.error(`[api/admin/data] action=${action} failed:`, error)
    return NextResponse.json({ error: error?.message || "Operation failed" }, { status: 500 })
  }
}
