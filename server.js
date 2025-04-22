const express = require("express");
const app = express();
const cors = require("cors");
const mysql = require("mysql2");
const { google } = require("googleapis");
const validator = require("validator"); // 引入 validator 函式庫用於驗證

app.use(cors());
app.use(express.json());

// MySQL 連接設定
// 建議將這些資訊儲存在環境變數中以提高安全性
const pool = mysql.createPool({
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "1234",
    database: process.env.DB_NAME || "marry",
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// 測試資料庫連接
pool.getConnection((err, connection) => {
    if (err) {
        console.error("資料庫連接失敗:", err);
        // 您可以選擇在這裡終止應用程式或採取其他錯誤處理措施
    } else {
        console.log("成功連接到資料庫");
        connection.release(); // 釋放連接
    }
});


// Google Sheets API 認證設定
// 建議將 keyFile 路徑或內容儲存在環境變數中以提高安全性
const keyFile = process.env.GOOGLE_SHEETS_KEY_FILE || "C:/Users/ch-user/OneDrive/桌面/ya/marry-457507-eb5520c29577.json"; // 替換為您的服務帳戶 JSON 檔案路徑
const scopes = ["https://www.googleapis.com/auth/spreadsheets"]; // 將權限範圍改為讀寫，以便將來可能的需求

let authClient;
let sheets;

// 驗證 Google Sheets API 認證並初始化 sheets 客戶端
const initializeGoogleSheets = async () => {
    try {
        authClient = await new google.auth.GoogleAuth({
            keyFile: keyFile,
            scopes: scopes,
        }).getClient();
        sheets = google.sheets({ version: "v4", auth: authClient });
        console.log("Google Sheets API 客戶端初始化成功");
    } catch (err) {
        console.error("Google Sheets API 認證失敗:", err);
        // 您可以選擇在這裡處理初始化失敗的情況
    }
};

initializeGoogleSheets(); // 啟動時初始化 Google Sheets 客戶端


// 查詢所有客戶資料
app.get("/customers", (req, res) => {
    pool.query("SELECT * FROM customers", (err, results) => {
        if (err) {
            console.error("抓取客戶資料錯誤:", err);
            return res.status(500).json({ message: "伺服器錯誤，無法獲取客戶資料" });
        }
        res.json(results);
    });
});

// 新增客戶資料
app.post("/customers", (req, res) => {
    const {
        groom_name,
        bride_name,
        email,
        phone,
        wedding_date,
        form_link
    } = req.body;

    // 後端基本輸入驗證
    if (!groom_name || !bride_name || !email || !phone || !wedding_date || !form_link) {
        return res.status(400).json({ message: "所有欄位都是必填項" });
    }

    if (!validator.isEmail(email)) {
        return res.status(400).json({ message: "請輸入有效的電子郵件地址" });
    }

    // 簡單的 URL 格式驗證
    if (!validator.isURL(form_link, { require_protocol: true })) {
        return res.status(400).json({ message: "請輸入有效的 Google 試算表連結 (包含 http:// 或 https://)" });
    }


    // 您可以針對 phone 加入更多驗證，例如格式或長度


    const query = `
        INSERT INTO customers (groom_name, bride_name, email, phone, wedding_date, google_sheet_link)
        VALUES (?, ?, ?, ?, ?, ?)
    `;

    pool.query(query, [groom_name, bride_name, email, phone, wedding_date, form_link], (err, results) => {
        if (err) {
            console.error("新增客戶錯誤：", err);
            // 檢查是否是重複的電子郵件或連結等唯一約束錯誤
            if (err.code === 'ER_DUP_ENTRY') {
                // 您可能需要根據 err.sqlMessage 來判斷是哪個唯一約束觸發了錯誤
                if (err.sqlMessage.includes('email')) {
                    return res.status(409).json({ message: "此電子郵件已被使用" });
                }
                if (err.sqlMessage.includes('google_sheet_link')) {
                    return res.status(409).json({ message: "此 Google Sheet 連結已被使用" });
                }
                return res.status(409).json({ message: "客戶資料已存在 (重複的電子郵件或 Google Sheet 連結)" });

            }
            return res.status(500).json({ message: "新增失敗，請稍後再試" });
        }
        // 返回新增的客戶資料，前端可以直接更新列表
        // 注意：這裡返回的 newCustomer 物件欄位名稱需要與前端 App.js 中 customers 狀態的欄位名稱一致
        const newCustomer = {
            id: results.insertId,
            groom_name,
            bride_name,
            email,
            phone,
            wedding_date,
            google_sheet_link: form_link // 注意這裡欄位名稱對應
        };
        res.status(201).json({ message: "新增成功", customer: newCustomer });
    });
});


// 查詢單個客戶的資料
// 假設客戶資料表中包含 wedding_time 和 wedding_location 欄位
app.get("/customers/:id", (req, res) => {
    const { id } = req.params;
    // 簡單驗證 id 是否為數字
    if (!validator.isInt(id)) {
        return res.status(400).json({ message: "無效的客戶 ID" });
    }

    pool.query("SELECT id, groom_name, bride_name, email, phone, wedding_date, wedding_time, wedding_location, google_sheet_link FROM customers WHERE id = ?", [id], (err, results) => {
        if (err) {
            console.error("抓取單個客戶資料錯誤:", err);
            return res.status(500).json({ message: "伺服器錯誤，無法獲取客戶資料" });
        }
        if (results.length === 0) {
            return res.status(404).json({ message: "找不到客戶資料" });
        }
        res.json(results[0]);
    });
});

// 查詢單個客戶的賓客資料
app.get("/customers/:id/sheet-data", (req, res) => {
    const { id } = req.params;
    // 簡單驗證 id 是否為數字
    if (!validator.isInt(id)) {
        return res.status(400).json({ message: "無效的客戶 ID" });
    }

    pool.query(
        "SELECT id, guest_name, email, is_sent, relationshipWithGroom, relationshipWithBride, relationshipWithCouple, guestDescription, sharedMemories, message FROM guests WHERE customer_id = ?",
        [id],
        (err, results) => {
            if (err) {
                console.error("抓取賓客資料錯誤:", err); // 記錄伺服器端的錯誤以便除錯
                return res.status(500).json({ message: "伺服器錯誤，無法獲取賓客資料" });
            }

            // 成功獲取資料，返回賓客資料陣列 (即使為空陣列)
            res.json(results);
        }
    );
});

// 從 Google Sheet 同步賓客資料到資料庫
app.post("/sync-sheet-data/:id", async (req, res) => {
    try {
        const { id } = req.params;
        // 簡單驗證 id 是否為數字
        if (!validator.isInt(id)) {
            return res.status(400).json({ message: "無效的客戶 ID" });
        }


        pool.query("SELECT google_sheet_link FROM customers WHERE id = ?", [id], async (err, results) => {
            if (err) {
                console.error("查詢客戶 Google Sheet 連結錯誤:", err);
                return res.status(500).json({ message: "伺服器錯誤，無法獲取客戶資訊" });
            }


            if (results.length === 0 || !results[0].google_sheet_link) {
                return res.status(404).json({ message: "該客戶尚無 Google Sheet 連結" });
            }

            const googleSheetLink = results[0].google_sheet_link;
            let sheetId;
            try {
                const match = googleSheetLink.match(/spreadsheets\/d\/(.*?)\//);
                if (!match || match.length < 2 || !match[1]) {
                    return res.status(400).json({ message: "無效的 Google Sheet 連結格式" });
                }
                sheetId = match[1];
            } catch (parseError) {
                console.error("解析 Google Sheet 連結錯誤:", parseError);
                return res.status(400).json({ message: "解析 Google Sheet 連結時發生錯誤" });
            }

            // 檢查 sheets 客戶端是否已初始化
            if (!sheets) {
                console.error("Google Sheets API 客戶端未初始化");
                return res.status(500).json({ message: "伺服器內部錯誤，Google Sheets API 無法使用" });
            }


            let sheetDataValues = [];
            try {
                // 讀取 Google Sheets 中各個欄位的資料 (假設從第二行開始是資料)
                // 讀取 B 到 I 列
                const range = "工作表1!B2:I";
                const response = await sheets.spreadsheets.values.get({
                    spreadsheetId: sheetId,
                    range: range,
                });
                sheetDataValues = response.data.values || [];

            } catch (googleSheetError) {
                console.error("從 Google Sheet 讀取資料失敗:", googleSheetError);
                // 更詳細的錯誤訊息，幫助前端理解問題
                return res.status(500).json({ message: `從 Google Sheet 讀取資料失敗: ${googleSheetError.message}` });
            }


            if (sheetDataValues.length > 0) {
                const inserted = [];
                const failedInsertions = [];
                const customerId = parseInt(id);

                for (const row of sheetDataValues) {
                    // 確保每一行都有足夠的欄位，避免 undefined 錯誤
                    // Google Sheet 欄位順序: 賓客姓名, 與新郎的關係, 與新娘的關係, 與新郎新娘的關係, 賓客簡短描述, 共同回憶簡述, 想說的話, 電子郵件地址
                    const guestName = row[0] || ""; // B 列
                    const relationshipWithGroom = row[1] || ""; // C 列
                    const relationshipWithBride = row[2] || ""; // D 列
                    const relationshipWithCouple = row[3] || ""; // E 列
                    const guestDescription = row[4] || ""; // F 列
                    const sharedMemories = row[5] || ""; // G 列
                    const message = row[6] || ""; // H 列
                    const email = row[7] || ""; // I 列


                    // 如果賓客姓名或電子郵件為空，則跳過此行
                    if (!guestName || !email) {
                        console.warn("跳過無效的賓客資料行 (姓名或 Email 為空):", row);
                        failedInsertions.push({ rowData: row, reason: "姓名或 Email 為空" });
                        continue;
                    }


                    await new Promise((resolve) => {
                        pool.query(
                            // 可以考慮增加其他條件或使用唯一ID來判斷是否已存在，避免單純依賴姓名和email的重複
                            "SELECT id FROM guests WHERE guest_name = ? AND email = ? AND customer_id = ?",
                            [guestName, email, customerId],
                            (err, existingResults) => {
                                if (err) {
                                    console.error("查詢現有賓客失敗:", err);
                                    failedInsertions.push({ guestName, email, reason: `查詢資料庫失敗: ${err.message}` });
                                    return resolve(); // 繼續處理下一筆資料
                                }

                                if (existingResults.length === 0) {
                                    pool.query(
                                        "INSERT INTO guests (guest_name, email, relationshipWithGroom, relationshipWithBride, relationshipWithCouple, guestDescription, sharedMemories, message, is_sent, customer_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                                        [
                                            guestName,
                                            email,
                                            relationshipWithGroom,
                                            relationshipWithBride,
                                            relationshipWithCouple,
                                            guestDescription,
                                            sharedMemories,
                                            message,
                                            0, // 新增時預設 is_sent 為 0
                                            customerId
                                        ],
                                        (err, insertResults) => {
                                            if (err) {
                                                console.error("插入賓客資料失敗:", err);
                                                // 檢查是否是重複的電子郵件或名稱等唯一約束錯誤
                                                if (err.code === 'ER_DUP_ENTRY') {
                                                    failedInsertions.push({ guestName, email, reason: "資料已存在 (重複)" });
                                                } else {
                                                    failedInsertions.push({ guestName, email, reason: `插入資料庫失敗: ${err.message}` });
                                                }

                                            } else {
                                                // 成功插入，記錄插入的賓客資訊，包含新生成的 id
                                                inserted.push({
                                                    id: insertResults.insertId,
                                                    guest_name: guestName,
                                                    email: email,
                                                    is_sent: 0,
                                                    relationshipWithGroom,
                                                    relationshipWithBride,
                                                    relationshipWithCouple,
                                                    guestDescription,
                                                    sharedMemories,
                                                    message
                                                });
                                            }
                                            resolve(); // 繼續處理下一筆資料
                                        }
                                    );
                                } else {
                                    console.log(`賓客資料已存在，跳過插入或更新: ${guestName} (${email})`);
                                    // **您可以在這裡添加更新現有賓客資料的邏輯**
                                    // 例如：UPDATE guests SET relationshipWithGroom = ?, ... WHERE id = ?
                                    resolve(); // 繼續處理下一筆資料
                                }
                            }
                        );
                    });
                }
                // 檢查是否有插入失敗的項目並回傳相應訊息
                if (failedInsertions.length > 0) {
                    return res.status(200).json({
                        message: `成功同步 ${inserted.length} 筆資料，但有 ${failedInsertions.length} 筆資料插入失敗`,
                        insertedCount: inserted.length,
                        failedInsertions: failedInsertions.map(f => ({ ...f, rowData: undefined })) // 不回傳原始行資料
                    });
                } else {
                    return res.status(200).json({ message: `成功同步 ${inserted.length} 筆資料`, insertedCount: inserted.length });
                }

            } else {
                res.status(404).json({ message: "Google Sheet 中沒有可同步的資料 (從 B2:I)" });
            }
        });
    } catch (error) {
        console.error("同步 Google Sheets 資料時發生未預期的錯誤:", error);
        res.status(500).json({ message: "伺服器內部錯誤" });
    }
});

// 更新賓客的寄送狀態
app.post('/update-status', (req, res) => {
    const { guest_id, status } = req.body;

    // 簡單驗證輸入
    if (guest_id === undefined || status === undefined) {
        return res.status(400).json({ message: "缺少 guest_id 或 status 參數" });
    }
    // 驗證 guest_id 是否為數字，status 是否為 0 或 1
    if (!validator.isInt(String(guest_id)) || !validator.isIn(String(status), ['0', '1'])) {
        return res.status(400).json({ message: "無效的 guest_id 或 status 值" });
    }


    // 更新資料庫中的資料
    const query = 'UPDATE guests SET is_sent = ? WHERE id = ?';

    pool.query(query, [status, guest_id], (err, results) => { // 修正 db.query 為 pool.query
        if (err) {
            console.error('更新資料庫狀態錯誤:', err);
            return res.status(500).json({ message: '更新資料庫狀態失敗' });
        }
        // 檢查是否有資料被更新
        if (results.affectedRows === 0) {
            return res.status(404).json({ message: `找不到 ID 為 ${guest_id} 的賓客資料` });
        }
        res.status(200).json({ message: '資料庫狀態更新成功' });
    });
});


const port = process.env.PORT || 5000;
app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});