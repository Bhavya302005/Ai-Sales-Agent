import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export type Me = {
  user_id: string;
  organization_id: string;
  role: "owner" | "operator" | "viewer";
};

export type Workspace = {
  id: string;
  organization_id: string;
  name: string;
  locale: string;
  timezone: string;
};

export type LeadSummary = {
  id: string;
  lifecycle: string;
  company_name: string | null;
  normalized_need: string;
  source_url: string;
  published_at: string | null;
  score: number | null;
  score_confidence: number | null;
};

export type LeadDetail = LeadSummary & {
  source: {
    url: string;
    source_type: string;
    rights_note: string;
    published_at: string | null;
    observed_at: string;
    evidence_excerpt: string;
  };
  assertions: Array<{
    id: string;
    field_name: string;
    value: Record<string, unknown> | null;
    status: string;
    confidence: number;
    evidence_excerpt: string | null;
    observed_at: string;
    source_url: string | null;
  }>;
  score_detail: {
    total: number;
    confidence: number;
    explanation: string;
    rule_version: string;
    contributions: Array<{
      feature: string;
      value: number;
      weight: number;
      points: number;
    }>;
  } | null;
  offering: {
    id: string;
    version: number;
    description: string;
    pricing_policy: string;
    approved_at: string | null;
  };
  unknown_fields: string[];
  pre_call_brief: {
    lead_id: string;
    product_version_id: string;
    policy_version: string;
    opener: BriefItem;
    likely_need: BriefItem;
    fit_summary: BriefItem;
    known_facts: Array<BriefItem & { label: string }>;
    unknowns: string[];
    allowed_faq: Array<BriefItem & { label: string }>;
    qualification_questions: Array<BriefItem & { label: string }>;
    escalation_topics: Array<BriefItem & { label: string }>;
    prohibited_claims: string[];
  } | null;
};

type BriefItem = {
  text: string;
  citations: Array<{
    kind: "source" | "product_fact" | "product_description" | "policy";
    reference_id: string;
    evidence: string;
  }>;
};

export type OfferingVersion = {
  id: string;
  version: number;
  description: string;
  icp: {
    geographies: string[];
    industries: string[];
    needs: string[];
  };
  exclusions: string[];
  facts: Record<string, string>;
  pricing_policy: string;
  qualification_questions: string[];
  handoff_conditions: string[];
  approved_at: string | null;
  approved_by: string | null;
  is_active: boolean;
  is_callable: boolean;
  created_at: string;
};

export type Offering = {
  product_id: string;
  product_name: string;
  active_version_id: string | null;
  versions: OfferingVersion[];
};

export type SourceDocument = {
  id: string;
  canonical_url: string;
  source_type: string;
  rights_note: string;
  published_at: string | null;
  observed_at: string;
  evidence_excerpt: string;
  extraction_status: string;
  discovery_title: string | null;
  discovery_company: string | null;
  discovery_location: string | null;
  opportunity_type: string | null;
  discovery_actionable: boolean | null;
  created: boolean | null;
};

export type DiscoveryResult = {
  id: string;
  title: string;
  company: string | null;
  location: string | null;
  published_at: string | null;
  original_url: string;
  source: string;
  opportunity_type: string;
  evidence_excerpt: string;
  rights_note: string;
  provider_metadata: Record<string, unknown>;
  actionable: boolean;
  extraction_status: string;
};

export type DiscoveryImport = {
  provider: string;
  provider_status: string;
  received: number;
  created: number;
  duplicates: number;
  results: DiscoveryResult[];
};

export type ExtractionResult = {
  source_id: string;
  extraction_status: string;
  classification: string;
  actionable: boolean;
  requirement_id: string | null;
  company_id: string | null;
  company_resolution_method: string | null;
  lead_id: string | null;
  score: number | null;
  created: boolean;
  unknown_fields: string[];
  assertions: Record<string, string | string[] | null>;
};

export type Job = {
  event_id: string;
  event_type: string;
  aggregate_type: string;
  aggregate_id: string;
  state: "pending" | "processing" | "retry_wait" | "completed" | "action_required";
  attempts: number;
  next_attempt_at: string | null;
  last_error_code: string | null;
  status_url: string;
  created: boolean | null;
};

