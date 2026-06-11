/**
 * NXS City — Premium Isometric Command Campus
 * Spatial visualisation of the business as a living digital company.
 * Pure SVG isometric geometry — no game engine, no cartoon elements.
 */

import { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "wouter";
import {
  useGetMemoryAgentStatus,
  useListMemoryEntries,
  useListOpportunities,
  useListLeads,
} from "@workspace/api-client-react";
import {
  BrainCircuit, TrendingUp, Megaphone, ScanSearch, DollarSign,
  Settings2, Package, Database, Target, ChevronLeft,
  AlertTriangle, CheckCircle2, ArrowRight, Users, BarChart3,
  Activity, AlertCircle, ExternalLink, Map, Radio,
} from "lucide-react";
import { Button } from "@/components/ui/button";

// ─── Isometric Geometry ───────────────────────────────────────────────────────

const TWH = 50;  // tile half-width  — one unit right moves (+50, +25) on screen
const THH = 25;  // tile half-height
const WH  = 30;  // wall height per floor unit
const VW  = 1380;
const VH  = 860;

type Pt = [number, number];

function pts(points: Pt[]): string {
  return points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
}

interface BoxSpec { cx: number; cy: number; w: number; d: number; h: number }

function boxFaces(s: BoxSpec) {
  const { cx, cy, w, d, h } = s;
  const dh = h * WH;
  // Base vertices
  const F:  Pt = [cx,               cy              ];  // front (closest to viewer)
  const R:  Pt = [cx + w*TWH,       cy + w*THH      ];  // right
  const Bk: Pt = [cx + (w-d)*TWH,   cy + (w+d)*THH  ];  // back
  const L:  Pt = [cx - d*TWH,       cy + d*THH      ];  // left
  // Top vertices (raised by dh)
  const FT: Pt = [cx,               cy - dh              ];
  const RT: Pt = [cx + w*TWH,       cy + w*THH - dh      ];
  const BT: Pt = [cx + (w-d)*TWH,   cy + (w+d)*THH - dh  ];
  const LT: Pt = [cx - d*TWH,       cy + d*THH - dh      ];

  return {
    leftPoly:  pts([F, L, LT, FT]),
    rightPoly: pts([F, R, RT, FT]),
    topPoly:   pts([FT, RT, BT, LT]),
    // key vertices for decorations & labels
    F, R, Bk, L, FT, RT, BT, LT,
    // centre of top face
    topCx: (FT[0] + RT[0] + BT[0] + LT[0]) / 4,
    topCy: (FT[1] + RT[1] + BT[1] + LT[1]) / 4,
    // label anchor (front-top + some upward offset)
    labelX: FT[0],
    labelY: FT[1] - 14,
  };
}

// ─── Types ────────────────────────────────────────────────────────────────────

type BuildingStatus = "online" | "attention" | "alert" | "standby";

interface Agent {
  id: string; name: string; role: string;
  status: "active" | "standby" | "processing";
  mission: string; initials: string; hue: string;
}

interface CampusBuilding {
  // geometry
  cx: number; cy: number; w: number; d: number; h: number;
  // colours
  roofHex: string; leftHex: string; rightHex: string;
  accentHex: string; glowRgb: string;
  // identity
  id: string; name: string; subtitle: string;
  icon: typeof BrainCircuit;
  status: BuildingStatus; metric: string;
  // interior content
  description: string; purpose: string;
  agents: Agent[];
  missions: string[];
  risks: string[];
  actions: string[];
  links: Array<{ href: string; label: string }>;
}

// ─── Status Helpers ───────────────────────────────────────────────────────────

function statusDotClass(s: BuildingStatus) {
  return s === "online"    ? "bg-green-400"
       : s === "attention" ? "bg-yellow-400 animate-pulse"
       : s === "alert"     ? "bg-red-400 animate-ping"
       : "bg-slate-500";
}
function statusLabel(s: BuildingStatus) {
  return s === "online" ? "ONLINE" : s === "attention" ? "ATTENTION" : s === "alert" ? "ALERT" : "STANDBY";
}
function statusTextClass(s: BuildingStatus) {
  return s === "online"    ? "text-green-400"
       : s === "attention" ? "text-yellow-400"
       : s === "alert"     ? "text-red-400"
       : "text-slate-500";
}
function statusGlowOpacity(s: BuildingStatus) {
  return s === "online" ? 0.35 : s === "attention" ? 0.5 : s === "alert" ? 0.7 : 0.1;
}

// ─── Building Definitions ─────────────────────────────────────────────────────

const BUILDINGS: CampusBuilding[] = [
  // ── NXS HQ ──────────────────────────────────────────────────────────────────
  {
    id: "hq", name: "NXS HQ", subtitle: "Orchestrator & Command",
    icon: BrainCircuit,
    cx: 690, cy: 430, w: 2, d: 2, h: 8,
    roofHex: "#1d3c72", leftHex: "#0d2248", rightHex: "#060f22",
    accentHex: "#60a5fa", glowRgb: "96,165,250",
    status: "online", metric: "29 memories loaded",
    description: "Central command and intelligence tower. Maya, your AI Chief of Staff, coordinates all cross-department operations from here.",
    purpose: "Orchestration, Strategic Intelligence, Morning Briefings",
    agents: [
      { id:"maya",   name:"Maya",   role:"Chief Orchestrator",   status:"active",     mission:"Coordinating daily execution plan and cross-department orchestration", initials:"MA", hue:"#60a5fa" },
      { id:"neural", name:"Neural", role:"Knowledge Director",   status:"active",     mission:"Processing and categorising incoming memory entries in real time",      initials:"NR", hue:"#818cf8" },
      { id:"scout",  name:"Scout",  role:"Briefing Intelligence",status:"processing", mission:"Compiling market signals and risk alerts for morning brief",           initials:"SC", hue:"#a78bfa" },
    ],
    missions: [
      "Generate and deliver the daily morning brief",
      "Coordinate cross-department agent actions and escalations",
      "Maintain Strategic Brain, operating rules, and memory integrity",
      "Surface critical risks and highest-leverage opportunities",
    ],
    risks: ["Strategic Brain not fully seeded — context depth affects response quality", "Morning brief quality is bounded by memory entry volume"],
    actions: ["Ask Orchestrator: 'What should I focus on today?'", "Review morning brief and confirm top priority", "Add key decisions to Memory Engine after every major call"],
    links: [{ href: "/orchestrator", label: "Open Orchestrator" }, { href: "/morning-brief", label: "Morning Brief" }, { href: "/strategic-brain", label: "Strategic Brain" }],
  },
  // ── Sales Tower ──────────────────────────────────────────────────────────────
  {
    id: "sales", name: "Sales Tower", subtitle: "Pipeline & Revenue",
    icon: TrendingUp,
    cx: 395, cy: 325, w: 1, d: 1, h: 8,
    roofHex: "#0d3820", leftHex: "#072415", rightHex: "#03100a",
    accentHex: "#4ade80", glowRgb: "74,222,128",
    status: "attention", metric: "3 leads · $66K pipeline",
    description: "Sales operations command. Manages the full lead pipeline from qualification through close. Drives revenue actions aligned to the $250K ARR target.",
    purpose: "Lead Qualification, Pipeline Management, Deal Pursuit",
    agents: [
      { id:"apex",  name:"Apex",  role:"Sales Director",    status:"active",  mission:"Prioritising Grand Group, RPLit, True Level Cleaning — all at incoming stage", initials:"AP", hue:"#4ade80" },
      { id:"surge", name:"Surge", role:"Lead Intelligence", status:"active",  mission:"Scoring and ranking leads against ICP criteria",                              initials:"SG", hue:"#34d399" },
      { id:"rex",   name:"Rex",   role:"Deal Pursuit",      status:"standby", mission:"Preparing audit-first sequences for warm prospects",                         initials:"RX", hue:"#2dd4bf" },
    ],
    missions: ["Close Grand Group ($24K), RPLit ($24K), True Level Cleaning ($18K)", "Book free business audits as the entry point for every prospect", "Qualify all incoming leads within 24 hours", "Track pipeline against $250K ARR / $20,833 MRR target"],
    risks: ["All 3 key leads still at incoming — no audit booked", "Currently $0 MRR — pre-revenue"],
    actions: ["Book free business audit with Grand Group this week", "Book free business audit with RPLit this week", "Book free business audit with True Level Cleaning this week"],
    links: [{ href: "/leads", label: "Open Pipeline" }],
  },
  // ── Marketing Studio ─────────────────────────────────────────────────────────
  {
    id: "marketing", name: "Marketing Studio", subtitle: "Brand & Audience",
    icon: Megaphone,
    cx: 990, cy: 315, w: 1, d: 1, h: 7,
    roofHex: "#3a0e30", leftHex: "#27091f", rightHex: "#12040f",
    accentHex: "#f472b6", glowRgb: "244,114,182",
    status: "standby", metric: "Activation: post first close",
    description: "Brand positioning and audience growth command. LinkedIn content strategy, market positioning, and inbound-only lead generation. No cold outreach.",
    purpose: "LinkedIn Content, Brand Positioning, Audience Growth",
    agents: [
      { id:"echo",  name:"Echo",  role:"Brand Director",       status:"standby",    mission:"Developing NXS AI positioning: AI Chief of Staff for Sydney SMBs", initials:"EC", hue:"#f472b6" },
      { id:"pulse", name:"Pulse", role:"Growth Strategist",    status:"standby",    mission:"Planning LinkedIn content calendar for Sydney SMB decision-makers",  initials:"PL", hue:"#fb7185" },
      { id:"iris",  name:"Iris",  role:"Creative Intelligence",status:"processing", mission:"Analysing competitor content gaps for NXS AI differentiation",      initials:"IR", hue:"#e879f9" },
    ],
    missions: ["Establish Jay as go-to voice for AI + SMBs in Sydney", "Build content series: 'Your AI tools forget. NXS OS remembers.'", "Generate inbound leads via thought leadership — no cold outreach", "Develop referral activation with current network"],
    risks: ["Marketing deprioritised — close existing leads first", "No active content calendar yet"],
    actions: ["Post first LinkedIn piece once Grand Group / RPLit / TLC are closed", "Develop 3-post content series on NXS OS memory differentiation"],
    links: [],
  },
  // ── Intelligence Centre ───────────────────────────────────────────────────────
  {
    id: "intelligence", name: "Intelligence Centre", subtitle: "Research & Signals",
    icon: ScanSearch,
    cx: 345, cy: 510, w: 2, d: 1, h: 6,
    roofHex: "#1e0d44", leftHex: "#130830", rightHex: "#08041a",
    accentHex: "#c084fc", glowRgb: "192,132,252",
    status: "online", metric: "12 high-priority signals",
    description: "Market intelligence and competitive analysis hub. Monitors the competitive landscape, tracks industry signals, evaluates strategic opportunities.",
    purpose: "Market Research, Competitive Intelligence, Signal Detection",
    agents: [
      { id:"cipher", name:"Cipher", role:"Research Director",   status:"active",     mission:"Tracking competitor gaps — Zapier, Make, ChatGPT Enterprise", initials:"CI", hue:"#c084fc" },
      { id:"atlas",  name:"Atlas",  role:"Competitive Analyst", status:"processing", mission:"Mapping Sydney SMB AI adoption patterns",                    initials:"AT", hue:"#a855f7" },
      { id:"sigma",  name:"Sigma",  role:"Signal Detection",    status:"active",     mission:"Monitoring LinkedIn signals for NXS AI positioning gaps",     initials:"SI", hue:"#9333ea" },
    ],
    missions: ["Monitor competitors: Zapier, Make, ChatGPT Enterprise, Notion AI", "Track Sydney SMB AI adoption rate and willingness to pay", "Surface market gaps NXS AI can uniquely own"],
    risks: ["AI ops space moving fast — competitive gaps may close quickly", "Persistent memory is rare differentiator but not patented — speed matters"],
    actions: ["Document: 'No AI tool builds persistent memory' — use in all positioning", "Research top 3 competitors and map gaps in Opportunity Engine"],
    links: [{ href: "/opportunities", label: "Opportunity Engine" }],
  },
  // ── Memory Vault ─────────────────────────────────────────────────────────────
  {
    id: "memory", name: "Memory Vault", subtitle: "Knowledge & Context",
    icon: Database,
    cx: 1075, cy: 440, w: 1, d: 1, h: 7,
    roofHex: "#0d3040", leftHex: "#082028", rightHex: "#040f14",
    accentHex: "#22d3ee", glowRgb: "34,211,238",
    status: "online", metric: "29 entries · 27 high-priority",
    description: "The core moat of NXS OS. Persistent, categorised, searchable knowledge base shared across all agents. This is what separates NXS OS from every competitor — memory that compounds.",
    purpose: "Persistent Memory, Knowledge Preservation, Context Accumulation",
    agents: [
      { id:"recall", name:"Recall", role:"Memory Director",      status:"active",     mission:"Preserving and indexing all decisions, lessons, and context",      initials:"RC", hue:"#22d3ee" },
      { id:"index",  name:"Index",  role:"Classification Agent", status:"active",     mission:"Tagging and categorising incoming memory entries for retrieval",    initials:"IX", hue:"#06b6d4" },
      { id:"trace",  name:"Trace",  role:"Pattern Recognition",  status:"processing", mission:"Identifying recurring patterns across goals and client outcomes", initials:"TR", hue:"#0891b2" },
    ],
    missions: ["Maintain complete, categorised memory across all entry types", "Ensure every Orchestrator response is grounded in real memory", "Flag stale entries and prompt for review", "Build compounding knowledge base — every interaction adds an entry"],
    risks: ["Memory quality directly limits Orchestrator intelligence", "Stale or uncategorised entries reduce signal clarity"],
    actions: ["After every sales call: add a memory entry with outcome and next action", "After every decision: log it as a 'decision' category entry", "Weekly: review stale entries and update or archive"],
    links: [{ href: "/memory", label: "Memory Engine" }, { href: "/memory-graph", label: "Memory Graph" }],
  },
  // ── Finance Command ───────────────────────────────────────────────────────────
  {
    id: "finance", name: "Finance Command", subtitle: "Revenue & Cash Flow",
    icon: DollarSign,
    cx: 215, cy: 640, w: 1, d: 1, h: 5,
    roofHex: "#0d3820", leftHex: "#072810", rightHex: "#03140a",
    accentHex: "#34d399", glowRgb: "52,211,153",
    status: "attention", metric: "$0 MRR · $250K ARR target",
    description: "Financial intelligence and revenue command. Tracks MRR, ARR progress, and alerts on revenue gaps.",
    purpose: "Revenue Tracking, ARR Progress, Financial Forecasting",
    agents: [
      { id:"vault",  name:"Vault",  role:"Finance Director",    status:"active",  mission:"Monitoring ARR progress — currently pre-revenue",              initials:"VL", hue:"#34d399" },
      { id:"ledger", name:"Ledger", role:"Analytics Agent",     status:"active",  mission:"Building revenue model: 8-10 retainers at $2-3.5K AUD/month", initials:"LD", hue:"#10b981" },
      { id:"aris",   name:"Aris",   role:"Forecast Intelligence",status:"standby", mission:"Modelling scenario paths to $250K ARR by December 31, 2026",  initials:"AR", hue:"#059669" },
    ],
    missions: ["Track monthly progress toward $250K AUD ARR target", "Monitor retainer pipeline: $66K potential", "Alert when MRR falls behind $20,833/month pace"],
    risks: ["Currently $0 MRR — first retainer close is critical", "Single-founder bottleneck caps capacity at 5-6 clients"],
    actions: ["Close 3 current leads to activate first revenue stream", "Model: at what client count does $250K ARR become achievable by Dec 31?"],
    links: [{ href: "/kpi", label: "KPI Layer" }],
  },
  // ── Operations Hub ────────────────────────────────────────────────────────────
  {
    id: "operations", name: "Operations Hub", subtitle: "Tasks, Risks & Execution",
    icon: Settings2,
    cx: 645, cy: 615, w: 2, d: 1, h: 5,
    roofHex: "#3a2208", leftHex: "#281804", rightHex: "#140c02",
    accentHex: "#fb923c", glowRgb: "251,146,60",
    status: "attention", metric: "3 items at risk",
    description: "Operational execution and risk management hub. Manages open tasks, monitors risks in memory, enforces operating rules.",
    purpose: "Task Management, Risk Monitoring, Execution Oversight",
    agents: [
      { id:"helm",  name:"Helm",  role:"Operations Director",  status:"active",     mission:"Monitoring flagged risks and needs-review items across memory", initials:"HM", hue:"#fb923c" },
      { id:"axis",  name:"Axis",  role:"Process Intelligence", status:"processing", mission:"Mapping manual workflows that could be automated in V2",       initials:"AX", hue:"#f97316" },
      { id:"guard", name:"Guard", role:"Risk Monitor",         status:"active",     mission:"Patrolling for rule violations, constraint breaches",           initials:"GD", hue:"#ea580c" },
    ],
    missions: ["Monitor all items flagged 'needs review' in Memory Engine", "Enforce operating rules: revenue first, no cold outreach", "Alert when Jay spreads too thin across goals"],
    risks: ["Multiple items currently flagged needs-review", "Goals without next actions accumulate into background anxiety"],
    actions: ["Review all memory entries flagged 'needs review' this week", "Ensure every active goal has a defined next action", "Check: are you violating any operating rules right now?"],
    links: [{ href: "/memory", label: "Memory Engine" }, { href: "/agents", label: "Agent Layer" }],
  },
  // ── Delivery Centre ───────────────────────────────────────────────────────────
  {
    id: "delivery", name: "Delivery Centre", subtitle: "Clients & Projects",
    icon: Package,
    cx: 878, cy: 570, w: 1, d: 1, h: 5,
    roofHex: "#0d2d40", leftHex: "#081e2a", rightHex: "#040f15",
    accentHex: "#38bdf8", glowRgb: "56,189,248",
    status: "standby", metric: "Awaiting first retainer",
    description: "Client delivery and project management command. Activation pending first retainer close.",
    purpose: "Client Onboarding, Project Delivery, Milestone Management",
    agents: [
      { id:"crest", name:"Crest", role:"Delivery Director",    status:"standby", mission:"Awaiting first retainer — onboarding SOP defined and ready",     initials:"CR", hue:"#38bdf8" },
      { id:"flow",  name:"Flow",  role:"Project Intelligence", status:"standby", mission:"Building project tracking framework for retainer delivery model", initials:"FL", hue:"#0ea5e9" },
      { id:"sync",  name:"Sync",  role:"Client Success",       status:"standby", mission:"Preparing client communication SLA and weekly update template",    initials:"SY", hue:"#0284c7" },
    ],
    missions: ["Onboard Grand Group, RPLit, True Level Cleaning once signed", "Deliver first working output within 7 days of kickoff", "Maintain weekly async client updates"],
    risks: ["Single-founder bottleneck — max 5-6 active clients", "Delivery Centre dormant until first retainer is closed"],
    actions: ["Finalise onboarding SOP before Grand Group signs", "Prepare kickoff call template and first-week delivery checklist"],
    links: [],
  },
  // ── Opportunity Radar ─────────────────────────────────────────────────────────
  {
    id: "radar", name: "Opportunity Radar", subtitle: "Discovery & Growth",
    icon: Target,
    cx: 1115, cy: 608, w: 1, d: 1, h: 6,
    roofHex: "#302a08", leftHex: "#221e04", rightHex: "#100e02",
    accentHex: "#facc15", glowRgb: "250,204,21",
    status: "online", metric: "14 opportunities tracked",
    description: "Strategic opportunity detection and evaluation. Continuously scans for niche gaps, partnership potential, and competitive advantages.",
    purpose: "Opportunity Detection, Strategic Evaluation, Growth Signal Monitoring",
    agents: [
      { id:"radarA", name:"Radar",  role:"Intelligence Director", status:"active",     mission:"Monitoring opportunity pipeline: active entries across 7 categories", initials:"RD", hue:"#facc15" },
      { id:"scope",  name:"Scope",  role:"Market Scanner",        status:"active",     mission:"Analysing market signals for new niche opportunities in Sydney SMB",   initials:"SP", hue:"#eab308" },
      { id:"bloom",  name:"Bloom",  role:"Growth Analyst",        status:"processing", mission:"Evaluating annual plan conversion opportunity for future clients",      initials:"BL", hue:"#ca8a04" },
    ],
    missions: ["Maintain and rank active opportunity pipeline by priority", "Surface the highest-leverage opportunity not yet being pursued", "Flag opportunities stuck at evaluating for >2 weeks"],
    risks: ["Multiple high-priority opportunities stuck at evaluating", "Agency partnership opportunity needs activation"],
    actions: ["Make binary decision on every opportunity stuck at 'evaluating'", "Activate agency partnership — identify 3 warm intro targets"],
    links: [{ href: "/opportunities", label: "Opportunity Engine" }],
  },
];

// Draw order: painter's algorithm — lowest cy (furthest back) drawn first
const SORTED = [...BUILDINGS].sort((a, b) => a.cy - b.cy);

// ─── SVG Filters ─────────────────────────────────────────────────────────────

function CityDefs() {
  return (
    <defs>
      <filter id="blur6" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="6" />
      </filter>
      <filter id="blur12" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="12" />
      </filter>
      <filter id="glow" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="3" result="blur" />
        <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
      </filter>
      {/* Radial ground gradient for each building */}
      {BUILDINGS.map(b => (
        <radialGradient key={b.id} id={`ground-${b.id}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={`rgb(${b.glowRgb})`} stopOpacity="0.18" />
          <stop offset="100%" stopColor={`rgb(${b.glowRgb})`} stopOpacity="0" />
        </radialGradient>
      ))}
      {/* Energy path gradient */}
      <linearGradient id="energyGrad" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="#60a5fa" stopOpacity="0.1" />
        <stop offset="50%" stopColor="#60a5fa" stopOpacity="0.5" />
        <stop offset="100%" stopColor="#60a5fa" stopOpacity="0.1" />
      </linearGradient>
    </defs>
  );
}

// ─── Background ───────────────────────────────────────────────────────────────

function CityBackground() {
  // Isometric ground grid lines
  const lines = [];
  const step = TWH; // tile step
  for (let i = -20; i <= 40; i++) {
    // Right-going lines (isoX direction)
    const startX = i * TWH - 1000;
    lines.push(
      <line key={`r${i}`}
        x1={startX} y1={0} x2={startX + VW * 1.5} y2={VW * 1.5 * THH / TWH}
        stroke="rgba(96,165,250,0.06)" strokeWidth="0.8" />
    );
    // Left-going lines (isoY direction)
    lines.push(
      <line key={`l${i}`}
        x1={VW - startX} y1={0} x2={VW - startX - VW * 1.5} y2={VW * 1.5 * THH / TWH}
        stroke="rgba(96,165,250,0.06)" strokeWidth="0.8" />
    );
  }
  return (
    <g>
      {/* Deep space */}
      <rect x="0" y="0" width={VW} height={VH} fill="#06090f" />
      {/* Vignette */}
      <radialGradient id="vig" cx="50%" cy="45%" r="55%">
        <stop offset="0%" stopColor="#0c1628" stopOpacity="0" />
        <stop offset="100%" stopColor="#020306" stopOpacity="0.8" />
      </radialGradient>
      <rect x="0" y="0" width={VW} height={VH} fill="url(#vig)" />
      {/* Grid */}
      {lines}
      {/* HQ epicentre atmosphere */}
      <ellipse cx="690" cy="380" rx="280" ry="120" fill="rgba(59,130,246,0.04)" filter="url(#blur12)" />
    </g>
  );
}

// ─── Energy Paths ─────────────────────────────────────────────────────────────

function EnergyPaths({ hqCx, hqCy }: { hqCx: number; hqCy: number }) {
  return (
    <g opacity="0.55">
      {BUILDINGS.filter(b => b.id !== "hq").map(b => {
        const dx = hqCx - b.cx;
        const dy = hqCy - b.cy;
        const dist = Math.sqrt(dx*dx + dy*dy);
        // Midpoint for curved path
        const mx = (b.cx + hqCx) / 2;
        const my = (b.cy + hqCy) / 2 - dist * 0.08;
        return (
          <g key={b.id}>
            <path
              d={`M${b.cx},${b.cy} Q${mx},${my} ${hqCx},${hqCy}`}
              fill="none"
              stroke={`rgba(${b.glowRgb},0.15)`}
              strokeWidth="2"
              strokeDasharray="6 10"
            />
            <path
              d={`M${b.cx},${b.cy} Q${mx},${my} ${hqCx},${hqCy}`}
              fill="none"
              stroke={`rgba(${b.glowRgb},0.4)`}
              strokeWidth="0.6"
              filter="url(#glow)"
            />
          </g>
        );
      })}
    </g>
  );
}

// ─── Isometric Building SVG ───────────────────────────────────────────────────

function IsoBuilding({
  building,
  onClick,
  isHovered,
  onHover,
}: {
  building: CampusBuilding;
  onClick: () => void;
  isHovered: boolean;
  onHover: (v: boolean) => void;
}) {
  const { cx, cy, w, d, h, roofHex, leftHex, rightHex, accentHex, glowRgb, status } = building;
  const f = boxFaces({ cx, cy, w, d, h });
  const glowOp = statusGlowOpacity(status) * (isHovered ? 1.6 : 1);

  // Floor lines on left wall
  const leftFloorLines = [];
  for (let k = 1; k < h; k++) {
    const y0 = cy - k * WH;
    leftFloorLines.push(
      <line key={k}
        x1={cx} y1={y0}
        x2={cx - d*TWH} y2={y0 + d*THH}
        stroke={accentHex} strokeWidth="0.5" opacity="0.12"
      />
    );
  }
  // Floor lines on right wall
  const rightFloorLines = [];
  for (let k = 1; k < h; k++) {
    const y0 = cy - k * WH;
    rightFloorLines.push(
      <line key={k}
        x1={cx} y1={y0}
        x2={cx + w*TWH} y2={y0 + w*THH}
        stroke={accentHex} strokeWidth="0.5" opacity="0.10"
      />
    );
  }

  // Window lights — small glowing rectangles on walls at upper floors
  const windows: React.ReactNode[] = [];
  const floorStep = WH;
  const wCols = Math.max(1, Math.floor(w * 2));
  const dCols = Math.max(1, Math.floor(d * 2));
  // Left wall windows
  for (let row = 1; row < Math.min(h-1, 6); row++) {
    for (let col = 0; col < dCols; col++) {
      const t = (col + 0.5) / dCols;
      const wx = cx - t * d * TWH;
      const wy = cy - row * floorStep + t * d * THH - 4;
      windows.push(
        <rect key={`lw${row}-${col}`}
          x={wx - 3} y={wy - 3} width={6} height={4}
          fill={accentHex} opacity={isHovered ? 0.22 : 0.12}
          rx="0.5"
        />
      );
    }
  }
  // Right wall windows
  for (let row = 1; row < Math.min(h-1, 6); row++) {
    for (let col = 0; col < wCols; col++) {
      const t = (col + 0.5) / wCols;
      const wx = cx + t * w * TWH;
      const wy = cy - row * floorStep + t * w * THH - 4;
      windows.push(
        <rect key={`rw${row}-${col}`}
          x={wx - 3} y={wy - 3} width={6} height={4}
          fill={accentHex} opacity={isHovered ? 0.18 : 0.08}
          rx="0.5"
        />
      );
    }
  }

  // Status beacon at top
  const beaconX = f.topCx;
  const beaconY = f.topCy - 14;
  const beaconColor =
    status === "online"    ? "#4ade80" :
    status === "attention" ? "#facc15" :
    status === "alert"     ? "#f87171" : "#64748b";

  // Antenna for HQ
  const antennas = building.id === "hq" ? (
    <g>
      <line x1={f.topCx} y1={f.topCy} x2={f.topCx} y2={f.topCy - 36} stroke={accentHex} strokeWidth="1.5" opacity="0.8" />
      <line x1={f.topCx - 16} y1={f.topCy - 8} x2={f.topCx + 16} y2={f.topCy - 8} stroke={accentHex} strokeWidth="0.8" opacity="0.5" />
      <line x1={f.topCx - 10} y1={f.topCy - 18} x2={f.topCx + 10} y2={f.topCy - 18} stroke={accentHex} strokeWidth="0.8" opacity="0.4" />
      <circle cx={f.topCx} cy={f.topCy - 36} r="2.5" fill={accentHex} opacity="0.9" filter="url(#glow)" />
    </g>
  ) : building.id === "radar" ? (
    <g>
      <ellipse cx={f.topCx} cy={f.topCy - 8} rx="14" ry="6" fill="none" stroke={accentHex} strokeWidth="1" opacity="0.5" />
      <line x1={f.topCx} y1={f.topCy} x2={f.topCx} y2={f.topCy - 8} stroke={accentHex} strokeWidth="1.2" opacity="0.6" />
    </g>
  ) : building.id === "memory" ? (
    <g>
      <line x1={f.topCx - 8} y1={f.topCy - 2} x2={f.topCx + 8} y2={f.topCy - 2} stroke={accentHex} strokeWidth="1.5" opacity="0.5" />
      <line x1={f.topCx - 8} y1={f.topCy - 6} x2={f.topCx + 8} y2={f.topCy - 6} stroke={accentHex} strokeWidth="1.5" opacity="0.4" />
      <line x1={f.topCx - 8} y1={f.topCy - 10} x2={f.topCx + 8} y2={f.topCy - 10} stroke={accentHex} strokeWidth="1.5" opacity="0.3" />
    </g>
  ) : null;

  return (
    <g
      className="cursor-pointer"
      onClick={onClick}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
    >
      {/* Ground glow pool */}
      <ellipse
        cx={cx}
        cy={cy + (w + d) * THH / 2}
        rx={(w + d) * TWH * 0.8}
        ry={(w + d) * THH * 0.9}
        fill={`url(#ground-${building.id})`}
        opacity={glowOp}
        filter="url(#blur6)"
      />

      {/* Glow halo behind building (blurred duplicate) */}
      {isHovered && (
        <>
          <polygon points={f.leftPoly}  fill={accentHex} opacity="0.2" filter="url(#blur6)" />
          <polygon points={f.rightPoly} fill={accentHex} opacity="0.15" filter="url(#blur6)" />
        </>
      )}

      {/* Right wall (darker — shadow side) */}
      <polygon points={f.rightPoly} fill={rightHex} />
      {/* Right wall edge highlight */}
      <polyline
        points={`${f.F[0]},${f.F[1]} ${f.R[0]},${f.R[1]} ${f.RT[0]},${f.RT[1]} ${f.FT[0]},${f.FT[1]}`}
        fill="none" stroke={accentHex} strokeWidth="0.5" opacity="0.2"
      />
      {rightFloorLines}

      {/* Left wall (medium — lit side) */}
      <polygon points={f.leftPoly} fill={leftHex} />
      <polyline
        points={`${f.F[0]},${f.F[1]} ${f.L[0]},${f.L[1]} ${f.LT[0]},${f.LT[1]} ${f.FT[0]},${f.FT[1]}`}
        fill="none" stroke={accentHex} strokeWidth="0.5" opacity="0.3"
      />
      {leftFloorLines}

      {/* Windows */}
      {windows}

      {/* Roof */}
      <polygon points={f.topPoly} fill={roofHex} />
      {/* Roof edge highlight */}
      <polygon
        points={f.topPoly}
        fill="none"
        stroke={accentHex}
        strokeWidth={isHovered ? "1.2" : "0.6"}
        opacity={isHovered ? 0.7 : 0.35}
      />
      {/* Roof accent shine */}
      <line
        x1={f.FT[0]} y1={f.FT[1]}
        x2={f.LT[0]} y2={f.LT[1]}
        stroke="rgba(255,255,255,0.08)" strokeWidth="1"
      />

      {/* Building-specific top details */}
      {antennas}

      {/* Status beacon */}
      <circle cx={beaconX} cy={beaconY} r="5" fill={beaconColor} opacity="0.2" filter="url(#blur6)" />
      <circle cx={beaconX} cy={beaconY} r="2.5" fill={beaconColor} opacity={0.9} />

      {/* Transparent hit area for easier clicking */}
      <polygon
        points={f.topPoly}
        fill="transparent"
        stroke="none"
      />
    </g>
  );
}

// ─── Building Label (SVG foreignObject) ──────────────────────────────────────

function BuildingLabel({
  building,
  isHovered,
  onClick,
}: {
  building: CampusBuilding;
  isHovered: boolean;
  onClick: () => void;
}) {
  const f = boxFaces({ cx: building.cx, cy: building.cy, w: building.w, d: building.d, h: building.h });
  const labelX = f.FT[0];
  const labelY = f.FT[1] - 10;

  const badgeColor =
    building.status === "online" ? "#4ade80" :
    building.status === "attention" ? "#facc15" :
    building.status === "alert" ? "#f87171" : "#64748b";

  const badgeBg =
    building.status === "online" ? "rgba(74,222,128,0.12)" :
    building.status === "attention" ? "rgba(250,204,21,0.12)" :
    building.status === "alert" ? "rgba(248,113,113,0.12)" : "rgba(100,116,139,0.1)";

  return (
    <foreignObject
      x={labelX - 70}
      y={labelY - 62}
      width="140"
      height="70"
      className="pointer-events-none overflow-visible"
    >
      <div
        className="flex flex-col items-center gap-1 pointer-events-auto cursor-pointer"
        onClick={onClick}
        style={{ opacity: isHovered ? 1 : 0.82, transition: "opacity 0.2s" }}
      >
        <div
          className="text-[9px] font-bold text-white tracking-wider text-center leading-tight px-2 py-0.5 rounded"
          style={{
            background: "rgba(6,9,15,0.75)",
            border: `1px solid rgba(${building.glowRgb},0.3)`,
            textShadow: `0 0 8px rgba(${building.glowRgb},0.8)`,
            backdropFilter: "blur(4px)",
          }}
        >
          {building.name}
        </div>
        <div className="flex items-center gap-1">
          <div
            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[7px] font-mono"
            style={{ background: badgeBg, border: `1px solid ${badgeColor}30`, color: badgeColor }}
          >
            <div className="w-1 h-1 rounded-full" style={{ background: badgeColor }} />
            {statusLabel(building.status)}
          </div>
        </div>
        <div
          className="text-[7px] font-mono text-center px-1.5 py-0.5 rounded"
          style={{
            color: `rgba(${building.glowRgb},0.9)`,
            background: `rgba(${building.glowRgb},0.08)`,
            border: `1px solid rgba(${building.glowRgb},0.2)`,
          }}
        >
          {building.metric}
        </div>
      </div>
    </foreignObject>
  );
}

// ─── City Canvas ──────────────────────────────────────────────────────────────

function CityCanvas({ onSelect }: { onSelect: (id: string) => void }) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const hq = BUILDINGS.find(b => b.id === "hq")!;

  return (
    <svg
      viewBox={`0 0 ${VW} ${VH}`}
      style={{ minWidth: 800, width: "100%", display: "block" }}
      className="select-none"
    >
      <CityDefs />
      <CityBackground />
      <EnergyPaths hqCx={hq.cx} hqCy={hq.cy} />

      {/* Buildings: painter's algorithm (back to front) */}
      {SORTED.map(b => (
        <IsoBuilding
          key={b.id}
          building={b}
          onClick={() => onSelect(b.id)}
          isHovered={hoveredId === b.id}
          onHover={v => setHoveredId(v ? b.id : null)}
        />
      ))}

      {/* Labels rendered after all buildings so they appear on top */}
      {SORTED.map(b => (
        <BuildingLabel
          key={b.id}
          building={b}
          isHovered={hoveredId === b.id}
          onClick={() => onSelect(b.id)}
        />
      ))}

      {/* Corner legend */}
      <g transform="translate(24, 820)">
        {(["online","attention","standby"] as BuildingStatus[]).map((s, i) => {
          const col = s === "online" ? "#4ade80" : s === "attention" ? "#facc15" : "#64748b";
          return (
            <g key={s} transform={`translate(${i * 90}, 0)`}>
              <circle cx="5" cy="5" r="3" fill={col} />
              <text x="12" y="9" fill={col} fontSize="8" fontFamily="monospace" opacity="0.7" textAnchor="start">
                {s.toUpperCase()}
              </text>
            </g>
          );
        })}
      </g>

      {/* City watermark */}
      <text x={VW - 12} y={VH - 8} fill="rgba(96,165,250,0.12)" fontSize="8" fontFamily="monospace" textAnchor="end">
        NXS CITY v2 · CLICK A BUILDING TO ENTER
      </text>
    </svg>
  );
}

// ─── Agent Card ───────────────────────────────────────────────────────────────

function AgentCard({ agent }: { agent: Agent }) {
  const isActive = agent.status === "active";
  const isProc = agent.status === "processing";
  return (
    <div className="flex flex-col gap-3 p-4 rounded-xl border border-white/8 bg-white/3 hover:bg-white/5 transition-all">
      <div className="flex items-start gap-3">
        <div className="relative flex-shrink-0">
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center text-sm font-bold tracking-wider text-white"
            style={{
              background: `linear-gradient(135deg, ${agent.hue}22, ${agent.hue}44)`,
              border: `1.5px solid ${agent.hue}55`,
              boxShadow: isActive ? `0 0 14px ${agent.hue}44` : "none",
            }}
          >
            {agent.initials}
          </div>
          <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[#06090f] ${isActive ? "bg-green-400" : isProc ? "bg-yellow-400 animate-pulse" : "bg-slate-500"}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-white">{agent.name}</span>
            <span className={`text-[8px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border ${isActive ? "border-green-400/30 text-green-400 bg-green-400/10" : isProc ? "border-yellow-400/30 text-yellow-400 bg-yellow-400/10" : "border-white/10 text-slate-500"}`}>
              {agent.status}
            </span>
          </div>
          <div className="text-[10px] text-white/40 mt-0.5">{agent.role}</div>
        </div>
      </div>
      <div className="text-[10px] text-white/50 leading-relaxed border-t border-white/8 pt-2.5">
        <span className="text-[8px] font-bold uppercase tracking-wider text-white/25 block mb-1">Current Mission</span>
        {agent.mission}
      </div>
    </div>
  );
}

// ─── Building Interior ────────────────────────────────────────────────────────

function BuildingInterior({
  building, onBack, liveData,
}: {
  building: CampusBuilding;
  onBack: () => void;
  liveData: {
    memCount: number;
    memories: Array<{ title: string; category: string; priority: string; status: string }>;
    opportunities: Array<{ title: string; status: string; priority: string; estimatedValue?: string | null }>;
    leads: Array<{ name: string; company?: string | null; stage: string; estimatedValue?: string | null }>;
  };
}) {
  const Icon = building.icon;

  function metrics(): Array<{ label: string; value: string; warn?: boolean; note?: string }> {
    switch (building.id) {
      case "hq": return [
        { label: "Memory Entries", value: String(liveData.memCount), note: "across all categories" },
        { label: "Strategic Brain", value: "Loaded", note: "6/6 context sections complete" },
        { label: "Agents Active", value: "3 / 3" },
        { label: "Morning Brief", value: "Daily", note: "generated at session start" },
      ];
      case "sales": return [
        { label: "Leads in Pipeline", value: String(liveData.leads.length), warn: liveData.leads.length === 0 },
        { label: "Pipeline Value", value: "$66K AUD", note: "Grand Group + RPLit + TLC" },
        { label: "Audits Booked", value: "0", warn: true, note: "Book audits — step one" },
        { label: "Retainers Closed", value: "0", warn: true, note: "Pre-revenue" },
      ];
      case "memory": return [
        { label: "Total Memories", value: String(liveData.memCount) },
        { label: "High / Critical Priority", value: String(liveData.memories.filter(m => m.priority === "high" || m.priority === "critical").length) },
        { label: "Needs Review", value: String(liveData.memories.filter(m => m.status === "needs_review").length), warn: liveData.memories.filter(m => m.status === "needs_review").length > 0 },
        { label: "Categories Active", value: "6" },
      ];
      case "radar": return [
        { label: "Active Opportunities", value: String(liveData.opportunities.filter(o => o.status !== "rejected").length) },
        { label: "High / Critical", value: String(liveData.opportunities.filter(o => o.priority === "high" || o.priority === "critical").length) },
        { label: "Stuck at Evaluating", value: String(liveData.opportunities.filter(o => o.status === "evaluating").length), warn: true },
        { label: "Currently Pursuing", value: String(liveData.opportunities.filter(o => o.status === "pursuing").length) },
      ];
      case "finance": return [
        { label: "Current MRR", value: "$0 AUD", warn: true, note: "Pre-revenue" },
        { label: "ARR Target", value: "$250K AUD", note: "by December 31, 2026" },
        { label: "Pipeline Value", value: "$66K AUD" },
        { label: "Clients Needed", value: "8–10 retainers", note: "$2–3.5K AUD/month" },
      ];
      default: return [
        { label: "Status", value: statusLabel(building.status) },
        { label: "Agents Assigned", value: String(building.agents.length) },
        { label: "Active Missions", value: String(building.missions.length) },
      ];
    }
  }

  function liveFeed() {
    switch (building.id) {
      case "sales": return liveData.leads.slice(0,5).map(l => ({
        label: `${l.name}${l.company ? ` — ${l.company}` : ""}`,
        meta: `${l.stage} · ${l.estimatedValue ? `$${Number(l.estimatedValue).toLocaleString()}` : "no value"}`,
        warn: l.stage === "incoming",
      }));
      case "memory": return liveData.memories.filter(m => m.priority === "critical" || m.priority === "high").slice(0,5).map(m => ({
        label: m.title, meta: `${m.category} · ${m.priority}`, warn: m.priority === "critical",
      }));
      case "radar": return liveData.opportunities.slice(0,5).map(o => ({
        label: o.title, meta: `${o.status} · ${o.priority}${o.estimatedValue ? ` · ${o.estimatedValue}` : ""}`,
        warn: o.priority === "critical" && o.status !== "pursuing",
      }));
      default: return [];
    }
  }

  const feed = liveFeed();
  const mets = metrics();

  return (
    <motion.div
      key={building.id}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="flex flex-col gap-5 overflow-y-auto"
    >
      {/* Header */}
      <div
        className="rounded-2xl overflow-hidden flex-shrink-0"
        style={{
          background: `linear-gradient(135deg, rgba(${building.glowRgb},0.12), rgba(${building.glowRgb},0.03) 60%, transparent)`,
          border: `1px solid rgba(${building.glowRgb},0.22)`,
          boxShadow: `0 0 40px rgba(${building.glowRgb},0.06)`,
        }}
      >
        <div className={`h-0.5 w-full`} style={{ background: `linear-gradient(90deg, transparent, rgba(${building.glowRgb},1), transparent)` }} />
        <div className="p-5">
          <div className="flex items-start gap-4 flex-wrap">
            <button
              onClick={onBack}
              className="flex items-center gap-1.5 text-[9px] font-mono text-white/40 hover:text-white/80 transition-colors border border-white/10 rounded-lg px-2.5 py-1.5 hover:bg-white/5 flex-shrink-0"
            >
              <ChevronLeft className="h-3 w-3" /> NXS CITY
            </button>
            <div className="flex-1 flex items-center gap-3 min-w-0">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{
                  background: `rgba(${building.glowRgb},0.12)`,
                  border: `1.5px solid rgba(${building.glowRgb},0.3)`,
                  boxShadow: `0 0 16px rgba(${building.glowRgb},0.25)`,
                }}
              >
                <Icon className="h-5 w-5" style={{ color: building.accentHex }} />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white tracking-tight">{building.name}</h1>
                <p className="text-xs text-white/40">{building.subtitle}</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-mono flex-shrink-0"
              style={{ borderColor: `rgba(${building.glowRgb},0.3)`, background: `rgba(${building.glowRgb},0.08)`, color: building.accentHex }}>
              <div className={`w-1.5 h-1.5 rounded-full ${statusDotClass(building.status)}`} />
              {statusLabel(building.status)}
            </div>
          </div>
          <p className="text-xs text-white/45 mt-4 leading-relaxed max-w-3xl">{building.description}</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {building.purpose.split(", ").map(p => (
              <span key={p} className="text-[8px] font-mono uppercase tracking-wider px-2 py-0.5 rounded border border-white/10 text-white/25">{p}</span>
            ))}
          </div>
        </div>
      </div>

      {/* Agent Roster */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Users className="h-3.5 w-3.5 text-white/30" />
          <h2 className="text-[9px] font-bold uppercase tracking-widest text-white/30">Agent Roster</h2>
          <div className="flex-1 h-px bg-white/8 ml-1" />
          <span className="text-[8px] font-mono text-white/20">{building.agents.length} ASSIGNED</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {building.agents.map(a => <AgentCard key={a.id} agent={a} />)}
        </div>
      </div>

      {/* Metrics + Missions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div>
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 className="h-3.5 w-3.5 text-white/30" />
            <h2 className="text-[9px] font-bold uppercase tracking-widest text-white/30">Live Metrics</h2>
            <div className="flex-1 h-px bg-white/8 ml-1" />
          </div>
          <div className="space-y-2">
            {mets.map((m, i) => (
              <div key={i} className={`flex items-center justify-between p-3 rounded-lg border ${m.warn ? "border-yellow-400/20 bg-yellow-400/5" : "border-white/8 bg-white/3"}`}>
                <div className="min-w-0">
                  <div className="text-[9px] font-mono uppercase tracking-wider text-white/30">{m.label}</div>
                  {m.note && <div className="text-[9px] text-white/20 mt-0.5">{m.note}</div>}
                </div>
                <div className={`text-sm font-bold ml-3 flex-shrink-0 ${m.warn ? "text-yellow-400" : "text-white"}`}>
                  {m.warn && <AlertTriangle className="h-3 w-3 inline mr-1 mb-0.5" />}{m.value}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Target className="h-3.5 w-3.5 text-white/30" />
            <h2 className="text-[9px] font-bold uppercase tracking-widest text-white/30">Active Missions</h2>
            <div className="flex-1 h-px bg-white/8 ml-1" />
          </div>
          <div className="space-y-2">
            {building.missions.map((m, i) => (
              <div key={i} className="flex gap-2.5 p-3 rounded-lg border border-white/8 bg-white/3">
                <div className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold flex-shrink-0 mt-0.5"
                  style={{ background: `rgba(${building.glowRgb},0.15)`, color: building.accentHex, border: `1px solid rgba(${building.glowRgb},0.3)` }}>
                  {i + 1}
                </div>
                <p className="text-xs text-white/60 leading-relaxed">{m}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Live data feed */}
      {feed.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Activity className="h-3.5 w-3.5 text-white/30" />
            <h2 className="text-[9px] font-bold uppercase tracking-widest text-white/30">
              {building.id === "sales" ? "Lead Pipeline" : building.id === "memory" ? "High-Priority Memories" : "Opportunity Pipeline"}
            </h2>
            <div className="flex-1 h-px bg-white/8 ml-1" />
          </div>
          <div className="space-y-1.5">
            {feed.map((item, i) => (
              <div key={i} className={`flex items-start gap-3 p-2.5 rounded-lg border ${item.warn ? "border-yellow-400/20 bg-yellow-400/5" : "border-white/8 bg-white/3"}`}>
                <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${item.warn ? "bg-yellow-400 animate-pulse" : "bg-white/20"}`} />
                <div className="flex-1 min-w-0">
                  <div className={`text-xs font-medium ${item.warn ? "text-yellow-400/90" : "text-white/70"}`}>{item.label}</div>
                  {item.meta && <div className="text-[9px] font-mono text-white/30 mt-0.5">{item.meta}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Risks + Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div>
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="h-3.5 w-3.5 text-red-400/50" />
            <h2 className="text-[9px] font-bold uppercase tracking-widest text-white/30">Risks & Alerts</h2>
            <div className="flex-1 h-px bg-white/8 ml-1" />
          </div>
          <div className="space-y-2">
            {building.risks.map((r, i) => (
              <div key={i} className="flex gap-2.5 p-3 rounded-lg border border-red-500/15 bg-red-500/5">
                <AlertCircle className="h-3.5 w-3.5 text-red-400/60 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-white/55 leading-relaxed">{r}</p>
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="flex items-center gap-2 mb-3">
            <ArrowRight className="h-3.5 w-3.5 text-primary/50" />
            <h2 className="text-[9px] font-bold uppercase tracking-widest text-white/30">Recommended Actions</h2>
            <div className="flex-1 h-px bg-white/8 ml-1" />
          </div>
          <div className="space-y-2">
            {building.actions.map((a, i) => (
              <div key={i} className="flex gap-2.5 p-3 rounded-lg border border-primary/12 bg-primary/5">
                <CheckCircle2 className="h-3.5 w-3.5 text-primary/50 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-white/65 leading-relaxed">{a}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Links */}
      {building.links.length > 0 && (
        <div className="flex flex-wrap gap-2 pb-2">
          {building.links.map(l => (
            <Link key={l.href} href={l.href}>
              <Button size="sm" variant="outline" className="text-xs gap-1.5 border-white/15 text-white/50 hover:text-white hover:border-white/30">
                <ExternalLink className="h-3 w-3" />{l.label}
              </Button>
            </Link>
          ))}
          <Button size="sm" variant="ghost" onClick={onBack} className="text-xs gap-1.5 text-white/30 hover:text-white/70 ml-auto">
            <ChevronLeft className="h-3 w-3" /> Back to NXS City
          </Button>
        </div>
      )}
    </motion.div>
  );
}

// ─── City Header ──────────────────────────────────────────────────────────────

function CityHeader() {
  const online    = BUILDINGS.filter(b => b.status === "online").length;
  const attention = BUILDINGS.filter(b => b.status === "attention").length;
  const standby   = BUILDINGS.filter(b => b.status === "standby").length;
  return (
    <div className="flex items-center justify-between flex-shrink-0 pb-3">
      <div className="flex items-center gap-3">
        <Map className="h-4 w-4 text-primary/70" />
        <h1 className="text-sm font-bold tracking-[0.18em] uppercase text-white/60">NXS City</h1>
        <span className="text-[8px] font-mono text-white/20 border border-white/8 px-2 py-0.5 rounded">ISOMETRIC COMMAND CAMPUS</span>
      </div>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-green-400" /><span className="text-[8px] font-mono text-white/30">{online} ONLINE</span></div>
        <div className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" /><span className="text-[8px] font-mono text-white/30">{attention} ATTENTION</span></div>
        <div className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-slate-500" /><span className="text-[8px] font-mono text-white/30">{standby} STANDBY</span></div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function NXSCity() {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: memStatus } = useGetMemoryAgentStatus();
  const { data: oppsRaw }   = useListOpportunities({});
  const { data: leadsRaw }  = useListLeads({});
  const { data: mems }      = useListMemoryEntries({});

  const opps   = oppsRaw  ?? [];
  const leads  = leadsRaw ?? [];
  const memories = mems   ?? [];

  const liveData = {
    memCount: memStatus?.totalMemories ?? memories.length,
    memories: memories.map(m => ({ title: m.title, category: m.category, priority: m.priority, status: m.status })),
    opportunities: opps.map(o => ({ title: o.title, status: o.status, priority: o.priority, estimatedValue: o.estimatedValue })),
    leads: leads.map(l => ({
      name: l.name, company: l.company, stage: l.stage,
      estimatedValue: l.estimatedValue != null ? String(l.estimatedValue) : null,
    })),
  };

  const selected = BUILDINGS.find(b => b.id === selectedId) ?? null;

  return (
    <div className="flex flex-col h-full gap-0">
      <AnimatePresence mode="wait">
        {selected ? (
          <motion.div
            key="interior"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col h-full overflow-y-auto gap-5"
          >
            <BuildingInterior building={selected} onBack={() => setSelectedId(null)} liveData={liveData} />
          </motion.div>
        ) : (
          <motion.div
            key="city"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col h-full"
          >
            <CityHeader />
            <div className="flex-1 rounded-2xl border border-white/5 overflow-auto bg-[#06090f]" style={{ minHeight: 480 }}>
              <CityCanvas onSelect={setSelectedId} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
