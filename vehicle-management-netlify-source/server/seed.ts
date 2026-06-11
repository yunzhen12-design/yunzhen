import { prisma } from './db'

// 默认数据写入；只有在表为空时执行，方便后续手动覆盖
export async function seedIfEmpty() {
  const [userCount, vehicleCount, roleCount, departmentCount, approvalRuleCount] = await Promise.all([
    prisma.user.count(),
    prisma.vehicle.count(),
    prisma.role.count(),
    prisma.department.count(),
    prisma.approvalRule.count(),
  ])

  if (roleCount === 0) {
    const seedRoles = [
      ['超级管理员', '拥有平台全部配置与业务管理权限', 'user:manage,role:manage,vehicle:*,application:*,dispatch:*,maintenance:*'],
      ['车辆管理员', '管理车辆档案、状态、维修保养和费用记录', 'vehicle:create,vehicle:update,maintenance:create,maintenance:update'],
      ['调度员', '处理已审批用车申请，分配车辆与司机', 'application:view,dispatch:create,dispatch:update,dispatch:complete'],
      ['部门审批人', '审批本部门员工提交的用车申请', 'application:approve,application:reject,application:view_department'],
      ['普通员工', '提交用车申请并查看自己的申请记录', 'application:create,application:view_own,application:cancel_own'],
    ]
    await prisma.role.createMany({
      data: seedRoles.map(([name, description, permissions]) => ({ name, description, permissions })),
    })
  }

  if (userCount === 0) {
    await prisma.user.create({
      data: {
        id: 'u_local_admin',
        name: '本地管理员',
        department: '行政部',
        departmentId: 'od-admin',
        feishuOpenId: null,
        role: '超级管理员',
        avatarUrl: '管',
      },
    })
  }

  if (departmentCount === 0) {
    await prisma.department.createMany({
      data: [
        { id: 'dept_admin', name: '行政部', parentId: null, feishuDepartmentId: 'od-admin', leaderUserId: 'u_local_admin' },
        { id: 'dept_sales', name: '销售中心', parentId: null, feishuDepartmentId: 'od-sales', leaderUserId: null },
        { id: 'dept_rd', name: '研发部', parentId: null, feishuDepartmentId: 'od-rd', leaderUserId: null },
        { id: 'dept_exec', name: '总经办', parentId: null, feishuDepartmentId: 'od-exec', leaderUserId: null },
      ],
    })
  }

  if (approvalRuleCount === 0) {
    await prisma.approvalRule.createMany({
      data: [
        { id: 'rule_admin', departmentId: 'od-admin', departmentName: '行政部', approverUserId: 'u_local_admin', approverRole: '部门审批人', priority: 10, enabled: true },
        { id: 'rule_sales', departmentId: 'od-sales', departmentName: '销售中心', approverUserId: 'u_local_admin', approverRole: '部门审批人', priority: 20, enabled: true },
        { id: 'rule_rd', departmentId: 'od-rd', departmentName: '研发部', approverUserId: 'u_local_admin', approverRole: '部门审批人', priority: 30, enabled: true },
      ],
    })
  }

  if (vehicleCount === 0) {
    const seedVehicles: Array<[string, string, string, string, string, number, string, string, number, string, string, string]> = [
      ['v_001', '京A·23891', '丰田', '赛那', '商务车', 7, '可用', '行政部', 38620, '2026-11-18', '2026-09-30', '李建华'],
      ['v_002', '京A·78216', '别克', 'GL8', '商务车', 7, '使用中', '销售中心', 52410, '2026-08-12', '2026-07-01', '王敏'],
      ['v_003', '京A·90127', '大众', '帕萨特', '轿车', 5, '维修中', '总经办', 68105, '2027-01-06', '2026-10-15', '赵磊'],
      ['v_004', '京A·33608', '比亚迪', '唐 DM-i', '新能源', 7, '可用', '研发部', 12680, '2027-03-22', '2027-03-22', '刘洋'],
    ]
    await prisma.vehicle.createMany({
      data: seedVehicles.map(([id, plateNo, brand, model, type, seats, status, department, mileage, insuranceDue, inspectionDue, owner]) => ({
        id,
        plateNo,
        brand,
        model,
        type,
        seats,
        status,
        department,
        mileage,
        insuranceDue,
        inspectionDue,
        owner,
      })),
    })

    await prisma.application.createMany({
      data: [
        { id: 'A20260611001', applicantUserId: null, currentApproverId: 'u_local_admin', applicant: '周琪', department: '销售中心', reason: '拜访重点客户并携带演示设备', passengers: 4, startAt: '2026-06-12 09:00', endAt: '2026-06-12 16:30', fromAddr: '总部园区', toAddr: '国贸客户办公室', needDriver: true, status: '待审批' },
        { id: 'A20260610008', applicantUserId: null, currentApproverId: 'u_local_admin', applicant: '沈清', department: '研发部', reason: '前往测试场地进行设备联调', passengers: 3, startAt: '2026-06-11 13:30', endAt: '2026-06-11 19:00', fromAddr: '研发楼', toAddr: '亦庄测试场', needDriver: false, status: '待调派' },
        { id: 'A20260609003', applicantUserId: null, currentApproverId: null, applicant: '林舟', department: '行政部', reason: '机场接待合作伙伴', passengers: 2, startAt: '2026-06-10 10:00', endAt: '2026-06-10 13:30', fromAddr: '公司南门', toAddr: '首都机场 T3', needDriver: true, status: '已完成' },
      ],
    })

    await prisma.dispatch.createMany({
      data: [
        { id: 'D20260610001', applicationId: 'A20260609003', plateNo: '京A·23891', driver: '李建华', plannedStart: '2026-06-10 10:00', plannedEnd: '2026-06-10 13:30', startMileage: 38520, endMileage: 38620, status: '已完成' },
        { id: 'D20260611002', applicationId: 'A20260610008', plateNo: '待分配', driver: '待分配', plannedStart: '2026-06-11 13:30', plannedEnd: '2026-06-11 19:00', startMileage: 0, endMileage: null, status: '待出车' },
      ],
    })

    await prisma.maintenanceRecord.createMany({
      data: [
        { id: 'M20260607001', plateNo: '京A·90127', type: '维修', title: '制动系统异响检查', vendor: '北城汽车服务中心', cost: 1260, handledBy: '赵磊', date: '2026-06-07', status: '处理中' },
        { id: 'M20260528003', plateNo: '京A·23891', type: '保养', title: '常规保养与机油更换', vendor: '丰田授权服务站', cost: 860, handledBy: '李建华', date: '2026-05-28', status: '已完成' },
      ],
    })
  }
}
