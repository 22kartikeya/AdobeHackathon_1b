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
    "export", "share", "e-signature", "workflow", "process", "template"
];

const BOOST_KEYWORDS = ["form", "fillable", "sign", "signature", "prepare", "request", "interactive"];

function scoreContent(text) {
    let score = 0;
    const lower = text.toLowerCase();
    KEYWORDS.forEach((kw) => {
        const regex = new RegExp(`\\b${kw}\\b`, "g");
        const matches = lower.match(regex);
        if (matches) {
            let baseScore = matches.length;
            if (BOOST_KEYWORDS.includes(kw)) baseScore *= 2;
            score += baseScore;
        }
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

    lines.forEach((line, idx) => {
        const clean = line.trim();
        if (!clean) return;

        const estimatedPage = Math.max(1, Math.floor((idx / lines.length) * data.numpages) + 1);

        const isHeading = (
            (clean.length > 10 && clean.length < 100 &&
                !clean.includes('.') &&
                !clean.includes(',') &&
                clean.split(' ').length <= 10) ||
            /^(Create|Convert|Fill|Sign|Send|Change|Export|Share|Request|Prepare|Enable|Add|Edit|Use|Open|Select)/i.test(clean)
        );

        const score = scoreContent(clean);

        if (isHeading && score >= 1) {
            if (currentSection && sectionContent.length > 0) {
                const combinedContent = sectionContent.join(' ').trim();
                if (combinedContent.length > 50) {
                    detailedContent.push({
                        document,
                        section_title: currentSection.section_title,
                        refined_text: combinedContent,
                        page_number: currentSection.page_number,
                        score: currentSection.score
                    });
                }
            }

            currentSection = {
                document,
                section_title: clean,
                page_number: estimatedPage,
                importance_rank: 0,
                score: score
            };
            sections.push(currentSection);
            sectionContent = [];
        } else if (currentSection && clean.length > 30 && clean.split(" ").length < 100 && score >= 1) {
            sectionContent.push(clean);
        }
    });

    // Final section
    if (currentSection && sectionContent.length > 0) {
        const combinedContent = sectionContent.join(' ').trim();
        if (combinedContent.length > 50) {
            detailedContent.push({
                document,
                section_title: currentSection.section_title,
                refined_text: combinedContent,
                page_number: currentSection.page_number,
                score: currentSection.score
            });
        }
    }

    // Fallback: capture standalone useful paragraphs
    lines.forEach((line, idx) => {
        const clean = line.trim();
        const estimatedPage = Math.max(1, Math.floor((idx / lines.length) * data.numpages) + 1);
        const score = scoreContent(clean);

        if (clean.length > 50 && clean.split(" ").length < 100 && score >= 2) {
            detailedContent.push({
                document,
                refined_text: clean,
                page_number: estimatedPage,
                score
            });
        }
    });

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
            console.warn(`⚠ Missing file: ${fullPath}`);
            continue;
        }
        console.log(`📄 Processing: ${doc.filename}`);
        const { sections, detailedContent } = await extractFromPDF(fullPath);
        allSections.push(...sections);
        allDetailedContent.push(...detailedContent);
    }

    allSections.sort((a, b) => b.score - a.score);
    allDetailedContent.sort((a, b) => b.score - a.score);

    allSections.forEach((sec, i) => sec.importance_rank = i + 1);

    const topSections = allSections.slice(0, 5);
    const topDetailedContent = allDetailedContent.slice(0, 5);

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
        subsection_analysis: topDetailedContent.map(({ document, refined_text, page_number }) => ({
            document,
            refined_text,
            page_number
        }))
    };

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
    console.log(`✅ Output written to ${OUTPUT_FILE}`);
})();
