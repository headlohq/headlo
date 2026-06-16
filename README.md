# Headlo SDK

JavaScript/TypeScript client for the [Headlo](https://www.headlo.com) API. Works in the browser, Node.js, and any edge runtime.

```bash
npm install headlo
```

---

## Quick start

```ts
import { createClient } from 'headlo'

const headlo = createClient('your-anon-key')

// Fetch records from a collection
const { records, error } = await headlo.collection('your-collection-id').list()
```

Your anon key is in your Headlo dashboard under **Settings → API**.

---

## Collections

Collections are Headlo's core data primitive — a typed set of records you define and query.

```ts
const client = createClient('anon-key')

// List all published records
const { records } = await client.collection('posts').list()

// Chain filters, sort, limit
const { records } = await client
  .collection('products')
  .filter([{ field: 'status', op: 'eq', value: 'published' }])
  .sort('created_at', 'desc')
  .limit(10)
  .list()

// Fetch a single record by ID or slug
const { record } = await client.collection('posts').record('my-post-slug')

// Submit a new record (contact form, signup, etc.)
const { collection_record_id, error } = await client
  .collection('contact-form')
  .submit({ name: 'Jane', email: 'jane@example.com', message: 'Hello' })
```

Each record is returned flat — your custom fields are merged to the top level alongside `collection_record_id`, `slug`, `status`, `created_at`, and `updated_at`. Both `created_at` and `updated_at` also come with a pre-formatted `_local` variant (`created_at_local`, `updated_at_local`) ready for display.

### Filter operators

| Op | Meaning |
|----|---------|
| `eq` | Equals |
| `neq` | Not equals |
| `gt` / `gte` | Greater than / or equal |
| `lt` / `lte` | Less than / or equal |
| `in` | Value in array |
| `contains` | String contains |

### Pagination

```ts
const paginate = client.collection('posts').limit(20).pagination()

// First page
const page1 = await paginate(undefined, 20)

// Next page
const page2 = await paginate(page1.next_cursor ?? undefined, 20)
```

---

## Authenticated requests

Pass a `getToken` function to make requests on behalf of a signed-in user. The token is fetched lazily before each request.

```ts
import { createClient } from 'headlo'
import { useAuth } from '@clerk/nextjs' // or any auth provider

const headlo = createClient('anon-key', {
  getToken: async () => {
    const { getToken } = useAuth()
    return getToken()
  },
})
```

Or scope a one-off request to a user:

```ts
const userClient = headlo.asUser(() => getMyToken())
const { records } = await userClient.collection('my-orders').list()
```

---

## Pages and modules

Headlo pages are collections of modules (content blocks) you define in the dashboard. Fetch a page's full content in one call:

```ts
const { modules } = await headlo.pages('homepage').modules()

// Or fetch a single module directly
const { fields } = await headlo.modules('hero-module-id')
```

---

## Components

Components are server-signed React components stored in Headlo and rendered at runtime. Fetch the component manifest for a site and verify each component's Ed25519 signature before eval:

```ts
import { createClient, verifyComponentCode } from 'headlo'

const headlo = createClient('anon-key')
const { components, signature } = await headlo.components()()

// Verify a component's code before running it
const trusted = await verifyComponentCode(code, signature, publicKeyJwk)
if (!trusted) throw new Error('Component signature invalid')
```

`verifyComponentCode` uses the Web Crypto API (`Ed25519`). On Safari < 17, which does not support Ed25519, verification is skipped and `true` is returned with a console warning — components still render.

---

## API options

```ts
const headlo = createClient('anon-key', {
  apiUrl:      'https://api.headlo.com', // override for self-hosted or local dev
  getToken:    async () => myAuthProvider.getToken(),
  customFetch: (url, init) => fetch(url, init), // inject your own fetch (e.g. with caching)
})
```

---

## PROP — `createService`

PROP components and services are configured separately from the CMS client. Use `createService` — it has no anon key and is not connected to collections or records.

```ts
import { createService } from 'headlo'
```

### Keys

Two key types, two headers, never confused:

| Header | Format | Where | Purpose |
|---|---|---|---|
| `X-Headlo-Prop-Client-Id` | `cid_xxx` | Browser / `createService` | Identifies agency. Validated against `allowed_origins`. Safe to expose. |
| `X-Headlo-Prop-Secret` | `sk_xxx` | Server-side only | Identifies agency AND proves server context. Skips origin check. Never in browser code. |

Get your `cid_xxx` from **[headlo.com/dashboard/settings](https://headlo.com/dashboard/settings) → PROP Keys**. Generate and copy the client ID, set allowed origins for your domains.

For server-side calls, generate a `sk_xxx` in the dashboard and use `X-Headlo-Prop-Secret` — no client ID needed alongside it.

### Initialize once

```ts
// lib/prop.ts
import { createService } from 'headlo'

export const service = createService({
  clientId: import.meta.env.VITE_HEADLO_PROP_CLIENT_ID
})
```

```bash
# .env.production
VITE_HEADLO_PROP_CLIENT_ID=cid_xxx
```

```ts
import { service } from './lib/prop'

const { def, app } = await service.prop('headlo-auth-button').get()
// def.slug, def.framework, def.requires
// app.component_js — compiled React function component
```

### Domain allowlisting

The client ID is tied to a set of allowed origins. headlo-worker checks the `Origin` header on every call — requests from unregistered domains are rejected.

```
Settings → PROP Keys → cid_xxx → Allowed origins
  ✓ https://acme.com
  ✓ https://staging.acme.com
  ✓ http://localhost:3000
```

Someone copying your `cid_xxx` cannot use it from their own domain.

### Private prop server

```ts
const service = createService({
  clientId: 'cid_xxx',
  url:       'https://prop.acme.com'
})

const { def, app } = await service.prop('my-component').get()
// component defs from prop.acme.com — service calls go to prop.acme.com too
```

### Hybrid — private components, Headlo services

```ts
const service = createService({
  clientId:   'cid_xxx',
  url:        'https://prop.acme.com',
  serviceUrl: 'https://api.headlo.com'
})
```

### How service routing works

`serviceUrl` controls which server delivers the service client stub. The stub's methods are fetch calls baked with that server's base URL.

```
serviceUrl: 'https://api.headlo.com'  (default)
  → stub calls api.headlo.com/v1/prop/service/headlo-auth/v1/...
  → headlo-worker validates cid_xxx + Origin → bills the right agency

serviceUrl: 'https://prop.acme.com'  (private server)
  → stub calls prop.acme.com/v1/prop/service/headlo-auth/v1/...
  → your headlo-prop-server handles it
```

Pass the `service` instance to `useProp` in `headlo-react` to apply these settings inside a React app.

---

## TypeScript

All methods are fully typed. Import types as needed:

```ts
import type {
  CollectionRecord,
  CollectionFilter,
  ListOptions,
  HeadloResult,
  HeadloClient,
} from 'headlo'
```

`HeadloResult<T>` extends `T` with an `error` field — `null` on success, an `HeadloErrorCode` string on failure. Check `error` before using the result:

```ts
const { records, error } = await headlo.collection('posts').list()
if (error) {
  console.error('Failed to load posts:', error)
  return
}
// records is safe to use here
```

---

## License

[Elastic License 2.0](./LICENSE) — © Headlo Team

Source available. Free for internal use. You may not offer this software as a competing hosted or managed service. See [LICENSE](./LICENSE) for full terms.

Built by [Headlo](https://www.headlo.com).
