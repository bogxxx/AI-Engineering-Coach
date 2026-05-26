/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/* Learning Center -- AI-personalized quizzes, code review games, and resources based on your Copilot usage */

import { DateFilter } from '../core/types';
import { rpc, COLORS } from './shared';
import { html, render, LoadingScreen } from './render';
import { renderSnakeGame } from './page-learning-snake';
import { renderCodeReviewRound, renderDidYouKnowHtml, renderQuiz, renderResourcesHtml } from './page-learning-templates';
import { SVG } from './svg-icons';
import {
  CachedResource,
  clearLearningPath,
  CodeComparisonRound,
  codeReviewCacheKey,
  DidYouKnowFact,
  didYouKnowCacheKey,
  EXCLUDED_LANGS,
  findConcept,
  getConceptsForLang,
  getState,
  groupLearningPath,
  LearningState,
  mergeLanguages,
  QuizQuestion,
  quizCacheKey,
  removeFromLearningPath,
  resourceCacheKey,
  saveState,
} from './page-learning-state';

async function generateQuizCached(
  state: LearningState,
  context: {
    languages: string[];
    focusConcepts: string[];
    difficulty: string;
    selectedLanguage: string | null;
    packageDeps: string[];
    selectedProjects: string[];
  },
): Promise<{ questions: QuizQuestion[]; fromCache: boolean; source?: 'llm' | 'builtin' }> {
  const key = quizCacheKey(context.languages, context.focusConcepts, context.difficulty, context.selectedLanguage);
  if (state.cachedQuizKey === key && state.cachedQuizzes.length > 0) {
    return { questions: state.cachedQuizzes, fromCache: true };
  }

  const result = await rpc<{ questions: QuizQuestion[]; source?: 'llm' | 'builtin' }>('generateLearningQuiz', {
    languages: context.languages,
    topics: context.focusConcepts,
    difficulty: context.difficulty,
    solved: state.solved,
    failed: state.failed,
    solvedSamples: state.solvedSamples.slice(-5),
    failedSamples: state.failedSamples.slice(-5),
    focusSkills: context.focusConcepts,
    packageDeps: context.packageDeps,
    customGoals: context.selectedLanguage
      ? [`Deep dive into ${context.selectedLanguage}: ${context.focusConcepts.join(', ') || 'advanced topics'}${context.selectedProjects.length > 0 ? ` (projects: ${context.selectedProjects.join(', ')})` : ''}`]
      : [],
  });

  const questions = result.questions ?? [];
  state.cachedQuizzes = questions;
  state.cachedQuizKey = key;
  saveState(state);
  return { questions, fromCache: false, source: result.source };
}

function showLearningSourceNote(sectionSelector: string, source?: 'llm' | 'builtin'): void {
  const section = document.querySelector(sectionSelector);
  section?.querySelector('.learn-builtin-note')?.remove();
  if (source !== 'builtin') return;
  const note = document.createElement('p');
  note.className = 'learn-builtin-note text-muted';
  note.style.cssText = 'font-size:11px;margin:0 0 8px 0;';
  note.textContent = 'Using built-in challenges (install GitHub Copilot for personalized content).';
  section?.querySelector('.learn-section-head')?.insertAdjacentElement('afterend', note);
}

/* ── Partial DOM Update Helpers ───────────────────────────────────── */

function updateSidebar(container: HTMLElement, state: LearningState, gaps: { lang: string; concept: string; passed: number; total: number }[]): void {
  const sidebar = container.querySelector('.learn-sidebar');
  if (!sidebar) return;

  // Update learning path
  const queueSection = document.getElementById('learn-queue-section');
  if (state.learningPath.length > 0) {
    const groups = groupLearningPath(state);
    const markup = html`
      <div class="learn-section-head"><h3>${SVG.target} Learning Path</h3></div>
      <div class="learn-focus-queue">
        ${[...groups.entries()].map(([lang, entries]) => html`
          <div class="learn-path-group">
            <div class="learn-path-lang">${lang}</div>
            ${entries.map(e => {
              const cdef = findConcept(e.conceptId, state, lang);
              return html`<div class="learn-queue-item">
                <span>${cdef?.name ?? e.conceptId}</span>
                <button class="learn-queue-remove" data-concept=${e.conceptId} data-lang=${lang} title="Remove">&times;</button>
              </div>`;
            })}
          </div>`)}
      </div>
      <button class="btn btn-secondary btn-sm" id="clear-focus-btn" style="margin-top:6px">Clear All</button>`;
    if (queueSection) {
      render(markup, queueSection);
    } else {
      const section = document.createElement('div');
      section.className = 'learn-section';
      section.id = 'learn-queue-section';
      sidebar.insertBefore(section, sidebar.firstChild);
      render(markup, section);
    }
  } else if (queueSection) {
    queueSection.remove();
  }

  // Update gaps
  const gapsSection = document.getElementById('learn-gaps-section');
  if (gaps.length > 0) {
    const gapsMarkup = html`
      <div class="learn-section-head"><h3>${SVG.warning} Knowledge Gaps</h3></div>
      <div class="learn-gap-list">
        ${gaps.slice(0, 6).map(g => html`
          <div class="learn-gap-item">
            <span class="learn-gap-name">${g.concept}</span>
            <span class="learn-gap-ratio" style="color:${COLORS.red}">${g.passed}/${g.total} in ${g.lang}</span>
          </div>`)}
      </div>`;
    if (gapsSection) {
      render(gapsMarkup, gapsSection);
    } else {
      const section = document.createElement('div');
      section.className = 'learn-section';
      section.id = 'learn-gaps-section';
      const queueEl = document.getElementById('learn-queue-section');
      const insertBefore = queueEl ? queueEl.nextSibling : sidebar.firstChild;
      sidebar.insertBefore(section, insertBefore);
      render(gapsMarkup, section);
    }
  } else if (gapsSection) {
    gapsSection.remove();
  }

  wireSidebarEvents(container, state);
}

