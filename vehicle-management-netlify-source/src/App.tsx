import {
  Bell,
  CalendarCheck,
  Car,
  CheckCircle2,
  ClipboardList,
  Gauge,
  KeyRound,
  LogOut,
  ShieldCheck,
  SlidersHorizontal,
  UserCog,
  Wrench,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import {
  api,
  type ApprovalRule,
  type AuthUser,
  type Department,
  type DispatchRecord,
  type MaintenanceRecord,
  type NotificationLog,
  type Role,
  type SystemUser,
  type Vehicle,
  type VehicleApplication,
} from './api'
import Login from './Login'

const statusClass: Record<string, string> = {
  可用: 'success',
  使用中: 'warning',
  维修中: 'danger',
  停用: 'muted',
  待审批: 'warning',
  已通过: 'success',
  已拒绝: 'danger',
  待调派: 'info',
  已完成: 'success',
  待出车: 'info',
  已取消: 'muted',
  处理中: 'warning',
}

function Badge({ value }: { value: string }) {
  return <span className={`badge ${statusClass[value] ?? 'muted'}`}>{value}</span>
}

function MetricCard({
  title,
  value,
  hint,
  icon,
}: {
  title: string
  value: string
  hint: string
  icon: React.ReactNode
}) {
  return (
    <article className="metric-card">
      <div className="metric-icon">{icon}</div>
      <div>
        <p>{title}</p>
        <strong>{value}</strong>
        <span>{hint}</span>
      </div>
    </article>
  )
}

function SectionTitle({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode
  title: string
  description: string
}) {
  return (
    <div className="section-title">
      <div>{icon}</div>
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
    </div>
  )
}

function VehicleTable({ vehicles }: { vehicles: Vehicle[] }) {
  return (
    <section className="panel">
      <SectionTitle
        icon={<Car size={22} />}
        title="车辆档案"
        description="维护车辆基础信息、状态、年检保险和负责人。数据来自后端数据库。"
      />
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>车牌号</th>
              <th>车型</th>
              <th>状态</th>
              <th>所属部门</th>
              <th>里程</th>
              <th>保险到期</th>
              <th>负责人</th>
            </tr>
          </thead>
          <tbody>
            {vehicles.map((vehicle) => (
              <tr key={vehicle.id}>
                <td className="strong">{vehicle.plateNo}</td>
                <td>
                  {vehicle.brand} {vehicle.model}
                  <small>{vehicle.type} · {vehicle.seats ?? '-'}座</small>
                </td>
                <td><Badge value={vehicle.status} /></td>
                <td>{vehicle.department}</td>
                <td>{(vehicle.mileage ?? 0).toLocaleString()} km</td>
                <td>{vehicle.insuranceDue}</td>
                <td>{vehicle.owner}</td>
              </tr>
            ))}
            {vehicles.length === 0 && (
              <tr>
                <td colSpan={7} className="empty">暂无车辆数据</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function ApplicationBoard({
  applications,
  onApprove,
  onReject,
}: {
  applications: VehicleApplication[]
  onApprove: (id: string) => void
  onReject: (id: string) => void
}) {
  return (
    <section className="panel">
      <SectionTitle
        icon={<ClipboardList size={22} />}
        title="用车申请"
        description="员工提交申请后，部门审批人和调度员可以继续处理。"
      />
      <div className="cards-grid">
        {applications.map((item) => (
          <article className="request-card" key={item.id}>
            <div className="request-head">
              <span>{item.id}</span>
              <Badge value={item.status} />
            </div>
            <h3>{item.reason}</h3>
            <p>{item.from} → {item.to}</p>
            <dl>
              <div>
                <dt>申请人</dt>
                <dd>{item.applicant} / {item.department}</dd>
              </div>
              <div>
                <dt>时间</dt>
                <dd>{item.startAt} 至 {item.endAt}</dd>
              </div>
              <div>
                <dt>人数</dt>
                <dd>{item.passengers}人，{item.needDriver ? '需要司机' : '自驾'}</dd>
              </div>
            </dl>
            {item.status === '待审批' && (
              <div className="card-actions">
                <button className="mini-btn primary" onClick={() => onApprove(item.id)}>审批通过</button>
                <button className="mini-btn danger" onClick={() => onReject(item.id)}>驳回</button>
              </div>
            )}
          </article>
        ))}
        {applications.length === 0 && <p className="empty">暂无申请</p>}
      </div>
    </section>
  )
}

function DispatchBoard({ dispatches }: { dispatches: DispatchRecord[] }) {
  return (
    <section className="panel">
      <SectionTitle
        icon={<CalendarCheck size={22} />}
        title="车辆调派"
        description="对已通过的申请分配车辆、司机，并记录出车与归还里程。"
      />
      <div className="timeline">
        {dispatches.map((dispatch) => (
          <article key={dispatch.id} className="timeline-item">
            <div className="timeline-dot" />
            <div>
              <div className="timeline-head">
                <strong>{dispatch.id}</strong>
                <Badge value={dispatch.status} />
              </div>
              <p>申请单 {dispatch.applicationId}</p>
              <span>车辆：{dispatch.plateNo} · 司机：{dispatch.driver}</span>
              <span>计划：{dispatch.plannedStart} 至 {dispatch.plannedEnd}</span>
              <span>
                里程：{dispatch.startMileage || '待填写'}
                {dispatch.endMileage ? ` → ${dispatch.endMileage} km` : ''}
              </span>
            </div>
          </article>
        ))}
        {dispatches.length === 0 && <p className="empty">暂无调派记录</p>}
      </div>
    </section>
  )
}

function MaintenanceBoard({ records }: { records: MaintenanceRecord[] }) {
  return (
    <section className="panel">
      <SectionTitle
        icon={<Wrench size={22} />}
        title="维修保养"
        description="记录维修、保养、年检、保险和事故处理情况。"
      />
      <div className="maintenance-list">
        {records.map((record) => (
          <article key={record.id}>
            <div>
              <strong>{record.plateNo}</strong>
              <h3>{record.title}</h3>
              <p>{record.type} · {record.vendor} · 经办人 {record.handledBy}</p>
            </div>
            <div className="maintenance-right">
              <Badge value={record.status} />
              <span>¥{record.cost.toLocaleString()}</span>
              <small>{record.date}</small>
            </div>
          </article>
        ))}
        {records.length === 0 && <p className="empty">暂无维修记录</p>}
      </div>
    </section>
  )
}

function PermissionBoard({ roles }: { roles: Role[] }) {
  return (
    <section className="panel">
      <SectionTitle
        icon={<ShieldCheck size={22} />}
        title="管理员与权限"
        description="基于 RBAC 模型，从数据库 roles 表加载角色与权限配置。"
      />
      <div className="role-grid">
        {roles.map((role) => (
          <article key={role.name} className="role-card">
            <div className="role-head">
              <UserCog size={18} />
              <strong>{role.name}</strong>
            </div>
            <p>{role.description}</p>
            <div className="permission-tags">
              {role.permissions.map((permission) => (
                <span key={permission}>{permission}</span>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

function FeishuPanel({ user }: { user: AuthUser }) {
  return (
    <section className="integration-panel">
      <div>
        <div className="integration-icon"><KeyRound size={24} /></div>
        <h2>飞书登录已就绪</h2>
        <p>
          当前登录用户由后端 <code>/api/auth/me</code> 接口提供。飞书 OAuth 回调地址：
          <code>/api/auth/feishu/callback</code>，登录态使用 HttpOnly Cookie 维持。
        </p>
      </div>
      <div className="code-card">
        <span>用户：{user.name}</span>
        <span>飞书 OpenID：{user.feishuOpenId || '本地账号未绑定'}</span>
        <span>角色：{user.role}</span>
      </div>
    </section>
  )
}

function FeishuOpsPanel({
  departments,
  users,
  approvalRules,
  notificationLogs,
  syncing,
  syncingUsers,
  onSync,
  onSyncUsers,
}: {
  departments: Department[]
  users: SystemUser[]
  approvalRules: ApprovalRule[]
  notificationLogs: NotificationLog[]
  syncing: boolean
  syncingUsers: boolean
  onSync: () => void
  onSyncUsers: () => void
}) {
  return (
    <section className="panel">
      <SectionTitle
        icon={<KeyRound size={22} />}
        title="飞书组织与通知"
        description="同步飞书通讯录部门，并查看消息卡片发送记录。审批和调派时会自动尝试发送飞书卡片。"
      />
      <div className="ops-grid">
        <article className="ops-card">
          <div className="ops-head">
            <strong>部门同步</strong>
            <button className="mini-btn primary" onClick={onSync} disabled={syncing}>
              {syncing ? '同步中...' : '同步飞书部门'}
            </button>
          </div>
          <p>已保存 {departments.length} 个部门</p>
          <div className="department-tags">
            {departments.slice(0, 8).map((department) => (
              <span key={department.id}>{department.name}</span>
            ))}
          </div>
        </article>
        <article className="ops-card">
          <div className="ops-head">
            <strong>用户同步</strong>
            <button className="mini-btn primary" onClick={onSyncUsers} disabled={syncingUsers}>
              {syncingUsers ? '同步中...' : '同步飞书用户'}
            </button>
          </div>
          <p>已保存 {users.length} 个用户，{users.filter((item) => item.feishuOpenId).length} 个已绑定飞书</p>
          <div className="department-tags">
            {users.slice(0, 8).map((item) => (
              <span key={item.id}>{item.name}</span>
            ))}
          </div>
        </article>
        <article className="ops-card">
          <div className="ops-head">
            <strong>审批规则</strong>
            <Badge value={`${approvalRules.length} 条`} />
          </div>
          <div className="log-list">
            {approvalRules.slice(0, 4).map((rule) => (
              <div key={rule.id}>
                <span>{rule.departmentName || '全部部门'} → {rule.approverRole}</span>
                <Badge value={rule.enabled ? '启用' : '停用'} />
              </div>
            ))}
            {approvalRules.length === 0 && <p className="empty">暂无审批规则</p>}
          </div>
        </article>
        <article className="ops-card">
          <div className="ops-head">
            <strong>通知日志</strong>
            <Badge value={`${notificationLogs.length} 条`} />
          </div>
          <div className="log-list">
            {notificationLogs.slice(0, 4).map((log) => (
              <div key={log.id}>
                <span>{log.title || log.channel}</span>
                <Badge value={log.status} />
              </div>
            ))}
            {notificationLogs.length === 0 && <p className="empty">暂无通知记录</p>}
          </div>
        </article>
      </div>
    </section>
  )
}

function App() {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [applications, setApplications] = useState<VehicleApplication[]>([])
  const [dispatches, setDispatches] = useState<DispatchRecord[]>([])
  const [maintenance, setMaintenance] = useState<MaintenanceRecord[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [users, setUsers] = useState<SystemUser[]>([])
  const [approvalRules, setApprovalRules] = useState<ApprovalRule[]>([])
  const [notificationLogs, setNotificationLogs] = useState<NotificationLog[]>([])
  const [error, setError] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncingUsers, setSyncingUsers] = useState(false)

  // 启动后先校验登录态
  useEffect(() => {
    api
      .me()
      .then((res) => setUser(res.user))
      .catch(() => setUser(null))
      .finally(() => setLoaded(true))
  }, [])

  // 登录后加载所有业务数据
  useEffect(() => {
    if (!user) return
    Promise.all([
      api.vehicles(),
      api.applications(),
      api.dispatches(),
      api.maintenance(),
      api.roles(),
      api.departments(),
      api.users(),
      api.approvalRules(),
      api.notificationLogs(),
    ])
      .then(([v, a, d, m, r, deps, userRows, rules, logs]) => {
        setVehicles(v)
        setApplications(a)
        setDispatches(d)
        setMaintenance(m)
        setRoles(r)
        setDepartments(deps)
        setUsers(userRows)
        setApprovalRules(rules)
        setNotificationLogs(logs)
      })
      .catch((err) => setError((err as Error).message))
  }, [user])

  async function refreshBusinessData() {
    const [v, a, d, m, r, deps, userRows, rules, logs] = await Promise.all([
      api.vehicles(),
      api.applications(),
      api.dispatches(),
      api.maintenance(),
      api.roles(),
      api.departments(),
      api.users(),
      api.approvalRules(),
      api.notificationLogs(),
    ])
    setVehicles(v)
    setApplications(a)
    setDispatches(d)
    setMaintenance(m)
    setRoles(r)
    setDepartments(deps)
    setUsers(userRows)
    setApprovalRules(rules)
    setNotificationLogs(logs)
  }

  async function handleApproveApplication(id: string) {
    setError(null)
    try {
      await api.approveApplication(id, '审批通过，请调度员安排车辆')
      await refreshBusinessData()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function handleRejectApplication(id: string) {
    setError(null)
    try {
      await api.rejectApplication(id, '用车申请暂不通过')
      await refreshBusinessData()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function handleSyncDepartments() {
    setSyncing(true)
    setError(null)
    try {
      await api.syncDepartments()
      await refreshBusinessData()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSyncing(false)
    }
  }

  async function handleSyncUsers() {
    setSyncingUsers(true)
    setError(null)
    try {
      await api.syncUsers()
      await refreshBusinessData()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSyncingUsers(false)
    }
  }

  async function refreshUser() {
    const res = await api.me()
    setUser(res.user)
  }

  async function handleLogout() {
    await api.logout()
    setUser(null)
  }

  if (!loaded) {
    return <div className="loading">正在加载...</div>
  }

  if (!user) {
    return <Login onLoggedIn={refreshUser} />
  }

  const availableVehicles = vehicles.filter((v) => v.status === '可用').length
  const pendingApplications = applications.filter((a) => a.status === '待审批').length
  const dispatching = dispatches.filter((d) => d.status !== '已完成').length
  const maintenanceCost = maintenance.reduce((sum, item) => sum + (item.cost || 0), 0)

  const avatarText = user.avatarUrl
    ? null
    : (user.name?.slice(0, 1) ?? '车')

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div><Car size={24} /></div>
          <span>车辆管理平台</span>
        </div>
        <nav>
          <a className="active" href="#dashboard"><Gauge size={18} /> 工作台</a>
          <a href="#vehicles"><Car size={18} /> 车辆档案</a>
          <a href="#applications"><ClipboardList size={18} /> 用车申请</a>
          <a href="#dispatch"><CalendarCheck size={18} /> 车辆调派</a>
          <a href="#maintenance"><Wrench size={18} /> 维修保养</a>
          <a href="#permissions"><ShieldCheck size={18} /> 权限配置</a>
          <a href="#settings"><SlidersHorizontal size={18} /> 系统设置</a>
        </nav>
      </aside>

      <div className="content">
        <header className="topbar">
          <div>
            <p>企业内部用车、调度、维修和权限管理</p>
            <h1>车辆资源管理工作台</h1>
          </div>
          <div className="user-box">
            <button aria-label="通知"><Bell size={19} /></button>
            <div className="avatar">
              {user.avatarUrl ? <img src={user.avatarUrl} alt="" /> : avatarText}
            </div>
            <div>
              <strong>{user.name}</strong>
              <span>{user.department || '未分配部门'} · {user.role}</span>
            </div>
            <button className="btn-icon" onClick={handleLogout} aria-label="退出登录">
              <LogOut size={18} />
            </button>
          </div>
        </header>

        {error && <div className="api-error">数据加载失败：{error}</div>}

        <section id="dashboard" className="metrics">
          <MetricCard title="车辆总数" value={`${vehicles.length} 辆`} hint={`${availableVehicles} 辆当前可用`} icon={<Car size={22} />} />
          <MetricCard title="待审批申请" value={`${pendingApplications} 单`} hint="需部门审批人处理" icon={<ClipboardList size={22} />} />
          <MetricCard title="待调派任务" value={`${dispatching} 单`} hint="需调度员分配车辆" icon={<CalendarCheck size={22} />} />
          <MetricCard title="本月维修费用" value={`¥${maintenanceCost.toLocaleString()}`} hint="含维修与保养记录" icon={<Wrench size={22} />} />
        </section>

        <FeishuPanel user={user} />
        <FeishuOpsPanel
          departments={departments}
          users={users}
          approvalRules={approvalRules}
          notificationLogs={notificationLogs}
          syncing={syncing}
          syncingUsers={syncingUsers}
          onSync={handleSyncDepartments}
          onSyncUsers={handleSyncUsers}
        />

        <div id="vehicles"><VehicleTable vehicles={vehicles} /></div>
        <div className="two-column">
          <div id="applications">
            <ApplicationBoard
              applications={applications}
              onApprove={handleApproveApplication}
              onReject={handleRejectApplication}
            />
          </div>
          <div id="dispatch"><DispatchBoard dispatches={dispatches} /></div>
        </div>
        <div id="maintenance"><MaintenanceBoard records={maintenance} /></div>
        <div id="permissions"><PermissionBoard roles={roles} /></div>

        <section id="settings" className="panel footer-panel">
          <CheckCircle2 size={22} />
          <div>
            <h2>真实接口已接入</h2>
            <p>
              所有列表数据均来自后端 SQLite 数据库；飞书 OAuth 回调由
              <code>/api/auth/feishu/callback</code> 处理，登录后会自动绑定或创建本地用户。
            </p>
          </div>
        </section>
      </div>
    </main>
  )
}

export default App
