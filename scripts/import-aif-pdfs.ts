import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

interface ParsedChoice {
  key: string;
  text: string;
}

interface ParsedQuestion {
  id: number;
  question: string;
  choices: ParsedChoice[];
  answer: string[];
  explanation: string;
  sourceUrl?: string;
}

interface OutputQuestion {
  id: number;
  multi: boolean;
  question: { ko: string; en: string };
  choices: { key: string; ko: string; en: string }[];
  answer: string[];
  explanation: { ko: string };
  sourceUrl?: string;
}

const [, , englishPdf, koreanPdf, outputPath] = process.argv;

if (!englishPdf || !koreanPdf || !outputPath) {
  throw new Error(
    '사용법: node scripts/import-aif-pdfs.ts <영문.pdf> <한글.pdf> <출력.json>',
  );
}

function extractPdfText(path: string): string {
  try {
    return execFileSync('pdftotext', ['-layout', resolve(path), '-'], {
      encoding: 'utf8',
      maxBuffer: 20 * 1024 * 1024,
    });
  } catch {
    throw new Error(`PDF 텍스트를 읽지 못했습니다: ${path}`);
  }
}

function cleanText(value: string): string {
  return value
    .trim()
    .split(/\n\s*\n+/)
    .map((paragraph) =>
      paragraph
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .join(' ')
        .replace(/\s+/g, ' '),
    )
    .filter(Boolean)
    .join('\n\n');
}

function parseQuestionBlock(id: number, body: string): ParsedQuestion {
  const sourcePattern =
    /https:\/\/www\.examtopics\.com\/discussions\/amazon\/view\/\d+-exam-aws-certified-ai-pract\s*itioner-aif-c01-topic-1-question\//;
  const sourceMatch = sourcePattern.exec(body);
  const sourceUrl = sourceMatch?.[0].replace(/\s/g, '');
  const content = body.replace(new RegExp(sourcePattern.source, 'g'), '\n');
  const answerMatch = /^Answer:\s*([A-F](?:\s*,\s*[A-F])*)\s*$/m.exec(content);
  if (!answerMatch?.index || !answerMatch[1]) {
    throw new Error(`Q${id}: 정답을 찾지 못했습니다.`);
  }

  const questionAndChoices = content.slice(0, answerMatch.index);
  const choiceMatches = [...questionAndChoices.matchAll(/^([A-F])\.\s+/gm)];
  if (choiceMatches.length < 2) {
    throw new Error(`Q${id}: 선택지가 2개 미만입니다.`);
  }

  const firstChoice = choiceMatches[0];
  if (!firstChoice || firstChoice.index === undefined) {
    throw new Error(`Q${id}: 첫 선택지를 찾지 못했습니다.`);
  }

  const choices = choiceMatches.map((match, index) => {
    const next = choiceMatches[index + 1];
    const start = (match.index ?? 0) + match[0].length;
    const end = next?.index ?? questionAndChoices.length;
    return {
      key: match[1] ?? '',
      text: cleanText(questionAndChoices.slice(start, end)),
    };
  });

  const remainder = content.slice(answerMatch.index + answerMatch[0].length);
  const explanationMatch = /^해설:\s*$/m.exec(remainder);
  const explanationIndex = explanationMatch?.index ?? 0;
  const explanation = explanationMatch
    ? cleanText(remainder.slice(explanationIndex + explanationMatch[0].length))
    : cleanText(remainder.slice(explanationIndex));

  const parsed: ParsedQuestion = {
    id,
    question: cleanText(questionAndChoices.slice(0, firstChoice.index)),
    choices,
    answer: answerMatch[1].split(',').map((key) => key.trim()),
    explanation,
  };
  if (sourceUrl) parsed.sourceUrl = sourceUrl;
  return parsed;
}

function parsePdf(path: string): ParsedQuestion[] {
  const text = extractPdfText(path).replace(/\r/g, '').replace(/\f/g, '\n');
  const headings = [...text.matchAll(/^Q\s*(\d+)\s*$/gm)];
  return headings.map((heading, index) => {
    const id = Number(heading[1]);
    const start = (heading.index ?? 0) + heading[0].length;
    const end = headings[index + 1]?.index ?? text.length;
    return parseQuestionBlock(id, text.slice(start, end));
  });
}

function assertMatchingBanks(
  english: ParsedQuestion[],
  korean: ParsedQuestion[],
): void {
  if (english.length !== 88 || korean.length !== 88) {
    throw new Error(
      `문항 수가 88개가 아닙니다. 영문 ${english.length}, 한글 ${korean.length}`,
    );
  }

  for (let index = 0; index < 88; index += 1) {
    const en = english[index];
    const ko = korean[index];
    if (!en || !ko || en.id !== index + 1 || ko.id !== index + 1) {
      throw new Error(`${index + 1}번 문항 번호가 일치하지 않습니다.`);
    }
    const enKeys = en.choices.map((choice) => choice.key).join(',');
    const koKeys = ko.choices.map((choice) => choice.key).join(',');
    if (enKeys !== koKeys || en.answer.join(',') !== ko.answer.join(',')) {
      throw new Error(
        `Q${index + 1}: 영문과 한글의 선택지 또는 정답이 다릅니다.`,
      );
    }
    if (!ko.explanation) {
      throw new Error(`Q${index + 1}: 한글 해설이 누락되었습니다.`);
    }
  }
}

function mergeQuestion(en: ParsedQuestion, ko: ParsedQuestion): OutputQuestion {
  const choices = ko.choices.map((choice, index) => {
    const englishChoice = en.choices[index];
    if (!englishChoice)
      throw new Error(`Q${ko.id}: 영문 선택지가 누락되었습니다.`);
    return { key: choice.key, ko: choice.text, en: englishChoice.text };
  });
  const merged: OutputQuestion = {
    id: ko.id,
    multi: ko.answer.length > 1,
    question: { ko: ko.question, en: en.question },
    choices,
    answer: ko.answer,
    explanation: { ko: ko.explanation },
  };
  const sourceUrl = ko.sourceUrl ?? en.sourceUrl;
  if (sourceUrl) merged.sourceUrl = sourceUrl;
  return merged;
}

const english = parsePdf(englishPdf);
const korean = parsePdf(koreanPdf);
assertMatchingBanks(english, korean);
const questions = english.map((question, index) => {
  const koreanQuestion = korean[index];
  if (!koreanQuestion)
    throw new Error(`Q${question.id}: 한글 문항이 누락되었습니다.`);
  return mergeQuestion(question, koreanQuestion);
});

writeFileSync(
  resolve(outputPath),
  `${JSON.stringify(questions, null, 2)}\n`,
  'utf8',
);
console.log(
  `AIF-C01 ${questions.length}문항을 생성했습니다: ${resolve(outputPath)}`,
);
