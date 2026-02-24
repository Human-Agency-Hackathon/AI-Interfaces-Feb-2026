import { describe, it, expect } from 'vitest';
import { buildSystemPrompt } from '../SystemPromptBuilder.js';
import type { PromptContext, TeamMember, OracleContext } from '../SystemPromptBuilder.js';
import type { ProcessAgentContext } from '../AgentSessionManager.js';

// ── Helpers ────────────────────────────────────────────────────────

function makeBaseContext(overrides: Partial<PromptContext> = {}): PromptContext {
  return {
    agentName: 'Oracle',
    role: 'Lead Explorer',
    realm: '/src',
    mission: 'Analyze the codebase architecture',
    repoPath: '/tmp/test-repo',
    knowledge: null,
    team: [],
    findings: [],
    ...overrides,
  };
}

function makeProcessContext(overrides: Partial<ProcessAgentContext> = {}): ProcessAgentContext {
  return {
    problem: 'How should we build a new web agent?',
    processName: 'Standard Brainstorm',
    stageId: 'ideation',
    stageName: 'Ideation',
    stageGoal: 'Generate diverse ideas',
    stageIndex: 0,
    totalStages: 3,
    persona: 'You generate creative ideas without self-censorship.',
    priorArtifacts: {},
    ...overrides,
  };
}

