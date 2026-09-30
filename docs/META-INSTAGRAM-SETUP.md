# Meta Ads e Instagram — runbook de conexión

Última actualización: 31 de agosto de 2026.

## Estado actual

La configuración queda pausada en la confirmación final para crear la app `Edelweiss Marketing Dashboard`. Meta solicita que Valentina J Correa Weissenfluh vuelva a introducir la contraseña de su propio perfil.

No se debe intentar evitar este control. Valentina debe introducirla personalmente o debe concederse acceso individual a Aitor desde su propio perfil de Meta. La contraseña, códigos SMS, códigos 2FA, cookies y tokens nunca deben compartirse por chat, correo, capturas ni archivos del repositorio.

En el asistente se ha seleccionado:

- Nombre: `Edelweiss Marketing Dashboard`.
- Correo de la app: `info@edelweissconfections.com`.
- Caso de uso: crear y gestionar anuncios con Marketing API.
- Portfolio: `Edelweiss Confections`.
- Estado del portfolio: no verificado.
- La app todavía no debe considerarse creada hasta completar la contraseña y confirmar que aparece en `My Apps` y en Business Settings.

## Activos confirmados

| Activo | Nombre | ID |
|---|---|---|
| Portfolio empresarial | Edelweiss Confections | `3893422442238511` |
| Página de Facebook | Edelweiss Pastry Shop | `100541451843239` |
| Instagram profesional | `@edelweissmaine` | `17841443076772214` |
| Cuenta publicitaria | Edelweiss ADS | `1598273171488951` |
| Dataset/píxel observado | Edelweiss Pastry shop | `1230404965197755` |

Instagram está conectado a la Página. Página, Instagram y cuenta publicitaria están dentro del mismo portfolio.

El píxel recibe eventos reales de `PageView`, `AddToCart`, `InitiateCheckout` y `Purchase`.

## Integración que no se debe modificar

Ya existen:

- `Conversions API Application`.
- `Conversions API System User` (`61588094330484`).

Están asignados a píxeles y datasets y probablemente sostienen la Conversions API existente. No revocar tokens, retirar activos, cambiar permisos ni reutilizar ese System User para el dashboard.

## Reanudación segura

### Opción recomendada: Valentina completa la verificación

1. Valentina abre personalmente la sesión que quedó en Meta for Developers.
2. Comprueba que la URL pertenece a `developers.facebook.com`.
3. Introduce su propia contraseña y completa el 2FA si aparece.
4. No guarda ni comparte la contraseña con Aitor.
5. Al finalizar, comprueba que `Edelweiss Marketing Dashboard` aparece en `My Apps`.
6. Anota el App ID. El App ID no es secreto.
7. No muestres ni copies todavía el App Secret.

### Alternativa correcta: acceso individual para Aitor

1. Business Settings → Users → People → Add.
2. Invitar el perfil/correo empresarial de Aitor.
3. Activar 2FA en el perfil de Aitor.
4. Asignar únicamente los activos necesarios y permisos de consulta.
5. Añadir Aitor como desarrollador o administrador de la nueva app desde App Roles cuando la app exista.
6. Aitor continúa usando su propia contraseña.

No crear un perfil personal falso y no utilizar una identidad compartida.

## Pasos después de crear la app

Detenerse y revisar cada pantalla antes de activar permisos adicionales.

1. En App Dashboard, registrar:
   - App ID.
   - Business portfolio correcto.
   - Versión vigente de Graph API.
   - Estado Development/Live.
2. Añadir o confirmar el producto/caso de uso de Marketing API.
3. Añadir Instagram Graph API o el caso de uso de Instagram Insights que ofrezca el panel vigente.
4. En Business Settings → Accounts → Apps, comprobar que la nueva app pertenece a `Edelweiss Confections`.
5. Crear un System User nuevo:
   - Nombre: `Marketing Dashboard API`.
   - Tipo: Employee, no Admin, salvo que Meta impida técnicamente la asignación mínima.
6. Asignar al System User:
   - Cuenta publicitaria: consultar rendimiento.
   - Página: ver contenido e Insights.
   - Instagram: ver contenido e Insights.
   - Nueva app: permiso suficiente para generar el token.
7. No asignar píxeles/datasets inicialmente. Se incorporarán solo si hace falta consultar conversiones y se puede hacer sin afectar la CAPI existente.
8. Generar un token para la nueva app con los permisos mínimos disponibles para el flujo elegido:
   - `ads_read`.
   - `instagram_basic`.
   - `instagram_manage_insights`.
   - `pages_show_list`.
   - `pages_read_engagement`.
