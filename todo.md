# Go Direct Allocation Agent - TODO

## Backend
- [x] Extensiv API client with OAuth token management (auto-refresh every 50-60 min)
- [x] Extensiv: fetch customers and facilities
- [x] Extensiv: fetch open orders (unallocated, non-hold) per customer
- [x] Extensiv: fetch inventory stock details per customer/facility
- [x] Extensiv: fetch item descriptions
- [x] Extensiv: POST inventory/mover (move inventory to staging)
- [x] Extensiv: PUT orders/{id}/allocator (allocate order)
- [x] Allocation engine: FEFO + location priority rules
- [x] Allocation engine: no partial allocation rule
- [x] Allocation engine: generate allocation summary, pull list, pack list
- [x] tRPC routers: extensiv config, customers, orders, inventory, allocation, run history, audit log

## Database Schema
- [x] extensiv_configs table (client_id, client_secret, tpl_guid, user_login_id, base_url)
- [x] location_configs table (customer_id, facility_id, location_id, location_name, location_type: staging/pick_face/warehouse)
- [x] allocation_runs table (run metadata, status, created_at)
- [x] allocation_run_items table (per-order allocation details)
- [x] audit_logs table (action, details, timestamp)

## Frontend
- [x] Dashboard layout with sidebar navigation (light/dark toggle)
- [x] Settings page: Extensiv API credentials configuration
- [x] Location configuration page: map location IDs to types per customer/facility
- [x] Order selection page: grouped by customer, checkboxes, Select All per customer
- [x] Allocation review screen: summary, pull list, pack list tabs
- [x] Confirm/Cancel workflow
- [x] Allocation run history page with audit log
- [x] Loading states and error handling throughout

## Testing
- [x] Unit tests for allocation engine (FEFO, location priority, no partial allocation, rollback)
- [x] Unit tests for auth logout

## Improvements
- [x] Redesign Order Selection with warehouse → customer → orders 3-step flow
- [x] Add facilities and customersForFacility tRPC endpoints
- [x] Fix nested anchor tag warnings in AppLayout, Home, RunHistory, RunDetail
- [x] Multi-customer allocation: select orders from multiple customers in one warehouse per run
- [x] Lot Mixing rule: per-customer toggle to prevent multiple lot codes on the same order line
- [x] PDF export: Pull List and Pack List download from Allocation Review screen
- [x] Scheduled auto-run: configurable cron schedule that runs all unallocated orders and sends a completion notification
- [x] Bug: "No warehouses found" on Order Selection screen - switched to /properties/facilities endpoint with fallback
- [x] Rename "Run Allocation" button to "Run Allocation Tool" throughout the app
- [x] Bug: "No customers found for this warehouse" - switched to /customers?facilityid= direct endpoint with fallback loop
- [x] Bug: Persistent "No customers found" - added API Diagnostics page to surface raw Extensiv responses
- [x] Bug fix: Customer fields mapped incorrectly - fixed to use readOnly.customerId and companyInfo.companyName with paginated fallback
