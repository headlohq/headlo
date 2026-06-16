import type {
  HeadloResult,
  CollectionListResponse,
  CollectionRecordResponse,
  PageModulesResponse,
  SingleModuleResponse,
  SitePagesResponse,
  ListOptions,
  CollectionFilter,
  CollectionBuilder,
  PropComponentResponse,
  PropServiceClient,
  PropServiceResponse,
} from './types'

const DEFAULT_API = 'https://api.headlo.com'

const localDate = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })

type ComponentMeta = { component_id: string; collection_id: string | null; collection_record_ids: string[] | null; template_options: Record<string, unknown> | null }

export interface HeadloClient {
  readonly anonKey: string
  readonly apiUrl:  string
  asUser(getToken: () => Promise<string | null>): HeadloClient
  collection(collectionId: string, opts?: ListOptions): CollectionBuilder
  pages(pageId: string): { modules(): Promise<HeadloResult<PageModulesResponse>> }
  modules(moduleId: string): Promise<HeadloResult<SingleModuleResponse>>
  site(): { pages(): Promise<HeadloResult<SitePagesResponse>> }
  components(): () => Promise<HeadloResult<{ components: ComponentMeta[]; signature: string | null }>>
  component(componentId: string): { records(opts?: Omit<ListOptions, 'record_ids'>): Promise<HeadloResult<CollectionListResponse>> }
  service(slug: string): PropServiceClient
}

interface ClientOptions {
  apiUrl?:       string
  getToken?:     () => Promise<string | null>
  customFetch?:  (url: string, init?: RequestInit) => Promise<Response>
  userToken?:    string
}

