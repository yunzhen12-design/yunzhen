import { prisma } from './db'
import crypto from 'node:crypto'

// 飞书 OAuth 工具：用 code 换取 user_access_token，再获取用户信息
const FEISHU_OPEN_BASE = process.env.FEISHU_OPEN_BASE || 'https://open.feishu.cn'

export interface FeishuUserInfo {
  open_id: string
  union_id?: string
  name: string
  en_name?: string
  avatar_url?: string
  email?: string
  mobile?: string
}

interface AppAccessTokenResp {
  code: number
  msg?: string
  app_access_token?: string
  tenant_access_token?: string
  expire?: number
}

interface TenantAccessTokenResp {
  code: number
  msg?: string
  tenant_access_token?: string
  expire?: number
}

interface FeishuDepartment {
  department_id: string
  name: string
  parent_department_id?: string
  leader_user_id?: string
}

interface DepartmentChildrenResp {
  code: number
  msg?: string
  data?: {
    items?: FeishuDepartment[]
    has_more?: boolean
    page_token?: string
  }
}

interface FeishuContactUser {
  user_id?: string
  open_id?: string
  union_id?: string
  name?: string
  en_name?: string
  email?: string
  mobile?: string
  avatar?: {
    avatar_72?: string
    avatar_240?: string
    avatar_640?: string
    avatar_origin?: string
  }
  department_ids?: string[]
}

interface DepartmentUsersResp {
  code: number
  msg?: string
  data?: {
    items?: FeishuContactUser[]
    has_more?: boolean
    page_token?: string
  }
}

interface FeishuMessageResp {
  code: number
  msg?: string
  data?: unknown
}

interface UserAccessTokenResp {
  code: number
  msg?: string
  data?: {
    access_token: string
    refresh_token?: string
    open_id: string
    union_id?: string
    name?: string
    en_name?: string
    avatar_url?: string
    email?: string
    mobile?: string
    expires_in?: number
  }
}

// 获取应用访问凭证（自建应用使用 app_access_token；ISV 应用使用 tenant_access_token）
export async function getAppAccessToken(): Promise<string> {
  const appId = process.env.FEISHU_APP_ID
  const appSecret = process.env.FEISHU_APP_SECRET
  if (!appId || !appSecret) {
    throw new Error('未配置 FEISHU_APP_ID / FEISHU_APP_SECRET，无法获取飞书 access_token')
  }
  const res = await fetch(`${FEISHU_OPEN_BASE}/open-apis/auth/v3/app_access_token/internal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
  })
  const data = (await res.json()) as AppAccessTokenResp
  if (data.code !== 0 || !data.app_access_token) {
    throw new Error(`获取 app_access_token 失败: ${data.msg || JSON.stringify(data)}`)
  }
  return data.app_access_token
}

// 获取租户访问凭证，用于通讯录、消息等企业级接口
export async function getTenantAccessToken(): Promise<string> {
  const appId = process.env.FEISHU_APP_ID
  const appSecret = process.env.FEISHU_APP_SECRET
  if (!appId || !appSecret) {
    throw new Error('未配置 FEISHU_APP_ID / FEISHU_APP_SECRET，无法获取飞书 tenant_access_token')
  }
  const res = await fetch(`${FEISHU_OPEN_BASE}/open-apis/auth/v3/tenant_access_token/internal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
  })
  const data = (await res.json()) as TenantAccessTokenResp
  if (data.code !== 0 || !data.tenant_access_token) {
    throw new Error(`获取 tenant_access_token 失败: ${data.msg || JSON.stringify(data)}`)
  }
  return data.tenant_access_token
}