function makeTeamMember(overrides: Partial<TeamMember> = {}): TeamMember {
  return {
    agent_id: 'engineer_1',
    agent_name: 'Engineer',
    role: 'Backend Expert',
    realm: '/src/api',
    expertise_summary: 'TypeScript: 5, testing: 3',
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────────

describe('buildSystemPrompt', () => {
  describe('routing', () => {
    it('returns codebase prompt when no processContext is present', () => {
      const prompt = buildSystemPrompt(makeBaseContext());
      expect(prompt).toContain('specialist agent');
      expect(prompt).toContain('codebase');
      expect(prompt).not.toContain('brainstorming session');
    });

    it('returns process prompt when processContext is present', () => {
      const prompt = buildSystemPrompt(
        makeBaseContext({ processContext: makeProcessContext() }),
      );
      expect(prompt).toContain('brainstorming session');
      expect(prompt).not.toContain('specialist agent working on the codebase');
    });
  });

  describe('codebase prompt', () => {
    it('includes agent name, role, realm, and mission', () => {
      const prompt = buildSystemPrompt(makeBaseContext());
      expect(prompt).toContain('"Oracle"');
      expect(prompt).toContain('/src');
      expect(prompt).toContain('Analyze the codebase architecture');
    });

    it('includes repo path', () => {
      const prompt = buildSystemPrompt(makeBaseContext());
      expect(prompt).toContain('/tmp/test-repo');
    });

    it('includes knowledge from previous sessions when available', () => {
      const prompt = buildSystemPrompt(makeBaseContext({
        knowledge: {
          agent_id: 'oracle',
          agent_name: 'Oracle',
          role: 'explorer',
          realm: '/',
          insights: ['Project uses TypeScript', 'Has 95% test coverage'],
          expertise: { typescript: 8, testing: 5 },
          realm_knowledge: { 'src/': 3 },
          files_analyzed: ['src/index.ts', 'src/app.ts'],
          task_history: [],
        },
      }));
      expect(prompt).toContain('Project uses TypeScript');
      expect(prompt).toContain('Has 95% test coverage');
      expect(prompt).toContain('typescript: 8');
      expect(prompt).toContain('2 files');
    });

    it('omits knowledge section when knowledge is null', () => {
      const prompt = buildSystemPrompt(makeBaseContext({ knowledge: null }));
      expect(prompt).not.toContain('PREVIOUS SESSIONS');
    });

    it('omits knowledge section when insights and files_analyzed are empty', () => {
      const prompt = buildSystemPrompt(makeBaseContext({
        knowledge: {
          agent_id: 'oracle',
          agent_name: 'Oracle',
          role: 'explorer',
          realm: '/',
          insights: [],
          expertise: {},
          realm_knowledge: {},
          files_analyzed: [],
          task_history: [],
        },
      }));
      expect(prompt).not.toContain('PREVIOUS SESSIONS');
    });

    it('includes team members when present', () => {
      const prompt = buildSystemPrompt(makeBaseContext({
        team: [
          makeTeamMember(),
          makeTeamMember({ agent_id: 'tester', agent_name: 'Tester', role: 'QA' }),
        ],
      }));
      expect(prompt).toContain('Engineer');
      expect(prompt).toContain('Backend Expert');
      expect(prompt).toContain('Tester');
      expect(prompt).toContain('QA');
    });

    it('shows solo agent message when team is empty', () => {
      const prompt = buildSystemPrompt(makeBaseContext({ team: [] }));
      expect(prompt).toContain('only agent');
    });

    it('includes findings when present', () => {
      const prompt = buildSystemPrompt(makeBaseContext({
        findings: [
          {
            id: 'f1',
            agent_id: 'a1',
            agent_name: 'Scout',
            realm: '/',
            finding: 'No unit tests found',
            severity: 'high',
            timestamp: new Date().toISOString(),
          },
        ],
      }));
      expect(prompt).toContain('[Scout]');
      expect(prompt).toContain('No unit tests found');
    });

    it('includes current task when present', () => {
      const prompt = buildSystemPrompt(makeBaseContext({
        currentTask: 'Fix the login page crash',
      }));
      expect(prompt).toContain('CURRENT TASK');
      expect(prompt).toContain('Fix the login page crash');
    });

    it('includes tool descriptions', () => {
      const prompt = buildSystemPrompt(makeBaseContext());
      expect(prompt).toContain('SummonAgent');
      expect(prompt).toContain('RequestHelp');
      expect(prompt).toContain('PostFindings');
      expect(prompt).toContain('UpdateKnowledge');
      expect(prompt).toContain('ClaimQuest');
      expect(prompt).toContain('CompleteQuest');
    });

    it('mentions player commands', () => {
      const prompt = buildSystemPrompt(makeBaseContext());
      expect(prompt).toContain('PLAYER COMMAND');
    });
  });

  describe('process prompt', () => {
    it('includes the problem statement', () => {
      const prompt = buildSystemPrompt(
        makeBaseContext({ processContext: makeProcessContext() }),
      );
      expect(prompt).toContain('How should we build a new web agent?');
    });

    it('includes session and stage info', () => {
      const prompt = buildSystemPrompt(
        makeBaseContext({ processContext: makeProcessContext() }),
      );
      expect(prompt).toContain('Standard Brainstorm');
      expect(prompt).toContain('stage 1 of 3');
      expect(prompt).toContain('Ideation');
      expect(prompt).toContain('Generate diverse ideas');
    });

    it('includes agent role and persona', () => {
      const prompt = buildSystemPrompt(
        makeBaseContext({
          role: 'Ideator',
          processContext: makeProcessContext(),
        }),
      );
      expect(prompt).toContain('Ideator');
      expect(prompt).toContain('creative ideas without self-censorship');
    });

    it('includes prior stage artifacts when present', () => {
      const prompt = buildSystemPrompt(
        makeBaseContext({
          processContext: makeProcessContext({
            stageIndex: 1,
            priorArtifacts: {
              'ideation': {
                'idea_list': '1. Web crawler\n2. Browser plugin\n3. CLI tool',
              },
            },
          }),
        }),
      );
      expect(prompt).toContain('CONTEXT FROM PREVIOUS STAGES');
      expect(prompt).toContain('ideation / idea_list');
      expect(prompt).toContain('Web crawler');
    });

    it('omits prior artifacts section when none exist', () => {
      const prompt = buildSystemPrompt(
        makeBaseContext({
          processContext: makeProcessContext({ priorArtifacts: {} }),
        }),
      );
      expect(prompt).not.toContain('CONTEXT FROM PREVIOUS STAGES');
    });

    it('includes co-participants when present', () => {
      const prompt = buildSystemPrompt(
        makeBaseContext({
          team: [makeTeamMember({ agent_name: 'Facilitator', role: 'Facilitator' })],
          processContext: makeProcessContext(),
        }),
      );
      expect(prompt).toContain('CO-PARTICIPANTS');
      expect(prompt).toContain('Facilitator');
    });

    it('omits co-participants section when team is empty', () => {
      const prompt = buildSystemPrompt(
        makeBaseContext({
          team: [],
          processContext: makeProcessContext(),
        }),
      );
      expect(prompt).not.toContain('CO-PARTICIPANTS');
    });

    it('includes findings as ideas so far', () => {
      const prompt = buildSystemPrompt(
        makeBaseContext({
          findings: [
            {
              id: 'f1',
              agent_id: 'a1',
              agent_name: 'Ideator',
              realm: 'brainstorm',
              finding: 'Use LLMs as subcontractors',
              severity: 'medium',
              timestamp: new Date().toISOString(),
            },
          ],
          processContext: makeProcessContext(),
        }),
      );
      expect(prompt).toContain('IDEAS AND FINDINGS');
      expect(prompt).toContain('[Ideator]');
      expect(prompt).toContain('Use LLMs as subcontractors');
    });

    it('includes process-specific tool descriptions', () => {
      const prompt = buildSystemPrompt(
        makeBaseContext({ processContext: makeProcessContext() }),
      );
      expect(prompt).toContain('PostFindings');
      expect(prompt).toContain('UpdateKnowledge');
    });

    it('mentions player commands', () => {
      const prompt = buildSystemPrompt(
        makeBaseContext({ processContext: makeProcessContext() }),
      );
      expect(prompt).toContain('PLAYER COMMAND');
    });
  });
});

describe('Oracle prompt mode', () => {
  it('generates an oracle analysis prompt when oracleContext phase is analysis', () => {
    const prompt = buildSystemPrompt({
      agentName: 'The Oracle',
      role: 'Session Leader',
      realm: '/',
      mission: 'Analyze the user input and select heroes',
      repoPath: '/test/repo',
      knowledge: null,
      team: [],
      findings: [],
      oracleContext: {
        userProblem: 'How to improve auth?',
        userRepoInput: '/path/to/repo',
        availableRoles: [
          { id: 'architect', name: 'The Architect', persona: 'System structure specialist' },
          { id: 'sentinel', name: 'The Sentinel', persona: 'Security specialist' },
        ],
        availableTemplates: ['code_review', 'standard_brainstorm'],
        phase: 'analysis',
      },
    });

    expect(prompt).toContain('The Oracle');
    expect(prompt).toContain('How to improve auth?');
    expect(prompt).toContain('/path/to/repo');
    expect(prompt).toContain('The Architect');
    expect(prompt).toContain('SelectHeroes');
  });

  it('generates an oracle inter-stage prompt with findings context', () => {
    const prompt = buildSystemPrompt({
      agentName: 'The Oracle',
      role: 'Session Leader',
      realm: '/',
      mission: 'Review stage findings and adjust party',
      repoPath: '/test/repo',
      knowledge: null,
      team: [{ agent_id: 'architect', agent_name: 'The Architect', role: 'Master Builder', realm: '/', expertise_summary: 'architecture' }],
      findings: [
        { id: '1', agent_id: 'architect', agent_name: 'The Architect', realm: '/', finding: 'Monolithic structure detected', severity: 'high', timestamp: '' },
      ],
      oracleContext: {
        userProblem: undefined,
        userRepoInput: '/path/to/repo',
        availableRoles: [],
        availableTemplates: [],
        phase: 'inter-stage',
        completedStageName: 'Reconnaissance',
        nextStageName: 'Deep Analysis',
      },
    });

    expect(prompt).toContain('Monolithic structure detected');
    expect(prompt).toContain('SummonReinforcement');
    expect(prompt).toContain('DismissHero');
  });

  it('generates an oracle final prompt for presentation', () => {
    const prompt = buildSystemPrompt({
      agentName: 'The Oracle',
      role: 'Session Leader',
      realm: '/',
      mission: 'Compile and present the final report',
      repoPath: '/test/repo',
      knowledge: null,
      team: [],
      findings: [
        { id: '1', agent_id: 'architect', agent_name: 'The Architect', realm: '/', finding: 'Good architecture', severity: 'low', timestamp: '' },
      ],
      oracleContext: {
        userProblem: undefined,
        userRepoInput: '/path/to/repo',
        availableRoles: [],
        availableTemplates: [],
        phase: 'final',
      },
    });

    expect(prompt).toContain('PresentReport');
    expect(prompt).toContain('Good architecture');
  });
});

describe('Code review hero prompt mode', () => {
  it('includes file access tool info when isCodeReview is true', () => {
    const prompt = buildSystemPrompt({
      agentName: 'The Architect',
      role: 'Master Builder',
      realm: '/',
      mission: 'Analyze system architecture',
      repoPath: '/test/repo',
      knowledge: null,
      team: [],
      findings: [],
      processContext: {
        problem: 'Review the codebase',
        processName: 'Code Review',
        stageId: 'reconnaissance',
        stageName: 'Reconnaissance',
        stageGoal: 'Survey the codebase',
        stageIndex: 0,
        totalStages: 6,
        persona: 'You examine module boundaries and architectural patterns.',
        priorArtifacts: {},
        isCodeReview: true,
      },
    });

    expect(prompt).toContain('Read');
    expect(prompt).toContain('Glob');
    expect(prompt).toContain('Grep');
  });

  it('does not include file access info for regular brainstorm', () => {
    const prompt = buildSystemPrompt({
      agentName: 'The Visionary',
      role: 'Wild Ideator',
      realm: '/',
      mission: 'Generate ideas',
      repoPath: '/test/repo',
      knowledge: null,
      team: [],
      findings: [],
      processContext: {
        problem: 'How to improve UX?',
        processName: 'Standard Brainstorm',
        stageId: 'divergent',
        stageName: 'Divergent Thinking',
        stageGoal: 'Generate wild ideas',
        stageIndex: 1,
        totalStages: 9,
        persona: 'You think big and wild.',
        priorArtifacts: {},
        isCodeReview: false,
      },
    });

    // Should not have file-access tool section for brainstorm
    expect(prompt).not.toContain('You have access to file-reading tools');
  });
});