async function apiFetch<T>(
  base: string,
  path: string,
  anonKey: string,
  getToken: (() => Promise<string | null>) | undefined,
  options?: RequestInit,
  customFetch?: (url: string, init?: RequestInit) => Promise<Response>,
  userToken?: string,
): Promise<HeadloResult<T>> {
  const doFetch = customFetch ?? fetch
  const authToken = userToken ?? (customFetch ? null : await getToken?.())
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (anonKey) headers['x-headlo-key'] = anonKey
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`
  const res = await doFetch(`${base}${path}`, {
    ...options,
    headers: { ...headers, ...options?.headers },
  })
  return res.json() as Promise<HeadloResult<T>>
}


export function createClient(anonKey: string, options?: ClientOptions): HeadloClient {
  const base        = options?.apiUrl       ?? DEFAULT_API
  const getToken    = options?.getToken
  const customFetch = options?.customFetch
  const userToken   = options?.userToken

  function req<T>(path: string, init?: RequestInit) {
    return apiFetch<T>(base, path, anonKey, getToken, init, customFetch, userToken)
  }

  function makeCollection(collectionId: string, opts: ListOptions): CollectionBuilder {
    const encoded = encodeURIComponent(collectionId)
    return {
      list(): Promise<HeadloResult<CollectionListResponse>> {
        const params = new URLSearchParams()
        if (opts.filter?.length)     params.set('filters',    JSON.stringify(opts.filter))
        if (opts.limit)              params.set('limit',      String(opts.limit))
        if (opts.sort)               params.set('sort',       opts.sort)
        if (opts.dir)                params.set('order',      opts.dir)
        if (opts.cursor)             params.set('cursor',     opts.cursor)
        if (opts.record_ids?.length) params.set('record_ids', JSON.stringify(opts.record_ids))
        const qs = params.toString()
        return req<CollectionListResponse>(
          `/v1/collections/${encoded}/records${qs ? '?' + qs : ''}`,
          { method: 'GET' },
        ).then(res => {
          if (res.error) return res
          return { ...res, records: (res.records ?? []).map(({ data, ...rest }) => ({ ...rest, ...(data as Record<string, unknown> ?? {}), created_at_local: localDate(rest.created_at), updated_at_local: localDate(rest.updated_at) })) }
        })
      },
      record(recordId: string): Promise<HeadloResult<CollectionRecordResponse>> {
        return req<{ record: { collection_record_id: string; data: Record<string, unknown>; status: string; created_at: string; updated_at: string } | null }>(
          `/v1/collections/${encoded}/records/${encodeURIComponent(recordId)}`,
        ).then(res => {
          if (!res.record) return res as unknown as HeadloResult<CollectionRecordResponse>
          const { data, ...rest } = res.record
          return { ...res, record: { ...rest, ...(data ?? {}), created_at_local: localDate(rest.created_at), updated_at_local: localDate(rest.updated_at) } } as HeadloResult<CollectionRecordResponse>
        })
      },
      submit(data: Record<string, unknown>): Promise<HeadloResult<{ collection_record_id: string }>> {
        return req<{ collection_record_id: string }>(
          `/v1/collections/${encoded}/records/submit`,
          { method: 'POST', body: JSON.stringify(data) },
        )
      },
      limit(n: number)                            { return makeCollection(collectionId, { ...opts, limit: n }) },
      cursor(c: string | null | undefined)         { return makeCollection(collectionId, { ...opts, cursor: c ?? undefined }) },
      filter(f: CollectionFilter[])               { return makeCollection(collectionId, { ...opts, filter: f }) },
      sort(field: string, dir?: 'asc' | 'desc')  { return makeCollection(collectionId, { ...opts, sort: field, dir }) },
      pagination()                                { return (c: string | undefined, n: number) => makeCollection(collectionId, { ...opts, cursor: c, limit: n }).list() },
    }
  }

  const client = {
    anonKey,
    apiUrl: base,

    asUser(getToken: () => Promise<string | null>): HeadloClient {
      return createClient(anonKey, { apiUrl: base, customFetch, getToken })
    },

    collection(collectionId: string, opts: ListOptions = {}) {
      return makeCollection(collectionId, opts)
    },

    pages(pageId: string) {
      return {
        modules() {
          return req<PageModulesResponse>(
            `/v1/pages/${encodeURIComponent(pageId)}/modules`,
            { method: 'POST', body: '{}' },
          )
        },
      }
    },

    modules(moduleId: string) {
      return req<SingleModuleResponse>(
        `/v1/modules/${encodeURIComponent(moduleId)}`,
      )
    },

    site() {
      return {
        pages(): Promise<HeadloResult<SitePagesResponse>> {
          return req<SitePagesResponse>('/v1/pages')
        },
      }
    },

    components() {
      return () => req<{ components: ComponentMeta[]; signature: string | null }>('/v1/components')
    },

    service(slug: string): PropServiceClient {
      return {
        manifest(): Promise<HeadloResult<PropServiceResponse>> {
          return req<PropServiceResponse>(`/v1/prop/service/${encodeURIComponent(slug)}`)
        },
        call(action: string, args?: Record<string, unknown>): Promise<HeadloResult<Record<string, unknown>>> {
          return req<Record<string, unknown>>(
            `/v1/prop/service/${encodeURIComponent(slug)}/call`,
            { method: 'POST', body: JSON.stringify({ action, args: args ?? {} }) },
          )
        },
      }
    },

    component(componentId: string) {
      return {
        async records(opts?: Omit<ListOptions, 'record_ids'>): Promise<HeadloResult<CollectionListResponse>> {
          const res = await req<{ components: ComponentMeta[] }>('/v1/components')
          if (res.error) return { collection_id: '', records: [], count: 0, next_cursor: null, error: res.error }
          const comp = res.components?.find(c => c.component_id === componentId)
          if (!comp?.collection_id) return { collection_id: '', records: [], count: 0, next_cursor: null, error: null }
          const to = comp.template_options ?? {}
          const sortVal = typeof to['sort'] === 'string' ? (to['sort'] as string).split(' ') : []
          const fromOptions: Omit<ListOptions, 'record_ids'> = {
            ...(sortVal[0] ? { sort: sortVal[0] } : {}),
            ...(sortVal[1] === 'asc' || sortVal[1] === 'desc' ? { dir: sortVal[1] } : {}),
            ...(typeof to['limit'] === 'number' ? { limit: to['limit'] as number } : {}),
          }
          return client.collection(comp.collection_id, { ...fromOptions, ...opts, record_ids: comp.collection_record_ids ?? undefined }).list()
        },
      }
    },
  }

  return client
}

// HeadloClient is defined above createClient to avoid circular ReturnType reference
