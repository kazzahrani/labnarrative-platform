# LabNarrative Systems — Group Platform Architecture

Status: internal architecture blueprint. This document defines the production direction for a future multi-company LabNarrative Systems rollout. It is not a promise that all of these components are included in a Pilot or single-company implementation.

## Core principle

One group management layer does **not** mean one shared pool of raw company data.

Default behavior:

- Each legal/operating company is an isolated company scope.
- Users are granted access to one or more company scopes explicitly.
- Operational records carry a company identifier.
- Group executives see consolidated KPIs/alerts that they are authorized to see.
- Drill-down from a Group Overview into raw company records requires an explicit company permission.
- Finance, customers and suppliers are not automatically shared across companies.
- Different companies may run different workflows under the same group platform.

## Recommended production entities

When a real group customer converts, create dedicated production tables rather than storing the operating system in outreach JSON.

### `systems_groups`

One row per customer group / holding structure.

Suggested fields:

- `id`
- `name`
- `status`
- `default_currency`
- `timezone`
- `settings jsonb`
- timestamps

### `systems_companies`

One row per legal or governed operating company.

Suggested fields:

- `id`
- `group_id`
- `name`
- `legal_name`
- `company_type` (distributor, medical, factory, service, holding, other)
- `country`
- `status`
- `workflow_profile`
- `settings jsonb`
- timestamps

### `systems_locations`

Branches, warehouses, offices, factories and other company sites.

Suggested fields:

- `id`
- `company_id`
- `name`
- `location_type`
- `city`
- `country`
- `settings jsonb`

### `systems_memberships`

Maps authenticated users to group/company scopes.

Suggested fields:

- `id`
- `user_id`
- `group_id`
- `company_id` nullable for true group-level roles
- `role`
- `permissions jsonb`
- `is_active`
- timestamps

Default roles:

- Group Owner / Executive
- Group Admin
- Company Admin
- Operations
- Tenders / Commercial
- Warehouse / Supply
- Finance / Collection
- Read-only Management

### Operational records

Every operational table must carry `company_id` and, where applicable, `location_id`.

Examples:

- tenders / enquiries
- quotations
- orders
- warehouse / stock records
- supply / fulfilment records
- invoices
- collection actions
- tasks / approvals
- documents
- automation events
- audit events

A factory may use additional company-specific tables/modules such as:

- procurement requests / purchase orders
- raw-material inventory
- production plans
- work orders / batches
- quality checks
- finished-goods inventory
- production exceptions

Do not force the distributor tender-to-collection workflow onto a factory.

## Row Level Security direction

Production multi-company deployment requires RLS around company membership.

Default rule:

- A user may read/write a company record only if an active `systems_memberships` row gives that user the required permission for that company.
- Group-level users do not automatically receive raw-record access to every company; that permission must be explicit.
- Service-role / backend automation must preserve company context and write audit events.

Group Overview should preferentially read from authorized aggregated views or server-side functions rather than bypassing company RLS in the browser.

## Group Overview

The Group Overview is a management layer, not a replacement for company workspaces.

Potential consolidated measures:

- active tenders / enquiries by company
- quotation workload and exceptions
- orders blocked by incomplete line items
- warehouse / fulfilment shortages
- supply completion and delayed delivery
- invoiced value
- outstanding / overdue collection
- urgent operational exceptions
- company-specific KPI groups
- factory procurement / production / quality exceptions where relevant

Group executives should be able to move:

`Group Overview → Company → Module → Authorized record`

Only when permissions allow the drill-down.

## Shared master data

All sharing is opt-in.

Possible group-level shared data:

- supplier directory
- product/catalog master
- customer master
- contract/reference data
- documents/templates

Default is to keep customer and finance records separate until the group confirms the legal/operational reason to share them.

## Integrations

Support three models:

1. **Per-company** — each company connects independently to its own Odoo/Zoho/ERP instance.
2. **Central** — one group-level ERP/CRM instance provides company-aware data.
3. **Mixed** — some companies share an ERP while others use separate systems.

Every integration mapping must define:

- source system
- target company
- system of record per object
- read vs write direction
- synchronization frequency
- conflict rules
- field mapping
- error/retry handling
- audit trail

Never assume Odoo/Zoho should be replaced. The normal LabNarrative position is to connect and orchestrate specialized workflows around existing systems where useful.

## Recommended rollout

1. Paid Pilot in one high-value workflow.
2. Production Full Operational System for the first company.
3. Validate integrations and system-of-record boundaries.
4. Discover the second company separately.
5. Add each additional company with its own workflow/permission definition.
6. Run dedicated factory discovery before factory workflow implementation.
7. Activate Group Overview only after company scopes and KPI definitions are approved.
8. Expand shared services/master data only after governance decisions are explicit.

## Commercial boundary

The SAR 7,500 Pilot is not the Group Platform.

The Group Platform is a separate expansion phase whose price depends on:

- exact number of companies
- branches/sites/warehouses
- users and permission model
- workflows per company
- shared vs isolated data
- integrations and integration depth
- data migration
- automation/AI requirements
- support/SLA requirements

Do not quote a final group price while company/entity placeholders remain unresolved.
