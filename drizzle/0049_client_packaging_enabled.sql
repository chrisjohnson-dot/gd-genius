CREATE TABLE `client_packaging_enabled` (
  `id` int AUTO_INCREMENT PRIMARY KEY NOT NULL,
  `configId` int NOT NULL,
  `clientId` int NOT NULL,
  `clientName` varchar(256) NOT NULL,
  `category` varchar(32) NOT NULL,
  `typeName` varchar(128) NOT NULL,
  `enabled` boolean NOT NULL DEFAULT true,
  `sortOrder` int NOT NULL DEFAULT 0,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE INDEX `cpe_config_client_cat_type_idx` (`configId`, `clientId`, `category`, `typeName`)
);
