import { Router, type Request, type Response, type NextFunction } from 'express'
import { prisma } from './db'
import {
  buildApplicationCard,
  createSession,
  destroySession,
  exchangeFeishuCode,
  getUserBySession,
  sendFeishuCard,
  syncFeishuDepartments,
  syncFeishuUsers,
  upsertUserFromFeishu,
} from './feishu'
import crypto from 'node:crypto'

export const apiRouter = Router()

// 鉴权中间件：从 cookie 取 token，挂载 req.user
declare module 'express-serve-static-core' {
  interface Request {
    user?: {
      id: string
      name: string
      department: string | null
      role: string
      avatar_url: string | null
      feishu_open_id: string | null
    }
  }
}

async function attachUser(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.session_token
  try {
    const user = await getUserBySession(token)
    if (user) req.user = user
    next()
  } catch (err) {
    next(err)
  }
}

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    res.status(401).json({ error: 'unauthorized' })
    return
  }
  next()
}

async function logNotification(input: {
  channel: string
  receiver?: string | null
  title?: string | null
  content?: string | null
  status: string
  error?: string | null
}) {
  await prisma.notificationLog.create({
    data: {
      id: `n_${crypto.randomBytes(6).toString('hex')}`,
      channel: input.channel,
      receiver: input.receiver || null,
      title: input.title || null,
      content: input.content || null,
      status: input.status,
      error: input.error || null,
    },
  })
}

async function notifyApplicationUser(applicationId: string, title: string, comment?: string) {
  const row = await prisma.application.findUnique({
    where: { id: applicationId },
    include: { applicantUser: { select: { feishuOpenId: true } } },
  })

  if (!row?.applicantUser?.feishuOpenId) {
    await logNotification({
      channel: 'feishu_card',
      receiver: row?.applicant || applicationId,
      title,
      content: '申请人未绑定飞书 open_id，跳过发送',
      status: 'skipped',
    })
    return
  }

  const card = buildApplicationCard({
    title,
    applicant: row.applicant,
    department: row.department,
    reason: row.reason,
    status: row.status,
    applicationId: row.id,
    comment,
  })

  try {
    await sendFeishuCard({ receiveId: row.applicantUser.feishuOpenId, title, card })
    await logNotification({
      channel: 'feishu_card',
      receiver: row.applicantUser.feishuOpenId,
      title,
      content: JSON.stringify(card),
      status: 'sent',
    })
  } catch (err) {
    await logNotification({
      channel: 'feishu_card',
      receiver: row.applicantUser.feishuOpenId,
      title,
      content: JSON.stringify(card),
      status: 'failed',
      error: (err as Error).message,
    })
  }
}

async function findApproverForDepartment(departmentName: string | null | undefined) {
  if (!departmentName) return null
  const rule = await prisma.approvalRule.findFirst({
    where: { enabled: true, departmentName: departmentName },
    orderBy: { priority: 'asc' },
    select: { approverUserId: true },
  })
  return rule?.approverUserId || null
}

async function notifyCurrentApprover(applicationId: string) {
  const row = await prisma.application.findUnique({
    where: { id: applicationId },
    include: { currentApprover: { select: { feishuOpenId: true } } },
  })

  if (!row?.currentApproverId) {
    await logNotification({
      channel: 'feishu_card',
      receiver: applicationId,
      title: '用车申请待审批提醒',
      content: '申请未匹配到审批人，跳过发送',
      status: 'skipped',
    })
    return
  }

  if (!row.currentApprover?.feishuOpenId) {
    await logNotification({
      channel: 'feishu_card',
      receiver: row.currentApproverId,
      title: '用车申请待审批提醒',
      content: '审批人未绑定飞书 open_id，跳过发送',
      status: 'skipped',
    })
    return
  }

  const card = buildApplicationCard({
    title: '有新的用车申请待审批',
    applicant: row.applicant,
    department: row.department,
    reason: row.reason,
    status: row.status,
    applicationId: row.id,
    withApprovalActions: true,
  })

  try {
    await sendFeishuCard({ receiveId: row.currentApprover.feishuOpenId, title: '有新的用车申请待审批', card })
    await logNotification({
      channel: 'feishu_card',
      receiver: row.currentApprover.feishuOpenId,
      title: '用车申请待审批提醒',
      content: JSON.stringify(card),
      status: 'sent',
    })
  } catch (err) {
    await logNotification({
      channel: 'feishu_card',
      receiver: row.currentApprover.feishuOpenId,
      title: '用车申请待审批提醒',
      content: JSON.stringify(card),
      status: 'failed',
      error: (err as Error).message,
    })
  }
}