// 同步飞书部门。默认从根部门 0 拉取直接子部门，可通过 rootDepartmentId 指定根部门。
export async function syncFeishuDepartments(rootDepartmentId = '0') {
  const tenantToken = await getTenantAccessToken()
  const synced: FeishuDepartment[] = []
  let pageToken = ''

  do {
    const query = new URLSearchParams({
      page_size: '50',
      department_id_type: 'open_department_id',
      user_id_type: 'open_id',
    })
    if (pageToken) query.set('page_token', pageToken)

    const res = await fetch(
      `${FEISHU_OPEN_BASE}/open-apis/contact/v3/departments/${encodeURIComponent(rootDepartmentId)}/children?${query}`,
      { headers: { Authorization: `Bearer ${tenantToken}` } },
    )
    const data = (await res.json()) as DepartmentChildrenResp
    if (data.code !== 0) {
      throw new Error(`同步飞书部门失败: ${data.msg || JSON.stringify(data)}`)
    }

    const items = data.data?.items || []
    synced.push(...items)
    pageToken = data.data?.has_more ? data.data?.page_token || '' : ''
  } while (pageToken)

  for (const department of synced) {
    await prisma.department.upsert({
      where: { feishuDepartmentId: department.department_id },
      update: {
        name: department.name,
        parentId: department.parent_department_id || null,
        leaderUserId: department.leader_user_id || null,
      },
      create: {
        id: `dept_${department.department_id}`,
        name: department.name,
        parentId: department.parent_department_id || null,
        feishuDepartmentId: department.department_id,
        leaderUserId: department.leader_user_id || null,
      },
    })
  }

  return synced
}

export async function syncFeishuUsers(departmentId = '0') {
  const tenantToken = await getTenantAccessToken()
  const synced: FeishuContactUser[] = []
  let pageToken = ''

  do {
    const query = new URLSearchParams({
      department_id: departmentId,
      page_size: '50',
      department_id_type: 'open_department_id',
      user_id_type: 'open_id',
    })
    if (pageToken) query.set('page_token', pageToken)

    const res = await fetch(`${FEISHU_OPEN_BASE}/open-apis/contact/v3/users/find_by_department?${query}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${tenantToken}` },
    })
    const data = (await res.json()) as DepartmentUsersResp
    if (data.code !== 0) {
      throw new Error(`同步飞书用户失败: ${data.msg || JSON.stringify(data)}`)
    }

    const items = data.data?.items || []
    synced.push(...items)
    pageToken = data.data?.has_more ? data.data?.page_token || '' : ''
  } while (pageToken)

  for (const user of synced) {
    const openId = user.open_id
    if (!openId) continue
    const primaryDepartmentId = user.department_ids?.[0] || departmentId
    const department = await prisma.department.findUnique({
      where: { feishuDepartmentId: primaryDepartmentId },
      select: { name: true },
    })
    await prisma.user.upsert({
      where: { feishuOpenId: openId },
      update: {
        name: user.name || user.en_name || '飞书用户',
        departmentId: primaryDepartmentId,
        department: department?.name || null,
        feishuUserId: user.user_id || null,
        feishuUnionId: user.union_id || null,
        email: user.email || null,
        avatarUrl: user.avatar?.avatar_240 || user.avatar?.avatar_72 || user.avatar?.avatar_origin || null,
      },
      create: {
        id: `u_${openId}`,
        name: user.name || user.en_name || '飞书用户',
        department: department?.name || null,
        departmentId: primaryDepartmentId,
        feishuOpenId: openId,
        feishuUserId: user.user_id || null,
        feishuUnionId: user.union_id || null,
        email: user.email || null,
        avatarUrl: user.avatar?.avatar_240 || user.avatar?.avatar_72 || user.avatar?.avatar_origin || null,
        role: '普通员工',
      },
    })
  }

  return synced
}

export function buildApplicationCard(input: {
  title: string
  applicant: string
  department?: string | null
  reason?: string | null
  status?: string
  applicationId?: string
  comment?: string
  withApprovalActions?: boolean
}) {
  const elements: unknown[] = [
    {
      tag: 'div',
      text: {
        tag: 'lark_md',
        content: [
          `**申请单**：${input.applicationId || '-'}`,
          `**申请人**：${input.applicant}`,
          `**部门**：${input.department || '未填写'}`,
          `**状态**：${input.status || '-'}`,
          `**事由**：${input.reason || '未填写'}`,
          input.comment ? `**备注**：${input.comment}` : '',
        ].filter(Boolean).join('\n'),
      },
    },
  ]

  if (input.withApprovalActions && input.applicationId) {
    elements.push({
      tag: 'action',
      actions: [
        {
          tag: 'button',
          text: { tag: 'plain_text', content: '同意' },
          type: 'primary',
          value: {
            action: 'approve_application',
            applicationId: input.applicationId,
          },
        },
        {
          tag: 'button',
          text: { tag: 'plain_text', content: '驳回' },
          type: 'danger',
          value: {
            action: 'reject_application',
            applicationId: input.applicationId,
          },
        },
      ],
    })
  }

  return {
    config: { wide_screen_mode: true },
    header: {
      title: { tag: 'plain_text', content: input.title },
      template: input.status === '已拒绝' ? 'red' : input.status === '待调派' ? 'green' : 'blue',
    },
    elements,
  }
}

