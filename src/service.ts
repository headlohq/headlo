import type { PropService, PropServiceConfig, PropComponentResponse, PropServiceResponse, HeadloResult } from './types'

const DEFAULT_URL = 'https://api.headlo.com'

function injectOnce(src: string): Promise<void> {
  const existing = document.querySelector(`script[src="${src}"]`)
  if (existing) {
    if (!(existing as HTMLScriptElement).getAttribute('data-loading')) return Promise.resolve()
  }
  return new Promise<void>((resolve, reject) => {
    if (existing) {
      existing.addEventListener('load',  () => resolve(), { once: true })
      existing.addEventListener('error', () => reject(new Error(`Failed to load: ${src}`)), { once: true })
      return
    }
    const el = document.createElement('script')
    el.src = src
    el.setAttribute('data-loading', '1')
    el.onload  = () => { el.removeAttribute('data-loading'); resolve() }
    el.onerror = () => reject(new Error(`Failed to load: ${src}`))
    document.head.appendChild(el)
  })
}

function preloadOnce(href: string): void {
  if (document.querySelector(`link[rel="preload"][href="${href}"]`)) return
  const el = document.createElement('link')
  el.rel  = 'preload'
  el.as   = 'script'
  el.href = href
  document.head.appendChild(el)
}

export function createService(config: PropServiceConfig = {}): PropService {
  const base = config.url ?? DEFAULT_URL

  function headers(): Record<string, string> {
    return config.publishableKey ? { 'X-Headlo-Prop-Publishable-Key': config.publishableKey } : {}
  }

  // one promise per runtime+version, shared across all load() calls
  const distLoaded: Record<string, Promise<void>> = {}

  function loadDist(runtime: string, version: string): Promise<void> {
    const key = `${runtime}:${version}`
    if (!distLoaded[key]) {
      distLoaded[key] = injectOnce(`${base}/v1/prop/dist/${encodeURIComponent(runtime)}/${encodeURIComponent(version)}/bundle`)
    }
    return distLoaded[key]
  }

  // one cache per component slug — shared across preload() / load() / def()
  // so PropPreload + useComponent on the same slug don't double-fetch
  const componentDefCache:  Record<string, Promise<HeadloResult<PropComponentResponse>>> = {}
  const componentLoadCache: Record<string, Promise<void>>                                = {}

  return {
    publishableKey: config.publishableKey,
    url:            config.url,
    serviceUrl:     config.serviceUrl,

    dist(runtime: string, version: string) {
      const url = `${base}/v1/prop/dist/${encodeURIComponent(runtime)}/${encodeURIComponent(version)}/bundle`
      return {
        bundleUrl(): string  { return url },
        preload():   void    { preloadOnce(url) },
        load(): Promise<void> { return loadDist(runtime, version) },
      }
    },

    component(slug: string) {
      const encoded   = encodeURIComponent(slug)
      const bundleUrl = `${base}/v1/prop/component/${encoded}/bundle`

      function fetchDef(): Promise<HeadloResult<PropComponentResponse>> {
        if (!componentDefCache[slug]) {
          componentDefCache[slug] = fetch(`${base}/v1/prop/component/${encoded}`, { headers: headers() })
            .then(r => r.json() as Promise<HeadloResult<PropComponentResponse>>)
            .catch(e => ({ error: (e as Error)?.message ?? 'Request failed' }) as HeadloResult<PropComponentResponse>)
        }
        return componentDefCache[slug]
      }

      return {
        def: fetchDef,
        bundleUrl(): string { return bundleUrl },

        preload(): void {
          preloadOnce(bundleUrl)
          fetchDef()
        },

        load(): Promise<void> {
          if (!componentLoadCache[slug]) {
            const defP  = fetchDef()
            const react = loadDist('react', '19')
            componentLoadCache[slug] = Promise.all([defP, react]).then(async ([result]) => {
              if (result.error) throw new Error(result.error)
              const reactVersion = (result as any).def?.react_version ?? '19'
              if (reactVersion !== '19') await loadDist('react', reactVersion)
              await injectOnce(bundleUrl)
            })
          }
          return componentLoadCache[slug]
        },
      }
    },

    service(slug: string, version: string) {
      return {
        async manifest(): Promise<HeadloResult<PropServiceResponse>> {
          try {
            const res = await fetch(`${base}/v1/prop/service/${encodeURIComponent(slug)}/${encodeURIComponent(version)}`, { headers: headers() })
            return res.json() as Promise<HeadloResult<PropServiceResponse>>
          } catch (e) {
            return { error: (e as Error)?.message ?? 'Request failed' } as HeadloResult<PropServiceResponse>
          }
        },
        bundleUrl(): string {
          return `${base}/v1/prop/service/${encodeURIComponent(slug)}/${encodeURIComponent(version)}/bundle`
        },
      }
    },
  }
}
