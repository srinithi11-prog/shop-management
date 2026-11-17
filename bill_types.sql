-- Retail / Wholesale / Return bills
-- The server runs this automatically the first time it starts after the update.
-- Run it by hand (MySQL Workbench) only if the server says it could not.
USE shop_management;

ALTER TABLE bills      ADD COLUMN bill_type VARCHAR(10) NOT NULL DEFAULT 'RETAIL';   -- RETAIL / WHOLESALE / RETURN
ALTER TABLE bill_items ADD COLUMN restocked TINYINT NOT NULL DEFAULT 1;              -- 0 = returned item NOT added back to stock
ALTER TABLE products   ADD COLUMN wholesale_price DECIMAL(10,2) NULL;                -- price used on wholesale bills

-- If a line says "Duplicate column name", that column already exists - carry on with the next line.
