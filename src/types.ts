// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

export type HeadloErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'SERVER_ERROR'
  | 'INVALID_JSON'
  | 'NO_FIELDS: nothing to update'
  | 'CONFLICT: collection_id already exists'
  | 'CONFLICT: page_id already exists'
  | 'CONFLICT: module_id already exists on this page'
  | 'CONFLICT: collection has active records - delete records first'
  | `MISSING_PARAM: ${string}`
  | `MISSING_FIELD: ${string}`
  | `INVALID_ID: ${string}`
  | `INVALID_FIELD: ${string}`
  | `INVALID_OP: ${string}`
  | `INVALID_OPTION: ${string}`
  | `REQUIRED_FIELD: ${string}`
  | `NOT_FILTERABLE: ${string}`
  | `FIELD_ID_IMMUTABLE: ${string}`
  | `FIELD_TYPE_IMMUTABLE: ${string}`
  | 'TRIAL_EXPIRED'
  | 'BILLING_PAST_DUE'
  | 'BILLING_CANCELLED'
  | 'PLAN_LIMIT'

export type HeadloResult<T> = T & { error: HeadloErrorCode | null }

// ---------------------------------------------------------------------------
// Collection / record
// ---------------------------------------------------------------------------

export interface CollectionRecord {
  collection_record_id: string
  slug:       string | null
  status:     string
  created_at: string
  updated_at: string
  [key: string]: unknown
}

export interface CollectionListResponse {
  collection_id: string
  records:       CollectionRecord[]
  count:         number
  next_cursor:   string | null
}

export interface CollectionRecordResponse {
  record: ({
    collection_record_id: string
    status:     string
    created_at: string
    updated_at: string
    [key: string]: unknown
  }) | null
}

// ---------------------------------------------------------------------------
// Pages / modules
// ---------------------------------------------------------------------------

export interface ModuleResponse {
  module_id:        string
  template_id:      string
  template_options: Record<string, unknown> | null
  fields:           Record<string, unknown>
}

export interface PageModulesResponse {
  page_id: string
  modules: ModuleResponse[]
}

export interface SitePage {
  page_id: string
  path:    string
}

export interface SitePagesResponse {
  pages: SitePage[]
}

export interface SingleModuleResponse {
  module_id:        string
  template_id:      string
  template_options: Record<string, unknown> | null
  fields:           Record<string, unknown>
}

// ---------------------------------------------------------------------------
// Collection list options
// ---------------------------------------------------------------------------

export type FilterOp = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'contains'

export interface CollectionFilter {
  field: string
  op:    FilterOp
  value: unknown
}

export interface ListOptions {
  filter?:     CollectionFilter[]
  sort?:       string
  dir?:        'asc' | 'desc'
  limit?:      number
  offset?:     number
  cursor?:     string
  record_ids?: string[] | null
}

export interface CollectionBuilder {
  list():   Promise<HeadloResult<CollectionListResponse>>
  record(recordId: string): Promise<HeadloResult<CollectionRecordResponse>>
  submit(data: Record<string, unknown>): Promise<HeadloResult<{ collection_record_id: string }>>
  limit(n: number): CollectionBuilder
  cursor(c: string | null | undefined): CollectionBuilder
  filter(f: CollectionFilter[]): CollectionBuilder
  sort(field: string, dir?: 'asc' | 'desc'): CollectionBuilder
  pagination(): (cursor: string | undefined, limit: number) => Promise<HeadloResult<CollectionListResponse>>
}

// ---------------------------------------------------------------------------
// PROP — Platform Reactive Open Protocol
// ---------------------------------------------------------------------------

export interface PropComponentDef {
  def_id:      string
  slug:        string
  prop_type:   string
  owner_id:    string
  name:        string
  stage:       string
  contract:    Record<string, unknown>
  requires:    Record<string, unknown>
  public_path: string
  is_public:   boolean
}

export interface PropComponentApp {
  app_id:               string
  slug:                 string
  config:               Record<string, unknown>
  component_js:         string | null
  prop_runtime_version: string | null
}

export interface PropComponentResponse {
  def: PropComponentDef
  app: PropComponentApp | null
}

export interface PropServiceDef {
  def_id:      string
  slug:        string
  prop_type:   string
  owner_id:    string
  name:        string
  stage:       string
  contract:    Record<string, unknown>
  handlers:    Record<string, unknown>
  public_path: string
  is_public:   boolean
}

export interface PropServiceResponse {
  def: PropServiceDef
}

export interface PropServiceClient {
  manifest(): Promise<HeadloResult<PropServiceResponse>>
  call(action: string, args?: Record<string, unknown>): Promise<HeadloResult<Record<string, unknown>>>
}

// ---------------------------------------------------------------------------
// Onboarding
// ---------------------------------------------------------------------------


export interface SiteCreatedResponse {
  site_id:  string
  anon_key: string
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

export interface ComponentRow {
  component_id:            string
  agency_id:               string
  workspace_id:            string
  label:                   string
  description:             string | null
  template_ids:            string[]
  template_id:             string | null
  collection_id:           string | null
  collection_record_ids:   string[] | null
  sample_data:             Record<string, any>
  template_options:        Record<string, any> | null
  template_options_schema: Record<string, any> | null
  code:                    string
  js:                      string | null
  public:                  boolean
  type_definition:         string | null
}

export interface TokenClaims {
  sub:      string
  email?:   string
  name?:    string
  picture?: string
  role?:    string
  raw:      Record<string, unknown>
}

export interface ComponentUtils {
  fetch:     (url: string, init?: RequestInit & { cache_ttl?: number }) => Promise<Response>
  token:     TokenClaims | null
  navigate?: (path: string) => void
  onClick?:  (record: Record<string, unknown>) => void
  emit?:     (event: string, data: unknown) => void
  headlo?:   import('./client').HeadloClient
}
