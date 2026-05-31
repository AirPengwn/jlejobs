/* ============================================================================
 * scoring-config.js — Opportunity Dashboard fit-scoring configuration
 * ----------------------------------------------------------------------------
 * Single source of truth for the fit-scoring heuristic. Everything here is
 * meant to be HAND-TUNED by the owner — no logic lives in this file, only
 * tunable data + constants. app.js reads these (window.SCORING_CONFIG) and
 * applies them.
 *
 * Seeded from John L. Evans's résumé (2026-05-30). Current trajectory: Staff
 * Product Owner (SAFe/Agile) + strong customer education / training /
 * instructional-design history. Deep past (K-12 teaching, network/PC tech,
 * sysadmin) is real but NOT the target — roles matching only that past should
 * score lower. Adjust freely as you notice mis-scores.
 *
 * (Loaded as a classic <script> before app.js — namespaced on window.)
 * ==========================================================================*/
window.SCORING_CONFIG = (function () {

/* 1. CALIBRATION CONSTANTS (Phase 1 — absolute scale) */
const SCORING = {
  // Raw weighted score that maps to a "strong fit" (~90 on the dial).
  // CALIBRATED 2026-05-30 against the anchor cards with bio vocab (P4) +
  // coverage blend (P5). Measured blended scores: Customer Trainer ≈27.6,
  // Agile PO ≈26.6, RTE/Agile Coach ≈22.7, Sales Enablement ≈21.5. At
  // FIT_TARGET=30 the strongest match lands ~92, nothing hits the 98 cap, and
  // 95+ stays reserved for a rarer match. Lower this toward ~26 if you want the
  // whole top cluster (incl. Sales Enablement/RTE) to read higher.
  FIT_TARGET: 30,

  // Hard ceiling on displayed score. Never show 100 (reads as a bug/flattery).
  DISPLAY_CAP: 98,
  // Floor — weak matches still render a number.
  DISPLAY_FLOOR: 5,

  // Field weights (points per matching, normalized token).
  WEIGHTS: {
    title: 3,
    roleFamily: 3,
    skillTags: 2,
    description: 1, // also the weight applied to bio.js-derived vocab (Phase 4)
  },

  // Coverage blend (Phase 5a): blended = rawWeighted * (1 - B + B*coverageFraction)
  // 0 = ignore coverage; 1 = coverage dominates. 0.4 = count leads, coverage reorders.
  COVERAGE_BLEND: 0.4,

  // Disqualifier penalty (Phase 5b). Multiplier when a DISQUALIFIERS term is present.
  // Demote, don't hard-zero. 0.5 = halve.
  DISQUALIFIER_PENALTY: 0.5,

  // Tier thresholds for the anchor color. >=85 teal, 70-84 neutral, <70 muted.
  TIERS: { teal: 85, neutral: 70 },
};

/* 2. ALIAS MAP (Phase 2) — { canonical: [variants...] }. Normalize BOTH the
   résumé/bio vocab AND each card's tokens through this before matching. */
const ALIAS_MAP = {
  // --- Agile / SAFe / delivery (current core) ---
  agile: ["scrum", "agile", "kanban", "iterative", "scaled agile"],
  safe: ["safe", "scaled agile framework"],
  "product owner": ["product owner", "po", "product ownership"],
  "scrum master": ["scrum master", "scrummaster"],
  "release train": ["release train", "release train engineer", "rte", "art", "agile release train"],
  "program increment": ["program increment", "pi planning", "pi", "increment planning"],
  "inspect and adapt": ["inspect and adapt", "i&a", "ia"],
  "system demo": ["system demo", "system demos", "sprint demo", "sprint review"],
  backlog: ["backlog", "backlog grooming", "backlog refinement", "story refinement"],
  sprint: ["sprint", "sprints", "two-week sprint", "sprint cycle", "sprint ceremonies"],
  "product management": ["product management", "product manager", "pm", "roadmap", "product roadmap"],
  requirements: ["requirements", "user requirements", "functional requirements", "user stories", "acceptance criteria"],
  sdlc: ["sdlc", "software development life cycle", "software development lifecycle", "adlc", "application development life cycle"],

  // --- Customer education / training / enablement (current core) ---
  "customer education": ["customer education", "customer training", "client education", "client training"],
  enablement: ["enablement", "sales enablement", "customer enablement", "revenue enablement", "training & enablement"],
  "instructor-led": ["instructor-led", "instructor led", "ilt", "vilt", "classroom training", "live training", "hands-on courses"],
  elearning: ["elearning", "e-learning", "online training", "on-demand content", "on-demand training", "self-paced", "digital learning"],
  "instructional design": ["instructional design", "instructional designer", "id", "lxd", "learning experience design", "learning experience designer", "curriculum design", "course design", "course content"],
  training: ["training", "trainer", "training manager", "education", "educator", "learning & development", "l&d", "learning and development"],
  lms: ["lms", "learning management system", "learning management", "moodle", "learnupon", "litmos"],
  "curriculum development": ["curriculum development", "curriculum developer", "curriculum", "lead curriculum"],
  "content operations": ["content operations", "content ops", "content lifecycle", "content management", "documentation management"],
  "technical writing": ["technical writing", "technical writer", "technical documentation", "user documentation", "documentation", "user guides", "app guides"],

  // --- Lab / scientific software domain (Thermo Fisher / Core Informatics) ---
  "lab informatics": ["lab informatics", "laboratory informatics", "lims", "scientific informatics", "informatics platform", "platform for science"],
  "scientific software": ["scientific software", "lab software", "laboratory software", "life sciences software"],

  // --- Authoring / media tools ---
  "authoring tools": ["captivate", "camtasia", "articulate", "articulate rise", "articulate storyline", "storyline", "rise", "robohelp", "authoring tool", "authoring tools"],

  // --- Engineering / platform context (supporting, not target) ---
  "ci/cd": ["ci/cd", "cicd", "continuous integration", "continuous delivery", "jenkins"],
  devops: ["devops", "dev ops"],
  bdd: ["bdd", "behavior driven development", "behaviour driven development"],
  containers: ["containers", "container", "docker", "kubernetes", "k8s", "rancher", "microservices"],
  cloud: ["cloud", "aws", "amazon web services", "cloud environments"],
  observability: ["observability", "datadog", "splunk", "monitoring"],

  // --- Distributed / leadership soft signals ---
  "distributed teams": ["distributed teams", "geographically distributed", "remote teams", "cross-functional", "cross functional"],
  "stakeholder": ["stakeholder", "stakeholders", "business partners", "business stakeholders"],
};

/* 3. BIGRAM ALLOW-LIST (Phase 3) — detect these phrases FIRST as single tokens. */
const BIGRAMS = [
  "release train", "release train engineer", "product owner", "scrum master",
  "program increment", "pi planning", "inspect and adapt", "system demo",
  "customer education", "customer training", "sales enablement",
  "instructional design", "instructional designer", "learning experience",
  "learning experience designer", "curriculum development", "curriculum developer",
  "content operations", "technical writing", "technical writer", "lab informatics",
  "laboratory informatics", "scientific software", "learning management",
  "learning management system", "instructor led", "instructor-led",
  "product management", "product manager", "user requirements",
  "functional requirements", "software development", "distributed teams",
  "professional development",
];

/* 4. CORE COMPETENCIES (Phase 5a) — headline skills (canonical). Coverage =
   fraction of THIS set a card touches. Keep tight (8-12). */
const CORE_COMPETENCIES = [
  "product owner", "agile", "safe", "release train", "customer education",
  "enablement", "instructional design", "elearning", "training", "lms",
  "technical writing", "lab informatics",
];

/* 5. DISQUALIFIERS (Phase 5b) — presence applies DISQUALIFIER_PENALTY (demote,
   don't hide). Whole-token / phrase matching only ("director" must not hit
   "directory"/"directed"). "director" & "associate" are owner judgment calls. */
const DISQUALIFIERS = [
  // Too senior (exec)
  "vp", "vice president", "svp", "evp", "chief", "c-suite", "cto", "cio", "head of",
  "director", // matched whole-word; remove if you'd take a Director-level role
  // Too junior / wrong entry point
  "intern", "internship", "entry level", "entry-level", "junior",
  "associate", // optional — remove if "Associate PO" is acceptable
  // Back to the deep past (K-12 classroom / helpdesk)
  "k-12", "k12", "classroom teacher", "substitute teacher", "help desk", "helpdesk",
  "desktop support", "field technician",
  // Hard experience gates that overstate fit
  "10+ years", "phd required", "security clearance",
];

/* 6. STOP-WORDS supplement — merge into the existing list, don't replace. */
const EXTRA_STOPWORDS = [
  "experience", "strong", "ability", "skills", "responsible", "including",
  "various", "etc", "role", "team", "work", "working", "support", "manage",
  "managed", "provide", "provided", "new", "using", "use", "used",
];

  return { SCORING, ALIAS_MAP, BIGRAMS, CORE_COMPETENCIES, DISQUALIFIERS, EXTRA_STOPWORDS };
})();
