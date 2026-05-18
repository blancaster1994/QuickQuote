-- QuickQuote initial schema for Azure SQL Database.
-- Translation in progress — port from electron/db/schema.ts.
--
-- ─────────────────────────────────────────────────────────────────────────
-- Translation patterns (SQLite → T-SQL / Azure SQL)
-- ─────────────────────────────────────────────────────────────────────────
--
--   INTEGER PRIMARY KEY AUTOINCREMENT  →  INT IDENTITY(1,1) PRIMARY KEY
--   TEXT                               →  NVARCHAR(MAX)  (or NVARCHAR(N) when bounded)
--   TEXT NOT NULL DEFAULT ''           →  NVARCHAR(MAX) NOT NULL CONSTRAINT df_x DEFAULT N''
--   datetime('now')                    →  SYSUTCDATETIME()
--   REFERENCES x(y) ON DELETE CASCADE  →  same (Azure SQL supports cascade)
--   UNIQUE(a, b)                       →  CONSTRAINT uq_x UNIQUE (a, b)
--   CREATE INDEX                       →  same
--   PRAGMA foreign_keys = ON           →  not needed (always on)
--   payload_json TEXT                  →  payload_json NVARCHAR(MAX)
--                                         (Azure SQL has JSON_VALUE / OPENJSON
--                                          for querying. Native JSON type
--                                          arrived in Azure SQL DB 2024 —
--                                          consider when implementing.)
--
-- ─────────────────────────────────────────────────────────────────────────
-- Strategy
-- ─────────────────────────────────────────────────────────────────────────
--
-- Tables 1-4 below are fully translated as EXEMPLARS. Use them as the
-- pattern for the remaining tables, listed as TODO at the bottom.
-- Source line numbers refer to electron/db/schema.ts.
--
-- Run order recommendation: parent tables before children. The TODO list
-- is ordered accordingly.

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

-- ─────────────────────────────────────────────────────────────────────────
-- 1. proposal   (source: electron/db/schema.ts:17-46)
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE proposal (
  id                       INT IDENTITY(1,1) PRIMARY KEY,
  name                     NVARCHAR(255) NOT NULL UNIQUE,
  status                   NVARCHAR(32)  NOT NULL CONSTRAINT df_proposal_status DEFAULT N'draft',
  rate_table               NVARCHAR(64)  NOT NULL CONSTRAINT df_proposal_rate_table DEFAULT N'consulting',
  owner_email              NVARCHAR(255),
  owner_name               NVARCHAR(255),
  created_by_email         NVARCHAR(255),
  created_by_name          NVARCHAR(255),
  last_modified_by_email   NVARCHAR(255),
  last_modified_by_name    NVARCHAR(255),
  last_modified_at         NVARCHAR(64),
  sent_date                NVARCHAR(64),
  won_date                 NVARCHAR(64),
  lost_date                NVARCHAR(64),
  lost_reason              NVARCHAR(64),
  lost_notes               NVARCHAR(MAX),
  follow_up_at             NVARCHAR(64),
  icore_project_id         NVARCHAR(64),
  client_name              NVARCHAR(255),
  client_contact           NVARCHAR(255),
  client_address           NVARCHAR(MAX),
  client_city_state_zip    NVARCHAR(255),
  project_address          NVARCHAR(MAX),
  project_city_state_zip   NVARCHAR(255),
  proposal_date            NVARCHAR(64),
  created_at               DATETIME2(3)  NOT NULL CONSTRAINT df_proposal_created_at DEFAULT SYSUTCDATETIME(),
  updated_at               DATETIME2(3)  NOT NULL CONSTRAINT df_proposal_updated_at DEFAULT SYSUTCDATETIME(),
  current_version_id       INT
);
GO

-- ─────────────────────────────────────────────────────────────────────────
-- 2. proposal_version   (source: electron/db/schema.ts:51-63)
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE proposal_version (
  id                      INT IDENTITY(1,1) PRIMARY KEY,
  proposal_id             INT NOT NULL,
  version_label           NVARCHAR(64)  NOT NULL,
  status                  NVARCHAR(32)  NOT NULL CONSTRAINT df_pv_status DEFAULT N'draft',
  status_at_snapshot      NVARCHAR(32),
  notes                   NVARCHAR(MAX),
  payload_json            NVARCHAR(MAX) NOT NULL,
  payload_schema_version  INT NOT NULL CONSTRAINT df_pv_schema_v DEFAULT 3,
  created_by_email        NVARCHAR(255),
  created_by_name         NVARCHAR(255),
  created_at              DATETIME2(3)  NOT NULL CONSTRAINT df_pv_created_at DEFAULT SYSUTCDATETIME(),
  CONSTRAINT fk_pv_proposal FOREIGN KEY (proposal_id) REFERENCES proposal(id) ON DELETE CASCADE
);
GO

