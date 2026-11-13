import { typedApi } from './classroomClient'
import type { components } from './classroomTypes'

const activity: Promise<components['schemas']['ActivityTeacherView']> = typedApi('/activities/a1', 'GET')
const deleted: Promise<null> = typedApi('/activities/a1', 'DELETE')
const joined: Promise<components['schemas']['RoomView']> = typedApi('/classrooms/join', 'POST', { code: 'ABCDEF', alias: 'A', avatar: 'owl' })
void activity
void deleted
void joined
const activityJoin: Promise<components['schemas']['ActivityJoinResult']> = typedApi('/activities/a1/join', 'POST', { display_name: 'A' })
void activityJoin

// @ts-expect-error DELETE has no JSON body
typedApi('/activities/a1', 'DELETE', { title: 'x' })
// @ts-expect-error static join route does not support GET
typedApi('/classrooms/join', 'GET')
// @ts-expect-error unknown method for this path
typedApi('/activities/a1', 'TRACE')
// @ts-expect-error required POST body
typedApi('/classrooms/join', 'POST')
// @ts-expect-error unknown field in request body
typedApi('/classrooms/join', 'POST', { wrong: true })
