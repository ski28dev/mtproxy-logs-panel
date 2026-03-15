CREATE TABLE IF NOT EXISTS admins (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(100) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS proxy_secrets (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  label VARCHAR(255) NOT NULL,
  group_name VARCHAR(255) NULL,
  note TEXT NULL,
  status ENUM('active', 'revoked') NOT NULL DEFAULT 'active',
  raw_secret CHAR(32) NOT NULL UNIQUE,
  client_secret TEXT NOT NULL,
  fake_host VARCHAR(255) NOT NULL,
  port INT NOT NULL,
  max_unique_ips INT NOT NULL DEFAULT 10,
  current_slot INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  revoked_at DATETIME NULL
);

CREATE TABLE IF NOT EXISTS proxy_secret_runtime_history (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  proxy_secret_id BIGINT UNSIGNED NOT NULL,
  slot_index INT NOT NULL,
  applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  removed_at DATETIME NULL,
  CONSTRAINT fk_proxy_secret_runtime_history_secret
    FOREIGN KEY (proxy_secret_id) REFERENCES proxy_secrets(id)
    ON DELETE CASCADE,
  INDEX idx_proxy_secret_runtime_history_slot_time (slot_index, applied_at, removed_at)
);

CREATE TABLE IF NOT EXISTS proxy_secret_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  proxy_secret_id BIGINT UNSIGNED NOT NULL,
  event_type ENUM('handshake_ok', 'disconnect') NOT NULL DEFAULT 'handshake_ok',
  slot_index INT NOT NULL,
  connection_fd INT NULL,
  client_ip VARCHAR(64) NOT NULL,
  remote_port INT NULL,
  connected_at DATETIME NOT NULL,
  duration_seconds DECIMAL(12,3) NULL,
  source_line TEXT NOT NULL,
  CONSTRAINT fk_proxy_secret_events_secret
    FOREIGN KEY (proxy_secret_id) REFERENCES proxy_secrets(id)
    ON DELETE CASCADE,
  INDEX idx_proxy_secret_events_secret_time (proxy_secret_id, connected_at),
  INDEX idx_proxy_secret_events_secret_type_time (proxy_secret_id, event_type, connected_at),
  INDEX idx_proxy_secret_events_ip_time (client_ip, connected_at)
);

CREATE TABLE IF NOT EXISTS app_meta (
  meta_key VARCHAR(120) NOT NULL PRIMARY KEY,
  meta_value TEXT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
