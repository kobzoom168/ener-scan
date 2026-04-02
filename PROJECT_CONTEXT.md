# Ener Scan Project Context

## Stack
- Node.js
- Express
- LINE OA
- Supabase

## Architecture
- routes -> handlers -> services -> stores

## Main Flow
1. user sends image
2. runtime guard (burst / multi-image)
3. validate image
4. save pending image in session
5. ask birthdate
6. validate birthdate
7. enqueue async scan (scan_jobs / workers)
8. save history (worker)
9. deliver result via LINE (outbound_messages / delivery worker)

## Core Files
- src/app.js
- src/routes/lineWebhook.js
- src/workers/scanWorker.js
- src/workers/deliveryWorker.js
- src/services/*
- src/stores/*

## Runtime Concepts
- flowVersion
- scanJobId
- image burst window
- waiting_birthdate state

## Constraints
- 1 image per case
- duplicate protection
- multi-image protection

## Deep scan (OpenAI)
- Layer 1: `gpt-4.1-mini` → draft (fixed format) — `src/services/openaiDeepScan.api.js` + `src/prompts/deepScan.prompt.js`
- Layer 2 (optional): `gpt-4o` rewrite — `ENABLE_DEEP_SCAN_REWRITE=true` in env; orchestration `src/services/deepScan.service.js`
- Format check: `src/services/deepScanFormat.service.js`
- Cache key version: `SCAN_CACHE_PROMPT_VERSION` in `src/stores/scanResultCache.db.js` (bump when prompt/pipeline changes)