async function handleApplicationDecision(input: {
  applicationId: string
  action: 'approve' | 'reject'
  operatorId?: string | null
  operatorName?: string | null
  comment?: string
}) {
  const existing = await prisma.application.findUnique({
    where: { id: input.applicationId },
    select: { id: true, applicant: true, department: true, reason: true, status: true },
  })

  if (!existing) {
    throw new Error('申请单不存在')
  }

  const nextStatus = input.action === 'approve' ? '待调派' : '已拒绝'
  const actionName = input.action === 'approve' ? 'approve' : 'reject'
  const title = input.action === 'approve' ? '用车申请已审批通过' : '用车申请已被驳回'
  const comment = input.comment || (input.action === 'approve' ? '飞书卡片审批通过' : '飞书卡片审批驳回')

  await prisma.$transaction([
    prisma.application.update({
      where: { id: input.applicationId },
      data: { status: nextStatus, currentApproverId: null },
    }),
    prisma.approvalRecord.create({
      data: {
        id: `ap_${crypto.randomBytes(6).toString('hex')}`,
        applicationId: input.applicationId,
        action: actionName,
        operatorId: input.operatorId || null,
        operatorName: input.operatorName || '飞书审批人',
        comment,
      },
    }),
  ])

  await notifyApplicationUser(input.applicationId, title, comment)
  return {
    title,
    status: nextStatus,
    card: buildApplicationCard({
      title,
      applicant: existing.applicant,
      department: existing.department,
      reason: existing.reason,
      status: nextStatus,
      applicationId: existing.id,
      comment,
    }),
  }
}

apiRouter.use(attachUser)

// ----------------------- 飞书登录与登录态 -----------------------

apiRouter.post('/feishu/card-callback', async (req, res) => {
  const body = req.body || {}

  // 飞书回调 URL 校验会带 challenge，需原样返回
  if (body.challenge) {
    res.json({ challenge: body.challenge })
    return
  }

  const expectedToken = process.env.FEISHU_VERIFICATION_TOKEN
  if (expectedToken && body.token !== expectedToken) {
    res.status(401).json({ error: 'invalid_feishu_token' })
    return
  }

  const value = body.event?.action?.value || body.action?.value || body.value || {}
  const action = value.action
  const applicationId = value.applicationId
  const operatorOpenId = body.event?.operator?.open_id || body.operator?.open_id || null
  const operatorUserId = body.event?.operator?.user_id || body.operator?.user_id || null

  if (!applicationId || !['approve_application', 'reject_application'].includes(action)) {
    res.json({
      toast: { type: 'warning', content: '未识别的卡片操作' },
    })
    return
  }

  const operator = operatorOpenId
    ? await prisma.user.findUnique({ where: { feishuOpenId: operatorOpenId }, select: { id: true, name: true } })
    : null

  try {
    const result = await handleApplicationDecision({
      applicationId,
      action: action === 'approve_application' ? 'approve' : 'reject',
      operatorId: operator?.id || operatorUserId || operatorOpenId,
      operatorName: operator?.name || '飞书审批人',
    })

    await logNotification({
      channel: 'feishu_card_callback',
      receiver: operatorOpenId,
      title: result.title,
      content: `申请单 ${applicationId} 已通过飞书卡片处理`,
      status: 'success',
    })

    res.json({
      toast: { type: 'success', content: result.title },
      card: result.card,
    })
  } catch (err) {
    await logNotification({
      channel: 'feishu_card_callback',
      receiver: operatorOpenId,
      title: '飞书卡片审批失败',
      content: `申请单 ${applicationId} 处理失败`,
      status: 'failed',
      error: (err as Error).message,
    })
    res.json({
      toast: { type: 'error', content: (err as Error).message },
    })
  }
})

// 1. 生成飞书授权 URL（state 防 CSRF）
apiRouter.get('/auth/feishu/url', (_req, res) => {
  const appId = process.env.FEISHU_APP_ID
  const redirectUri = process.env.FEISHU_REDIRECT_URI
  if (!appId || !redirectUri) {
    res.status(500).json({ error: 'feishu_not_configured', message: '请在 .env 中配置 FEISHU_APP_ID 和 FEISHU_REDIRECT_URI' })
    return
  }
  const state = crypto.randomBytes(8).toString('hex')
  const params = new URLSearchParams({
    app_id: appId,
    redirect_uri: redirectUri,
    state,
  })
  res.json({ url: `https://open.feishu.cn/open-apis/authen/v1/authorize?${params}`, state })
})

