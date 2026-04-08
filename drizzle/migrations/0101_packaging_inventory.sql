-- packaging_inventory: tracks on-hand stock levels for each packaging type
CREATE TABLE IF NOT EXISTS `packaging_inventory` (
  `id` int AUTO_INCREMENT NOT NULL,
  `config_id` int NOT NULL,
  `name` varchar(200) NOT NULL,
  `category` enum('envelope','box','pallet') NOT NULL DEFAULT 'box',
  `unit` varchar(50) NOT NULL DEFAULT 'each',
  `on_hand_qty` int NOT NULL DEFAULT 0,
  `min_stock_level` int NOT NULL DEFAULT 0,
  `notes` varchar(500),
  `updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `packaging_inventory_id` PRIMARY KEY(`id`)
);

-- packaging_reorder_requests: reorder requests submitted by production staff
CREATE TABLE IF NOT EXISTS `packaging_reorder_requests` (
  `id` int AUTO_INCREMENT NOT NULL,
  `config_id` int NOT NULL,
  `inventory_item_id` int NOT NULL,
  `requested_qty` int NOT NULL,
  `notes` varchar(1000),
  `requested_by_user_id` varchar(200),
  `requested_by_name` varchar(200),
  `status` enum('pending','ordered','received','cancelled') NOT NULL DEFAULT 'pending',
  `fulfilled_at` timestamp,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `packaging_reorder_requests_id` PRIMARY KEY(`id`)
);
