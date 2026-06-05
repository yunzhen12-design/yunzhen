"""
行政车辆管理系统 - 飞书免登后端服务
部署到Render平台
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import requests
import time
import os
import json

app = Flask(__name__)
CORS(app, origins=[
    'https://serene-kulfi-3f047c.netlify.app',
    'http://localhost:5000'
])

FS_APP_ID = 'cli_aaabfe578c799ccb'
FS_APP_SECRET = os.environ.get('FS_APP_SECRET', '')
REDIRECT_URI = 'https://serene-kulfi-3f047c.netlify.app/'

DATA_DIR = os.environ.get('DATA_DIR', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data'))
os.makedirs(DATA_DIR, exist_ok=True)

def load_data(filename):
    path = os.path.join(DATA_DIR, filename)
    if not os.path.exists(path): return []
    with open(path, 'r', encoding='utf-8') as f: return json.load(f)

def save_data(filename, data):
    path = os.path.join(DATA_DIR, filename)
    with open(path, 'w', encoding='utf-8') as f: json.dump(data, f, ensure_ascii=False, indent=2)

DEFAULT_ROLES = [
    {'id':'R001','name':'系统管理员','code':'admin','desc':'拥有全部权限','permissions':['all']},
    {'id':'R002','name':'部门负责人','code':'dept_head','desc':'审批本部门用车申请','permissions':['approve_dept']},
    {'id':'R003','name':'行政部审批人','code':'admin_approver','desc':'行政部审批+派车','permissions':['approve_admin','dispatch']},
    {'id':'R004','name':'普通成员','code':'member','desc':'提交用车申请','permissions':['apply']},
    {'id':'R005','name':'驾驶员','code':'driver','desc':'查看派车任务','permissions':['view_dispatch']}
]
DEFAULT_APPROVAL_FLOW = [
    {'step':1,'name':'部门负责人审批','role_code':'dept_head','desc':'部门负责人审核本部门用车申请'},
    {'step':2,'name':'行政部审批','role_code':'admin_approver','desc':'行政部终审并安排派车'}
]

if not load_data('roles.json'): save_data('roles.json', DEFAULT_ROLES)
if not load_data('approval_flow.json'): save_data('approval_flow.json', DEFAULT_APPROVAL_FLOW)
if not load_data('users.json'): save_data('users.json', [])

_token_cache = {'token':'','expire_time':0}

def get_app_access_token():
    if _token_cache['token'] and _token_cache['expire_time'] > time.time()+60: return _token_cache['token']
    url = 'https://open.feishu.cn/open-apis/auth/v3/app_access_token/internal'
    payload = {'app_id':FS_APP_ID,'app_secret':FS_APP_SECRET}
    try:
        resp = requests.post(url,json=payload,timeout=10)
        data = resp.json()
        if data.get('code')==0:
            _token_cache['token']=data['app_access_token']
            _token_cache['expire_time']=time.time()+data.get('expire',7200)
            return data['app_access_token']
        return None
    except: return None

def get_user_access_token(code):
    app_token = get_app_access_token()
    if not app_token: return None
    url = 'https://open.feishu.cn/open-apis/authen/v1/oidc/access_token'
    headers = {'Authorization':'Bearer '+app_token,'Content-Type':'application/json'}
    payload = {'grant_type':'authorization_code','code':code}
    try:
        resp = requests.post(url,headers=headers,json=payload,timeout=10)
        data = resp.json()
        if data.get('code')==0: return data['data']
        return None
    except: return None

def get_user_info_from_feishu(user_access_token):
    url = 'https://open.feishu.cn/open-apis/authen/v1/user_info'
    headers = {'Authorization':'Bearer '+user_access_token}
    try:
        resp = requests.get(url,headers=headers,timeout=10)
        data = resp.json()
        if data.get('code')==0: return data['data']
        return None
    except: return None

def get_department_name(dept_id):
    app_token = get_app_access_token()
    if not app_token: return '未知部门'
    url = 'https://open.feishu.cn/open-apis/contact/v3/departments/'+dept_id
    headers = {'Authorization':'Bearer '+app_token}
    try:
        resp = requests.get(url,headers=headers,timeout=10)
        data = resp.json()
        if data.get('code')==0: return data.get('data',{}).get('department',{}).get('name','未知部门')
        return '未知部门'
    except: return '未知部门'

def get_or_create_user(open_id,name,dept_ids,avatar_url,email,mobile,employee_no):
    users = load_data('users.json')
    user = next((u for u in users if u['open_id']==open_id),None)
    if not user:
        role_code = 'admin' if len(users)==0 else 'member'
        dept_name = '未指定部门'
        if dept_ids and len(dept_ids)>0: dept_name = get_department_name(dept_ids[0])
        user = {'id':'U'+str(len(users)+1).zfill(3),'open_id':open_id,'name':name,'dept_name':dept_name,'dept_ids':dept_ids or [],'avatar_url':avatar_url or '',\
'email':email or '','mobile':mobile or '','employee_no':employee_no or '','role_code':role_code,'status':'active','created_at':time.strftime('%Y-%m-%d %H:%M:%S')}
        users.append(user);save_data('users.json',users)
    return user

def get_role_by_code(role_code):
    roles = load_data('roles.json')
    return next((r for r in roles if r['code']==role_code),None)

@app.route('/api/login',methods=['GET'])
def login():
    code = request.args.get('code','')
    if not code: return jsonify({'success':False,'error':'缺少授权码'}),400
    token_data = get_user_access_token(code)
    if not token_data: return jsonify({'success':False,'error':'授权码无效或已过期'}),400
    user_token = token_data.get('access_token')
    if not user_token: return jsonify({'success':False,'error':'获取用户token失败'}),400
    feishu_info = get_user_info_from_feishu(user_token)
    if not feishu_info: return jsonify({'success':False,'error':'获取飞书用户信息失败'}),400
    open_id=feishu_info.get('open_id','');name=feishu_info.get('name','');dept_ids=feishu_info.get('department_ids',[])
    avatar_url=feishu_info.get('avatar_url','');email=feishu_info.get('email','');mobile=feishu_info.get('mobile','');employee_no=feishu_info.get('employee_no','')
    local_user = get_or_create_user(open_id,name,dept_ids,avatar_url,email,mobile,employee_no)
    role = get_role_by_code(local_user['role_code'])
    return jsonify({'success':True,'user':{'id':local_user['id'],'name':local_user['name'],'dept_name':local_user['dept_name'],\
'open_id':local_user['open_id'],'avatar_url':local_user['avatar_url'],'email':local_user['email'],'mobile':local_user['mobile'],\
'employee_no':local_user['employee_no'],'role_code':local_user['role_code'],'role_name':role.get('name','') if role else '',\
'permissions':role.get('permissions',[]) if role else [],'is_admin':local_user['role_code']=='admin'}})

@app.route('/api/roles',methods=['GET'])
def get_roles(): return jsonify({'success':True,'roles':load_data('roles.json')})

@app.route('/api/roles',methods=['POST'])
def create_role():
    data=request.get_json();name=data.get('name','').strip();code=data.get('code','').strip()
    if not name or not code: return jsonify({'success':False,'error':'名称和编码不能为空'}),400
    roles=load_data('roles.json')
    if any(r['code']==code for r in roles): return jsonify({'success':False,'error':'编码已存在'}),400
    new_role={'id':'R'+str(len(roles)+1).zfill(3),'name':name,'code':code,'desc':data.get('desc','').strip(),'permissions':data.get('permissions',[])}
    roles.append(new_role);save_data('roles.json',roles);return jsonify({'success':True,'role':new_role})

@app.route('/api/roles/<role_id>',methods=['PUT'])
def update_role(role_id):
    data=request.get_json();roles=load_data('roles.json')
    idx=next((i for i,r in enumerate(roles) if r['id']==role_id),None)
    if idx is None: return jsonify({'success':False,'error':'角色不存在'}),404
    if roles[idx]['code']=='admin' and data.get('code')!='admin': return jsonify({'success':False,'error':'管理员角色编码不可修改'}),400
    roles[idx].update({'name':data.get('name',roles[idx]['name']),'code':data.get('code',roles[idx]['code']),'desc':data.get('desc',roles[idx]['desc']),\
'permissions':data.get('permissions',roles[idx]['permissions'])})
    save_data('roles.json',roles);return jsonify({'success':True,'role':roles[idx]})

@app.route('/api/roles/<role_id>',methods=['DELETE'])
def delete_role(role_id):
    roles=load_data('roles.json');idx=next((i for i,r in enumerate(roles) if r['id']==role_id),None)
    if idx is None: return jsonify({'success':False,'error':'角色不存在'}),404
    if roles[idx]['code']=='admin': return jsonify({'success':False,'error':'管理员角色不可删除'}),400
    users=load_data('users.json')
    if any(u['role_code']==roles[idx]['code'] for u in users): return jsonify({'success':False,'error':'该角色下还有用户'}),400
    roles.pop(idx);save_data('roles.json',roles);return jsonify({'success':True})

@app.route('/api/users',methods=['GET'])
def get_users():
    users=load_data('users.json')
    for u in users:
        role=get_role_by_code(u['role_code']);u['role_name']=role.get('name','') if role else ''
        u['permissions']=role.get('permissions',[]) if role else []
    return jsonify({'success':True,'users':users})

@app.route('/api/users/<user_id>',methods=['PUT'])
def update_user(user_id):
    data=request.get_json();new_role_code=data.get('role_code','').strip()
    if not new_role_code: return jsonify({'success':False,'error':'请指定角色'}),400
    role=get_role_by_code(new_role_code)
    if not role: return jsonify({'success':False,'error':'角色不存在'}),400
    users=load_data('users.json');idx=next((i for i,u in enumerate(users) if u['id']==user_id),None)
    if idx is None: return jsonify({'success':False,'error':'用户不存在'}),404
    users[idx]['role_code']=new_role_code;save_data('users.json',users);return jsonify({'success':True,'user':users[idx]})

@app.route('/api/users/<user_id>',methods=['DELETE'])
def delete_user(user_id):
    users=load_data('users.json');idx=next((i for i,u in enumerate(users) if u['id']==user_id),None)
    if idx is None: return jsonify({'success':False,'error':'用户不存在'}),404
    users.pop(idx);save_data('users.json',users);return jsonify({'success':True})

@app.route('/api/approval-flow',methods=['GET'])
def get_approval_flow(): return jsonify({'success':True,'flow':load_data('approval_flow.json')})

@app.route('/api/approval-flow',methods=['POST'])
def update_approval_flow():
    data=request.get_json();flow=data.get('flow',[]);roles=load_data('roles.json');role_codes=[r['code'] for r in roles]
    for step in flow:
        if step.get('role_code') not in role_codes: return jsonify({'success':False,'error':'角色不存在'}),400
    save_data('approval_flow.json',flow);return jsonify({'success':True,'flow':flow})

@app.route('/api/approval-flow/step',methods=['POST'])
def add_approval_step():
    data=request.get_json();flow=load_data('approval_flow.json')
    new_step={'step':len(flow)+1,'name':data.get('name','').strip(),'role_code':data.get('role_code','').strip(),'desc':data.get('desc','').strip()}
    if not new_step['name'] or not new_step['role_code']: return jsonify({'success':False,'error':'名称和角色不能为空'}),400
    role=get_role_by_code(new_step['role_code'])
    if not role: return jsonify({'success':False,'error':'角色不存在'}),400
    flow.append(new_step);save_data('approval_flow.json',flow);return jsonify({'success':True,'step':new_step})

@app.route('/api/approval-flow/step/<int:step_num>',methods=['DELETE'])
def delete_approval_step(step_num):
    flow=load_data('approval_flow.json');flow=[s for s in flow if s['step']!=step_num]
    for i,s in enumerate(flow): s['step']=i+1
    save_data('approval_flow.json',flow);return jsonify({'success':True})

@app.route('/api/department',methods=['GET'])
def get_department():
    dept_id=request.args.get('dept_id','')
    if not dept_id: return jsonify({'success':False,'error':'缺少部门ID'}),400
    return jsonify({'success':True,'name':get_department_name(dept_id),'department_id':dept_id})

@app.route('/api/health',methods=['GET'])
def health():
    return jsonify({'status':'ok','app_id':FS_APP_ID,'has_secret':bool(FS_APP_SECRET)})

if __name__=='__main__':
    port=int(os.environ.get('PORT',5000))
    app.run(host='0.0.0.0',port=port,debug=False)