import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

interface ParsedChoice {
  key: string;
  ko: string;
}

interface ParsedQuestion {
  id: number;
  multi: boolean;
  question: { ko: string };
  choices: ParsedChoice[];
  answer: string[];
  explanation: { ko: string };
  sourceUrl?: string;
}

const IMAGE_CHOICE_OVERRIDES = new Map<number, ParsedChoice[]>([
  [
    477,
    [
      {
        key: 'A',
        ko: '{ "Action": ["s3:*Object"], "Resource": ["arn:aws:s3:::bucket-name/*"], "Effect": "Allow" }',
      },
      {
        key: 'B',
        ko: '{ "Action": ["s3:*"], "Resource": ["arn:aws:s3:::bucket-name/*"], "Effect": "Allow" }',
      },
      {
        key: 'C',
        ko: '{ "Action": ["s3:DeleteObject"], "Resource": ["arn:aws:s3:::bucket-name*"], "Effect": "Allow" }',
      },
      {
        key: 'D',
        ko: '{ "Action": ["s3:DeleteObject"], "Resource": ["arn:aws:s3:::bucket-name/*"], "Effect": "Allow" }',
      },
    ],
  ],
  [
    710,
    [
      {
        key: 'A',
        ko: '{ "Version": "2012-10-17", "Statement": [{ "Effect": "Allow", "Action": "s3:ListBucket", "Resource": "arn:aws:s3:::AdminTools" }, { "Effect": "Allow", "Action": ["s3:GetObject", "s3:PutObject"], "Resource": "arn:aws:s3:::AdminTools/*" }, { "Effect": "Deny", "Action": "s3:*", "Resource": ["arn:aws:s3:::CompanyConfidential/*", "arn:aws:s3:::CompanyConfidential"] }] }',
      },
      {
        key: 'B',
        ko: '{ "Version": "2012-10-17", "Statement": [{ "Effect": "Allow", "Action": "s3:ListBucket", "Resource": ["arn:aws:s3:::AdminTools", "arn:aws:s3:::CompanyConfidential/*"] }, { "Effect": "Allow", "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"], "Resource": "arn:aws:s3:::AdminTools/*" }, { "Effect": "Deny", "Action": "s3:*", "Resource": "arn:aws:s3:::CompanyConfidential" }] }',
      },
      {
        key: 'C',
        ko: '{ "Version": "2012-10-17", "Statement": [{ "Effect": "Allow", "Action": "s3:ListBucket", "Resource": "arn:aws:s3:::AdminTools/*" }, { "Effect": "Allow", "Action": ["s3:GetObject", "s3:PutObject"], "Resource": "arn:aws:s3:::AdminTools/*" }, { "Effect": "Deny", "Action": "s3:*", "Resource": ["arn:aws:s3:::CompanyConfidential", "arn:aws:s3:::CompanyConfidential/*", "arn:aws:s3:::AdminTools/*"] }] }',
      },
      {
        key: 'D',
        ko: '{ "Version": "2012-10-17", "Statement": [{ "Effect": "Allow", "Action": "s3:ListBucket", "Resource": "arn:aws:s3:::AdminTools/*" }, { "Effect": "Allow", "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"], "Resource": "arn:aws:s3:::AdminTools/*" }, { "Effect": "Deny", "Action": "s3:*", "Resource": ["arn:aws:s3:::CompanyConfidential", "arn:aws:s3:::CompanyConfidential/*", "arn:aws:s3:::AdminTools/*"] }] }',
      },
    ],
  ],
]);

const [, , pdfPath, outputPath] = process.argv;
if (!pdfPath || !outputPath) {
  throw new Error(
    '사용법: node scripts/import-saa-pdf.ts <한국어.pdf> <출력.json>',
  );
}

function extractPdfText(path: string): string {
  try {
    return execFileSync('pdftotext', ['-layout', resolve(path), '-'], {
      encoding: 'utf8',
      maxBuffer: 50 * 1024 * 1024,
    });
  } catch {
    throw new Error(`PDF 텍스트를 읽지 못했습니다: ${path}`);
  }
}

function cleanText(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function parseQuestion(id: number, body: string): ParsedQuestion {
  const answerMatch = /^Answer:\s*([A-F](?:\s*,\s*[A-F])*)\s*$/m.exec(body);
  if (answerMatch?.index === undefined || !answerMatch[1]) {
    throw new Error(`문항 ${id}: 정답을 찾지 못했습니다.`);
  }
  const beforeAnswer = body.slice(0, answerMatch.index);
  const optionMatches = [...beforeAnswer.matchAll(/^([A-F])\.\s*/gm)];
  if (optionMatches.length < 2) {
    throw new Error(`문항 ${id}: 선택지를 찾지 못했습니다.`);
  }
  const firstOption = optionMatches[0];
  if (!firstOption || firstOption.index === undefined) {
    throw new Error(`문항 ${id}: 첫 선택지를 찾지 못했습니다.`);
  }
  const choices = optionMatches.map((option, index) => {
    const next = optionMatches[index + 1];
    const start = (option.index ?? 0) + option[0].length;
    return {
      key: option[1] ?? '',
      ko: cleanText(
        beforeAnswer.slice(start, next?.index ?? beforeAnswer.length),
      ),
    };
  });
  const choicesWithImageText = IMAGE_CHOICE_OVERRIDES.get(id) ?? choices;
  const question = cleanText(beforeAnswer.slice(0, firstOption.index));
  const afterAnswer = body.slice(answerMatch.index + answerMatch[0].length);
  const sourceMatch =
    /https:\/\/www\.examtopics\.com\/discussions\/amazon\/view\/[\s\S]*?(?=\n\s*\n|$)/.exec(
      afterAnswer,
    );
  const sourceUrl = sourceMatch?.[0].replace(/\s+/g, '');
  const explanationText = afterAnswer
    .replace(
      /https:\/\/www\.examtopics\.com\/discussions\/amazon\/view\/[\s\S]*?(?=\n\s*\n|$)/g,
      '',
    )
    .replace(/^\s*(?:설명|해설)(?:\s*\d+)?\s*[:：・]?\s*/m, '');
  const parsed: ParsedQuestion = {
    id,
    multi: answerMatch[1].includes(','),
    question: { ko: question },
    choices: choicesWithImageText,
    answer: answerMatch[1].split(',').map((key) => key.trim()),
    explanation: { ko: cleanText(explanationText) },
  };
  if (sourceUrl) parsed.sourceUrl = sourceUrl;
  return parsed;
}

const text = extractPdfText(pdfPath).replace(/\r/g, '').replace(/\f/g, '\n');
const headings = [...text.matchAll(/^Q\s*(\d+)\s*$/gm)];
if (headings.length !== 725) {
  throw new Error(`문항 수가 725개가 아닙니다: ${headings.length}`);
}
const questions = headings.map((heading, index) => {
  const start = (heading.index ?? 0) + heading[0].length;
  const end = headings[index + 1]?.index ?? text.length;
  return parseQuestion(index + 1, text.slice(start, end));
});
const invalid = questions.filter(
  (question) =>
    !question.question.ko ||
    question.choices.length < 2 ||
    question.answer.length === 0,
);
if (invalid.length > 0) {
  throw new Error(
    `문항 데이터가 불완전합니다: ${invalid.map((q) => q.id).join(', ')}`,
  );
}
writeFileSync(
  resolve(outputPath),
  `${JSON.stringify(questions, null, 2)}\n`,
  'utf8',
);
console.log(
  `SAA-C03 ${questions.length}문항을 생성했습니다: ${resolve(outputPath)}`,
);
