# Edelweiss Marketing Studio

Centro operativo de marketing de Edelweiss Pastry Shop (Biddeford, Maine), construido con Next.js 16. Incluye calendario editorial, solicitudes de material para el equipo, Meta Ads y email marketing.

## Funcionalidad

- `Stock & Production` en `/stock`: recuentos y cierre móvil, plan semanal, sugerencias explicadas de producción, encargos agregados, eventos, comparaciones y registro privado de facturas alimentarias. Uso y límites actuales en [docs/stock-operations.md](docs/stock-operations.md); contrato con la web en [docs/STOCK-PLANNING-SPEC.md](docs/STOCK-PLANNING-SPEC.md).

  La visita guiada inicial y **Help & guides** explican el módulo en inglés/español y ofrecen dos guías PDF privadas. `npm run test:stock:help` comprueba el recorrido y las descargas tras el build. Los PDF se regeneran con `scripts/generate-stock-guides.py` y el runtime Python documentado en ese script.

- Content Calendar mensual y semanal con filtros, ficha completa y acciones de crear, editar, duplicar, reprogramar y eliminar.
- Plan editorial de septiembre de 2026: 2 publicaciones de feed y 2–3 Stories por semana, con reutilización de material.
- `What we need from Edelweiss`: solicitudes sencillas pensadas para una sesión de 20–30 minutos cada dos semanas, sin exposición innecesaria.
- `Orders & requests`: pedidos web, encargos especiales y leads wholesale alimentados en tiempo real por n8n.
- Campañas `5,000 Followers Giveaway`, `Three Days Inside a Croissant`, contenido de comunidad, herencia suiza, otoño, backstage, wholesale, Surprise Bags y futura serie `The Edelweiss Story`.
- Adaptadores server-only para Brevo y Meta Insights, Sheets como fallback temporal, sincronización manual y cron diario.
- Los secretos solo se leen en servidor y nunca deben incluirse en Git.

## Desarrollo

```bash
npm install
npm run dev
npm run lint
npm run build
```

## Acceso privado obligatorio

Las páginas y APIs internas requieren una sesión firmada. En Vercel el login falla de forma segura con `503` si faltan credenciales o almacenamiento compartido del límite de intentos. Configurar por entorno:

```text
DASHBOARD_PASSWORD=         # contraseña larga y exclusiva del dashboard
DASHBOARD_SESSION_SECRET=   # secreto aleatorio de al menos 32 caracteres
DATABASE_URL=               # Postgres privado, también para el límite de login
```

No reutilizar contraseñas de otras cuentas. Cookies HttpOnly, SameSite y Secure en producción; cambiar contraseña revoca sesiones anteriores. El cron exige `CRON_SECRET` y no usa la sesión del navegador. El login compartido todavía no identifica empleados ni distingue permisos individuales.

## Persistencia del calendario

El CRUD usa Redis compatible con la API REST de Upstash/Vercel Marketplace. Sin estas variables, se muestra el calendario editorial versionado en modo lectura y la interfaz indica `configuración pendiente`; nunca utiliza `localStorage`.

```text
KV_REST_API_URL=             # o UPSTASH_REDIS_REST_URL
KV_REST_API_TOKEN=           # o UPSTASH_REDIS_REST_TOKEN
```

En Vercel: Storage/Marketplace → Upstash Redis → Connect Project → habilitar Preview y Production. No expongas estas variables con el prefijo `NEXT_PUBLIC_`.

## Brevo

The dashboard reads Brevo directly when `BREVO_API_KEY` is configured in Vercel. Set `BREVO_LIST_ID` to restrict subscriber metrics to the definitive newsletter list and optionally `BREVO_BIRTHDAY_ATTRIBUTE` if the birthday field is not named `DOB`. Campaign and contact requests run server-side; the API key is never exposed to the browser. When the API is unavailable, the `Brevo` Sheet tab remains the fallback.

Variables:

```text
BREVO_API_KEY=
```

Crear una API key dedicada en Brevo → SMTP & API → API Keys. La integración solo necesita lectura de campañas y estadísticas (`GET /v3/emailCampaigns`): enviados, entregados, aperturas y clics únicos, rebotes, bajas y quejas. Rota la key si se comparte fuera de Vercel.

## Google Sheet operativo definitivo