export type Campaign = {
  id: string;
  name: string;
  timezone: string;
  daily_budget_inr: string;
  status: string;
  mode: "leads_and_calling" | "calling_only";
  scheduled_start_at: string | null;
  recurrence: "once" | "daily" | "weekly" | "monthly";
  max_attempts: number;
  retry_delay_minutes: number;
  leads: Array<{
    id: string;
    lead_id: string;
    state: string;
    approved_at: string | null;
    approved_by: string | null;
    owner_id: string | null;
    contact_id: string | null;
    latest_call_id: string | null;
    latest_call_state: string | null;
    latest_call_transport: string | null;
    latest_call_checks: Array<{ name: string; passed: boolean; reason: string }>;
    disposition: string;
    interest: string | null;
    handoff_id: string | null;
  }>;
};

export type Call = {
  id: string;
  attempt_id: string;
  lead_id: string;
  contact_id: string;
  transport: string;
  state: string;
  eligible: boolean;
  eligibility_checks: Array<{ name: string; passed: boolean; reason: string }>;
  max_duration_seconds: number;
  usage: Record<string, unknown>;
  outcome: string | null;
  created: boolean | null;
};

export type LeadImportResponse = {
  received: number;
  imported: number;
  duplicates: number;
  rejected: number;
  errors: string[];
};

export type CallDetail = {
  id: string;
  lead_id: string;
  transport: string;
  state: string;
  outcome: string | null;
  max_duration_seconds: number;
  usage: Record<string, unknown>;
  eligibility_checks: Array<{ name: string; passed: boolean; reason: string }>;
  transcript: Array<{
    id: string;
    sequence: number;
    speaker: string;
    started_ms: number;
    ended_ms: number;
    text: string;
    language: string;
  }>;
  qualification: {
    id: string;
    need: string | null;
    timeline: string | null;
    scope: string | null;
    authority_known: boolean | null;
    budget_known: boolean | null;
    objections: Array<{ type?: string; text?: string; evidence_segment_id?: string }>;
    interest: string | null;
    requested_next_step: string | null;
    evidence_segment_ids: string[];
  } | null;
  handoff: {
    id: string;
    owner_id: string;
    priority: string;
    reason: string;
    due_at: string;
    state: string;
    external_reference: string | null;
    crm_provider: "mock" | "hubspot";
    crm_sync_status: "not_requested" | "pending" | "retrying" | "succeeded" | "action_required";
  } | null;
};

export type Funnel = {
  discovered: number;
  reviewed: number;
  approved: number;
  called: number;
  qualified: number;
  handed_off: number;
};

export type DiscoveryBreakdown = {
  by_source: Array<{ label: string; count: number }>;
  by_type: Array<{ label: string; count: number }>;
  actionable: number;
  calls_attempted: number;
  calls_completed: number;
  interested: number;
};

export type Usage = {
  totals: Array<{
    unit: string;
    quantity: string;
    estimated_cost_inr: string;
    actual_cost_inr: string | null;
  }>;
  total_estimated_cost_inr: string;
  total_actual_cost_inr: string | null;
  average_voice_latency_ms: number | null;
  crm_retrying: number;
  crm_action_required: number;
  cost_label: string;
};

export type CrmStatus = {
  mode: "mock" | "hubspot";
  configured: boolean;
  label: string;
};

export type NotificationFeed = {
  unread_count: number;
  items: Array<{
    id: string;
    notification_type: string;
    severity: "info" | "success" | "warning" | "error";
    title: string;
    summary: string;
    action_url: string | null;
    read_at: string | null;
    created_at: string;
  }>;
};

export type AdminMember = {
  id: string;
  user_id: string;
  role: "owner" | "operator" | "viewer";
  status: "active" | "inactive";
};

export type AuditEntry = {
  id: string;
  actor_id: string | null;
  action: string;
  target_type: string;
  target_id: string;
  reason: string | null;
  request_id: string;
  occurred_at: string;
};

export type RuntimeControls = {
  calls_paused: boolean;
  environment_kill_switch: boolean;
  effective_calls_paused: boolean;
};

export type ProviderHealth = { providers: Record<string, string> };

export type CallingProvider = {
  transport: "browser" | "twilio" | "omnidim" | "exotel";
  pstn_configured: boolean;
  label: string;
};

export type CallbackRequest = {
  id: string;
  call_id: string;
  handoff_id: string | null;
  owner_id: string;
  requested_text: string;
  scheduled_for: string | null;
  status: "awaiting_confirmation" | "scheduled" | "completed" | "cancelled";
  created_at: string;
};

export type CampaignRun = {
  id: string;
  campaign_id: string;
  scheduled_for: string;
  state: "scheduled" | "ready" | "completed" | "cancelled";
  ready_lead_count: number;
  processed_at: string | null;
};

export type HubSpotContactPage = {
  contacts: Array<{
    external_id: string;
    display_name: string;
    company: string | null;
    masked_phone: string | null;
    importable: boolean;
  }>;
  next_after: string | null;
  label: string;
};

