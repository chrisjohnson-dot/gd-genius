CREATE TABLE `sku_weight_overrides` (
  `id` int AUTO_INCREMENT PRIMARY KEY NOT NULL,
  `config_id` int NOT NULL,
  `customer_id` int NOT NULL,
  `sku` varchar(100) NOT NULL,
  `carton_weight_lb` decimal(10,4) NOT NULL,
  `units_per_carton` int,
  `note` varchar(256),
  `created_at` timestamp NOT NULL DEFAULT NOW(),
  `updated_at` timestamp NOT NULL DEFAULT NOW() ON UPDATE NOW(),
  UNIQUE KEY `sku_weight_overrides_config_sku_unique` (`config_id`, `customer_id`, `sku`)
);
