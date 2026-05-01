-- Migration: Add shipping_documents table
-- Tracks BOL, customs documents, and pallet labels for outbound orders.

CREATE TABLE IF NOT EXISTS `shipping_documents` (
  `id` int AUTO_INCREMENT PRIMARY KEY NOT NULL,
  `order_tracking_id` int NOT NULL,
  `doc_type` enum('bol','customs','pallet_label','other') NOT NULL,
  `file_name` varchar(512) NOT NULL,
  `file_url` varchar(1024) NOT NULL,
  `file_key` varchar(512) NOT NULL,
  `mime_type` varchar(128) NOT NULL DEFAULT 'application/pdf',
  `file_size_bytes` int,
  `note` varchar(256),
  `uploaded_by` varchar(256),
  `created_at` timestamp NOT NULL DEFAULT (now())
);

CREATE INDEX `shipping_documents_order_idx` ON `shipping_documents` (`order_tracking_id`);
