-- Custom SQL migration file, put your code below! --
CREATE TABLE `sla_order_actions` (
  `id` int AUTO_INCREMENT NOT NULL,
  `extensivOrderId` int NOT NULL,
  `referenceNum` varchar(256),
  `clientId` int NOT NULL,
  `clientName` varchar(256) NOT NULL,
  `facilityId` int NOT NULL,
  `facilityName` varchar(256),
  `action` enum('remove','waive') NOT NULL,
  `reason` text NOT NULL,
  `performedByUserId` varchar(128) NOT NULL,
  `performedByName` varchar(256),
  `performedAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `sla_order_actions_id` PRIMARY KEY(`id`)
);