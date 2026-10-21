import type { AiContext, AiTaskSuggestion } from '../types'

export const CTX: AiContext = {
  today: '2026-10-21',
  weekday: 'Wednesday',
  areas: ['Projects', 'School', 'Home'],
  openTasks: [
    { id: 't-resume', title: 'Update my resume', area: 'Projects', due: null, priority: 'normal' },
    { id: 't-portfolio', title: 'Update my portfolio', area: 'Projects', due: null, priority: 'normal' },
    { id: 't-essay', title: 'Write history essay', area: 'School', due: '2026-10-23', priority: 'high' },
  ],
}

export function suggestion(overrides: Partial<AiTaskSuggestion> = {}): AiTaskSuggestion {
  return {
    title: 'Publish the BOR Realty domain',
    area: 'Projects',
    due: '2026-10-24',
    horizon: 'week',
    priority: 'normal',
    effort: 'm',
    steps: ['Connect the domain', 'Check the site live', 'Add it to portfolio', 'Add it to resume'],
    notes: null,
    waitingOn: null,
    after: [],
    blocks: ['t-resume', 't-portfolio'],
    reason: 'Resume and portfolio should show the live site.',
    ...overrides,
  }
}