function updateStats(state: LearningState): void {
  const totalAttempts = state.solved + state.failed;
  const accuracy = totalAttempts > 0 ? Math.round((state.solved / totalAttempts) * 100) : 0;
  const vals = document.querySelectorAll<HTMLElement>('.learn-stat-val');
  if (vals.length >= 6) {
    vals[0].textContent = String(state.solved);
    vals[1].textContent = String(state.failed);
    vals[2].textContent = `${accuracy}%`;
    vals[3].textContent = `${state.streak}/${state.bestStreak}`;
    vals[4].textContent = state.currentDifficulty;
    vals[5].textContent = String(state.learningPath.length);
  }
}

function buildLearningMarkup(
  state: LearningState,
  languages: { label: string; loc: number }[],
  workspaceNames: string[],
  flowState: { suggestions: string[] },
  gaps: { lang: string; concept: string; passed: number; total: number }[],
  diffColors: Record<string, string>,
) {
  const totalAttempts = state.solved + state.failed;
  const accuracy = totalAttempts > 0 ? Math.round((state.solved / totalAttempts) * 100) : 0;
  return html`
    <div class="learn-page">
      <div class="learn-hero"><div class="learn-hero-left"><div class="learn-hero-icon">${SVG.graduationCap}</div><div><h2 class="learn-hero-title">Learning Center</h2><p class="learn-hero-sub">Your AI-personalized upskilling program, built from your actual Copilot usage. The skill tree adapts to your languages, dependencies, and projects -- so everything you learn is directly applicable to your work. Explore freely, but pass quizzes to level up.</p></div></div></div>
      <div class="learn-stats">
        <div class="learn-stat"><div class="learn-stat-val" style="color:${COLORS.green}">${state.solved}</div><div class="learn-stat-lbl">Correct</div></div>
        <div class="learn-stat"><div class="learn-stat-val" style="color:${COLORS.red}">${state.failed}</div><div class="learn-stat-lbl">Incorrect</div></div>
        <div class="learn-stat"><div class="learn-stat-val" style="color:${COLORS.blue}">${accuracy}%</div><div class="learn-stat-lbl">Accuracy</div></div>
        <div class="learn-stat"><div class="learn-stat-val" style="color:${COLORS.yellow}">${state.streak}/${state.bestStreak}</div><div class="learn-stat-lbl">Streak / Best</div></div>
        <div class="learn-stat"><div class="learn-stat-val" style="color:${diffColors[state.currentDifficulty]}">${state.currentDifficulty}</div><div class="learn-stat-lbl">Difficulty</div></div>
        <div class="learn-stat"><div class="learn-stat-val">${state.learningPath.length}</div><div class="learn-stat-lbl">Learning Path</div></div>
      </div>
      ${state.streak >= 5 ? html`<div class="learn-reward-bar"><span>${SVG.snake}</span><span>5-answer streak! You earned a Snake game break.</span><button class="btn btn-primary btn-sm" id="play-snake-btn">Play</button></div>` : state.streak >= 3 ? html`<div class="learn-streak-bar">${SVG.fire} ${state.streak}-answer streak! ${5 - state.streak} more for a reward.</div>` : null}
      <div class="learn-columns">
        <div class="learn-main">
          <div class="learn-section learn-context-bar" id="learn-context-bar"><div class="learn-context-row"><div class="learn-lang-picker" id="global-lang-picker"><label class="learn-lang-picker-label">Language</label><div class="learn-lang-picker-options">${languages.map(l => html`<button class="learn-lang-pill ${l.label === state.selectedLanguage ? 'learn-lang-pill-active' : ''}" data-lang=${l.label}>${l.label}</button>`)}</div></div>${workspaceNames.length > 0 ? html`<div class="learn-project-picker" id="global-project-picker"><label class="learn-lang-picker-label">Projects</label><div class="learn-lang-picker-options">${workspaceNames.map(w => html`<button class="learn-lang-pill learn-project-pill ${state.selectedProjects.includes(w) ? 'learn-lang-pill-active' : ''}" data-project=${w}>${w}</button>`)}</div></div>` : null}</div></div>
          <div class="learn-section" id="quiz-section"><div class="learn-section-head"><h3>${SVG.terminal} ${state.selectedLanguage ? state.selectedLanguage + ' Challenge' : 'Coding Challenge'}</h3><span class="learn-diff-badge" style="background:${diffColors[state.currentDifficulty]}20;color:${diffColors[state.currentDifficulty]}">${state.currentDifficulty}</span></div><div id="quiz-container"><div class="learn-quiz-placeholder"><p class="text-muted">${state.selectedLanguage ? `Generate ${state.selectedLanguage} coding challenges.` : 'Pick a language above, then generate.'}</p><button class="btn btn-primary btn-sm" id="quiz-generate-btn" disabled=${!state.selectedLanguage}>${SVG.brain} Generate Quiz</button></div></div></div>
          <div class="learn-section" id="cr-section"><div class="learn-section-head"><h3>${SVG.code} Slop or Not</h3><span class="learn-cr-score-badge" id="cr-score">${state.codeReviewCorrect}/${state.codeReviewTotal}</span></div><div id="cr-container"><div class="learn-quiz-placeholder"><p class="text-muted">${state.selectedLanguage ? `Spot the slop in ${state.selectedLanguage} code.` : 'Pick a language above, then spot the slop.'}</p><button class="btn btn-primary btn-sm" id="cr-generate-btn" disabled=${!state.selectedLanguage}>${SVG.code} Play Slop or Not</button></div></div></div>
        </div>
        <div class="learn-sidebar">
          ${state.learningPath.length > 0 ? html`<div class="learn-section" id="learn-queue-section"><div class="learn-section-head"><h3>${SVG.target} Learning Path</h3></div><div class="learn-focus-queue">${[...groupLearningPath(state).entries()].map(([lang, entries]) => html`<div class="learn-path-group"><div class="learn-path-lang">${lang}</div>${entries.map(e => { const cdef = findConcept(e.conceptId, state, lang); return html`<div class="learn-queue-item"><span>${cdef?.name ?? e.conceptId}</span><button class="learn-queue-remove" data-concept=${e.conceptId} data-lang=${lang} title="Remove">&times;</button></div>`; })}</div>`)}</div><button class="btn btn-secondary btn-sm" id="clear-focus-btn" style="margin-top:6px">Clear All</button></div>` : null}
          ${gaps.length > 0 ? html`<div class="learn-section" id="learn-gaps-section"><div class="learn-section-head"><h3>${SVG.warning} Knowledge Gaps</h3></div><div class="learn-gap-list">${gaps.slice(0, 6).map(g => html`<div class="learn-gap-item"><span class="learn-gap-name">${g.concept}</span><span class="learn-gap-ratio" style="color:${COLORS.red}">${g.passed}/${g.total} in ${g.lang}</span></div>`)}</div></div>` : null}
          <div class="learn-section"><div class="learn-section-head"><h3>${SVG.book} Recommended Resources</h3></div><div class="learn-resource-list" id="learn-resources-container"><button class="btn btn-secondary btn-sm" id="resources-generate-btn" style="margin-top:2px">${SVG.refresh} Load Resources</button></div></div>
          <div class="learn-section"><div class="learn-section-head"><h3>${SVG.lightbulb} Did You Know?</h3></div><div class="learn-dyk-list" id="dyk-container"><button class="btn btn-secondary btn-sm" id="dyk-generate-btn" style="margin-top:2px">${SVG.lightbulb} Generate Tips</button></div></div>
          ${flowState.suggestions.length > 0 ? html`<div class="learn-section"><div class="learn-section-head"><h3>${SVG.zap} Focus Tips</h3></div><div class="learn-focus-list">${flowState.suggestions.slice(0, 4).map(s => html`<div class="learn-focus-item">${SVG.lightbulb} ${s}</div>`)}</div></div>` : null}
          <div class="learn-section"><div class="learn-section-head"><h3>${SVG.gamepad} Rewards</h3></div><div class="learn-reward-card ${state.snakeUnlocked ? 'learn-reward-unlocked' : ''}"><span class="learn-reward-icon">${SVG.snake}</span><div><div class="learn-reward-title">Snake Game</div><div class="learn-reward-desc">${state.snakeUnlocked ? `High score: ${state.snakeHighScore}` : 'Get 5 correct in a row'}</div></div></div></div>
        </div>
      </div>
    </div>`;
}