// 2. OAuth 回调：用 code 换登录态
apiRouter.get('/auth/feishu/callback', async (req, res) => {
  const code = req.query.code as string | undefined
  if (!code) {
    res.status(400).send('缺少 code 参数')
    return
  }
  try {
    const info = await exchangeFeishuCode(code)
    const userId = await upsertUserFromFeishu(info)
    const { token } = await createSession(userId)
    res.cookie('session_token', token, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 7 * 24 * 3600 * 1000,
    })
    const frontend = process.env.FRONTEND_URL || 'http://localhost:5173'
    res.redirect(`${frontend}/?login=success`)
  } catch (err) {
    const frontend = process.env.FRONTEND_URL || 'http://localhost:5173'
    const message = encodeURIComponent((err as Error).message)
    res.redirect(`${frontend}/?login=failed&reason=${message}`)
  }
})

// 3. 获取当前用户
apiRouter.get('/auth/me', (req, res) => {
  if (!req.user) {
    res.json({ user: null })
    return
  }
  res.json({
    user: {
      id: req.user.id,
      name: req.user.name,
      department: req.user.department,
      role: req.user.role,
      avatarUrl: req.user.avatar_url,
      feishuOpenId: req.user.feishu_open_id,
    },
  })
})

// 4. 退出登录
apiRouter.post('/auth/logout', async (req, res) => {
  await destroySession(req.cookies?.session_token)
  res.clearCookie('session_token')
  res.json({ ok: true })
})

// 5. 仅本地开发：模拟登录，方便没有飞书凭证时也能体验
apiRouter.post('/auth/dev-login', async (_req, res) => {
  const user = await prisma.user.findFirst({ select: { id: true } })
  if (!user) {
    res.status(500).json({ error: 'no_user' })
    return
  }
  const { token } = await createSession(user.id)
  res.cookie('session_token', token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 7 * 24 * 3600 * 1000,
  })
  res.json({ ok: true })
})

// ----------------------- 业务数据接口 -----------------------

apiRouter.get('/vehicles', requireAuth, async (_req, res) => {
  const rows = await prisma.vehicle.findMany({ orderBy: { createdAt: 'desc' } })
  res.json(
    rows.map((v) => ({
      id: v.id,
      plateNo: v.plateNo,
      brand: v.brand,
      model: v.model,
      type: v.type,
      seats: v.seats,
      status: v.status,
      department: v.department,
      mileage: v.mileage,
      insuranceDue: v.insuranceDue,
      inspectionDue: v.inspectionDue,
      owner: v.owner,
    })),
  )
})

apiRouter.post('/vehicles', requireAuth, async (req, res) => {
  const v = req.body || {}
  const id = `v_${crypto.randomBytes(4).toString('hex')}`
  await prisma.vehicle.create({
    data: {
      id,
      plateNo: v.plateNo,
      brand: v.brand || null,
      model: v.model || null,
      type: v.type || null,
      seats: v.seats || null,
      status: v.status || '可用',
      department: v.department || null,
      mileage: v.mileage || 0,
      insuranceDue: v.insuranceDue || null,
      inspectionDue: v.inspectionDue || null,
      owner: v.owner || null,
    },
  })
  res.json({ ok: true, id })
})

apiRouter.get('/applications', requireAuth, async (_req, res) => {
  const rows = await prisma.application.findMany({ orderBy: { createdAt: 'desc' } })
  res.json(
    rows.map((a) => ({
      id: a.id,
      applicant: a.applicant,
      department: a.department,
      reason: a.reason,
      passengers: a.passengers,
      startAt: a.startAt,
      endAt: a.endAt,
      from: a.fromAddr,
      to: a.toAddr,
      needDriver: a.needDriver,
      status: a.status,
      applicantUserId: a.applicantUserId,
      currentApproverId: a.currentApproverId,
    })),
  )
})

