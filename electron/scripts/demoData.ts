// Static demo dataset for the seed-demo script. Pure data — no DB calls,
// no electron imports. Imported by seedDemo.ts which does the actual work.
//
// Every demo proposal carries an iCore_project_id starting with DEMO_ICORE_PREFIX
// so the seeder can identify (and skip on re-run) entries it owns.

export const DEMO_ICORE_PREFIX = 'DEMO-';

export type ResourceStatus = 'Not Started' | 'In-process' | 'Completed' | 'On-hold';
export type LostReason = 'price' | 'scope_mismatch' | 'timing' | 'competitor' | 'no_decision';
export type TargetStatus = 'draft' | 'sent' | 'won' | 'lost';
export type ProjectType = 'FF' | 'T&M' | 'NTE';

export interface ResourceTemplate {
  /** Employee category to look up (e.g. "Engineer IV"). The seeder picks
   *  a real employee whose category matches; falls back to round-robin if none. */
  category: string;
  hours: number;
  status: ResourceStatus;
  /** Days from "today" the work was/will-be scheduled to start.
   *  Negative = past, positive = future, null = unscheduled. */
  scheduledOffsetDays: number | null;
  comments?: string | null;
}

export interface TaskTemplate {
  name: string;
  /** Primary category for the task header (informational; resources drive amounts). */
  category: string;
  resources: ResourceTemplate[];
}

export interface PhaseTemplate {
  name: string;
  scope: string;
  /** Rate table to look up bill rates from (e.g. "Consulting", "Structural"). */
  rateTable: string;
  projectType: ProjectType;
  /** Phase due date as days from "today" (positive = future). */
  dueOffsetDays: number;
  targetBudget: number;
  tasks: TaskTemplate[];
}

export interface WonProjectSpec {
  /** Required header fields for project.initialize. */
  legalEntity: string;
  department: string;
  /** Default rate table for the project header (phases can override). */
  rateTable: string;
  projectType: ProjectType;
  phases: PhaseTemplate[];
}

export interface SectionDef {
  title: string;
  scope: string;
  fee: number;
}

export interface DemoProposal {
  /** Unique proposal name. */
  name: string;
  client: string;
  contact: string;
  clientAddress: string;
  clientCityStateZip: string;
  projectAddress: string;
  projectCityStateZip: string;
  /** Renderer-side rateTable enum value: 'consulting' | 'structural'. */
  rateTable: 'consulting' | 'structural';
  /** Days ago the proposal was created (used for proposal_date). */
  proposalAgeDays: number;
  sections: SectionDef[];
  targetStatus: TargetStatus;
  /** For sent/won/lost — days ago the proposal was marked sent. */
  sentAgeDays?: number;
  /** For lost — required reason. */
  lostReason?: LostReason;
  lostNotes?: string;
  /** For won — required project payload. */
  won?: WonProjectSpec;
}

// ── helpers used to keep the dataset readable ──────────────────────────────

const TX_CITY = 'Dallas, TX 75201';

// ── proposals ─────────────────────────────────────────────────────────────

