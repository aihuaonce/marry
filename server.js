const express = require("express");
const app = express();
const cors = require("cors");
const mysql = require("mysql2");
const { google } = require("googleapis");

app.use(cors());
app.use(express.json());

// MySQL 連接設定
const pool = mysql.createPool({
    host: "localhost",
    user: "root",
    password: "1234",
    database: "marry",
});

// Google Sheets API 認證設定
const auth = new google.auth.GoogleAuth({
    keyFile: "C:/Users/ch-user/OneDrive/桌面/ya/marry-457507-2a98b1bfe06e.json", // 替換為您的服務帳戶 JSON 檔案路徑
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
});

const sheets = google.sheets({ version: "v4", auth });

// 查詢所有客戶資料
app.get("/customers", (req, res) => {
    pool.query("SELECT * FROM customers", (err, results) => {
        if (err) {
            return res.status(500).send(err);
        }
        res.json(results);
    });
});

// 查詢單個客戶的資料
app.get("/customers/:id", (req, res) => {
    const { id } = req.params;
    pool.query("SELECT * FROM customers WHERE id = ?", [id], (err, results) => {
        if (err) {
            return res.status(500).send(err);
        }
        res.json(results[0]);
    });
});

app.get("/customers/:id/sheet-data", (req, res) => {
    const { id } = req.params;

    pool.query(
        "SELECT id, guest_name, email, is_sent, relationshipWithGroom, relationshipWithBride, relationshipWithCouple, guestDescription, sharedMemories, message FROM guests WHERE customer_id = ?",
        [id],
        (err, results) => {
            if (err) {
                console.error("抓取賓客資料錯誤:", err); // 記錄伺服器端的錯誤以便除錯
                return res.status(500).json({ message: "伺服器錯誤，無法獲取賓客資料" });
            }

            if (results.length === 0) {
                // 如果沒有找到賓客資料，返回一個空陣列 (HTTP 狀態碼 200)，
                // 前端會根據這個空陣列判斷並顯示「目前沒有賓客資料」。
                return res.json([]);
            }

            // 成功獲取資料，返回賓客資料陣列
            res.json(results);
        }
    );
});

app.post("/sync-sheet-data/:id", async (req, res) => {
    try {
        const { id } = req.params;

        pool.query("SELECT google_sheet_link FROM customers WHERE id = ?", [id], async (err, results) => {
            if (err) return res.status(500).send(err);

            if (results.length === 0) {
                return res.status(404).json({ message: "該客戶尚無賓客資料" });
            }

            const googleSheetLink = results[0].google_sheet_link;
            const sheetId = googleSheetLink.match(/spreadsheets\/d\/(.*?)\//)[1];

            // 讀取 Google Sheets 中各個欄位的資料
            const responseB = await sheets.spreadsheets.values.get({
                spreadsheetId: sheetId,
                range: "工作表1!B2:B", // 賓客姓名
            });

            const responseC = await sheets.spreadsheets.values.get({
                spreadsheetId: sheetId,
                range: "工作表1!C2:C", // 與新郎的關係
            });

            const responseD = await sheets.spreadsheets.values.get({
                spreadsheetId: sheetId,
                range: "工作表1!D2:D", // 與新娘的關係
            });

            const responseE = await sheets.spreadsheets.values.get({
                spreadsheetId: sheetId,
                range: "工作表1!E2:E", // 與新郎新娘的關係
            });

            const responseF = await sheets.spreadsheets.values.get({
                spreadsheetId: sheetId,
                range: "工作表1!F2:F", // 賓客簡短描述
            });

            const responseG = await sheets.spreadsheets.values.get({
                spreadsheetId: sheetId,
                range: "工作表1!G2:G", // 共同回憶簡述
            });

            const responseH = await sheets.spreadsheets.values.get({
                spreadsheetId: sheetId,
                range: "工作表1!H2:H", // 想說的話
            });

            const responseI = await sheets.spreadsheets.values.get({
                spreadsheetId: sheetId,
                range: "工作表1!I2:I", // 是否寄送
            });

            const rowsB = responseB.data.values || [];
            const rowsC = responseC.data.values || [];
            const rowsD = responseD.data.values || [];
            const rowsE = responseE.data.values || [];
            const rowsF = responseF.data.values || [];
            const rowsG = responseG.data.values || [];
            const rowsH = responseH.data.values || [];
            const rowsI = responseI.data.values || [];

            if (rowsB.length && rowsI.length) {
                const sheetData = rowsB.map((rowB, index) => ({
                    guestName: rowB[0],
                    relationshipWithGroom: rowsC[index] ? rowsC[index][0] : "",
                    relationshipWithBride: rowsD[index] ? rowsD[index][0] : "",
                    relationshipWithCouple: rowsE[index] ? rowsE[index][0] : "",
                    guestDescription: rowsF[index] ? rowsF[index][0] : "",
                    sharedMemories: rowsG[index] ? rowsG[index][0] : "",
                    message: rowsH[index] ? rowsH[index][0] : "",
                    email: rowsI[index] ? rowsI[index][0] : "",
                    isSent: 0,
                    customerId: parseInt(id),
                }));

                const inserted = [];

                for (const guest of sheetData) {
                    await new Promise((resolve, reject) => {
                        pool.query(
                            "SELECT * FROM guests WHERE guest_name = ? AND email = ? AND customer_id = ?",
                            [guest.guestName, guest.email, guest.customerId],
                            (err, existingResults) => {
                                if (err) {
                                    console.error("查詢失敗:", err);
                                    return reject(err);
                                }

                                if (existingResults.length === 0) {
                                    pool.query(
                                        "INSERT INTO guests (guest_name, email, relationshipWithGroom, relationshipWithBride, relationshipWithCouple, guestDescription, sharedMemories, message, is_sent, customer_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                                        [
                                            guest.guestName,
                                            guest.email,
                                            guest.relationshipWithGroom,
                                            guest.relationshipWithBride,
                                            guest.relationshipWithCouple,
                                            guest.guestDescription,
                                            guest.sharedMemories,
                                            guest.message,
                                            guest.isSent,
                                            guest.customerId
                                        ],
                                        (err) => {
                                            if (err) {
                                                console.error("插入資料失敗:", err);
                                            } else {
                                                inserted.push(guest);
                                            }
                                            resolve();
                                        }
                                    );
                                } else {
                                    console.log(`已存在: ${guest.guestName} (${guest.email})`);
                                    resolve();
                                }
                            }
                        );
                    });
                }
                res.json({ inserted, message: `成功同步 ${inserted.length} 筆資料` });
            } else {
                res.status(404).json({ message: "Google Sheet 中沒有資料" });
            }
        });
    } catch (error) {
        console.error("抓取 Google Sheets 資料失敗:", error);
        res.status(500).json({ message: "伺服器錯誤" });
    }
});

// 設置 HTTP POST 請求路由
app.post('/update-status', (req, res) => {
    const { guest_id, status } = req.body;

    // 更新資料庫中的資料
    const query = 'UPDATE guests SET is_sent = ? WHERE id = ?';

    db.query(query, [status, guest_id], (err, results) => {
        if (err) {
            console.error('Error updating database:', err);
            return res.status(500).send('Error updating database');
        }
        res.status(200).send('Database updated successfully');
    });
});



app.listen(5000, () => {
    console.log("Server is running on http://localhost:5000");
});
