<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Production deployment

Deploy production only from a clean main checkout containing the integrated feature branches. Never deploy an individual feature branch to production. Use npm run deploy:production; do not bypass its branch/remote checks. Show the merge review and wait for the owner approval when requested.