apiRouter.post('/applications', requireAuth, async (req, res) => {
  const a = req.body || {}
  const id = a.id || `A${Date.now()}`
  const department = a.department || req.user!.department
  const currentApproverId = await findApproverForDepartment(department)
  await prisma.application.create({
    data: {
      id,
      applicantUserId: req.user!.id,
      currentApproverId,
      applicant: a.applicant || req.user!.name,
      department,
      reason: a.reason || '',
      passengers: a.passengers || 1,
      startAt: a.startAt || null,
      endAt: a.endAt || null,
      fromAddr: a.from || null,
      toAddr: a.to || null,
      needDriver: Boolean(a.needDriver),
      status: a.status || (currentApproverId ? '待审批' : '待审批'),
    },
  })
  await notifyCurrentApprover(id)
  res.json({ ok: true, id, currentApproverId })
})

apiRouter.post('/applications/:id/approve', requireAuth, async (req, res) => {
  const id = String(req.params.id)
  const comment = String(req.body?.comment || '审批通过')
  try {
    const result = await handleApplicationDecision({
      applicationId: id,
      action: 'approve',
      operatorId: req.user!.id,
      operatorName: req.user!.name,
      comment,
    })
    res.json({ ok: true, status: result.status })
  } catch (err) {
    res.status(404).json({ error: 'application_not_found', message: (err as Error).message })
  }
})

apiRouter.post('/applications/:id/reject', requireAuth, async (req, res) => {
  const id = String(req.params.id)
  const comment = String(req.body?.comment || '审批驳回')
  try {
    const result = await handleApplicationDecision({
      applicationId: id,
      action: 'reject',
      operatorId: req.user!.id,
      operatorName: req.user!.name,
      comment,
    })
    res.json({ ok: true, status: result.status })
  } catch (err) {
    res.status(404).json({ error: 'application_not_found', message: (err as Error).message })
  }
})

apiRouter.get('/applications/:id/approvals', requireAuth, async (req, res) => {
  const applicationId = String(req.params.id)
  const rows = await prisma.approvalRecord.findMany({
    where: { applicationId },
    orderBy: { createdAt: 'desc' },
  })
  res.json(rows.map((row) => ({
    id: row.id,
    application_id: row.applicationId,
    action: row.action,
    operator_id: row.operatorId,
    operator_name: row.operatorName,
    comment: row.comment,
    created_at: row.createdAt,
  })))
})

apiRouter.get('/dispatches', requireAuth, async (_req, res) => {
  const rows = await prisma.dispatch.findMany({ orderBy: { createdAt: 'desc' } })
  res.json(
    rows.map((d) => ({
      id: d.id,
      applicationId: d.applicationId,
      plateNo: d.plateNo,
      driver: d.driver,
      plannedStart: d.plannedStart,
      plannedEnd: d.plannedEnd,
      startMileage: d.startMileage ?? 0,
      endMileage: d.endMileage ?? undefined,
      status: d.status,
    })),
  )
})

apiRouter.post('/dispatches', requireAuth, async (req, res) => {
  const body = req.body || {}
  const applicationId = body.applicationId
  if (!applicationId) {
    res.status(400).json({ error: 'application_id_required' })
    return
  }

  const id = body.id || `D${Date.now()}`
  await prisma.$transaction([
    prisma.dispatch.create({
      data: {
        id,
        applicationId,
        plateNo: body.plateNo || '待分配',
        driver: body.driver || '待分配',
        plannedStart: body.plannedStart || null,
        plannedEnd: body.plannedEnd || null,
        startMileage: body.startMileage || 0,
        endMileage: body.endMileage || null,
        status: body.status || '待出车',
      },
    }),
    prisma.application.update({
      where: { id: applicationId },
      data: { status: '已完成' },
    }),
  ])
  await notifyApplicationUser(applicationId, '车辆调派已完成', `车辆：${body.plateNo || '待分配'}，司机：${body.driver || '待分配'}`)
  res.json({ ok: true, id })
})

apiRouter.get('/maintenance', requireAuth, async (_req, res) => {
  const rows = await prisma.maintenanceRecord.findMany({ orderBy: { date: 'desc' } })
  res.json(
    rows.map((m) => ({
      id: m.id,
      plateNo: m.plateNo,
      type: m.type,
      title: m.title,
      vendor: m.vendor,
      cost: m.cost,
      handledBy: m.handledBy,
      date: m.date,
      status: m.status,
    })),
  )
})

apiRouter.get('/roles', requireAuth, async (_req, res) => {
  const rows = await prisma.role.findMany()
  res.json(
    rows.map((r) => ({
      name: r.name,
      description: r.description || '',
      permissions: r.permissions.split(',').map((p) => p.trim()).filter(Boolean),
    })),
  )
})

