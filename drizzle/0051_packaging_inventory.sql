CREATE TABLE `packaging_inventory` (
  `id` int AUTO_INCREMENT PRIMARY KEY NOT NULL,
  `configId` int NOT NULL,
  `name` varchar(255) NOT NULL,
  `category` enum('envelope','box','pallet') NOT NULL,
  `unit` varchar(64) NOT NULL DEFAULT 'each',
  `onHandQty` int NOT NULL DEFAULT 0,
  `minStockLevel` int NOT NULL DEFAULT 0,
  `notes` text,
  `createdAt` timestamp NOT NULL DEFAULT NOW(),
  `updatedAt` timestamp NOT NULL DEFAULT NOW() ON UPDATE NOW()
);

CREATE TABLE `packaging_reorder_requests` (
  `id` int AUTO_INCREMENT PRIMARY KEY NOT NULL,
  `inventoryItemId` int NOT NULL,
  `configId` int NOT NULL,
  `requestedQty` int NOT NULL,
  `notes` text,
  `requestedByUserId` int NOT NULL,
  `requestedByName` varchar(255) NOT NULL,
  `status` enum('pending','ordered','received','cancelled') NOT NULL DEFAULT 'pending',
  `fulfilledAt` timestamp,
  `createdAt` timestamp NOT NULL DEFAULT NOW(),
  `updatedAt` timestamp NOT NULL DEFAULT NOW() ON UPDATE NOW()
);
