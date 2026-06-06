const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");

const app = express();
app.use(express.json());
app.use(cors());
const path = require("path");
app.use(express.static(path.join(__dirname, "frontend")));

const db = mysql.createConnection({
  host: "localhost",
  user: "shopuser",
  password: "1234",
  database: "shop_management"
});

db.connect(err => {
  if (err) console.log("DB Error:", err);
  else console.log("DB Connected");
});

// ================= LOGIN =================
app.post("/login", (req, res) => {
  const { username, password } = req.body;
  db.query("SELECT * FROM users WHERE username=? AND password=?", [username, password], (err, r) => {
    if (err) return res.json({ success: false });
    if (r.length > 0) res.json({ success: true, username: r[0].username });
    else res.json({ success: false });
  });
});

// ================= FINANCIAL YEAR =================
app.get("/financial-years", (req, res) => {
  db.query("SELECT * FROM financial_years ORDER BY start_date DESC", (err, r) => {
    if (err) return res.json([]);
    res.json(r);
  });
});

app.get("/active-year", (req, res) => {
  db.query("SELECT * FROM financial_years WHERE is_active=1 LIMIT 1", (err, r) => {
    if (err || !r.length) return res.json(null);
    res.json(r[0]);
  });
});

app.post("/financial-year", (req, res) => {
  const { year_label, start_date, end_date } = req.body;
  db.query("UPDATE financial_years SET is_active=0", () => {
    db.query(
      "INSERT INTO financial_years (year_label, start_date, end_date, is_active) VALUES (?,?,?,1)",
      [year_label, start_date, end_date],
      (err, r) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, fy_id: r.insertId });
      }
    );
  });
});

app.post("/set-active-year", (req, res) => {
  const { fy_id } = req.body;
  db.query("UPDATE financial_years SET is_active=0", () => {
    db.query("UPDATE financial_years SET is_active=1 WHERE fy_id=?", [fy_id], (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    });
  });
});

// ================= PRODUCTS =================
// TABLE: products — product_id, product_code, name, hsn_code, brand
app.get("/products", (req, res) => {
  const { brand } = req.query;
  const sql = brand
    ? "SELECT * FROM products WHERE brand=? ORDER BY name"
    : "SELECT * FROM products ORDER BY name";
  db.query(sql, brand ? [brand] : [], (err, r) => {
    if (err) return res.json([]);
    res.json(r);
  });
});

// Get product by product_code (for ID lookup in billing)
app.get("/product-by-code/:code", (req, res) => {
  db.query(
    "SELECT * FROM products WHERE product_code=?",
    [req.params.code],
    (err, r) => {
      if (err) return res.json(null);
      if (!r.length) return res.json(null);
      res.json(r[0]);
    }
  );
});

app.post("/products", (req, res) => {
  const { name, hsn_code, brand, product_code } = req.body;
  if (!name) return res.status(400).json({ error: "Product name required" });
  db.query(
    "INSERT INTO products (name, hsn_code, brand, product_code) VALUES (?,?,?,?)",
    [name, hsn_code || null, brand || null, product_code || null],
    (err, r) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ product_id: r.insertId });
    }
  );
});

app.delete("/product/:id", (req, res) => {
  db.query("DELETE FROM products WHERE product_id=?", [req.params.id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.send("Deleted");
  });
});

app.get("/stock-worth", (req, res) => {
  db.query("SELECT SUM(remaining_quantity * mrp) as worth FROM product_batches", (err, r) => {
    if (err) return res.json({ worth: 0 });
    res.json({ worth: parseFloat(r[0].worth) || 0 });
  });
});

// ================= BATCHES =================
app.get("/batches/:product_id", (req, res) => {
  db.query(
    "SELECT * FROM product_batches WHERE product_id=? AND remaining_quantity > 0 ORDER BY purchase_date ASC",
    [req.params.product_id],
    (err, r) => {
      if (err) return res.json([]);
      res.json(r);
    }
  );
});

app.get("/all-batches/:product_id", (req, res) => {
  db.query(
    "SELECT * FROM product_batches WHERE product_id=? ORDER BY purchase_date DESC",
    [req.params.product_id],
    (err, r) => {
      if (err) return res.json([]);
      res.json(r);
    }
  );
});

app.post("/add-batch", (req, res) => {
  const { product_id, purchase_price, mrp, quantity, purchase_date, min_stock } = req.body;
  if (!product_id || !purchase_price || !mrp || !quantity) {
    return res.status(400).json({ error: "product_id, purchase_price, mrp, quantity required" });
  }
  const date = purchase_date || new Date().toISOString().split("T")[0];
  db.query(
    "INSERT INTO product_batches (product_id, purchase_price, quantity, remaining_quantity, mrp, gst_percent, purchase_date, min_stock) VALUES (?,?,?,?,?,0,?,?)",
    [product_id, purchase_price, quantity, quantity, mrp, date, min_stock || 5],
    (err, r) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ batch_id: r.insertId });
    }
  );
});

app.delete("/batch/:id", (req, res) => {
  db.query("DELETE FROM product_batches WHERE batch_id=?", [req.params.id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.send("Deleted");
  });
});

app.get("/product-stock/:product_id", (req, res) => {
  db.query(
    "SELECT SUM(remaining_quantity) as total_stock FROM product_batches WHERE product_id=?",
    [req.params.product_id],
    (err, r) => {
      if (err) return res.json({ total_stock: 0 });
      res.json({ total_stock: r[0].total_stock || 0 });
    }
  );
});

// ================= CUSTOMERS =================
app.get("/customers", (req, res) => {
  db.query("SELECT * FROM customers ORDER BY name", (err, r) => {
    if (err) return res.json([]);
    res.json(r);
  });
});

app.get("/customer/:id", (req, res) => {
  db.query("SELECT * FROM customers WHERE customer_id=?", [req.params.id], (err, r) => {
    if (err || !r.length) return res.json(null);
    res.json(r[0]);
  });
});

app.post("/customers", (req, res) => {
  const { name, phone, address, gstin } = req.body;
  if (!name) return res.status(400).json({ error: "Name required" });
  db.query(
    "INSERT INTO customers (name, phone, address, gstin, balance) VALUES (?,?,?,?,0)",
    [name, phone || null, address || null, gstin || null],
    (err, r) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ customer_id: r.insertId });
    }
  );
});

app.delete("/customer/:id", (req, res) => {
  db.query("DELETE FROM customers WHERE customer_id=?", [req.params.id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.send("Deleted");
  });
});

app.get("/customer-history/:id", (req, res) => {
  db.query(
    "SELECT bill_id, bill_date, payment_mode, cancelled, grand_total FROM bills WHERE customer_id=? ORDER BY bill_date DESC",
    [req.params.id],
    (err, r) => {
      if (err) return res.json([]);
      res.json(r);
    }
  );
});

// ================= TRANSACTIONS =================
app.post("/transactions", (req, res) => {
  const { customer_id, txn_type, amount } = req.body;
  db.query(
    "INSERT INTO transactions (customer_id, txn_type, amount, txn_date) VALUES (?,?,?,NOW())",
    [customer_id, txn_type, amount],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      const sql = txn_type === "CREDIT"
        ? "UPDATE customers SET balance = balance + ? WHERE customer_id=?"
        : "UPDATE customers SET balance = balance - ? WHERE customer_id=?";
      db.query(sql, [amount, customer_id]);
      res.send("Done");
    }
  );
});