type ApiProblem = {
  detail?: string;
};

const apiBaseUrl = process.env.API_BASE_URL ?? "http://localhost:8000";

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = (await cookies()).get("sales_agent_session")?.value;
  if (!token) redirect("/login");

  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      ...init?.headers,
    },
  });
  if (response.status === 401 || response.status === 403) redirect("/login");
  if (!response.ok) {
    const problem = (await response.json().catch(() => ({}))) as ApiProblem;
    throw new Error(problem.detail ?? `API request failed (${response.status})`);
  }
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  if (text.length === 0) return undefined as T;
  return JSON.parse(text) as T;
}

export async function getViewer(): Promise<{ me: Me; workspace: Workspace }> {
  const [me, workspace] = await Promise.all([
    apiFetch<Me>("/api/v1/me"),
    apiFetch<Workspace>("/api/v1/workspaces/current"),
  ]);
  return { me, workspace };
}

export async function getLeads(): Promise<LeadSummary[]> {
  return apiFetch<LeadSummary[]>("/api/v1/leads");
}

export async function getLead(id: string): Promise<LeadDetail> {
  return apiFetch<LeadDetail>(`/api/v1/leads/${encodeURIComponent(id)}`);
}

export async function getOffering(): Promise<Offering> {
  return apiFetch<Offering>("/api/v1/knowledge/offering");
}

export async function getSources(): Promise<SourceDocument[]> {
  return apiFetch<SourceDocument[]>("/api/v1/sources");
}

export async function getDiscovery(query = ""): Promise<DiscoveryResult[]> {
  return apiFetch<DiscoveryResult[]>(`/api/v1/discovery/results${query ? `?${query}` : ""}`);
}

export async function getCampaigns(): Promise<Campaign[]> {
  return apiFetch<Campaign[]>("/api/v1/campaigns");
}

export async function getCallingProvider(): Promise<CallingProvider> {
  return apiFetch<CallingProvider>("/api/v1/calling/provider");
}

export async function getCampaignRuns(campaignId: string): Promise<CampaignRun[]> {
  return apiFetch<CampaignRun[]>(`/api/v1/campaigns/${encodeURIComponent(campaignId)}/runs`);
}

export async function getCall(id: string): Promise<Call> {
  return apiFetch<Call>(`/api/v1/calls/${encodeURIComponent(id)}`);
}

export async function getCallDetail(id: string): Promise<CallDetail> {
  return apiFetch<CallDetail>(`/api/v1/calls/${encodeURIComponent(id)}/detail`);
}

export async function getAnalytics(): Promise<{
  funnel: Funnel;
  usage: Usage;
  discovery: DiscoveryBreakdown;
}> {
  const [funnel, usage, discovery] = await Promise.all([
    apiFetch<Funnel>("/api/v1/analytics/funnel"),
    apiFetch<Usage>("/api/v1/analytics/usage"),
    apiFetch<DiscoveryBreakdown>("/api/v1/analytics/discovery"),
  ]);
  return { funnel, usage, discovery };
}

export async function getCrmStatus(): Promise<CrmStatus> {
  return apiFetch<CrmStatus>("/api/v1/integrations/crm");
}

export async function getNotifications(query = ""): Promise<NotificationFeed> {
  return apiFetch<NotificationFeed>(`/api/v1/notifications${query ? `?${query}` : ""}`);
}

export async function getAdmin(auditAction = "", auditOffset = 0): Promise<{
  members: AdminMember[];
  audit: AuditEntry[];
  controls: RuntimeControls;
  health: ProviderHealth;
}> {
  const [members, audit, controls, health] = await Promise.all([
    apiFetch<AdminMember[]>("/api/v1/admin/members"),
    apiFetch<AuditEntry[]>(`/api/v1/admin/audit-logs?limit=25&offset=${auditOffset}${auditAction ? `&action=${encodeURIComponent(auditAction)}` : ""}`),
    apiFetch<RuntimeControls>("/api/v1/admin/runtime-controls"),
    apiFetch<ProviderHealth>("/api/v1/admin/provider-health"),
  ]);
  return { members, audit, controls, health };
}

export async function getCallbacks(): Promise<CallbackRequest[]> {
  return apiFetch<CallbackRequest[]>("/api/v1/callbacks");
}

export async function getHubSpotContacts(): Promise<HubSpotContactPage> {
  return apiFetch<HubSpotContactPage>("/api/v1/integrations/hubspot/contacts?limit=25");
}
