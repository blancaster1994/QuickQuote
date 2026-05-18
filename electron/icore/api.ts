// Thin typed wrapper over Dynamics 365 F&O's OData API.
//
// Only the sync orchestrator (sync.ts) consumes this; the renderer never
// reaches into here directly. Auth is delegated — the constructor takes a
// `getToken` callback so this module stays unaware of MSAL specifics and
// can be unit-tested with a stub token.
//
// Error normalization: every non-2xx returns `IcoreApiError` carrying the
// HTTP status, the OData error code (when present), and the request path
// so log lines and UI alerts can show something useful.
//
// Throttling: F&O OData has a per-user concurrency limit; in practice the
// flows we drive (one customer-list pull, one project create + N phase
// creates) stay well under it. If we hit 429 we honor `Retry-After`
// header and retry once.

export class IcoreApiError extends Error {
  status: number;
  code: string | null;
  path: string;
  body: string;
  constructor(message: string, status: number, code: string | null, path: string, body: string) {
    super(message);
    this.status = status;
    this.code = code;
    this.path = path;
    this.body = body;
  }
}

export interface ODataPage<T> {
  value: T[];
  '@odata.nextLink'?: string;
}

export interface F_OCustomer {
  CustomerAccount: string;
  dataAreaId?: string | null;
  OrganizationName?: string | null;
  Name?: string | null;                  // some entities use Name instead of OrganizationName
  PrimaryContactEmail?: string | null;
  Email?: string | null;
  PrimaryContactName?: string | null;
  AddressLine1?: string | null;
  AddressCity?: string | null;
  AddressState?: string | null;
  AddressZipCode?: string | null;
  Blocked?: string | null;               // 'No' | 'All' | 'Invoice' | 'PaymJournal'
}

export interface F_OCompany {
  DataArea: string;
  Name: string;
}

export class IcoreApi {
  private envUrl: string;

  constructor(envUrl: string, private getToken: () => Promise<string>) {
    this.envUrl = envUrl.replace(/\/+$/, '');
  }

  // ── core fetch ──────────────────────────────────────────────────────────

  private async req<T = any>(method: string, path: string, body?: any): Promise<T> {
    const url = path.startsWith('http')
      ? path
      : `${this.envUrl}${path.startsWith('/') ? '' : '/'}${path}`;

    const doFetch = async (token: string): Promise<Response> => fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json;odata.metadata=minimal',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    let token = await this.getToken();
    let res = await doFetch(token);

    if (res.status === 429) {
      const retryAfter = Number(res.headers.get('retry-after') || '2');
      await new Promise((r) => setTimeout(r, Math.min(retryAfter * 1000, 15000)));
      res = await doFetch(token);
    }

    if (!res.ok) {
      const text = await res.text();
      let message = `${method} ${path} → HTTP ${res.status}`;
      let code: string | null = null;
      try {
        const j = JSON.parse(text);
        if (j?.error?.message?.value) message = j.error.message.value;
        else if (j?.error?.message)   message = String(j.error.message);
        if (j?.error?.code)           code = String(j.error.code);
      } catch { /* not JSON */ }
      throw new IcoreApiError(message, res.status, code, path, text);
    }

    const text = await res.text();
    if (!text) return undefined as unknown as T;
    return JSON.parse(text) as T;
  }

  // ── pagination helper ───────────────────────────────────────────────────

  /** Walk @odata.nextLink to gather every page of a list endpoint. Caller
   *  passes the initial path (with $select / $filter etc.); subsequent
   *  requests follow the absolute URL F&O returns. */
  private async getAll<T>(path: string): Promise<T[]> {
    const out: T[] = [];
    let next: string | null = path;
    while (next) {
      const page: ODataPage<T> = await this.req<ODataPage<T>>('GET', next);
      if (Array.isArray(page?.value)) out.push(...page.value);
      next = page?.['@odata.nextLink'] ?? null;
    }
    return out;
  }

  // ── companies (also serves as the cheap connectivity probe) ─────────────

  /** Cheap probe: returns up to N companies the signed-in user can see. */
  async listCompanies(top = 50): Promise<F_OCompany[]> {
    const page = await this.req<ODataPage<F_OCompany>>(
      'GET',
      `/data/Companies?$select=DataArea,Name&$top=${top}`,
    );
    return page.value ?? [];
  }

  // ── customers ───────────────────────────────────────────────────────────

  /** All non-blocked customers across companies. F&O scopes CustomerAccount
   *  per dataAreaId, so we always include both columns. */
  async listCustomers(opts: { includeBlocked?: boolean } = {}): Promise<F_OCustomer[]> {
    const fields = [
      'CustomerAccount',
      'dataAreaId',
      'OrganizationName',
      'Name',
      'PrimaryContactEmail',
      'Email',
      'PrimaryContactName',
      'AddressLine1',
      'AddressCity',
      'AddressState',
      'AddressZipCode',
      'Blocked',
    ].join(',');

    const filter = opts.includeBlocked ? '' : `&$filter=Blocked eq Microsoft.Dynamics.DataEntities.CustVendorBlocked'No'`;
    return this.getAll<F_OCustomer>(`/data/CustomersV3?$select=${fields}${filter}`);
  }

