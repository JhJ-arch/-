export const QuestionTypes = {
  FACTUAL: '사실적 사고',
  INFERENTIAL: '추론적 사고',
  CRITICAL: '비판적 사고',
  CREATIVE: '창의적 사고',
  APPLICATION: '적용',
  CONJUNCTIVE: '연결어',
  FILL_IN_BLANK: '빈칸 추론',
} as const;

export type QuestionType = typeof QuestionTypes[keyof typeof QuestionTypes];


export interface Paragraph {
  id: string;
  content: string;
}

export enum QuestionFormat {
  MultipleChoice = 'multiple-choice',
}

export interface Question {
  id: string;
  questionText: string;
  format: QuestionFormat;
  questionType: QuestionType;
  options?: string[];
  correctAnswer?: string;
}

export interface VocabularyItem {
  word: string;
  definition: string;
  example: string;
}

export interface GenerationOptions {
  topic: string;
  grade: number;
  numParagraphs: number;
  numQuestions: number;
  difficulty: number;
}

export interface GeneratedContent {
  title: string;
  paragraphs: Paragraph[];
  questions: Question[];
  vocabulary: VocabularyItem[];
}
