# Edelweiss Marketing Atelier

Centro operativo de marketing de Edelweiss Pastry Shop: calendario editorial, solicitudes de material para el equipo, campañas y rendimiento de Meta Ads y Brevo.

## Estado

- Next.js 16.2.1, React 19 y Tailwind CSS 4.
- Calendario mensual/semanal, filtros, CRUD, duplicado, reprogramación y ficha editorial completa.
- Vista `What we need from Edelweiss`, diseñada para pedir a Alex y Valentina el mínimo trabajo posible.
- PostgreSQL para calendario, campañas, históricos y estado de sincronización.
- Brevo API y Meta Marketing Insights API ejecutadas exclusivamente en el servidor.
- Instagram Analytics preparado para snapshots de cuenta/publicaciones y recomendaciones con umbral de muestra.
- Operations Inbox preparado para unificar pedidos Clover y peticiones especiales sin reemplazar el checkout existente.
- Google Sheets se mantiene como fallback de los dashboards existentes.
- Cron diario a las 10:15 UTC mediante Vercel Cron.

La app no simula persistencia. Sin `DATABASE_URL`, muestra el plan editorial inicial en modo lectura y un aviso de configuración pendiente; crear, editar y eliminar quedan bloqueados.

## Desarrollo local

```bash
npm install
copy .env.example .env.local
npm run dev
```

Validación:

```bash
npm run lint
npm run build
```

## Arquitectura

- `src/components/ContentCalendar.tsx`: calendario, filtros, ficha y lista de material.
- `src/lib/editorial-seed.ts`: campañas y plan inicial idempotente.
- `src/lib/db.ts`: esquema y repositorio PostgreSQL server-only.
- `src/lib/sync.ts`: clientes Brevo/Meta con timeout y tres intentos controlados.
- `src/lib/instagram-analytics.ts`: normalización de Insights y recomendaciones basadas en muestra real.
- `src/app/api/content/route.ts`: mutaciones del calendario.
- `src/app/api/sync/route.ts`: sincronización manual.
- `src/app/api/cron/daily-sync/route.ts`: sincronización diaria protegida por `CRON_SECRET`.
- `src/lib/data.ts`: fallback de Google Sheets existente; no eliminar hasta validar las APIs.
- `src/components/OperationsInbox.tsx`: resumen operativo de pedidos, recogidas y solicitudes.
- `docs/ORDERS-INTEGRATION.md`: frontera de integración y datos que necesitamos del proyecto de preorder/n8n.

El esquema se crea de forma idempotente al primer uso. Incluye `content_items`, `campaigns`, `sync_runs`, `marketing_snapshots` y `operations_items`. Los snapshots usan una clave única por proveedor, elemento, fecha y nivel para que repetir una sincronización no duplique históricos.

## Variables de entorno

Todas son server-only. Ninguna debe llevar el prefijo `NEXT_PUBLIC_`.

| Variable | Secreta | Obligatoria | Uso |
|---|---:|---:|---|
| `DATABASE_URL` | Sí | Para escritura/sync | Conexión PostgreSQL con SSL (Vercel Marketplace/Neon u otro proveedor) |
| `CRON_SECRET` | Sí | Para cron | Vercel la envía como `Authorization: Bearer …` |
| `DASHBOARD_WRITE_SECRET` | Sí | Defensa adicional | Autoriza mutaciones server-to-server sin `Origin`; no sustituye la autenticación de usuarios |
| `BREVO_API_KEY` | Sí | Para Brevo | Header `api-key` de Brevo v3 |
| `META_ACCESS_TOKEN` | Sí | Para Meta | Token de usuario del sistema o token de larga duración |
| `META_AD_ACCOUNT_ID` | No sensible, pero privada | Para Meta | ID numérico; `act_` es opcional |
| `META_GRAPH_API_VERSION` | No | Para Meta | Versión fijada, por ejemplo la versión vigente validada en Meta |
| `META_PAGE_ID` | No sensible, pero privada | Para Instagram | Página de Facebook vinculada a Edelweiss |
| `INSTAGRAM_BUSINESS_ACCOUNT_ID` | No sensible, pero privada | Para Instagram | ID de la cuenta profesional `@edelweissmaine` |
| `META_APP_ID` | No es secreto | Solo gestión de tokens | ID de la app Meta |
| `META_APP_SECRET` | Sí | Solo gestión de tokens | Nunca llega al navegador ni se necesita para la lectura diaria con un token ya emitido |

Añadirlas en Vercel: Project → Settings → Environment Variables. Activar primero Preview/Development; Production solo después de validar. No usar `.env`, `.env.production` ni GitHub para secretos. `.env.local` ya está ignorado por Git.

## Configuración manual pendiente

### 1. Proyecto y Preview de Vercel

