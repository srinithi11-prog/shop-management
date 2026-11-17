-- Merge customers that have the same name into ONE customer (oldest record is kept).
-- BACK UP FIRST:  mysqldump -u shopuser -p1234 shop_management > backup.sql
-- Run:  mysql -u shopuser -p1234 shop_management < merge_duplicate_customers.sql
USE shop_management;

DROP TEMPORARY TABLE IF EXISTS cust_map;
CREATE TEMPORARY TABLE cust_map AS
SELECT c.customer_id AS old_id,
       (SELECT MIN(c2.customer_id) FROM customers c2
         WHERE LOWER(TRIM(c2.name)) = LOWER(TRIM(c.name))) AS keep_id
FROM customers c;

-- Combine balances and regular flag into the kept customer
UPDATE customers k
JOIN (SELECT m.keep_id, SUM(c.balance) AS bal, MAX(COALESCE(c.is_regular,0)) AS reg
        FROM cust_map m JOIN customers c ON c.customer_id = m.old_id
       GROUP BY m.keep_id) t ON t.keep_id = k.customer_id
SET k.balance = t.bal, k.is_regular = t.reg;

-- Fill phone if the kept record has none
UPDATE customers k
JOIN (SELECT m.keep_id, MAX(NULLIF(c.phone,'')) AS ph
        FROM cust_map m JOIN customers c ON c.customer_id = m.old_id GROUP BY m.keep_id) t
  ON t.keep_id = k.customer_id
SET k.phone = t.ph WHERE (k.phone IS NULL OR k.phone = '') AND t.ph IS NOT NULL;

-- Point every record at the kept customer
UPDATE bills b JOIN cust_map m ON b.customer_id = m.old_id SET b.customer_id = m.keep_id WHERE m.old_id <> m.keep_id;
UPDATE credit_payments p JOIN cust_map m ON p.customer_id = m.old_id SET p.customer_id = m.keep_id WHERE m.old_id <> m.keep_id;
UPDATE quotations q JOIN cust_map m ON q.customer_id = m.old_id SET q.customer_id = m.keep_id WHERE m.old_id <> m.keep_id;

-- Remove the now-empty duplicates
DELETE c FROM customers c JOIN cust_map m ON c.customer_id = m.old_id WHERE m.old_id <> m.keep_id;

SELECT 'Duplicate customers merged' AS status;
