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
- [x] Bug: facilityId mismatch fixed - Extensiv ignores facilityid param; now filters client-side using embedded facilities array on each customer record
- [x] Bug: Still no customers showing - added debugSummary endpoint + improved fetchAllFacilities with customer-embedded facilities fallback
- [x] Bug: "No open, unallocated orders" — relaxed status filter to include status 0/1/2, added debugOrders endpoint + order diagnostics table in API Diagnostics page
- [x] Bug: No orders showing for any customer in Reno — fixed by removing facilityid from /orders/summaries query and filtering client-side; added facility ID comparison in debugOrders table
- [x] Bug: Orders still not showing — root cause: /orders uses RQL syntax not query params; fixed to use rql=readonly.customerIdentifier.id==X on /orders endpoint instead of customerid= on /orders/summaries
- [x] Feature: Auto-populate Reno location config from inventory export — parse pick face prefixes (HR###, BIG###, BP###) and warehouse locations (D-017-C) per customer, seed DB without manual entry
- [x] Feature: Add customer multi-select step between warehouse and orders in allocation wizard — only fetch orders for selected customers to improve load time
- [x] Feature: Auto-populate Reno location config from inventory export — seed pick face (HR###/BIG###/BP###) and warehouse (D-###-#) locations per customer
- [x] Branding: Rename app to "GD Allocation Wizard" (remove "Agent"), upload and display Go Direct logo in sidebar
- [x] Bug: 503 on /inventory/stockdetails — fixed: added validateStatus to client.get, fetchInventory now tries 4 endpoints in order with fallback; added debugInventory endpoint + UI
- [x] Bug: Staging locations not recognized — fixed: seedFromExtensiv now detects -Stage suffix and classifies as staging type, matched to customer by prefix
- [x] Feature: Quick Allocate button on order selection screen — added quickPropose endpoint, ⚡ Quick Allocate All + Quick Allocate (N clients) buttons on warehouse cards, Quick Allocate button on clients step, last-used facility+clients persisted in localStorage
- [x] Bug: 400 error on GET /properties/facilities/locations — fixed: now tries facility-scoped URL /properties/facilities/{id}/locations first, falls back to global collection with client-side filter; removed broken RQL filter
- [ ] Redesign: Simplify Location Config — staging is one temporary location per customer (not warehouse mapping); auto-populate should just ask for staging location name per customer (e.g. HR-Stage, BIG-Stage, BP-Stage)
- [x] Allocation engine: pallet-aware logic — aggregate SKU demand across all orders, pick face first, full pallet from warehouse when needed, surplus back to pick face
- [x] Pull list: split into two sections — "Move to Staging" and "Pallet Replenishment → Pick Face"
- [x] DB schema: add pullList JSON column to allocation_runs for run-level pull list storage
- [x] Tests: updated engine tests to cover all pallet scenarios (pick face sufficient, pallet pull with surplus, multi-order aggregation, multi-pallet, rollback)
- [x] Bug: Staging location detection fails for ONCO-Staging, BOBA-staging, KGP-staging — fixed: seedFromExtensiv now accepts both -Stage and -Staging suffixes (case-insensitive); updated UI help text to match
- [x] Bug: Allocation insert fails — fixed: skipped orders now pass {} instead of null for allocationDetail; added chunked inserts (50/batch); fixed fetchOrderWithDetail to extract orderItems from HAL _embedded when not present directly
- [x] Feature: Per-order unallocation — Extensiv deallocateOrder API call, unallocated status in DB (schema migrated), Unallocate button in Order Summary tab on confirmed runs, unallocated orders panel
- [x] Bug: allocation_run_orders insert — confirmed working via direct test; root cause was published site running old code; all fixes in latest checkpoint
- [x] Bug: All ONCO orders skipped "Order has no line items" — fixed: OrderSelection/quickPropose/autoRun now use parseInt(referenceNum) as Extensiv internal order ID; robust HAL _embedded parsing added
- [x] Bug: fetchOrderWithDetail returns 404 — CRITICAL FIX: reverted order ID mapping; readOnly.orderId IS Extensiv's internal ID (e.g. 19069850), referenceNum IS the customer's ref (e.g. "3214839"); all three files (OrderSelection, routers quickPropose, autoRun) now correctly use o.readOnly.orderId for API calls
- [x] Feature: Delete Run button on Run History page — delete allocation run and its child run_orders from DB, with confirmation dialog; available for all run statuses
- [x] Bug: orderId/referenceNum still swapped — DEFINITIVE FIX: Extensiv API returns referenceNum=internal ID (e.g. 19069850), readOnly.orderId=customer ref (e.g. 3214839); engine.ts, OrderSelection.tsx, routers.ts quickPropose, and autoRun.ts all now use parseInt(referenceNum) for API calls; tests updated to match
- [x] Bug: fetchOrderWithDetail still returns 404 — RESOLVED: readOnly.orderId IS the Extensiv Transaction ID (e.g. 3214839) used in API URL /orders/{id}; referenceNum (e.g. "19069850") is the client's internal order number for display only. All API calls reverted to use readOnly.orderId.
