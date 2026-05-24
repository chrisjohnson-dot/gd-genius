CREATE TABLE IF NOT EXISTS `team_accounts` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `username` varchar(128) NOT NULL UNIQUE,
  `passwordHash` varchar(256) NOT NULL,
  `name` varchar(256) NOT NULL,
  `role` varchar(64) NOT NULL DEFAULT 'qc_operator',
  `active` boolean NOT NULL DEFAULT true,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
