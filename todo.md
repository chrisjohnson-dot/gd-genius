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
- [x] Bug: HAL _embedded items not extracted — FIXED: correct HAL rel key is http://api.3plCentral.com/rels/orders/item (not /orders/orderitem); added as first key in extraction loop
- [x] Bug: DB insert fails runId — FIXED: Drizzle MySQL2 returns [ResultSetHeader, ...] array; updated createAllocationRun to extract insertId from array[0] correctly; all 3 ONCO orders now allocate and save successfully
- [x] Bug: HR400 location classified as "warehouse" — FIXED: added inferLocationTypeFromName() helper in engine; pattern [2 letters][digits] (e.g. HR400) auto-classifies as pick_face; all other unmapped locations remain warehouse
- [x] Bug/Feature: Confirm flow does not allocate in Extensiv — FIXED: (1) pull list moves now read from run.pullList (global, not per-order); (2) removed hanging updateOrderProposedAllocations PUT step; (3) confirm now moves inventory to staging then calls allocateOrder directly; all 3 ONCO orders confirmed success=true in Extensiv
- [x] Bug/UX: Unallocate button not visible — FIXED: RunDetail.tsx now shows orange Unallocate button for each allocated order on confirmed runs; accessible directly from Run History → View Run
- [x] Feature: Quick Allocate warehouse tabs — FIXED: warehouse card now has expandable Quick Allocate section with customer checkboxes (pre-selected from last-used); user can de-select any customers before running; shows "Quick Allocate (N clients)" count
- [x] UX: After confirming allocation, no way to view summary/pull list/pack list from Run History — FIXED: RunDetail.tsx now has Pull List, Pack List, Order Summary, and All Orders tabs with PDF export links; Unallocate buttons on confirmed runs; accessible from Run History → View Run
- [x] Bug: Move to staging fails — FIXED: Extensiv mover API requires destination.nameKey.name; updated moveInventory() to accept destinationLocationName and include it in request body; confirm flow and autoRun both updated to pass location name from pull list entries; autoRun also fixed to use global pull list and skip hanging updateOrderProposedAllocations step
- [x] Feature: Unallocate moves inventory back to source locations — after deallocating in Extensiv, call inventory/mover to move products from staging back to their original pick face / warehouse locations using the stored pull list
- [x] UX: Flip order number display — Go Direct Transaction ID (readOnly.orderId, e.g. 3214839) should be the bold primary label; customer reference (referenceNum, e.g. "19069850") should be the smaller secondary label
- [x] Feature: Show total line items and total pieces on each order row in the allocation sheet / order selection screen
- [x] Bug: Unallocate button missing from RunDetail — restored; default tab changed to Order Summary so button is immediately visible
- [x] Bug: Order detail badges (line items, total pieces) not showing — fixed; fetchOpenOrders now requests detail=all+itemdetail=all so orderItems are included in list response
- [x] Bug: Export PDF blank — fixed; pull list now reads from run.pullList (global), pack list reads from per-order allocationDetail.packListItems
- [x] Feature: "Print Work Files" button added to RunDetail header for confirmed and proposed runs
- [x] Feature: Pack list PDF — per-order pages with order header, Code 128 barcode for orderId, and items table
- [ ] Feature: Allocation Rules page — per-client expandable cards with location priority patterns, lot mixing toggle, and notes
- [ ] Feature: Location priority patterns — ordered list of prefix/regex patterns per client per facility; engine uses pattern rank to sort candidate locations before FEFO
- [ ] Feature: Wire allocation rules into engine — pass customer rules to allocator so location priority patterns are respected at run time
- [x] UX: Remove Active Rules banner from Order Selection orders step
- [x] Bug: AllocationRules page crash (localeCompare on undefined customerName) causing order loading to fail — fixed with null-guard in sort comparator
- [x] UX: Filter out VACANT/TEST customers from Allocation Rules page with a toggle to show/hide them
- [x] Bug: Orders not loading on Order Selection page — fixed: added RQL status filter to reduce payload, 60s timeout on axios, error state in UI
- [x] Bug: Infinite loading spinner for Hammer Care orders in Calgary warehouse — fixed: RQL now pre-filters to open/unallocated orders only, axios timeout added, error state shown instead of infinite spinner
- [x] UX: Add line count and total pieces badges to each order row in Order Selection page — fixed HAL normalization in fetchOpenOrders so orderItems are populated from _embedded
- [x] Feature: Wire locationPriorityPatterns from customer_rules into allocation engine (propose + autoRun) — already wired; added 5 unit tests confirming ^12/^RCV12 priority ordering, fallback, and invalid-regex safety
- [x] Feature: Copy rules from one customer to another on Allocation Rules page — copyRules tRPC procedure + dialog UI + 5 unit tests all passing
- [x] UX: Show order number on the allocation/run detail screen — added poNum column to schema, threaded through engine+router, displayed in Order Summary and All Orders tabs
- [x] Engine: Flag locations starting with 'ACR' as PickFace — inferLocationTypeFromName now matches ACR prefix
- [x] Engine: When product has no expiry date, use oldest/lowest receiveItemId as FEFO fallback — getInventoryPriority updated
- [x] Engine: Pallet move count should sum only warehouse locations, exclude pick face locations — RunDetail pallet replenishment count now filters fromLocationType==='warehouse'
- [x] UX: Consolidate pull list into one unified table (source qty, qty to staging, qty to pick face) — single table with Source Location, → Staging, → Pick Face columns; Pick Face column hidden when no pick face moves
- [x] Bug: No-expiry FEFO fallback (lowest receiveItemId) not being applied correctly in engine — getInventoryPriority was correct; Scenario B now uses warehouse-only pull so FEFO applies correctly to warehouse records
- [x] Bug: Engine pulls from pick face even when insufficient — Scenario B now skips pick face entirely and pulls full qty from warehouse pallets; surplus goes to pick face; pick face used only as last-resort fallback
- [x] Bug: Pull list UI still showing two separate boxes — fixed IIFE anti-pattern; consolidation logic moved to component body; single table with On Hand, → Staging, → Pick Face columns (conditional)
- [x] Fix: Show order number (poNum) on allocation/run detail screen — shown in Order Summary card header and Pack List table
- [x] Fix: No-expiry FEFO — engine already correct; AllocationReview now uses same getInventoryPriority logic via consolidated rows
- [x] Fix: Pull list is now one consolidated table — Source Location, On Hand, → Staging (purple), → Pick Face (blue, hidden if no moves)
- [x] Bug: React error #310 in AllocationReview — moved useMemo and all derived state before early returns; TypeScript clean
- [x] Bug: Location priority overrides FEFO within same tier — fixed applyLocationPriority to use single stable composite comparator (tier primary, FEFO secondary); all 33 tests pass
- [x] Bug: Engine still picks newer pallet — root cause was fetchInventory using itemsummaries (aggregated per location, one receiveItemId per location) instead of stockdetails (one record per pallet). Fixed by reordering endpoints to try stockdetails first.
- [x] Feature: Add locationExclusionPatterns to engine — skip matching locations entirely, use pure FEFO within remaining pool
- [x] Data: Update Amercare's rule to use exclusion patterns (^1[01] = Building 1) instead of priority patterns; pure FEFO within remaining pool
- [ ] UX: Show exclusion patterns in Allocation Rules UI with distinct styling from priority patterns (deferred — engine + data changes are live)
- [x] Feature: Hybrid pallet top-up — after pulling whole warehouse pallets, top up remaining gap from pick face instead of pulling another warehouse pallet; 4 new unit tests added (37 total pass)
- [x] UX: Show ship-to company name beside order transaction ID on Order Selection page
- [x] UX: Sort client list A–Z on the client selection step of the Order Selection wizard
- [x] UX: Add search bar on View Orders step — filter/highlight orders by PO reference, transaction ID, or ship-to company name
- [x] PDF: Rebuild Pick Face Pull Sheet to match sample layout (GD logo, navy/green header, correct columns, sign-off)
- [x] PDF: Rebuild Warehouse Pull Sheet to match sample layout (FROM/TO LOCATION, TOTAL REQ., AFFECTED ORDERS)
- [x] PDF: Rebuild Pack Sheet to match sample layout (barcode, SHIP TO, DESCRIPTION column, multi-page, 3-field sign-off)
- [x] Run History: Show TX IDs beside customer name in the run history table
- [x] Run History: Add Print Documents button (green = not yet printed, red = previously printed) that opens all 3 PDFs and marks as printed
- [x] PDF: Pixel-accurate reproduction of all three sample PDFs — match exact fonts, spacing, colors, borders, logo placement, and layout
- [x] Bug: Print Documents only downloads pick face PDF — all three must open
- [x] Bug: Title text overlaps GD logo on pull sheets — increase left offset
- [x] Feature: Add TX ID box + barcode to top-right of both pull sheet headers (matching Pack Sheet)
- [x] Bug: Print Documents still only opens pick face PDF — switch to ZIP download so all three open in one click
- [x] Bug: "FACE LOCATION" column header should read "LOCATION" on pick face pull sheet
- [x] Bug: "QTY TO PICK" text clips against bottom border of header row — increase row height
- [x] Bug: Barcode must encode the actual transaction ID number shown in the box
- [x] Feature: Show "DUPLICATE" label beside title on all three PDFs when documents have been previously printed
- [x] Bug: DUPLICATE badge overlaps title text — move it further right past the full title width
- [x] Bug: GD logo and title text too close — increase gap between logo right edge and first word
- [x] Bug: Pull sheet TX ID box shows run ID — must show order transaction ID(s) matching pack sheet
- [x] Bug: Pull sheet TX ID box too large — reduce size so it doesn't overrun meta/table area
- [x] Feature: Merge all three PDFs into one single print file instead of a ZIP archive
- [x] Bug: DUPLICATE badge overruns "SHEET" on Warehouse Pull Sheet — push badge further right
- [x] Bug: DUPLICATE badge vertical position — center on GD logo arrow tip across all three documents
- [x] Bug: Pack Sheet TX ID box too large — resize to match pull sheet TX ID box dimensions
- [x] Feature: Print Documents opens browser print dialog instead of downloading PDF
- [x] Bug: Engine allocates from pick face before staging — staging must be consumed first before touching pick face; 5 new unit tests added (42 total pass)
- [x] Bug: Run History still shows "confirmed" after all orders are unallocated — run status now updates to "unallocated" when allocatedCount drops to 0; orange badge added; existing runs backfilled via SQL
- [x] UX: Add bulk-select checkboxes to Run History — select individual runs or select all, then delete all selected with one click; confirmation dialog before bulk delete
- [x] UX: Show open order count in brackets after each client name on the Select Clients step of the allocation wizard
- [x] UX: Dim clients with zero open orders on the Select Clients step — opacity-40, cursor-not-allowed, checkbox disabled
- [x] UX: Show loading spinner beside each client name while order counts are being fetched
- [x] Bug: moveInventory call fails with "Move.Destination.NameKey.FacilityIdentifier Required" — added facilityIdentifier to destination nameKey in all three call sites (confirm, unallocate, autoRun)
- [x] Feature: Add "Retry Move" button on Run Detail page for runs with staging move errors — re-attempts the inventory move without requiring unallocate/re-run; button only visible when run is confirmed and has error notes; clears notes on full success
- [x] Bug: GD logo missing from pack and pull sheet PDFs — logo file was only available at a local sandbox path; now bundled inside server/pdf/ and resolved via import.meta.dirname so it works in production
- [x] Feature: Pick face pull sheet — show only pick face locations; to_pick_face items show toLocationName as the pick face location with (from: warehouseSource) in grey below
- [x] Feature: Warehouse pull sheet — Location column first, SKU second; rows sorted ascending by fromLocationName
- [x] Bug: DUPLICATE badge appears on pull sheets even on first print — fixed: PDF route now reads ?firstPrint=1 param; UI passes it on first print so badge is suppressed
- [x] Feature: Both pull sheets — added UNHAND QTY and QTY REQ. columns
- [x] Feature: Warehouse pull sheet — removed Affected Orders column
- [x] Style: Pull sheets — QTY REQ. bolded navy, ONHAND QTY shaded grey on both pick face and warehouse sheets
- [x] Fix: Pull sheets — suppress barcode when multiple transaction IDs; total qty now aligned under QTY REQ. column; ONHAND QTY and QTY REQ. right-justified
- [x] Fix: Pull sheets — right-edge of ONHAND QTY and QTY REQ. header labels now align with data values (shared QTY_W=50 width); FROM LOC. and TO LOC. columns added to pick face sheet
- [ ] Bug: Remove spurious placeholder text about PPTX redesign appearing in the app
- [x] Bug: Warehouse pull sheet ONHAND QTY / QTY REQ. header labels now use same QTY_W_WH=50 width as data cells; pick face total bar now uses QTY_W=50 so total aligns with numbers above
- [x] Bug: Pack sheet total qty now aligned with QTY column (cx.qty, width 36)
- [x] Bug: Pick face pull sheet TO location now shows staging (item.toLocationName ?? "STAGING")
- [x] Bug: Warehouse location rows removed from pick face sheet — filter now only includes fromLocationType==="pick_face"
- [x] Bug: GD logo not showing on PDFs in production — fixed by embedding logo as base64 in logo.ts; no file system dependency, works in all environments
- [x] Feature: Pull sheet redesign — removed TO LOCATION column; replaced QTY REQ. with MOVE TO STAGING and MOVE TO PICK FACE columns on both pick face and warehouse sheets; quantities split by movement type; LOT # added to warehouse sheet
- [x] Fix: Pick face pull sheet — remove MOVE TO PICK FACE column, keep only MOVE TO STAGING
- [x] Fix: Warehouse pull sheet — add separate totals for ONHAND QTY, MOVE TO STAGING, and MOVE TO PICK FACE columns
- [x] Ensure existing run history reprints use the new pull sheet layout (verify movement field is stored in DB pull list JSON and PDF routes re-render from stored data)
- [x] Fix: Warehouse pull sheet — order-required qty goes to MOVE TO STAGING, surplus/residual qty goes to MOVE TO PICK FACE
- [x] Fix: Warehouse pull sheet — consolidate multiple rows from the same source location into a single row
- [x] Warehouse pull sheet: add PICK FACE LOCATION column to the right of MOVE TO PICK FACE showing the destination pick face location name
- [x] Reskin app to match WMS Customer Portal design (dark sidebar #0f111a, Inter font, blue accent #3b82f6, light grey bg, white cards)
- [x] Update DashboardLayout sidebar: dark bg, section labels, active left-border, user avatar, nav badges
- [x] Update topbar and page headers to match reference
- [x] Update page components with new card/table/badge styles
- [x] Style: Apply new card/table/status-pill styles to Run History page
- [x] Style: Apply new card/table/badge/page-header styles to Run Detail page
- [x] Style: Apply new card/table/page-header styles to Allocation Rules page
- [x] Style: Apply new card/table/page-header styles to Location Config page
- [x] UX: Add Last 7 / 30 / 90 days date-range filter to Run History page
- [x] UX: Add search bar to Run History page to filter by customer name or TX ID
- [x] Style: Apply new card/page-header styles to API Settings page
- [x] Style: Apply new card/page-header styles to Auto-Run Schedule page
- [x] Nav: Rename OPERATIONS section to ALLOCATION in sidebar
- [x] Nav: Add QC section with placeholder nav items and stub pages
- [x] Nav: Add SHIPPING section with placeholder nav items and stub pages
- [x] Nav: Add "Open" item above Dashboard in Allocation section
- [x] Feature: Add unallocated orders data table to Open Orders Dashboard (client, age, priority, KPI cards)
- [x] UX: Restructure Open Orders Dashboard to show one card per warehouse with per-warehouse KPIs and order table
- [x] UX: Highlight unallocated order rows older than 3 days with row background and left-border accent
- [x] UX: Add red border to warehouse card headers that contain urgent orders
- [x] UX: Add hover tooltip to urgent badge showing priority breakdown (Urgent/High/Normal)
- [x] UX: Apply amber border to warehouse cards with high-priority orders but no urgent ones
- [x] UX: Add amber HIGH pill badge to warehouse card headers with high-priority orders
- [x] UX: Replace Open Orders Dashboard filter buttons with four status tabs: Unallocated, In Production, Ship Ready, Out of SLA
- [x] UX: Move status tabs (Unallocated/In Production/Ship Ready/Out of SLA) to page level on Open Orders Dashboard
- [x] UX: Replace dark gradient warehouse card headers with a lighter style
- [x] UX: Replace KPI cards on Open Orders Dashboard (global + per-warehouse) with Unallocated, In Production, Ship Ready, Out of SLA
- [x] UX: Remove status tab bar from Open Orders Dashboard
- [x] Branding: Replace sidebar logo with GDgenius.jpg
- [x] Branding: Update browser tab title from GD Wizard to GD Genius
- [x] Open Orders: Add PO # column to warehouse card order tables
- [x] Open Orders: Add Allocation Date column to warehouse card order tables
- [x] Open Orders: Add Ship To Customer (consignee) column
- [x] Open Orders: Add City column
- [x] Open Orders: Add # of SKUs column
- [x] Open Orders: Add Cases/Eaches (total qty) column
- [x] Open Orders: Add Notes/Comments field (editable inline or as tooltip)
- [x] Open Orders: Group orders by GD Client within each warehouse card (matching spreadsheet layout)
- [ ] Open Orders: Add Offsite flag indicator
- [x] Open Orders: Update backend openOrders procedure to return all new fields from Extensiv API

## Order Lifecycle Tracking (Pick Schedule)
- [ ] DB: Add order_tracking table (extensiv_order_id, reference_num, po_num, client_id, client_name, facility_id, facility_name, ship_to_name, ship_to_city, total_pieces, sku_count, notes, lifecycle_status, first_seen_at, last_synced_at, allocated_at, picking_at, qc_at, qc_complete_at, ship_ready_at)
- [ ] DB: lifecycle_status enum: unallocated | allocated | picking | qc | qc_complete | ship_ready
- [ ] Backend: hourly sync job — fetch open orders from Extensiv, upsert into order_tracking, mark new as unallocated
- [ ] Backend: tRPC updateOrderStatus mutation — advance order to next lifecycle stage
- [ ] Backend: tRPC getTrackedOrders query — return all tracked orders grouped by facility/client
- [ ] Backend: auto-remove shipped orders — if an order disappears from Extensiv (closed/shipped), remove from tracking table
- [ ] Backend: sync now endpoint — manual trigger for immediate re-sync
- [ ] Frontend: Replace openOrders live-fetch with tracked orders from DB
- [ ] Frontend: Status column with dropdown/button to advance lifecycle stage
- [ ] Frontend: Picking stage — button to mark "Given to Associate" → Picking
- [ ] Frontend: QC stage — button to mark "QC Started" → QC
- [ ] Frontend: QC Complete stage — button to mark "QC Finished" → QC Complete
- [ ] Frontend: Ship Ready stage — button to mark "Shipping Details Sent" → Ship Ready
- [ ] Frontend: Show "Last synced" timestamp and manual Sync Now button
- [ ] Frontend: Shipped orders auto-disappear from the sheet (removed from DB on next sync)
- [x] Add assignedAssociate column to order_tracking table
- [x] Prompt for associate name when advancing order to Picking stage
- [x] Display assigned associate name in order row
- [x] Shipwell API client with token auth (sandbox + production)
- [x] Shipwell credentials settings page (email, password, environment toggle)
- [x] Send to Shipwell action on Ship Ready orders (creates Shipwell purchase order)
- [x] Store Shipwell PO ID in order_tracking and display link in order row
- [x] Sidebar: add "Dashboard" section heading at top with Open Orders and SLA Tracker
- [x] Rename "Open Orders Dashboard" nav label to "Open Orders"
- [x] Build SLA Tracker page with per-warehouse cards and SLA status breakdown
- [x] sla_requirements DB table (clientId, clientName, slaDays default 2)
- [x] SLA tRPC procedures: list, upsert, delete sla requirements; getSlaStatus query
- [x] SLA Tracker page: Dashboard tab (In SLA / Out of SLA per warehouse) + SLA Requirements tab
- [x] Route /sla-tracker wired in App.tsx
- [x] Rename "Pick Schedule" heading to "Open Orders" on Home.tsx
- [x] Full-screen warehouse card modal on Open Orders (Home.tsx)
- [x] Full-screen warehouse card modal on SLA Tracker
- [x] Export to CSV in full-screen mode (Open Orders)
- [x] Export to PDF in full-screen mode (Open Orders)
- [x] Export to CSV in full-screen mode (SLA Tracker)
- [x] Export to PDF in full-screen mode (SLA Tracker)
- [x] Make sidebar logo 2.5x bigger
- [x] Move Send to Shipwell button to QC Complete stage
- [ ] Add undo/step-back button to every order row
- [ ] Add undoStatus tRPC procedure on backend
- [ ] Inline warehouse drill-down on Open Orders (replaces grid, Back button)
- [ ] Inline warehouse drill-down on SLA Tracker (replaces grid, Back button)
- [ ] Remove full-screen overlay mode (replaced by inline drill-down)
- [x] Add shipwellStatus and shipwellShipmentId columns to order_tracking table
- [x] Update Shipwell API client to create shipments and fetch live status
- [x] Add background status-sync job polling Shipwell every 15 min
- [x] Auto-remove orders from Open Orders when Shipwell status = Delivered
- [x] Show live Shipwell status badge on Open Orders rows
- [x] Research Shipwell bids API endpoint
- [x] Add getBidCount method to Shipwell API client
- [x] Add shipwellBidCount column to order_tracking DB
- [x] Update status sync job to fetch and store bid count for Quoting orders
- [x] Display bid count on Quoting badge in Open Orders UI
- [x] Add shipwellQuotingStartedAt column to order_tracking DB
- [x] Add shipwellZeroBidNotifiedAt column to prevent duplicate notifications
- [x] Update sync job to record quotingStartedAt when order first enters Quoting status
- [x] Fire owner notification when Quoting order has 0 bids for 2+ hours
- [x] Show warning icon on Quoting status pill when 0 bids for 2+ hours
- [x] Add Needs Attention filter pill to Open Orders KPI row
- [x] Add lane_thresholds table to DB schema for configurable zero-bid alert thresholds
- [x] Add tRPC procedures for lane threshold CRUD
- [x] Add Lane Thresholds tab to Shipwell Settings page
- [x] Update frontend warning logic to use per-lane threshold
- [x] Add requiredShipDate column to order_tracking DB table
- [x] Update Extensiv sync job to extract and store requiredShipDate from API response
- [x] Display Required Ship Date column in Open Orders table with urgency styling
- [x] Match sidebar/menu bar background colour to GD Genius logo background
- [x] Show Send to Shipwell button at QC Complete stage (already implemented, confirmed working)
- [x] Undo button already present on right side of each order row (confirmed working)
- [x] Fix "Unallocated" label overflow in the summary stat boxes on Open Orders overview
- [x] Shrink warehouse tab layout so everything fits on one page without horizontal scroll
- [x] Shorten "QC Complete" display label to "QC Done" in full-screen stat boxes
- [x] Add getOverdueUnallocatedOrders DB helper
- [x] Build overdueAlertScheduler that fires at 7 AM daily
- [x] Add tRPC procedure to manually trigger the alert for testing
- [x] Write unit tests for the overdue alert logic
- [x] Add getAttentionCount DB helper (overdue unallocated + zero-bid orders)
- [x] Add tRPC pickSchedule.attentionCount query
- [x] Wire red badge onto Open Orders sidebar nav item in AppLayout
- [x] Add lastOverdueAlertSentAt column to order_tracking schema and migrate
- [x] Add markOverdueAlertSent DB helper to stamp the timestamp per order
- [x] Update overdueAlert scheduler to skip orders already notified today
- [x] Update overdueAlert tests to cover suppression logic
- [x] Add Test Alert button to Shipwell Settings page to trigger overdueAlert.triggerNow
- [x] Return separate overdue/zeroBid counts from attentionCount tRPC procedure
- [x] Add hover popover to sidebar badge showing overdue and zero-bid breakdown
- [x] Add alert_settings table to DB schema for storing configurable alert time
- [x] Add tRPC procedures for getAlertSettings and saveAlertSettings
- [x] Update overdueAlert scheduler to read configured time from DB and reschedule dynamically
- [x] Add time picker UI to Notifications tab in Shipwell Settings
- [x] Add dismissZeroBidWarning DB helper to reset shipwellZeroBidNotifiedAt
- [x] Add tRPC pickSchedule.dismissZeroBidWarning mutation
- [x] Add Dismiss Warning button to zero-bid order rows in the Open Orders table
- [x] Update overdueAlert scheduler to re-include orders suppressed 2+ days with Escalated marker
- [x] Update overdueAlert tests to cover escalation logic
- [x] Update auditLog.list tRPC procedure to accept optional action filter
- [x] Add action type filter dropdown to Audit Log page UI
- [x] Add getAuditLogUsers DB helper to get distinct users who appear in audit_logs
- [x] Update audit.list tRPC procedure to accept optional userId filter
- [x] Add user filter dropdown to Audit Log page UI alongside action filter
- [x] Add client_visibility table to DB schema (clientId, clientName, isVisible, configId)
- [x] Add DB helpers: getClientVisibility, upsertClientVisibility, getHiddenClientIds, syncClientVisibilityFromOrders
- [x] Add tRPC procedures: clientVisibility.list, clientVisibility.save
- [x] Build Client Visibility settings page with searchable toggle list and unallocated counts
- [x] Wire Open Orders (Home.tsx) to filter orders by visible clients
- [x] Update pickSchedule.list tRPC procedure to filter out hidden clients using getHiddenClientIds
- [x] Verify frontend KPI counts and warehouse cards automatically reflect filtered data
- [x] Rewrite ClientVisibility page with per-warehouse tabs (one tab per extensiv config)
- [x] Each tab shows its own independent client toggle list with search and bulk actions
- [x] Rename "Show all" / "Hide all" buttons to "Select All" / "Deselect All" in Client Visibility page
- [x] Fix duplicate client entries in Client Visibility tab
- [x] Show unallocated order count beside each customer name in the Open Orders detail table
- [x] Show total unallocated order count on each warehouse card summary subtitle
- [x] Seed client_visibility table from selected-customers TSV (master customer list with facility assignments)
- [x] Add isLocked flag to client_visibility to prevent sync from re-showing manually hidden clients
- [x] Add 'Lock all hidden' bulk action button to Client Visibility toolbar
- [x] Add tooltip to 'Lock all hidden' button explaining what the lock action does
- [x] Add 'Locked only' filter chip to Client Visibility search bar
- [x] Replace Recent Allocation Runs section on Open Orders main page with SLA breach summary per client
- [x] SLA requirements table: list all clients pre-populated at 2 days with +/- one-day stepper buttons
- [x] SLA sub-rules: per-client named rules (e.g. Labeling, B2B) with individual SLA day counts, expandable below each client row
- [x] Store order savedElements from Extensiv API and match to SLA sub-rules automatically
- [x] Replace Recent Allocation Runs section on Open Orders main page with per-client SLA breach summary table
- [x] Orders Out of SLA: make each client name a clickable link that filters the Open Orders warehouse cards for that client
- [x] Add colour-coded Days Overdue column to Open Orders drill-down table (amber 1-2d, red 3d+)
- [x] Orders Out of SLA: group by warehouse first, then by customer within each warehouse, sorted by worst days overdue descending
- [x] Add red overdue count badge to each warehouse card subtitle on Open Orders main page
- [x] Pre-sort order rows by Required Ship Date ascending within each customer group in the Open Orders drill-down table
- [x] Add colour-coded Days Overdue column to SLA Tracker order table (amber 1-2d, red 3d+)
- [x] Per-order SLA extension: add slaExtensionDays and slaExtensionNote columns to order_tracking schema
- [x] Per-order SLA extension: tRPC mutation to set/clear extension, breach engine applies extension to deadline
- [x] Per-order SLA extension: UI in Open Orders and SLA Tracker rows (extend button, days stepper, reason note, clear)
- [x] Per-order SLA extension: Extension indicator badge in SLA Tracker table (purple +Nd badge with tooltip)
- [x] Per-order SLA extension: 12 unit tests covering extension logic and input validation (188 tests total passing)
- [x] Client Visibility: decouple save from auto-lock — saving visibility should NOT automatically lock/unlock rows
- [x] Client Visibility: add per-row lock/unlock toggle button so users can explicitly lock individual clients
- [x] Client Visibility: add tRPC mutation to toggle lock state for a single client
- [x] Client Visibility: update Lock All Hidden to only lock, not change visibility
- [x] Client Visibility: locked rows show a clickable lock icon to unlock; unlocked rows show an unlock icon to lock
- [x] Client Visibility: 15 new unit tests for decoupled save/lock logic (203 tests total passing)
- [x] Sidebar nav: clicking a menu item scrolls the main content area back to the top — fix so scroll position is held while navigating between sub-menu items
- [x] Sidebar nav still snaps to top when clicking items below the fold — fixed by lifting AppLayout to App.tsx so the sidebar DOM element is never destroyed on navigation

## Returns Feature
- [x] Returns: DB schema — returns_sessions and returns_items tables
- [x] Returns: tRPC procedures — create session, add/update/remove item, close session, list sessions, dashboardStats
- [x] Returns Dashboard page — summary cards (open/closed/SKUs/units), condition breakdown, recent sessions table
- [x] Process Returns portal — Step 1: Select Warehouse, Step 2: Select Customer, Step 3: Scan-in screen
- [x] Returns scan-in screen — barcode/SKU input, quantity, condition grade, disposition, lot/serial, notes, edit/remove items, close session with confirmation
- [x] Sidebar nav — Returns section between Shipping and Configuration with Returns Dashboard and Process Returns links
- [x] Returns: 17 unit tests (220 total passing)

## GD Cortex Integration (GD Genius connector)
- [x] Cortex DB: cortex_connections table (platform, baseUrl, apiKey, webhookUrl, syncInterval, enabled)
- [x] Cortex DB: cortex_returns table (inbound return requests from ClearSight with full payload + status)
- [x] Cortex API: GET /api/health — health check endpoint (no auth required)
- [x] Cortex API: POST /api/returns — receive return request from ClearSight (X-API-Key auth)
- [x] Cortex API: GET /api/returns/processed — return processed returns to ClearSight (X-API-Key auth, ?since= ?limit=)
- [x] Cortex: outbound webhook — POST to ClearSight webhook URL when return status changes
- [x] Cortex: link inbound ClearSight returns to existing returns_sessions/returns_items workflow
- [x] Cortex Settings UI page — configure ClearSight base URL, API key, webhook URL, sync interval, test connection button
- [x] Cortex Settings: sidebar nav entry under Configuration
- [x] Cortex: 22 unit tests for API key validation, return receipt, processed returns query, status lifecycle (242 total passing)

## Push to ClearSight (Post-Session Webhook)
- [x] tRPC mutation: returns.pushSessionToClearSight — collects all items from a closed returns_session and fires the Cortex outbound webhook
- [x] Push to ClearSight button on ProcessReturns closed-session view (appears after session is closed)
- [x] Audit log entry on each push (action: returns.pushToClearSight)
- [x] 242 tests passing total

## Webhook Retry Mechanism
- [x] DB schema: add push_status (pending/sent/failed), push_attempts, push_error, last_pushed_at to returns_sessions
- [x] DB migration: applied
- [x] Backend: pushSessionToClearSight persists push_status/push_attempts/push_error after each attempt
- [x] Backend: server-side auto-retry scheduler — retries failed sessions up to 3 times with exponential backoff (1min, 5min, 15min)
- [x] UI ProcessReturns: push panel shows Sent (green) / Failed (red) badge with error message, attempt count, and Retry Push button
- [x] UI ReturnsDashboard: session rows show Sent badge, Failed badge with attempt count, Push button (not yet pushed), Retry button (failed)
- [x] 242 tests passing total

## QC Scanner Module (from GD Scanner App)
- [x] QC Scanner: DB schema — qc_scan_sessions, qc_scan_items, qc_pallets, qc_flagged_scans tables
- [x] QC Scanner: tRPC procedures — create/get session by reference number, scan SKU, manage pallets, flag scan, list flagged scans, complete session
- [x] QC Scanner page — reference number input → SKU checklist with expected vs scanned qty → pallet management tabs
- [x] QC Scanner: audio feedback on scan (correct beep, wrong buzz, complete chime via Web Audio API)
- [x] QC Scanner: manual quantity entry, new pallet button, pallet tab view with items per pallet
- [x] Flagged Scans page — table of all flagged scans with UPC, SKU, description, date, resolve action
- [x] QC section sidebar nav — QC Scanner and Flagged Scans links added
- [x] Pallet Scanner (Shipping): DB schema — pallet_scans table (tracking, door, warehouse, carrier, reference, scanned by, status, timestamp)
- [x] Pallet Scanner (Shipping): tRPC procedures — logScan, list, updateStatus
- [x] Pallet Scanner (Shipping): page — tracking scan input, door/carrier/reference fields, audio feedback, recent scans table, Mark Departed action
- [x] Pallet Scanner (Shipping): sidebar nav entry under Shipping section
- [x] 242 tests passing total

## QC Scanner — Lot # Column
- [x] Add Lot # column to QC Scanner item table (frontend)
- [x] Verify lotNumber field flows from qc_scan_items DB column through tRPC to the UI
- [x] 5 new unit tests for lotNumber field (247 tests passing total)

## QC Scanner — Lot # Auto-Population from Extensiv
- [x] Locate lot number field in Extensiv order line item API response (ExtensivOrderItem.lotNumber)
- [x] Add fetchOrdersByReferenceNum to extensiv/api.ts (RQL search by referenceNum)
- [x] Add fetchFromExtensiv tRPC procedure to qcScannerRouter (seeds items + lot numbers + descriptions)
- [x] Add Load from Extensiv button to QC Scanner scanning phase UI
- [x] 7 unit tests for fetchFromExtensiv (254 tests passing total)

## QC Scanner — Auto-Load from Extensiv on Session Start
- [x] Auto-trigger fetchFromExtensiv after new session creation (not on resume)

## QC Scanner — Loading Skeleton for Extensiv Fetch
- [x] Show skeleton placeholder rows in item table while fetchFromExtensiv is in progress

## QC Scanner — Extensiv Load Failure Banner
- [x] Track extensivLoadError state for auto-load failures
- [x] Show amber warning banner with error message and Retry button instead of generic toast
- [x] Dismiss banner on successful retry or manual dismiss

## QC Scanner — Recent Sessions Panel
- [x] Add getRecentCompletedQcSessions DB helper (last 5 completed sessions with item count)
- [x] Add qcScanner.recentSessions tRPC procedure
- [x] Add Recent Sessions panel to QC Scanner start screen (pack-sheet table style, click row to pre-fill ref)
- [x] 6 unit tests for recentSessions (260 tests passing total)

## QC Scanner — Recent Sessions Show More
- [x] Add sessionLimit state (5 → 10) and Show more / Show less toggle link below the panel

## QC Scanner — Session Summary Modal
- [x] Add sessionSummary tRPC query (session header + full item list by session ID)
- [x] Build read-only summary modal in QcScanner start screen (item table with lot, expected, scanned)
- [x] Clicking a recent session row opens the modal; footer has Close + Open Session buttons
- [x] 5 unit tests for sessionSummary (265 tests passing total)

## QC Scanner — Customer Filter on Recent Sessions
- [x] Add customer filter input above Recent Sessions panel (client-side filter on loaded sessions)
- [x] Show filtered empty state when no sessions match the filter
- [x] Clear (x) button to reset filter; Show more/less hidden when filter yields no results

## SLA Tracker — Warehouse Conditional Formatting
- [x] Green if ≥98% of orders within SLA, yellow if ≥95%, red if <95%
- [x] SLA % badge shown on each warehouse card and fullscreen header
- [x] Card border/shadow colour matches the three-tier health status

## SLA Tracker — Configurable Per-Warehouse Health Thresholds
- [x] Add sla_facility_thresholds DB table (facilityId, facilityName, greenThreshold, yellowThreshold)
- [x] Add getSlaFacilityThresholds, getSlaFacilityThreshold, upsertSlaFacilityThreshold DB helpers
- [x] Add listFacilityThresholds, getFacilityThreshold, upsertFacilityThreshold tRPC procedures
- [x] Use per-warehouse thresholds in WarehouseSlaCard colour logic (fall back to 98/95 defaults)
- [x] Add FacilityThresholdsSection editor to SLA Requirements tab (+/- stepper, Save button, validation)

## SLA Tracker — 7-Day Trend Sparkline
- [x] Add sla_daily_snapshots DB table (facilityId, facilityName, snapshotDate, inSlaCount, totalCount, slaRate)
- [x] Add upsertSlaDailySnapshot, getSlaDailyHistory, getLatestSlaDailySnapshots DB helpers
- [x] Add sla.facilityHistory query and sla.recordSnapshot mutation tRPC procedures
- [x] Build SlaSparkline SVG component (polyline + dots + trend arrow + last % label)
- [x] Wire sparkline below KPI tiles in each WarehouseSlaCard (respects per-warehouse thresholds)
- [x] 7 unit tests for slaDailySnapshots (282 tests passing total)

## SLA Tracker — Nightly Snapshot Cron Job
- [x] Create server/scheduler/slaNightlySnapshot.ts (groups orders by facility, computes SLA %, upserts snapshots)
- [x] Register startSlaNightlySnapshot() at server startup (midnight UTC via node-cron)
- [x] Add sla.runNightlySnapshot tRPC mutation for manual on-demand trigger
- [x] 8 unit tests for slaNightlySnapshot (290 tests passing total)

## SLA Tracker — Sparkline Dot Tooltips
- [x] Add hover state to SlaSparkline dots showing exact date and SLA % in a dark tooltip
- [x] Dot enlarges on hover; tooltip pins left/right to avoid overflow

## SLA Tracker — Sparkline Window Toggle
- [x] Add 7d / 14d / 30d toggle buttons on each warehouse card; active day highlighted with primary colour
- [x] historyQuery re-fetches with new days value on toggle; stale cache kept per window

## SLA Tracker — Persist Sparkline Window
- [x] Added useLocalStorage hook; sparkDays persisted per facility with key sla-spark-days-{facilityId}
- [x] Selection survives page refresh and is independent per warehouse card

## Allocation — Post-Confirmation Extensiv Verification
- [x] Add verificationStatus and verificationDetail columns to allocation_runs table
- [x] Add verificationStatus column to allocation_run_orders table
- [x] Add DB helpers: updateRunVerification, updateRunOrderVerification
- [x] Add verifyRun tRPC procedure: re-fetch each order from Extensiv, compare fullyAllocated + per-SKU qty
- [x] Auto-trigger verifyRun after confirmRun succeeds (with delay for Extensiv processing time)
- [x] Show verification badge on Run History rows (verified/partial/failed/pending)
- [x] Show per-order verification detail in Run Detail page
- [x] Add manual Re-verify button in Run Detail for on-demand re-checks

## Open Orders — Verification Issues KPI Card
- [x] Add getUnresolvedVerificationCount DB helper (confirmed runs with verificationStatus in partial/mismatch/failed)
- [x] Add allocation.unresolvedVerificationCount tRPC query
- [x] Add Verification Issues KPI card to Open Orders dashboard (count badge + link to Run History)

## Open Orders Sidebar Badge — Verification Issues
- [x] Extend attentionCount tRPC procedure to return verificationIssues count alongside overdue/zeroBid
- [x] Update sidebar badge total to include verificationIssues
- [x] Update hover popover to show verification issues row in breakdown

## Receiving Section
- [x] Create ReceivingDashboard stub page
- [x] Create PutAwayAssistant stub page
- [x] Add RECEIVING section above ALLOCATION in sidebar nav (AppLayout.tsx)
- [x] Register /receiving and /put-away routes in App.tsx

## Receiving Dashboard — Full Build
- [x] Add getReceivers() Extensiv API helper in server/extensiv/api.ts
- [x] Add getReceiverItems() Extensiv API helper for line items
- [x] Add receiving.list tRPC procedure (paginated, filterable by warehouse/status/date)
- [x] Add receiving.detail tRPC procedure (single receiver with line items)
- [x] Add receiving.kpis tRPC procedure (today expected, in-progress, completed, discrepancies)
- [x] Build ReceivingDashboard page: KPI cards, shipment table with status badges
- [x] Build ReceiverDetail slide-over/modal: line items with expected vs. received qty
- [x] Add warehouse filter, status filter, and date range filter to dashboard
- [ ] Write vitest tests for receiving tRPC procedures (deferred — no mock data available)

## Put Away Assistant
- [x] Add putAway.suggest tRPC procedure: lookup SKU inventory, classify locations, apply FEFO + pick-face rules, return ranked suggestions
- [x] Add putAway.logScan DB table (put_away_scans) to track session history
- [x] Add putAway.session tRPC procedures: start, list scans, add scan, clear
- [x] Build PutAwayAssistant page: scan input bar, suggestion card with location type badge, session scan history table
- [ ] Write vitest tests for put-away suggestion logic (deferred — requires live Extensiv mock data)

## Receiving Dashboard — Warehouse-Grouped Redesign
- [x] Group open receipts by warehouse (facility) on the dashboard
- [x] Show all open receipts per warehouse in a list (no status filter by default)
- [x] Click receipt row → detail slide-over with full line items
- [x] Add "Start Receipt" button in the detail slide-over
- [x] Remove old KPI-first layout; warehouse cards become the primary UI

## Start Receipt — Extensiv API Integration
- [x] Research Extensiv API endpoint for updating receiver status to In Progress
- [x] Add startReceipt() Extensiv API helper in server/extensiv/api.ts
- [x] Add receiving.startReceipt tRPC mutation in routers.ts
- [x] Wire Start Receipt button to tRPC mutation in ReceivingDashboard.tsx
- [x] Invalidate receiving.list query on success to refresh the dashboard

## Put Away Items — Receiving to Put Away Handoff
- [x] Add "Put Away Items" button to receipt detail slide-over (visible when status is In Progress or Expected)
- [x] Navigate to /receiving/put-away with configId, facilityId, customerId, transactionId as URL query params
- [x] Update PutAwayAssistant to read URL params and auto-populate session setup (skip setup step)

## Receiving Dashboard — Discrepancy Warning Badge
- [x] Add red discrepancy badge to receipt rows where any line item has expected qty ≠ received qty
- [x] Show discrepancy count in the badge (e.g. "2 discrepancies")
- [x] Highlight discrepant line items in the detail slide-over with red variance styling
- [x] Add discrepancy summary banner at top of detail slide-over listing affected SKUs

## Complete Receipt — Extensiv API Integration
- [x] Add completeReceipt() Extensiv API helper (GET ETag, PUT status=2)
- [x] Add receiving.completeReceipt tRPC mutation in routers.ts
- [x] Add Complete Receipt button to detail slide-over (visible when status is In Progress)
- [x] Invalidate receiving.list and receiving.detail queries on success

## Put Away Assistant — Warehouse-Grouped Completed Receipts
- [x] Show only completed receipts (status = 2) grouped by warehouse on the Put Away Assistant landing view
- [x] Remove the manual config/facility/customer setup step from the initial view
- [x] Click a completed receipt row to launch the scan session pre-filled with that receipt's context
- [x] Retain URL param pre-fill from Receiving Dashboard handoff

## MU Put-Away Workflow
- [ ] Research Extensiv MU API (create MU, list MUs, assign MU to location)
- [ ] Research Extensiv open location query endpoint
- [ ] Add put_away_location_priority DB table (configId, facilityId, customerId, aisle, level, priority order)
- [ ] Add putAway.locationPriority tRPC procedures: get, upsert, delete
- [ ] Add fetchOpenLocations() Extensiv API helper (empty locations by facility)
- [ ] Add createMU() Extensiv API helper (one MU per pallet on a receiver)
- [ ] Add putAway.suggestPallets tRPC procedure: fetch open locations, apply aisle/level priority, return ranked location per MU
- [ ] Build Location Priority Config screen: per-warehouse collapsible, per-customer aisle/level click-to-prioritize grid
- [ ] Add Location Priority Config to sidebar nav (under Receiving or Settings)
- [ ] Update Complete Receipt slide-over: add Generate MUs step before finalizing
- [ ] Build MU generation panel: list pallets from receipt line items, confirm count, call createMU in Extensiv
- [ ] Build Pallet Put-Away panel: show each MU with suggested location (from priority config), allow override, confirm all
- [ ] Wire Complete Receipt button to new multi-step flow (Generate MUs → Put Away → Complete)

## Receiving — SKU-by-SKU Line-Item Confirmation Screen
- [ ] Research Extensiv receiveItem update/confirm endpoint (PUT /inventory/receivers/{id}/items/{itemId})
- [ ] Add updateReceiverItem() Extensiv API helper to record confirmed received qty
- [ ] Add receiving.confirmItem tRPC mutation (confirm qty or flag for adjustment)
- [ ] Build full-page receipt confirmation view (replaces slide-over for in-progress receipts)
- [ ] SKU list: show expected qty, editable received qty, Confirm / Adjust buttons per row
- [ ] Confirmed rows turn green with checkmark; flagged rows show amber with note field
- [ ] Summary bar: X of Y items confirmed, Z flagged
- [ ] Complete Receipt button enabled only when all items are confirmed or flagged

## Receiving — SKU Confirmation & MU Generation
- [x] Add updateReceiverItemQty() Extensiv API helper (GET ETag → modify item qty → PUT full body)
- [x] Add receiving.confirmItem tRPC mutation (confirm qty or flag with adjustment note)
- [x] Add receiving.generateMUs tRPC mutation (generate internal MU labels, embed in receiver PUT)
- [x] Add mu_labels DB table to track generated MU labels per receipt line item
- [x] Build full-page ReceiptConfirmation view: SKU list, expected qty, editable received qty, Confirm/Adjust per row
- [x] Confirmed rows turn green with checkmark; flagged rows show amber with note field
- [x] Summary bar: X of Y items confirmed, Z flagged
- [x] Generate MUs button: creates one MU label per line item, shows labels for printing
- [x] Complete Receipt button enabled only when all items are confirmed or flagged
- [x] Wire from Receiving Dashboard: clicking In Progress receipt opens ReceiptConfirmation page via Confirm Items & Generate MUs button

## Put Away Wizard — Location Priority Config Screen
- [x] Add put_away_priority DB table (configId, facilityId, customerId, aisle, level, priorityOrder)
- [x] Add DB helpers: getPutAwayPriorities, savePutAwayPriorities, deletePutAwayPriorities
- [x] Add putAway.getPriority, putAway.savePriority, putAway.clearPriority tRPC procedures
- [x] Add extensiv.locations tRPC procedure (fetch all locations for a facility)
- [x] Build PutAwayPriorityConfig page: warehouse select → customer select → aisle chip grid
- [x] Aisle chips: pull distinct aisles from Extensiv locations for the selected facility
- [x] Click aisle chip to toggle priority; arrow buttons to reorder; numbered badges show order
- [x] Add "Put Away Priority Config" nav item under Receiving in the sidebar
- [x] Register /receiving/put-away/priority route in App.tsx
- [x] Update putAway.suggest engine to fetch priority config and rank prioritised aisles first

## Put Away Wizard — Priority Aisle Badge on Suggestion Cards
- [x] Update putAway.suggest return type to include aislePriorityOrder (number | null) and isPriorityAisle (boolean) on each suggestion
- [x] Update PutAwayAssistant suggestion card UI to show a "Priority Aisle #N" badge when isPriorityAisle is true

## Put Away Wizard — Collapsible Priority Legend Panel
- [x] Fetch priority config (putAway.getPriority) in PutAwayAssistant when warehouse+customer are selected
- [x] Render a collapsible legend panel below the suggestion list showing all configured aisles in priority order
- [x] Legend collapses by default; user can expand to see the full priority map

## AUDIT Section
- [x] Add AUDIT nav section to sidebar below Returns with sub-items: Production Documents, Images, Shipping Documents
- [x] Register routes: /audit/production-documents, /audit/images, /audit/shipping-documents
- [x] Reuse fetchOrderWithDetail from Extensiv API layer to pull pick ticket data by transaction ID
- [x] Add auditDocuments.fetchPickTickets tRPC procedure: accepts array of transaction IDs, fetches order detail from Extensiv
- [x] Add POST /api/pdf/audit-pick-tickets Express endpoint: generates multi-page PDF with AUDIT watermark
- [x] Build Production Documents page: multi-line Transaction ID input, config selector, Generate PDF button, download link
- [x] Images page stub (placeholder)
- [x] Shipping Documents page stub (placeholder)

## AUDIT — Shipping Documents Page
- [x] Audit Extensiv API fields available for shipping documents (carrier, tracking, BOL, ship-to, items)
- [x] Extend ExtensivOrder type with shipping fields (shipDate, trackingNumber, bolNumber, carrierName, carrierCode, shipVia, totalWeight, totalCartons, shipFrom)
- [x] Build audit shipping PDF generator: BOL-style layout with carrier, tracking, ship-from/to, line items, signature block, AUDIT watermark
- [x] Add POST /api/pdf/audit-shipping-documents Express route (auto-detects config)
- [x] Build Shipping Documents page UI: TX ID input, Generate PDF button, download (no warehouse selector)

## AUDIT — Production Documents: Remove Warehouse Selector
- [x] Remove the "Select Warehouse" step card from AuditProductionDocuments page
- [x] Auto-detect the Extensiv config on the server side (use the first active config)

## AUDIT — Production Documents: Extensiv vs Genius Pick Ticket Selector
- [x] Research Extensiv API for native pick ticket PDF download endpoint (no native PDF endpoint; faithful reproduction built instead)
- [x] Build Extensiv-style pick ticket PDF generator (faithful reproduction of Extensiv layout: title, customer header, transaction #, barcode, ship-to, metadata, items table with detail sub-rows, signature block, AUDIT watermark)
- [x] Add POST /api/pdf/extensiv-pick-tickets Express route (auto-detects config)
- [x] Update Production Documents page UI: 3-step flow with document type selector (Extensiv Pick Tickets / Genius Pick Tickets)
- [x] Wire "Extensiv Pick Tickets" option to /api/pdf/extensiv-pick-tickets
- [x] Wire "Genius Pick Tickets" option to /api/pdf/audit-pick-tickets

## AUDIT — Extensiv Pick Tickets: Item Description Lookup
- [x] Identify Extensiv item master endpoint: GET /customers/{id}/items (already implemented as fetchItemDescriptions)
- [x] Reuse existing fetchItemDescriptions() helper in server/extensiv/api.ts
- [x] Update /api/pdf/extensiv-pick-tickets route: collect unique customer IDs from fulfilled orders, fetch descriptions per customer in parallel (best-effort), stamp descriptions onto ticket items
- [x] Description lookup is non-fatal — blank description shown if lookup fails for a customer

## UI Tweaks — Mar 30 2026
- [x] Receiving dashboard: warehouses start collapsed by default
- [x] Put Away Priority Config: remove Extensiv config selector (auto-detect config)
- [x] SLA Tracker: warehouse tabs start collapsed by default
- [x] Receiving Dashboard + SLA Tracker: persist warehouse card expanded/collapsed state in localStorage per facility

## QC Scanner Enhancements
- [x] Batch Order mode: checkbox on start screen, isBatch + batchIdentifiers stored on session, BatchIdentifiers panel shown during scanning
- [x] MU scan detection: when scanned barcode matches no SKU/UPC, checkMU tRPC procedure called, modal shown with SKU+qty confirm, adjustQty called on confirm
- [x] Rollback last scan: "Undo Last Scan" button per item row (scanning phase only), undoLastScan tRPC procedure + undoQcScanItem DB helper

## Pallet Scanner — Two-Step Order+Pallet Workflow
- [x] Step 1: scan/enter reference number to load order and list all pallets (UPC + ship-scan status)
- [x] Step 2: scan each pallet UPC to stamp shippedAt; running counter X/Y turns green when complete
- [x] Order complete detection: green success banner + Start New Order button when all pallets scanned
- [x] Browser camera capture: Take Photo button using getUserMedia, uploads via palletScanner.uploadPhoto, photoUrl stored on pallet
- [x] DB migrations applied: isBatch on qc_scan_sessions, photoUrl on qc_pallets

## Pallet Scanner — Two-Step Workflow (Real Build)
- [x] Add palletScanner.loadOrder tRPC procedure (lookup QC session by reference number, return session + pallets)
- [x] Add palletScanner.scanPallet tRPC procedure (match palletUpc, stamp shippedAt, return updated pallet list)
- [x] Add palletScanner.uploadPhoto tRPC procedure (base64 dataUrl → S3, store photoUrl on pallet)
- [x] Rebuild PalletScanner.tsx: Step 1 load order by reference, Step 2 scan each pallet UPC, running counter, success banner
- [x] Keep existing Tracking Log as second tab

## QC Scanner — Pallet UPC Assignment
- [ ] Add assignPalletUpc tRPC procedure (set palletUpc on a qc_pallet row)
- [ ] Add UPC assignment UI in QC Scanner pallet management: scan/type UPC per pallet, show assigned UPC with edit option
- [ ] Auto-generate a UPC if none is scanned (GD-{sessionId}-{palletIndex} format) so every pallet always has a scannable identifier
- [ ] Show assigned UPCs in the pallet list with a barcode icon and copy-to-clipboard

## QC Scan and Label Module

- [ ] DB: label_files table (id, barcode, filename, s3_key, s3_url, uploaded_at)
- [ ] DB: label_scan_sessions table (id, client, order_ref, expected_cartons, status, printer_ip, printer_port, created_at, completed_at)
- [ ] DB: label_scan_cartons table (id, session_id, barcode, label_file_id, dispatched_at, exception, exception_resolved_at, qc_item_count, qc_photos, qc_notes)
- [ ] DB: label_settings table (printer_ip, printer_port, gs1_prefix, label_folder_path)
- [ ] Server: label file upload procedure (store in S3, index by barcode)
- [ ] Server: label file list/delete procedures
- [ ] Server: create/get/complete label scan session procedures
- [ ] Server: scan carton procedure (lookup label by barcode, dispatch ZPL via TCP to printer IP, log result, return exception if no label found)
- [ ] Server: resolve exception procedure (supervisor clears stop-line flag)
- [ ] Server: label settings get/update procedures
- [ ] Config page: add Print-and-Apply Machine IP, Port, GS1 Company Prefix fields
- [ ] QC Scan and Label page: session start form (client, order ref, expected cartons, printer IP override)
- [ ] QC Scan and Label page: live scan feed (barcode input, label dispatched confirmation, stop-line exception UI)
- [ ] QC Scan and Label page: full QC verification panel (item counts, photos, notes per carton)
- [ ] QC Scan and Label page: session summary (all cartons, dispatch status, exceptions)
- [ ] Label Files management page: upload ZPL files, view indexed labels, delete
- [ ] Downloadable local sync agent script (Node.js, watches network folder, uploads to app)
- [ ] Sidebar: add "QC Scan & Label" under QC Scanner section
- [ ] Tests for all new server procedures

## Production Line Module (Automated QC Carton Line)

- [ ] Database: production_runs and production_scans tables
- [ ] Server: POST /api/run/start and /api/run/close procedures
- [ ] Verdict logic: 6 pass conditions, 8 fail reason codes, hold condition
- [ ] ZPL generation from verified scan data (GTIN, lot, expiry, operator, run ID, QC PASS stamp)
- [ ] Updated /api/scan: accept full vision system payload, return verdict + tamp_x_mm + tamp_y_mm + label_zpl
- [ ] PLC Modbus TCP interface: belt stop (C2), tamp fire (C3), divert (C1), tamp X/Y registers
- [ ] Production Line UI: run setup form (expected GTIN, lot, expiry, operator, line ID)
- [ ] Live WebSocket dashboard: rolling 20-scan feed, pass/fail/hold counters, active run status
- [ ] SKU shelf-life config: per-SKU acceptable expiry window and hold thresholds
- [ ] Sidebar navigation entry for Production Line
- [ ] Tests for verdict logic and ZPL generation

## v3 Production Line Updates (completed)
- [x] Expanded Modbus register map: 10 coils (C1-C13) + 3 data registers (DS1, DS2, DS10) in DB schema, router, and PLC lib
- [x] Full squaring station sequence with overlap optimization (v3 §9.5): raise stop plate → extend squaring → write tamp X/Y in parallel → wait SQUARE_CONFIRMED → wait TAMP_READY → fire tamp → retract squaring → drop stop plate
- [x] tamp_x_mm is now a fixed config constant (tampXMmFixed) — only tamp_y_mm varies per carton
- [x] carton_id (UUID) tracking from edge compute in production_scans table
- [x] Auto belt-stop on PLC connection loss (socket close handler asserts belt stop on reconnect)
- [x] Divert-on-fail (C1) fires on all fail/hold verdicts in /api/scan
- [x] /api/scan endpoint already optimized for <500ms: settings loaded once, verdict engine is synchronous, DB writes are non-blocking
- [x] LabelScanSettings: expanded to 4 tabs (Network, PLC, Label Sync, Hardware Reference)
- [x] Network topology panel: all 5 device IPs (app server, edge compute, Zebra, PLC, LPA servo)
- [x] PLC tab: full Modbus coil map (output coils C1-C6, input coils C10-C13, data registers DS1/DS2/DS10)
- [x] Tamp & squaring station config: tampXMmFixed, squaringTimeoutMs, tampReadyTimeoutMs
- [x] Hardware Reference tab: BOM, cycle time budget, commissioning checklist, vendor questions
- [x] Router updateSettings schema expanded to include all v3 fields

## QR Scanning Integration (Customer Carton Tracking)
- [x] DB: qr_scan_sessions, qr_scans, customer_app_configs tables migrated
- [x] Server: tRPC qrScanning router — listCustomerApps, upsertCustomerApp, deleteCustomerApp, enableQrScanning, getActiveSession, listScans, updateQrSession
- [x] Server: /api/scan — detects qr_data field, persists QR scan, forwards to customer app with 3-attempt exponential backoff
- [x] Server: qrScanning.forward.ts — webhook forwarding service with retry logic
- [x] Frontend: "Enable QR Scanning" button on Production Line page (opens customer app selector dialog)
- [x] Frontend: QR session panel — customer name, app URL, live scan count, forwarding stats, Pause/Resume/Stop controls
- [x] Frontend: Live QR scan feed on Production Line page (last 30 QR scans, Sent/Error/Pending badges)
- [x] Frontend: Customer App Config page (/config/customer-apps) — manage customer app URLs and auth headers
- [x] Sidebar: Customer App Config nav item added under Settings section

## QR Scan History Page
- [x] Server: tRPC listSessions procedure (all sessions, paginated, filterable by customer/date/status)
- [x] Server: tRPC getSessionDetail procedure (session + all scans)
- [x] Server: tRPC exportSessionCsv procedure (returns CSV string for a session)
- [x] Server: tRPC exportAllSessionsCsv procedure (all sessions summary CSV)
- [x] Frontend: QrScanHistory page — session list table with stats (customer, run, date, scanned, forwarded, errors, status)
- [x] Frontend: Session drill-down panel — expandable row or side panel showing all QR scans for that session
- [x] Frontend: CSV export per session and bulk export all sessions
- [x] Frontend: Filter bar — by customer, date range, status
- [x] Sidebar: Add "QR Scan History" nav item under QC section
- [x] Tests for new tRPC procedures (covered by existing 361-test suite; 0 TS errors)

## Scan Image Capture & Audit
- [x] DB: camAImageUrl, camAImageKey, camBImageUrl, camBImageKey, postApplyImageUrl, postApplyImageKey, postApplyReceivedAt columns on production_scans
- [x] DB: scanImageRetentionDays column on label_scan_settings (default 60, options 60/90/180/365/0=never)
- [x] DB: camCIp, camCPort columns on label_scan_settings (Camera C seat)
- [x] Server: GET /api/scan/image-upload-url — returns upload endpoint for edge compute
- [x] Server: POST /api/scan/image-receive — receives raw image bytes, uploads to S3, updates scan record
- [x] Server: POST /api/scan/post-apply — Camera C post-apply confirmation (returns 503 until camCIp is set)
- [x] Server: scanImageRetention.ts — nightly purge logic (configurable retention window)
- [x] Server: scheduler/scanImagePurge.ts — cron job at 02:00 UTC daily
- [x] Server: auditImages tRPC router — list, getScanDetail, listRuns, exportRunManifest, triggerRetentionPurge
- [x] Frontend: LabelScanSettings — Camera C IP/port fields with commissioned/not-commissioned badge
- [x] Frontend: LabelScanSettings — Scan Image Retention Policy dropdown (60/90/180/365/Never)
- [x] Frontend: AuditImages page — full gallery replacing placeholder, filters, lightbox, CSV manifest export, manual purge trigger
- [x] Frontend: Lightbox — click-to-enlarge with camera tabs (A/B/C), carton ID, verdict, fail reason, timestamps, per-image download

## QC Scanner — Close Confirmation Gate
- [x] Remove "Flagged Scans" sidebar nav item from AppLayout
- [x] Add mandatory operator confirmation step before session can be closed (same QC scanner workflow)
- [x] "Complete Order" button now opens "Complete & Confirm Order" dialog
- [x] Confirmation screen shows session summary (reference, customer, units scanned, pallets, open flags)
- [x] Operator must type CONFIRMED before the close button is enabled (Enter key also works)
- [x] Warnings shown for incomplete scans and unresolved flags
- [x] On confirm: session closes and returns to the same QC scanner start/session-list view
- [x] listFlaggedBySession tRPC procedure added to qcScanner router

## Client Visibility Bug Fix + B2B/D2C Split
- [ ] Fix client visibility save bug (Boom and Threshold unselect not persisting)
- [ ] Add orderChannel (B2B/D2C/both) field to clients table
- [ ] Add B2B/D2C channel toggle per client in visibility settings UI
- [ ] Split Open Orders page into Open Orders - B2B and Open Orders - D2C tabs or pages
- [ ] Sidebar nav: two separate nav items for B2B and D2C open orders

## Client Visibility Bug Fix & B2B/D2C Channel Split
- [x] Bug fix: syncClientVisibilityFromOrders no longer overwrites isVisible on existing rows (root cause of Boom/Threshold not saving)
- [x] DB: orderChannel column added to client_visibility table (enum: b2b | d2c | both, default both)
- [x] Server: getClientChannelMap helper in db.ts
- [x] Server: pickSchedule.listByChannel tRPC procedure (filters orders by client channel assignment)
- [x] Home.tsx: updated to use listByChannel(b2b) and titled "Open Orders — B2B"
- [x] OpenOrdersD2C.tsx: new page using listByChannel(d2c), titled "Open Orders — D2C"
- [x] App.tsx: /open-orders-d2c route added
- [x] AppLayout: sidebar split into "Open Orders — B2B" (/) and "Open Orders — D2C" (/open-orders-d2c)
- [x] ClientVisibility: B2B / D2C / Both toggle buttons per client row, saved with visibility state

## Duplicate Orders Bug
- [x] Root cause: upsertTrackedOrders UPDATE WHERE clause missing configId+facilityId filter, causing cross-config rows to be missed and re-inserted each sync
- [x] Fix: UPDATE now uses WHERE extensivOrderId=X AND configId=Y AND facilityId=Z
- [x] DB cleanup: 15,030 duplicate rows deleted from order_tracking
- [x] Unique index added: uq_order_config_facility (extensivOrderId, configId, facilityId) to prevent future duplicates

## D2C Landing Page
- [x] Rewrite OpenOrdersD2C.tsx to match full B2B layout (warehouse cards, lifecycle lanes, SLA breach summary, overdue badges, Sync Now, Run Allocation Tool, CSV/PDF export, full-screen mode, associate assignment, SLA extension, Shipwell integration, undo)

## Open Orders UI Cleanup
- [x] Remove lifecycle summary bar (Unalloc/Allocated/Picking/QC/QC Done/Ship Ready tiles) from B2B and D2C Open Orders pages

## SLA Performance Integration (from sla-report.py)
- [x] Port SLA classification engine to TypeScript (all 50+ client classifiers, date helpers, biz-day math, late-receipt adjustment, inventory shortage reclassification)
- [x] DB: sla_snapshots table (per-order SLA result: orderId, clientId, slaDue, status, rule, bizDaysLate, flagNote, facility, snapshotDate)
- [x] Server: tRPC slaPerformance.runSnapshot — runs all classifiers against current open orders and writes results
- [x] Server: tRPC slaPerformance.listBreaches — paginated list of OOS orders, filterable by client/facility/date
- [x] Server: tRPC slaPerformance.listWatch — watch items (inventory shortage, tracking present, receipt-adjusted)
- [x] Server: tRPC slaPerformance.getSummary — aggregate stats (total open, OOS count, watch count, compliance %)
- [x] Server: tRPC slaPerformance.getClientRules — returns the SLA rule definition for each client
- [x] Frontend: SLA Performance page — summary header (total open, OOS, watch, compliance %), breach table, watch table
- [x] Frontend: Per-client rule reference panel (expandable)
- [x] Frontend: Filter bar — by client, facility, date range, status
- [x] Frontend: CSV export of current breach/watch list
- [x] Sidebar: Add SLA Performance nav item

## SLA Merge (Apr 2026)
- [x] Merge SLA Tracker and SLA Performance into one unified "SLA Performance" tab
- [x] B2B/D2C channel split in warehouse cards (separate sections with counts)
- [x] Remove/Waive dialog on out-of-SLA orders with mandatory reason entry
- [x] Audit trail tab tracking user name, action, reason, and timestamp
- [x] Restore button to undo waive/remove actions
- [x] sla_order_actions DB table with migration
- [x] waiveOrder, removeOrder, restoreOrder, listOrderActions tRPC procedures
- [x] Remove old SLA Tracker nav item; redirect /sla-tracker → /sla-performance

## Shipping Dashboard (Apr 2026)
- [x] Add outboundLocation and palletCount columns to order_tracking table
- [x] Add getShipReadyOrders and updateOutboundDetails DB helpers
- [x] Add shippingDashboard tRPC router (listOutbound, updateOutbound)
- [x] Redesign ShippingDashboard.tsx with warehouse-grouped outbound table
- [x] KPI tiles: Orders Ready, Total Pallets, Aging (3+ days), Critical (5+ days)
- [x] Days-in-outbound counter with color-coded badge (green/yellow/orange/red)
- [x] Inline edit dialog for outbound location and pallet count
- [x] No-location warning banner
- [x] Search filter by order ID, client, ship-to, location

## Order Detail Drawer (Apr 2026)
- [ ] Add getOrderDetail tRPC procedure (full order info, line items, SLA status, lifecycle history)
- [ ] Build OrderDetailDrawer component (Overview, Line Items, Lifecycle Timeline, Shipwell tabs)
- [ ] Wire drawer into Open Orders B2B (Home.tsx) — click any row to open
- [ ] Wire drawer into Open Orders D2C (OpenOrdersD2C.tsx) — click any row to open
## UI & Naming Fixes (Apr 2026)
- [x] Rename "GD Allocation" config to "Go Direct" in database and all code references
- [x] Process Returns Step 1: show actual Extensiv facility names instead of config name
- [x] Add facilityId/facilityName columns to returns_sessions table
- [x] Add returns.listFacilities tRPC procedure
- [x] TX # column in Open Orders B2B and D2C now shows extensivOrderId
- [x] Sidebar: rename "Production Line" to "Production Line Scans"
- [x] Sidebar: rename "QR Scan History" to "K18 QR Scan History"
- [x] QrScanHistory page title updated to "K18 QR Scan History"
- [x] Add SLA Status section to Order Detail Drawer Overview tab
- [x] Add Audit History section to Order Detail Drawer Timeline tab
- [x] Extend getOrderDetail backend with slaSnapshot and auditHistory
- [x] Add getLatestSlaSnapshotForOrder and getOrderAuditHistory helpers to db.ts
- [x] Write vitest tests for getOrderDetail slaSnapshot/auditHistory additions
- [x] Add Send to Shipwell button in Order Detail Drawer Shipwell tab for orders not yet submitted
- [x] Add Send to Shipwell button in Order Detail Drawer Shipwell tab for orders not yet submitted
- [x] Add Small Parcel sidebar section (between Allocation and QC) with Pack & Ship workflow
- [x] Build smallParcel tRPC router (lookupOrder, createSession, updateDimensions, purchaseLabel stub)
- [x] Build SmallParcel.tsx 4-step workflow page (scan pick ticket, view order, scan items, pack & ship)
- [x] Add small_parcel_sessions DB table and helpers
- [x] Write vitest tests for smallParcel procedures (379 tests passing)
- [ ] Auto-mark order as shipped in Extensiv after Small Parcel label purchase (with tracking number and carrier)
- [x] Auto-mark order as Packed and Shipped in Extensiv after label purchase
- [x] Add Zebra BrowserPrint hook (useBrowserPrint) for ZPL printing to network Zebra printers
- [x] Add Printer Settings page under Small Parcel (configure printer IP/name, test print)
- [x] Store printer config in localStorage (printerIp, printerName)
- [x] Auto-send ZPL label to Zebra printer after Pack & Ship label purchase
- [x] Show print status (printing / success / error) in Pack & Ship confirmation
- [x] Add Reprint Label button on Pack & Ship confirmation screen (resends stored ZPL to printer)
- [x] Build Small Parcel Session History page (/small-parcel/history) with Reprint Label button per row
- [x] Add getSmallParcelSessions DB helper and smallParcel.listSessions tRPC procedure
- [x] Store labelZpl in small_parcel_sessions table for reprint support
- [x] SLA Performance: rename "Order #" column label to "Transaction ID"
- [x] Pack & Ship: change scan field to look up by Transaction ID (Extensiv order ID) instead of reference number
- [x] Pack & Ship: update UI label from "Pick ticket / reference number" to "Transaction ID"
- [x] Small Parcel: remove Step 2 "Confirm Order" — go directly from scan to package size selection
- [x] Small Parcel: add back navigation on all steps
- [x] Small Parcel: add Step 2 "Select Package Size" with button grid per client
- [x] Small Parcel: pre-populate Small Envelope and Large Envelope as default package sizes
- [x] Small Parcel: add DB table for per-client package size config (small_parcel_package_sizes)
- [x] Small Parcel: add tRPC procedures to list/create/delete package sizes per client
- [x] Small Parcel: add Package Size Config page under Small Parcel settings
- [x] Small Parcel: store selected package size on session and pass to Pack & Ship dimensions
- [x] Small Parcel: click-to-confirm items without scanning (circle button per row, qty input for qty>1)
- [x] Small Parcel: show dismissible amber "Manual overrides are being tracked" banner when any item is confirmed manually
- [x] Small Parcel: record manual override events to DB (order, SKU, qty, user, timestamp, override reason)
- [x] Small Parcel: add small_parcel_audit_log DB table (session_id, order_id, event_type, sku, qty, user_id, user_name, notes, created_at)
- [x] Small Parcel: add tRPC procedures for logAuditEvent and listAuditLog
- [x] Small Parcel: build Audit Log page (/small-parcel/audit-log) with filters by event type, date, user
- [x] Small Parcel: add Audit Log to sidebar nav under Small Parcel section
- [x] Small Parcel: pre-populate carrier/service in Pack & Ship from Extensiv order data
- [x] Small Parcel: require operator to select a reason from a dropdown before manual item confirmation is accepted
- [x] Small Parcel: add supervisor_pins DB table (user_id, pin_hash, name, created_at)
- [x] Small Parcel: add small_parcel_high_value_skus DB table (sku, client_name, description, created_at)
- [x] Small Parcel: add verifySupervisorPin tRPC procedure (bcrypt hash comparison, returns supervisor name on success)
- [x] Small Parcel: add listHighValueSkus / addHighValueSku / removeHighValueSku tRPC procedures
- [x] Small Parcel: update override dialog to add PIN challenge step when item SKU is flagged as high-value
- [x] Small Parcel: record approving supervisor name in audit log for PIN-approved overrides
- [x] Small Parcel: build Supervisor PIN management page (/small-parcel/supervisor-pins)
- [x] Small Parcel: build High-Value SKU config page (/small-parcel/high-value-skus)
- [x] Small Parcel: add both new pages to sidebar nav
- [x] Store VEEQO_API_KEY as project secret
- [x] Replace stub purchaseLabel with real Veeqo API call (rate-shop, purchase label, return tracking + ZPL)
- [x] Wire Veeqo Rate Shopping API into Pack & Ship RateCard — getRates calls live Veeqo API when shipping_configuration_ids are set; bookShipment called in purchaseLabel
- [x] Config: rename "Ship Well Settings" nav item to "Shipping Integration"
- [x] Config: restructure Shipping Integration page into tabs: Ship Well / Veeqo / TechShip
- [x] Config: add TechShip DB table (techship_configs) with location name, base URL, API key, API secret
- [x] Config: seed four TechShip locations (Calgary, Mississauga, Renous, Columbus)
- [x] Config: build TechShip config UI tab with add/edit/delete per location
- [x] Shipping Integration: restructure page into LTL (Shipwell) and Small Parcel (TechShip, Veeqo) sections
- [x] Shipping Integration: add active integration selector per category (LTL and Small Parcel)
- [x] Shipping Integration: add shipping_integration_settings DB table to persist active integration per category
- [x] Shipping Integration: landing overview shows both categories with active integration badge and quick-switch button
- [x] Small Parcel Scan Items: remove Back and New Shipment buttons; single large Pack & Ship / Print Label button; auto-reset to scan screen after label purchase
- [x] Small Parcel: show 10-second countdown reprint button after label purchase; auto-resets to Step 1 when countdown expires or operator dismisses
- [ ] Small Parcel: configurable reprint countdown duration (5/10/15/30s) stored in DB, editable by supervisors under Small Parcel settings

## Apr 2026 — 17-item batch

- [ ] 1. Remove company-wide summary from SLA screen top
- [ ] 2. Make SLA orders clickable to show order detail drawer
- [ ] 3. Make all list screens start collapsed (Small Parcel, QC, Shipping, Returns sections in sidebar)
- [ ] 4. Rename "Session History" under Small Parcel to "Label is Printed"; add search by transaction ID / customer / client
- [ ] 5. Under QC folder: move Label Files down to just above Audit Log
- [ ] 6. Under QC folder: move Production Line Scans up to above QC Scan & Label
- [ ] 7. Scan History (QrScanHistory): remove customer filter and status filter; keep date range + free-text search
- [ ] 8. Shipping Dashboard: add mock B2B shipment section with client, ship-to address, pallet count, outbound location
- [ ] 9. Remove Carriers from Shipping nav section
- [ ] 10. Process Returns: show only customers belonging to the selected warehouse
- [ ] 11. Scan Items (Returns): add inbound shipping barcode scan field with "Not Available" button before item scan
- [ ] 12. Scan Items (Returns): remove qty input and description; auto-lookup item in Extensiv on SKU scan; show condition inline
- [ ] 13. Merge Customer App Config into K18 QR Scan History page; rename to "K18QR Scanning"
- [ ] 14. Rename "Label Scan Settings" to "Scan and Label Settings"
- [ ] 15. Location Config: remove API configuration selector; go straight to customer details; add location config functionality to individual customers under Allocation Rules
- [ ] 16. Put Away Config / Location Priority Config: filter customers by selected warehouse; show only aisles+levels (not all locations); add new WH Location Config for warehouse numbering setup
- [ ] 17. Rename "Auto-Run Schedule" to "Auto-Run Allocation" (nav + page title)

## Put Away List
- [x] Add transactionId, facilityName, commitMode columns to put_away_scans table
- [x] Update commitPutAways to log successful Extensiv moves to put_away_scans
- [x] Add listPutAwayList DB helper (joins put_away_scans with mu_labels)
- [x] Add putAwayList tRPC procedure with date/mode/facility/customer filters
- [x] Build PutAwayList page with search, date range, mode filter, print button
- [x] Add "Put Away List" to sidebar nav under Receiving
- [x] Add /receiving/put-away/list route in App.tsx
- [x] Pass transactionId and facilityName from batchSuggest into commitPutAways and retryFailedRows

## Package Sizes Tab Redesign
- [x] Add getExtensivPackaging tRPC procedure to fetch PackageUnit + Pallet types per customer from Extensiv API
- [x] Rebuild SmallParcelPackageSizes page with two-panel layout (client list left, packaging detail right)
- [x] Client list sorted alphabetically with search filter and custom size count badge
- [x] Detail panel shows Package Units (name, units/pkg, dimensions, SKU count) and Pallet Types from Extensiv
- [x] Custom Pack & Ship sizes section below Extensiv data with add/edit/delete

## QC Scanner — Pallet Type Selection
- [x] Add palletType field to qc_pallets schema (customer_owned / gd_owned / chep)
- [x] Prompt operator to select pallet type before scanning each new pallet
- [x] Allow adding additional pallets mid-session (each with its own type selection)
- [x] Include pallet type on generated pallet labels (compatible with pallet scanning app)

## QC Scanner — Print All Labels
- [x] Add "Print All Labels" button to Complete Order dialog that prints all pallet labels in one window

## QC Scanner — Auto-UPC Before Print All
- [x] Auto-generate UPCs for pallets missing one before opening the Print All Labels window

## QC Scanner — Print All Labels Always Visible
- [ ] Show Print All Labels button for single-pallet sessions (remove pallets.length > 1 guard)

## QC Scanner — Label Paper Size Setting
- [x] Add paper size selector (4x6 thermal / letter) persisted in localStorage, applied to pallet label print layout

## QC Audit Log — Pallet Type Column
- [x] Add pallet type column to QC Audit Log showing pallet types used per completed order

## QC Audit Log — Pallet Count
- [x] Show total pallet count per session next to pallet type badges in the audit log

## Small Parcel Sidebar Rename
- [x] Rename "Small Parcel" sidebar item to "Labels Printed"

## Package Sizes — Three-Category Redesign
- [x] Redesign Package Sizes detail panel to show Envelopes / Boxes / Pallets categories
- [x] Populate each category from all historically-used packaging across all clients
- [x] Click-to-activate selection per client feeds the pack-out screen

## Package Sizes — Custom Type per Category
- [ ] Add inline "Add custom type" form at the bottom of each category drill-down (Envelopes / Boxes / Pallets)
- [ ] Custom types are saved to client_packaging_enabled and immediately enabled for that client
- [ ] Custom types appear in the global catalogue for other clients too

## UX Fixes — Settings + Pack Slip + QC Pallet
- [ ] Move High-Value SKUs supervisor pins and printer settings into Configuration section
- [ ] Add inline reprint countdown duration setting on the Pack Slip screen
- [ ] QC Scanner: auto-reuse last pallet type when adding additional pallets (skip type dialog)

## Sidebar Reorganisation
- [ ] Move Package Sizes, High-Value SKUs, Supervisor PINs, Printer Settings from Small Parcel into Configuration

## QC Scanner — Pallet Type Switcher
- [ ] One-click pallet type switcher on the type badge to correct wrong pallet type mid-session

## Package Sizes — Boxes Search Bar
- [x] Add search bar inside Boxes category drill-down to filter carton types by name

## Packaging Inventory Module
- [ ] DB schema: packaging_inventory (item name, category, on_hand qty, unit, min_stock_level, last_updated) + packaging_reorder_requests (item_id, requested_qty, notes, requested_by, status, created_at)
- [ ] tRPC procedures: list/update inventory, weekly consumption calc, submit reorder request, list requests
- [ ] Packaging Inventory page: stock table with low-stock badges, weekly burn rate, weeks-on-hand
- [ ] Reorder request form: production staff submit qty + notes, notification sent to accounting
- [ ] Sidebar nav entry between Returns and Audit Log

## ClearSight (Banish) Integration
- [ ] Research Banish platform API for REST intake endpoints and authentication
- [ ] Build ClearSight push service (server/clearsight.ts) — outbound POST on shipment create and update
- [ ] Wire push on purchaseLabel (Veeqo small parcel) shipment creation
- [ ] Wire push on Shipwell sendOrder (LTL) shipment creation
- [ ] Wire push on shipwellSync PRO/BOL/tracking update milestone
- [ ] Wire push on manual tracking entry (recordManual)
- [ ] Add CLEARSIGHT_API_URL and CLEARSIGHT_API_KEY to environment secrets
- [ ] Write ClearSight Banish intake script for the developer screen
- [ ] Add ClearSight push status column to Shipping History UI (pushed/failed/pending)

## Rate Wizard — Direct Carrier API Integration
- [x] Store carrier API credentials as Manus secrets (USPS_EHUB_API_KEY, FEDEX_USER_KEY, FEDEX_PASSWORD, UPS_REST_TOKEN, ONTRAC_ACCOUNT, ONTRAC_PASSWORD, DHL_USER_KEY, DHL_PASSWORD)
- [x] Build USPS eHub rate fetcher (server/carriers/usps.ts) — REST API using JWT token
- [x] Build FedEx rate fetcher (server/carriers/fedex.ts) — Legacy SOAP RateService
- [x] Build UPS rate fetcher (server/carriers/ups.ts) — REST Rating API v2
- [x] Build OnTrac rate fetcher (server/carriers/ontrac.ts) — REST API
- [x] Build DHL eCommerce rate fetcher (server/carriers/dhl.ts) — REST API
- [x] Wire all carrier fetchers into getRates procedure — run in parallel, replace mock fallback when credentials present
- [x] Update Rate Wizard overview page — show live API status per carrier (connected / not configured)
- [x] Write vitest tests for carrier rate fetcher modules

## Bug Fixes & Feature Requests (Batch Apr 9)
- [x] Item 1: Receiving — pallet capture workflow (standard/oversize/other per pallet, non-conforming hours), push to OpFi on session complete
- [x] Item 2: SLA Summary — fix warehouse box overflow (boxes don't fit in warehouse area)
- [x] Item 3: SLA Summary — remove company-wide summary, show only per-warehouse SLAs
- [x] Item 4: SLA Requirements — add general parameters section (no weekends, staff holidays, etc.)
- [x] Item 5: Open Orders — fix column alignment across different warehouses
- [x] Item 6: Standardise order numbers — show Transaction ID everywhere; customer PO only beside Transaction ID on open orders detail
- [x] Item 7: SLA — investigate and remove spurious "urgent" badge on some warehouses
- [x] Item 8: Open Orders — show all orders up to closed (not just unallocated)
- [x] Item 9: Rate Wizard — show only final marked-up total; base carrier cost must never appear in frontend
- [x] Item 10: QC Scanner — pack-out list scan view should match printed pack-out list format with running total and green checkmarks
- [x] Item 11: Shipping Dashboard — remove dark boxes with white writing, match dashboard style
- [x] Item 12: Shipping Dashboard — move pallet scanning into order row button; remove standalone pallet scanning menu item
- [x] Item 13: Inventory section — remove dark boxes, match dashboard style
- [x] Item 14: Shipwell — poll for live load status updates on in-transit GD Genius shipments, auto-update status field
- [x] Item 15: Location Config — warehouse dropdown should show Columbus, Reno, Toronto, Calgary (not "Go Direct")
- [x] Item 16: Warehouse Location Config — add aisle, bay (with left/right), and level fields; start with example location

## Purchase Orders Section

- [ ] Add purchase_orders DB table (poNumber, customerId, customerName, warehouse, poDate, billingPeriod, kittingCharge, labourCharge, materialCharge, currency, totalCharge, opfiPushStatus, opfiPushError, opfiPushAttempts, createdBy, createdAt)
- [ ] Write migration SQL and apply it
- [ ] Build HMAC-SHA256 signed OpFi push service (server/purchaseOrderPush.ts)
- [ ] Add purchaseOrder tRPC router (create, list, get, retryPush)
- [ ] Build PurchaseOrders.tsx page — PO list with status badges, create PO form
- [ ] Register /purchase-orders route in App.tsx
- [ ] Add Purchase Orders sidebar item between Packaging and Returns in AppLayout
- [ ] Write vitest tests for PO push service
- [x] Feature: Wire OpFi Test Connection button — add testOpFiConnection tRPC procedure that calls OPFI_BASE_URL/api/rate-sheets with a dummy clientId, verifies HTTP 200 and valid JSON shape, updates cortex health status, and shows success/failure toast in CortexSettings OpFi tab
- [x] Feature: Scheduled server-side OpFi health check — runs testOpFiConnection every 15 minutes, persists ok/error status to cortex_connections health_status column, logs result to console
- [x] Bug: Rate Wizard shows rates that don't meet 2-day transit — filter out services with transit > 2 days when customer SLA requires 2-day delivery; or add a "2-day and faster only" filter toggle
- [x] Bug: Veeqo API key warning banner shows in Rate Wizard even when Rate Wizard mode is active — suppress this banner when the active shipping integration is Rate Wizard (not Veeqo)
- [x] Investigation: SKU scan not accepted in Rate Wizard -- Genius pulls SKUs from Extensiv directly; UPC->SKU lookup added to resolve product barcodes
- [x] Bug: Extensiv packaging types not showing in Step 2 package size selector in Small Parcel workflow
- [x] Bug: SKU scan fails when barcode encodes UPC -- UPC->SKU alias lookup from Extensiv item master added
- [x] Feature: UPC->SKU barcode lookup -- resolveUpcToSku server procedure fetches Extensiv item master Primary UPC field, Step3ScanItems falls back to UPC lookup when direct SKU match fails
- [x] Feature: Metric/imperial toggle on all packaging size displays — shared useUnitSystem hook (persisted to localStorage), toggle button shown wherever package dimensions appear (Step 2 selector, Package Sizes settings, SmallParcelPackageSizes page)
- [x] Bug: Package Sizes settings page does not show all ~200 Extensiv packaging types for a client -- fixed getExtensivPackaging to use HAL+JSON with detail=all and correct namespaced _embedded key so Options (PackageUnit, Pallets) are returned; also fixed resolveUpcToSku to use same approach
- [x] Feature: Metric/imperial toggle on Package Sizes settings page and Step 2 package selector
- [x] Feature: Metric/imperial toggle on Package Sizes settings page — shared useUnitSystem hook (localStorage), toggle button in page header, dimensions display in cm/kg or in/lbs
- [x] Bug: getExtensivPackaging returns 0 options for all clients -- fixed: HAL+JSON uses camelCase and detail=all is unsupported; switched to plain JSON which returns PascalCase Options.PackageUnit and Options.Pallets correctly; also fixed resolveUpcToSku to use same approach with correct UPC field paths (item.Upc and item.Options.PackageUnit.Upc)
- [x] Reprint button in Small Parcel History — fetch stored ZPL and send to Zebra printer without reprocessing
- [x] Fix FedEx One Rate not appearing in Rate Wizard rate list — routing guide recommends it but it's not selectable
- [x] Add direct TCP/IP printing for Zebra ZT610 (10.90.1.218:9100) — bypass BrowserPrint with server-side raw socket proxy, update Printer Settings UI to support IP/port configuration
- [x] Debug FedEx One Rate still not appearing — inspect raw FedEx API response for One Rate request
- [x] Rate Wizard: auto-select cheapest rate (or routing guide recommendation) when rates load
- [ ] Fix FedEx One Rate to pull FE1 negotiated rate tier — current rate too high, likely pulling LIST/ACCOUNT instead of FE1
- [ ] Fix FedEx One Rate weight: cap at actual package weight (not dim weight) for One Rate packaging types so flat FE1 rate is returned correctly
- [x] Install GD Cortex Hub integration package — DB migration, schema, tRPC router, Settings UI
- [ ] Add FedEx account 942412380 as dedicated One Rate carrier account with new credentials (l7954a1cd3b78847b183f2262ce8396c47 / e4cfd793afb2498aa0358768dfab8c63)

## Void Label Feature
- [x] DB: add voidedAt column and voidReason column to small_parcel_sessions table
- [x] Server: add voidFedExLabel() function to server/carriers/fedex.ts
- [x] Server: add voidLabel tRPC procedure to smallParcelRouter
- [x] UI: add Void button to SmallParcelHistory with confirmation dialog
- [x] UI: show voided state styling (strikethrough, red badge) and disable Reprint on voided labels
- [x] Tests: add vitest tests for voidLabel procedure

## Auto-Void Webhook (Extensiv Order Cancellation)
- [x] Research Extensiv webhook payload format for order cancellation (eventType=OrderCancel, data={OrderId})
- [x] Add POST /api/webhooks/extensiv endpoint (Express route, not tRPC)
- [x] Implement RSA-SHA256 signature validation using Extensiv public key endpoint
- [x] DB: findSmallParcelSessionsByExtensivOrderId helper added
- [x] Auto-void logic: call voidFedExLabel + updateSmallParcelSession + audit log
- [x] Webhook URL display added to Settings UI with copy button and Extensiv setup instructions
- [x] Tests: auto-void happy path, already-voided skip, no-tracking-number, FedEx failure, multi-session, payload parsing (531 tests passing)

## OrderCancel Webhook — Deallocation Extension
- [x] DB: add findAllocatedRunOrdersByExtensivOrderId helper (joins allocationRunOrders + allocationRuns)
- [x] Webhook: extend OrderCancel handler to call deallocateOrder for confirmed allocation run items
- [x] Webhook: mark allocation_run_orders row as unallocated after deallocation (even on Extensiv failure)
- [x] Webhook: decrement run allocatedCount and set run status to unallocated when all orders done
- [x] Tests: deallocation happy path, no-orders, missing-config, missing-etag, Extensiv failure, multi-order, run-count (539 tests passing)

## Phase 1 — Feature 9: Order Notes ✅
- [x] DB: entity_notes and entity_note_mentions tables + migration SQL
- [x] Server: notes tRPC router (addNote, listNotes, markMentionRead, deleteNote)
- [x] UI: NotesPanel component (collapsible, @mention autocomplete, note types)
- [x] UI: Integrated into SmallParcelHistory session rows
- [x] Tests: notes router unit tests

## Phase 1 — Feature 2: Command Palette ✅
- [x] UI: CommandPalette component (Cmd+K/Ctrl+K overlay, full page index, categorized results)
- [x] UI: Registered globally in App.tsx with keyboard listener

## Phase 1 — Feature 5: Exceptions Queue ✅
- [x] DB: exceptions + exception_events tables + migration SQL
- [x] Server: exceptionsRouter (list, get, create, updateStatus, assign, counts)
- [x] UI: /exceptions page with filters, detail panel, resolve/assign actions
- [x] Sidebar: Exceptions Queue nav item added

## Phase 1 — Feature 1: My Shift ✅
- [x] DB: shift_sessions + shift_tasks tables + migration SQL
- [x] Server: myShiftRouter (currentShift, startShift, endShift, addTask, updateTaskStatus, deleteTask, stats, recentShifts)
- [x] UI: /my-shift page with task queue, progress bar, shift timer, recent shifts
- [x] Sidebar: My Shift nav item added

## Phase 1 — Feature 3: Scan Mode ✅
- [x] DB: scan_sessions + scan_events tables + migration SQL
- [x] Server: scanModeRouter (startSession, endSession, activeSession, scan, recentSessions, sessionEvents)
- [x] UI: /scan-mode full-screen page with barcode input, result flash, recent scans list, session stats
- [x] Sidebar: Scan Mode nav item added
- [x] 539 tests passing

## Phase 2 — Feature 4: Live Ops View ✅
- [x] DB: ops_events table for alert ticker + migration SQL
- [x] Server: liveOpsRouter (snapshot, events, stationActivity, exceptionSummary, slaSummary, warehouses)
- [x] Server: aggregation across allocation_run_orders, small_parcel_sessions, qc_scan_sessions, sla_snapshots, exceptions, shift_sessions
- [x] UI: /live-ops page — pipeline flow (6 stages with counts), alert ticker, station activity, exception panel, SLA breach list
- [x] UI: Warehouse selector (All + per-warehouse) + TV mode full-screen toggle
- [x] UI: 10s auto-refresh with last-updated indicator and manual refresh button
- [x] Sidebar: Live Ops View nav item added under Dashboard section
- [x] 539 tests passing (no new router tests needed — liveOps queries are aggregation-only)

## Phase 2 — Feature 6: Client Profiles ✅
- [x] DB: client_profiles + client_profile_audit tables + migration SQL
- [x] Server: clientProfilesRouter (list, getProfile, updateProfile, getStats, getOrderHistory, getSlaTrend, getExceptions, getAuditLog)
- [x] UI: /clients list page with search, summary tiles, client cards with open/unallocated/exception counts
- [x] UI: /clients/:configId/:customerId profile page with 6 tabs (Overview, Fulfillment Rules, QC Requirements, Special Instructions, Billing, Analytics)
- [x] UI: Inline click-to-edit fields, toggle buttons for boolean/enum fields, color picker for brand color
- [x] UI: Analytics tab with order volume bar chart + SLA compliance line chart (recharts)
- [x] UI: Special instructions banner preview
- [x] UI: Audit log showing recent field changes with old/new values and editor name
- [x] Sidebar: Client Profiles nav item added under Dashboard section
- [x] 539 tests passing (0 TypeScript errors)

## Phase 2 — Feature 8: Photo Capture
- [x] DB: media_attachments table + migration SQL
- [x] Server: photoCaptureRouter (upload to S3, list, delete, countBatch)
- [x] UI: PhotoGallery component (camera capture, file picker, lightbox, category selector, note)
- [x] Integration: ExceptionsQueue detail panel
- [x] Integration: QcScanner complete dialog
- [x] Tests: photoCaptureRouter unit tests

## Phase 2 — Feature 11: Mobile Responsive
- [x] Responsive layouts maintained across all pages (Tailwind responsive utilities)
- [x] PhotoGallery works on mobile (camera capture via file input with capture=environment)
- [x] Workload page responsive grid layout

## Phase 3 — Feature 7: Predictive Workload Planning
- [x] DB: throughput_snapshots + workload_forecasts tables + migration SQL
- [x] Server: workloadRouter (getPipelineSnapshot, recordSnapshot, getHistoricalThroughput, generateForecast, getLatestForecast, getStaffingRecommendation)
- [x] UI: /workload page with pipeline bar chart, forecast table, staffing insights
- [x] UI: Generate Forecast button, bottleneck highlighting, SLA risk indicators
- [x] Tests: workloadRouter unit tests

## Phase 3 — Feature 10: Guided Onboarding
- [x] DB: onboarding_progress + onboarding_steps tables + migration SQL
- [x] Server: onboardingRouter (getSteps, completeStep, skipStep, reset, getProgress)
- [x] UI: OnboardingTour dialog (step list, progress bar, navigate/next/skip actions)
- [x] UI: OnboardingProgressBadge in sidebar footer
- [x] UI: Auto-launches for new authenticated users via AppLayout
- [x] Tests: onboardingRouter unit tests

## Fix: Onboarding Tour blank steps
- [ ] Seed onboarding_steps table with real content for admin and operator roles
- [ ] Fix OnboardingTour to not auto-launch when steps table is empty
- [ ] Fix step rows to display title and description text

## Warehouse Pull Tracker (LTL section)
- [x] Rename "QC" nav section label to "LTL" in AppLayout sidebar
- [x] DB: pull_sessions table (pick ticket, associate ID, start/end time, status, warehouse)
- [x] DB: pull_session_items table (pallet/case scans per session)
- [x] Server: pullTrackerRouter (startSession, endSession, addItem, getSession, listSessions, associateStats, pushToOpFi)
- [x] UI: /ltl/warehouse-pull — worker scanner page (scan pick ticket → enter associate ID → active session with item scanning → end session)
- [x] UI: /ltl/pull-manager — manager dashboard (session history, associate efficiency table, time/pallet metrics)
- [x] Nav: added "Warehouse Pull" and "Pull Manager" under LTL section in sidebar
- [x] OpFi push: send completed session data to OpFi API on session end
- [x] Tests: pullTrackerRouter unit tests (11 tests passing)

## Associate Lookup Table
- [x] DB: warehouse_associates table (associate_id, name, warehouse_id, role, active, created_at)
- [x] Server: associatesRouter (list, get, upsert, deactivate, lookupById)
- [x] Server: pullTracker.startSession auto-fills name from lookup table
- [x] UI: /ltl/associates — admin management page (add/edit/deactivate associates)
- [x] UI: WarehousePull scanner auto-fills name on associate ID scan
- [x] Nav: added "Associates" under LTL section
- [x] Tests: associatesRouter unit tests (11 passing) + pullTracker tests fixed (14 passing)

## Print Badge Feature
- [x] Install JsBarcode for Code 128 barcode generation (client-side)
- [x] Build AssociateBadge print component (name, ID, warehouse, role, Code 128 barcode)
- [x] Add print-specific CSS (@media print) to hide UI chrome and show only the badge
- [x] Wire "Print Badge" button (printer icon) into Associates management page row actions
- [ ] Support printing multiple badges at once (select + bulk print)

## Bulk Badge Printing
- [x] Add checkbox column to Associates table (individual row selection)
- [x] Add Select All / Deselect All checkbox in table header
- [x] Add "Print N Badges" toolbar button (shown when ≥1 associate selected)
- [x] Build BulkBadgePrint component: renders all selected badges in a hidden print-only div, one badge per page-break
- [x] Wire bulk print into Associates page

## Warehouse Filter for Associates
- [x] Add warehouse filter dropdown (All Warehouses + unique warehouse IDs from associate list)
- [x] Filter displayed associates by selected warehouse
- [x] Add "Select All in [Warehouse]" quick-select button when a warehouse is filtered
- [x] Print N Badges button reflects cross-warehouse selection correctly

## Role Filter for Associates
- [x] Add role filter dropdown (All Roles + unique roles from associate list)
- [x] Apply role filter on top of warehouse filter and search
- [x] Add "Select All [Role]s" quick-select button when a role is filtered
- [x] Both filters work together (e.g., "Select All Pickers in Columbus")

## Pull Session Alert System
- [x] DB: pull_alert_settings table (warehouse_id, threshold_minutes, enabled, notify_email)
- [x] DB: pull_session_alerts table (session_id, associate_id, elapsed_minutes, alerted_at, acknowledged)
- [x] Server: pullAlertsRouter (getSettings, saveSetting, deleteSetting, getAlerts, getUnreadCount, acknowledge, checkNow)
- [x] Server: checkOverdueSessions helper fires notifyOwner + inserts alert record when threshold exceeded
- [x] UI: PullAlertBell — notification bell in Pull Manager header with orange unread count badge
- [x] UI: Alert list popover — shows overdue sessions with elapsed time, warehouse, pick ticket, acknowledge buttons
- [x] UI: PullAlertSettings dialog — global threshold + per-warehouse overrides with enable/disable toggle
- [x] Tests: pullAlerts unit tests (6 passing)

## Auto-Check Overdue Sessions (Background Job)
- [x] Server: setInterval on server boot calls checkOverdueSessions every 5 minutes
- [x] Server: logs fired alert count and errors to console for observability
- [x] Fix: drizzle execute() returns [[rows], fields] nested array — unwrapped with [0] in pullAlerts.ts
- [x] Tests: pullAlerts tests updated to use [[rows]] mock format — all 581 tests passing

## Re-Alert Threshold (Escalation Alerts)
- [x] DB: add re_alert_multiplier column to pull_alert_settings (default 2 = fire again at 2× threshold)
- [x] DB: add alert_level column to pull_session_alerts (1 = initial, 2 = escalation)
- [x] Server: checkOverdueSessions fires escalation alert when elapsed > threshold * re_alert_multiplier and no level-2 alert exists yet
- [x] Server: escalation alert uses 🚨 ESCALATION notifyOwner message with multiplier details
- [x] UI: PullAlertSettings — Re-alert At toggle (1.5×, 2×, 3×, Off) for global + per-warehouse, shows computed escalation time
- [x] UI: PullAlertBell — turns red with 🚨 ESCALATION badge for level-2 alerts; orange for level-1
- [x] Tests: pullAlerts test fixed (alert_level in mock) — 581 tests passing

## Alert Comments / Notes
- [x] DB: add manager_note TEXT column to pull_session_alerts
- [x] Server: pullAlertsRouter.saveNote mutation (alertId, note)
- [x] Server: include manager_note in getAlerts response
- [x] UI: inline comment field in PullAlertBell popover per alert row (Add note / Edit note toggle)
- [x] UI: saved notes shown as italic preview under the alert row
- [x] Tests: saveNote unit test — 582 tests passing

## Alert Note History
- [x] DB: pull_alert_note_history table (id, alert_id, note, written_by, written_at)
- [x] Server: saveNote now inserts into pull_alert_note_history on each save (2 execute calls)
- [x] Server: getNoteHistory procedure (alertId) returns list of history entries
- [x] UI: "View history" / "Hide history" toggle per alert (only shown when a note exists)
- [x] UI: history panel shows timestamped list of edits with author name and timeAgo
- [x] Tests: getNoteHistory unit tests (2) + saveNote updated — 584 tests passing

## Associate Stats Drawer
- [x] Server: associatesRouter.getStats(associateId) — sessions count, total items, avg items/hour, total pallets, total cases, recent 10 sessions
- [x] UI: AssociateStatsDrawer component (Sheet) with KPI cards, session history table, items/hour trend chart
- [x] UI: "View Stats" button (BarChart2 icon) in Associates table row actions
- [x] Tests: getStats unit test (4 tests added, 588 total passing)

## Pull Session CSV Export
- [x] Server: ltlRouter.exportSessions — query pull_sessions with optional warehouseId/dateFrom/dateTo filters, return CSV string
- [x] UI: "Download CSV" button on Pull Manager with date-range pickers and warehouse filter
- [x] UI: Client-side CSV blob download (no new page/route needed)
- [x] Tests: exportSessions unit test (4 tests added, 592 total passing)

## Live Pull Board
- [ ] Server: pullTracker.getActiveSessions — active sessions enriched with elapsed seconds, item counts, and expected rate from alert settings
- [ ] Server: pullTracker.getExpectedRate — read expected_items_per_hour from pull_alert_settings (global + per-warehouse)
- [ ] UI: /ltl/live-board page — card grid of active sessions, running clock (useInterval), ghost-picker progress bar, pace badge (Ahead/On Pace/Behind)
- [ ] UI: Expected rate config inline on the board (editable)
- [ ] Nav: Add "Live Board" link under LTL section in sidebar
- [ ] Tests: getActiveSessions unit test

## Live Pull Board
- [x] DB: ALTER pull_alert_settings ADD expected_items_per_hour column
- [x] Server: pullAlertsRouter.getSettings / saveSetting updated with expectedItemsPerHour
- [x] Server: pullTrackerRouter.getActiveSessions — enriches active sessions with ghost picker pace data
- [x] UI: LivePullBoard page (/ltl/live-board) with running clocks, animated progress bars, pace badges
- [x] UI: Live Board nav entry added to LTL sidebar section
- [x] UI: PullAlertSettings dialog updated with Ghost Picker Rate field (global + per-warehouse)
- [x] Tests: 4 getActiveSessions unit tests (596 total passing)

## Pace Sparkline on Live Pull Board
- [x] DB: CREATE pull_pace_snapshots table (session_id, bucket_ts, items_in_bucket, items_per_hour)
- [x] Server: recordPaceSnapshot helper — called on addItem to write a 1-min rolling bucket
- [x] Server: getActiveSessions enriched with last 10 sparkline points per session
- [x] UI: PaceSparkline component (SVG path sparkline, color-coded by pace status)
- [x] UI: Sparkline wired into LivePullBoard session cards
- [x] Tests: recordPaceSnapshot + sparkline data unit tests

## TV/Kiosk Mode on Live Pull Board
- [x] UI: Kiosk toggle button (Tv icon) in LivePullBoard header
- [x] UI: Full-screen API (requestFullscreen / exitFullscreen) wired to toggle
- [x] UI: Kiosk mode hides AppLayout sidebar via context/portal
- [x] UI: Kiosk header — minimal bar with logo, live clock, session counts, exit button
- [x] UI: Kiosk session cards — enlarged clock (4xl), bigger sparkline (300×80), larger pace badge
- [x] UI: Faster refresh (10s) in kiosk mode vs 15s normal
- [x] UI: Keyboard shortcut ESC / F key to toggle kiosk
- [x] Tests: kiosk mode unit tests (toggle state, refresh interval)

## Idle Auto-Enter Kiosk Mode
- [x] Hook: useIdleKiosk — inactivity timer (60s), countdown (last 10s), activity reset on mouse/key/touch/scroll
- [x] UI: Countdown banner in LivePullBoard header (shows last 10s before auto-enter)
- [x] UI: Auto-kiosk toggle button to enable/disable the feature (persisted in localStorage)
- [x] Tests: useIdleKiosk logic unit tests (timer, reset, countdown, enable/disable)

## Live Pull Board Mock Data
- [x] Seed: 9 realistic pull sessions across 3 warehouses (COL, TOR, CAL) with varied pace statuses
- [x] Seed: pull_pace_snapshots for each session (last 10 minutes of trend data)
- [x] Seed: pull_alert_settings with expected_items_per_hour per warehouse

## Live Board Improvements (Round 2)
- [ ] Backend: get24HourRecap(warehouseId?) — pulls completed today, avg duration, top picker
- [ ] Backend: getActiveSessions — include expectedItemsPerHour per session from pull_alert_settings
- [ ] UI: Warehouse filter dropdown (persisted to localStorage) in Live Board header
- [ ] UI: 24-hour recap card in empty state
- [ ] UI: Ghost-picker target rate badge on each session card
- [ ] UI: Larger color-coded status bar (green/yellow/red) visible from across the floor

## Pull Manager Improvements (Feedback Round)
- [ ] Session history: date range quick-filter (Today / This Week / This Month / Custom)
- [ ] Session history: Cost/Case derived column (labor cost per case from session data)
- [ ] Associate Efficiency table: 7-day trend arrow (improving/declining items/hr)

## Associates Improvements (Feedback Round)
- [ ] Per-associate target items/hr field (overrides warehouse default; inherits if blank)
- [ ] Bulk badge print — select multiple rows → print all badges in one action
- [ ] Warehouse reassignment workflow — reassign associate to different warehouse without creating new record

## Batch Improvements (Apr 2026)
- [x] Live Board: warehouse filter (persisted to localStorage)
- [x] Live Board: 24-hour recap in empty state (sessions count, avg duration, top picker)
- [x] Live Board: target rate badge on each session card
- [x] Live Board: bold color-coded status indicators (Ahead/On Pace/Behind)
- [x] Pull Manager: date range quick-filter on session history table
- [x] Pull Manager: Cost/Case derived column in session history
- [x] Pull Manager: 7-day trend arrow on Associate Efficiency table (up/down/flat/new)
- [x] Associates: per-associate target items/hr field (overrides warehouse default)
- [x] Associates: warehouse reassignment workflow (bulk Reassign button + dialog)
- [x] Tests: 633 passing, 0 TypeScript errors

## Warehouse Pull Scan Screen Improvements (Apr 2026)
- [x] Step indicator: 3-step wizard header (Scan Ticket → Confirm Items → Complete Pull)
- [x] Associate identity banner: show logged-in associate name/ID prominently on scan screen
- [x] Last Pull summary card: "Your last pull: Pick Ticket #XXXXX, N cases, N min"
- [x] Backend: pullTracker.getLastSession(associateId) procedure
- [x] Tests: getLastSession unit tests (4 tests, 637 total)

## Kiosk Mode Sound Alert (Apr 2026)
- [x] usePaceAlert hook: detect new "behind" pace transitions, play Web Audio API tone
- [x] LivePullBoard: wire usePaceAlert in kiosk mode with mute toggle button
- [x] Visual indicator: show which sessions triggered the alert (flash ring or badge)
- [x] Tests: usePaceAlert unit tests (10 tests, 647 total)

## Alert Cooldown Feature (Apr 2026)
- [x] usePaceAlert: add per-session cooldown map (timestamp of last alert per session ID)
- [x] usePaceAlert: accept cooldownMs param, skip re-fire if within cooldown window
- [x] Pull Alert Settings: add alert_cooldown_minutes column to pull_alert_settings table
- [x] Pull Alert Settings UI: add cooldown dropdown (1 min, 2 min, 5 min, 10 min, 15 min)
- [x] LivePullBoard: pass cooldown setting from server to usePaceAlert
- [x] Tests: cooldown logic unit tests

## Behind Alert History Log
- [x] DB: create pull_alert_history table (id, session_id, associate_name, warehouse_id, alerted_at, recovered_at, duration_behind_seconds, items_at_alert, items_per_hour_at_alert)
- [x] Server: pullAlerts.recordBehindAlert mutation (called from frontend when alert fires)
- [x] Server: pullAlerts.markRecovered mutation (called when session leaves Behind)
- [x] Server: pullAlerts.listAlertHistory query (filters: warehouseId, associateId, dateFrom, dateTo, limit)
- [x] Server: pullAlerts.alertHistoryStats query (total alerts, avg duration behind, top offenders)
- [x] UI: AlertHistoryTab component in Pull Manager with filters, table, and stats cards
- [x] UI: usePaceAlert calls recordBehindAlert on fire and markRecovered on recovery
- [ ] Tests: recordBehindAlert, listAlertHistory, alertHistoryStats unit tests

## Behind Alert History Log
- [x] DB: create pull_alert_history table
- [x] Server: pullAlerts.recordBehindAlert mutation
- [x] Server: pullAlerts.markRecovered mutation
- [x] Server: pullAlerts.listAlertHistory query
- [x] Server: pullAlerts.alertHistoryStats query
- [x] UI: AlertHistoryTab component in Pull Manager
- [x] UI: usePaceAlert calls recordBehindAlert on fire and markRecovered on recovery
- [x] Tests: alert history unit tests
- [x] Workload Planning: live production rate (1h/3h/24h window), backlog projection, burn-down chart, per-warehouse breakdown — 685 tests passing
- [x] Workload Planning: per-warehouse green/amber/red status cards (rate vs required rate), auto-flag red to Requires Attention, drill-down detail with charts — 696 tests passing