export const DEMO_PROPOSALS: DemoProposal[] = [
  // ───────────────── DRAFT (5) ─────────────────
  {
    name: 'Riverside Pavilion Restoration',
    client: 'City of Riverside',
    contact: 'Margot Whitfield, Parks Director',
    clientAddress: '420 Civic Center Dr',
    clientCityStateZip: 'Riverside, TX 75081',
    projectAddress: 'Riverside Park, 880 River Walk',
    projectCityStateZip: 'Riverside, TX 75081',
    rateTable: 'structural',
    proposalAgeDays: 3,
    targetStatus: 'draft',
    sections: [
      { title: 'Site Assessment', scope: 'Field walk, document existing pavilion structure, identify deteriorated elements and load-path concerns. Photo log + summary memo.', fee: 4500 },
      { title: 'Structural Repair Recommendations', scope: 'Develop a prioritized repair scope with sketches for column reinforcement, roof deck patching, and connection upgrades. Suitable for bidding.', fee: 8200 },
    ],
  },
  {
    name: 'Downtown Mixed-Use Tower – Schematic',
    client: 'Apex Real Estate Partners',
    contact: 'David Kang, Development Manager',
    clientAddress: '2100 McKinney Ave, Suite 1100',
    clientCityStateZip: TX_CITY,
    projectAddress: 'NE corner of Elm & Ross',
    projectCityStateZip: TX_CITY,
    rateTable: 'structural',
    proposalAgeDays: 6,
    targetStatus: 'draft',
    sections: [
      { title: 'Schematic Structural Engineering', scope: 'Lateral system study (steel braced frame vs. concrete shear wall), gravity framing layout for 12-story tower over 2-level podium.', fee: 28000 },
      { title: 'Code & Wind/Seismic Review', scope: 'IBC 2021 compliance review, wind tunnel coordination, seismic design category determination.', fee: 6500 },
    ],
  },
  {
    name: 'Hillside Custom Residence',
    client: 'Marcus & Elena Vasquez',
    contact: 'Elena Vasquez',
    clientAddress: '1240 Cedar Ridge Ln',
    clientCityStateZip: 'Austin, TX 78746',
    projectAddress: '1240 Cedar Ridge Ln',
    projectCityStateZip: 'Austin, TX 78746',
    rateTable: 'structural',
    proposalAgeDays: 9,
    targetStatus: 'draft',
    sections: [
      { title: 'Foundation Design', scope: 'Drilled-pier foundation on sloped lot, retaining walls along uphill side, coordination with geotech report.', fee: 12500 },
      { title: 'Framing & Lateral', scope: 'Wood-framed superstructure with steel moment frames at view-side openings, lateral analysis per IRC.', fee: 9800 },
    ],
  },
  {
    name: 'Eastside Warehouse Conversion',
    client: 'Cornerstone Industrial LLC',
    contact: 'Patrick Holloway',
    clientAddress: '3300 Commerce St',
    clientCityStateZip: TX_CITY,
    projectAddress: '4150 Industrial Blvd',
    projectCityStateZip: TX_CITY,
    rateTable: 'structural',
    proposalAgeDays: 12,
    targetStatus: 'draft',
    sections: [
      { title: 'As-Built Survey', scope: 'Field measure existing tilt-wall warehouse, document existing roof framing, locate utilities and openings.', fee: 6500 },
      { title: 'Structural Modifications', scope: 'Design new mezzanine, infill openings, and stair/elevator opening reinforcement for adaptive reuse to office space.', fee: 18500 },
    ],
  },
  {
    name: 'Oak Park Community Center',
    client: 'Oak Park Recreation District',
    contact: 'Tasha Reed, District Administrator',
    clientAddress: '500 Oak Park Way',
    clientCityStateZip: 'Plano, TX 75023',
    projectAddress: '500 Oak Park Way',
    projectCityStateZip: 'Plano, TX 75023',
    rateTable: 'consulting',
    proposalAgeDays: 14,
    targetStatus: 'draft',
    sections: [
      { title: 'Site Layout Consulting', scope: 'Programming workshop, site test-fits for 18,000-SF community center with parking and outdoor pavilion.', fee: 9500 },
      { title: 'Code Compliance Review', scope: 'Occupancy classification, accessibility (TAS) review, life-safety strategy outline for early budgeting.', fee: 5500 },
    ],
  },

  // ───────────────── SENT (3) ─────────────────
  {
    name: 'Heritage School Seismic Retrofit',
    client: 'Heritage School District',
    contact: 'Dr. Lillian Marsh, Facilities Director',
    clientAddress: '1100 District Office Pkwy',
    clientCityStateZip: 'Garland, TX 75040',
    projectAddress: 'Heritage Middle School, 815 Old Mill Rd',
    projectCityStateZip: 'Garland, TX 75040',
    rateTable: 'structural',
    proposalAgeDays: 28,
    sentAgeDays: 24,
    targetStatus: 'sent',
    sections: [
      { title: 'Seismic Evaluation (ASCE 41)', scope: 'Tier 1 + Tier 2 evaluation of 1962 unreinforced-masonry building, materials testing coordination, vulnerability matrix.', fee: 14500 },
      { title: 'Retrofit Design', scope: 'Shotcrete shear wall design, diaphragm strengthening, anchor and tie additions; CDs for permit and bid.', fee: 32000 },
    ],
  },
  {
    name: 'Lakeshore Office Park – Phase II',
    client: 'Lakeshore Development Group',
    contact: 'Hannah Pope, Project Executive',
    clientAddress: '7700 Stemmons Fwy, Suite 200',
    clientCityStateZip: TX_CITY,
    projectAddress: '4200 Lakeshore Dr (Building B)',
    projectCityStateZip: 'Irving, TX 75063',
    rateTable: 'structural',
    proposalAgeDays: 8,
    sentAgeDays: 6,
    targetStatus: 'sent',
    sections: [
      { title: 'Foundation Design', scope: 'Mat foundation on improved soils, coordination with geotech recommendations, slab-on-grade design.', fee: 22000 },
      { title: 'Steel Framing Package', scope: '4-story steel-framed Class-A office building: gravity framing, braced-frame lateral, connection design.', fee: 28500 },
    ],
  },
  {
    name: 'St. James Church Bell Tower',
    client: 'St. James Episcopal Parish',
    contact: 'Father Andrew Whitcombe',
    clientAddress: '900 Cathedral Way',
    clientCityStateZip: 'Fort Worth, TX 76104',
    projectAddress: '900 Cathedral Way',
    projectCityStateZip: 'Fort Worth, TX 76104',
    rateTable: 'structural',
    proposalAgeDays: 38,
    sentAgeDays: 31,
    targetStatus: 'sent',
    sections: [
      { title: 'Bell Tower Condition Assessment', scope: 'Up-close inspection (rope-access), masonry condition mapping, joint and anchorage assessment.', fee: 8500 },
      { title: 'Restoration Plan', scope: 'Repair drawings, masonry repointing scope, lightning-protection coordination, historic-preservation compliance.', fee: 14000 },
    ],
  },

  // ───────────────── WON (4) ─────────────────
  {
    name: 'Civic Plaza Façade Repair',
    client: 'Metropolis Civic Authority',
    contact: 'Reggie Tomlin, Capital Projects',
    clientAddress: '1 Civic Center Plaza',
    clientCityStateZip: TX_CITY,
    projectAddress: 'Civic Plaza, 600 Main St',
    projectCityStateZip: TX_CITY,
    rateTable: 'structural',
    proposalAgeDays: 21,
    sentAgeDays: 18,
    targetStatus: 'won',
    sections: [
      { title: 'Investigation', scope: 'Façade inspection (drone + rope-access), document precast panel cracking and anchor corrosion.', fee: 10000 },
      { title: 'Repair Drawings', scope: 'CDs for panel re-anchoring, joint replacement, and patch repairs. Permit-ready package.', fee: 18000 },
    ],
    won: {
      legalEntity: 'CES',
      department: 'Structural',
      rateTable: 'Structural',
      projectType: 'FF',
      phases: [
        {
          name: 'Investigation',
          scope: 'Field inspection of all four elevations, document defects, prepare findings memo with prioritized repair scope.',
          rateTable: 'Structural',
          projectType: 'FF',
          dueOffsetDays: 21,
          targetBudget: 10000,
          tasks: [
            {
              name: 'Site Reconnaissance',
              category: 'Engineer V',
              resources: [
                { category: 'Engineer V', hours: 16, status: 'Not Started', scheduledOffsetDays: 5, comments: null },
                { category: 'Engineer IV', hours: 24, status: 'Not Started', scheduledOffsetDays: 5, comments: 'Drone pilot lead' },
              ],
            },
            {
              name: 'Defect Mapping & Memo',
              category: 'Engineer IV',
              resources: [
                { category: 'Engineer IV', hours: 20, status: 'Not Started', scheduledOffsetDays: 12, comments: null },
              ],
            },
          ],
        },
        {
          name: 'Repair Drawings',
          scope: 'Construction documents for façade repair: re-anchoring details, joint sealant replacement, patch repair specifications.',
          rateTable: 'Structural',
          projectType: 'FF',
          dueOffsetDays: 56,
          targetBudget: 18000,
          tasks: [
            {
              name: 'Detail Design',
              category: 'Engineer IV',
              resources: [
                { category: 'Engineer IV', hours: 40, status: 'Not Started', scheduledOffsetDays: 19, comments: null },
              ],
            },
            {
              name: 'Drawing Production',
              category: 'CAD Tech IV',
              resources: [
                { category: 'CAD Tech IV', hours: 50, status: 'Not Started', scheduledOffsetDays: 26, comments: null },
              ],
            },
            {
              name: 'QC Review',
              category: 'Engineer V',
              resources: [
                { category: 'Engineer V', hours: 8, status: 'Not Started', scheduledOffsetDays: 49, comments: 'Pre-issue QC' },
              ],
            },
          ],
        },
      ],
    },
  },
  {
    name: 'Maple Crest Subdivision – 12 Lots',
    client: 'Crestwood Builders',
    contact: 'Anita Beauchamp',
    clientAddress: '5500 Preston Rd',
    clientCityStateZip: 'Frisco, TX 75034',
    projectAddress: 'Maple Crest, blocks A & B',
    projectCityStateZip: 'McKinney, TX 75070',
    rateTable: 'consulting',
    proposalAgeDays: 75,
    sentAgeDays: 70,
    targetStatus: 'won',
    sections: [
      { title: 'Geotechnical & Site', scope: 'Coordinate geotech, evaluate site soils for 12 SF residential lots, drainage planning.', fee: 18000 },
      { title: 'Foundation Plans', scope: 'Per-lot post-tensioned slab designs, three plan types varied across the 12 lots.', fee: 35000 },
      { title: 'Final Drawings & QC', scope: 'Coordinate with builder on final plan revisions, QC review, issue stamped sealed plans.', fee: 32000 },
    ],
    won: {
      legalEntity: 'CES',
      department: 'Consulting',
      rateTable: 'Consulting',
      projectType: 'T&M',
      phases: [
        {
          name: 'Geotechnical & Site',
          scope: 'Site inspection, geotech report review, drainage and soil-bearing evaluation for the 12-lot subdivision.',
          rateTable: 'Consulting',
          projectType: 'T&M',
          dueOffsetDays: -45,
          targetBudget: 18000,
          tasks: [
            {
              name: 'Site Inspection',
              category: 'Inspector III',
              resources: [
                { category: 'Inspector III', hours: 32, status: 'Completed', scheduledOffsetDays: -62, comments: 'Two site visits' },
              ],
            },
            {
              name: 'Geotech Coordination',
              category: 'Engineer IV',
              resources: [
                { category: 'Engineer IV', hours: 40, status: 'Completed', scheduledOffsetDays: -55, comments: null },
              ],
            },
          ],
        },
        {
          name: 'Foundation Plans',
          scope: 'Three plan types of post-tensioned slabs distributed across the 12 lots; cable layouts and detailing.',
          rateTable: 'Consulting',
          projectType: 'T&M',
          dueOffsetDays: 14,
          targetBudget: 35000,
          tasks: [
            {
              name: 'Plan Type A Design',
              category: 'Engineer V',
              resources: [
                { category: 'Engineer V', hours: 32, status: 'Completed', scheduledOffsetDays: -40, comments: null },
                { category: 'Engineer IV', hours: 24, status: 'In-process', scheduledOffsetDays: -20, comments: 'Coordination with builder' },
              ],
            },
            {
              name: 'Plan Type B Design',
              category: 'Engineer IV',
              resources: [
                { category: 'Engineer IV', hours: 28, status: 'In-process', scheduledOffsetDays: -10, comments: null },
              ],
            },
            {
              name: 'CAD Production',
              category: 'CAD Tech IV',
              resources: [
                { category: 'CAD Tech IV', hours: 40, status: 'Completed', scheduledOffsetDays: -30, comments: null },
                { category: 'CAD Tech III', hours: 30, status: 'In-process', scheduledOffsetDays: -7, comments: null },
              ],
            },
          ],
        },
        {
          name: 'Final Drawings & QC',
          scope: 'Builder review cycle, plan revisions, in-house QC, final stamped issue.',
          rateTable: 'Consulting',
          projectType: 'T&M',
          dueOffsetDays: 35,
          targetBudget: 32000,
          tasks: [
            {
              name: 'Revision Cycles',
              category: 'Engineer V',
              resources: [
                { category: 'Engineer V', hours: 40, status: 'Not Started', scheduledOffsetDays: 14, comments: null },
              ],
            },
            {
              name: 'CAD Updates',
              category: 'CAD Tech IV',
              resources: [
                { category: 'CAD Tech IV', hours: 60, status: 'Not Started', scheduledOffsetDays: 21, comments: null },
              ],
            },
            {
              name: 'Final QC',
              category: 'Engineer V',
              resources: [
                { category: 'Engineer V', hours: 10, status: 'Not Started', scheduledOffsetDays: 30, comments: 'Pre-stamp QC' },
              ],
            },
          ],
        },
      ],
    },
  },
  {
    name: 'Greenbriar Apartment Complex',
    client: 'Greenbriar Holdings LLC',
    contact: 'Jefferson Mooney, Asset Manager',
    clientAddress: '12500 N Stemmons Fwy',
    clientCityStateZip: 'Farmers Branch, TX 75234',
    projectAddress: '8800 Greenbriar Pkwy',
    projectCityStateZip: 'Mesquite, TX 75150',
    rateTable: 'structural',
    proposalAgeDays: 120,
    sentAgeDays: 110,
    targetStatus: 'won',
    sections: [
      { title: 'Schematic Design', scope: '4-story wood-frame apartment with 96 units, podium-deck SOG, schematic structural layout.', fee: 28000 },
      { title: 'Design Development', scope: 'Lateral analysis, shear wall layouts, framing plans, foundation sizing development.', fee: 52000 },
      { title: 'Construction Documents', scope: 'Final stamped CDs: framing, foundation, lateral, details. Permit + bid set.', fee: 40000 },
    ],
    won: {
      legalEntity: 'CES',
      department: 'Structural',
      rateTable: 'Structural',
      projectType: 'FF',
      phases: [
        {
          name: 'Schematic Design',
          scope: 'Establish gravity and lateral systems, prepare schematic plans coordinated with architect and developer pro forma.',
          rateTable: 'Structural',
          projectType: 'FF',
          dueOffsetDays: -75,
          targetBudget: 28000,
          tasks: [
            {
              name: 'Gravity System Layout',
              category: 'Engineer V',
              resources: [
                { category: 'Engineer V', hours: 40, status: 'Completed', scheduledOffsetDays: -100, comments: null },
              ],
            },
            {
              name: 'Schematic Plans',
              category: 'CAD Tech IV',
              resources: [
                { category: 'CAD Tech IV', hours: 50, status: 'Completed', scheduledOffsetDays: -90, comments: null },
              ],
            },
          ],
        },
        {
          name: 'Design Development',
          scope: 'Finalize lateral system, develop shear wall layouts, foundation sizing, framing plans for DD set.',
          rateTable: 'Structural',
          projectType: 'FF',
          dueOffsetDays: -10,
          targetBudget: 52000,
          tasks: [
            {
              name: 'Lateral Analysis',
              category: 'Engineer V',
              resources: [
                { category: 'Engineer V', hours: 60, status: 'In-process', scheduledOffsetDays: -45, comments: null },
              ],
            },
            {
              name: 'Foundation & Framing',
              category: 'Engineer IV',
              resources: [
                { category: 'Engineer IV', hours: 50, status: 'In-process', scheduledOffsetDays: -35, comments: null },
              ],
            },
            {
              name: 'DD Drawings',
              category: 'CAD Tech IV',
              resources: [
                { category: 'CAD Tech IV', hours: 80, status: 'In-process', scheduledOffsetDays: -25, comments: null },
              ],
            },
          ],
        },
        {
          name: 'Construction Documents',
          scope: 'Final CDs: framing, foundation, lateral, connection details. Coordination with MEP.',
          rateTable: 'Structural',
          projectType: 'FF',
          dueOffsetDays: 60,
          targetBudget: 40000,
          tasks: [
            {
              name: 'CD Detailing',
              category: 'Engineer V',
              resources: [
                { category: 'Engineer V', hours: 50, status: 'On-hold', scheduledOffsetDays: 14, comments: 'Awaiting client review of DD set' },
              ],
            },
            {
              name: 'CD Drawings',
              category: 'CAD Tech IV',
              resources: [
                { category: 'CAD Tech IV', hours: 100, status: 'On-hold', scheduledOffsetDays: 21, comments: 'Awaiting CD detailing' },
              ],
            },
          ],
        },
      ],
    },
  },
  {
    name: 'Brookfield Industrial Expansion',
    client: 'Brookfield Manufacturing Co.',
    contact: 'Dale Crittenden, VP Operations',
    clientAddress: '9900 Brookfield Industrial Dr',
    clientCityStateZip: 'Arlington, TX 76011',
    projectAddress: '9900 Brookfield Industrial Dr',
    projectCityStateZip: 'Arlington, TX 76011',
    rateTable: 'consulting',
    proposalAgeDays: 95,
    sentAgeDays: 88,
    targetStatus: 'won',
    sections: [
      { title: 'Programming & Code Study', scope: 'Programming workshops with operations team, code analysis for new 80,000-SF expansion.', fee: 25000 },
      { title: 'Site Layout & Civil', scope: 'Site planning, parking expansion, drainage and utilities coordination with civil consultant.', fee: 65000 },
      { title: 'Building Structural', scope: 'PEMB primary structure, mezzanine for office, crane bay design and overhead support.', fee: 95000 },
      { title: 'MEP Coordination & QC', scope: 'MEP coordination meetings, BIM clash detection, final QC pass on all packages.', fee: 55000 },
    ],
    won: {
      legalEntity: 'CES',
      department: 'Consulting',
      rateTable: 'Consulting',
      projectType: 'NTE',
      phases: [
        {
          name: 'Programming & Code Study',
          scope: 'Programming workshops, code analysis, occupancy review for 80,000-SF manufacturing expansion.',
          rateTable: 'Consulting',
          projectType: 'NTE',
          dueOffsetDays: -60,
          targetBudget: 25000,
          tasks: [
            {
              name: 'Programming Workshops',
              category: 'Senior Consultant V',
              resources: [
                { category: 'Senior Consultant V', hours: 40, status: 'Completed', scheduledOffsetDays: -85, comments: 'Three half-day workshops' },
              ],
            },
            {
              name: 'Code Analysis',
              category: 'Engineer V',
              resources: [
                { category: 'Engineer V', hours: 30, status: 'Completed', scheduledOffsetDays: -75, comments: null },
              ],
            },
          ],
        },
        {
          name: 'Site Layout & Civil',
          scope: 'Site planning, parking, drainage, utility coordination with civil engineering subconsultant.',
          rateTable: 'Consulting',
          projectType: 'NTE',
          dueOffsetDays: -5,
          targetBudget: 65000,
          tasks: [
            {
              name: 'Site Planning',
              category: 'Engineer V',
              resources: [
                { category: 'Engineer V', hours: 80, status: 'In-process', scheduledOffsetDays: -50, comments: null },
              ],
            },
            {
              name: 'Civil Coordination',
              category: 'Engineer IV',
              resources: [
                { category: 'Engineer IV', hours: 60, status: 'In-process', scheduledOffsetDays: -40, comments: 'Subconsultant coordination' },
              ],
            },
            {
              name: 'Site Drawings',
              category: 'CAD Tech IV',
              resources: [
                { category: 'CAD Tech IV', hours: 60, status: 'Completed', scheduledOffsetDays: -30, comments: null },
              ],
            },
            {
              name: 'Phase QC',
              category: 'Engineer V',
              resources: [
                { category: 'Engineer V', hours: 12, status: 'Not Started', scheduledOffsetDays: -12, comments: null },
              ],
            },
          ],
        },
        {
          name: 'Building Structural',
          scope: 'PEMB primary structure, office mezzanine, crane bays — full structural design and CDs.',
          rateTable: 'Consulting',
          projectType: 'NTE',
          dueOffsetDays: 75,
          targetBudget: 95000,
          tasks: [
            {
              name: 'PEMB Design',
              category: 'Engineer V',
              resources: [
                { category: 'Engineer V', hours: 120, status: 'Not Started', scheduledOffsetDays: 7, comments: null },
              ],
            },
            {
              name: 'Mezzanine & Crane Bay',
              category: 'Engineer IV',
              resources: [
                { category: 'Engineer IV', hours: 80, status: 'Not Started', scheduledOffsetDays: 21, comments: null },
              ],
            },
            {
              name: 'Structural Drawings',
              category: 'CAD Tech IV',
              resources: [
                { category: 'CAD Tech IV', hours: 100, status: 'Not Started', scheduledOffsetDays: 35, comments: null },
              ],
            },
          ],
        },
        {
          name: 'MEP Coordination & QC',
          scope: 'MEP coordination meetings, BIM clash detection, final QC across all design packages.',
          rateTable: 'Consulting',
          projectType: 'NTE',
          dueOffsetDays: 105,
          targetBudget: 55000,
          tasks: [
            {
              name: 'MEP Coordination',
              category: 'Engineer V',
              resources: [
                { category: 'Engineer V', hours: 60, status: 'Not Started', scheduledOffsetDays: 70, comments: null },
              ],
            },
            {
              name: 'BIM Clash Detection',
              category: 'Engineer IV',
              resources: [
                { category: 'Engineer IV', hours: 40, status: 'Not Started', scheduledOffsetDays: 80, comments: null },
              ],
            },
            {
              name: 'Final QC',
              category: 'Engineer V',
              resources: [
                { category: 'Engineer V', hours: 16, status: 'Not Started', scheduledOffsetDays: 98, comments: 'Pre-issue QC pass' },
              ],
            },
          ],
        },
      ],
    },
  },

  // ───────────────── LOST (3) ─────────────────
  {
    name: 'Sunset Boulevard Hotel',
    client: 'Beverly Hospitality Group',
    contact: 'Renee LeClair',
    clientAddress: '8200 Wilshire Blvd, Suite 800',
    clientCityStateZip: 'Beverly Hills, CA 90211',
    projectAddress: '4400 Sunset Blvd',
    projectCityStateZip: 'Los Angeles, CA 90029',
    rateTable: 'structural',
    proposalAgeDays: 65,
    sentAgeDays: 60,
    targetStatus: 'lost',
    lostReason: 'price',
    lostNotes: 'Client selected a regional firm with a lower fixed-fee bid. Feedback was favorable on technical approach.',
    sections: [
      { title: 'Schematic & Design Development', scope: '8-story boutique hotel: schematic + DD structural design, lateral system selection.', fee: 48000 },
      { title: 'Construction Documents', scope: 'Final structural CDs, foundation, lateral details, coordination drawings.', fee: 47000 },
    ],
  },
  {
    name: 'Northgate Medical Office',
    client: 'Northgate Health Network',
    contact: 'Dr. Yusuf Patel, Facilities VP',
    clientAddress: '5050 Healthcare Way',
    clientCityStateZip: TX_CITY,
    projectAddress: '7700 Northgate Dr',
    projectCityStateZip: 'Plano, TX 75093',
    rateTable: 'structural',
    proposalAgeDays: 50,
    sentAgeDays: 42,
    targetStatus: 'lost',
    lostReason: 'competitor',
    lostNotes: 'Client has an existing relationship with another firm that handled their previous campus expansion.',
    sections: [
      { title: 'Structural Design', scope: '3-story medical office building, steel-framed, OSHPD-equivalent quality control.', fee: 42000 },
      { title: 'Construction Administration', scope: 'CA support: RFI responses, submittal review, site visits during construction.', fee: 23000 },
    ],
  },
  {
    name: 'Riverwalk Boutique Hotel',
    client: 'Riverside Hospitality LLC',
    contact: 'Megan O’Connell',
    clientAddress: '600 River Walk',
    clientCityStateZip: 'San Antonio, TX 78205',
    projectAddress: '600 River Walk (Lot 7)',
    projectCityStateZip: 'San Antonio, TX 78205',
    rateTable: 'consulting',
    proposalAgeDays: 80,
    sentAgeDays: 70,
    targetStatus: 'lost',
    lostReason: 'timing',
    lostNotes: 'Project paused indefinitely — site acquisition stalled at city zoning review.',
    sections: [
      { title: 'Site & Programming', scope: 'Site test-fits, programming workshops, conceptual structural strategy.', fee: 18000 },
      { title: 'Schematic Engineering', scope: 'Schematic structural design for 5-story boutique hotel on tight infill site.', fee: 24000 },
    ],
  },
];
