# KisanShakti AI Shared Security Baseline — 2026-10-05

This document records the cross-application security baseline for the shared Supabase project.

## Architecture
- Tenant Portal: this application surface is isolated from the Farmer App and SaaS Admin source.
- Farmer App: custom farmer-auth session/PIN contract remains authoritative.
- SaaS Admin / Command Center: platform-admin controls remain separate.
- All three applications share the same Supabase/Postgres database; database RLS and Edge Functions are the authorization source of truth.

## Database security migrations applied
Canonical SQL migration history is maintained in the Tenant Portal security branch:
- 20261001000100_security_identity_and_farmer_credentials.sql
- 20261005130000_security_hardening_tenant_portal.sql
- 20261005134500_tenant_portal_rls_hardening.sql
- 20261005141000_public_surface_column_hardening.sql
- 20261005143000_api_key_security_hardening.sql
- 20261005145500_public_white_label_select_hardening.sql
- 20261005151500_anon_security_definer_lockdown.sql
- 20261005152500_public_security_definer_lockdown.sql
- 20261005154000_anon_plpgsql_surface_lockdown.sql
- 20261005160000_postgis_admin_function_lockdown.sql
- 20261005163000_cross_application_security_hardening.sql
- 20261005170000_shared_security_closure.sql
- 20261005172000_private_document_storage.sql
- 20261005174000_private_chat_attachments.sql
- 20261005175500_remove_unused_public_land_photos.sql
- 20261005181000_remove_legacy_broad_policies.sql

Do not replay production migrations from multiple repositories independently. The database remains a single SSOT.

## Current Edge security posture
- Current authenticated functions use verified caller identity and server-side tenant membership/role checks.
- Generic CRUD is allowlisted and tenant-bound.
- Payment finalization is server-authorized and idempotent.
- Sensitive legacy admin/payment/renewal functions were retired.
- Farmer chat media is private and served by signed URLs under the existing custom farmer-auth context.
- Central Authentication Service at https://auth.kisanshaktiai.in remains authoritative.

## Storage
Public: branding/assets/avatar/social/product/community where public presentation is intended.
Private: chat-attachments, crop-growth-media, land-images, land-photos, ndvi-rasters, ndvi-thumbnails, onboarding-documents, rag-documents, soil-reports, tenant-legal-docs, voice-recordings.

## Deployment rule
A code branch must pass its own lint/build/security CI before deployment. Never disable the security checks to obtain a green build.
