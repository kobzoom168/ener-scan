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
7. run scan
8. save history
9. reply via LINE flex

## Core Files
- src/app.js
- src/routes/lineWebhook.js
- src/handlers/scanFlow.handler.js
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