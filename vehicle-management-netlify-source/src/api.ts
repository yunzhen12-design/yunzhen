// 统一封装与后端 Express API 通信，所有请求都带上 cookie 以维持登录态。
// 本地开发默认走 Vite 代理 /api；部署到 Netlify 时，用 VITE_API_BASE_URL 指向后端公网地址。
const BASE = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '')

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    ...init,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`API ${path} 失败: ${res.status} ${text}`)
  }
  return (await res.json()) as T
}

export interface AuthUser {
  id: string
  name: string
  department: string | null
  role: string
  avatarUrl: string | null
  feishuOpenId: string | null
}

export const api = {
  me: () => request<{ user: AuthUser | null }>(`/auth/me`),
  feishuUrl: () => request<{ url: string; state: string }>(`/auth/feishu/url`),
  devLogin: () => request<{ ok: boolean }>(`/auth/dev-login`, { method: 'POST' }),
  logout: () => request<{ ok: boolean }>(`/auth/logout`, { method: 'POST' }),
  vehicles: () => request<Vehicle[]>(`/vehicles`),
  applications: () => request<VehicleApplication[]>(`/applications`),
  approveApplication: (id: string, comment?: string) =>
    request<{ ok: boolean; status: string }>(`/applications/${id}/approve`, {
      method: 'POST',
      body: JSON.stringify({ comment }),
    }),
  rejectApplication: (id: string, comment?: string) =>
    request<{ ok: boolean; status: string }>(`/applications/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ comment }),
    }),
  dispatches: () => request<DispatchRecord[]>(`/dispatches`),
  maintenance: () => request<MaintenanceRecord[]>(`/maintenance`),
  roles: () => request<Role[]>(`/roles`),
  users: () => request<SystemUser[]>(`/users`),
  approvalRules: () => request<ApprovalRule[]>(`/approval-rules`),
  departments: () => request<Department[]>(`/departments`),
  syncDepartments: (rootDepartmentId = '0') =>
    request<{ ok: boolean; count: number }>(`/feishu/sync-departments`, {
      method: 'POST',
      body: JSON.stringify({ rootDepartmentId }),
    }),
  syncUsers: (departmentId = '0') =>
    request<{ ok: boolean; count: number }>(`/feishu/sync-users`, {
      method: 'POST',
      body: JSON.stringify({ departmentId }),
    }),
  notificationLogs: () => request<NotificationLog[]>(`/notification-logs`),
}

// 与后端字段对齐的前端类型
export interface Vehicle {
  id: string
  plateNo: string
  brand: string | null
  model: string | null
  type: string | null
  seats: number | null
  status: string
  department: string | null
  mileage: number | null
  insuranceDue: string | null
  inspectionDue: string | null
  owner: string | null
}

export interface VehicleApplication {
  id: string
  applicantUserId?: string | null
  currentApproverId?: string | null
  applicant: string
  department: string | null
  reason: string | null
  passengers: number | null
  startAt: string | null
  endAt: string | null
  from: string | null
  to: string | null
  needDriver: boolean
  status: string
}

export interface DispatchRecord {
  id: string
  applicationId: string
  plateNo: string | null
  driver: string | null
  plannedStart: string | null
  plannedEnd: string | null
  startMileage: number
  endMileage?: number
  status: string
}

export interface MaintenanceRecord {
  id: string
  plateNo: string
  type: string
  title: string | null
  vendor: string | null
  cost: number
  handledBy: string | null
  date: string | null
  status: string
}

export interface Role {
  name: string
  description: string
  permissions: string[]
}

export interface SystemUser {
  id: string
  name: string
  department: string | null
  departmentId: string | null
  feishuOpenId: string | null
  feishuUserId: string | null
  email: string | null
  role: string
  avatarUrl: string | null
}

export interface ApprovalRule {
  id: string
  departmentId: string | null
  departmentName: string | null
  approverUserId: string | null
  approverRole: string | null
  priority: number
  enabled: boolean
  updatedAt: string
}

export interface Department {
  id: string
  name: string
  parentId: string | null
  feishuDepartmentId: string | null
  leaderUserId: string | null
  updatedAt: string
}

export interface NotificationLog {
  id: string
  channel: string
  receiver: string | null
  title: string | null
  content: string | null
  status: string
  error: string | null
  created_at: string
}
