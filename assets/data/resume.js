/* Rewritten résumé (2026) — analyzed & restructured from John L. Evans' resume.
   Modern format: summary + core competencies first, achievement-oriented bullets,
   street address intentionally omitted (current best practice + privacy). */
window.RESUME = {
  name: "John L. Evans",
  title: "Staff Product Owner · SAFe · Learning & Enablement · Technical Communication",
  contact: { location: "Guilford, CT", email: "johnlorinevans@gmail.com", phone: "(203) 676-3551" },
  downloadFile: "assets/resume/John-L-Evans-Resume-2026.docx",

  summary:
    "SAFe-certified Staff Product Owner who pairs disciplined Agile delivery with a decade of " +
    "instructional design, technical communication, and IT leadership. Owns team backlogs and the SDLC " +
    "for enterprise scientific-software products, translates business needs into shippable solutions, and " +
    "has repeatedly built the documentation, training, and enablement that make complex products usable. " +
    "Computer Science & Computer Engineering foundation plus graduate study in education — equally fluent " +
    "with engineers and with end users.",

  competencies: [
    { group: "Product & Agile", items: ["SAFe Product Owner / Product Manager", "Scrum Master", "Backlog & roadmap ownership", "PI planning · I&A · system demos", "SDLC / Process ownership", "BDD · CI/CD · DevOps"] },
    { group: "Learning & Enablement", items: ["Instructional design (ADDIE)", "eLearning portals", "LMS: Moodle · LearnUpon · Litmos", "Captivate · Camtasia · RoboHelp", "Train-the-trainer", "Technical writing & content ops"] },
    { group: "Technical & Cloud", items: ["Java · C++ · SQL · HTML", "AWS · Kubernetes · Rancher", "Microservices · Containers", "Jenkins · Datadog · Splunk", "Windows Server · Active Directory"] },
    { group: "Domain", items: ["Scientific informatics / LIMS", "Platform for Science", "Regulated / compliance-driven delivery"] }
  ],

  experience: [
    {
      role: "Staff Product Owner", company: "Thermo Fisher Scientific", where: "Branford, CT / Remote", dates: "Nov 2019 – Present",
      bullets: [
        "Own and prioritize backlogs for engineering teams, sustaining a predictable two-week sprint cadence and a continuously groomed, business-aligned pipeline of work.",
        "Facilitate all Scrum ceremonies and serve as Scrum Master for two teams; represent the teams in ART Sync and PMO leadership forums.",
        "Drive program-level SAFe events — PI planning, Inspect & Adapt, and system demos — in partnership with the RTE, product management, and engineering management.",
        "Act as the primary conduit between business stakeholders and software development, capturing requirements and proposing solutions through defined processes.",
        "Own the SDLC as designated Process Owner, ensuring audit-ready artifacts and compliance across the delivery lifecycle."
      ]
    },
    {
      role: "Content Operations Manager", company: "Thermo Fisher Scientific", where: "Branford, CT", dates: "Jan 2017 – Nov 2019",
      bullets: [
        "Built and administered client- and technical-document repositories with versioning, archival, distribution, and automated QA testing for marketplace applications.",
        "Partnered with engineering to transform functional specifications into clear documentation for technical and non-technical audiences.",
        "Governed the application content lifecycle and formal release of applications to the Platform for Science Marketplace; managed Marketplace web content, video, and icon assets.",
        "Formalized customer-feedback processes feeding the application development lifecycle (ADLC); provided day-to-day leadership for consultant documentation resources."
      ]
    },
    {
      role: "Training Manager / Customer Education Manager", company: "Core Informatics", where: "Branford, CT", dates: "Jan 2015 – Jan 2017",
      bullets: [
        "Directed instructional design and documentation programs and allocated resources across engineering, application management, and training.",
        "Designed and launched a multi-format eLearning portal delivering a richer educational experience to customers.",
        "Delivered instructor-led, train-the-trainer programs that enabled customer experts to run their own internal end-user training.",
        "Authored course content (presentations, video, hands-on labs, assessments) for generic systems and customer-specific implementations; managed two direct reports and fed insight back to product development."
      ]
    },
    {
      role: "Operations Technical Specialist / Hardware Inventory & Logistics Manager", company: "Cogstate", where: "New Haven, CT", dates: "Nov 2012 – Dec 2014",
      bullets: [
        "Provided project management and technical support for clinical-study deliverables, including integration of online training content and new-product deployment.",
        "Managed hardware procurement, inventory, configuration, and domestic/international shipping and documentation.",
        "Led an infrastructure upgrade and office relocation/remodel; supported on-site and remote hardware, software, and systems."
      ]
    },
    {
      role: "Computer & Network Technician / Scheduling Coordinator", company: "Guilford Public Schools", where: "Guilford, CT", dates: "May 1995 – Jun 2012",
      bullets: [
        "Administered a 120-node network with servers and printers; installed and configured Active Directory and Group Policy; managed imaging and backup.",
        "Contributed to long- and short-range technology planning and delivered end-user application support.",
        "Built master schedules in PowerSchool/PowerScheduler and Excel and produced all supporting reports and materials."
      ]
    }
  ],

  certifications: ["Certified SAFe Product Owner / Product Manager"],

  education: [
    { deg: "Certificate of Advanced Graduate Studies — Educational Leadership", school: "University of New England", yr: "2011" },
    { deg: "M.S. Education", school: "University of New Haven", yr: "2008" },
    { deg: "B.S. Computer Science & Computer Engineering", school: "University of Connecticut", yr: "1995" }
  ]
};
