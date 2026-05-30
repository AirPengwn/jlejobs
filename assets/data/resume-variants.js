/* Tailored résumé variants. Same experience/education/competencies as
   window.RESUME; each variant re-leads the title, summary, and competency
   ordering for a target role family, and points to its own Word download. */
window.RESUME_VARIANTS = [
  {
    key: "general",
    label: "General",
    title: "Staff Product Owner · SAFe · Learning & Enablement · Technical Communication",
    downloadFile: "assets/resume/John-L-Evans-Resume-2026.docx",
    summary:
      "SAFe-certified Staff Product Owner who pairs disciplined Agile delivery with a decade of " +
      "instructional design, technical communication, and IT leadership. Owns team backlogs and the SDLC " +
      "for enterprise scientific-software products, translates business needs into shippable solutions, and " +
      "has repeatedly built the documentation, training, and enablement that make complex products usable. " +
      "Computer Science & Computer Engineering foundation plus graduate study in education — equally fluent " +
      "with engineers and with end users."
  },
  {
    key: "po",
    label: "Product Owner",
    title: "Staff Product Owner · SAFe Product Owner/Product Manager · Agile Delivery",
    downloadFile: "assets/resume/John-L-Evans-Resume-ProductOwner.docx",
    lead: ["Product & Agile"],
    summary:
      "SAFe-certified Staff Product Owner with 5+ years owning backlogs and the SDLC for enterprise " +
      "scientific-software teams. Runs a predictable sprint cadence, facilitates all Scrum ceremonies " +
      "(and serves as Scrum Master for two teams), and drives program-level events — PI planning, " +
      "Inspect & Adapt, and system demos — alongside the RTE and product/engineering leadership. " +
      "Serves as the conduit between business stakeholders and developers, with a Computer Science & " +
      "Computer Engineering foundation that earns engineering credibility."
  },
  {
    key: "enablement",
    label: "Learning & Enablement",
    title: "Learning & Enablement Leader · Instructional Design · Customer Education",
    downloadFile: "assets/resume/John-L-Evans-Resume-Enablement.docx",
    lead: ["Learning & Enablement"],
    summary:
      "Learning and enablement leader who has designed instructional programs, built eLearning portals, " +
      "and delivered instructor-led, train-the-trainer education for enterprise software customers. " +
      "Fluent across the modern L&D toolset (ADDIE, LMS platforms, Captivate/Camtasia/RoboHelp) and " +
      "uniquely backed by product-ownership and a Computer Science background — so the training is " +
      "technically accurate and tied to how the product actually ships. Graduate study in education " +
      "(M.S. Education; CAGS Educational Leadership)."
  },
  {
    key: "lims",
    label: "LIMS / Informatics",
    title: "Product Owner · Scientific Informatics & LIMS · Platform for Science",
    downloadFile: "assets/resume/John-L-Evans-Resume-LIMS.docx",
    lead: ["Domain", "Product & Agile"],
    summary:
      "Product Owner specializing in scientific informatics, with deep experience on Thermo Fisher's " +
      "Platform for Science and Core Informatics' LIMS — spanning product ownership, application content " +
      "lifecycle, and customer training in regulated, compliance-driven environments. Combines SAFe Agile " +
      "delivery, a Computer Science & Computer Engineering degree, and hands-on knowledge of lab-software " +
      "workflows to translate scientific user needs into shippable product."
  }
];