  // ── projects ────────────────────────────────────────────────────────────
  //
  // F&O ships a `Projects` data-entity (and `ProjectsV2` in newer SKUs).
  // We default to `Projects` since it's available in every release we care
  // about; specific environments that need V2 can flip a config flag in
  // a follow-up. The exact field names below are the standard headers in
  // a stock F&O install — environments with heavy ProjMgmt customizations
  // may need a tweak.

  async listProjectsByName(name: string, dataAreaId?: string | null): Promise<F_OProject[]> {
    const enc = encodeURIComponent(name.replace(/'/g, "''"));
    const filterParts = [`ProjectName eq '${enc}'`];
    if (dataAreaId) filterParts.push(`dataAreaId eq '${dataAreaId}'`);
    const filter = filterParts.join(' and ');
    return this.getAll<F_OProject>(`/data/Projects?$filter=${filter}&$select=ProjectID,ProjectName,dataAreaId,CustomerAccount,ProjectGroupId,ProjectStage`);
  }

  /** Create a new F&O project. ProjectID is omitted so F&O's auto-numbering
   *  assigns it; the returned record carries the generated ID. */
  async createProject(body: CreateProjectBody): Promise<F_OProject> {
    return this.req<F_OProject>('POST', '/data/Projects', body);
  }

  async updateProject(projectId: string, dataAreaId: string, patch: Partial<F_OProject>): Promise<F_OProject> {
    // OData entity-key form: Projects(ProjectID='X',dataAreaId='Y')
    const key = `ProjectID='${encodeURIComponent(projectId.replace(/'/g, "''"))}',dataAreaId='${encodeURIComponent(dataAreaId)}'`;
    return this.req<F_OProject>('PATCH', `/data/Projects(${key})`, patch);
  }

  /** Create a WBS activity / phase under a project. The activity entity in
   *  F&O is `ProjectActivities`; each row carries ProjectID + ActivityNumber
   *  + ActivityName. Hierarchy (parent/child) is configured via OData
   *  separately and is intentionally out of scope here — we emit a flat
   *  list of activities matching the QuickQuote phase order. */
  async createProjectActivity(body: CreateProjectActivityBody): Promise<F_OProjectActivity> {
    return this.req<F_OProjectActivity>('POST', '/data/ProjectActivities', body);
  }
}

// ── F&O project payload types ───────────────────────────────────────────────

export interface F_OProject {
  ProjectID: string;
  ProjectName: string;
  dataAreaId: string;
  CustomerAccount?: string;
  ProjectGroupId?: string;
  ProjectStage?: string;
  ProjectStartDate?: string | null;
  ProjectEndDate?: string | null;
}

export interface CreateProjectBody {
  ProjectName: string;
  dataAreaId: string;
  CustomerAccount: string;
  ProjectGroupId?: string;
  /** Optional. When omitted F&O auto-assigns based on number sequence. */
  ProjectID?: string;
  ProjectStartDate?: string | null;
  ProjectEndDate?: string | null;
}

export interface F_OProjectActivity {
  ProjectID: string;
  ActivityNumber: string;
  ActivityName: string;
  dataAreaId: string;
}

export interface CreateProjectActivityBody {
  ProjectID: string;
  dataAreaId: string;
  ActivityName: string;
  /** Optional. When omitted F&O auto-assigns. */
  ActivityNumber?: string;
}

// ── shape adapter (F&O → icore_client row) ─────────────────────────────────

import type { IcoreClientRow } from '../db/icore';

/** Convert an F_OCustomer payload to the local cache row shape. Picks the
 *  first non-empty value across name/email fields since F&O exposes
 *  several variants for organization vs person customers. */
export function customerToCacheRow(c: F_OCustomer): Omit<IcoreClientRow, 'id'> {
  const name = (c.OrganizationName || c.Name || c.CustomerAccount || '').trim();
  const contactName  = (c.PrimaryContactName || '').trim() || null;
  const contactEmail = (c.PrimaryContactEmail || c.Email || '').trim() || null;
  const addressParts = [c.AddressLine1, [c.AddressCity, c.AddressState].filter(Boolean).join(', '), c.AddressZipCode]
    .map((s) => (s || '').trim()).filter(Boolean);
  const address = addressParts.length ? addressParts.join(' · ') : null;
  return {
    customer_account: c.CustomerAccount,
    data_area_id:     (c.dataAreaId || '').trim() || null,
    name,
    address,
    contact_name:  contactName,
    contact_email: contactEmail,
    is_active:     c.Blocked && c.Blocked !== 'No' ? 0 : 1,
  };
}
