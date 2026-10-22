import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowDownRight, ArrowRight, BookOpen, CalendarDays, Check, ChevronDown,
  CircleHelp, Clock3, GraduationCap, LayoutDashboard, LogOut, LockKeyhole,
  Menu, Plus, ShieldCheck, Sparkles, Target, TrendingUp, X,
} from 'lucide-react'
import type { Contest, DailyStat, QuestionAttempt, StudySession } from './types'
import { isSupabaseConfigured, supabase } from './lib/supabase'

type ScreenState = 'loading' | 'login' | 'dashboard'
type SessionRow = Pick<StudySession, 'id' | 'contest_id' | 'started_at' | 'ended_at' | 'duration_seconds' | 'notes'>
const BRAZIL_TZ = 'America/Sao_Paulo'

function dateKey(date: Date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: BRAZIL_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date)
}

function dateDaysAgo(days: number) {
  const now = new Date()
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: BRAZIL_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now)
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '0'
  const localMidnight = new Date(Date.UTC(Number(part('year')), Number(part('month')) - 1, Number(part('day'))))
  localMidnight.setUTCDate(localMidnight.getUTCDate() - days)
  return localMidnight.toISOString().slice(0, 10)
}

function formatMinutes(total: number) {
  const minutes = Math.max(0, Math.floor(total))
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours === 0) return `${rest} min`
  if (rest === 0) return `${hours}h`
  return `${hours}h ${rest}min`
}

function greeting() {
  const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: BRAZIL_TZ, hour: '2-digit', hourCycle: 'h23' }).format(new Date()))
  if (hour < 12) return 'Bom dia'
  if (hour < 18) return 'Boa tarde'
  return 'Boa noite'
}

function todayLabel() {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: BRAZIL_TZ, weekday: 'long', day: 'numeric', month: 'long',
  }).format(new Date())
}

function shortDay(date: Date) {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: BRAZIL_TZ, weekday: 'short' })
    .format(date).replace('.', '').slice(0, 3)
}

const contestAccents = ['navy', 'wine', 'sand'] as const

