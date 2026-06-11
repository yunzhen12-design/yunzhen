# 车辆管理平台

企业内部车辆管理与飞书登录集成平台，已接入真实数据库、飞书 OAuth 回调、飞书部门同步、审批工作流接口和消息卡片通知。

## 技术栈

- 前端：Vite + React 19 + TypeScript
- 后端：Express + TypeScript（tsx 直接运行）
- 数据库：PostgreSQL + Prisma Client
- 登录：飞书 OAuth + HttpOnly Cookie 会话
- 权限：RBAC 角色与权限配置

## 目录结构

```
vehicle-management/
├── server/                   后端服务
│   ├── index.ts              Express 入口
│   ├── db.ts                 Prisma Client 连接
│   ├── seed.ts               默认角色与示例数据
│   ├── feishu.ts             飞书 OAuth、部门同步与消息卡片工具
│   └── routes.ts             业务接口与认证接口
├── src/                      前端
│   ├── App.tsx               主页面（登录后展示）
│   ├── Login.tsx             登录页
│   ├── api.ts                API 客户端与类型
│   ├── main.tsx
│   └── style.css
├── prisma/
│   ├── schema.prisma         PostgreSQL 数据模型
│   └── seed.ts               Prisma 默认数据种子
├── .env.example              环境变量模板
├── tsconfig.json             前端 TS 配置
├── tsconfig.server.json      后端 TS 配置
└── package.json
```

## 快速开始

```powershell
npm install
copy .env.example .env       # 然后填入真实飞书凭证
npm run db:start              # 启动本地 PostgreSQL，端口 55432
npx prisma db push            # 创建 PostgreSQL 表结构
npm run seed                  # 写入默认数据
npm run dev
```

`npm run dev` 会同时启动：

- 前端 `http://localhost:5173`
- 后端 `http://localhost:4000`

前端通过 Vite 代理把 `/api/*` 转发到后端。

如果重启电脑后数据库没有启动，先执行：

```powershell
npm run db:start
```

停止本地数据库：

```powershell
npm run db:stop
```

## 部署到 Netlify

Netlify 负责托管前端静态 HTML 文件，后端 Express + PostgreSQL 需要另外部署到可公网访问的服务器，例如 Render、Railway、Fly.io、ECS 或公司服务器。

前端已经支持 Netlify：

```text
netlify.toml
```

Netlify 构建配置：

```text
Build command: npm run build:netlify
Publish directory: dist
```

Netlify 环境变量：

```env
VITE_API_BASE_URL=https://你的后端公网域名/api
```

如果你的后端部署地址是：

```text
https://vehicle-api.example.com
```

那 Netlify 里应填写：

```env
VITE_API_BASE_URL=https://vehicle-api.example.com/api
```

飞书后台的重定向 URL 也要改成后端公网地址：

```text
https://vehicle-api.example.com/api/auth/feishu/callback
```

卡片回调地址：

```text
https://vehicle-api.example.com/api/feishu/card-callback
```

后端 `.env` 里的 `FRONTEND_URL` 要改成 Netlify 站点地址，例如：

```env
FRONTEND_URL=https://你的站点.netlify.app
```

## 飞书登录配置

1. 打开飞书开放平台，创建一个“自建应用”
2. 在凭证与基础信息里复制 `App ID` 和 `App Secret`
3. 在 `安全设置 → 重定向 URL` 中加入：
   ```
   http://localhost:4000/api/auth/feishu/callback
   ```
4. 在飞书卡片回调或事件订阅配置中加入：
   ```
   http://localhost:4000/api/feishu/card-callback
   ```
5. 在应用 `权限管理` 中开通：
   - `获取用户基本信息`
   - `获取用户邮箱`（如需要）
   - `获取部门基础信息`
   - `获取通讯录部门组织架构信息`
   - `获取通讯录用户组织架构信息`
   - `发送消息给用户`
6. 把凭证写入项目根目录 `.env`：
   ```env
   DATABASE_URL="postgresql://postgres:postgres@localhost:5432/vehicle_management?schema=public"
   FEISHU_APP_ID=cli_xxxxxxxx
   FEISHU_APP_SECRET=xxxxxxxxxxxxxxxxxx
   FEISHU_REDIRECT_URI=http://localhost:4000/api/auth/feishu/callback
   FEISHU_VERIFICATION_TOKEN=xxxxxxxxxxxxxxxx
   FRONTEND_URL=http://localhost:5173
   ```
