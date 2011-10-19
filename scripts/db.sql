CREATE TABLE `mentions` (
  `id` bigint(20) NOT NULL DEFAULT '0',
  `uid` bigint(20) DEFAULT NULL,
  `retweet_id` bigint(20) DEFAULT '0',
  `reply_id` bigint(20) DEFAULT '0',
  `data_str` text,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;