// 发送飞书消息卡片。receiveId 通常为 open_id，receiveIdType 可改为 user_id / email 等。
export async function sendFeishuCard(input: {
  receiveId: string
  receiveIdType?: string
  title: string
  card: unknown
}) {
  const tenantToken = await getTenantAccessToken()
  const receiveIdType = input.receiveIdType || 'open_id'
  const res = await fetch(
    `${FEISHU_OPEN_BASE}/open-apis/im/v1/messages?receive_id_type=${encodeURIComponent(receiveIdType)}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tenantToken}`,
      },
      body: JSON.stringify({
        receive_id: input.receiveId,
        msg_type: 'interactive',
        content: JSON.stringify(input.card),
      }),
    },
  )
  const data = (await res.json()) as FeishuMessageResp
  if (data.code !== 0) {
    throw new Error(`发送飞书消息卡片失败: ${data.msg || JSON.stringify(data)}`)
  }
  return data
}

// 用 code 换取登录用户信息
export async function exchangeFeishuCode(code: string): Promise<FeishuUserInfo> {
  const appToken = await getAppAccessToken()
  const res = await fetch(`${FEISHU_OPEN_BASE}/open-apis/authen/v1/access_token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${appToken}`,
    },
    body: JSON.stringify({ grant_type: 'authorization_code', code }),
  })
  const data = (await res.json()) as UserAccessTokenResp
  if (data.code !== 0 || !data.data) {
    throw new Error(`飞书 code 换取登录态失败: ${data.msg || JSON.stringify(data)}`)
  }
  return {
    open_id: data.data.open_id,
    union_id: data.data.union_id,
    name: data.data.name || '飞书用户',
    en_name: data.data.en_name,
    avatar_url: data.data.avatar_url,
    email: data.data.email,
    mobile: data.data.mobile,
  }
}

// 找到或创建本地用户，并和飞书 open_id 绑定
export async function upsertUserFromFeishu(info: FeishuUserInfo) {
  const existing = await prisma.user.findUnique({
    where: { feishuOpenId: info.open_id },
    select: { id: true },
  })

  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        name: info.name,
        avatarUrl: info.avatar_url || null,
        email: info.email || null,
        feishuUnionId: info.union_id || null,
      },
    })
    return existing.id
  }

  const newId = `u_${crypto.randomBytes(6).toString('hex')}`
  await prisma.user.create({
    data: {
      id: newId,
      name: info.name,
      department: null,
      feishuOpenId: info.open_id,
      feishuUnionId: info.union_id || null,
      email: info.email || null,
      avatarUrl: info.avatar_url || null,
      role: '普通员工',
    },
  })
  return newId
}

// 创建本地登录态
export async function createSession(userId: string) {
  const token = crypto.randomBytes(24).toString('hex')
  const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000)
  await prisma.session.create({
    data: { token, userId, expiresAt },
  })
  return { token, expiresAt }
}

export async function getUserBySession(token: string | undefined) {
  if (!token) return null
  const session = await prisma.session.findFirst({
    where: {
      token,
      expiresAt: { gt: new Date() },
    },
    include: { user: true },
  })
  if (!session) return null
  return {
    id: session.user.id,
    name: session.user.name,
    department: session.user.department,
    role: session.user.role,
    avatar_url: session.user.avatarUrl,
    feishu_open_id: session.user.feishuOpenId,
  }
}

export async function destroySession(token: string | undefined) {
  if (!token) return
  await prisma.session.deleteMany({ where: { token } })
}