app.get("/ledger/:id", (req, res) => {
  db.query(
    "SELECT * FROM transactions WHERE customer_id=? ORDER BY txn_date DESC",
    [req.params.id],
    (err, r) => {
      if (err) return res.json([]);
      res.json(r);
    }
  );
});

app.post("/credit-payment", (req, res) => {
  const { customer_id, amount, payment_date, note } = req.body;
  if (!customer_id || !amount) return res.status(400).json({ error: "customer_id and amount required" });
  db.query(
    "INSERT INTO credit_payments (customer_id, amount, payment_date, note) VALUES (?,?,?,?)",
    [customer_id, amount, payment_date || new Date().toISOString().split("T")[0], note || null],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      db.query("UPDATE customers SET balance = balance - ? WHERE customer_id=?", [amount, customer_id]);
      db.query("INSERT INTO transactions (customer_id, txn_type, amount, txn_date) VALUES (?,'DEBIT',?,NOW())", [customer_id, amount]);
      res.json({ success: true });
    }
  );
});

app.get("/credit-payments/:customer_id", (req, res) => {
  db.query(
    "SELECT * FROM credit_payments WHERE customer_id=? ORDER BY payment_date DESC",
    [req.params.customer_id],
    (err, r) => {
      if (err) return res.json([]);
      res.json(r);
    }
  );
});

// ================= SALES BILLING =================
app.post("/create-bill-multi", (req, res) => {
  let { items, payment_mode, customer_id, walkin_name, walkin_phone, bill_date } = req.body;
  if (!items || !items.length) return res.status(400).json({ error: "No items" });

  const finalDate = bill_date || new Date().toISOString().split("T")[0];

  db.query("SELECT * FROM financial_years WHERE is_active=1 LIMIT 1", (err, fyRows) => {
    const fy_id = fyRows && fyRows.length ? fyRows[0].fy_id : null;

    const next = (cust_id) => {
      const grand_total = items.reduce((s, i) => s + (parseFloat(i.total_amount) || 0), 0);

      db.query(
        "INSERT INTO bills (bill_date, payment_mode, customer_id, fy_id, grand_total, cancelled) VALUES (?,?,?,?,?,0)",
        [finalDate, payment_mode, cust_id || null, fy_id, grand_total],
        (err, result) => {
          if (err) return res.status(500).json({ error: err.message });
          const bill_id = result.insertId;
          let processed = 0;

          items.forEach(item => {
            const { batch_id, quantity, rate, total_amount } = item;
            db.query(
              "SELECT pb.*, p.hsn_code, p.name as product_name FROM product_batches pb JOIN products p ON pb.product_id=p.product_id WHERE pb.batch_id=?",
              [batch_id],
              (err, r) => {
                if (err || !r.length) {
                  processed++;
                  if (processed === items.length) return res.json({ bill_id, total: grand_total });
                  return;
                }
                const b = r[0];
                const finalRate = parseFloat(rate) || parseFloat(b.mrp);
                const finalTotal = parseFloat(total_amount) || finalRate * quantity;
                const profit = (finalRate - parseFloat(b.purchase_price)) * quantity;

                db.query(
                  "INSERT INTO bill_items (bill_id, batch_id, product_id, quantity, selling_price, total_amount, profit, hsn_code, gst_percent, cgst, sgst) VALUES (?,?,?,?,?,?,?,?,0,0,0)",
                  [bill_id, batch_id, b.product_id || null, quantity, finalRate, finalTotal, profit, b.hsn_code || ""]
                );

                const newQty = b.remaining_quantity - quantity;
if (newQty <= 0) {
  db.query("UPDATE product_batches SET remaining_quantity=0 WHERE batch_id=?", [batch_id]);
} else {
  db.query("UPDATE product_batches SET remaining_quantity=? WHERE batch_id=?", [newQty, batch_id]);
}

                processed++;
                if (processed === items.length) {
                  if (payment_mode === "CREDIT" && cust_id) {
                    db.query("UPDATE customers SET balance = balance + ? WHERE customer_id=?", [grand_total, cust_id]);
                    db.query("INSERT INTO transactions (customer_id, txn_type, amount, txn_date) VALUES (?,'CREDIT',?,NOW())", [cust_id, grand_total]);
                  }
                  return res.json({ bill_id, total: grand_total });
                }
              }
            );
          });
        }
      );
    };

    // Create walk-in customer for ALL payment types
    if (!customer_id && walkin_name) {
      db.query(
        "INSERT INTO customers (name, phone, balance) VALUES (?,?,0)",
        [walkin_name, walkin_phone || null],
        (err, r) => {
          if (err) return res.status(500).json({ error: err.message });
          next(r.insertId);
        }
      );
    } else {
      next(customer_id);
    }
  });
});

app.get("/bill/:id", (req, res) => {
  db.query(`
    SELECT b.bill_id, b.bill_date, b.payment_mode, b.cancelled, b.grand_total,
           COALESCE(c.name,'Walk-in') as customer_name, c.phone, c.address
    FROM bills b LEFT JOIN customers c ON b.customer_id=c.customer_id
    WHERE b.bill_id=?
  `, [req.params.id], (err, bills) => {
    if (err || !bills.length) return res.status(404).json({ error: "Not found" });
    const bill = bills[0];
    db.query(`
      SELECT bi.item_id, bi.batch_id, bi.product_id, bi.quantity,
             bi.selling_price, bi.total_amount,
             COALESCE(p2.name, p1.name, 'Product') as product_name,
             COALESCE(p2.product_code, p1.product_code, '') as product_code,
             COALESCE(bi.product_id, pb.product_id) as resolved_product_id
      FROM bill_items bi
      LEFT JOIN product_batches pb ON bi.batch_id = pb.batch_id
      LEFT JOIN products p1 ON pb.product_id = p1.product_id
      LEFT JOIN products p2 ON bi.product_id = p2.product_id
      WHERE bi.bill_id=?
    `, [req.params.id], (err2, items) => {
      if (err2) return res.status(500).json({ error: err2.message });
      res.json({
        bill_no: bill.bill_id,
        bill_date: bill.bill_date,
        payment_mode: bill.payment_mode,
        cancelled: bill.cancelled,
        customer: bill.customer_name,
        phone: bill.phone || "",
        address: bill.address || "",
        total: parseFloat(bill.grand_total) || items.reduce((s, i) => s + parseFloat(i.total_amount), 0),
        items: items.map(i => ({
          item_id: i.item_id,
          batch_id: i.batch_id,
          product_id: i.resolved_product_id,
          product_code: i.product_code || "",
          product: i.product_name || "Product",
          quantity: i.quantity,
          rate: parseFloat(i.selling_price),
          total_amount: parseFloat(i.total_amount)
        }))
      });
    });
  });
});

app.get("/search-bills", (req, res) => {
  const { name } = req.query;
  if (!name) return res.json([]);
  db.query(`
    SELECT b.bill_id, b.bill_date, b.payment_mode, b.cancelled,
           COALESCE(b.grand_total,0) as grand_total,
           COALESCE(c.name,'Walk-in') as customer_name
    FROM bills b LEFT JOIN customers c ON b.customer_id=c.customer_id
    WHERE c.name LIKE ?
    ORDER BY b.bill_date DESC LIMIT 30
  `, [`%${name}%`], (err, r) => {
    if (err) return res.json([]);
    res.json(r);
  });
});