La copia local está vinculada a `orkesta-automation/edelweiss-marketing-dashboard`, ID `prj_fkRlAC7VvWH76mrx1v32vQHQxofN`. Existe un Preview validado; producción no se ha modificado. `.vercel/project.json` es configuración local ignorada por Git y no debe editarse manualmente.

### 2. Base de datos

1. En Vercel Marketplace, crear/conectar un PostgreSQL administrado (Neon es la opción simple).
2. Vincularlo al proyecto y comprobar que crea `DATABASE_URL`.
3. Aplicar primero a Preview y Development.
4. Abrir una Preview: el primer acceso crea el esquema y carga el plan inicial sin duplicados.

### 3. Brevo

1. Brevo → nombre de cuenta → SMTP & API → API Keys → crear una clave v3 dedicada, de solo uso de este dashboard.
2. Guardarla como `BREVO_API_KEY` en Vercel. Es secreta.
3. No requiere OAuth ni callback para este uso server-to-server.
4. El endpoint usado es `GET /v3/emailCampaigns`, con campañas enviadas y `globalStats`. Incluye enviados, entregados, aperturas/vistas, aperturas únicas, clics/clics únicos, bajas y rebotes cuando Brevo los proporciona. Ingresos no forman parte de la estadística estándar de campañas; solo se mostrarán si existe tracking transaccional/e-commerce real.

### 4. Meta Marketing API

1. En Meta for Developers, crear o usar una Business App asociada al Business Manager de Edelweiss.
2. En Business Settings, crear un System User, asignar la cuenta publicitaria y generar un token de larga duración para esa app.
3. Conceder `ads_read` para lectura de Insights. `read_insights` puede ser necesario según el activo/configuración. No conceder `ads_management` si el dashboard solo lee datos.
4. Guardar el token en `META_ACCESS_TOKEN` y el ID de la cuenta en `META_AD_ACCOUNT_ID`.
5. Fijar la versión vigente en `META_GRAPH_API_VERSION` después de comprobarla en el panel de la app.
6. No se necesita callback OAuth para un System User token. Si se cambia a OAuth de usuario, crear primero una ruta callback específica y registrar exactamente su URL de Preview/Production; esta implementación no inventa una URL que aún no existe.

La sincronización solicita nivel anuncio y conserva campaña, conjunto, anuncio, gasto, alcance, impresiones, CPM, clics, CTR, CPC, frecuencia, acciones/resultados y costes por acción por día. La comparación de periodos se calcula sobre los snapshots, no mediante datos inventados.

### 5. Validación y salida a producción

1. Crear una Preview, nunca producción primero.
2. Abrir `Data sync`, ejecutar `Sync now` para ambos proveedores y comparar al menos 30 días contra Sheets.
3. Verificar zonas horarias: calendario editorial en ET; el cron se expresa en UTC.
4. Probar CRUD, duplicado, reprogramación, entrega de material y navegación en 390 px, 768 px y escritorio.
5. Fechas confirmadas del sorteo: cierre el 8 de septiembre a las 11:59 PM ET y anuncio del ganador el 10 de septiembre.
6. Solo entonces activar variables de Production y desplegar.

## Acceso y seguridad

El dashboard exige login por contraseña y cookie firmada. Las páginas y APIs internas comprueban la sesión; el cron conserva CRON_SECRET y Passport usa sus secretos propios. Configura DASHBOARD_PASSWORD y DASHBOARD_SESSION_SECRET antes de usarlo. La actualización de seguridad de Next.js queda pendiente por decisión del propietario; consulta docs/swiss-passport.md.

## Fuentes oficiales

- [Brevo: listar campañas y estadísticas](https://developers.brevo.com/reference/get-email-campaigns)
- [Brevo: informe de una campaña](https://developers.brevo.com/reference/get-email-campaign)
- [Meta Marketing API Insights](https://developers.facebook.com/docs/marketing-api/insights/)
- [Vercel Cron Jobs](https://vercel.com/docs/cron-jobs)
- [Vercel Environment Variables](https://vercel.com/docs/environment-variables)

## Continuidad de la integración Meta

El estado exacto, los activos identificados y el procedimiento seguro para continuar están documentados en [`docs/META-INSTAGRAM-SETUP.md`](docs/META-INSTAGRAM-SETUP.md). La integración está pausada en la verificación de contraseña necesaria para terminar de crear la nueva app; no se debe reutilizar ni modificar la Conversions API existente.

## Swiss Passport

The dashboard now includes protected administration, signed order ingestion, personal card reads and atomic reward redemption. Setup, API contracts, the owner-approved single-passport rule, tests and a signed curl example are documented in [docs/swiss-passport.md](docs/swiss-passport.md). Configure the new server-only variables in .env.example before use. No production deployment is included.