7. 重启 `npm run dev`，登录页点击“使用飞书登录”即可走真实 OAuth 流程。

> 没有飞书凭证时，登录页提供“本地开发登录”按钮，会以默认管理员账号建立会话，便于本地体验。

## 数据库

当前后端使用 Prisma Client 连接 PostgreSQL。请先创建数据库，并在 `.env` 中配置：

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/vehicle_management?schema=public"
```

常用命令：

```powershell
npm run prisma:generate       # 生成 Prisma Client
npm run prisma:migrate        # 开发环境创建/更新表结构
npm run prisma:deploy         # 生产环境应用已提交迁移
npm run seed                  # 写入默认角色与示例车辆、申请、调派、维修数据
```

后端启动时会检查数据库连接，并在表为空时写入默认数据；也可以通过 `npm run seed` 手动执行种子。

数据表：

| 表 | 说明 |
|---|---|
| `users` | 系统用户，绑定飞书 OpenID |
| `sessions` | Cookie 会话表 |
| `vehicles` | 车辆档案 |
| `applications` | 用车申请 |
| `departments` | 飞书部门同步结果 |
| `approval_rules` | 按部门匹配审批人的规则 |
| `approval_records` | 审批流记录 |
| `dispatches` | 车辆调派 |
| `maintenance_records` | 维修保养记录 |
| `roles` | RBAC 角色与权限 |
| `notification_logs` | 飞书消息卡片发送日志 |

## 主要接口

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/auth/feishu/url` | 生成飞书授权地址 |
| GET | `/api/auth/feishu/callback` | 飞书 OAuth 回调，写入会话 |
| GET | `/api/auth/me` | 当前登录用户 |
| POST | `/api/auth/logout` | 退出登录 |
| POST | `/api/auth/dev-login` | 本地开发登录（无飞书凭证时使用） |
| GET / POST | `/api/vehicles` | 车辆档案 |
| GET / POST | `/api/applications` | 用车申请 |
| POST | `/api/applications/:id/approve` | 审批通过，状态变为待调派，并尝试发送飞书卡片 |
| POST | `/api/applications/:id/reject` | 驳回申请，并尝试发送飞书卡片 |
| GET | `/api/applications/:id/approvals` | 审批记录 |
| GET | `/api/dispatches` | 车辆调派 |
| POST | `/api/dispatches` | 创建调派记录，并尝试发送调派通知 |
| GET | `/api/maintenance` | 维修记录 |
| GET | `/api/roles` | 角色与权限 |
| GET | `/api/users` | 本地用户与飞书用户绑定结果 |
| GET / POST | `/api/approval-rules` | 审批人规则配置 |
| GET | `/api/departments` | 本地部门列表 |
| POST | `/api/feishu/sync-departments` | 从飞书通讯录同步部门 |
| POST | `/api/feishu/sync-users` | 从飞书通讯录同步用户 |
| POST | `/api/feishu/card-callback` | 飞书消息卡片按钮回调，用于卡片内审批 |
| POST | `/api/notifications/feishu/card` | 手动发送飞书消息卡片 |
| GET | `/api/notification-logs` | 查看最近 50 条通知日志 |

## 当前工作流

1. 用户通过飞书登录，系统绑定 `open_id` 并创建本地用户
2. 员工提交用车申请，系统按 `approval_rules` 的部门规则自动写入 `current_approver_id`
3. 审批人调用审批接口或在页面点击“审批通过”，申请变为 `待调派`，同时清空当前审批人
4. 调度员创建调派记录，系统记录车辆、司机和计划时间
5. 审批或调派时，系统会读取申请人的飞书 `open_id`，发送消息卡片；如果申请人不是飞书登录用户，会写入 `skipped` 通知日志
6. 管理员可在页面点击“同步飞书部门”和“同步飞书用户”，将飞书通讯录组织数据保存到本地表
7. 审批人收到飞书卡片后，可直接点击“同意 / 驳回”；飞书会回调 `/api/feishu/card-callback`，系统写入审批记录并更新申请状态

## 构建验证

```powershell
npm run build
npm run build:server
```