app.post("/cancel-bill/:id", (req, res) => {
  const bill_id = req.params.id;
  db.query("SELECT * FROM bills WHERE bill_id=?", [bill_id], (err, bills) => {
    if (err || !bills.length) return res.status(404).json({ error: "Bill not found" });
    if (bills[0].cancelled) return res.status(400).json({ error: "Already cancelled" });
    const bill = bills[0];

    db.query("SELECT * FROM bill_items WHERE bill_id=?", [bill_id], (err2, items) => {
      if (err2) return res.status(500).json({ error: err2.message });

      let done = 0;
      const finish = () => {
        done++;
        if (done < items.length) return;
        if (bill.payment_mode === "CREDIT" && bill.customer_id) {
          db.query("UPDATE customers SET balance = balance - ? WHERE customer_id=?", [bill.grand_total, bill.customer_id]);
          db.query("INSERT INTO transactions (customer_id, txn_type, amount, txn_date) VALUES (?,'DEBIT',?,NOW())", [bill.customer_id, bill.grand_total]);
        }
        db.query("UPDATE bills SET cancelled=1, cancelled_at=NOW() WHERE bill_id=?", [bill_id], (err3) => {
          if (err3) return res.status(500).json({ error: err3.message });
          res.json({ success: true });
        });
      };

      if (!items.length) return finish();

      items.forEach(item => {
        db.query("SELECT * FROM product_batches WHERE batch_id=?", [item.batch_id], (err3, batches) => {
          if (batches && batches.length) {
            db.query("UPDATE product_batches SET remaining_quantity = remaining_quantity + ? WHERE batch_id=?", [item.quantity, item.batch_id], () => finish());
          } else {
            finish();
          }
        });
      });
    });
  });
});

app.put("/update-bill/:id", (req, res) => {
  const bill_id = req.params.id;
  const { items } = req.body;
  db.query("SELECT cancelled FROM bills WHERE bill_id=?", [bill_id], (err, r) => {
    if (err || !r.length) return res.status(404).json({ error: "Bill not found" });
    if (r[0].cancelled) return res.status(400).json({ error: "Cannot edit cancelled bill" });
    let done = 0;
    const newTotal = items.reduce((s, i) => s + (parseFloat(i.total_amount) || 0), 0);
    if (!items.length) return res.json({ success: true });
    items.forEach(item => {
      db.query("UPDATE bill_items SET selling_price=?, total_amount=? WHERE item_id=?",
        [item.rate, item.total_amount, item.item_id],
        () => {
          done++;
          if (done === items.length) {
            db.query("UPDATE bills SET grand_total=? WHERE bill_id=?", [newTotal, bill_id]);
            res.json({ success: true });
          }
        }
      );
    });
  });
});

// ================= SUPPLIERS =================
app.get("/suppliers", (req, res) => {
  db.query("SELECT * FROM suppliers ORDER BY name", (err, r) => {
    if (err) return res.json([]);
    res.json(r);
  });
});

app.get("/supplier/:id", (req, res) => {
  db.query("SELECT * FROM suppliers WHERE supplier_id=?", [req.params.id], (err, r) => {
    if (err || !r.length) return res.json(null);
    res.json(r[0]);
  });
});

app.post("/suppliers", (req, res) => {
  const { name, phone, address } = req.body;
  if (!name) return res.status(400).json({ error: "Name required" });
  db.query(
    "INSERT INTO suppliers (name, phone, address, balance) VALUES (?,?,?,0)",
    [name, phone || null, address || null],
    (err, r) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ supplier_id: r.insertId });
    }
  );
});

app.delete("/supplier/:id", (req, res) => {
  db.query("DELETE FROM suppliers WHERE supplier_id=?", [req.params.id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.send("Deleted");
  });
});

// Supplier payment (partial payment to supplier)
app.post("/supplier-payment", (req, res) => {
  const { supplier_id, pb_id, amount, payment_date, note } = req.body;
  if (!supplier_id || !amount) return res.status(400).json({ error: "supplier_id and amount required" });
  db.query(
    "INSERT INTO supplier_payments (supplier_id, pb_id, amount, payment_date, note) VALUES (?,?,?,?,?)",
    [supplier_id, pb_id || null, amount, payment_date || new Date().toISOString().split("T")[0], note || null],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      // Reduce supplier balance
      db.query("UPDATE suppliers SET balance = balance - ? WHERE supplier_id=?", [amount, supplier_id]);
      // Reduce purchase bill balance if pb_id provided
      if (pb_id) {
        db.query("UPDATE purchase_bills SET paid_amount = paid_amount + ?, balance = balance - ? WHERE pb_id=?", [amount, amount, pb_id]);
      }
      res.json({ success: true });
    }
  );
});

app.get("/supplier-payments/:supplier_id", (req, res) => {
  db.query(
    "SELECT * FROM supplier_payments WHERE supplier_id=? ORDER BY payment_date DESC",
    [req.params.supplier_id],
    (err, r) => {
      if (err) return res.json([]);
      res.json(r);
    }
  );
});

// ================= PURCHASE BILLS =================
app.post("/create-purchase-bill", (req, res) => {
  const { supplier_id, bill_date, payment_mode, items, note, initial_payment } = req.body;
  if (!items || !items.length) return res.status(400).json({ error: "No items" });

  const finalDate = bill_date || new Date().toISOString().split("T")[0];
  const total_amount = items.reduce((s, i) => s + (parseFloat(i.purchase_price) * parseInt(i.quantity)), 0);
  const paid_amount = parseFloat(initial_payment) || (payment_mode !== "CREDIT" ? total_amount : 0);
  const balance = total_amount - paid_amount;

  db.query(
    "INSERT INTO purchase_bills (supplier_id, bill_date, payment_mode, total_amount, paid_amount, balance, note) VALUES (?,?,?,?,?,?,?)",
    [supplier_id || null, finalDate, payment_mode, total_amount, paid_amount, balance, note || null],
    (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      const pb_id = result.insertId;
      let processed = 0;

      // Update supplier balance if credit
      if (payment_mode === "CREDIT" && supplier_id && balance > 0) {
        db.query("UPDATE suppliers SET balance = balance + ? WHERE supplier_id=?", [balance, supplier_id]);
      }

      items.forEach(item => {
        const { product_id, quantity, purchase_price, selling_price, min_stock } = item;

        // Create new batch — this updates stock automatically
        db.query(
          "INSERT INTO product_batches (product_id, purchase_price, quantity, remaining_quantity, mrp, gst_percent, purchase_date, min_stock) VALUES (?,?,?,?,?,0,?,?)",
          [product_id, purchase_price, quantity, quantity, selling_price, finalDate, min_stock || 5],
          (err2, batchResult) => {
            const batch_id = err2 ? null : batchResult.insertId;
            db.query(
              "INSERT INTO purchase_bill_items (pb_id, product_id, batch_id, quantity, purchase_price, selling_price, min_stock) VALUES (?,?,?,?,?,?,?)",
              [pb_id, product_id, batch_id, quantity, purchase_price, selling_price, min_stock || 5]
            );
            processed++;
            if (processed === items.length) {
              res.json({ success: true, pb_id, total_amount, paid_amount, balance });
            }
          }
        );
      });
    }
  );
});

app.get("/purchase-bills", (req, res) => {
  db.query(`
    SELECT pb.*, s.name as supplier_name
    FROM purchase_bills pb
    LEFT JOIN suppliers s ON pb.supplier_id=s.supplier_id
    ORDER BY pb.bill_date DESC
  `, (err, r) => {
    if (err) return res.json([]);
    res.json(r);
  });
});

