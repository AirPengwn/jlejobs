const fs = require("fs");
const {
  Document, Packer, Paragraph, TextRun, AlignmentType, LevelFormat,
  BorderStyle, ExternalHyperlink, TabStopType
} = require("docx");

const ACCENT = "2A8C82", DARK = "1A1A1A", GRAY = "555555";
const rule = (color = ACCENT, size = 8) => ({ bottom: { style: BorderStyle.SINGLE, size, color, space: 2 } });
const heading = (t) => new Paragraph({ spacing: { before: 240, after: 100 }, border: rule(),
  children: [new TextRun({ text: t.toUpperCase(), bold: true, size: 24, color: ACCENT, font: "Calibri" })] });
const bullet = (t) => new Paragraph({ numbering: { reference: "bullets", level: 0 }, spacing: { after: 40 },
  children: [new TextRun({ text: t, size: 21, color: DARK })] });
function jobHeader(role, company, where, dates) {
  return [
    new Paragraph({ spacing: { before: 140, after: 0 }, tabStops: [{ type: TabStopType.RIGHT, position: 9360 }],
      children: [new TextRun({ text: role, bold: true, size: 23, color: DARK }), new TextRun({ text: "\t" + dates, size: 20, color: GRAY })] }),
    new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: company + "  •  " + where, italics: true, size: 21, color: ACCENT })] })
  ];
}

const experience = [
  { role: "Staff Product Owner", company: "Thermo Fisher Scientific", where: "Branford, CT / Remote", dates: "Nov 2019 – Present",
    bullets: [
      "Own and prioritize backlogs for engineering teams, sustaining a predictable two-week sprint cadence and a continuously groomed, business-aligned pipeline of work.",
      "Facilitate all Scrum ceremonies and serve as Scrum Master for two teams; represent the teams in ART Sync and PMO leadership forums.",
      "Drive program-level SAFe events — PI planning, Inspect & Adapt, and system demos — in partnership with the RTE, product management, and engineering management.",
      "Act as the primary conduit between business stakeholders and software development, capturing requirements and proposing solutions through defined processes.",
      "Own the SDLC as designated Process Owner, ensuring audit-ready artifacts and compliance across the delivery lifecycle."] },
  { role: "Content Operations Manager", company: "Thermo Fisher Scientific", where: "Branford, CT", dates: "Jan 2017 – Nov 2019",
    bullets: [
      "Built and administered client- and technical-document repositories with versioning, archival, distribution, and automated QA testing for marketplace applications.",
      "Partnered with engineering to transform functional specifications into clear documentation for technical and non-technical audiences.",
      "Governed the application content lifecycle and formal release of applications to the Platform for Science Marketplace; managed Marketplace web content, video, and icon assets.",
      "Formalized customer-feedback processes feeding the application development lifecycle (ADLC); led consultant documentation resources."] },
  { role: "Training Manager / Customer Education Manager", company: "Core Informatics", where: "Branford, CT", dates: "Jan 2015 – Jan 2017",
    bullets: [
      "Directed instructional design and documentation programs and allocated resources across engineering, application management, and training.",
      "Designed and launched a multi-format eLearning portal delivering a richer educational experience to customers.",
      "Delivered instructor-led, train-the-trainer programs that enabled customer experts to run their own internal end-user training.",
      "Authored course content (presentations, video, hands-on labs, assessments); managed two direct reports and fed insight back to product development."] },
  { role: "Operations Technical Specialist / Hardware Inventory & Logistics Manager", company: "Cogstate", where: "New Haven, CT", dates: "Nov 2012 – Dec 2014",
    bullets: [
      "Provided project management and technical support for clinical-study deliverables, including online training content and new-product deployment.",
      "Managed hardware procurement, inventory, configuration, and domestic/international shipping and documentation.",
      "Led an infrastructure upgrade and office relocation/remodel; supported on-site and remote hardware, software, and systems."] },
  { role: "Computer & Network Technician / Scheduling Coordinator", company: "Guilford Public Schools", where: "Guilford, CT", dates: "May 1995 – Jun 2012",
    bullets: [
      "Administered a 120-node network with servers and printers; installed and configured Active Directory and Group Policy; managed imaging and backup.",
      "Contributed to long- and short-range technology planning and delivered end-user application support.",
      "Built master schedules in PowerSchool/PowerScheduler and Excel and produced all supporting reports and materials."] }
];

const COMP = {
  "Product & Agile": "SAFe Product Owner / Product Manager • Scrum Master • Backlog & roadmap ownership • PI planning, I&A, system demos • SDLC / Process ownership • BDD, CI/CD, DevOps",
  "Learning & Enablement": "Instructional design (ADDIE) • eLearning portals • LMS (Moodle, LearnUpon, Litmos) • Captivate, Camtasia, RoboHelp • Train-the-trainer • Technical writing & content operations",
  "Technical & Cloud": "Java, C++, SQL, HTML • AWS, Kubernetes, Rancher • Microservices & containers • Jenkins, Datadog, Splunk • Windows Server, Active Directory",
  "Domain": "Scientific informatics / LIMS • Platform for Science • Regulated, compliance-driven delivery"
};
const BASE_ORDER = ["Product & Agile", "Learning & Enablement", "Technical & Cloud", "Domain"];
const education = [
  ["Certificate of Advanced Graduate Studies — Educational Leadership", "University of New England", "2011"],
  ["M.S. Education", "University of New Haven", "2008"],
  ["B.S. Computer Science & Computer Engineering", "University of Connecticut", "1995"]
];