function restoreLearningSections(
  container: HTMLElement,
  state: LearningState,
  languages: { label: string; loc: number }[],
  workspaceNames: string[],
  gaps: { lang: string; concept: string }[],
  uniqueDeps: string[],
): void {
  const quizLangs = state.selectedLanguage ? [state.selectedLanguage] : languages.map(l => l.label);
  const focusNames = state.focusedConcepts.map(cid => findConcept(cid, state)?.name ?? cid);
  const quizKey = quizCacheKey(quizLangs, focusNames, state.currentDifficulty, state.selectedLanguage);
  if (state.cachedQuizKey === quizKey && state.cachedQuizzes.length > 0) {
    const quizEl = document.getElementById('quiz-container');
    if (quizEl) {
      render(renderQuiz(state.cachedQuizzes, 0), quizEl);
      wireQuizHandlers(container, state.cachedQuizzes, 0, state, uniqueDeps);
    }
  } else {
    showQuizPlaceholder();
  }

  const crKey = codeReviewCacheKey(quizLangs, state.currentDifficulty);
  if (state.cachedCodeReviewKey === crKey && state.cachedCodeReview.length > 0) {
    const crEl = document.getElementById('cr-container');
    if (crEl) {
      render(renderCodeReviewRound(state.cachedCodeReview, 0, state), crEl);
      wireCodeReviewHandlers(container, state.cachedCodeReview, 0, state);
    }
  } else {
    showCodeReviewPlaceholder();
  }

  const resKey = resourceCacheKey(languages.map(l => l.label), gaps.map(g => `${g.concept}-${g.lang}`), focusNames);
  if (state.cachedResourceKey === resKey && state.cachedResources.length > 0) {
    const resEl = document.getElementById('learn-resources-container');
    if (resEl) render(renderResourcesHtml(state.cachedResources), resEl);
  } else {
    showResourcesPlaceholder();
  }

  const dykKey = didYouKnowCacheKey(quizLangs, workspaceNames);
  if (state.cachedDidYouKnowKey === dykKey && state.cachedDidYouKnow.length > 0) {
    const dykEl = document.getElementById('dyk-container');
    if (dykEl) render(renderDidYouKnowHtml(state.cachedDidYouKnow), dykEl);
  } else {
    showDidYouKnowPlaceholder();
  }
}

