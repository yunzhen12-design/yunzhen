import { KeyRound, LogIn } from 'lucide-react'
import { useState } from 'react'
import { api } from './api'

interface Props {
  onLoggedIn: () => void
}

export default function Login({ onLoggedIn }: Props) {
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const params = new URLSearchParams(window.location.search)
  const loginStatus = params.get('login')
  const reason = params.get('reason')

  async function handleFeishuLogin() {
    setLoading(true)
    setError(null)
    try {
      const { url } = await api.feishuUrl()
      window.location.href = url
    } catch (err) {
      setError((err as Error).message)
      setLoading(false)
    }
  }

  async function handleDevLogin() {
    setLoading(true)
    setError(null)
    try {
      await api.devLogin()
      onLoggedIn()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-shell">
      <div className="login-card">
        <div className="login-icon"><KeyRound size={28} /></div>
        <h1>车辆管理平台</h1>
        <p>使用飞书账号登录，自动绑定本地角色与权限</p>

        {loginStatus === 'failed' && (
          <div className="login-error">飞书登录失败：{decodeURIComponent(reason || '请稍后再试')}</div>
        )}
        {error && <div className="login-error">{error}</div>}

        <button className="btn-primary" onClick={handleFeishuLogin} disabled={loading}>
          <LogIn size={18} />
          {loading ? '正在跳转飞书...' : '使用飞书登录'}
        </button>

        <button className="btn-ghost" onClick={handleDevLogin} disabled={loading}>
          本地开发登录（无飞书凭证时使用）
        </button>

        <div className="login-tip">
          需先在 <code>.env</code> 中配置 <code>FEISHU_APP_ID</code> 与 <code>FEISHU_APP_SECRET</code>
          ，并在飞书开放平台后台填写回调地址
          <code>http://localhost:4000/api/auth/feishu/callback</code>
        </div>
      </div>
    </div>
  )
}
