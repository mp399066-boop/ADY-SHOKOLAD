# Security Baseline

You are working on a private CRM system with sensitive business/customer data.

Use these rules as lightweight guardrails only.
Do not over-refactor.
Do not block normal development.
Do not ask for confirmation for every safe edit.
Keep changes targeted and minimal.

## Protect secrets
- Never put API keys, Supabase service role keys, webhook secrets, tokens, or credentials in frontend code.
- Never print secrets in console logs.
- Use environment variables only on the server.

## Supabase safety
- SUPABASE_SERVICE_ROLE_KEY may only be used in server routes, server utilities, or Edge Functions.
- Never expose service-role logic to client components.
- Do not bypass RLS unless there is a clear server-side reason.

## API route safety
- Validate all input from request bodies, query params, route params, and webhooks.
- Do not trust client-provided user IDs, prices, totals, roles, payment status, invoice status, or delivery status.
- Sensitive status changes must be checked server-side.

## Webhook safety
- Verify webhook secrets/signatures where applicable.
- Webhook handlers must be idempotent.
- Before inserting records from webhooks, check for existing records by stable external IDs.

## SQL safety
- Do not build raw SQL by string concatenation with user input.
- Prefer Supabase query builder or parameterized SQL.
- Do not expose raw database errors to users.

## File/upload safety
- Store private files in private buckets.
- Store storage paths in DB, not public URLs, unless intentionally public.
- Use signed URLs for private files.
- Do not use user-provided filenames as trusted paths.

## Logging safety
- Logs are allowed and encouraged, but never log secrets, full tokens, private document contents, full payment data, or private customer details.
- Logs should include safe context only: route, order id, status, external id, error code.

## Scope control
- Do not refactor unrelated modules.
- Do not change business logic unless needed for the requested task.
- Keep changes targeted and minimal.

## Before finishing any task that touches API/auth/payments/files/webhooks
- confirm no secrets were exposed
- confirm service_role is server-only
- confirm inputs are validated
- confirm user-facing errors are safe
- run npm.cmd run build
- summarize changed files and security-sensitive notes

Important:
Do not run broad audits.
Do not scan/refactor the app.
Only create/move this instruction file, build, commit, and push.
