-- Migration Schema for D1 Database

-- 1. Table to store user roles inside specific companies/businesses
CREATE TABLE IF NOT EXISTS user_business_roles (
    id TEXT PRIMARY KEY,
    uid TEXT NOT NULL,
    email TEXT NOT NULL,
    business_id TEXT NOT NULL,
    role TEXT CHECK(role IN ('o', 'm', 's')) NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE(uid, business_id)
);

CREATE INDEX IF NOT EXISTS idx_user_business_roles_biz ON user_business_roles(business_id);
CREATE INDEX IF NOT EXISTS idx_user_business_roles_email ON user_business_roles(email);

-- 2. Table to store orders
CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    uid TEXT NOT NULL,
    business_id TEXT NOT NULL,
    amount REAL NOT NULL,
    status TEXT NOT NULL, -- 'pending', 'completed', 'cancelled'
    created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_orders_uid ON orders(uid);
CREATE INDEX IF NOT EXISTS idx_orders_biz ON orders(business_id);

-- 3. Table to store payments associated with orders
CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL,
    amount REAL NOT NULL,
    method TEXT NOT NULL, -- 'card', 'bank', 'crypto'
    status TEXT NOT NULL, -- 'initiated', 'succeeded', 'failed'
    created_at INTEGER NOT NULL,
    FOREIGN KEY (order_id) REFERENCES orders(id)
);

CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments(order_id);

-- 4. Table to track current active FCM and device sessions per browser ID / UID
CREATE TABLE IF NOT EXISTS user_device_sessions (
    browser_client_id TEXT PRIMARY KEY,
    uid TEXT NOT NULL, -- can be 'guest' or Firebase UID
    device_token TEXT NOT NULL, -- FCM Token
    client_name TEXT NOT NULL, -- browser / client platform info
    updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_user_device_sessions_uid ON user_device_sessions(uid);
