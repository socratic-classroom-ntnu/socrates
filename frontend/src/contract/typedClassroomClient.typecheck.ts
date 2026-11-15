import { typedApi } from './classroomClient'
import type { components } from './classroomTypes'

const activity: Promise<components['schemas']['ActivityTeacherView']> = typedApi('/activities/{activity_id}', 'GET', { path: { activity_id: 'a1' } })
const deleted: Promise<null> = typedApi('/activities/{activity_id}', 'DELETE', { path: { activity_id: 'a1' } })
const joined: Promise<components['schemas']['RoomView']> = typedApi('/classrooms/join', 'POST', { body: { code: 'ABCDEF', alias: 'A' } })
void activity
void deleted
void joined
const activityJoin: Promise<components['schemas']['ActivityJoinResult']> = typedApi('/activities/{activity_id}/join', 'POST', { path: { activity_id: 'a1' }, body: { display_name: 'A' } })
void activityJoin
typedApi('/solo/attempts/{attempt_id}/{action}', 'POST', { path: { attempt_id: 'a1', action: 'retry' } })
typedApi('/classrooms/{room_id}/budget', 'POST', { path: { room_id: 'r1' }, query: { live_llm_call_budget: 3 } })

// @ts-expect-error DELETE has no JSON body
typedApi('/activities/{activity_id}', 'DELETE', { path: { activity_id: 'a1' }, body: { title: 'x' } })
// @ts-expect-error static join route does not support GET
typedApi('/classrooms/join', 'GET')
// @ts-expect-error unknown method for this path
typedApi('/activities/{activity_id}', 'TRACE')
// @ts-expect-error required POST body
typedApi('/classrooms/join', 'POST')
// @ts-expect-error unknown field in request body
typedApi('/classrooms/join', 'POST', { body: { wrong: true } })
// @ts-expect-error action is a literal union, not an arbitrary segment
typedApi('/activities/{activity_id}/{action}', 'POST', { path: { activity_id: 'a1', action: 'garbage' } })
// @ts-expect-error required query parameter
typedApi('/classrooms/{room_id}/budget', 'POST', { path: { room_id: 'r1' } })
// @ts-expect-error YAML requires its dedicated transport helper
typedApi('/scripts/{script_id}/yaml', 'GET', { path: { script_id: 's1' } })