/* ── Event Wiring (separate so we can re-wire after partial updates) ── */

const _pageCtx = {
  filter: {} as DateFilter,
  container: null as HTMLElement | null,
  languages: [] as { label: string; loc: number }[],
  deps: [] as string[],
  workspaces: [] as string[],
};

function wireSidebarEvents(container: HTMLElement, state: LearningState): void {
  for (const btn of container.querySelectorAll<HTMLElement>('.learn-queue-remove')) {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const cid = btn.dataset.concept;
      if (cid) {
        // Remove from learning path — parse data-lang if present
        const entryLang = btn.dataset.lang ?? state.selectedLanguage ?? '';
        removeFromLearningPath(state, entryLang, cid);
        saveState(state);
        updateSidebar(container, state, computeGaps(state));
        updateStats(state);
      }
    });
  }

  document.getElementById('clear-focus-btn')?.addEventListener('click', () => {
    clearLearningPath(state);
    saveState(state);
    updateSidebar(container, state, computeGaps(state));
    updateStats(state);
  });
}

function computeGaps(state: LearningState): { lang: string; concept: string; passed: number; total: number }[] {
  const gaps: { lang: string; concept: string; passed: number; total: number }[] = [];
  for (const [lang, concepts] of Object.entries(state.langProgress)) {
    for (const [cid, cp] of Object.entries(concepts)) {
      if (cp.failed > cp.passed && (cp.passed + cp.failed) > 0) {
        const cdef = findConcept(cid, state, lang);
        gaps.push({ lang, concept: cdef?.name ?? cid, passed: cp.passed, total: cp.passed + cp.failed });
      }
    }
  }
  return gaps;
}

/* ── Global Context Bar (language + project picker) ───────────────── */

function wireGlobalPickers(container: HTMLElement, languages: { label: string; loc: number }[], state: LearningState): void {
  // Language pills
  const langPicker = document.getElementById('global-lang-picker');
  if (langPicker) {
    for (const pill of langPicker.querySelectorAll<HTMLButtonElement>('.learn-lang-pill')) {
      pill.addEventListener('click', () => {
        const lang = pill.dataset.lang;
        if (!lang) return;
        for (const p of langPicker.querySelectorAll('.learn-lang-pill')) p.classList.remove('learn-lang-pill-active');
        pill.classList.add('learn-lang-pill-active');
        state.selectedLanguage = lang;
        if (!state.langProgress[lang]) state.langProgress[lang] = {};
        saveState(state);
        // Update all sections
        updateSidebar(container, state, computeGaps(state));
        updateStats(state);
        showQuizPlaceholder();
        showCodeReviewPlaceholder();
        // Update section titles
        const quizTitle = container.querySelector('#quiz-section .learn-section-head h3');
        if (quizTitle) render(html`${SVG.terminal} ${lang} Challenge`, quizTitle);
        const crTitle = container.querySelector('#cr-section .learn-section-head h3');
        if (crTitle) render(html`${SVG.code} Slop or Not`, crTitle);
      });
    }
  }

  // Project pills
  const projectPicker = document.getElementById('global-project-picker');
  if (projectPicker) {
    for (const pill of projectPicker.querySelectorAll<HTMLButtonElement>('.learn-project-pill')) {
      pill.addEventListener('click', () => {
        const project = pill.dataset.project;
        if (!project) return;
        const idx = state.selectedProjects.indexOf(project);
        if (idx >= 0) {
          state.selectedProjects.splice(idx, 1);
          pill.classList.remove('learn-lang-pill-active');
        } else {
          state.selectedProjects.push(project);
          pill.classList.add('learn-lang-pill-active');
        }
        saveState(state);
      });
    }
  }
}

/* ── Quiz Placeholder (manual trigger) ────────────────────────────── */

function showQuizPlaceholder(): void {
  const quizEl = document.getElementById('quiz-container');
  if (!quizEl) return;
  const state = getState();
  const hasLang = !!state.selectedLanguage;
  render(html`
    <div class="learn-quiz-placeholder">
      <p class="text-muted">${hasLang ? `Generate ${state.selectedLanguage!} coding challenges.` : 'Pick a language above, then generate.'}</p>
      <button class="btn btn-primary btn-sm" id="quiz-generate-btn" disabled=${!hasLang}>${SVG.brain} Generate Quiz</button>
    </div>`, quizEl);
  document.getElementById('quiz-generate-btn')?.addEventListener('click', () => {
    const s = getState();
    if (!s.selectedLanguage) return;
    s.cachedQuizKey = '';
    saveState(s);
    if (_pageCtx.container) void loadQuizAsync(_pageCtx.container, s);
  });
}

function showResourcesPlaceholder(): void {
  const el = document.getElementById('learn-resources-container');
  if (!el) return;
  render(html`
    <button class="btn btn-secondary btn-sm" id="resources-generate-btn" style="margin-top:2px">${SVG.refresh} Load Resources</button>`, el);
  document.getElementById('resources-generate-btn')?.addEventListener('click', () => {
    const state = getState();
    state.cachedResourceKey = '';
    saveState(state);
    void loadResourcesAsync(state, _pageCtx.languages, computeGaps(state), _pageCtx.deps);
  });
}