9. No seleccionar:
   - `ads_management`.
   - `pages_manage_posts`.
   - `instagram_content_publish`.
   - `instagram_manage_comments`.
   - `instagram_manage_messages`.
10. Si Meta ofrece nombres de permisos distintos, detenerse y contrastarlos con la documentación oficial de la versión vigente antes de aceptar.

## Almacenamiento de credenciales

Variables previstas:

```env
META_APP_ID=
META_APP_SECRET=
META_ACCESS_TOKEN=
META_AD_ACCOUNT_ID=1598273171488951
META_PAGE_ID=100541451843239
INSTAGRAM_BUSINESS_ACCOUNT_ID=17841443076772214
META_GRAPH_API_VERSION=
```

- Secretas: `META_APP_SECRET` y `META_ACCESS_TOKEN`.
- No secretas, aunque deben tratarse como configuración interna: IDs y versión de API.
- Nunca usar el prefijo `NEXT_PUBLIC_` para tokens o App Secret.
- Guardar localmente en `.env.local` y en Vercel Environment Variables.
- No pegar secretos en este documento, GitHub, issues, capturas o chat.

El App Secret puede no ser necesario para las lecturas diarias si se usa un token válido de System User. No se almacenará por defecto sin una necesidad concreta.

## Validación antes de programar sincronizaciones

Realizar llamadas de solo lectura y comprobar, en este orden:

1. Identidad del token y fecha de expiración.
2. Acceso a la cuenta publicitaria.
3. Acceso a campañas e Insights sin capacidad de escritura.
4. Acceso a Página e Instagram vinculados.
5. Lectura de métricas de cuenta y publicaciones.
6. Comparación de 30 días contra Ads Manager e Instagram Insights.
7. Guardado de snapshots diarios en PostgreSQL.
8. Solo después, habilitar cron y Production.

## Métricas previstas

### Meta Ads

- Gasto, alcance, impresiones, frecuencia, CPM, clics, CTR y CPC.
- Resultados y coste por resultado.
- Campaña, conjunto y anuncio.
- Acciones/conversiones informadas por Meta.
- Comparaciones contra el periodo anterior.

### Instagram

- Seguidores actuales y snapshots diarios de crecimiento.
- Alcance, visualizaciones e interacciones de cuenta.
- Visitas al perfil y clics disponibles.
- Rendimiento por Reel, carrusel, post y Story.
- Reproducciones, guardados, compartidos, comentarios y likes.
- Tiempo de visualización/retención cuando el endpoint y el tipo de contenido lo permitan.

Meta puede modificar o retirar métricas entre versiones. El dashboard debe mostrar `no disponible` cuando una métrica no exista; nunca estimarla como si fuera un dato de la API.

## Seguridad y cumplimiento

- API oficial de Meta exclusivamente; ningún scraping.
- No automatizar follows, likes, comentarios o mensajes.
- No publicar contenido desde la API en la primera fase.
- Permisos mínimos y separados de la Conversions API existente.
- 2FA para personas con control total.
- Accesos individuales, nunca contraseñas compartidas.
- Registrar fecha de generación, expiración y última validación del token.
- Revocar únicamente el token del dashboard si hay un incidente; no tocar tokens de CAPI.

## Dependencias todavía pendientes

- Completar la creación de la app.
- Confirmar o completar la verificación empresarial cuando Meta la solicite.
- Crear el System User separado y el token de lectura.
- Configurar PostgreSQL mediante `DATABASE_URL` para históricos.
- Proteger el dashboard con autenticación antes de permitir mutaciones en producción.
- Crear una Preview y validar antes de desplegar Production.

## Trabajo que puede continuar sin autorización de Meta

Completado en el código:

- Módulo visual independiente de Instagram.
- Estado explícito de autorización pendiente.
- Sincronizador server-only para cuenta y hasta 50 publicaciones recientes.
- Tolerancia a métricas no disponibles según versión/tipo de contenido.
- Snapshots diarios de seguidores, cuenta y publicaciones.
- Recomendaciones únicamente desde cuatro piezas medidas; etiqueta `reliable` solo desde diez.
- Instagram incluido en sincronización manual y cron diario.

Sin `META_ACCESS_TOKEN` no se ejecuta ninguna llamada ni se muestran datos inventados.