apiRouter.get('/departments', requireAuth, async (_req, res) => {
  const rows = await prisma.department.findMany({ orderBy: { name: 'asc' } })
  res.json(rows.map((row) => ({
    id: row.id,
    name: row.name,
    parentId: row.parentId,
    feishuDepartmentId: row.feishuDepartmentId,
    leaderUserId: row.leaderUserId,
    updatedAt: row.updatedAt,
  })))
})

apiRouter.get('/users', requireAuth, async (_req, res) => {
  const rows = await prisma.user.findMany({ orderBy: { createdAt: 'desc' }, take: 200 })
  res.json(rows.map((row) => ({
    id: row.id,
    name: row.name,
    department: row.department,
    departmentId: row.departmentId,
    feishuOpenId: row.feishuOpenId,
    feishuUserId: row.feishuUserId,
    email: row.email,
    role: row.role,
    avatarUrl: row.avatarUrl,
  })))
})

apiRouter.get('/approval-rules', requireAuth, async (_req, res) => {
  const rows = await prisma.approvalRule.findMany({ orderBy: { priority: 'asc' } })
  res.json(rows.map((row) => ({
    id: row.id,
    departmentId: row.departmentId,
    departmentName: row.departmentName,
    approverUserId: row.approverUserId,
    approverRole: row.approverRole,
    priority: row.priority,
    enabled: row.enabled,
    updatedAt: row.updatedAt,
  })))
})

apiRouter.post('/approval-rules', requireAuth, async (req, res) => {
  const body = req.body || {}
  const id = body.id || `rule_${crypto.randomBytes(6).toString('hex')}`
  await prisma.approvalRule.upsert({
    where: { id },
    update: {
      departmentId: body.departmentId || null,
      departmentName: body.departmentName || null,
      approverUserId: body.approverUserId || null,
      approverRole: body.approverRole || '部门审批人',
      priority: body.priority || 100,
      enabled: body.enabled === false ? false : true,
    },
    create: {
      id,
      departmentId: body.departmentId || null,
      departmentName: body.departmentName || null,
      approverUserId: body.approverUserId || null,
      approverRole: body.approverRole || '部门审批人',
      priority: body.priority || 100,
      enabled: body.enabled === false ? false : true,
    },
  })
  res.json({ ok: true, id })
})

apiRouter.post('/feishu/sync-departments', requireAuth, async (req, res) => {
  const rootDepartmentId = req.body?.rootDepartmentId || '0'
  try {
    const departments = await syncFeishuDepartments(rootDepartmentId)
    res.json({ ok: true, count: departments.length })
  } catch (err) {
    res.status(500).json({ error: 'sync_failed', message: (err as Error).message })
  }
})

apiRouter.post('/feishu/sync-users', requireAuth, async (req, res) => {
  const departmentId = req.body?.departmentId || '0'
  try {
    const users = await syncFeishuUsers(departmentId)
    res.json({ ok: true, count: users.length })
  } catch (err) {
    res.status(500).json({ error: 'sync_users_failed', message: (err as Error).message })
  }
})

apiRouter.post('/notifications/feishu/card', requireAuth, async (req, res) => {
  const { receiveId, receiveIdType, title, content } = req.body || {}
  if (!receiveId || !title) {
    res.status(400).json({ error: 'receive_id_and_title_required' })
    return
  }

  const card = {
    config: { wide_screen_mode: true },
    header: { title: { tag: 'plain_text', content: title }, template: 'blue' },
    elements: [{ tag: 'div', text: { tag: 'lark_md', content: content || title } }],
  }

  try {
    const result = await sendFeishuCard({ receiveId, receiveIdType, title, card })
    await logNotification({
      channel: 'feishu_card',
      receiver: receiveId,
      title,
      content: content || title,
      status: 'sent',
    })
    res.json({ ok: true, result })
  } catch (err) {
    await logNotification({
      channel: 'feishu_card',
      receiver: receiveId,
      title,
      content: content || title,
      status: 'failed',
      error: (err as Error).message,
    })
    res.status(500).json({ error: 'send_failed', message: (err as Error).message })
  }
})

apiRouter.get('/notification-logs', requireAuth, async (_req, res) => {
  const rows = await prisma.notificationLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
  })
  res.json(rows.map((row) => ({
    id: row.id,
    channel: row.channel,
    receiver: row.receiver,
    title: row.title,
    content: row.content,
    status: row.status,
    error: row.error,
    created_at: row.createdAt,
  })))
})

// 健康检查
apiRouter.get('/health', (_req, res) => res.json({ ok: true }))
