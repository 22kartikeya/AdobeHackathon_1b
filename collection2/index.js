const fs = require("fs");
const path = require("path");
const pdfParse = require("pdf-parse");

const INPUT_JSON_PATH = "./challenge1b_input.json";
const PDF_DIR = "./collection2_input";
const OUTPUT_DIR = "./collection2_output";
const OUTPUT_FILE = path.join(OUTPUT_DIR, "final_output.json");

const inputConfig = JSON.parse(fs.readFileSync(INPUT_JSON_PATH, "utf-8"));
const { documents, persona, job_to_be_done } = inputConfig;


const KEYWORDS = [
  "form", "forms", "fillable", "interactive", "field", "fields", "onboarding",
  "compliance", "sign", "signature", "signatures", "fill", "create", "convert",
  "document", "documents", "PDF", "Acrobat", "manage", "tools", "prepare",
  "export", "share", "e-signature", "workflow", "process", "template", "enable", "submit"
];

function scoreContent(text) {
  let score = 0;
  const lower = text.toLowerCase();
  KEYWORDS.forEach((kw) => {
    const regex = new RegExp(`\\b${kw}\\b`, "g");
    const matches = lower.match(regex);
    if (matches) score += matches.length;
  });
  return score;
}

async function extractFromPDF(filepath) {
  const dataBuffer = fs.readFileSync(filepath);
  const data = await pdfParse(dataBuffer);
  const text = data.text;
  const lines = text.split("\n");
  const document = path.basename(filepath);
  const sections = [];
  const detailedContent = [];

  let currentPage = 1;
  let currentSection = null;
  let sectionContent = [];


  let buffer = [];
  let bufferScore = 0;
  let bufferPage = 1;

  function flushBuffer() {
    if (buffer.length === 0) return;
    const textBlock = buffer.join(" ").trim();
    if (textBlock.length > 150 && bufferScore >= 5) {
      detailedContent.push({
        document,
        refined_text: textBlock,
        page_number: bufferPage,
        score: bufferScore
      });
    }
    buffer = [];
    bufferScore = 0;
  }

  lines.forEach((line, idx) => {
    const clean = line.trim();
    if (!clean) {
      flushBuffer();
      return;
    }

    const estimatedPage = Math.max(1, Math.floor((idx / lines.length) * data.numpages) + 1);
    const score = scoreContent(clean);


    const isHeading = (
      (clean.length > 10 && clean.length < 100 &&
        !clean.includes(".") && !clean.includes(",") &&
        clean.split(" ").length <= 10) ||
      /^(Create|Convert|Fill|Sign|Send|Change|Export|Share|Request|Prepare|Enable|Add|Edit|Use|Open|Select)/i.test(clean)
    );

    if (isHeading && score >= 2) {
      if (currentSection && sectionContent.length > 0) {
        const combined = sectionContent.join(" ").trim();
        if (combined.length > 50) {
          sections.push({
            document,
            section_title: currentSection.section_title,
            page_number: currentSection.page_number,
            importance_rank: 0,
            score: currentSection.score
          });
        }
      }
      currentSection = {
        document,
        section_title: clean,
        page_number: estimatedPage,
        score
      };
      sectionContent = [];
    } else if (currentSection && clean.length > 20 && score > 0) {
      sectionContent.push(clean);
    }


    const containsFormVerb = /(form|fill|interactive|signature|prepare|sign|submit|enable|Acrobat|tools|PDF)/i.test(clean);
    if (score >= 1 && containsFormVerb && clean.length >= 40 && clean.length <= 300) {
      if (buffer.length === 0) bufferPage = estimatedPage;
      buffer.push(clean);
      bufferScore += score;
    } else {
      flushBuffer();
    }
  });


  flushBuffer();


  if (currentSection && sectionContent.length > 0) {
    const combined = sectionContent.join(" ").trim();
    if (combined.length > 50) {
      sections.push({
        document,
        section_title: currentSection.section_title,
        page_number: currentSection.page_number,
        importance_rank: 0,
        score: currentSection.score
      });
    }
  }

  return { sections, detailedContent };
}

(async () => {
  const allSections = [];
  const allDetailedContent = [];

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  for (const doc of documents) {
    const fullPath = path.join(PDF_DIR, doc.filename);
    if (!fs.existsSync(fullPath)) {
      console.warn(` Missing file: ${fullPath}`);
      continue;
    }
    console.log(` Processing: ${doc.filename}`);
    const { sections, detailedContent } = await extractFromPDF(fullPath);
    allSections.push(...sections);
    allDetailedContent.push(...detailedContent);
  }


  allSections.sort((a, b) => b.score - a.score);
  allDetailedContent.sort((a, b) => b.score - a.score);

  allSections.forEach((sec, idx) => (sec.importance_rank = idx + 1));

  const topSections = allSections.slice(0, 5);
  const topDetailed = allDetailedContent.slice(0, 5);

  const output = {
    metadata: {
      input_documents: documents.map(doc => doc.filename),
      persona: persona.role,
      job_to_be_done: job_to_be_done.task,
      processing_timestamp: new Date().toISOString()
    },
    extracted_sections: topSections.map(({ document, section_title, importance_rank, page_number }) => ({
      document,
      section_title,
      importance_rank,
      page_number
    })),
    subsection_analysis: topDetailed.map(({ document, refined_text, page_number }) => ({
      document,
      refined_text,
      page_number
    }))
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
  console.log(`Output written to ${OUTPUT_FILE}`);
})();
