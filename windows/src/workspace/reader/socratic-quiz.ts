/**
 * Socratic Adaptive Quiz Generator & Confusion Index
 * 
 * Analyzes book passages, generates probing Socratic comprehension questions,
 * measures reader confusion indices from responses, and dynamically adjusts
 * inquiry difficulty.
 * 
 * Inspired by THU-MAIC/OpenMAIC adaptive classroom pedagogy.
 */

export type QuizDifficulty = 'novice' | 'intermediate' | 'advanced';

export interface SocraticQuestion {
  id: string;
  question: string;
  difficulty: QuizDifficulty;
  conceptAnchor: string;
  expectedKeywords: string[];
}

export interface EvaluationResult {
  score: number;             // 0.0 to 1.0
  confusionIndex: number;    // 0.0 (crystal clear) to 1.0 (highly confused)
  feedback: string;
  recommendedNextDifficulty: QuizDifficulty;
  missingConcepts: string[];
}

export class SocraticQuizEngine {
  /**
   * Generates conceptual Socratic questions extracted from a reading passage
   */
  public generateQuestions(text: string): SocraticQuestion[] {
    const questions: SocraticQuestion[] = [];
    const sentences = text
      .split(/(?<=[.!?])\s+/)
      .map(s => s.trim())
      .filter(s => s.length > 25);

    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i];

      // Match causal or consequential statements
      if (/because|therefore|consequently|led to|resulted in|defined as/i.test(sentence)) {
        const words = sentence.split(/\s+/).filter(w => w.length > 4);
        const keywords = words.slice(0, 3).map(w => w.toLowerCase().replace(/[^a-z]/g, ''));

        questions.push({
          id: 'sq_' + (i + 1),
          question: `Why does the author state: "${sentence.slice(0, 90)}..."? What underlying mechanism drives this outcome?`,
          difficulty: i % 3 === 0 ? 'advanced' : (i % 2 === 0 ? 'intermediate' : 'novice'),
          conceptAnchor: sentence.slice(0, 60),
          expectedKeywords: keywords
        });
      }

      if (questions.length >= 5) break;
    }

    if (questions.length === 0) {
      questions.push({
        id: 'sq_fallback',
        question: 'What is the core premise and primary conclusion of this passage?',
        difficulty: 'novice',
        conceptAnchor: text.slice(0, 50),
        expectedKeywords: ['premise', 'conclusion', 'core']
      });
    }

    return questions;
  }

  /**
   * Evaluates the reader's free-form answer against expected concepts, computing the Confusion Index
   */
  public evaluateAnswer(question: SocraticQuestion, userAnswer: string): EvaluationResult {
    const normalizedAns = userAnswer.toLowerCase();
    const matched: string[] = [];
    const missing: string[] = [];

    for (const kw of question.expectedKeywords) {
      if (normalizedAns.includes(kw)) {
        matched.push(kw);
      } else {
        missing.push(kw);
      }
    }

    // Keyword coverage ratio
    const coverage = question.expectedKeywords.length > 0
      ? matched.length / question.expectedKeywords.length
      : 0.5;

    // Length and depth penalty/bonus
    const wordCount = userAnswer.trim().split(/\s+/).length;
    const depthFactor = Math.min(1.0, wordCount / 15);

    const score = Math.round((coverage * 0.7 + depthFactor * 0.3) * 100) / 100;
    const confusionIndex = Math.round((1.0 - score) * 100) / 100;

    let recommendedDifficulty: QuizDifficulty = question.difficulty;
    let feedback = '';

    if (confusionIndex <= 0.3) {
      feedback = 'Outstanding grasp of the foundational principles.';
      recommendedDifficulty = question.difficulty === 'novice' ? 'intermediate' : 'advanced';
    } else if (confusionIndex <= 0.6) {
      feedback = 'Reasonable conceptual foundation, though missing key nuances: ' + missing.join(', ');
      recommendedDifficulty = question.difficulty;
    } else {
      feedback = 'High confusion detected. Let us step back and clarify the core concepts before proceeding.';
      recommendedDifficulty = question.difficulty === 'advanced' ? 'intermediate' : 'novice';
    }

    return {
      score,
      confusionIndex,
      feedback,
      recommendedNextDifficulty: recommendedDifficulty,
      missingConcepts: missing
    };
  }
}
