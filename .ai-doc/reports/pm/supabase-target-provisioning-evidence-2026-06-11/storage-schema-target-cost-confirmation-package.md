# AI_PDM Storage Schema Target Cost Confirmation Package

Generated at: 2026-06-11T04:21:45.072Z
Package version: storage-schema-target-cost-confirmation-package/v1

## Summary

- Status: ready_for_user_cost_confirmation
- Organization ID: igzdpafkvqqpsyadmage
- Target name: AI_PDM_STAGING
- Region: ap-southeast-1
- Preferred resource: project

## Cost Evidence

- Project: available=true, amount=0, recurrence=monthly
- Branch: available=true, amount=0.01344, recurrence=hourly

## Guardrails

- Evidence only: true
- No Supabase confirm cost called: true
- No Supabase project created: true
- No Supabase branch created: true

## Next Actions

- Repeat to the user: creating a Supabase project for AI_PDM_STAGING costs 0 monthly
- Ask the user to explicitly confirm they understand the cost before calling Supabase confirm_cost
- After explicit confirmation, use Supabase confirm_cost and then create the project or branch through the connector

## User Confirmation Text

Please confirm you understand creating the Supabase project target "AI_PDM_STAGING" in organization "igzdpafkvqqpsyadmage" costs 0 monthly.

