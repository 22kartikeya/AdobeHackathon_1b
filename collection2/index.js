const fs = require("fs");
const path = require("path");
const pdfParse = require("pdf-parse");

const INPUT_JSON_PATH = "./challenge1b_input.json";
const PDF_DIR = "./collection2_input";
const OUTPUT_DIR = "./collection2_output";
const OUTPUT_FILE = path.join(OUTPUT_DIR, "final_output.json");

// Load configuration
const inputConfig = JSON.parse(fs.readFileSync(INPUT_JSON_PATH, "utf-8"));
const { documents, persona, job_to_be_done } = inputConfig;

// Define HR/Forms-related keywords
const KEYWORDS = [
    "form", "forms", "fillable", "interactive", "field", "fields", "onboarding",
    "compliance", "sign", "signature", "signatures", "fill", "create", "convert",
    "document", "documents", "PDF", "Acrobat", "manage", "tools", "prepare",
    "export", "share", "e-signature", "workflow", "process", "template"
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

    lines.forEach((line, idx) => {
        const clean = line.trim();
        if (!clean) return;

        // Estimate page number based on position in document
        const estimatedPage = Math.max(1, Math.floor((idx / lines.length) * data.numpages) + 1);

        // Check if this looks like a section heading
        const isHeading = (
            // Standalone lines that look like titles
            (clean.length > 10 && clean.length < 100 &&
                !clean.includes('.') &&
                !clean.includes(',') &&
                clean.split(' ').length <= 10) ||
            // Lines that start with action words
            /^(Create|Convert|Fill|Sign|Send|Change|Export|Share|Request|Prepare|Enable|Add|Edit|Use|Open|Select)/i.test(clean)
        );

        const score = scoreContent(clean);

        if (isHeading && score > 2) {
            // Save previous section content
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

            // Start new section
            currentSection = {
                document,
                section_title: clean,
                page_number: estimatedPage,
                importance_rank: 0,
                score: score
            };
            sections.push(currentSection);
            sectionContent = [];
        } else if (currentSection && clean.length > 20 && score > 0) {
            // Collect content for current section
            sectionContent.push(clean);
        }
    });

    // Handle last section
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

    return { sections, detailedContent };
}

(async () => {
    const allSections = [];
    const allDetailedContent = [];

    // Ensure output directory exists
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

    // Sort by relevance score
    allSections.sort((a, b) => b.score - a.score);
    allDetailedContent.sort((a, b) => b.score - a.score);

    // Assign importance ranks
    allSections.forEach((sec, i) => sec.importance_rank = i + 1);

    // Take top 5 sections
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
