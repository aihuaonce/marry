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

// 新增客戶資料 (修正日期時間處理，新增地點欄位接收，加強錯誤日誌)
app.post("/customers", (req, res) => {
    const {
        groom_name,
        bride_name,
        email,
        phone,
        wedding_date: weddingDatetimeLocalString, // 將接收到的 datetime-local 字串重新命名
        wedding_location, // 新增接收地點欄位
        form_link
    } = req.body;

    // 後端基本輸入驗證 (地點可選填，所以不列入必填檢查)
    if (!groom_name || !bride_name || !email || !phone || !weddingDatetimeLocalString || !form_link) {
        return res.status(400).json({ message: "新郎姓名、新娘姓名、電子郵件、聯絡電話、婚禮日期和 Google Sheet 連結是必填項" });
    }

    if (!validator.isEmail(email)) {
        return res.status(400).json({ message: "請輸入有效的電子郵件地址" });
    }

    // 簡單的 URL 格式驗證
    if (!validator.isURL(form_link, { require_protocol: true })) {
        return res.status(400).json({ message: "請輸入有效的 Google 試算表連結 (包含 http:// 或 https://)" });
    }


    // 您可以針對 phone 加入更多驗證，例如格式或長度
    // 您也可以針對 wedding_location 加入驗證，例如長度


    let wedding_date = null;
    let wedding_time = null;

    // 使用 Date 物件更穩健地解析 datetime-local 字串
    if (weddingDatetimeLocalString) {
        try {
            const dateObj = new Date(weddingDatetimeLocalString);
            // 檢查日期解析是否成功且不是無效日期
            if (!isNaN(dateObj.getTime())) {
                const year = dateObj.getFullYear();
                const month = ('0' + (dateObj.getMonth() + 1)).slice(-2); // Months are 0-indexed
                const day = ('0' + dateObj.getDate()).slice(-2);
                wedding_date = `${year}-${month}-${day}`; // YYYY-MM-DD 格式

                const hours = ('0' + dateObj.getHours()).slice(-2);
                const minutes = ('0' + dateObj.getMinutes()).slice(-2);
                const seconds = ('0' + dateObj.getSeconds()).slice(-2);
                wedding_time = `${hours}:${minutes}:${seconds}`; // HH:MM:SS 格式 (MySQL TIME)

            } else {
                console.warn("無法解析婚禮日期時間字串為有效日期:", weddingDatetimeLocalString);
                // 如果解析失敗，保持 date 和 time 為 null
                wedding_date = null;
                wedding_time = null;
            }
        } catch (parseError) {
            console.error("解析婚禮日期時間時發生錯誤:", parseError);
            // 如果解析過程中拋出錯誤，保持 date 和 time 為 null
            wedding_date = null;
            wedding_time = null;
        }
    }


    // 修改 INSERT 語句，包含 wedding_time 和 wedding_location 欄位
    const query = `
        INSERT INTO customers (groom_name, bride_name, email, phone, wedding_date, wedding_time, wedding_location, google_sheet_link)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    // 修改傳入 pool.query 的值陣列，包含分割後的日期和時間以及地點
    pool.query(query, [groom_name, bride_name, email, phone, wedding_date, wedding_time, wedding_location, form_link], (err, results) => {
        if (err) {
            console.error("新增客戶到資料庫錯誤：", err); // 更詳細的錯誤日誌
            // 檢查是否是重複的電子郵件或連結等唯一約束錯誤
            if (err.code === 'ER_DUP_ENTRY') {
                if (err.sqlMessage.includes('email')) {
                    return res.status(409).json({ message: "此電子郵件已被使用" });
                }
                if (err.sqlMessage.includes('google_sheet_link')) {
                    return res.status(409).json({ message: "此 Google Sheet 連結已被使用" });
                }
                return res.status(409).json({ message: "客戶資料已存在 (重複的電子郵件或 Google Sheet 連結)" });

            }
            // 檢查是否是日期、時間或地點格式錯誤
            if (err.code && err.code.startsWith('ER_')) { // 例如 ER_BAD_FIELD_VALUE, ER_TRUNCATED_WRONG_VALUE 等
                // 記錄完整的錯誤訊息，包括 SQL 和參數
                console.error("新增客戶 SQL 錯誤詳情:", {
                    code: err.code,
                    sqlMessage: err.sqlMessage,
                    sql: err.sql,
                    values: [groom_name, bride_name, email, phone, wedding_date, wedding_time, wedding_location, form_link]
                });
                return res.status(400).json({ message: `資料格式錯誤：請檢查日期、時間或地點格式是否正確 (${err.sqlMessage})` });
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
            wedding_date: wedding_date, // 返回分割後的日期
            wedding_time: wedding_time, // 返回分割後的時間
            wedding_location: wedding_location, // 返回地點
            google_sheet_link: form_link
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

    // 注意這裡查詢了 google_sheet_guest_id 欄位
    pool.query(
        "SELECT id, google_sheet_guest_id, guest_name, email, is_sent, relationshipWithGroom, relationshipWithBride, relationshipWithCouple, guestDescription, sharedMemories, message FROM guests WHERE customer_id = ?",
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

// 從 Google Sheet 同步賓客資料到資料庫 (使用 Google Sheet 賓客 ID 進行同步)
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
                // 讀取 A 到 I 列，A 列是唯一的賓客 ID
                const range = "工作表1!A2:I";
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
                const updated = [];
                const failedOperations = [];
                const customerId = parseInt(id);

                for (const row of sheetDataValues) {
                    // 確保每一行都有足夠的欄位
                    // 根據您提供的格式，從賓客編號到電子郵件地址共有 9 列 (A 到 I)
                    if (row.length < 9) {
                        console.warn("跳過無效的賓客資料行 (欄位不足):", row);
                        failedOperations.push({ rowData: row, reason: "欄位不足" });
                        continue;
                    }

                    // Google Sheet 欄位順序 (索引從 0 開始):
                    // A: 賓客編號 (0)
                    // B: 賓客姓名 (1)
                    // C: 與新郎的關係 (2)
                    // D: 與新娘的關係 (3)
                    // E: 與新郎新娘關係 (4)
                    // F: 賓客簡短描述 (5)
                    // G: 共同回憶簡述 (6)
                    // H: 想說的話 (7)
                    // I: 電子郵件地址 (8)

                    const googleSheetGuestId = row[0] ? String(row[0]) : ""; // A 列 - 唯一的賓客 ID，確保是字串
                    const guestName = row[1] || ""; // B 列
                    const relationshipWithGroom = row[2] || ""; // C 列
                    const relationshipWithBride = row[3] || ""; // D 列
                    const relationshipWithCouple = row[4] || ""; // E 列
                    const guestDescription = row[5] || ""; // F 列
                    const sharedMemories = row[6] || ""; // G 列
                    const message = row[7] || ""; // H 列
                    const email = row[8] || ""; // I 列


                    // 如果賓客 ID 或 Email 為空，則跳過此行 (ID 是唯一的識別鍵，Email 是必要欄位)
                    if (!googleSheetGuestId) {
                        console.warn("跳過無效的賓客資料行 (賓客 ID 為空):", row);
                        failedOperations.push({ rowData: row, reason: "賓客 ID 為空" });
                        continue;
                    }
                    if (!email) {
                        console.warn(`跳過賓客資料行 (賓客 ID: ${googleSheetGuestId}, Email 為空):`, row);
                        failedOperations.push({ googleSheetGuestId, guestName, operation: 'process', reason: "Email 為空，無法處理" });
                        continue;
                    }


                    await new Promise((resolve) => {
                        pool.query(
                            // **使用 google_sheet_guest_id 和 customer_id 來判斷是否存在**
                            "SELECT id FROM guests WHERE google_sheet_guest_id = ? AND customer_id = ?",
                            [googleSheetGuestId, customerId],
                            (err, existingResults) => {
                                if (err) {
                                    console.error("查詢現有賓客失敗:", err);
                                    failedOperations.push({ googleSheetGuestId, guestName, operation: 'query_existing', reason: `查詢資料庫失敗: ${err.message}` });
                                    return resolve(); // 繼續處理下一筆資料
                                }

                                if (existingResults.length === 0) {
                                    // 資料不存在 (根據 google_sheet_guest_id 和 customer_id 判斷)，執行 INSERT
                                    pool.query(
                                        "INSERT INTO guests (google_sheet_guest_id, guest_name, email, relationshipWithGroom, relationshipWithBride, relationshipWithCouple, guestDescription, sharedMemories, message, is_sent, customer_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                                        [
                                            googleSheetGuestId, // 插入 Google Sheet 賓客 ID
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
                                                // 檢查是否是唯一約束錯誤 (理論上不應該發生如果資料庫結構修改正確)
                                                if (err.code === 'ER_DUP_ENTRY') {
                                                    failedOperations.push({ googleSheetGuestId, guestName, operation: 'insert', reason: "資料已存在 (重複)" });
                                                } else {
                                                    failedOperations.push({ googleSheetGuestId, guestName, operation: 'insert', reason: `插入資料庫失敗: ${err.message}` });
                                                }
                                            } else {
                                                // 成功插入
                                                inserted.push({
                                                    id: insertResults.insertId,
                                                    google_sheet_guest_id: googleSheetGuestId,
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
                                } else if (existingResults.length === 1) {
                                    // 資料已存在且只有一筆匹配 (根據 google_sheet_guest_id 和 customer_id 判斷)，執行 UPDATE
                                    const existingGuestId = existingResults[0].id; // 獲取資料庫中該記錄的自增長 ID
                                    pool.query(
                                        `UPDATE guests SET
                                        guest_name = ?, -- 姓名可能也會更新
                                        email = ?, -- Email 可能會更新
                                        relationshipWithGroom = ?,
                                        relationshipWithBride = ?,
                                        relationshipWithCouple = ?,
                                        guestDescription = ?,
                                        sharedMemories = ?,
                                        message = ?
                                        WHERE id = ?`, // 使用資料庫的自增長 ID 進行更新
                                        [
                                            guestName, // 使用 Google Sheet 中的新姓名
                                            email, // 使用 Google Sheet 中的新 Email
                                            relationshipWithGroom,
                                            relationshipWithBride,
                                            relationshipWithCouple,
                                            guestDescription,
                                            sharedMemories,
                                            message,
                                            existingGuestId
                                        ],
                                        (err, updateResults) => {
                                            if (err) {
                                                console.error(`更新賓客資料失敗 (ID: ${existingGuestId}, Google Sheet ID: ${googleSheetGuestId}):`, err);
                                                failedOperations.push({ googleSheetGuestId, guestName, operation: 'update', reason: `更新資料庫失敗: ${err.message}` });
                                            } else {
                                                // 成功更新
                                                updated.push({
                                                    id: existingGuestId,
                                                    google_sheet_guest_id: googleSheetGuestId,
                                                    guest_name: guestName,
                                                    email: email,
                                                    // is_sent 狀態不應在這裡被 Google Sheet 的資料覆蓋
                                                    relationshipWithGroom,
                                                    relationshipWithBride,
                                                    relationshipWithCouple,
                                                    guestDescription,
                                                    sharedMemories,
                                                    message
                                                });
                                                console.log(`賓客資料已更新 (ID: ${existingGuestId}, Google Sheet ID: ${googleSheetGuestId}): ${guestName} (${email})`);
                                            }
                                            resolve(); // 繼續處理下一筆資料
                                        }
                                    );
                                } else {
                                    // 找到多筆匹配 (同一個客戶下，相同的 Google Sheet 賓客 ID 在資料庫中出現多次，這不應該發生如果唯一約束設定正確)
                                    console.error(`錯誤：在客戶 ${customerId} 下，Google Sheet 賓客 ID '${googleSheetGuestId}' 在資料庫中出現多筆`, existingResults);
                                    failedOperations.push({ googleSheetGuestId, guestName, operation: 'query_conflict', reason: `資料庫中存在多筆相同的 Google Sheet 賓客 ID` });
                                    resolve(); // 繼續處理下一筆資料
                                }
                            }
                        );
                    });
                }
                // 回傳同步結果摘要
                return res.status(200).json({
                    message: `同步完成：插入 ${inserted.length} 筆，更新 ${updated.length} 筆，失敗 ${failedOperations.length} 筆`,
                    insertedCount: inserted.length,
                    updatedCount: updated.length,
                    failedOperations: failedOperations.map(f => ({ ...f, rowData: undefined })) // 不回傳原始行資料
                });

            } else {
                res.status(404).json({ message: "Google Sheet 中沒有可同步的資料 (從 A2:I)" });
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