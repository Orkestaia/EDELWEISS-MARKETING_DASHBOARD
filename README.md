# Edelweiss Marketing Studio

Centro operativo de marketing de Edelweiss Pastry Shop (Biddeford, Maine), construido con Next.js 16. Incluye calendario editorial, solicitudes de material para el equipo, Meta Ads y email marketing.

## Funcionalidad

- Content Calendar mensual y semanal con filtros, ficha completa y acciones de crear, editar, duplicar, reprogramar y eliminar.
- Plan editorial de septiembre de 2026: 2 publicaciones de feed y 2–3 Stories por semana, con reutilización de material.
- `What we need from Edelweiss`: solicitudes sencillas pensadas para una sesión de 20–30 minutos cada dos semanas, sin exposición innecesaria.
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

## Persistencia del calendario

El CRUD usa Redis compatible con la API REST de Upstash/Vercel Marketplace. Sin estas variables, se muestra el calendario editorial versionado en modo lectura y la interfaz indica `configuración pendiente`; nunca utiliza `localStorage`.

```text
KV_REST_API_URL=             # o UPSTASH_REDIS_REST_URL
KV_REST_API_TOKEN=           # o UPSTASH_REDIS_REST_TOKEN
```

En Vercel: Storage/Marketplace → Upstash Redis → Connect Project → habilitar Preview y Production. No expongas estas variables con el prefijo `NEXT_PUBLIC_`.

## Brevo

Variables:

```text
BREVO_API_KEY=
```

Crear una API key dedicada en Brevo → SMTP & API → API Keys. La integración solo necesita lectura de campañas y estadísticas (`GET /v3/emailCampaigns`): enviados, entregados, aperturas y clics únicos, rebotes, bajas y quejas. Rota la key si se comparte fuera de Vercel.

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
- `GET /api/cron/sync`: ejecución diaria a las 10:15 UTC definida en `vercel.json`.
- `CRON_SECRET`: Vercel lo envía como `Authorization: Bearer ...` al cron.
- Mientras falten credenciales, Brevo y Meta muestran configuración pendiente y Sheets continúa como fallback. No se generan métricas ficticias.

Variables:

```text
CRON_SECRET=                 # cadena aleatoria larga, solo servidor
```

## Despliegue seguro

1. Configurar las variables en Preview.
2. Desplegar una preview y validar calendario, fichas, edición, `What we need`, sincronización y responsive.
3. Repetir las variables en Production solo tras validar.
4. Promover exactamente el artefacto validado con `vercel promote <preview-url>`.
5. Revisar logs de funciones después de la promoción.

El proyecto Vercel autorizado es `prj_fkRlAC7VvWH76mrx1v32vQHQxofN`. La producción actual es <https://edelweiss-marketing-dashboard.vercel.app/>.

## Medios del sorteo

Los medios permanecen fuera del repo en:

```text
C:\STUDIOS-MEDIA\social\clientes\edelweiss\deliverables\2026-08-28-giveaway-5000
```

La ficha del calendario conserva la referencia. No se copian archivos pesados al repositorio.
