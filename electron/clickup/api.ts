// Thin typed wrapper over the ClickUp v2 REST API. The orchestrator (sync.ts)
// is the only consumer; we intentionally don't expose this directly to the
// renderer. Errors are normalized to ClickUpApiError so callers can show a
// meaningful message without parsing fetch responses.
//
// Rate limit (per ClickUp docs): 100 req / minute / token. A typical send
// flow hits at most ~10–20 calls for a 5-phase project, so no queue is
// needed. If we ever hit 429 we'll add backoff.
//
// Direct port of PM Quoting App's electron/clickup/api.ts.

const BASE = 'https://api.clickup.com/api/v2';

export class ClickUpApiError extends Error {
  status: number;
  body: string;
  constructor(message: string, status: number, body: string) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

export interface UserInfo { id: number; email: string; username: string | null; }
export interface Member   { id: number; email: string; username: string | null; }
export interface Workspace { id: string; name: string; }
export interface Space    { id: string; name: string; }
export interface Folder   { id: string; name: string; }
export interface List     { id: string; name: string; url?: string; }
export interface TaskRef  { id: string; name: string; url: string; }

export interface CreateTaskBody {
  name: string;
  description?: string;
  assignees?: number[];
  status?: string;
  priority?: 1 | 2 | 3 | 4;
  due_date?: number;            // ms epoch
  parent?: string;              // for subtasks
}

export interface UpdateTaskBody {
  name?: string;
  description?: string;
  assignees?: { add?: number[]; rem?: number[] };
  status?: string;
  due_date?: number | null;
}

export class ClickUpApi {
  constructor(private token: string, private workspaceId: string | null = null) {}

  // ── core fetch ──────────────────────────────────────────────────────────

  private async req<T = any>(method: string, path: string, body?: any): Promise<T> {
    const res = await fetch(BASE + path, {
      method,
      headers: {
        Authorization: this.token,
        'Content-Type': 'application/json',
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    if (!res.ok) {
      let message = `${method} ${path} → HTTP ${res.status}`;
      try {
        const j = JSON.parse(text);
        if (j?.err) message = j.err;
        else if (j?.error) message = j.error;
      } catch { /* not JSON */ }
      throw new ClickUpApiError(message, res.status, text);
    }
    if (!text) return undefined as unknown as T;
    return JSON.parse(text) as T;
  }

  // ── identity / workspaces ───────────────────────────────────────────────

  /** GET /user — returns the authenticated user. Cheapest token-validity probe. */
  async getUser(): Promise<UserInfo> {
    const data = await this.req<any>('GET', '/user');
    const u = data?.user || data;
    return {
      id: Number(u?.id),
      email: u?.email || '',
      username: u?.username || null,
    };
  }

  /** GET /team — list workspaces ("teams" in ClickUp's older terminology)
   *  the token has access to. */
  async listWorkspaces(): Promise<Workspace[]> {
    const data = await this.req<any>('GET', '/team');
    return (data?.teams || []).map((t: any) => ({ id: String(t.id), name: t.name }));
  }

  // ── members ─────────────────────────────────────────────────────────────

  async listMembers(): Promise<Member[]> {
    if (!this.workspaceId) return [];
    const data = await this.req<any>('GET', `/team`);
    const team = (data?.teams || []).find((t: any) => String(t.id) === String(this.workspaceId)) || data?.teams?.[0];
    if (!team) return [];
    return (team.members || []).map((m: any) => ({
      id: Number(m.user?.id),
      email: m.user?.email || '',
      username: m.user?.username || null,
    })).filter((m: Member) => m.id && m.email);
  }

  async findMemberByEmail(email: string): Promise<Member | null> {
    if (!email) return null;
    const members = await this.listMembers();
    const lc = email.toLowerCase();
    return members.find(m => (m.email || '').toLowerCase() === lc) || null;
  }

  // ── spaces / folders / lists ────────────────────────────────────────────

  async listSpaces(archived = false): Promise<Space[]> {
    if (!this.workspaceId) throw new Error('workspaceId not configured');
    const data = await this.req<any>('GET', `/team/${this.workspaceId}/space?archived=${archived}`);
    return (data?.spaces || []).map((s: any) => ({ id: String(s.id), name: s.name }));
  }

  async listFolders(spaceId: string, archived = false): Promise<Folder[]> {
    const data = await this.req<any>('GET', `/space/${spaceId}/folder?archived=${archived}`);
    return (data?.folders || []).map((f: any) => ({ id: String(f.id), name: f.name }));
  }

  async createFolder(spaceId: string, name: string): Promise<Folder> {
    const data = await this.req<any>('POST', `/space/${spaceId}/folder`, { name });
    return { id: String(data.id), name: data.name };
  }

  async listListsInFolder(folderId: string, archived = false): Promise<List[]> {
    const data = await this.req<any>('GET', `/folder/${folderId}/list?archived=${archived}`);
    return (data?.lists || []).map((l: any) => ({ id: String(l.id), name: l.name, url: l.url }));
  }

  async createListInFolder(folderId: string, name: string, content?: string): Promise<List> {
    const body: any = { name };
    if (content) body.content = content;
    const data = await this.req<any>('POST', `/folder/${folderId}/list`, body);
    return { id: String(data.id), name: data.name, url: data.url };
  }

  async listListsInSpace(spaceId: string, archived = false): Promise<List[]> {
    const data = await this.req<any>('GET', `/space/${spaceId}/list?archived=${archived}`);
    return (data?.lists || []).map((l: any) => ({ id: String(l.id), name: l.name, url: l.url }));
  }

  // ── tasks ───────────────────────────────────────────────────────────────

  async createTask(listId: string, body: CreateTaskBody): Promise<TaskRef> {
    const data = await this.req<any>('POST', `/list/${listId}/task`, body);
    return { id: String(data.id), name: data.name, url: data.url };
  }

  async updateTask(taskId: string, body: UpdateTaskBody): Promise<void> {
    await this.req('PUT', `/task/${taskId}`, body);
  }
}