-- ─────────────────────────────────────────────────────────────────────────
-- 3. proposal_activity   (source: electron/db/schema.ts:66-77)
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE proposal_activity (
  id           INT IDENTITY(1,1) PRIMARY KEY,
  proposal_id  INT NOT NULL,
  timestamp    DATETIME2(3) NOT NULL CONSTRAINT df_pa_timestamp DEFAULT SYSUTCDATETIME(),
  user_email   NVARCHAR(255),
  user_name    NVARCHAR(255),
  action       NVARCHAR(64) NOT NULL,
  from_status  NVARCHAR(32),
  to_status    NVARCHAR(32),
  note         NVARCHAR(MAX),
  meta_json    NVARCHAR(MAX),
  CONSTRAINT fk_pa_proposal FOREIGN KEY (proposal_id) REFERENCES proposal(id) ON DELETE CASCADE
);
GO

-- ─────────────────────────────────────────────────────────────────────────
-- 4. proposal_file   (source: electron/db/schema.ts:81-91)
-- ─────────────────────────────────────────────────────────────────────────
--
-- WEB PORT NOTE: the `path` column today stores an absolute Windows path
-- (app.getPath('userData') + 'Generated Proposals'). On Azure this becomes
-- a blob name within the BLOB_CONTAINER_URL container. Rename to `blob_name`
-- if that helps the next-session diff, or keep `path` for porting parity
-- and document the semantic change separately. Drop the ON DELETE SET NULL
-- for version_id since blob garbage collection happens out-of-band.
CREATE TABLE proposal_file (
  id                  INT IDENTITY(1,1) PRIMARY KEY,
  proposal_id         INT NOT NULL,
  version_id          INT,
  format              NVARCHAR(16) NOT NULL,
  filename            NVARCHAR(512) NOT NULL,
  path                NVARCHAR(MAX) NOT NULL,     -- blob name on web
  content_hash        NVARCHAR(64) NOT NULL,
  generated_at        DATETIME2(3) NOT NULL CONSTRAINT df_pf_generated_at DEFAULT SYSUTCDATETIME(),
  generated_by_email  NVARCHAR(255),
  CONSTRAINT fk_pf_proposal FOREIGN KEY (proposal_id) REFERENCES proposal(id) ON DELETE CASCADE,
  CONSTRAINT fk_pf_version  FOREIGN KEY (version_id)  REFERENCES proposal_version(id)
);
GO

-- ─────────────────────────────────────────────────────────────────────────
-- Indexes for the exemplar tables   (source: electron/db/schema.ts:175-186)
-- ─────────────────────────────────────────────────────────────────────────
CREATE INDEX idx_proposal_status     ON proposal(status);
CREATE INDEX idx_proposal_owner      ON proposal(owner_email);
CREATE INDEX idx_proposal_updated    ON proposal(updated_at);
CREATE INDEX idx_proposal_followup   ON proposal(follow_up_at);
CREATE INDEX idx_version_proposal    ON proposal_version(proposal_id);
CREATE INDEX idx_activity_proposal   ON proposal_activity(proposal_id);
CREATE INDEX idx_activity_ts         ON proposal_activity(timestamp);
CREATE INDEX idx_file_hash           ON proposal_file(format, content_hash);
GO

-- ─────────────────────────────────────────────────────────────────────────
-- TODO: port the remaining ~26 tables from electron/db/schema.ts
-- ─────────────────────────────────────────────────────────────────────────
--
-- Template / personnel:
--   - client_template          (schema.ts:94)
--   - project_template         (schema.ts:109)
--   - fee_template             (schema.ts:120)
--   - employee                 (schema.ts:131)
--   - category_mapping         (schema.ts:138)
--   - rate_entry               (schema.ts:144)
--   - expense_line             (schema.ts:153)
--   - allowed_user             (schema.ts:163)    [KEY for auth → role lookup]
--
-- Lookups (v2 schema, added in later migrations):
--   - legal_entity             (schema.ts:202)
--   - department               (schema.ts:207)
--   - rate_table               (schema.ts:212)
--   - project_type             (schema.ts:217)
--   - markup_pct               (schema.ts:222)
--   - expense_category         (schema.ts:227)
--   - phase_def                (schema.ts:234)
--   - task_def                 (schema.ts:242)
--   - template_phase           (schema.ts:253)   [LEGACY — superseded by bid_item_template_*]
--
-- Bid item templates (v3 schema):
--   - bid_item_template_phase  (schema.ts:461)
--   - bid_item_template_task   (schema.ts:471)
--
-- Project mode (Stage 4):
--   - project                  (schema.ts:269)
--   - clickup_config           (schema.ts:302)   [REVISIT for Web: token → Key Vault]
--   - project_clickup_link     (schema.ts:312)
--   - project_clickup_phase_link (schema.ts:325)
--
-- Bookkeeping:
--   - schema_meta              (schema.ts:553)   [skip if using a real migration tool]
GO