function wireCodeReviewHandlers(container: HTMLElement, rounds: CodeComparisonRound[], currentIndex: number, state: LearningState): void {
  const crContainer = document.getElementById('cr-container');
  if (!crContainer) return;

  // More rounds button (on done screen)
  document.getElementById('cr-more-btn')?.addEventListener('click', () => {
    state.cachedCodeReviewKey = '';
    saveState(state);
    void loadCodeReviewAsync(container, state);
  });

  // Pick handlers on snippets
  for (const card of crContainer.querySelectorAll<HTMLElement>('.learn-cr-snippet')) {
    card.addEventListener('click', () => {
      if (currentIndex >= rounds.length) return;
      const pick = card.dataset.pick as 'A' | 'B';
      const r = rounds[currentIndex];
      const correct = pick === r.betterSnippet;

      state.codeReviewTotal++;
      if (correct) state.codeReviewCorrect++;
      if (!state.codeReviewSeenTopics.includes(r.title)) {
        state.codeReviewSeenTopics.push(r.title);
        if (state.codeReviewSeenTopics.length > 20) state.codeReviewSeenTopics.shift();
      }
      saveState(state);

      // Highlight correct/wrong
      for (const s of crContainer.querySelectorAll<HTMLElement>('.learn-cr-snippet')) {
        s.classList.add('learn-cr-disabled');
        if (s.dataset.pick === r.betterSnippet) s.classList.add('learn-cr-winner');
        if (s.dataset.pick === pick && !correct) s.classList.add('learn-cr-loser');
      }

      // Update header score
      const scoreEl = document.getElementById('cr-score');
      if (scoreEl) scoreEl.textContent = `${state.codeReviewCorrect}/${state.codeReviewTotal}`;

      const feedback = document.getElementById('cr-feedback');
      if (feedback) {
        feedback.style.display = 'block';
        feedback.className = `learn-cr-feedback ${correct ? 'learn-cr-fb-correct' : 'learn-cr-fb-wrong'}`;
        render(html`
          <strong>${correct ? html`${SVG.checkCircle} Correct!` : html`${SVG.xCircle} Not quite`}</strong> Snippet ${r.betterSnippet} is better.
          <p>${r.explanation}</p>
          <button class="btn btn-secondary btn-sm learn-cr-next">${SVG.arrowRight} Next</button>`, feedback);
        feedback.querySelector('.learn-cr-next')?.addEventListener('click', () => {
          const next = currentIndex + 1;
          render(renderCodeReviewRound(rounds, next, state), crContainer);
          wireCodeReviewHandlers(container, rounds, next, state);
        });
      }
    });
  }
}

function showCodeReviewPlaceholder(): void {
  const el = document.getElementById('cr-container');
  if (!el) return;
  const state = getState();
  const hasLang = !!state.selectedLanguage;
  render(html`
    <div class="learn-quiz-placeholder">
      <p class="text-muted">${hasLang ? `Spot the slop in ${state.selectedLanguage!} code.` : 'Pick a language above, then spot the slop.'}</p>
      <button class="btn btn-primary btn-sm" id="cr-generate-btn" disabled=${!hasLang}>${SVG.code} Play Slop or Not</button>
    </div>`, el);
  document.getElementById('cr-generate-btn')?.addEventListener('click', () => {
    const s = getState();
    if (!s.selectedLanguage) return;
    s.cachedCodeReviewKey = '';
    saveState(s);
    if (_pageCtx.container) void loadCodeReviewAsync(_pageCtx.container, s);
  });
}