app.get("/purchase-bill/:id", (req, res) => {
  db.query(`
    SELECT pb.*, s.name as supplier_name, s.phone as supplier_phone, s.address as supplier_address
    FROM purchase_bills pb
    LEFT JOIN suppliers s ON pb.supplier_id=s.supplier_id
    WHERE pb.pb_id=?
  `, [req.params.id], (err, bills) => {
    if (err || !bills.length) return res.status(404).json({ error: "Not found" });
    const bill = bills[0];

    db.query(`
      SELECT pbi.*, p.name as product_name, p.product_code
      FROM purchase_bill_items pbi
      LEFT JOIN products p ON pbi.product_id=p.product_id
      WHERE pbi.pb_id=?
    `, [req.params.id], (err2, items) => {
      if (err2) return res.status(500).json({ error: err2.message });

      db.query(
        "SELECT * FROM supplier_payments WHERE pb_id=? ORDER BY payment_date DESC",
        [req.params.id],
        (err3, payments) => {
          res.json({
            ...bill,
            items: items || [],
            payments: payments || []
          });
        }
      );
    });
  });
});

// ================= EXPENSES =================
app.get("/expenses", (req, res) => {
  const { month, year } = req.query;
  let sql = "SELECT * FROM expenses WHERE 1=1";
  const params = [];
  if (month) { sql += " AND MONTH(expense_date)=?"; params.push(month); }
  if (year) { sql += " AND YEAR(expense_date)=?"; params.push(year); }
  sql += " ORDER BY expense_date DESC";
  db.query(sql, params, (err, r) => {
    if (err) return res.json([]);
    res.json(r);
  });
});

app.post("/add-expense", (req, res) => {
  const { title, amount, expense_date, category, note } = req.body;
  if (!title || !amount) return res.status(400).json({ error: "Title and amount required" });
  db.query(
    "INSERT INTO expenses (title, amount, expense_date, category, note) VALUES (?,?,?,?,?)",
    [title, amount, expense_date || new Date().toISOString().split("T")[0], category || "General", note || null],
    (err, r) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ expense_id: r.insertId });
    }
  );
});

app.delete("/expense/:id", (req, res) => {
  db.query("DELETE FROM expenses WHERE expense_id=?", [req.params.id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.send("Deleted");
  });
});

// ================= REPORTS =================
app.get("/sales-by-date", (req, res) => {
  const { date } = req.query;
  if (!date) return res.json({ total: 0, bills: [] });
  db.query(`
    SELECT b.bill_id, b.bill_date, b.payment_mode, b.cancelled,
           COALESCE(b.grand_total,0) as grand_total,
           COALESCE(c.name,'Walk-in') as customer_name,
           COALESCE(SUM(bi.profit),0) as bill_profit
    FROM bills b
    LEFT JOIN customers c ON b.customer_id=c.customer_id
    LEFT JOIN bill_items bi ON b.bill_id=bi.bill_id
    WHERE DATE(b.bill_date)=? AND b.cancelled=0
    GROUP BY b.bill_id
    ORDER BY b.bill_date DESC
  `, [date], (err, r) => {
    if (err) return res.json({ total: 0, bills: [] });
    const total = r.reduce((s, b) => s + parseFloat(b.grand_total), 0);
    const totalProfit = r.reduce((s, b) => s + parseFloat(b.bill_profit), 0);
    res.json({ total, total_profit: totalProfit, bills: r });
  });
});

app.get("/sales-today", (req, res) => {
  db.query("SELECT SUM(grand_total) as total FROM bills WHERE DATE(bill_date)=CURDATE() AND cancelled=0", (err, r) => {
    if (err) return res.json({ total: 0 });
    res.json({ total: parseFloat(r[0].total) || 0 });
  });
});