El fallback y los datos operativos usan exclusivamente [este Google Sheet](https://docs.google.com/spreadsheets/d/1Y0U5fpS8AnCU0iiQELSVyBxCHYbxMNrbeiJmaF4V77I/edit). Los nombres reales se respetan, incluidos sus espacios:

- `PRE_Orders ` (`gid=27254474`): pedidos añadidos automáticamente por n8n.
- `Special Orders` (`gid=1454652480`): encargos y eventos.
- ` Wholesale Inquiries` (`gid=150858658`): oportunidades wholesale.
- `Edelweiss-ADS-Campaigns-Aug-3-2026-Sep-1-2026` (`gid=341991106`): reporte temporal de Meta Ads.
- `Brevo` (`gid=651168549`): campañas, métricas y eventos de suscriptor/cumpleaños normalizados para n8n.

La pestaña `Brevo` usa `record_type=campaign` para envíos de los viernes y `record_type=subscriber` para altas o actualizaciones de contactos. Los booleanos `new_subscriber` y `birthday_provided` permiten construir métricas diarias sin guardar lógica en el dashboard.

## Meta Marketing API

Variables:

```text
META_ACCESS_TOKEN=
META_AD_ACCOUNT_ID=          # número o act_123; ambos se aceptan
META_API_VERSION=v23.0       # fijar la versión aprobada en Meta
```

Conectar mediante Meta Business Manager/OAuth o un System User de Business Manager. Nunca usar ni solicitar la contraseña personal de Facebook. Asignar únicamente la cuenta publicitaria de Edelweiss y permisos mínimos:

- `ads_read` para Insights.
- `business_management` solo si el flujo de Business Manager lo exige para descubrir/asignar activos.

La app consulta Insights por campaña y prepara gasto, alcance, impresiones, frecuencia, CPM, clics, CTR, CPC, resultados y coste por resultado. Para desglose por conjunto/anuncio se reutiliza el adaptador cambiando `level` a `adset` o `ad`; no se almacenan tokens en el cliente.

## Sincronización

- `POST /api/sync`: botón `Sync now`; hace hasta 3 intentos y devuelve fuente, hora, intentos y error legible por integración.
- `GET /api/sync?history=1`: últimas 30 sincronizaciones cuando Redis está conectado.
- `GET /api/cron/daily-sync`: ejecución diaria a las 10:15 UTC; `/api/cron/sync` conserva compatibilidad y ejecuta el mismo trabajo directamente.
- `CRON_SECRET`: Vercel lo envía como `Authorization: Bearer ...` al cron.
- Mientras falten credenciales, Brevo y Meta muestran configuración pendiente y Sheets continúa como fallback. No se generan métricas ficticias.

Variables:

```text
CRON_SECRET=                 # cadena aleatoria larga, solo servidor
```

## Despliegue seguro

1. Validar pruebas, build y preview con su configuración privada.
2. Integrar las ramas revisadas en `main`, respetando la revisión del propietario cuando se solicite.
3. Comprobar un checkout limpio de `main` y su coincidencia con `origin/main`.
4. Ejecutar exclusivamente `npm run deploy:production`; el script comprueba rama, estado y remoto.
5. Revisar acceso privado y estado de sincronización después del despliegue.

El proyecto Vercel autorizado es `prj_fkRlAC7VvWH76mrx1v32vQHQxofN`. La producción actual es <https://edelweiss-marketing-dashboard.vercel.app/>.

## Medios del sorteo

Los medios permanecen fuera del repo en:

```text
C:\STUDIOS-MEDIA\social\clientes\edelweiss\deliverables\2026-08-28-giveaway-5000
```

La ficha del calendario conserva la referencia. No se copian archivos pesados al repositorio.

## Login and Swiss Passport

All pages and internal APIs require the signed dashboard session (DASHBOARD_PASSWORD and DASHBOARD_SESSION_SECRET). Orders are fetched server-side from the definitive Sheet; no customer data is returned before authentication. Passport endpoints retain their original HMAC/Bearer contracts and unchanged secrets. See docs/swiss-passport.md.

## Production branch policy

Production must come from main, after merging and checking all relevant branches. Use npm run deploy:production, which rejects feature branches, dirty checkouts and HEAD different from origin/main. Do not deploy individual feature branches. The owner-authorized stock release was deployed on 2026-11-06 from integrated main; see [docs/stock-production-review.md](docs/stock-production-review.md) for evidence and verification limits.

See docs/merge-operations-passport.md for the conflict resolutions, verification evidence and production environment inventory.
