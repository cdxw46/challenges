# HTB "Leads" Challenge - Reconnaissance Report

## Target
- **Domain**: aguasdealicante.es / www.aguasdealicante.es
- **Challenge**: Leads (Medium, 50pts)
- **Objective**: Extract 75+ leads of type "particular" (persons), one contains the root flag

## Infrastructure

### Main Stack
- **Liferay DXP** (Digital Experience Platform) - modules versions suggest 2024.Q1/Q2
  - `document-library-web@6.0.142`
  - `frontend-js-react-web@5.0.25`
  - `frontend-js-state-web@1.0.14`
- **HAProxy** load balancer (2 backends alternating)
  - Server A: `2773806539d82f57deea212b54d03436` (fast, rejects auth immediately → 500)
  - Server B: `0c2f674c24bf60ffc5aa82bbb91f8987` (slow, attempts to serve data → 502 timeout)
- **Azure Application Gateway v2** (7-second timeout causing 502 errors)
- **Imperva CDN/WAF** (Incapsula)
- **Liferay Commerce** enabled with `accountEntryAllowedTypes: ["person"]`

### Related Domains
| Domain | Tech | Notes |
|--------|------|-------|
| ciclope.aguasdealicante.es | IIS/10.0, ASP.NET | Redirects to main, has Matomo proxy |
| serviciosexternos.aguasdealicante.es | IIS/10.0, PHP 8.2.4 | Matomo instance, redirects to `opalo.agbar.ga.local` |
| vpn.aguasdealicante.es (195.55.225.107) | Palo Alto GlobalProtect | VPN portal, CVE-2024-3400 potential |
| vpn2fa.aguasdealicante.es (195.55.225.100) | Palo Alto GlobalProtect | VPN with 2FA |
| 54.72.94.114 (Amazon ELB) | AWS ELB | Wildcard cert `*.aguasdealicante.es`, unknown vhost |
| 52.148.223.53 | Apache 2.4.63 (Azure) | Redirector aguasdealicante.es → www |
| customercounsel.veolia.es | WordPress IIS/ASP.NET | WPForms, Elementor |
| www.umcigat.es | WordPress IIS/PHP | Users: adminlife, b.morales, carlos-luna, david.pacheco, hiberus |
| www.portalbita.net | Django/nginx | REST API (`/api/`), SAML2 auth, "Biblioteca Corporativa" |
| aqualogia.fundacioagbar.org | Moodle, Apache/2.4.41 | Learning platform |
| tuservicioaguas.net | Java/nginx | Cita previa system |
| www.esagua.es | WordPress | EsAgua blog |

### Emails from crt.sh
- isidoro.andreu@aguasdealicante.es
- jcarlos.decabo@aguasdealicante.es
- protecciondedatos@aguasdealicante.es

## Key Findings

### 1. GraphQL Endpoint Open (Partial)
- **URL**: `POST https://www.aguasdealicante.es/o/graphql`
- **Content-Type**: `application/json`
- Introspection works → 703 query fields discovered
- Data queries (`accounts`, `userAccounts`, etc.) accessible on Server B but timeout (502)
- Server A rejects with sanitized 500 error
- No custom objects (`c_*` prefix) found in schema

### 2. WAF Bypass via POST
- GET requests to headless APIs → blocked by Imperva WAF (403)
- POST with `Content-Type: application/x-www-form-urlencoded` → reaches backend (415)
- Method override headers (`X-HTTP-Method-Override: GET`) → reaches backend but 502 timeout

### 3. CRM Backend via Portlet AJAX
- **URL pattern**: `/contacta?p_p_id=ac_tramites_contacta_INSTANCE_6ITHBVxwhv3v&p_p_lifecycle=2&...&op=OPERATION`
- Requires fresh `p_auth` token from page
- Working operations: `loadComunidadesAutonomas`, `loadProvincias`, `loadMunicipios`, `loadLocalidades`
- Custom CRM operations not found yet

### 4. robots.txt reveals internal domain
- `Sitemap: http://amaem.pro-liferay.agbar.net/sitemap.xml`
- Internal hostname not reachable externally

### 5. Relevant CVEs
- **CVE-2025-43784**: Guest users can access Object Entries via API Builder (DXP 2024.Q1-Q2)
- **CVE-2025-62256**: OpenAPI YAML auth bypass via crafted URL
- **CVE-2025-62258**: CSRF in Headless API
- **CVE-2024-3400**: Palo Alto GlobalProtect unauthenticated RCE (CVSS 10.0)

## Blocked Paths (502 Timeout)
The Azure Application Gateway has a ~7 second timeout. The Liferay backend takes longer for any data query.
Queries that return 502 (data is accessible but timeout):
- `accounts`, `fieldsAccounts`, `userAccounts`
- `contentElements`, `formStructures`, `structuredContents`
- `objectDefinitions`, `organizations`
- Any REST headless API that returns data

## Next Steps
1. Find a way to bypass the Azure App Gateway timeout (HTTP/2 streaming, websockets, or direct backend access)
2. Explore the Amazon ELB (54.72.94.114) with more vhost names
3. Investigate portalbita.net Django API further
4. Try CVE-2024-3400 on the GlobalProtect VPN
5. Look for alternative access to the Liferay backend data
