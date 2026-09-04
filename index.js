const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");
const path = require("path");

const app = express();
app.use(express.json());
app.use(cors());

// Serve frontend HTML files from the frontend folder
app.use(express.static(path.join(__dirname, "frontend")));

// Root route - serve index.html
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "frontend", "index.html"));
});

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

app.get("/product-by-code/:code", (req, res) => {
  db.query(
    "SELECT * FROM products WHERE product_code=?",
    [req.params.code],
    (err, r) => {
      if (err || !r.length) return res.json(null);
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
  const pid = req.params.id;
  db.query(
    "UPDATE bill_items SET batch_id=NULL WHERE batch_id IN (SELECT batch_id FROM product_batches WHERE product_id=?)",
    [pid], (err1) => {
      if (err1) return res.status(500).json({ error: "Step1: " + err1.message });
      db.query("DELETE FROM product_batches WHERE product_id=?", [pid], (err2) => {
        if (err2) return res.status(500).json({ error: "Step2: " + err2.message });
        db.query("DELETE FROM products WHERE product_id=?", [pid], (err3) => {
          if (err3) return res.status(500).json({ error: "Step3: " + err3.message });
          res.json({ success: true });
        });
      });
    }
  );
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

  db.beginTransaction((err) => {
    if (err) return res.status(500).json({ error: err.message });

    db.query("SELECT * FROM financial_years WHERE is_active=1 LIMIT 1", (err, fyRows) => {
      if (err) return db.rollback(() => res.status(500).json({ error: err.message }));
      const fy_id = fyRows && fyRows.length ? fyRows[0].fy_id : null;

      const processBilling = (cust_id) => {
        const grand_total = items.reduce((s, i) => s + (parseFloat(i.total_amount) || 0), 0);

        db.query(
          "INSERT INTO bills (bill_date, payment_mode, customer_id, fy_id, grand_total, cancelled) VALUES (?,?,?,?,?,0)",
          [finalDate, payment_mode, cust_id || null, fy_id, grand_total],
          (err, result) => {
            if (err) return db.rollback(() => res.status(500).json({ error: err.message }));
            const bill_id = result.insertId;
            let processed = 0;

            items.forEach(item => {
              const { batch_id, quantity, rate, total_amount } = item;
              db.query(
                "SELECT pb.*, p.hsn_code, p.name as product_name FROM product_batches pb JOIN products p ON pb.product_id=p.product_id WHERE pb.batch_id=?",
                [batch_id],
                (err, r) => {
                  if (err || !r.length) return db.rollback(() => res.status(400).json({ error: "Batch not found" }));
                  
                  const b = r[0];
                  if (b.remaining_quantity < quantity) {
                    return db.rollback(() => res.status(400).json({ error: `Insufficient stock for ${b.product_name}` }));
                  }

                  const finalRate = parseFloat(rate) || parseFloat(b.mrp);
                  const finalTotal = parseFloat(total_amount) || finalRate * quantity;
                  const profit = (finalRate - parseFloat(b.purchase_price)) * quantity;

                  db.query(
                    "INSERT INTO bill_items (bill_id, batch_id, product_id, quantity, selling_price, total_amount, profit, hsn_code, gst_percent, cgst, sgst) VALUES (?,?,?,?,?,?,?,?,0,0,0)",
                    [bill_id, batch_id, b.product_id, quantity, finalRate, finalTotal, profit, b.hsn_code || ""],
                    (err) => {
                      if (err) return db.rollback(() => res.status(500).json({ error: err.message }));

                      const newQty = b.remaining_quantity - quantity;
                      const updateBatchSql = newQty <= 0
                        ? "DELETE FROM product_batches WHERE batch_id=?"
                        : "UPDATE product_batches SET remaining_quantity=? WHERE batch_id=?";
                      const updateParams = newQty <= 0 ? [batch_id] : [newQty, batch_id];

                      db.query(updateBatchSql, updateParams, (err) => {
                        if (err) return db.rollback(() => res.status(500).json({ error: err.message }));

                        processed++;
                        if (processed === items.length) {
                          if (payment_mode === "CREDIT" && cust_id) {
                            db.query("UPDATE customers SET balance = balance + ? WHERE customer_id=?", [grand_total, cust_id]);
                            db.query("INSERT INTO transactions (customer_id, txn_type, amount, txn_date) VALUES (?,'CREDIT',?,NOW())", [cust_id, grand_total]);
                          }

                          db.commit((err) => {
                            if (err) return db.rollback(() => res.status(500).json({ error: err.message }));
                            res.json({ bill_id, total: grand_total });
                          });
                        }
                      });
                    }
                  );
                }
              );
            });
          }
        );
      };

      if (!customer_id && walkin_name) {
        db.query(
          "INSERT INTO customers (name, phone, balance) VALUES (?,?,0)",
          [walkin_name, walkin_phone || null],
          (err, r) => {
            if (err) return db.rollback(() => res.status(500).json({ error: err.message }));
            processBilling(r.insertId);
          }
        );
      } else {
        processBilling(customer_id);
      }
    });
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
             COALESCE(p.name, 'Product') as product_name,
             COALESCE(p.product_code, '') as product_code
      FROM bill_items bi
      LEFT JOIN products p ON bi.product_id = p.product_id
      WHERE bi.bill_id=?
    `, [req.params.id], (err2, items) => {
      if (err2) return res.status(500).json({ error: err2.message });
      res.json({
        bill_id: bill.bill_id,
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
          product_id: i.product_id,
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
  db.beginTransaction((err) => {
    if (err) return res.status(500).json({ error: err.message });

    db.query("SELECT * FROM bills WHERE bill_id=?", [bill_id], (err, bills) => {
      if (err || !bills.length) return db.rollback(() => res.status(404).json({ error: "Bill not found" }));
      if (bills[0].cancelled) return db.rollback(() => res.status(400).json({ error: "Already cancelled" }));
      const bill = bills[0];

      db.query("SELECT * FROM bill_items WHERE bill_id=?", [bill_id], (err2, items) => {
        if (err2) return db.rollback(() => res.status(500).json({ error: err2.message }));

        let done = 0;
        const finishCancel = () => {
          if (bill.payment_mode === "CREDIT" && bill.customer_id) {
            db.query("UPDATE customers SET balance = balance - ? WHERE customer_id=?", [bill.grand_total, bill.customer_id]);
            db.query("INSERT INTO transactions (customer_id, txn_type, amount, txn_date) VALUES (?,'DEBIT',?,NOW())", [bill.customer_id, bill.grand_total]);
          }
          db.query("UPDATE bills SET cancelled=1, cancelled_at=NOW() WHERE bill_id=?", [bill_id], (err3) => {
            if (err3) return db.rollback(() => res.status(500).json({ error: err3.message }));
            db.commit((err) => {
              if (err) return db.rollback(() => res.status(500).json({ error: err.message }));
              res.json({ success: true });
            });
          });
        };

        if (!items.length) return finishCancel();

        items.forEach(item => {
          db.query("SELECT * FROM product_batches WHERE batch_id=?", [item.batch_id], (err3, batches) => {
            if (batches && batches.length) {
              db.query("UPDATE product_batches SET remaining_quantity = remaining_quantity + ? WHERE batch_id=?", [item.quantity, item.batch_id], () => {
                done++;
                if (done === items.length) finishCancel();
              });
            } else {
              db.query(
                "INSERT INTO product_batches (product_id, purchase_price, quantity, remaining_quantity, mrp, gst_percent, purchase_date) VALUES (?,0,?,?,?,0,CURDATE())",
                [item.product_id, item.quantity, item.quantity, item.selling_price],
                () => {
                  done++;
                  if (done === items.length) finishCancel();
                }
              );
            }
          });
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
        (err) => {
          if (err) return res.status(500).json({ error: err.message });
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

app.post("/supplier-payment", (req, res) => {
  const { supplier_id, pb_id, amount, payment_date, note } = req.body;
  if (!supplier_id || !amount) return res.status(400).json({ error: "supplier_id and amount required" });
  db.query(
    "INSERT INTO supplier_payments (supplier_id, pb_id, amount, payment_date, note) VALUES (?,?,?,?,?)",
    [supplier_id, pb_id || null, amount, payment_date || new Date().toISOString().split("T")[0], note || null],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      db.query("UPDATE suppliers SET balance = balance - ? WHERE supplier_id=?", [amount, supplier_id]);
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

  db.beginTransaction((err) => {
    if (err) return res.status(500).json({ error: err.message });

    db.query(
      "INSERT INTO purchase_bills (supplier_id, bill_date, payment_mode, total_amount, paid_amount, balance, note) VALUES (?,?,?,?,?,?,?)",
      [supplier_id || null, finalDate, payment_mode, total_amount, paid_amount, balance, note || null],
      (err, result) => {
        if (err) return db.rollback(() => res.status(500).json({ error: err.message }));
        const pb_id = result.insertId;
        let processed = 0;

        if (payment_mode === "CREDIT" && supplier_id && balance > 0) {
          db.query("UPDATE suppliers SET balance = balance + ? WHERE supplier_id=?", [balance, supplier_id]);
        }

        items.forEach(item => {
          const { product_id, quantity, purchase_price, selling_price, min_stock } = item;

          db.query(
            "INSERT INTO product_batches (product_id, purchase_price, quantity, remaining_quantity, mrp, gst_percent, purchase_date, min_stock) VALUES (?,?,?,?,?,0,?,?)",
            [product_id, purchase_price, quantity, quantity, selling_price, finalDate, min_stock || 5],
            (err2, batchResult) => {
              if (err2) return db.rollback(() => res.status(500).json({ error: err2.message }));
              const batch_id = batchResult.insertId;

              db.query(
                "INSERT INTO purchase_bill_items (pb_id, product_id, batch_id, quantity, purchase_price, selling_price, min_stock) VALUES (?,?,?,?,?,?,?)",
                [pb_id, product_id, batch_id, quantity, purchase_price, selling_price, min_stock || 5],
                (err3) => {
                  if (err3) return db.rollback(() => res.status(500).json({ error: err3.message }));
                  processed++;
                  if (processed === items.length) {
                    db.commit((err) => {
                      if (err) return db.rollback(() => res.status(500).json({ error: err.message }));
                      res.json({ success: true, pb_id, total_amount, paid_amount, balance });
                    });
                  }
                }
              );
            }
          );
        });
      }
    );
  });
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
          gross_profit: grossProfit,
          expense: expAmt,
          net_profit: grossProfit - expAmt
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
        gross_profit,
        net_profit: gross_profit - expense,
        profit: gross_profit - expense
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
    LEFT JOIN products p ON bi.product_id=p.product_id
    JOIN bills b ON bi.bill_id=b.bill_id
    WHERE p.name IS NOT NULL AND b.cancelled=0
    GROUP BY p.product_id, p.name ORDER BY qty DESC LIMIT 5
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
  const { customer_id, items, note } = req.body;
  if (!items || !items.length) return res.status(400).json({ error: "No items provided" });

  const total_amount = items.reduce((s, i) => s + (parseFloat(i.rate) * parseInt(i.quantity)), 0);
  const quot_date = new Date().toISOString().split("T")[0];

  db.query(
    "INSERT INTO quotations (customer_id, quot_date, total_amount, note) VALUES (?,?,?,?)",
    [customer_id || null, quot_date, total_amount, note || null],
    (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      const quot_id = result.insertId;
      let processed = 0;

      items.forEach(item => {
        const { product_id, quantity, rate } = item;
        db.query(
          "INSERT INTO quotation_items (quot_id, product_id, quantity, rate, total_amount) VALUES (?,?,?,?,?)",
          [quot_id, product_id, quantity, rate, rate * quantity],
          (err2) => {
            if (err2) return res.status(500).json({ error: err2.message });
            processed++;
            if (processed === items.length) {
              res.json({ success: true, quot_id, total_amount });
            }
          }
        );
      });
    }
  );
});

app.get("/quotations", (req, res) => {
  db.query(`
    SELECT q.*, COALESCE(c.name, 'Walk-in') as customer_name 
    FROM quotations q 
    LEFT JOIN customers c ON q.customer_id=c.customer_id 
    ORDER BY q.quot_date DESC
  `, (err, r) => {
    if (err) return res.json([]);
    res.json(r);
  });
});

// Server listener
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});