async function loadCodeReviewAsync(container: HTMLElement, state: LearningState): Promise<void> {
  const el = document.getElementById('cr-container');
  if (!el) return;

  const langs = state.selectedLanguage ? [state.selectedLanguage] : _pageCtx.languages.map(l => l.label);
  const key = codeReviewCacheKey(langs, state.currentDifficulty);

  if (state.cachedCodeReviewKey === key && state.cachedCodeReview.length > 0) {
    render(renderCodeReviewRound(state.cachedCodeReview, 0, state), el);
    wireCodeReviewHandlers(container, state.cachedCodeReview, 0, state);
    return;
  }

  render(html`
    <div class="learn-quiz-loading">
      <div class="learn-shimmer"></div>
      <div class="learn-shimmer" style="width:80%"></div>
      <div class="learn-shimmer" style="width:60%"></div>
      <div class="learn-quiz-loading-text">${SVG.code} Generating slop or not rounds\u2026</div>
    </div>`, el);

  try {
    const result = await rpc<{ rounds: CodeComparisonRound[]; source?: 'llm' | 'builtin' }>('generateCodeComparison', {
      languages: langs,
      packageDeps: _pageCtx.deps,
      difficulty: state.currentDifficulty,
      seenTopics: state.codeReviewSeenTopics,
      workspaces: state.selectedProjects.length > 0 ? state.selectedProjects : _pageCtx.workspaces,
    });
    const rounds = result.rounds ?? [];
    if (rounds.length > 0) {
      state.cachedCodeReview = rounds;
      state.cachedCodeReviewKey = key;
      saveState(state);
      render(renderCodeReviewRound(rounds, 0, state), el);
      wireCodeReviewHandlers(container, rounds, 0, state);
      showLearningSourceNote('#cr-section', result.source);
    } else {
      render(html`<p class="text-muted">No comparisons generated.</p><button class="btn btn-secondary btn-sm" id="cr-retry-btn">Retry</button>`, el);
      document.getElementById('cr-retry-btn')?.addEventListener('click', () => {
        state.cachedCodeReviewKey = '';
        saveState(state);
        void loadCodeReviewAsync(container, state);
      });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Code review generation failed';
    render(html`<div class="learn-quiz-error">${SVG.warning} ${msg}<br /><button class="btn btn-secondary btn-sm" id="cr-retry-btn">Retry</button></div>`, el);
    document.getElementById('cr-retry-btn')?.addEventListener('click', () => {
      void loadCodeReviewAsync(container, state);
    });
  }
}

/* ── Did You Know? ────────────────────────────────────────────────── */

function showDidYouKnowPlaceholder(): void {
  const el = document.getElementById('dyk-container');
  if (!el) return;
  render(html`
    <button class="btn btn-secondary btn-sm" id="dyk-generate-btn" style="margin-top:2px">${SVG.lightbulb} Generate Tips</button>`, el);
  document.getElementById('dyk-generate-btn')?.addEventListener('click', () => {
    const state = getState();
    state.cachedDidYouKnowKey = '';
    saveState(state);
    void loadDidYouKnowAsync(state);
  });
}

async function loadDidYouKnowAsync(state: LearningState): Promise<void> {
  const el = document.getElementById('dyk-container');
  if (!el) return;

  const langs = state.selectedLanguage ? [state.selectedLanguage] : _pageCtx.languages.map(l => l.label);
  const effectiveWorkspaces = state.selectedProjects.length > 0 ? state.selectedProjects : _pageCtx.workspaces;
  const key = didYouKnowCacheKey(langs, effectiveWorkspaces);

  if (state.cachedDidYouKnowKey === key && state.cachedDidYouKnow.length > 0) {
    render(renderDidYouKnowHtml(state.cachedDidYouKnow), el);
    return;
  }

  render(html`
    <div class="learn-shimmer" style="width:100%;height:30px;margin-bottom:4px"></div>
    <div class="learn-shimmer" style="width:85%;height:30px;margin-bottom:4px"></div>
    <div class="learn-shimmer" style="width:70%;height:30px"></div>`, el);

  try {
    const result = await rpc<{ facts: DidYouKnowFact[] }>('generateDidYouKnow', {
      languages: langs,
      packageDeps: _pageCtx.deps,
      workspaces: state.selectedProjects.length > 0 ? state.selectedProjects : _pageCtx.workspaces,
      seenFacts: state.didYouKnowSeenFacts,
    });
    const facts = result.facts ?? [];
    state.cachedDidYouKnow = facts;
    state.cachedDidYouKnowKey = key;
    for (const f of facts) {
      if (!state.didYouKnowSeenFacts.includes(f.fact)) {
        state.didYouKnowSeenFacts.push(f.fact);
        if (state.didYouKnowSeenFacts.length > 30) state.didYouKnowSeenFacts.shift();
      }
    }
    saveState(state);
    render(renderDidYouKnowHtml(facts), el);
  } catch {
    render(html`<span class="text-muted" style="font-size:11px">Could not generate tips.</span>`, el);
  }
}

/* ── Async Quiz Loading (with progress visualization) ────────────── */

async function loadQuizAsync(container: HTMLElement, state: LearningState): Promise<void> {
  const quizEl = document.getElementById('quiz-container');
  if (!quizEl) return;

  const quizLangs = state.selectedLanguage ? [state.selectedLanguage] : _pageCtx.languages.map(l => l.label);
  const focusNames = state.focusedConcepts.map(cid => findConcept(cid, state)?.name ?? cid);

  // Update quiz section title
  const quizTitle = container.querySelector('#quiz-section .learn-section-head h3');
  if (quizTitle) {
    render(html`${SVG.terminal} ${state.selectedLanguage ? state.selectedLanguage + ' Challenge' : 'Coding Challenge'}`, quizTitle);
  }

  // Check cache first — instant render
  const key = quizCacheKey(quizLangs, focusNames, state.currentDifficulty, state.selectedLanguage);
  if (state.cachedQuizKey === key && state.cachedQuizzes.length > 0) {
    render(renderQuiz(state.cachedQuizzes, 0), quizEl);
    wireQuizHandlers(container, state.cachedQuizzes, 0, state, _pageCtx.deps);
    return;
  }

  // Show shimmer loading inside the quiz section (rest of page stays)
  render(html`
    <div class="learn-quiz-loading">
      <div class="learn-shimmer"></div>
      <div class="learn-shimmer" style="width:80%"></div>
      <div class="learn-shimmer" style="width:60%"></div>
      <div class="learn-quiz-loading-text">${SVG.brain} Generating personalized ${state.currentDifficulty} challenges\u2026</div>
    </div>`, quizEl);

  try {
    const { questions, source } = await generateQuizCached(state, {
      languages: quizLangs,
      focusConcepts: focusNames,
      difficulty: state.currentDifficulty,
      selectedLanguage: state.selectedLanguage,
      packageDeps: _pageCtx.deps,
      selectedProjects: state.selectedProjects,
    });
    if (questions.length > 0) {
      render(renderQuiz(questions, 0), quizEl);
      wireQuizHandlers(container, questions, 0, state, _pageCtx.deps);
      showLearningSourceNote('#quiz-section', source);
    } else {
      render(html`<p class="text-muted">No quizzes generated.</p><button class="btn btn-secondary btn-sm" id="quiz-retry-btn">Generate</button>`, quizEl);
      document.getElementById('quiz-retry-btn')?.addEventListener('click', () => {
        state.cachedQuizKey = ''; // invalidate cache
        saveState(state);
        void loadQuizAsync(container, state);
      });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Quiz generation failed';
    render(html`<div class="learn-quiz-error">${SVG.warning} ${msg}<br /><button class="btn btn-secondary btn-sm" id="quiz-retry-btn">Retry</button></div>`, quizEl);
    document.getElementById('quiz-retry-btn')?.addEventListener('click', () => {
      void loadQuizAsync(container, state);
    });
  }
}

/* ── Async Resource Loading (with cache) ─────────────────────────── */

function loadResourcesAsync(state: LearningState, languages: { label: string; loc: number }[], gaps: { lang: string; concept: string }[], uniqueDeps: string[]): void {
  const el = document.getElementById('learn-resources-container');
  if (!el) return;

  const filteredLangs = state.selectedLanguage
    ? languages.filter(l => l.label === state.selectedLanguage)
    : languages;
  const effectiveLangs = filteredLangs.length > 0 ? filteredLangs : languages;
  const effectiveWorkspaces = state.selectedProjects.length > 0 ? state.selectedProjects : _pageCtx.workspaces;
  const focusNames = state.focusedConcepts.map(cid => findConcept(cid, state)?.name ?? cid);
  const key = resourceCacheKey(effectiveLangs.map(l => l.label), gaps.map(g => `${g.concept}-${g.lang}`), focusNames);

  // Serve from cache instantly
  if (state.cachedResourceKey === key && state.cachedResources.length > 0) {
    render(renderResourcesHtml(state.cachedResources), el);
    return;
  }

  // Show shimmer
  render(html`
    <div class="learn-shimmer" style="width:100%;height:30px;margin-bottom:4px"></div>
    <div class="learn-shimmer" style="width:85%;height:30px;margin-bottom:4px"></div>
    <div class="learn-shimmer" style="width:70%;height:30px"></div>`, el);

  rpc<{ resources: CachedResource[] }>('generateLearningResources', {
    languages: effectiveLangs.map(l => l.label),
    gaps: gaps.map(g => `${g.concept} (${g.lang})`),
    focusConcepts: focusNames,
    packageDeps: uniqueDeps,
    workspaces: effectiveWorkspaces,
  }).then(data => {
    if (!document.getElementById('learn-resources-container')) return;
    const resources = data.resources ?? [];
    state.cachedResources = resources;
    state.cachedResourceKey = key;
    saveState(state);
    render(renderResourcesHtml(resources), el);
  }).catch(() => {
    if (document.getElementById('learn-resources-container')) {
      render(html`<span class="text-muted" style="font-size:11px">Could not generate resources.</span>`, el);
    }
  });
}

/* ── Main Render ──────────────────────────────────────────────────── */

export async function renderLearning(container: HTMLElement, filter: DateFilter): Promise<void> {
  const existing = (container as unknown as Record<string, unknown>).__snakeInterval;
  if (existing) { clearInterval(existing as number); delete (container as unknown as Record<string, unknown>).__snakeInterval; }

  const state = getState();
  _pageCtx.filter = filter;
  _pageCtx.container = container;

  // Show skeleton instantly if page is empty, otherwise keep existing content
  const isFirstRender = !container.querySelector('.learn-page');
  if (isFirstRender) {
    render(html`<${LoadingScreen} message=${'Loading learning system...'} />`, container);
  }

  const [codeByLang, flowState, depsResult, wsBreakdown] = await Promise.all([
    rpc<{ byLanguage: { labels: string[]; aiLoc: number[] } }>('getCodeProduction', filter as Record<string, unknown>),
    rpc<{ overallFlowScore: number; avgFollowUpSec: number; suggestions: string[] }>('getFlowState', filter as Record<string, unknown>),
    rpc<{ deps: { workspace: string; dependencies: string[]; devDependencies: string[] }[] }>('getWorkspaceDeps', {}),
    rpc<{ labels: string[]; values: number[] }>('getWorkspaceBreakdown', filter as Record<string, unknown>),
  ]);

  // Filter out Unknown/Other/Text languages, merge aliases (py/Python, js/JavaScript)
  const rawLanguages = codeByLang.byLanguage.labels
    .map((l, i) => ({ label: l, loc: codeByLang.byLanguage.aiLoc[i] ?? 0 }))
    .filter(l => !EXCLUDED_LANGS.has(l.label.toLowerCase()));
  const languages = mergeLanguages(rawLanguages).slice(0, 12);

  _pageCtx.languages = languages;

  // Collect workspace deps for quiz personalization
  const allDeps: string[] = [];
  for (const d of depsResult.deps ?? []) {
    allDeps.push(...(d.dependencies ?? []), ...(d.devDependencies ?? []));
  }
  const uniqueDeps = [...new Set(allDeps)].slice(0, 30);
  _pageCtx.deps = uniqueDeps;

  // Top 20 most active workspaces (from session data, sorted by request count)
  const workspaceNames = (wsBreakdown.labels ?? []).slice(0, 20);
  _pageCtx.workspaces = workspaceNames;

  // Reset selection if language no longer in data
  if (state.selectedLanguage && !languages.find(l => l.label === state.selectedLanguage)) {
    state.selectedLanguage = null;
  }

  // Auto-select first language if none selected
  if (!state.selectedLanguage && languages.length > 0) {
    state.selectedLanguage = languages[0].label;
    if (!state.langProgress[languages[0].label]) state.langProgress[languages[0].label] = {};
  }
  saveState(state);

  const diffColors: Record<string, string> = { easy: COLORS.green, medium: COLORS.yellow, hard: COLORS.red };
  const gaps = computeGaps(state);

  render(buildLearningMarkup(state, languages, workspaceNames, flowState, gaps, diffColors), container);

  // Wire static events
  document.getElementById('play-snake-btn')?.addEventListener('click', () => {
    state.snakeUnlocked = true;
    saveState(state);
    renderSnakeGame(container, state, () => {
      void renderLearning(container, {});
    });
  });

  wireSidebarEvents(container, state);
  wireGlobalPickers(container, languages, state);

  restoreLearningSections(container, state, languages, workspaceNames, gaps, uniqueDeps);
}

function handleCorrectAnswer(state: LearningState, q: QuizQuestion): void {
  state.solved++;
  state.streak++;
  if (state.streak > state.bestStreak) state.bestStreak = state.streak;
  state.solvedSamples.push(q.question);
  if (state.solvedSamples.length > 20) state.solvedSamples.shift();
  if (state.streak >= 5 && state.currentDifficulty === 'easy') state.currentDifficulty = 'medium';
  if (state.streak >= 10 && state.currentDifficulty === 'medium') state.currentDifficulty = 'hard';
}

function handleWrongAnswer(state: LearningState, q: QuizQuestion): void {
  state.failed++;
  state.streak = 0;
  state.failedSamples.push(q.question);
  if (state.failedSamples.length > 20) state.failedSamples.shift();
  if (state.currentDifficulty === 'hard') state.currentDifficulty = 'medium';
}

function updateConceptProgress(state: LearningState, q: QuizQuestion, correct: boolean): void {
  if (!state.selectedLanguage) return;
  if (!state.langProgress[state.selectedLanguage]) state.langProgress[state.selectedLanguage] = {};

  const topic = q.topic.toLowerCase();
  const langConcepts = getConceptsForLang(state.selectedLanguage, state);
  const matchedConcept = langConcepts.find(c =>
    c.name.toLowerCase() === topic || c.id === topic
    || c.name.toLowerCase().includes(topic) || topic.includes(c.name.toLowerCase()),
  );
  if (!matchedConcept) return;

  const cp = state.langProgress[state.selectedLanguage][matchedConcept.id] ?? { passed: 0, failed: 0 };
  if (correct) cp.passed++;
  else cp.failed++;
  state.langProgress[state.selectedLanguage][matchedConcept.id] = cp;
}

function wireQuizHandlers(
  container: HTMLElement, questions: QuizQuestion[], currentIndex: number,
  state: LearningState, packageDeps: string[],
): void {
  const quizContainer = document.getElementById('quiz-container');
  if (!quizContainer) return;

  // Skip button
  quizContainer.querySelector('.learn-quiz-skip')?.addEventListener('click', () => {
    const nextIndex = currentIndex + 1;
    render(renderQuiz(questions, nextIndex), quizContainer);
    if (nextIndex < questions.length) {
      wireQuizHandlers(container, questions, nextIndex, state, packageDeps);
    } else {
      document.getElementById('quiz-more-btn')?.addEventListener('click', () => {
        state.cachedQuizKey = '';
        saveState(state);
        void loadQuizAsync(container, state);
      });
    }
  });

  for (const btn of quizContainer.querySelectorAll<HTMLButtonElement>('.learn-quiz-choice')) {
    btn.addEventListener('click', () => {
      const q = questions[currentIndex];
      const chosen = Number.parseInt(btn.dataset.choice ?? '0', 10);
      const correct = chosen === q.correctIndex;

      for (const b of quizContainer.querySelectorAll<HTMLButtonElement>('.learn-quiz-choice')) {
        b.disabled = true;
        if (Number.parseInt(b.dataset.choice ?? '-1', 10) === q.correctIndex) b.classList.add('learn-quiz-choice-correct');
        if (Number.parseInt(b.dataset.choice ?? '-1', 10) === chosen && !correct) b.classList.add('learn-quiz-choice-wrong');
      }

      if (correct) handleCorrectAnswer(state, q);
      else handleWrongAnswer(state, q);

      updateConceptProgress(state, q, correct);

      saveState(state);
      updateStats(state);

      const feedback = document.getElementById('quiz-feedback');
      if (feedback) {
        feedback.style.display = 'block';
        feedback.className = `learn-quiz-feedback ${correct ? 'learn-quiz-fb-correct' : 'learn-quiz-fb-wrong'}`;
        render(html`
          <strong>${correct ? html`${SVG.checkCircle} Correct!` : html`${SVG.xCircle} Wrong`}</strong>
          <p>${q.explanation}</p>
          <button class="btn btn-secondary btn-sm learn-quiz-next">${SVG.arrowRight} Next</button>
        `, feedback);
        feedback.querySelector('.learn-quiz-next')?.addEventListener('click', () => {
          const nextIndex = currentIndex + 1;
          render(renderQuiz(questions, nextIndex), quizContainer);
          if (nextIndex < questions.length) {
            wireQuizHandlers(container, questions, nextIndex, state, packageDeps);
          } else {
            document.getElementById('quiz-more-btn')?.addEventListener('click', () => {
              state.cachedQuizKey = ''; // force new quizzes
              saveState(state);
              void loadQuizAsync(container, state);
            });
          }
        });
      }
    });
  }
}
