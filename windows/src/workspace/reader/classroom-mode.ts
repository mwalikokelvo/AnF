/**
 * Classroom Mode for AnF Reader
 * 
 * Transforms document chapters or reading passages into an interactive
 * multi-agent study seminar with discussion questions, peer debate,
 * and checkpoint quizzes.
 * Ported from ThingsBook / inspired by THU-MAIC/OpenMAIC.
 */

export interface SeminarAgent {
  role: 'Instructor' | 'Student Skeptic' | 'Teaching Assistant';
  prompt: string;
}

export interface ClassroomSession {
  title: string;
  timestamp: number;
  excerpt: string;
  agents: SeminarAgent[];
  generateQuizPrompt: string;
}

export interface SeminarDialogueItem {
  role: string;
  response: string;
}

export const ClassroomModeCore = {
  createClassroomSession(chapterTitle: string, passageText: string): ClassroomSession {
    const text = String(passageText || '').trim();
    const cleanExcerpt = text.slice(0, 400);

    return {
      title: `Seminar: ${chapterTitle || 'Reading Passage'}`,
      timestamp: Date.now(),
      excerpt: cleanExcerpt,
      agents: [
        {
          role: 'Instructor',
          prompt: `Summarize the central thesis of: "${cleanExcerpt}" and pose a foundational inquiry.`
        },
        {
          role: 'Student Skeptic',
          prompt: `Identify one assumption or counter-example to the arguments presented in: "${cleanExcerpt}".`
        },
        {
          role: 'Teaching Assistant',
          prompt: `Provide historical context and define any technical or domain terms in: "${cleanExcerpt}".`
        }
      ],
      generateQuizPrompt: `Based on this passage: "${cleanExcerpt}", create 3 multiple-choice comprehension questions with explanations.`
    };
  },

  formatSeminarNotes(session: ClassroomSession, dialogueResponses: SeminarDialogueItem[]): string {
    let md = `# ${session.title}\n\n`;
    md += `> **Source Passage:** "${session.excerpt}..."\n\n`;
    md += `## Seminar Discussion\n\n`;

    for (const item of dialogueResponses || []) {
      md += `### ${item.role}\n${item.response}\n\n`;
    }

    return md;
  }
};
