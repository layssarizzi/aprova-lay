export type Contest = {
  id: string
  slug: string
  name: string
  role: string
  institution: string
}

export type StudySession = {
  id: string
  user_id: string
  contest_id: string
  exam_id: string | null
  started_at: string
  ended_at: string | null
  duration_seconds: number
  notes: string | null
}

export type QuestionAttempt = {
  id: string
  user_id: string
  contest_id: string
  answered_at: string
  is_correct: boolean | null
}

export type DailyStat = {
  key: string
  label: string
  minutes: number
  questions: number
}