app.get("/monthly-profit", (req, res) => {
  const y = req.query.year || new Date().getFullYear();
  // Get sales + gross profit (from bill_items.profit) per month
  db.query(`
    SELECT MONTH(b.bill_date) as month,
           SUM(b.grand_total) as sales,
           COALESCE(SUM(bi.profit),0) as gross_profit
    FROM bills b
    LEFT JOIN bill_items bi ON b.bill_id=bi.bill_id
    WHERE YEAR(b.bill_date)=? AND b.cancelled=0
    GROUP BY MONTH(b.bill_date)
  `, [y], (err, sales) => {
    if (err) return res.json([]);
    db.query("SELECT MONTH(expense_date) as month, SUM(amount) as expense FROM expenses WHERE YEAR(expense_date)=? GROUP BY MONTH(expense_date)", [y], (err2, expenses) => {
      if (err2) return res.json([]);
      const monthNames = ["","Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
      res.json(sales.map(s => {
        const exp = expenses.find(e => e.month === s.month);
        const expAmt = exp ? parseFloat(exp.expense) : 0;
        const grossProfit = parseFloat(s.gross_profit) || 0;
        return {
          month: s.month,
          month_name: monthNames[s.month],
          sales: parseFloat(s.sales) || 0,
          gross_profit: grossProfit,            // profit from bill_items (selling - purchase)
          expense: expAmt,                       // shop expenses
          net_profit: grossProfit - expAmt       // true net profit
        };
      }));
    });
  });
});

app.get("/yearly-profit", (req, res) => {
  const y = req.query.year || new Date().getFullYear();
  db.query(`
    SELECT SUM(b.grand_total) as sales,
           COALESCE(SUM(bi.profit),0) as gross_profit
    FROM bills b
    LEFT JOIN bill_items bi ON b.bill_id=bi.bill_id
    WHERE YEAR(b.bill_date)=? AND b.cancelled=0
  `, [y], (err, s) => {
    if (err) return res.json({ sales: 0, expense: 0, gross_profit: 0, net_profit: 0, year: y });
    db.query("SELECT SUM(amount) as expense FROM expenses WHERE YEAR(expense_date)=?", [y], (err2, e) => {
      if (err2) return res.json({ sales: 0, expense: 0, gross_profit: 0, net_profit: 0, year: y });
      const sales = parseFloat(s[0].sales) || 0;
      const gross_profit = parseFloat(s[0].gross_profit) || 0;
      const expense = parseFloat(e[0].expense) || 0;
      res.json({
        year: y,
        sales,
        expense,
        gross_profit,             // profit from selling price - purchase price
        net_profit: gross_profit - expense,  // after deducting shop expenses
        profit: gross_profit - expense       // keep for backward compat
      });
    });
  });
});

app.get("/profit", (req, res) => {
  db.query("SELECT SUM(grand_total) as sales FROM bills WHERE cancelled=0", (e, s) => {
    if (e) return res.json({ sales: 0, expense: 0, profit: 0 });
    db.query("SELECT SUM(amount) as expense FROM expenses", (e2, ex) => {
      if (e2) return res.json({ sales: 0, expense: 0, profit: 0 });
      const sales = parseFloat(s[0].sales) || 0;
      const expense = parseFloat(ex[0].expense) || 0;
      res.json({ sales, expense, profit: sales - expense });
    });
  });
});

app.get("/sales-graph", (req, res) => {
  db.query("SELECT DATE(bill_date) as date, SUM(grand_total) as total FROM bills WHERE cancelled=0 GROUP BY DATE(bill_date) ORDER BY date DESC LIMIT 30", (err, r) => {
    if (err) return res.json([]);
    res.json(r);
  });
});

app.get("/top-products", (req, res) => {
  db.query(`
    SELECT p.name, SUM(bi.quantity) as qty
    FROM bill_items bi
    LEFT JOIN product_batches pb ON bi.batch_id=pb.batch_id
    LEFT JOIN products p ON pb.product_id=p.product_id
    JOIN bills b ON bi.bill_id=b.bill_id
    WHERE p.name IS NOT NULL AND b.cancelled=0
    GROUP BY p.product_id ORDER BY qty DESC LIMIT 5
  `, (err, r) => {
    if (err) return res.json([]);
    res.json(r);
  });
});

app.get("/low-stock", (req, res) => {
  db.query(`
    SELECT p.product_id, p.name as product_name, p.brand,
           SUM(pb.remaining_quantity) as total_stock, MIN(pb.min_stock) as min_stock
    FROM products p JOIN product_batches pb ON p.product_id=pb.product_id
    GROUP BY p.product_id, p.name, p.brand
    HAVING total_stock < MIN(pb.min_stock)
  `, (err, r) => {
    if (err) return res.json([]);
    res.json(r);
  });
});

app.get("/stock-alert", (req, res) => {
  db.query(`
    SELECT p.product_id, p.name as product_name, p.brand,
           SUM(pb.remaining_quantity) as total_stock, MIN(pb.min_stock) as min_stock
    FROM products p JOIN product_batches pb ON p.product_id=pb.product_id
    GROUP BY p.product_id, p.name, p.brand
    HAVING total_stock < MIN(pb.min_stock)
  `, (err, r) => {
    if (err) return res.json([]);
    res.json(r);
  });
});

// ================= QUOTATIONS =================
app.post("/create-quotation", (req, res) => {
  let { items, customer_id, customer_name, customer_phone, quot_date, note } = req.body;
  if (!items || !items.length) return res.status(400).json({ error: "No items" });
  const finalDate = quot_date || new Date().toISOString().split("T")[0];
  const total_amount = items.reduce((s, i) => s + parseFloat(i.rate) * parseInt(i.quantity), 0);
  const discount_total = items.reduce((s, i) => s + parseFloat(i.discount_amt || 0), 0);
  const net_amount = total_amount - discount_total;

  const saveQuot = (cust_id, cust_name, cust_phone) => {
    db.query(
      "INSERT INTO quotations (customer_id, customer_name, customer_phone, quot_date, total_amount, discount_total, net_amount, status, note) VALUES (?,?,?,?,?,?,?,'OPEN',?)",
      [cust_id || null, cust_name || null, cust_phone || null, finalDate, total_amount, discount_total, net_amount, note || null],
      (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        const quot_id = result.insertId;
        let done = 0;
        items.forEach(item => {
          const disc_amt = parseFloat(item.rate) * parseInt(item.quantity) * parseFloat(item.discount_pct || 0) / 100;
          const total = parseFloat(item.rate) * parseInt(item.quantity) - disc_amt;
          db.query(
            "INSERT INTO quotation_items (quot_id, product_id, batch_id, product_name, quantity, rate, discount_pct, discount_amt, total_amount) VALUES (?,?,?,?,?,?,?,?,?)",
            [quot_id, item.product_id || null, item.batch_id || null, item.product_name || null, item.quantity, item.rate, item.discount_pct || 0, disc_amt, total],
            () => { done++; if (done === items.length) res.json({ quot_id, net_amount }); }
          );
        });
      }
    );
  };

  if (!customer_id && customer_name) {
    db.query("INSERT INTO customers (name, phone, balance) VALUES (?,?,0)", [customer_name, customer_phone || null], (err, r) => {
      if (err) return res.status(500).json({ error: err.message });
      saveQuot(r.insertId, customer_name, customer_phone);
    });
  } else {
    db.query("SELECT name, phone FROM customers WHERE customer_id=?", [customer_id], (err, r) => {
      const cname = r && r.length ? r[0].name : customer_name;
      const cphone = r && r.length ? r[0].phone : customer_phone;
      saveQuot(customer_id, cname, cphone);
    });
  }
});

app.get("/quotations", (req, res) => {
  const { name } = req.query;
  let sql = "SELECT q.*, COALESCE(c.name, q.customer_name, 'Walk-in') as display_name FROM quotations q LEFT JOIN customers c ON q.customer_id=c.customer_id";
  const params = [];
  if (name) { sql += " WHERE c.name LIKE ? OR q.customer_name LIKE ?"; params.push("%" + name + "%", "%" + name + "%"); }
  sql += " ORDER BY q.created_at DESC";
  db.query(sql, params, (err, r) => { if (err) return res.json([]); res.json(r); });
});

app.get("/quotation/:id", (req, res) => {
  db.query(
    "SELECT q.*, COALESCE(c.name, q.customer_name, 'Walk-in') as display_name, COALESCE(c.phone, q.customer_phone) as display_phone FROM quotations q LEFT JOIN customers c ON q.customer_id=c.customer_id WHERE q.quot_id=?",
    [req.params.id], (err, rows) => {
      if (err || !rows.length) return res.status(404).json({ error: "Not found" });
      db.query("SELECT * FROM quotation_items WHERE quot_id=?", [req.params.id], (err2, items) => {
        if (err2) return res.status(500).json({ error: err2.message });
        res.json({ ...rows[0], items: items || [] });
      });
    }
  );
});

app.put("/update-quotation/:id", (req, res) => {
  const quot_id = req.params.id;
  const { items, deleted_item_ids } = req.body;
  const doDeletes = (cb) => {
    if (!deleted_item_ids || !deleted_item_ids.length) return cb();
    let done = 0;
    deleted_item_ids.forEach(iid => { db.query("DELETE FROM quotation_items WHERE qi_id=?", [iid], () => { done++; if (done === deleted_item_ids.length) cb(); }); });
  };
  doDeletes(() => {
    const existingItems = items.filter(i => i.qi_id !== "new");
    const newItems = items.filter(i => i.qi_id === "new");
    let done = 0;
    const recalc = () => {
      db.query("SELECT * FROM quotation_items WHERE quot_id=?", [quot_id], (err, allItems) => {
        const total = allItems.reduce((s, i) => s + parseFloat(i.total_amount), 0);
        const discTotal = allItems.reduce((s, i) => s + parseFloat(i.discount_amt || 0), 0);
        db.query("UPDATE quotations SET total_amount=?, discount_total=?, net_amount=? WHERE quot_id=?", [total, discTotal, total - discTotal, quot_id], () => res.json({ success: true }));
      });
    };
    if (existingItems.length) {
      existingItems.forEach(item => {
        const disc_amt = parseFloat(item.rate) * parseInt(item.quantity) * parseFloat(item.discount_pct || 0) / 100;
        const total = parseFloat(item.rate) * parseInt(item.quantity) - disc_amt;
        db.query("UPDATE quotation_items SET quantity=?, rate=?, discount_pct=?, discount_amt=?, total_amount=? WHERE qi_id=?",
          [item.quantity, item.rate, item.discount_pct || 0, disc_amt, total, item.qi_id],
          () => { done++; if (done === existingItems.length && !newItems.length) recalc(); });
      });
    }
    if (newItems.length) {
      let nd = 0;
      newItems.forEach(item => {
        const disc_amt = parseFloat(item.rate) * parseInt(item.quantity) * parseFloat(item.discount_pct || 0) / 100;
        const total = parseFloat(item.rate) * parseInt(item.quantity) - disc_amt;
        db.query("INSERT INTO quotation_items (quot_id, product_id, batch_id, product_name, quantity, rate, discount_pct, discount_amt, total_amount) VALUES (?,?,?,?,?,?,?,?,?)",
          [quot_id, item.product_id || null, item.batch_id || null, item.product_name || null, item.quantity, item.rate, item.discount_pct || 0, disc_amt, total],
          () => { nd++; if (nd === newItems.length) recalc(); });
      });
    }
    if (!existingItems.length && !newItems.length) recalc();
  });
});

app.post("/convert-quotation/:id", (req, res) => {
  const quot_id = req.params.id;
  const { payment_mode, items, bill_date } = req.body;
  if (!items || !items.length) return res.status(400).json({ error: "No items" });
  const finalDate = bill_date || new Date().toISOString().split("T")[0];
  db.query("SELECT * FROM quotations WHERE quot_id=?", [quot_id], (err, rows) => {
    if (err || !rows.length) return res.status(404).json({ error: "Not found" });
    if (rows[0].status === "CONVERTED") return res.status(400).json({ error: "Already converted" });
    const quot = rows[0];
    db.query("SELECT * FROM financial_years WHERE is_active=1 LIMIT 1", (e, fyRows) => {
      const fy_id = fyRows && fyRows.length ? fyRows[0].fy_id : null;
      const grand_total = items.reduce((s, i) => s + parseFloat(i.total_amount), 0);
      db.query("INSERT INTO bills (bill_date, payment_mode, customer_id, fy_id, grand_total, cancelled) VALUES (?,?,?,?,?,0)",
        [finalDate, payment_mode, quot.customer_id || null, fy_id, grand_total],
        (err2, result) => {
          if (err2) return res.status(500).json({ error: err2.message });
          const bill_id = result.insertId;
          let processed = 0;
          items.forEach(item => {
            if (item.batch_id) {
              db.query("SELECT * FROM product_batches WHERE batch_id=?", [item.batch_id], (e3, batches) => {
                if (batches && batches.length) {
                  const newQty = batches[0].remaining_quantity - item.quantity;
                  if (newQty <= 0) db.query("DELETE FROM product_batches WHERE batch_id=?", [item.batch_id]);
                  else db.query("UPDATE product_batches SET remaining_quantity=? WHERE batch_id=?", [newQty, item.batch_id]);
                }
              });
            }
            db.query("INSERT INTO bill_items (bill_id, batch_id, product_id, quantity, selling_price, total_amount, profit, hsn_code, gst_percent, cgst, sgst) VALUES (?,?,?,?,?,?,0,'',0,0,0)",
              [bill_id, item.batch_id || null, item.product_id || null, item.quantity, item.rate, item.total_amount],
              () => {
                processed++;
                if (processed === items.length) {
                  if (payment_mode === "CREDIT" && quot.customer_id) {
                    db.query("UPDATE customers SET balance = balance + ? WHERE customer_id=?", [grand_total, quot.customer_id]);
                  }
                  db.query("UPDATE quotations SET status='CONVERTED', converted_bill_id=? WHERE quot_id=?", [bill_id, quot_id]);
                  res.json({ success: true, bill_id, total: grand_total });
                }
              }
            );
          });
        }
      );
    });
  });
});

// ================= ALTER BILL (flexible) =================
app.put("/alter-bill/:id", (req, res) => {
  const bill_id = req.params.id;
  const { items, deleted_item_ids } = req.body;
  db.query("SELECT cancelled FROM bills WHERE bill_id=?", [bill_id], (err, r) => {
    if (err || !r.length) return res.status(404).json({ error: "Not found" });
    if (r[0].cancelled) return res.status(400).json({ error: "Cannot edit cancelled bill" });
    const doDeletes = (cb) => {
      if (!deleted_item_ids || !deleted_item_ids.length) return cb();
      let done = 0;
      deleted_item_ids.forEach(item_id => {
        db.query("SELECT * FROM bill_items WHERE item_id=?", [item_id], (e, rows) => {
          if (rows && rows.length && rows[0].batch_id) {
            db.query("SELECT * FROM product_batches WHERE batch_id=?", [rows[0].batch_id], (e2, batches) => {
              if (batches && batches.length) db.query("UPDATE product_batches SET remaining_quantity = remaining_quantity + ? WHERE batch_id=?", [rows[0].quantity, rows[0].batch_id]);
            });
          }
          db.query("DELETE FROM bill_items WHERE item_id=?", [item_id], () => { done++; if (done === deleted_item_ids.length) cb(); });
        });
      });
    };
    doDeletes(() => {
      const existing = items.filter(i => i.item_id !== "new");
      const newItems = items.filter(i => i.item_id === "new");
      let done = 0;
      const finish = () => {
        db.query("SELECT SUM(total_amount) as total FROM bill_items WHERE bill_id=?", [bill_id], (e, r2) => {
          const newTotal = parseFloat(r2[0].total) || 0;
          db.query("UPDATE bills SET grand_total=? WHERE bill_id=?", [newTotal, bill_id], () => res.json({ success: true, new_total: newTotal }));
        });
      };
      if (existing.length) {
        existing.forEach(item => {
          db.query("UPDATE bill_items SET selling_price=?, total_amount=?, quantity=? WHERE item_id=?",
            [item.rate, item.total_amount, item.quantity, item.item_id],
            () => { done++; if (done === existing.length && !newItems.length) finish(); });
        });
      }
      if (newItems.length) {
        let nd = 0;
        newItems.forEach(item => {
          if (item.batch_id) {
            db.query("SELECT * FROM product_batches WHERE batch_id=?", [item.batch_id], (e, batches) => {
              if (batches && batches.length) {
                const newQty = batches[0].remaining_quantity - item.quantity;
                if (newQty <= 0) db.query("DELETE FROM product_batches WHERE batch_id=?", [item.batch_id]);
                else db.query("UPDATE product_batches SET remaining_quantity=? WHERE batch_id=?", [newQty, item.batch_id]);
              }
            });
          }
          db.query("INSERT INTO bill_items (bill_id, batch_id, product_id, quantity, selling_price, total_amount, profit, hsn_code, gst_percent, cgst, sgst) VALUES (?,?,?,?,?,?,0,'',0,0,0)",
            [bill_id, item.batch_id || null, item.product_id || null, item.quantity, item.rate, item.total_amount],
            () => { nd++; if (nd === newItems.length) finish(); });
        });
      }
      if (!existing.length && !newItems.length) finish();
    });
  });
});


// ================= PROFIT BY BRAND =================
app.get("/profit-by-brand", (req, res) => {
  const { from_date, to_date } = req.query;
  let where = "b.cancelled = 0 AND p.brand IS NOT NULL AND p.brand != '' AND bi.product_id IS NOT NULL";
  const params = [];
  if (from_date) { where += " AND DATE(b.bill_date) >= ?"; params.push(from_date); }
  if (to_date)   { where += " AND DATE(b.bill_date) <= ?"; params.push(to_date); }

  db.query(`
    SELECT p.brand,
           SUM(bi.total_amount) as total_sales,
           SUM(bi.profit) as total_profit,
           COUNT(DISTINCT b.bill_id) as bill_count,
           SUM(bi.quantity) as qty_sold
    FROM bill_items bi
    JOIN bills b ON bi.bill_id = b.bill_id
    LEFT JOIN products p ON bi.product_id = p.product_id
    WHERE ${where}
    GROUP BY p.brand
    ORDER BY total_profit DESC
  `, params, (err, salesData) => {
    if (err) return res.json([]);

    // Stock worth by brand (purchase price * remaining_quantity)
    db.query(`
      SELECT p.brand,
             SUM(pb.remaining_quantity * pb.purchase_price) as stock_worth,
             SUM(pb.remaining_quantity) as total_stock
      FROM product_batches pb
      JOIN products p ON pb.product_id = p.product_id
      WHERE p.brand IS NOT NULL AND p.brand != ''
      GROUP BY p.brand
    `, (err2, stockData) => {
      if (err2) { res.json(salesData); return; }

      const result = salesData.map(s => {
        const sw = stockData.find(d => d.brand === s.brand);
        return {
          ...s,
          stock_worth: sw ? parseFloat(sw.stock_worth) || 0 : 0,
          total_stock: sw ? parseInt(sw.total_stock) || 0 : 0
        };
      });

      // Add brands that have stock but no sales in this period
      stockData.forEach(sw => {
        if (!result.find(r => r.brand === sw.brand)) {
          result.push({
            brand: sw.brand,
            total_sales: 0,
            total_profit: 0,
            bill_count: 0,
            qty_sold: 0,
            stock_worth: parseFloat(sw.stock_worth) || 0,
            total_stock: parseInt(sw.total_stock) || 0
          });
        }
      });

      res.json(result);
    });
  });
});

// Today's profit (today sales - today expenses)
app.get("/today-profit", (req, res) => {
  db.query(
    "SELECT SUM(grand_total) as sales FROM bills WHERE DATE(bill_date)=CURDATE() AND cancelled=0",
    (err, s) => {
      if (err) return res.json({ sales:0, expense:0, profit:0 });
      db.query(
        "SELECT SUM(amount) as expense FROM expenses WHERE expense_date=CURDATE()",
        (err2, e) => {
          if (err2) return res.json({ sales:0, expense:0, profit:0 });
          const sales = parseFloat(s[0].sales) || 0;
          const expense = parseFloat(e[0].expense) || 0;
          res.json({ sales, expense, profit: sales - expense });
        }
      );
    }
  );
});


// Cash in hand today (cash bills)
app.get("/cash-today", (req, res) => {
  db.query(
    "SELECT SUM(grand_total) as total FROM bills WHERE DATE(bill_date)=CURDATE() AND cancelled=0 AND payment_mode='Cash'",
    (err, r) => {
      if (err) return res.json({ total: 0 });
      res.json({ total: parseFloat(r[0].total) || 0 });
    }
  );
});

// UPI received today
app.get("/upi-today", (req, res) => {
  db.query(
    "SELECT SUM(grand_total) as total FROM bills WHERE DATE(bill_date)=CURDATE() AND cancelled=0 AND payment_mode='UPI'",
    (err, r) => {
      if (err) return res.json({ total: 0 });
      res.json({ total: parseFloat(r[0].total) || 0 });
    }
  );
});

// Bill profit — sum of profit column from bill_items for a specific bill
app.get("/bill-profit/:id", (req, res) => {
  db.query(`
    SELECT
      SUM(bi.profit) as total_profit,
      SUM(bi.total_amount) as total_sales,
      SUM(bi.quantity * pb.purchase_price) as total_cost
    FROM bill_items bi
    LEFT JOIN product_batches pb ON bi.batch_id = pb.batch_id
    WHERE bi.bill_id = ?
  `, [req.params.id], (err, r) => {
    if (err) return res.json({ profit: 0, sales: 0, cost: 0 });
    const sales = parseFloat(r[0].total_sales) || 0;
    const profit = parseFloat(r[0].total_profit) || 0;
    const cost = parseFloat(r[0].total_cost) || 0;
    res.json({ profit, sales, cost });
  });
});


// ================= CUSTOMER UPDATES =================
// Get only regular customers
app.get("/regular-customers", (req, res) => {
  db.query("SELECT * FROM customers WHERE is_regular=1 ORDER BY name", (err, r) => {
    if (err) return res.json([]);
    res.json(r);
  });
});

// Mark customer as regular
app.post("/mark-regular/:id", (req, res) => {
  db.query("UPDATE customers SET is_regular=1 WHERE customer_id=?", [req.params.id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// Check duplicate customer name
app.get("/check-customer-name", (req, res) => {
  const { name } = req.query;
  if (!name) return res.json([]);
  db.query("SELECT * FROM customers WHERE name LIKE ? LIMIT 5", [`%${name}%`], (err, r) => {
    if (err) return res.json([]);
    res.json(r);
  });
});

// Get all credit customers with outstanding balance
app.get("/credit-customers", (req, res) => {
  db.query(`
    SELECT c.*, 
           COUNT(DISTINCT b.bill_id) as total_bills,
           SUM(CASE WHEN b.payment_mode='CREDIT' AND b.cancelled=0 THEN b.grand_total ELSE 0 END) as total_credit_billed
    FROM customers c
    LEFT JOIN bills b ON c.customer_id=b.customer_id
    WHERE c.balance > 0
    GROUP BY c.customer_id
    ORDER BY c.balance DESC
  `, (err, r) => {
    if (err) return res.json([]);
    res.json(r);
  });
});

// Customer statement (ledger)
app.get("/customer-statement/:id", (req, res) => {
  const { from_date, to_date } = req.query;
  db.query("SELECT * FROM customers WHERE customer_id=?", [req.params.id], (err, custRows) => {
    if (err || !custRows.length) return res.status(404).json({ error: "Not found" });
    const cust = custRows[0];

    let billWhere = "b.customer_id=? AND b.cancelled=0";
    const params = [req.params.id];
    if (from_date) { billWhere += " AND DATE(b.bill_date)>=?"; params.push(from_date); }
    if (to_date)   { billWhere += " AND DATE(b.bill_date)<=?"; params.push(to_date); }

    let cpWhere = "cp.customer_id=?";
    const cpParams = [req.params.id];
    if (from_date) { cpWhere += " AND DATE(cp.payment_date)>=?"; cpParams.push(from_date); }
    if (to_date)   { cpWhere += " AND DATE(cp.payment_date)<=?"; cpParams.push(to_date); }

    db.query(`
      SELECT b.bill_id, b.bill_date as txn_date, b.grand_total as debit_amt,
             0 as credit_amt, b.payment_mode, 'Sales' as txn_type, b.bill_id as ref_no
      FROM bills b WHERE ${billWhere}
      UNION ALL
      SELECT cp.payment_id, cp.payment_date, 0, cp.amount, 'Receipt', 'Payment', cp.payment_id
      FROM credit_payments cp WHERE ${cpWhere}
      ORDER BY txn_date ASC
    `, [...params, ...cpParams], (err2, txns) => {
      if (err2) return res.status(500).json({ error: err2.message });

      // All bills are shown in statement
      // Credit bills add to balance (customer owes us)
      // Cash/UPI bills show as sales but don't affect credit balance
      // Payments reduce balance
      let creditBalance = 0;
      let totalSales = 0;
      let totalCash = 0;
      let totalUPI = 0;
      let totalCredit = 0;
      let totalPaid = 0;

      const rows = txns.map(t => {
        const debit = parseFloat(t.debit_amt) || 0;
        const credit = parseFloat(t.credit_amt) || 0;
        if (t.txn_type === 'Sales') {
          totalSales += debit;
          if (t.payment_mode === 'CREDIT') { creditBalance += debit; totalCredit += debit; }
          else if (t.payment_mode === 'Cash') totalCash += debit;
          else if (t.payment_mode === 'UPI') totalUPI += debit;
        } else if (t.txn_type === 'Payment') {
          creditBalance -= credit;
          totalPaid += credit;
        }
        return { ...t, running_balance: creditBalance };
      });

      res.json({
        customer: cust,
        transactions: rows,
        closing_balance: parseFloat(cust.balance) || 0,
        total_sales: totalSales,
        total_cash: totalCash,
        total_upi: totalUPI,
        total_credit: totalCredit,
        total_paid: totalPaid
      });
    });
  });
});

// Update customer details
app.put("/customer/:id", (req, res) => {
  const { name, phone, address, gstin, is_regular } = req.body;
  db.query("UPDATE customers SET name=?, phone=?, address=?, gstin=?, is_regular=? WHERE customer_id=?",
    [name, phone||null, address||null, gstin||null, is_regular||0, req.params.id],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    }
  );
});

// Delete credit payment (for ledger alter)
app.delete("/credit-payment/:id", (req, res) => {
  db.query("SELECT * FROM credit_payments WHERE payment_id=?", [req.params.id], (err, rows) => {
    if (err || !rows.length) return res.status(404).json({ error: "Not found" });
    const p = rows[0];
    db.query("UPDATE customers SET balance = balance + ? WHERE customer_id=?", [p.amount, p.customer_id]);
    db.query("DELETE FROM credit_payments WHERE payment_id=?", [req.params.id], (err2) => {
      if (err2) return res.status(500).json({ error: err2.message });
      res.json({ success: true });
    });
  });
});

// ================= EXPENSE UPDATES =================
app.put("/expense/:id", (req, res) => {
  const { title, amount, expense_date, category, note } = req.body;
  db.query("UPDATE expenses SET title=?, amount=?, expense_date=?, category=?, note=? WHERE expense_id=?",
    [title, amount, expense_date, category||'General', note||null, req.params.id],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    }
  );
});

// Get expenses with date range
app.get("/expenses-range", (req, res) => {
  const { from_date, to_date, category } = req.query;
  let sql = "SELECT * FROM expenses WHERE 1=1";
  const params = [];
  if (from_date) { sql += " AND expense_date >= ?"; params.push(from_date); }
  if (to_date)   { sql += " AND expense_date <= ?"; params.push(to_date); }
  if (category)  { sql += " AND category=?"; params.push(category); }
  sql += " ORDER BY expense_date DESC";
  db.query(sql, params, (err, r) => {
    if (err) return res.json([]);
    res.json(r);
  });
});

// ================= PRODUCT UPDATES =================
// Get paginated products
app.get("/products-page", (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = 10;
  const offset = (page - 1) * limit;
  const { search, brand } = req.query;
  let where = "1=1";
  const params = [];
  if (search) { where += " AND (name LIKE ? OR product_code LIKE ?)"; params.push("%"+search+"%", "%"+search+"%"); }
  if (brand)  { where += " AND brand=?"; params.push(brand); }
  
  db.query(`SELECT COUNT(*) as total FROM products WHERE ${where}`, params, (err, countRows) => {
    const total = countRows ? countRows[0].total : 0;
    db.query(`SELECT * FROM products WHERE ${where} ORDER BY name LIMIT ? OFFSET ?`,
      [...params, limit, offset], (err2, r) => {
        if (err2) return res.json({ products: [], total: 0, page, pages: 0 });
        res.json({ products: r, total, page, pages: Math.ceil(total / limit) });
      }
    );
  });
});

// Update product details
app.put("/product/:id", (req, res) => {
  const { name, hsn_code, brand, product_code } = req.body;
  db.query("UPDATE products SET name=?, hsn_code=?, brand=?, product_code=? WHERE product_id=?",
    [name, hsn_code||null, brand||null, product_code||null, req.params.id],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    }
  );
});

// ================= RETRIEVE BILL UPDATES =================
// Search bills by phone number
app.get("/search-bills-by-phone", (req, res) => {
  const { phone } = req.query;
  if (!phone) return res.json([]);
  db.query(`
    SELECT b.bill_id, b.bill_date, b.payment_mode, b.cancelled,
           COALESCE(b.grand_total,0) as grand_total,
           COALESCE(c.name,'Walk-in') as customer_name,
           c.phone as customer_phone
    FROM bills b LEFT JOIN customers c ON b.customer_id=c.customer_id
    WHERE c.phone LIKE ? OR b.bill_id IN (
      SELECT bill_id FROM bills WHERE customer_id IN (
        SELECT customer_id FROM customers WHERE phone LIKE ?
      )
    )
    ORDER BY b.bill_date DESC LIMIT 30
  `, [`%${phone}%`, `%${phone}%`], (err, r) => {
    if (err) return res.json([]);
    res.json(r);
  });
});

// Outstanding credit bills
app.get("/outstanding-credits", (req, res) => {
  db.query(`
    SELECT b.bill_id, b.bill_date, b.grand_total,
           COALESCE(c.name, 'Walk-in') as customer_name,
           c.phone, c.customer_id,
           COALESCE(c.balance, 0) as outstanding
    FROM bills b
    LEFT JOIN customers c ON b.customer_id=c.customer_id
    WHERE b.payment_mode='CREDIT' AND b.cancelled=0
    ORDER BY b.bill_date DESC
  `, (err, r) => {
    if (err) return res.json([]);
    res.json(r);
  });
});



// Update supplier details
app.put("/supplier/:id", (req, res) => {
  const { name, phone, address } = req.body;
  if (!name) return res.status(400).json({ error: "Name required" });
  db.query("UPDATE suppliers SET name=?, phone=?, address=? WHERE supplier_id=?",
    [name, phone||null, address||null, req.params.id],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    }
  );
});

// Supplier statement
app.get("/supplier-statement/:id", (req, res) => {
  const { from_date, to_date } = req.query;
  db.query("SELECT * FROM suppliers WHERE supplier_id=?", [req.params.id], (err, suppRows) => {
    if (err || !suppRows.length) return res.status(404).json({ error: "Not found" });
    const supp = suppRows[0];

    let pbWhere = "pb.supplier_id=?";
    const params = [req.params.id];
    if (from_date) { pbWhere += " AND DATE(pb.bill_date)>=?"; params.push(from_date); }
    if (to_date)   { pbWhere += " AND DATE(pb.bill_date)<=?"; params.push(to_date); }

    // Get purchase bills (money we owe / spent)
    db.query(`
      SELECT pb.pb_id, pb.bill_date as txn_date, pb.total_amount as debit_amt,
             0 as credit_amt, 'Purchase' as txn_type, pb.payment_mode, pb.note
      FROM purchase_bills pb WHERE ${pbWhere}
    `, params, (err2, purchases) => {
      if (err2) return res.status(500).json({ error: err2.message });

      let spWhere = "sp.supplier_id=?";
      const params2 = [req.params.id];
      if (from_date) { spWhere += " AND DATE(sp.payment_date)>=?"; params2.push(from_date); }
      if (to_date)   { spWhere += " AND DATE(sp.payment_date)<=?"; params2.push(to_date); }

      // Get payments made to supplier
      db.query(`
        SELECT sp.sp_id, sp.payment_date as txn_date, 0 as debit_amt,
               sp.amount as credit_amt, 'Payment' as txn_type, '' as payment_mode, sp.note
        FROM supplier_payments sp WHERE ${spWhere}
      `, params2, (err3, payments) => {
        if (err3) return res.status(500).json({ error: err3.message });

        // Merge and sort by date
        const all = [...purchases, ...payments].sort((a, b) => new Date(a.txn_date) - new Date(b.txn_date));

        // Calculate running balance
        let balance = 0;
        const rows = all.map(t => {
          const debit = parseFloat(t.debit_amt) || 0;
          const credit = parseFloat(t.credit_amt) || 0;
          balance += debit - credit;
          return { ...t, running_balance: balance };
        });

        res.json({
          supplier: supp,
          transactions: rows,
          closing_balance: parseFloat(supp.balance) || 0
        });
      });
    });
  });
});

// ================= SERVER =================
app.listen(3000, () => console.log("Running on port 3000"));