export default function App() {
  const [screen, setScreen] = useState<ScreenState>('loading')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loginError, setLoginError] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)
  const [contests, setContests] = useState<Contest[]>([])
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [attempts, setAttempts] = useState<QuestionAttempt[]>([])
  const [loadingData, setLoadingData] = useState(false)
  const [dataError, setDataError] = useState('')
  const [isStudyModalOpen, setStudyModalOpen] = useState(false)
  const [selectedContest, setSelectedContest] = useState('')
  const [studyMinutes, setStudyMinutes] = useState('30')
  const [studyNotes, setStudyNotes] = useState('')
  const [savingStudy, setSavingStudy] = useState(false)
  const [studyError, setStudyError] = useState('')
  const [notice, setNotice] = useState('')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const loadDashboard = useCallback(async () => {
    setLoadingData(true)
    setDataError('')
    const since = new Date()
    since.setDate(since.getDate() - 31)
    const sinceIso = since.toISOString()

    const [contestResult, sessionResult, attemptResult] = await Promise.all([
      supabase.from('contests').select('id, slug, name, role, institution').order('created_at'),
      supabase.from('study_sessions')
        .select('id, contest_id, started_at, ended_at, duration_seconds, notes')
        .gte('started_at', sinceIso).order('started_at', { ascending: false }),
      supabase.from('question_attempts')
        .select('id, user_id, contest_id, answered_at, is_correct')
        .gte('answered_at', sinceIso).order('answered_at', { ascending: false }),
    ])

    const firstError = contestResult.error || sessionResult.error || attemptResult.error
    if (firstError) {
      setDataError('Não foi possível carregar os dados. Confirme se a migração do banco foi aplicada no Supabase.')
    } else {
      setContests((contestResult.data ?? []) as Contest[])
      setSessions((sessionResult.data ?? []) as SessionRow[])
      setAttempts((attemptResult.data ?? []) as QuestionAttempt[])
      setSelectedContest((current) => current || contestResult.data?.[0]?.id || '')
    }
    setLoadingData(false)
  }, [])

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setScreen('login')
      return
    }
    let alive = true
    supabase.auth.getSession().then(({ data }) => {
      if (alive) setScreen(data.session ? 'dashboard' : 'login')
    }).catch(() => {
      if (alive) setScreen('login')
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (alive) setScreen(session ? 'dashboard' : 'login')
    })
    return () => {
      alive = false
      listener.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (screen === 'dashboard') void loadDashboard()
  }, [screen, loadDashboard])

  const dailyStats = useMemo<DailyStat[]>(() => {
    const days: DailyStat[] = []
    for (let i = 6; i >= 0; i--) {
      const key = dateDaysAgo(i)
      const date = new Date(`${key}T12:00:00Z`)
      const daySessions = sessions.filter((item) => dateKey(new Date(item.started_at)) === key)
      const dayAttempts = attempts.filter((item) => dateKey(new Date(item.answered_at)) === key)
      days.push({
        key,
        label: i === 0 ? 'Hoje' : shortDay(date),
        minutes: Math.round(daySessions.reduce((sum, item) => sum + (item.duration_seconds || 0), 0) / 60),
        questions: dayAttempts.length,
      })
    }
    return days
  }, [sessions, attempts])

  const todayKey = dateKey(new Date())
  const todayMinutes = Math.round(sessions
    .filter((item) => dateKey(new Date(item.started_at)) === todayKey)
    .reduce((sum, item) => sum + (item.duration_seconds || 0), 0) / 60)
  const todayQuestions = attempts.filter((item) => dateKey(new Date(item.answered_at)) === todayKey).length
  const weekMinutes = dailyStats.reduce((sum, day) => sum + day.minutes, 0)
  const weekQuestions = dailyStats.reduce((sum, day) => sum + day.questions, 0)
  const maxMinutes = Math.max(60, ...dailyStats.map((day) => day.minutes))
  const maxQuestions = Math.max(5, ...dailyStats.map((day) => day.questions))

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoginError('')
    if (!isSupabaseConfigured) {
      setLoginError('O Supabase ainda não foi configurado. Consulte as instruções do projeto.')
      return
    }
    if (!password.trim()) {
      setLoginError('Digite a senha de acesso.')
      return
    }
    setLoginLoading(true)
    try {
      const { data, error } = await supabase.functions.invoke('password-login', {
        body: { password },
      })
      if (error || !data?.access_token || !data?.refresh_token) {
        setLoginError(data?.error || 'Não foi possível entrar. Verifique a configuração e tente novamente.')
        return
      }
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
      })
      if (sessionError) {
        setLoginError('A sessão não pôde ser iniciada. Tente novamente.')
        return
      }
      setPassword('')
    } catch {
      setLoginError('Não foi possível conectar ao servidor de autenticação.')
    } finally {
      setLoginLoading(false)
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    setContests([])
    setSessions([])
    setAttempts([])
    setMobileMenuOpen(false)
  }

  async function saveStudy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setStudyError('')
    const minutes = Number(studyMinutes)
    if (!selectedContest) {
      setStudyError('Selecione um concurso.')
      return
    }
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 720) {
      setStudyError('Informe um tempo entre 1 e 720 minutos.')
      return
    }
    setSavingStudy(true)
    const { data: authData } = await supabase.auth.getUser()
    if (!authData.user) {
      setStudyError('Sua sessão expirou. Entre novamente.')
      setSavingStudy(false)
      return
    }
    const endedAt = new Date()
    const startedAt = new Date(endedAt.getTime() - minutes * 60_000)
    const { error } = await supabase.from('study_sessions').insert({
      user_id: authData.user.id,
      contest_id: selectedContest,
      started_at: startedAt.toISOString(),
      ended_at: endedAt.toISOString(),
      duration_seconds: minutes * 60,
      notes: studyNotes.trim() || null,
    })
    setSavingStudy(false)
    if (error) {
      setStudyError('Não foi possível salvar. Confira a conexão e as permissões do banco.')
      return
    }
    setStudyModalOpen(false)
    setStudyMinutes('30')
    setStudyNotes('')
    setNotice('Sessão de estudo registrada.')
    await loadDashboard()
  }

  if (screen !== 'dashboard') {
    return (
      <main className="login-shell">
        <div className="login-decoration decoration-one" />
        <div className="login-decoration decoration-two" />
        <section className="login-card" aria-labelledby="login-title">
          <div className="brand-mark" aria-hidden="true"><span>A</span><Check size={18} strokeWidth={2.8} /></div>
          <div className="login-eyebrow"><LockKeyhole size={14} /> ACESSO PESSOAL</div>
          <h1 id="login-title">Aprova <span>Lay</span></h1>
          <p className="login-subtitle">Seu espaço de preparação para concursos.</p>
          <form onSubmit={handleLogin} className="login-form">
            <label htmlFor="access-password">Senha de acesso</label>
            <div className="password-field">
              <input
                id="access-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Digite sua senha"
                autoComplete="current-password"
                autoFocus
                disabled={loginLoading}
              />
              <button type="button" className="text-button" onClick={() => setShowPassword((value) => !value)}>
                {showPassword ? 'Ocultar' : 'Mostrar'}
              </button>
            </div>
            {loginError && <p className="form-error" role="alert">{loginError}</p>}
            {!isSupabaseConfigured && <p className="setup-note">Configuração inicial pendente: conecte as variáveis públicas do Supabase para ativar o acesso.</p>}
            <button className="primary-button login-submit" type="submit" disabled={loginLoading}>
              {loginLoading ? 'Validando acesso…' : 'Entrar'} <ArrowRight size={17} />
            </button>
          </form>
          <div className="login-footnote"><ShieldCheck size={16} /> Acesso privado com sessão autenticada</div>
        </section>
        <div className="login-bottom">Um passo de cada vez.</div>
      </main>
    )
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileMenuOpen ? 'sidebar-open' : ''}`}>
        <div className="sidebar-brand">
          <div className="brand-mark small" aria-hidden="true"><span>A</span><Check size={13} strokeWidth={2.8} /></div>
          <span>Aprova <strong>Lay</strong></span>
          <button className="mobile-close icon-button" aria-label="Fechar menu" onClick={() => setMobileMenuOpen(false)}><X size={20} /></button>
        </div>
        <div className="sidebar-section-label">ESPAÇO DE ESTUDO</div>
        <button className="nav-item active" onClick={() => setMobileMenuOpen(false)}><LayoutDashboard size={18} /> Visão geral</button>
        <button className="nav-item" onClick={() => { setStudyModalOpen(true); setMobileMenuOpen(false) }}><Clock3 size={18} /> Registrar estudo</button>
        <div className="sidebar-divider" />
        <div className="sidebar-section-label">SEUS CONCURSOS</div>
        {contests.map((contest, index) => (
          <button key={contest.id} className="nav-item contest-nav" onClick={() => { setSelectedContest(contest.id); setStudyModalOpen(true); setMobileMenuOpen(false) }}>
            <span className={`contest-dot ${contestAccents[index % contestAccents.length]}`} />
            <span>{contest.name}</span>
          </button>
        ))}
        <div className="sidebar-bottom">
          <div className="privacy-note"><ShieldCheck size={17} /><span>Seu progresso é pessoal e privado.</span></div>
          <button className="nav-item logout-button" onClick={handleLogout}><LogOut size={18} /> Sair</button>
        </div>
      </aside>

      {mobileMenuOpen && <button className="mobile-overlay" aria-label="Fechar menu" onClick={() => setMobileMenuOpen(false)} />}

      <main className="main-content">
        <header className="topbar">
          <button className="mobile-menu-button icon-button" aria-label="Abrir menu" onClick={() => setMobileMenuOpen(true)}><Menu size={21} /></button>
          <div className="breadcrumb"><span>Meu espaço</span><span className="breadcrumb-slash">/</span><strong>Visão geral</strong></div>
          <div className="topbar-right"><span className="private-pill"><span /> Pessoal</span><div className="avatar">L</div></div>
        </header>

        <div className="page-content">
          <section className="welcome-row">
            <div>
              <p className="date-line"><CalendarDays size={15} /> {todayLabel()}</p>
              <h1>{greeting()}, Lay<span className="hello-dot">.</span></h1>
              <p className="welcome-subtitle">Seu progresso, no seu ritmo.</p>
            </div>
            <button className="primary-button" onClick={() => setStudyModalOpen(true)}><Plus size={18} /> Registrar estudo</button>
          </section>

          {notice && <button className="notice-banner" onClick={() => setNotice('')}><Check size={16} /> {notice}<X size={15} /></button>}
          {dataError && <div className="error-banner" role="alert"><CircleHelp size={18} /><div><strong>Dados indisponíveis</strong><p>{dataError}</p></div></div>}

          <section className="metrics-grid" aria-label="Resumo de estudos">
            <article className="metric-card">
              <div className="metric-top"><span className="metric-icon navy-icon"><Clock3 size={19} /></span><span className="metric-period">HOJE</span></div>
              <p className="metric-label">Tempo estudado</p>
              <div className="metric-value">{loadingData ? '—' : formatMinutes(todayMinutes)}</div>
              <div className="metric-foot"><span className="metric-foot-muted">Acumulado de hoje</span></div>
            </article>
            <article className="metric-card">
              <div className="metric-top"><span className="metric-icon wine-icon"><BookOpen size={19} /></span><span className="metric-period">HOJE</span></div>
              <p className="metric-label">Questões respondidas</p>
              <div className="metric-value">{loadingData ? '—' : todayQuestions}</div>
              <div className="metric-foot"><span className="metric-foot-muted">Respostas registradas</span></div>
            </article>
            <article className="metric-card">
              <div className="metric-top"><span className="metric-icon sand-icon"><TrendingUp size={19} /></span><span className="metric-period">7 DIAS</span></div>
              <p className="metric-label">Tempo de estudo</p>
              <div className="metric-value">{loadingData ? '—' : formatMinutes(weekMinutes)}</div>
              <div className="metric-foot"><span className="metric-foot-muted">Últimos 7 dias</span></div>
            </article>
            <article className="metric-card">
              <div className="metric-top"><span className="metric-icon blue-icon"><Target size={19} /></span><span className="metric-period">7 DIAS</span></div>
              <p className="metric-label">Questões respondidas</p>
              <div className="metric-value">{loadingData ? '—' : weekQuestions}</div>
              <div className="metric-foot"><span className="metric-foot-muted">Últimos 7 dias</span></div>
            </article>
          </section>

          <section className="dashboard-grid">
            <article className="panel evolution-panel">
              <div className="panel-heading">
                <div><div className="panel-title-row"><h2>Evolução diária</h2><span className="panel-subtle-icon"><TrendingUp size={16} /></span></div><p>Seu tempo de estudo nos últimos 7 dias</p></div>
                <span className="chart-unit">MINUTOS</span>
              </div>
              <div className="chart-area">
                <div className="chart-y-labels"><span> {Math.round(maxMinutes)} </span><span>{Math.round(maxMinutes / 2)}</span><span>0</span></div>
                <div className="bar-chart">
                  {dailyStats.map((day) => (
                    <div className="bar-column" key={day.key}>
                      <div className="bar-track"><div className={`bar-fill ${day.key === todayKey ? 'bar-today' : ''}`} style={{ height: `${Math.min(100, day.minutes / maxMinutes * 100)}%` }} title={formatMinutes(day.minutes)} /></div>
                      <span className={day.key === todayKey ? 'day-label day-today' : 'day-label'}>{day.label}</span>
                    </div>
                  ))}
                </div>
              </div>
              {weekMinutes === 0 && !loadingData && <div className="chart-empty"><span><TrendingUp size={18} /></span><p>Seu histórico começa aqui. Registre seu primeiro estudo para acompanhar a evolução.</p></div>}
              <div className="panel-bottom-line"><span><span className="legend-dot" /> Tempo registrado</span><span className="panel-bottom-value">{formatMinutes(weekMinutes)} na semana</span></div>
            </article>

            <article className="panel focus-panel">
              <div className="panel-heading"><div><h2>Ritmo da semana</h2><p>Questões por dia</p></div><span className="panel-subtle-icon"><BookOpen size={17} /></span></div>
              <div className="question-week-total"><strong>{loadingData ? '—' : weekQuestions}</strong><span>questões<br />respondidas</span></div>
              <div className="mini-week-chart">
                {dailyStats.map((day) => (
                  <div className="mini-day" key={day.key}>
                    <div className="mini-bar-track"><div className={`mini-bar-fill ${day.key === todayKey ? 'bar-today' : ''}`} style={{ height: `${Math.min(100, day.questions / maxQuestions * 100)}%` }} /></div>
                    <span>{day.label}</span>
                  </div>
                ))}
              </div>
              <div className="focus-footer"><span className="focus-footer-icon"><ArrowDownRight size={16} /></span><span>O importante é manter a constância.</span></div>
            </article>
          </section>

          <section className="section-heading"><div><h2>Seus concursos</h2><p>Organize sua preparação por objetivo.</p></div><span className="section-count">{contests.length.toString().padStart(2, '0')} concursos</span></section>
          <section className="contest-grid">
            {contests.map((contest, index) => {
              const accent = contestAccents[index % contestAccents.length]
              const contestSessions = sessions.filter((item) => item.contest_id === contest.id)
              const minutes = Math.round(contestSessions.reduce((sum, item) => sum + (item.duration_seconds || 0), 0) / 60)
              const count = attempts.filter((item) => item.contest_id === contest.id).length
              return (
                <article className="contest-card" key={contest.id}>
                  <div className={`contest-card-accent ${accent}`} />
                  <div className="contest-card-head"><div className={`contest-symbol ${accent}`}><GraduationCap size={20} /></div><span className="contest-status"><span /> Em preparação</span></div>
                  <p className="contest-institution">{contest.institution}</p>
                  <h3>{contest.role}</h3>
                  <div className="contest-stats"><div><Clock3 size={15} /><span>{formatMinutes(minutes)}</span><small>registrados</small></div><div><BookOpen size={15} /><span>{count}</span><small>questões</small></div></div>
                  <button className="contest-action" onClick={() => { setSelectedContest(contest.id); setStudyModalOpen(true) }}>Registrar estudo <ArrowRight size={16} /></button>
                </article>
              )
            })}
            {!loadingData && contests.length === 0 && !dataError && <div className="empty-card"><GraduationCap size={22} /><strong>Nenhum concurso disponível</strong><p>Os concursos aparecerão aqui quando o banco estiver configurado.</p></div>}
          </section>

          <section className="bottom-grid">
            <article className="review-card">
              <div className="review-icon"><Sparkles size={19} /></div>
              <div className="review-copy"><h3>Revisões pendentes</h3><p>Seu espaço de revisões ficará disponível quando a biblioteca de questões for ativada.</p></div>
              <span className="coming-soon">Próxima etapa <ChevronDown size={14} /></span>
            </article>
            <article className="consistency-card"><div className="consistency-icon"><Target size={19} /></div><div><h3>Pequenos passos contam</h3><p>Registre o que você fez hoje. Seu histórico vai mostrar o caminho percorrido.</p></div></article>
          </section>

          <footer className="page-footer"><span>Aprova Lay</span><span>Preparação pessoal · {new Date().getFullYear()}</span></footer>
        </div>
      </main>

      {isStudyModalOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setStudyModalOpen(false) }}>
          <section className="study-modal" role="dialog" aria-modal="true" aria-labelledby="study-modal-title">
            <div className="modal-head"><div><span className="modal-kicker">HISTÓRICO DE ESTUDO</span><h2 id="study-modal-title">Registrar estudo</h2><p>Adicione uma sessão que você já concluiu.</p></div><button className="icon-button" aria-label="Fechar" onClick={() => setStudyModalOpen(false)}><X size={20} /></button></div>
            <form onSubmit={saveStudy}>
              <label htmlFor="contest-select">Concurso</label>
              <select id="contest-select" value={selectedContest} onChange={(event) => setSelectedContest(event.target.value)} required>
                <option value="" disabled>Selecione um concurso</option>
                {contests.map((contest) => <option key={contest.id} value={contest.id}>{contest.name} — {contest.role}</option>)}
              </select>
              <label htmlFor="study-duration">Tempo estudado</label>
              <div className="duration-input"><input id="study-duration" type="number" min="1" max="720" step="1" value={studyMinutes} onChange={(event) => setStudyMinutes(event.target.value)} required /><span>minutos</span></div>
              <label htmlFor="study-notes">Anotações <span className="optional-label">Opcional</span></label>
              <textarea id="study-notes" rows={3} maxLength={500} value={studyNotes} onChange={(event) => setStudyNotes(event.target.value)} placeholder="Ex.: revisão de redes de computadores" />
              <p className="modal-hint"><ShieldCheck size={15} /> O registro usa o horário atual e não cria questões fictícias.</p>
              {studyError && <p className="form-error" role="alert">{studyError}</p>}
              <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setStudyModalOpen(false)}>Cancelar</button><button type="submit" className="primary-button" disabled={savingStudy}>{savingStudy ? 'Salvando…' : 'Salvar sessão'} <Check size={16} /></button></div>
            </form>
          </section>
        </div>
      )}
    </div>
  )
}
