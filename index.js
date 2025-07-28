const fs = require("fs");
const path = require("path");
const pdfParse = require("pdf-parse");

const INPUT_JSON_PATH = "./collection2/challenge1b_input.json";
const PDF_DIR = "./collection2/PDFs";
const OUTPUT_DIR = "./collection2";
const OUTPUT_FILE = path.join(OUTPUT_DIR, "final_output.json");


const inputConfig = JSON.parse(fs.readFileSync(INPUT_JSON_PATH, "utf-8"));
const { documents, persona, job_to_be_done } = inputConfig;


const KEYWORDS = [
    "travel", "trip", "group", "friends", "hotel", "restaurant", "food",
    "nightlife", "activity", "things to do", "packing", "coast", "fun", "adventure",
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
    const lines = data.text.split("\n");
    const document = path.basename(filepath);
    const sections = [];

    lines.forEach((line, idx) => {
        const clean = line.trim();
        if (!clean) return;
        const isLikelyHeading = /^[0-9]+\./.test(clean) || (clean.length > 15 && clean.length < 120);
        const score = scoreContent(clean);
        if (isLikelyHeading && score > 0) {
            sections.push({
                document,
                section_title: clean,
                page_number: Math.floor(data.numpages * (idx / lines.length)) + 1,
                importance_rank: 0,
                refined_text: clean
            });
        }
    });

    return sections;
}

(async () => {
    const allSections = [];

    for (const doc of documents) {
        const fullPath = path.join(PDF_DIR, doc.filename);
        if (!fs.existsSync(fullPath)) {
            console.warn(` Missing file: ${fullPath}`);
            continue;
        }
        const sections = await extractFromPDF(fullPath);
        allSections.push(...sections);
    }


    allSections.sort((a, b) => scoreContent(b.section_title) - scoreContent(a.section_title));
    allSections.forEach((sec, i) => sec.importance_rank = i + 1);

    const topSections = allSections.slice(0, 5);

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
        subsection_analysis: topSections.map(({ document, refined_text, page_number }) => ({
            document,
            refined_text,
            page_number
        }))
    };

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
    console.log(` Output written to ${OUTPUT_FILE}`);
})();