const VARIANTS = [
  { file: "John-L-Evans-Resume-2026.docx", title: "Staff Product Owner · SAFe · Learning & Enablement · Technical Communication", lead: [],
    summary: "SAFe-certified Staff Product Owner who pairs disciplined Agile delivery with a decade of instructional design, technical communication, and IT leadership. Owns team backlogs and the SDLC for enterprise scientific-software products, translates business needs into shippable solutions, and has repeatedly built the documentation, training, and enablement that make complex products usable. Computer Science & Computer Engineering foundation plus graduate study in education — equally fluent with engineers and with end users." },
  { file: "John-L-Evans-Resume-ProductOwner.docx", title: "Staff Product Owner · SAFe Product Owner / Product Manager · Agile Delivery", lead: ["Product & Agile"],
    summary: "SAFe-certified Staff Product Owner with 5+ years owning backlogs and the SDLC for enterprise scientific-software teams. Runs a predictable sprint cadence, facilitates all Scrum ceremonies (and serves as Scrum Master for two teams), and drives program-level events — PI planning, Inspect & Adapt, and system demos — alongside the RTE and product/engineering leadership. Serves as the conduit between business stakeholders and developers, with a Computer Science & Computer Engineering foundation that earns engineering credibility." },
  { file: "John-L-Evans-Resume-Enablement.docx", title: "Learning & Enablement Leader · Instructional Design · Customer Education", lead: ["Learning & Enablement"],
    summary: "Learning and enablement leader who has designed instructional programs, built eLearning portals, and delivered instructor-led, train-the-trainer education for enterprise software customers. Fluent across the modern L&D toolset (ADDIE, LMS platforms, Captivate/Camtasia/RoboHelp) and uniquely backed by product-ownership and a Computer Science background — so the training is technically accurate and tied to how the product actually ships. Graduate study in education (M.S. Education; CAGS Educational Leadership)." },
  { file: "John-L-Evans-Resume-LIMS.docx", title: "Product Owner · Scientific Informatics & LIMS · Platform for Science", lead: ["Domain", "Product & Agile"],
    summary: "Product Owner specializing in scientific informatics, with deep experience on Thermo Fisher's Platform for Science and Core Informatics' LIMS — spanning product ownership, application content lifecycle, and customer training in regulated, compliance-driven environments. Combines SAFe Agile delivery, a Computer Science & Computer Engineering degree, and hands-on knowledge of lab-software workflows to translate scientific user needs into shippable product." }
];

function orderFor(lead) {
  const rest = BASE_ORDER.filter((g) => !lead.includes(g));
  return [...lead, ...rest];
}

function buildDoc(v) {
  const children = [];
  children.push(new Paragraph({ spacing: { after: 0 }, children: [new TextRun({ text: "John L. Evans", bold: true, size: 40, color: DARK })] }));
  children.push(new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: v.title, size: 21, color: ACCENT })] }));
  children.push(new Paragraph({ spacing: { after: 40 }, border: rule("CCCCCC", 6), children: [
    new TextRun({ text: "Guilford, CT", size: 20, color: GRAY }),
    new TextRun({ text: "   |   ", size: 20, color: "BBBBBB" }),
    new ExternalHyperlink({ link: "mailto:johnlorinevans@gmail.com", children: [new TextRun({ text: "johnlorinevans@gmail.com", size: 20, color: ACCENT, style: "Hyperlink" })] }),
    new TextRun({ text: "   |   (203) 676-3551", size: 20, color: GRAY })] }));

  children.push(heading("Professional Summary"));
  children.push(new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: v.summary, size: 21, color: DARK })] }));

  children.push(heading("Core Competencies"));
  orderFor(v.lead).forEach((g) => children.push(new Paragraph({ spacing: { after: 50 },
    children: [new TextRun({ text: g + ":  ", bold: true, size: 21, color: DARK }), new TextRun({ text: COMP[g], size: 21, color: GRAY })] })));

  children.push(heading("Professional Experience"));
  experience.forEach((e) => { jobHeader(e.role, e.company, e.where, e.dates).forEach((p) => children.push(p)); e.bullets.forEach((b) => children.push(bullet(b))); });

  children.push(heading("Certifications"));
  children.push(new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: "Certified SAFe Product Owner / Product Manager", size: 21, color: DARK })] }));

  children.push(heading("Education"));
  education.forEach(([deg, school, yr]) => {
    children.push(new Paragraph({ spacing: { after: 40 }, tabStops: [{ type: TabStopType.RIGHT, position: 9360 }],
      children: [new TextRun({ text: deg, bold: true, size: 21, color: DARK }), new TextRun({ text: "\t" + yr, size: 20, color: GRAY })] }));
    children.push(new Paragraph({ spacing: { after: 30 }, children: [new TextRun({ text: school, italics: true, size: 20, color: ACCENT })] }));
  });

  return new Document({
    numbering: { config: [{ reference: "bullets", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 360, hanging: 200 } } } }] }] },
    styles: { default: { document: { run: { font: "Calibri", size: 21 } } } },
    sections: [{ properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1080, right: 1440, bottom: 1080, left: 1440 } } }, children }]
  });
}

const outDir = "C:/Users/AirPenguin/Desktop/jlejob/assets/resume";
fs.mkdirSync(outDir, { recursive: true });
(async () => {
  for (const v of VARIANTS) {
    const buf = await Packer.toBuffer(buildDoc(v));
    fs.writeFileSync(outDir + "/" + v.file, buf);
    console.log("wrote", v.file, buf.length + "B");
  }
})();
